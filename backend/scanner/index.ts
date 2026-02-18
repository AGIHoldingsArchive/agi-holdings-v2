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

const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

// Track processed transactions to avoid duplicates
const processedTxs = new Set<string>();

// Load from persistent storage
async function loadProcessedTxs(): Promise<void> {
  // TODO: Load from database/file
}

async function saveProcessedTx(txHash: string): Promise<void> {
  processedTxs.add(txHash);
  // TODO: Persist to database/file
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
      
      // Get full transaction to decode calldata
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
