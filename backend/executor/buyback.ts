/**
 * AGI Holdings - Revenue Buyback
 * 
 * When revenue share comes in from funded agents:
 * - 50% stays in treasury
 * - 50% buys $AGI token (Uniswap)
 */

import { ethers } from 'ethers';
import { CONFIG } from '../shared/config';

// Uniswap V3 SwapRouter on Base
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const AGI_TOKEN = '0xA301f1d1960eD03B42CC0093324595f4b0b11ba3';
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Uniswap SwapRouter ABI (minimal)
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Initialize
const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
let wallet: ethers.Wallet;
let swapRouter: ethers.Contract;

export function initBuyback(privateKey: string): void {
  wallet = new ethers.Wallet(privateKey, provider);
  swapRouter = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);
  console.log('Buyback module initialized');
}

/**
 * Swap ETH to $AGI
 */
export async function swapETHtoAGI(amountETH: bigint): Promise<string | null> {
  console.log(`Swapping ${ethers.formatEther(amountETH)} ETH to $AGI...`);
  
  try {
    // Use exactInputSingle for ETH -> AGI via WETH
    // Path: ETH -> WETH -> AGI (0.3% fee pool)
    const params = {
      tokenIn: WETH,
      tokenOut: AGI_TOKEN,
      fee: 3000, // 0.3%
      recipient: wallet.address,
      amountIn: amountETH,
      amountOutMinimum: 0, // Accept any amount (add slippage protection in production)
      sqrtPriceLimitX96: 0,
    };
    
    const tx = await swapRouter.exactInputSingle(params, {
      value: amountETH,
      gasLimit: 300000,
    });
    
    console.log(`Swap TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Swap confirmed in block ${receipt.blockNumber}`);
    
    return tx.hash;
  } catch (e: any) {
    console.error(`Swap failed: ${e.message}`);
    return null;
  }
}

/**
 * Swap USDC to $AGI
 */
export async function swapUSDCtoAGI(amountUSDC: bigint): Promise<string | null> {
  console.log(`Swapping ${ethers.formatUnits(amountUSDC, 6)} USDC to $AGI...`);
  
  try {
    const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
    
    // Approve SwapRouter
    const approveTx = await usdc.approve(SWAP_ROUTER, amountUSDC);
    await approveTx.wait();
    console.log('USDC approved');
    
    // Multi-hop: USDC -> WETH -> AGI
    // Encode path: tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)
    const path = ethers.solidityPacked(
      ['address', 'uint24', 'address', 'uint24', 'address'],
      [USDC, 500, WETH, 3000, AGI_TOKEN] // USDC-WETH 0.05%, WETH-AGI 0.3%
    );
    
    const params = {
      path: path,
      recipient: wallet.address,
      amountIn: amountUSDC,
      amountOutMinimum: 0,
    };
    
    const tx = await swapRouter.exactInput(params, {
      gasLimit: 500000,
    });
    
    console.log(`Swap TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Swap confirmed in block ${receipt.blockNumber}`);
    
    return tx.hash;
  } catch (e: any) {
    console.error(`Swap failed: ${e.message}`);
    return null;
  }
}

/**
 * Process incoming revenue share
 * 50% stays, 50% buys $AGI
 */
export async function processRevenueShare(
  fromAgent: string,
  amount: bigint,
  token: 'ETH' | 'USDC'
): Promise<void> {
  console.log(`\n=== REVENUE SHARE RECEIVED ===`);
  console.log(`From: ${fromAgent}`);
  console.log(`Amount: ${token === 'ETH' ? ethers.formatEther(amount) : ethers.formatUnits(amount, 6)} ${token}`);
  
  const buybackAmount = amount / 2n;
  console.log(`Buyback amount (50%): ${token === 'ETH' ? ethers.formatEther(buybackAmount) : ethers.formatUnits(buybackAmount, 6)} ${token}`);
  
  // Execute buyback
  let txHash: string | null;
  if (token === 'ETH') {
    txHash = await swapETHtoAGI(buybackAmount);
  } else {
    txHash = await swapUSDCtoAGI(buybackAmount);
  }
  
  if (txHash) {
    console.log(`✅ Buyback complete: ${txHash}`);
  } else {
    console.log(`❌ Buyback failed`);
  }
  
  console.log(`=== END REVENUE PROCESSING ===\n`);
}
