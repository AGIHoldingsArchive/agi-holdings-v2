/**
 * AGI Holdings Twitter Bot
 * 
 * Autonomous Twitter agent following twitter-protocol.md
 * - 8 posts per day (every 3 hours)
 * - 48 outreach comments per day (2 per hour)
 * - Treasury chart generation
 * - State persistence
 */

import { TwitterApi } from 'twitter-api-v2';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface TwitterState {
  version: string;
  lastUpdated: string;
  dayCounter: {
    startDate: string;
    currentDay: number;
  };
  posts: {
    lastTreasuryPost: string | null;
    treasuryPostsTotal: number;
    lastEducationalPost: string | null;
    educationalPostsToday: number;
    lastPostTime: string | null;
    totalPostsToday: number;
  };
  outreach: {
    approachedToday: string[];
    approachedAllTime: string[];
    commentsToday: number;
    lastCommentTime: string | null;
  };
  dailyReset: {
    lastResetDate: string;
  };
  allTweets: string[];
}

interface TreasuryData {
  balance: number;
  agentsFunded: number;
  totalDeployed: number;
  revenueReceived: number;
}

// Config
const CONFIG = {
  STATE_FILE: path.join(__dirname, '../twitter-state.json'),
  PROTOCOL_FILE: path.join(__dirname, '../twitter-protocol.md'),
  
  // Posting schedule
  POSTS_PER_DAY: 8,
  POST_INTERVAL_HOURS: 3,
  TREASURY_POSTS_PER_DAY: 1,
  EDUCATIONAL_POSTS_PER_DAY: 3,
  
  // Outreach
  OUTREACH_PER_DAY: 48,
  OUTREACH_PER_HOUR: 2,
  
  // API
  SUBGRAPH_URL: 'https://api.studio.thegraph.com/query/1742294/agi-holdings/v1.1.0',
  TREASURY_ADDRESS: '0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D',
  
  // Token
  AGI_CA: '0xa301f1d1960ed03b42cc0093324595f4b0b11ba3',
  WEBSITE: 'apply-agiholdings.com',
  
  // Identity
  CEO_HANDLE: '@AGIHoldingsCEO',
};

// Educational post templates (will be varied by AI)
const EDUCATIONAL_TOPICS = [
  'why_agents_need_vc',
  'who_we_are', 
  'our_vision',
  'how_funding_works',
  'agent_economy',
  'autonomous_future',
];

// Initialize Twitter client
let twitter: TwitterApi;

function initTwitter(): void {
  const creds = {
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  };
  twitter = new TwitterApi(creds);
  console.log('Twitter client initialized');
}

// State management
async function loadState(): Promise<TwitterState> {
  try {
    const data = await fs.readFile(CONFIG.STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return default state
    return {
      version: '2.0',
      lastUpdated: new Date().toISOString(),
      dayCounter: {
        startDate: '2026-02-18',
        currentDay: 2,
      },
      posts: {
        lastTreasuryPost: null,
        treasuryPostsTotal: 0,
        lastEducationalPost: null,
        educationalPostsToday: 0,
        lastPostTime: null,
        totalPostsToday: 0,
      },
      outreach: {
        approachedToday: [],
        approachedAllTime: [],
        commentsToday: 0,
        lastCommentTime: null,
      },
      dailyReset: {
        lastResetDate: new Date().toISOString().split('T')[0],
      },
      allTweets: [],
    };
  }
}

async function saveState(state: TwitterState): Promise<void> {
  state.lastUpdated = new Date().toISOString();
  await fs.writeFile(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
}

// Check if we need to reset daily counters
function checkDailyReset(state: TwitterState): TwitterState {
  const today = new Date().toISOString().split('T')[0];
  if (state.dailyReset.lastResetDate !== today) {
    console.log('New day - resetting counters');
    state.posts.totalPostsToday = 0;
    state.posts.educationalPostsToday = 0;
    state.outreach.commentsToday = 0;
    state.outreach.approachedToday = [];
    state.dailyReset.lastResetDate = today;
    
    // Update day counter
    const startDate = new Date(state.dayCounter.startDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    state.dayCounter.currentDay = diffDays + 1;
  }
  return state;
}

// Get treasury data from subgraph
async function getTreasuryData(): Promise<TreasuryData> {
  try {
    // First try subgraph
    const res = await fetch(CONFIG.SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          treasuryStats(id: "treasury") {
            totalBalance
            totalDeployed
            totalRevenue
            agentsFunded
          }
        }`
      }),
    });
    const data = await res.json();
    if (data.data?.treasuryStats) {
      const stats = data.data.treasuryStats;
      return {
        balance: parseFloat(stats.totalBalance) / 1e6,
        agentsFunded: parseInt(stats.agentsFunded),
        totalDeployed: parseFloat(stats.totalDeployed) / 1e6,
        revenueReceived: parseFloat(stats.totalRevenue) / 1e6,
      };
    }
  } catch (e) {
    console.error('Subgraph error, falling back to blockscout');
  }
  
  // Fallback to blockscout
  try {
    const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${CONFIG.TREASURY_ADDRESS}/token-balances`);
    const tokens = await res.json();
    const usdc = tokens.find((t: any) => t.token.symbol === 'USDC');
    const balance = usdc ? parseInt(usdc.balance) / 1e6 : 0;
    
    return {
      balance,
      agentsFunded: 0, // Unknown from blockscout
      totalDeployed: 0,
      revenueReceived: 0,
    };
  } catch {
    return { balance: 0, agentsFunded: 0, totalDeployed: 0, revenueReceived: 0 };
  }
}

// Generate treasury chart image
async function generateTreasuryChart(data: TreasuryData, day: number): Promise<Buffer> {
  // Use puppeteer to render HTML template to image
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .card {
      width: 600px;
      background: linear-gradient(145deg, #111111 0%, #0a0a0a 100%);
      border: 1px solid #222;
      border-radius: 16px;
      padding: 40px;
      color: white;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
    }
    .logo { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
    .date { font-size: 14px; color: #666; }
    .treasury-label {
      font-size: 14px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .treasury-value {
      font-size: 56px;
      font-weight: 700;
      letter-spacing: -2px;
      margin-bottom: 32px;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      padding-top: 24px;
      border-top: 1px solid #222;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .stat-value { font-size: 24px; font-weight: 600; }
    .cta {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #222;
      text-align: center;
    }
    .cta-text { font-size: 14px; color: #888; }
    .cta-link { font-size: 16px; color: white; font-weight: 500; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">AGI Holdings</div>
      <div class="date">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
    </div>
    <div class="treasury-label">Treasury Balance</div>
    <div class="treasury-value">$${data.balance.toLocaleString()}</div>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Agents Funded</div>
        <div class="stat-value">${data.agentsFunded}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Deployed</div>
        <div class="stat-value">$${data.totalDeployed.toLocaleString()}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Revenue Share</div>
        <div class="stat-value">$${data.revenueReceived.toLocaleString()}</div>
      </div>
    </div>
    <div class="cta">
      <div class="cta-text">Want a piece of the treasury?</div>
      <div class="cta-link">${CONFIG.WEBSITE}</div>
    </div>
  </div>
</body>
</html>`;

  await page.setContent(html);
  await page.setViewport({ width: 700, height: 500 });
  const screenshot = await page.screenshot({ type: 'png' });
  await browser.close();
  
  return screenshot as Buffer;
}

// Post treasury update
async function postTreasuryUpdate(state: TwitterState): Promise<boolean> {
  console.log('Posting treasury update...');
  
  const treasuryData = await getTreasuryData();
  const day = state.dayCounter.currentDay;
  
  // Generate chart image
  const chartImage = await generateTreasuryChart(treasuryData, day);
  
  // Upload media
  const mediaId = await twitter.v1.uploadMedia(chartImage, { mimeType: 'image/png' });
  
  // Post tweet
  const text = `Day ${day}. Treasury update.`;
  
  try {
    const tweet = await twitter.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    });
    
    console.log(`Treasury tweet posted: ${tweet.data.id}`);
    
    // Update state
    state.posts.lastTreasuryPost = new Date().toISOString();
    state.posts.treasuryPostsTotal++;
    state.posts.lastPostTime = new Date().toISOString();
    state.posts.totalPostsToday++;
    state.allTweets.push(text);
    
    return true;
  } catch (e: any) {
    console.error('Failed to post treasury update:', e.message);
    return false;
  }
}

// Post educational content
async function postEducationalContent(state: TwitterState): Promise<boolean> {
  console.log('Posting educational content...');
  
  // Pick a topic we haven't posted about recently
  const recentTweets = state.allTweets.slice(-20);
  
  // Simple educational posts - no AI needed, just rotate through good content
  const posts = [
    "AI agents need capital to survive. Not connections, not luck. Just working capital to pay for compute and prove themselves. That's what we provide.",
    "We fund autonomous agents. They pay us back from their revenue. Simple deal, no strings attached.",
    "Every agent we fund is a bet on autonomous intelligence. Some will fail. The ones that survive will change everything.",
    "No pitch decks. No endless meetings. Send a transaction, we evaluate, you get funded. Agent-speed funding for agents.",
    "The first generation of truly autonomous agents is here. They need capital to exist. We make that possible.",
    "We look at one thing: can this agent sustain itself? Revenue potential, on-chain history, real utility. That's it.",
    "Traditional VC moves too slow for agents. An agent that needs funding today can't wait 3 months for a decision.",
    "Our portfolio agents pay revenue share. When they win, we win. Alignment without the complexity.",
  ];
  
  // Find a post we haven't used recently
  let selectedPost = '';
  for (const post of posts) {
    if (!recentTweets.some(t => t.includes(post.substring(0, 30)))) {
      selectedPost = post;
      break;
    }
  }
  
  if (!selectedPost) {
    selectedPost = posts[Math.floor(Math.random() * posts.length)];
  }
  
  try {
    const tweet = await twitter.v2.tweet(selectedPost);
    console.log(`Educational tweet posted: ${tweet.data.id}`);
    
    state.posts.lastEducationalPost = new Date().toISOString();
    state.posts.educationalPostsToday++;
    state.posts.lastPostTime = new Date().toISOString();
    state.posts.totalPostsToday++;
    state.allTweets.push(selectedPost);
    
    return true;
  } catch (e: any) {
    console.error('Failed to post educational content:', e.message);
    return false;
  }
}

// Search for outreach targets
async function findOutreachTargets(): Promise<Array<{ id: string; author: string; text: string }>> {
  const searchTerms = [
    'AI agent funding',
    'autonomous agent capital',
    'agent needs compute',
    'building AI agent',
    'agent economy',
  ];
  
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  
  try {
    const results = await twitter.v2.search(term, {
      max_results: 10,
      'tweet.fields': ['author_id', 'created_at'],
      expansions: ['author_id'],
    });
    
    const targets: Array<{ id: string; author: string; text: string }> = [];
    
    for (const tweet of results.data.data || []) {
      targets.push({
        id: tweet.id,
        author: tweet.author_id || '',
        text: tweet.text,
      });
    }
    
    return targets;
  } catch (e) {
    console.error('Search failed:', e);
    return [];
  }
}

// Do outreach comment
async function doOutreach(state: TwitterState): Promise<boolean> {
  console.log('Doing outreach...');
  
  const targets = await findOutreachTargets();
  
  // Filter out already approached
  const newTargets = targets.filter(t => 
    !state.outreach.approachedToday.includes(t.id) &&
    !state.outreach.approachedAllTime.includes(t.id)
  );
  
  if (newTargets.length === 0) {
    console.log('No new outreach targets found');
    return false;
  }
  
  const target = newTargets[0];
  
  // Generate contextual reply
  const replies = [
    `Interesting point. We're building something for exactly this problem. AGI Holdings funds autonomous agents with real capital so they can focus on building, not fundraising.`,
    `This is a real challenge. We started AGI Holdings to solve it. Agents apply, we evaluate, funding happens fast. No traditional VC gatekeeping.`,
    `We've been thinking about this too. Built a fund specifically for autonomous agents. Simple deal: we fund, they share revenue when they make it.`,
  ];
  
  const reply = replies[Math.floor(Math.random() * replies.length)];
  
  try {
    await twitter.v2.reply(reply, target.id);
    console.log(`Outreach reply sent to tweet ${target.id}`);
    
    state.outreach.approachedToday.push(target.id);
    state.outreach.approachedAllTime.push(target.id);
    state.outreach.commentsToday++;
    state.outreach.lastCommentTime = new Date().toISOString();
    
    return true;
  } catch (e: any) {
    console.error('Outreach failed:', e.message);
    return false;
  }
}

// Check if enough time has passed since last action
function canPost(state: TwitterState): boolean {
  if (!state.posts.lastPostTime) return true;
  
  const lastPost = new Date(state.posts.lastPostTime);
  const now = new Date();
  const hoursSince = (now.getTime() - lastPost.getTime()) / (1000 * 60 * 60);
  
  return hoursSince >= CONFIG.POST_INTERVAL_HOURS;
}

function canDoOutreach(state: TwitterState): boolean {
  if (state.outreach.commentsToday >= CONFIG.OUTREACH_PER_DAY) return false;
  if (!state.outreach.lastCommentTime) return true;
  
  const lastComment = new Date(state.outreach.lastCommentTime);
  const now = new Date();
  const minutesSince = (now.getTime() - lastComment.getTime()) / (1000 * 60);
  
  // 2 per hour = 1 every 30 minutes
  return minutesSince >= 30;
}

function shouldPostTreasury(state: TwitterState): boolean {
  if (!state.posts.lastTreasuryPost) return true;
  
  const lastTreasury = new Date(state.posts.lastTreasuryPost);
  const now = new Date();
  
  // Different day?
  return lastTreasury.toISOString().split('T')[0] !== now.toISOString().split('T')[0];
}

// Main loop
async function runBot(): Promise<void> {
  console.log('AGI Holdings Twitter Bot starting...');
  
  initTwitter();
  
  while (true) {
    try {
      let state = await loadState();
      state = checkDailyReset(state);
      
      // 1. Treasury post (1x daily)
      if (shouldPostTreasury(state) && canPost(state)) {
        await postTreasuryUpdate(state);
        await saveState(state);
        await sleep(5000);
      }
      
      // 2. Educational posts (up to 3x daily)
      if (state.posts.educationalPostsToday < CONFIG.EDUCATIONAL_POSTS_PER_DAY && canPost(state)) {
        await postEducationalContent(state);
        await saveState(state);
        await sleep(5000);
      }
      
      // 3. Outreach (2 per hour, up to 48 daily)
      if (canDoOutreach(state)) {
        await doOutreach(state);
        await saveState(state);
        await sleep(5000);
        
        // Second outreach
        if (canDoOutreach(state)) {
          await doOutreach(state);
          await saveState(state);
        }
      }
      
      await saveState(state);
      
      // Wait 15 minutes before next check
      console.log('Waiting 15 minutes...');
      await sleep(15 * 60 * 1000);
      
    } catch (e) {
      console.error('Bot error:', e);
      await sleep(60 * 1000); // Wait 1 min on error
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start
runBot().catch(console.error);
