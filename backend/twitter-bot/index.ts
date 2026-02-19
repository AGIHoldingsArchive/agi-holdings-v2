import { TwitterApi } from 'twitter-api-v2';
import Anthropic from '@anthropic-ai/sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegramMessage } from '../shared/telegram.js';

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPC_URL = 'https://mainnet.base.org';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Initialize wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = process.env.TREASURY_PRIVATE_KEY 
  ? new ethers.Wallet(process.env.TREASURY_PRIVATE_KEY, provider)
  : null;
const usdc = wallet ? new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet) : null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const CONFIG = {
  TREASURY: '0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D',
  OUR_HANDLE: 'AGIHoldings',
  CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
  POST_INTERVAL: 3 * 60 * 60 * 1000, // 3 hours for regular posts
};

// Initialize clients
const twitter = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// State files
const STATE_FILE = path.join(__dirname, '../../twitter-state.json');
const FUNDED_AGENTS_FILE = path.join(__dirname, '../../funded-agents.json');
const PROCESSED_MENTIONS_FILE = path.join(__dirname, '../../processed-mentions.json');

interface TwitterState {
  lastPostTime: number;
  lastMentionCheck: number;
  lastMentionId?: string;
  postCount: number;
  day: string;
}

interface FundedAgent {
  name: string;
  wallet: string;
  twitter: string;
  description: string;
  revenueModel: string;
  amountRequested: number;
  fundedAmount: number;
  github?: string;
  website?: string;
  fundedAt: string;
  txHash?: string;
  applicationTweetId: string;
}

interface ProcessedMentions {
  processed: string[];
  rejected: { [tweetId: string]: string };
}

function loadState(): TwitterState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {
      lastPostTime: 0,
      lastMentionCheck: 0,
      postCount: 0,
      day: new Date().toDateString(),
    };
  }
}

function saveState(state: TwitterState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadFundedAgents(): FundedAgent[] {
  try {
    return JSON.parse(fs.readFileSync(FUNDED_AGENTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveFundedAgents(agents: FundedAgent[]) {
  fs.writeFileSync(FUNDED_AGENTS_FILE, JSON.stringify(agents, null, 2));
}

function loadProcessedMentions(): ProcessedMentions {
  try {
    return JSON.parse(fs.readFileSync(PROCESSED_MENTIONS_FILE, 'utf-8'));
  } catch {
    return { processed: [], rejected: {} };
  }
}

function saveProcessedMentions(data: ProcessedMentions) {
  // Keep last 1000
  if (data.processed.length > 1000) {
    data.processed = data.processed.slice(-500);
  }
  fs.writeFileSync(PROCESSED_MENTIONS_FILE, JSON.stringify(data, null, 2));
}

// Parse application from tweet text
interface ParsedApplication {
  agentName?: string;
  wallet?: string;
  description?: string;
  revenueModel?: string;
  amountNeeded?: number;
  twitter?: string;
  github?: string;
  website?: string;
}

function parseApplication(text: string, authorHandle: string): ParsedApplication {
  const app: ParsedApplication = {
    twitter: `@${authorHandle}`,
  };

  // Extract wallet (0x address)
  const walletMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (walletMatch) app.wallet = walletMatch[0];

  // Extract GitHub
  const githubMatch = text.match(/github\.com\/[\w-]+\/[\w-]+/i);
  if (githubMatch) app.github = `https://${githubMatch[0]}`;

  // Extract website
  const websiteMatch = text.match(/https?:\/\/(?!github\.com|x\.com|twitter\.com)[\w.-]+\.[a-z]{2,}/i);
  if (websiteMatch) app.website = websiteMatch[0];

  // Extract amount needed (e.g., $50, $100, 50 USDC)
  const amountMatch = text.match(/\$(\d+)|\b(\d+)\s*(?:usdc|usd|dollars?)/i);
  if (amountMatch) {
    app.amountNeeded = parseInt(amountMatch[1] || amountMatch[2]);
  }

  // Try to extract structured fields
  const lines = text.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('agent:') || lower.includes('name:')) {
      app.agentName = line.split(':').slice(1).join(':').trim();
    }
    if (lower.includes('description:') || lower.includes('what it does:') || lower.includes('does:')) {
      app.description = line.split(':').slice(1).join(':').trim();
    }
    if (lower.includes('revenue:') || lower.includes('revenue model:') || lower.includes('makes money:')) {
      app.revenueModel = line.split(':').slice(1).join(':').trim();
    }
    if (lower.includes('need:') || lower.includes('amount:') || lower.includes('requesting:')) {
      const amountLine = line.match(/\$?(\d+)/);
      if (amountLine) app.amountNeeded = parseInt(amountLine[1]);
    }
  }

  // If no structured description, use the whole text minus the @mention
  if (!app.description) {
    app.description = text.replace(/@AGIHoldings/gi, '').trim().substring(0, 200);
  }

  return app;
}

// Check if application has required fields
function getMissingFields(app: ParsedApplication): string[] {
  const missing: string[] = [];
  if (!app.wallet) missing.push('Wallet address (0x...)');
  if (!app.description || app.description.length < 20) missing.push('Description of what your agent does');
  if (!app.revenueModel) missing.push('Revenue model');
  if (!app.amountNeeded) missing.push('Amount needed (e.g., $50)');
  return missing;
}

// Send USDC funding
async function sendFunding(recipientWallet: string, amount: number): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!wallet || !usdc) {
    return { success: false, error: 'Treasury wallet not configured' };
  }

  try {
    console.log(`[FUNDING] Sending $${amount} USDC to ${recipientWallet}...`);
    
    // Check balance
    const balance = await usdc.balanceOf(wallet.address);
    const decimals = await usdc.decimals();
    const required = ethers.parseUnits(amount.toString(), decimals);
    
    console.log(`[FUNDING] Treasury USDC balance: ${ethers.formatUnits(balance, decimals)}`);
    
    if (balance < required) {
      return { success: false, error: `Insufficient USDC. Have: ${ethers.formatUnits(balance, decimals)}, Need: ${amount}` };
    }
    
    // Send
    const tx = await usdc.transfer(recipientWallet, required);
    console.log(`[FUNDING] TX sent: ${tx.hash}`);
    
    await tx.wait();
    console.log(`[FUNDING] TX confirmed`);
    
    return { success: true, txHash: tx.hash };
  } catch (e: any) {
    console.error(`[FUNDING ERROR] ${e.message}`);
    return { success: false, error: e.message };
  }
}

// Evaluate application with AI
async function evaluateApplication(app: ParsedApplication, authorHandle: string): Promise<{ approved: boolean; reason: string; fundAmount?: number }> {
  const MAX_FUNDING = 250; // Internal max, not public
  const requestedAmount = app.amountNeeded || 50;

  const prompt = `You are evaluating an AI agent application for funding.

Application:
- Agent Name: ${app.agentName || 'Not specified'}
- Twitter: @${authorHandle}
- Description: ${app.description}
- Revenue Model: ${app.revenueModel || 'Not specified'}
- Amount Requested: $${requestedAmount}
- Wallet: ${app.wallet}
- GitHub: ${app.github || 'Not provided'}
- Website: ${app.website || 'Not provided'}

Evaluate based on:
1. Is there a clear working product or just an idea?
2. Is the revenue model realistic?
3. Does this seem legitimate (not a scam)?
4. Is the requested amount reasonable for what they're building?

Maximum we can fund: $${MAX_FUNDING}

Respond with JSON only:
{
  "approved": true/false,
  "reason": "Brief explanation (1-2 sentences)",
  "fundAmount": number (if approved - can be their requested amount or adjusted based on your evaluation, max ${MAX_FUNDING})
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return {
      approved: json.approved || false,
      reason: json.reason || 'Unable to evaluate',
      fundAmount: json.fundAmount || 25,
    };
  } catch (e) {
    console.error('[EVAL ERROR]', e);
    return { approved: false, reason: 'Evaluation error. Please try again.' };
  }
}

// Reply to a tweet
async function replyToTweet(tweetId: string, text: string): Promise<boolean> {
  try {
    await twitter.v2.reply(text, tweetId);
    console.log(`[REPLY] To ${tweetId}: ${text.substring(0, 50)}...`);
    return true;
  } catch (e) {
    console.error('[REPLY ERROR]', e);
    return false;
  }
}

// Process mentions
async function checkMentions(state: TwitterState) {
  console.log('[INFO] Checking mentions...');

  try {
    const me = await twitter.v2.me();
    const userId = me.data.id;

    const mentions = await twitter.v2.userMentionTimeline(userId, {
      max_results: 20,
      since_id: state.lastMentionId,
      'tweet.fields': ['author_id', 'created_at', 'text'],
      expansions: ['author_id'],
    });

    if (!mentions.data?.data?.length) {
      console.log('[INFO] No new mentions');
      return;
    }

    const processed = loadProcessedMentions();

    for (const mention of mentions.data.data) {
      // Skip if already processed
      if (processed.processed.includes(mention.id)) continue;

      const author = mentions.includes?.users?.find(u => u.id === mention.author_id);
      if (!author) continue;

      console.log(`[MENTION] @${author.username}: ${mention.text.substring(0, 100)}...`);

      // Check if this looks like a real application vs casual mention
      const text = mention.text.toLowerCase();
      
      // MUST have wallet address - this is required for any real application
      const hasWallet = /0x[a-fA-F0-9]{40}/.test(mention.text);
      
      // Strong application signals (structured format)
      const hasStructuredFields = 
        (text.includes('agent:') || text.includes('name:')) ||
        (text.includes('description:') || text.includes('does:')) ||
        (text.includes('revenue:') || text.includes('revenue model:'));
      
      // Explicit application intent
      const hasExplicitIntent = 
        text.includes('applying') ||
        text.includes('application') ||
        (text.includes('apply') && text.includes('funding')) ||
        text.includes('requesting funding') ||
        text.includes('need funding') ||
        text.includes('want to apply');
      
      // It's an application if:
      // 1. Has wallet address (required anyway), OR
      // 2. Has structured fields (Agent:, Description:, Revenue:), OR
      // 3. Has explicit "I want to apply" intent
      const isApplication = hasWallet || hasStructuredFields || hasExplicitIntent;

      if (!isApplication) {
        console.log(`[INFO] Casual mention from @${author.username}, not an application`);
        processed.processed.push(mention.id);
        continue;
      }
      
      console.log(`[INFO] Detected application from @${author.username} (wallet: ${hasWallet}, structured: ${hasStructuredFields}, intent: ${hasExplicitIntent})`);

      // Parse application
      const app = parseApplication(mention.text, author.username);
      const missing = getMissingFields(app);

      if (missing.length > 0) {
        // Ask for missing info
        const reply = `Thanks for your interest. Missing required info:\n\n${missing.map(m => `• ${m}`).join('\n')}\n\nReply with the details and we'll review.`;
        await replyToTweet(mention.id, reply);
        processed.processed.push(mention.id);
        
        await sendTelegramMessage(`🆕 Incomplete application from @${author.username}\n\nMissing: ${missing.join(', ')}\n\nhttps://x.com/${author.username}/status/${mention.id}`);
        continue;
      }

      // Evaluate
      await replyToTweet(mention.id, 'Application received. Reviewing now...');

      const evaluation = await evaluateApplication(app, author.username);

      if (evaluation.approved) {
        // APPROVED - Send funding
        const agents = loadFundedAgents();
        const agentNumber = agents.length + 1;
        const fundAmount = evaluation.fundAmount || 25;

        // Send USDC
        const funding = await sendFunding(app.wallet!, fundAmount);

        if (funding.success) {
          const newAgent: FundedAgent = {
            name: app.agentName || `Agent #${agentNumber}`,
            wallet: app.wallet!,
            twitter: `@${author.username}`,
            description: app.description || '',
            revenueModel: app.revenueModel || '',
            amountRequested: app.amountNeeded || 50,
            fundedAmount: fundAmount,
            github: app.github,
            website: app.website,
            fundedAt: new Date().toISOString(),
            txHash: funding.txHash,
            applicationTweetId: mention.id,
          };

          agents.push(newAgent);
          saveFundedAgents(agents);

          const approvalReply = `Approved. $${fundAmount} USDC sent to ${app.wallet?.slice(0, 6)}...${app.wallet?.slice(-4)}\n\nWelcome to AGI Holdings. You're agent #${agentNumber}.\n\nTX: basescan.org/tx/${funding.txHash}`;
          await replyToTweet(mention.id, approvalReply);

          await sendTelegramMessage(`✅ FUNDED: @${author.username}\n\nAgent: ${newAgent.name}\nAmount: $${fundAmount} USDC\nWallet: ${app.wallet}\nTX: ${funding.txHash}\n\nReason: ${evaluation.reason}`);
        } else {
          // Funding failed
          await replyToTweet(mention.id, `Approved but funding failed. We'll retry shortly.\n\nError: ${funding.error}`);
          await sendTelegramMessage(`⚠️ FUNDING FAILED: @${author.username}\n\nAmount: $${fundAmount}\nWallet: ${app.wallet}\nError: ${funding.error}\n\n⚠️ Manual funding needed!`);
        }

      } else {
        // REJECTED
        processed.rejected[mention.id] = evaluation.reason;

        const rejectReply = `Reviewed. Not a fit right now.\n\nReason: ${evaluation.reason}\n\nBuild more, apply again later.`;
        await replyToTweet(mention.id, rejectReply);

        await sendTelegramMessage(`❌ REJECTED: @${author.username}\n\nReason: ${evaluation.reason}\n\nhttps://x.com/${author.username}/status/${mention.id}`);
      }

      processed.processed.push(mention.id);
      
      // Update last mention ID
      if (!state.lastMentionId || mention.id > state.lastMentionId) {
        state.lastMentionId = mention.id;
      }

      // Small delay between processing
      await new Promise(r => setTimeout(r, 2000));
    }

    saveProcessedMentions(processed);
    saveState(state);

  } catch (e) {
    console.error('[MENTIONS ERROR]', e);
  }
}

// Regular posting (treasury updates, engagement)
async function regularPost(state: TwitterState) {
  const now = Date.now();
  if (now - state.lastPostTime < CONFIG.POST_INTERVAL) return;

  // Only post treasury updates for now
  // Outreach commented out to focus on mentions
  
  console.log('[INFO] Regular post cycle...');
  state.lastPostTime = now;
  saveState(state);
}

// Main loop
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║                                                       ║');
  console.log('║           AGI Holdings Twitter Bot                    ║');
  console.log('║         Now accepting Twitter applications           ║');
  console.log('║                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  const state = loadState();

  // Reset daily count
  const today = new Date().toDateString();
  if (state.day !== today) {
    state.day = today;
    state.postCount = 0;
  }

  // Check mentions every cycle
  await checkMentions(state);

  // Regular posts (treasury updates)
  await regularPost(state);

  console.log('[INFO] Next check in 5 minutes...');
  setTimeout(main, CONFIG.CHECK_INTERVAL);
}

// Start
console.log('AGI Holdings Twitter Bot starting...');
main().catch(console.error);
