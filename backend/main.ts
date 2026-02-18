/**
 * AGI Holdings - Backend Orchestrator
 * 
 * Main entry point that coordinates:
 * - Application scanning
 * - AI evaluation
 * - Funding execution
 * - Twitter announcements
 */

import { config } from 'dotenv';
import { startScanner, addFundedAgent } from './scanner';
import { evaluateApplication, handleEvaluationResult } from './evaluator';
import { initializeExecutor, executeFunding, handleRejection, handleNeedsInfo } from './executor';
import { initBuyback } from './executor/buyback';
import { startAPI } from './api';
import { Application, EvaluationResult, CONFIG } from './shared/config';

// Load environment variables
config();

// Validate required environment variables
function validateEnv(): void {
  const required = [
    'TREASURY_PRIVATE_KEY',
    'ANTHROPIC_API_KEY',
  ];
  
  const optional = [
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  const hasTwitter = optional.every(key => process.env[key]);
  if (!hasTwitter) {
    console.warn('Twitter credentials not fully configured - announcements disabled');
  }
}

// Application processing queue
const processingQueue: Application[] = [];
let isProcessing = false;

/**
 * Load existing funded agents from subgraph
 */
async function loadFundedAgents(): Promise<void> {
  console.log('Loading funded agents from subgraph...');
  
  try {
    const query = `{
      fundedAgents(first: 1000) {
        wallet
        isActive
      }
    }`;
    
    const res = await fetch(CONFIG.SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    
    const data = await res.json();
    
    if (data.data?.fundedAgents) {
      for (const agent of data.data.fundedAgents) {
        if (agent.isActive) {
          addFundedAgent(agent.wallet);
          console.log(`Loaded funded agent: ${agent.wallet}`);
        }
      }
      console.log(`Loaded ${data.data.fundedAgents.length} funded agents`);
    }
  } catch (e) {
    console.error('Failed to load funded agents:', e);
  }
}

/**
 * Process a single application through the full pipeline
 */
async function processApplication(app: Application): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${app.data.agent}`);
  console.log(`From: ${app.applicantWallet}`);
  console.log(`TX: ${app.txHash}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: AI Evaluation
    console.log('\n[1/3] Running AI evaluation...');
    const result = await evaluateApplication(app);
    
    // Step 2: Handle based on decision
    console.log(`\n[2/3] Decision: ${result.decision} (${result.confidence}% confidence)`);
    
    await handleEvaluationResult(
      app,
      result,
      // On Approved
      async (app, result) => {
        console.log('\n[3/3] Executing funding...');
        const funding = await executeFunding(app, result);
        if (funding.success) {
          console.log(`✅ Funding successful: ${funding.txHash}`);
          // Add to funded agents list for revenue tracking
          addFundedAgent(app.data.wallet);
          console.log(`Added ${app.data.wallet} to funded agents for revenue tracking`);
        } else {
          console.error(`❌ Funding failed: ${funding.error}`);
        }
      },
      // On Rejected
      async (app, result) => {
        console.log('\n[3/3] Recording rejection...');
        await handleRejection(app, result);
        console.log('✅ Rejection recorded');
      },
      // On Needs Info
      async (app, result) => {
        console.log('\n[3/3] Reaching out for more info...');
        await handleNeedsInfo(app, result);
        console.log('✅ Follow-up sent');
      }
    );
    
  } catch (e: any) {
    console.error(`\n❌ Error processing application: ${e.message}`);
    console.error(e.stack);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Process queue worker
 */
async function processQueue(): Promise<void> {
  if (isProcessing || processingQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  while (processingQueue.length > 0) {
    const app = processingQueue.shift()!;
    await processApplication(app);
    
    // Small delay between applications
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  isProcessing = false;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(`
    ╔═══════════════════════════════════════════════════════╗
    ║                                                       ║
    ║              AGI Holdings Backend                     ║
    ║         Venture Capital for AI Agents                 ║
    ║                                                       ║
    ╚═══════════════════════════════════════════════════════╝
  `);
  
  // Validate environment
  validateEnv();
  
  // Initialize executor
  const hasTwitter = process.env.TWITTER_API_KEY && 
                     process.env.TWITTER_API_SECRET && 
                     process.env.TWITTER_ACCESS_TOKEN && 
                     process.env.TWITTER_ACCESS_SECRET;
  
  initializeExecutor(
    process.env.TREASURY_PRIVATE_KEY!,
    hasTwitter ? {
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    } : undefined
  );
  
  // Initialize buyback module
  initBuyback(process.env.TREASURY_PRIVATE_KEY!);
  
  // Load existing funded agents from subgraph
  await loadFundedAgents();
  
  // Start scanner
  await startScanner(async (app) => {
    console.log(`📥 New application queued: ${app.data.agent}`);
    processingQueue.push(app);
    processQueue(); // Trigger processing
  });
  
  // Start API server
  startAPI(3000);
  
  // Keep process alive
  console.log('\n🚀 Backend running. Scanning for applications...\n');
  console.log('📡 API available at http://localhost:3000\n');
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    process.exit(0);
  });
}

// Run
main().catch(console.error);
