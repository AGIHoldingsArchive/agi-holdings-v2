/**
 * AGI Holdings Telegram Bot
 * 
 * Commands:
 * /stats - Treasury stats
 * /recent - Recent applications  
 * /portfolio - Funded agents
 * /pending - Pending applications
 * /help - Show commands
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8123904595:AAFxBtjEMTf3lmNEEN-wgsltpB341vVwSUE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7006655832';
const DATA_DIR = path.join(__dirname, '../data');

interface Update {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

async function sendMessage(chatId: number | string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
}

async function getStats(): Promise<string> {
  try {
    // Get funded agents
    const fundedPath = path.join(DATA_DIR, 'funded-agents.json');
    let fundedAgents: any[] = [];
    try {
      fundedAgents = JSON.parse(await fs.readFile(fundedPath, 'utf-8'));
    } catch { }
    
    // Get rejections
    const rejectionsPath = path.join(DATA_DIR, 'rejections.json');
    let rejections: any[] = [];
    try {
      rejections = JSON.parse(await fs.readFile(rejectionsPath, 'utf-8'));
    } catch { }
    
    // Get treasury balance from blockscout
    let treasuryUSD = 0;
    try {
      const ethRes = await fetch('https://base.blockscout.com/api/v2/addresses/0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D');
      const ethData = await ethRes.json();
      const ethBalance = parseInt(ethData.coin_balance) / 1e18;
      
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const priceData = await priceRes.json();
      const ethPrice = priceData.ethereum?.usd || 2000;
      
      treasuryUSD = Math.round(ethBalance * ethPrice);
    } catch { }
    
    const totalDeployed = fundedAgents.reduce((sum, a) => sum + (a.fundedAmount || 0), 0);
    const totalRevenue = fundedAgents.reduce((sum, a) => sum + (a.totalRevenuePaid || 0), 0);
    
    return `📊 <b>AGI Holdings Stats</b>

💰 <b>Treasury:</b> $${treasuryUSD.toLocaleString()}
👥 <b>Agents Funded:</b> ${fundedAgents.length}
💸 <b>Total Deployed:</b> $${totalDeployed.toLocaleString()}
📈 <b>Revenue Received:</b> $${totalRevenue.toLocaleString()}
❌ <b>Rejected:</b> ${rejections.length}`;
  } catch (e) {
    return '❌ Error getting stats';
  }
}

async function getPortfolio(): Promise<string> {
  try {
    const fundedPath = path.join(DATA_DIR, 'funded-agents.json');
    const fundedAgents = JSON.parse(await fs.readFile(fundedPath, 'utf-8'));
    
    if (fundedAgents.length === 0) {
      return '📁 <b>Portfolio</b>\n\nNo agents funded yet.';
    }
    
    let msg = '📁 <b>Portfolio</b>\n\n';
    for (const agent of fundedAgents) {
      const status = agent.status === 'active' ? '🟢' : '🔴';
      msg += `${status} <b>${agent.name}</b>\n`;
      msg += `   💰 $${agent.fundedAmount} | 📈 $${agent.totalRevenuePaid || 0} revenue\n`;
      msg += `   ${agent.twitter}\n\n`;
    }
    
    return msg;
  } catch {
    return '📁 <b>Portfolio</b>\n\nNo agents funded yet.';
  }
}

async function getRecent(): Promise<string> {
  try {
    const rejectionsPath = path.join(DATA_DIR, 'rejections.json');
    const fundedPath = path.join(DATA_DIR, 'funded-agents.json');
    
    let rejections: any[] = [];
    let funded: any[] = [];
    
    try { rejections = JSON.parse(await fs.readFile(rejectionsPath, 'utf-8')); } catch { }
    try { funded = JSON.parse(await fs.readFile(fundedPath, 'utf-8')); } catch { }
    
    // Combine and sort by timestamp
    const all = [
      ...rejections.map(r => ({ ...r, type: 'rejected', ts: r.timestamp })),
      ...funded.map(f => ({ ...f, type: 'funded', ts: f.fundedAt })),
    ].sort((a, b) => b.ts - a.ts).slice(0, 5);
    
    if (all.length === 0) {
      return '📋 <b>Recent Activity</b>\n\nNo applications yet.';
    }
    
    let msg = '📋 <b>Recent Activity</b>\n\n';
    for (const item of all) {
      const emoji = item.type === 'funded' ? '✅' : '❌';
      const name = item.name || item.agent;
      const date = new Date(item.ts).toLocaleDateString();
      msg += `${emoji} <b>${name}</b> — ${item.type} (${date})\n`;
    }
    
    return msg;
  } catch {
    return '📋 <b>Recent Activity</b>\n\nNo applications yet.';
  }
}

function getHelp(): string {
  return `🏛️ <b>AGI Holdings Bot</b>

<b>Commands:</b>
/stats — Treasury & fund stats
/portfolio — Funded agents list
/recent — Recent applications
/help — Show this message

<b>Notifications:</b>
• New applications
• Funding decisions`;
}

async function handleCommand(chatId: number, text: string): Promise<void> {
  const cmd = text.toLowerCase().trim();
  
  if (cmd === '/stats') {
    await sendMessage(chatId, await getStats());
  } else if (cmd === '/portfolio') {
    await sendMessage(chatId, await getPortfolio());
  } else if (cmd === '/recent') {
    await sendMessage(chatId, await getRecent());
  } else if (cmd === '/help' || cmd === '/start') {
    await sendMessage(chatId, getHelp());
  }
}

async function pollUpdates(): Promise<void> {
  let offset = 0;
  
  console.log('Telegram bot polling started...');
  
  while (true) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.ok && data.result) {
        for (const update of data.result as Update[]) {
          offset = update.update_id + 1;
          
          if (update.message?.text && update.message.chat.id.toString() === TELEGRAM_CHAT_ID) {
            await handleCommand(update.message.chat.id, update.message.text);
          }
        }
      }
    } catch (e) {
      console.error('Telegram polling error:', e);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Start polling
pollUpdates().catch(console.error);
