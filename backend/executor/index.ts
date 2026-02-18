/**
 * AGI Holdings - Funding Executor
 * 
 * Handles the execution of approved funding:
 * - Sends USDC to approved agents
 * - Records funding in database
 * - Posts announcement to Twitter
 * - Updates portfolio tracking
 */

import { ethers } from 'ethers';
import { TwitterApi } from 'twitter-api-v2';
import { CONFIG, Application, EvaluationResult, FundedAgent } from '../shared/config';

// ERC20 ABI for USDC transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

// Wallet will be initialized with private key from environment
let wallet: ethers.Wallet;
let usdc: ethers.Contract;
let twitter: TwitterApi;

/**
 * Initialize executor with credentials
 */
export function initializeExecutor(
  treasuryPrivateKey: string,
  twitterCredentials?: {
    appKey: string;
    appSecret: string;
    accessToken: string;
    accessSecret: string;
  }
): void {
  wallet = new ethers.Wallet(treasuryPrivateKey, provider);
  usdc = new ethers.Contract(CONFIG.USDC_ADDRESS, ERC20_ABI, wallet);
  
  if (twitterCredentials) {
    twitter = new TwitterApi(twitterCredentials);
  }
  
  console.log('Executor initialized');
  console.log(`Treasury wallet: ${wallet.address}`);
}

// Uniswap V3 SwapRouter on Base
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH = '0x4200000000000000000000000000000000000006';

const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
];

/**
 * Swap ETH to USDC
 */
async function swapETHtoUSDC(amountETH: bigint): Promise<boolean> {
  console.log(`Swapping ${ethers.formatEther(amountETH)} ETH to USDC...`);
  
  try {
    const swapRouter = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);
    
    const params = {
      tokenIn: WETH,
      tokenOut: CONFIG.USDC_ADDRESS,
      fee: 500, // 0.05% pool
      recipient: wallet.address,
      amountIn: amountETH,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    };
    
    const tx = await swapRouter.exactInputSingle(params, {
      value: amountETH,
      gasLimit: 300000,
    });
    
    console.log(`Swap TX: ${tx.hash}`);
    await tx.wait();
    console.log('ETH → USDC swap complete');
    return true;
  } catch (e: any) {
    console.error(`Swap failed: ${e.message}`);
    return false;
  }
}

/**
 * Check if treasury has sufficient USDC balance, swap from ETH if needed
 */
async function ensureUSDCBalance(amount: number): Promise<boolean> {
  const decimals = await usdc.decimals();
  const balance = await usdc.balanceOf(wallet.address);
  const required = ethers.parseUnits(amount.toString(), decimals);
  
  console.log(`Treasury USDC balance: ${ethers.formatUnits(balance, decimals)}`);
  console.log(`Required for funding: ${amount}`);
  
  if (balance >= required) {
    return true;
  }
  
  // Not enough USDC, check ETH balance
  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`Treasury ETH balance: ${ethers.formatEther(ethBalance)}`);
  
  // Calculate how much ETH we need (add 10% buffer for slippage + gas)
  const ethPrice = await getETHPrice();
  const usdcNeeded = Number(ethers.formatUnits(required - balance, decimals));
  const ethNeeded = (usdcNeeded / ethPrice) * 1.1;
  const ethNeededWei = ethers.parseEther(ethNeeded.toFixed(6));
  
  console.log(`Need to swap ~${ethNeeded.toFixed(4)} ETH to get ${usdcNeeded} USDC`);
  
  if (ethBalance < ethNeededWei) {
    console.error('Insufficient ETH balance for swap');
    return false;
  }
  
  // Swap ETH to USDC
  const swapSuccess = await swapETHtoUSDC(ethNeededWei);
  return swapSuccess;
}

async function getETHPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await res.json();
    return data.ethereum?.usd || 2000;
  } catch {
    return 2000; // Fallback
  }
}

/**
 * Execute USDC transfer to funded agent
 */
async function sendFunding(
  recipientWallet: string,
  amount: number
): Promise<string> {
  console.log(`Sending $${amount} USDC to ${recipientWallet}...`);
  
  // Ensure we have enough USDC (swap from ETH if needed)
  if (!await ensureUSDCBalance(amount)) {
    throw new Error('Insufficient funds in treasury (not enough USDC or ETH)');
  }
  
  const decimals = await usdc.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  
  // Send transaction
  const tx = await usdc.transfer(recipientWallet, amountWei);
  console.log(`Transaction sent: ${tx.hash}`);
  
  // Wait for confirmation
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  
  return tx.hash;
}

/**
 * Post funding announcement to Twitter
 */
async function announceOnTwitter(
  agent: Application,
  result: EvaluationResult,
  txHash: string
): Promise<string | null> {
  if (!twitter) {
    console.log('Twitter not configured, skipping announcement');
    return null;
  }
  
  const tweetText = `Funded: ${agent.data.agent}

${result.reasoning}

Investment: $${result.fundingAmount}
Revenue share: ${result.revenueSharePercent}%

${agent.data.twitter}

TX: basescan.org/tx/${txHash}`;

  try {
    const tweet = await twitter.v2.tweet(tweetText);
    console.log(`Announcement posted: ${tweet.data.id}`);
    return tweet.data.id;
  } catch (e) {
    console.error('Failed to post announcement:', e);
    return null;
  }
}

/**
 * Save funded agent to database
 */
async function saveFundedAgent(
  app: Application,
  result: EvaluationResult,
  txHash: string
): Promise<FundedAgent> {
  const fundedAgent: FundedAgent = {
    id: app.txHash,
    wallet: app.data.wallet,
    name: app.data.agent,
    twitter: app.data.twitter,
    fundedAmount: result.fundingAmount!,
    fundedAt: Date.now(),
    revenueSharePercent: result.revenueSharePercent!,
    totalRevenuePaid: 0,
    status: 'active',
  };
  
  // TODO: Save to database (PostgreSQL, MongoDB, etc.)
  // For now, append to JSON file
  const fs = await import('fs/promises');
  const dbPath = './data/funded-agents.json';
  
  try {
    const existing = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
    existing.push(fundedAgent);
    await fs.writeFile(dbPath, JSON.stringify(existing, null, 2));
  } catch {
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify([fundedAgent], null, 2));
  }
  
  console.log(`Saved funded agent: ${fundedAgent.name}`);
  return fundedAgent;
}

/**
 * Execute full funding process
 */
export async function executeFunding(
  app: Application,
  result: EvaluationResult
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  console.log(`\n=== EXECUTING FUNDING ===`);
  console.log(`Agent: ${app.data.agent}`);
  console.log(`Amount: $${result.fundingAmount}`);
  console.log(`Recipient: ${app.data.wallet}`);
  
  try {
    // 1. Send USDC
    const txHash = await sendFunding(app.data.wallet, result.fundingAmount!);
    
    // 2. Save to database
    await saveFundedAgent(app, result, txHash);
    
    // 3. Announce on Twitter
    await announceOnTwitter(app, result, txHash);
    
    console.log(`=== FUNDING COMPLETE ===\n`);
    
    return { success: true, txHash };
  } catch (e: any) {
    console.error(`Funding failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Handle rejected application (optional Twitter notification)
 */
export async function handleRejection(
  app: Application,
  result: EvaluationResult
): Promise<void> {
  console.log(`Application rejected: ${app.data.agent}`);
  console.log(`Reason: ${result.reasoning}`);
  
  // We don't publicly announce rejections
  // But we could log them for analytics
  
  const fs = await import('fs/promises');
  const logPath = './data/rejections.json';
  
  const rejection = {
    applicationId: app.txHash,
    agent: app.data.agent,
    twitter: app.data.twitter,
    reason: result.reasoning,
    concerns: result.researchNotes.concerns,
    timestamp: Date.now(),
  };
  
  try {
    const existing = JSON.parse(await fs.readFile(logPath, 'utf-8'));
    existing.push(rejection);
    await fs.writeFile(logPath, JSON.stringify(existing, null, 2));
  } catch {
    await fs.mkdir('./data', { recursive: true });
    await fs.writeFile(logPath, JSON.stringify([rejection], null, 2));
  }
}

/**
 * Handle needs-info application (reach out on Twitter)
 */
export async function handleNeedsInfo(
  app: Application,
  result: EvaluationResult
): Promise<void> {
  console.log(`Application needs info: ${app.data.agent}`);
  console.log(`Questions: ${result.questions?.join(', ')}`);
  
  if (!twitter || !result.questions?.length) {
    return;
  }
  
  // Tweet at the applicant with questions
  const handle = app.data.twitter.startsWith('@') ? app.data.twitter : `@${app.data.twitter}`;
  const question = result.questions[0];
  
  const tweetText = `${handle} We're reviewing your funding application for ${app.data.agent}.

Question: ${question}

Reply here or DM us.`;

  try {
    await twitter.v2.tweet(tweetText);
    console.log('Question tweeted to applicant');
  } catch (e) {
    console.error('Failed to tweet question:', e);
  }
}

// Test execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Executor module loaded');
  console.log('To use: import and call initializeExecutor() with credentials');
}
