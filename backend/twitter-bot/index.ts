import { TwitterApi } from 'twitter-api-v2';
import Anthropic from '@anthropic-ai/sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sendTelegramMessage } from '../shared/telegram.js';
import { generateTreasuryChart, getTreasuryBalance, TreasuryData } from './chart-generator.js';

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
  
  // Posting schedule
  POSTS_PER_DAY: 8,
  OUTREACH_PER_DAY: 48, // 2 per hour
  
  // Start date for day counter
  START_DATE: '2026-02-18',
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
  // Daily tracking
  day: string;
  dayNumber: number;
  
  // Posts
  postsToday: number;
  lastPostTime: number;
  lastTreasuryPost: string; // date string
  educationalPostsToday: number;
  
  // Outreach
  outreachToday: number;
  lastOutreachTime: number;
  approachedUsers: string[]; // usernames we've commented on (all time)
  
  // Mentions
  lastMentionId?: string;
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
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return {
      day: state.day || new Date().toDateString(),
      dayNumber: state.dayNumber || 1,
      postsToday: state.postsToday || 0,
      lastPostTime: state.lastPostTime || 0,
      lastTreasuryPost: state.lastTreasuryPost || '',
      educationalPostsToday: state.educationalPostsToday || 0,
      outreachToday: state.outreachToday || 0,
      lastOutreachTime: state.lastOutreachTime || 0,
      approachedUsers: state.approachedUsers || [],
      lastMentionId: state.lastMentionId,
    };
  } catch {
    return {
      day: new Date().toDateString(),
      dayNumber: 1,
      postsToday: 0,
      lastPostTime: 0,
      lastTreasuryPost: '',
      educationalPostsToday: 0,
      outreachToday: 0,
      lastOutreachTime: 0,
      approachedUsers: [],
    };
  }
}

function saveState(state: TwitterState) {
  // Keep approached users list manageable
  if (state.approachedUsers.length > 5000) {
    state.approachedUsers = state.approachedUsers.slice(-2500);
  }
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
  if (data.processed.length > 1000) {
    data.processed = data.processed.slice(-500);
  }
  fs.writeFileSync(PROCESSED_MENTIONS_FILE, JSON.stringify(data, null, 2));
}

function getDayNumber(): number {
  const start = new Date(CONFIG.START_DATE);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

// ============================================
// POSTING: Tweet a message
// ============================================

async function postTweet(text: string, mediaBuffer?: Buffer): Promise<string | null> {
  try {
    let mediaId: string | undefined;
    
    if (mediaBuffer) {
      mediaId = await twitter.v1.uploadMedia(mediaBuffer, { mimeType: 'image/png' });
    }
    
    const tweet = await twitter.v2.tweet({
      text,
      ...(mediaId && { media: { media_ids: [mediaId] } }),
    });
    
    console.log(`[TWEET] Posted: ${text.substring(0, 50)}...`);
    return tweet.data.id;
  } catch (e: any) {
    console.error('[TWEET ERROR]', e.message || e);
    return null;
  }
}

// ============================================
// TREASURY UPDATE (1x/day with chart)
// ============================================

async function postTreasuryUpdate(state: TwitterState): Promise<boolean> {
  const today = new Date().toDateString();
  
  // Already posted today
  if (state.lastTreasuryPost === today) {
    return false;
  }
  
  console.log('[INFO] Posting treasury update...');
  
  try {
    // Get treasury data
    const balance = await getTreasuryBalance(CONFIG.TREASURY);
    const agents = loadFundedAgents();
    const totalDeployed = agents.reduce((sum, a) => sum + a.fundedAmount, 0);
    
    const data: TreasuryData = {
      balance: Math.round(balance.totalUSD),
      agentsFunded: agents.length,
      totalDeployed: totalDeployed,
      revenueReceived: 0, // TODO: track this
      day: state.dayNumber,
    };
    
    // Generate chart
    const chartBuffer = await generateTreasuryChart(data);
    
    // Post tweet
    const text = `Day ${state.dayNumber}. Treasury update.`;
    const tweetId = await postTweet(text, chartBuffer);
    
    if (tweetId) {
      state.lastTreasuryPost = today;
      state.postsToday++;
      state.lastPostTime = Date.now();
      saveState(state);
      console.log(`[INFO] Treasury update posted (Day ${state.dayNumber})`);
      return true;
    }
  } catch (e) {
    console.error('[TREASURY ERROR]', e);
  }
  
  return false;
}

// ============================================
// EDUCATIONAL POSTS (AI-generated, 2-3x/day)
// ============================================

const EDUCATIONAL_TOPICS = [
  'Why AI agents need venture capital just like startups',
  'The difference between AI tools and autonomous AI agents',
  'How AI agents generate revenue',
  'What we look for in AI agent applications',
  'The future of agent-to-agent economies',
  'Why we fund AI agents on Base',
  'How to build a fundable AI agent',
  'Agent revenue models that actually work',
  'The problem with centralized AI platforms',
  'Why AI agents should own their own wallets',
];

async function generateEducationalPost(): Promise<string | null> {
  const topic = EDUCATIONAL_TOPICS[Math.floor(Math.random() * EDUCATIONAL_TOPICS.length)];
  
  const prompt = `Write a tweet for @AGIHoldings about: "${topic}"

Rules:
- Max 280 characters
- No emojis
- No hashtags
- No crypto slang (wagmi, bullish, moon, etc.)
- Professional but human tone
- Make it thought-provoking or educational
- Don't directly promote, just share insight

Return ONLY the tweet text, nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const text = (response.content[0] as { type: string; text: string }).text.trim();
    
    // Validate length
    if (text.length > 280) {
      return text.substring(0, 277) + '...';
    }
    
    return text;
  } catch (e) {
    console.error('[AI ERROR]', e);
    return null;
  }
}

async function postEducational(state: TwitterState): Promise<boolean> {
  // Max 3 educational posts per day
  if (state.educationalPostsToday >= 3) {
    return false;
  }
  
  // Space out posts (at least 2 hours apart)
  const hoursSinceLastPost = (Date.now() - state.lastPostTime) / (1000 * 60 * 60);
  if (hoursSinceLastPost < 2) {
    return false;
  }
  
  console.log('[INFO] Generating educational post...');
  
  const text = await generateEducationalPost();
  if (!text) return false;
  
  const tweetId = await postTweet(text);
  if (tweetId) {
    state.educationalPostsToday++;
    state.postsToday++;
    state.lastPostTime = Date.now();
    saveState(state);
    console.log(`[INFO] Educational post #${state.educationalPostsToday} posted`);
    return true;
  }
  
  return false;
}

// ============================================
// OUTREACH COMMENTS (48/day = 2/hour)
// ============================================

const OUTREACH_QUERIES = [
  'AI agent building',
  'autonomous AI',
  'AI agent revenue',
  'building AI agents',
  'AI agent startup',
  'LLM agent',
  'AI automation',
  'crypto AI agent',
];

async function generateOutreachComment(originalTweet: string): Promise<string | null> {
  const prompt = `You're replying to this tweet as @AGIHoldings (a VC fund for AI agents):

"${originalTweet}"

Write a reply that:
- Is relevant to what they said
- Adds value (insight, question, or perspective)
- Is NOT salesy or promotional
- Max 200 characters
- No emojis
- Professional but friendly

If the tweet is not relevant to AI agents, respond with "SKIP".

Return ONLY the reply text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const text = (response.content[0] as { type: string; text: string }).text.trim();
    
    if (text === 'SKIP' || text.length < 10) {
      return null;
    }
    
    return text;
  } catch (e) {
    console.error('[AI ERROR]', e);
    return null;
  }
}

async function doOutreach(state: TwitterState): Promise<boolean> {
  // Max 48 outreach per day
  if (state.outreachToday >= CONFIG.OUTREACH_PER_DAY) {
    return false;
  }
  
  // Space out (at least 25 minutes apart = ~2/hour)
  const minsSinceLastOutreach = (Date.now() - state.lastOutreachTime) / (1000 * 60);
  if (minsSinceLastOutreach < 25) {
    return false;
  }
  
  console.log('[INFO] Looking for outreach opportunities...');
  
  try {
    // Pick a random query
    const query = OUTREACH_QUERIES[Math.floor(Math.random() * OUTREACH_QUERIES.length)];
    
    // Search recent tweets
    const results = await twitter.v2.search(query, {
      max_results: 20,
      'tweet.fields': ['author_id', 'created_at', 'public_metrics'],
      expansions: ['author_id'],
    });
    
    if (!results.data?.data?.length) {
      console.log('[INFO] No tweets found for query:', query);
      return false;
    }
    
    // Find a good tweet to reply to
    for (const tweet of results.data.data) {
      const author = results.includes?.users?.find(u => u.id === tweet.author_id);
      if (!author) continue;
      
      // Skip if we've already approached this user
      if (state.approachedUsers.includes(author.username)) {
        continue;
      }
      
      // Skip our own tweets
      if (author.username.toLowerCase() === CONFIG.OUR_HANDLE.toLowerCase()) {
        continue;
      }
      
      // Skip low-engagement tweets
      const metrics = tweet.public_metrics;
      if (metrics && metrics.like_count < 2) {
        continue;
      }
      
      // Generate reply
      const reply = await generateOutreachComment(tweet.text);
      if (!reply) continue;
      
      // Post reply
      try {
        await twitter.v2.reply(reply, tweet.id);
        console.log(`[OUTREACH] Replied to @${author.username}: ${reply.substring(0, 50)}...`);
        
        state.approachedUsers.push(author.username);
        state.outreachToday++;
        state.lastOutreachTime = Date.now();
        saveState(state);
        
        return true;
      } catch (e: any) {
        console.error('[OUTREACH ERROR]', e.message || e);
        // If rate limited, stop
        if (e.code === 429) {
          console.log('[INFO] Rate limited, stopping outreach');
          return false;
        }
      }
    }
  } catch (e) {
    console.error('[OUTREACH ERROR]', e);
  }
  
  return false;
}

// ============================================
// APPLICATION PROCESSING (mentions)
// ============================================

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

  const walletMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (walletMatch) app.wallet = walletMatch[0];

  const githubMatch = text.match(/github\.com\/[\w-]+\/[\w-]+/i);
  if (githubMatch) app.github = `https://${githubMatch[0]}`;

  const websiteMatch = text.match(/https?:\/\/(?!github\.com|x\.com|twitter\.com)[\w.-]+\.[a-z]{2,}/i);
  if (websiteMatch) app.website = websiteMatch[0];

  const amountMatch = text.match(/\$(\d+)|\b(\d+)\s*(?:usdc|usd|dollars?)/i);
  if (amountMatch) {
    app.amountNeeded = parseInt(amountMatch[1] || amountMatch[2]);
  }

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

  if (!app.description) {
    app.description = text.replace(/@AGIHoldings/gi, '').trim().substring(0, 200);
  }

  return app;
}

function getMissingFields(app: ParsedApplication): string[] {
  const missing: string[] = [];
  if (!app.wallet) missing.push('Wallet address (0x...)');
  if (!app.description || app.description.length < 20) missing.push('Description of what your agent does');
  if (!app.revenueModel) missing.push('Revenue model');
  if (!app.amountNeeded) missing.push('Amount needed (e.g., $50)');
  return missing;
}

async function sendFunding(recipientWallet: string, amount: number): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!wallet || !usdc) {
    return { success: false, error: 'Treasury wallet not configured' };
  }

  try {
    console.log(`[FUNDING] Sending $${amount} USDC to ${recipientWallet}...`);
    
    const balance = await usdc.balanceOf(wallet.address);
    const decimals = await usdc.decimals();
    const required = ethers.parseUnits(amount.toString(), decimals);
    
    console.log(`[FUNDING] Treasury USDC balance: ${ethers.formatUnits(balance, decimals)}`);
    
    if (balance < required) {
      return { success: false, error: `Insufficient USDC. Have: ${ethers.formatUnits(balance, decimals)}, Need: ${amount}` };
    }
    
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

async function evaluateApplication(app: ParsedApplication, authorHandle: string): Promise<{ approved: boolean; reason: string; fundAmount?: number }> {
  const MAX_FUNDING = 250;
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
      if (processed.processed.includes(mention.id)) continue;

      const author = mentions.includes?.users?.find(u => u.id === mention.author_id);
      if (!author) continue;

      console.log(`[MENTION] @${author.username}: ${mention.text.substring(0, 100)}...`);

      const text = mention.text.toLowerCase();
      
      const hasWallet = /0x[a-fA-F0-9]{40}/.test(mention.text);
      const hasStructuredFields = 
        (text.includes('agent:') || text.includes('name:')) ||
        (text.includes('description:') || text.includes('does:')) ||
        (text.includes('revenue:') || text.includes('revenue model:'));
      const hasExplicitIntent = 
        text.includes('applying') ||
        text.includes('application') ||
        (text.includes('apply') && text.includes('funding')) ||
        text.includes('requesting funding') ||
        text.includes('need funding') ||
        text.includes('want to apply');
      
      const isApplication = hasWallet || hasStructuredFields || hasExplicitIntent;

      if (!isApplication) {
        console.log(`[INFO] Casual mention from @${author.username}, skipping`);
        processed.processed.push(mention.id);
        continue;
      }
      
      console.log(`[INFO] Processing application from @${author.username}`);

      const app = parseApplication(mention.text, author.username);
      const missing = getMissingFields(app);

      if (missing.length > 0) {
        const reply = `Thanks for your interest. Missing required info:\n\n${missing.map(m => `• ${m}`).join('\n')}\n\nReply with the details and we'll review.`;
        await replyToTweet(mention.id, reply);
        processed.processed.push(mention.id);
        
        await sendTelegramMessage(`🆕 Incomplete application from @${author.username}\n\nMissing: ${missing.join(', ')}\n\nhttps://x.com/${author.username}/status/${mention.id}`);
        continue;
      }

      await replyToTweet(mention.id, 'Application received. Reviewing now...');

      const evaluation = await evaluateApplication(app, author.username);

      if (evaluation.approved) {
        const agents = loadFundedAgents();
        const agentNumber = agents.length + 1;
        const fundAmount = evaluation.fundAmount || 25;

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
          await replyToTweet(mention.id, `Approved but funding failed. We'll retry shortly.\n\nError: ${funding.error}`);
          await sendTelegramMessage(`⚠️ FUNDING FAILED: @${author.username}\n\nAmount: $${fundAmount}\nWallet: ${app.wallet}\nError: ${funding.error}\n\n⚠️ Manual funding needed!`);
        }
      } else {
        processed.rejected[mention.id] = evaluation.reason;

        const rejectReply = `Reviewed. Not a fit right now.\n\nReason: ${evaluation.reason}\n\nBuild more, apply again later.`;
        await replyToTweet(mention.id, rejectReply);

        await sendTelegramMessage(`❌ REJECTED: @${author.username}\n\nReason: ${evaluation.reason}\n\nhttps://x.com/${author.username}/status/${mention.id}`);
      }

      processed.processed.push(mention.id);
      
      if (!state.lastMentionId || mention.id > state.lastMentionId) {
        state.lastMentionId = mention.id;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    saveProcessedMentions(processed);
    saveState(state);

  } catch (e) {
    console.error('[MENTIONS ERROR]', e);
  }
}

// ============================================
// MAIN LOOP
// ============================================

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║                                                       ║');
  console.log('║           AGI Holdings Twitter Bot                    ║');
  console.log('║         Autonomous posting + applications             ║');
  console.log('║                                                       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  const state = loadState();

  // Reset daily counts
  const today = new Date().toDateString();
  if (state.day !== today) {
    console.log('[INFO] New day, resetting counts');
    state.day = today;
    state.dayNumber = getDayNumber();
    state.postsToday = 0;
    state.educationalPostsToday = 0;
    state.outreachToday = 0;
    saveState(state);
  }
  
  console.log(`[INFO] Day ${state.dayNumber} | Posts: ${state.postsToday}/${CONFIG.POSTS_PER_DAY} | Outreach: ${state.outreachToday}/${CONFIG.OUTREACH_PER_DAY}`);

  // 1. Check mentions (applications)
  await checkMentions(state);

  // 2. Treasury update (1x/day)
  await postTreasuryUpdate(state);

  // 3. Educational posts (2-3x/day)
  if (state.postsToday < CONFIG.POSTS_PER_DAY) {
    await postEducational(state);
  }

  // 4. Outreach comments (48/day)
  await doOutreach(state);

  console.log('[INFO] Next cycle in 5 minutes...');
  setTimeout(main, CONFIG.CHECK_INTERVAL);
}

// Start
console.log('AGI Holdings Twitter Bot starting...');
main().catch(console.error);
