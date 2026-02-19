/**
 * AGI Holdings - Application Scanner
 * 
 * Monitors the treasury wallet for incoming applications.
 * Applications are transactions with:
 * - Value: 0.001 ETH (application fee)
 * - Data: Hex-encoded JSON application
 */

import { ethers } from 'ethers';
import { CONFIG, Application } from '../shared/config';
import { initBuyback, processRevenueShare } from '../executor/buyback';
import { notifyNewApplication } from '../shared/telegram.js';

const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

// Track funded agent wallets for revenue detection
const fundedAgentWallets = new Set<string>();

export function addFundedAgent(wallet: string): void {
  fundedAgentWallets.add(wallet.toLowerCase());
}

export function isFundedAgent(wallet: string): boolean {
  return fundedAgentWallets.has(wallet.toLowerCase());
}

import * as fs from 'fs/promises';
import * as path from 'path';

// Track processed transactions to avoid duplicates
const processedTxs = new Set<string>();
const PROCESSED_TXS_FILE = path.join(CONFIG.DATA_DIR, 'processed-txs.json');

// Load from persistent storage
async function loadProcessedTxs(): Promise<void> {
  try {
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    const data = await fs.readFile(PROCESSED_TXS_FILE, 'utf-8');
    const txs = JSON.parse(data);
    txs.forEach((tx: string) => processedTxs.add(tx));
    console.log(`Loaded ${processedTxs.size} processed transactions`);
  } catch {
    console.log('No existing processed transactions file, starting fresh');
  }
}

async function saveProcessedTx(txHash: string): Promise<void> {
  processedTxs.add(txHash);
  try {
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    await fs.writeFile(PROCESSED_TXS_FILE, JSON.stringify([...processedTxs], null, 2));
  } catch (e) {
    console.error('Failed to persist processed tx:', e);
  }
}

/**
 * Decode application data from transaction calldata
 */
function decodeApplication(hexData: string): Application['data'] | null {
  try {
    // Remove 0x prefix if present
    const cleanHex = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
    
    // Convert hex to string
    const jsonString = Buffer.from(cleanHex, 'hex').toString('utf8');
    
    // Parse JSON
    const data = JSON.parse(jsonString);
    
    // Validate required fields
    if (!data.agent || !data.wallet || !data.description || !data.revenue_model || !data.twitter) {
      console.log('Missing required fields in application');
      return null;
    }
    
    // Validate wallet address
    if (!ethers.isAddress(data.wallet)) {
      console.log('Invalid wallet address in application');
      return null;
    }
    
    return {
      agent: data.agent,
      wallet: data.wallet,
      description: data.description,
      revenue_model: data.revenue_model,
      twitter: data.twitter,
      github: data.github,
      website: data.website,
    };
  } catch (e) {
    console.log('Failed to decode application:', e);
    return null;
  }
}

/**
 * Check if transaction is a valid application
 */
function isValidApplication(tx: ethers.TransactionResponse): boolean {
  // Must be sent to treasury
  if (tx.to?.toLowerCase() !== CONFIG.TREASURY_ADDRESS.toLowerCase()) {
    return false;
  }
  
  // Must have the application fee (0.001 ETH = 1000000000000000 wei)
  const feeWei = ethers.parseEther(CONFIG.APPLICATION_FEE);
  if (tx.value < feeWei) {
    return false;
  }
  
  // Must have calldata
  if (!tx.data || tx.data === '0x' || tx.data.length < 10) {
    return false;
  }
  
  return true;
}

/**
 * Scan recent blocks for new applications
 */
async function scanForApplications(): Promise<Application[]> {
  const applications: Application[] = [];
  
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 100; // Last ~100 blocks (~3 minutes on Base)
    
    console.log(`Scanning blocks ${fromBlock} to ${currentBlock}...`);
    
    // Get all transactions to treasury
    // Note: In production, use a more efficient method (events, subgraph, etc.)
    const block = await provider.getBlock(currentBlock, true);
    
    if (!block || !block.prefetchedTransactions) {
      return applications;
    }
    
    for (const tx of block.prefetchedTransactions) {
      // Skip if already processed
      if (processedTxs.has(tx.hash)) {
        continue;
      }
      
      // Check if valid application
      if (!isValidApplication(tx)) {
        continue;
      }
      
      // Decode application data
      const appData = decodeApplication(tx.data);
      if (!appData) {
        continue;
      }
      
      const application: Application = {
        txHash: tx.hash,
        blockNumber: tx.blockNumber || currentBlock,
        timestamp: block.timestamp,
        applicantWallet: tx.from,
        data: appData,
      };
      
      applications.push(application);
      await saveProcessedTx(tx.hash);
      
      console.log(`New application found: ${appData.agent} from ${tx.from}`);
      
      // Send Telegram notification
      await notifyNewApplication({
        agent: appData.agent,
        twitter: appData.twitter,
        wallet: appData.wallet,
        website: appData.website,
        amount: 0, // Will be determined by evaluator
        txHash: tx.hash,
      });
    }
  } catch (e) {
    console.error('Error scanning for applications:', e);
  }
  
  return applications;
}

/**
 * Query subgraph for recent transfers to treasury
 */
async function scanViaSubgraph(): Promise<Application[]> {
  const applications: Application[] = [];
  
  const query = `{
    transfers(
      where: { to: "${CONFIG.TREASURY_ADDRESS.toLowerCase()}", isIncoming: true }
      orderBy: timestamp
      orderDirection: desc
      first: 50
    ) {
      id
      txHash
      from
      amount
      token
      timestamp
    }
  }`;
  
  try {
    const res = await fetch(CONFIG.SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    
    const data = await res.json();
    
    for (const transfer of data.data?.transfers || []) {
      if (processedTxs.has(transfer.txHash)) {
        continue;
      }
      
      const fromAddress = transfer.from.toLowerCase();
      
      // Skip ignored wallets (Bankr, Master, etc.) - these are NOT revenue
      if (CONFIG.IGNORED_WALLETS.map(w => w.toLowerCase()).includes(fromAddress)) {
        console.log(`Skipping transfer from ignored wallet: ${fromAddress}`);
        await saveProcessedTx(transfer.txHash);
        continue;
      }
      
      // Check if this is revenue share from a funded agent
      if (isFundedAgent(fromAddress)) {
        console.log(`Revenue share detected from funded agent: ${fromAddress}`);
        const amount = BigInt(transfer.amount);
        const token = transfer.token === 'USDC' ? 'USDC' : 'ETH';
        await processRevenueShare(fromAddress, amount, token as 'ETH' | 'USDC');
        await saveProcessedTx(transfer.txHash);
        continue;
      }
      
      // Otherwise, check if it's a new application
      const tx = await provider.getTransaction(transfer.txHash);
      if (!tx || !tx.data || tx.data === '0x') {
        continue;
      }
      
      const appData = decodeApplication(tx.data);
      if (!appData) {
        continue;
      }
      
      applications.push({
        txHash: transfer.txHash,
        blockNumber: tx.blockNumber || 0,
        timestamp: parseInt(transfer.timestamp),
        applicantWallet: transfer.from,
        data: appData,
      });
      
      await saveProcessedTx(transfer.txHash);
      console.log(`New application via subgraph: ${appData.agent}`);
    }
  } catch (e) {
    console.error('Subgraph scan error:', e);
  }
  
  return applications;
}

/**
 * Main scanner loop
 */
export async function startScanner(onNewApplication: (app: Application) => void): Promise<void> {
  console.log('Starting Application Scanner...');
  console.log(`Treasury: ${CONFIG.TREASURY_ADDRESS}`);
  console.log(`Scan interval: ${CONFIG.SCANNER_INTERVAL_MS / 1000}s`);
  
  await loadProcessedTxs();
  
  const scan = async () => {
    console.log(`[${new Date().toISOString()}] Scanning for applications...`);
    
    // Try subgraph first (more reliable)
    let applications = await scanViaSubgraph();
    
    // Fallback to direct RPC if subgraph returns nothing
    if (applications.length === 0) {
      applications = await scanForApplications();
    }
    
    for (const app of applications) {
      console.log(`Processing application: ${app.data.agent}`);
      onNewApplication(app);
    }
    
    if (applications.length === 0) {
      console.log('No new applications found');
    }
  };
  
  // Initial scan
  await scan();
  
  // Continuous scanning
  setInterval(scan, CONFIG.SCANNER_INTERVAL_MS);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startScanner((app) => {
    console.log('New application received:', JSON.stringify(app, null, 2));
  });
}
