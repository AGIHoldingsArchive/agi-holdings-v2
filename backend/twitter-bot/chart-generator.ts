/**
 * Treasury Chart Generator (Lightweight)
 * 
 * Uses node-canvas instead of Puppeteer for fast builds
 * Generates Twitter-optimized chart images (1200x675, 16:9)
 */

import { createCanvas, registerFont } from '@napi-rs/canvas';

export interface TreasuryData {
  balance: number;
  agentsFunded: number;
  totalDeployed: number;
  revenueReceived: number;
  day: number;
}

// Twitter optimal dimensions
const CHART_WIDTH = 1200;
const CHART_HEIGHT = 675;

// Colors
const COLORS = {
  background: '#0a0a0a',
  card: '#111111',
  border: '#222222',
  text: '#ffffff',
  textMuted: '#888888',
  textDim: '#666666',
};

/**
 * Get current ETH price from CoinGecko
 */
export async function getETHPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await res.json();
    return data.ethereum?.usd || 2000;
  } catch {
    return 2000;
  }
}

/**
 * Get treasury balance from Blockscout
 */
export async function getTreasuryBalance(treasuryAddress: string): Promise<{ eth: number; usdc: number; totalUSD: number }> {
  try {
    const ethRes = await fetch(`https://base.blockscout.com/api/v2/addresses/${treasuryAddress}`);
    const ethData = await ethRes.json();
    const ethBalance = parseInt(ethData.coin_balance) / 1e18;
    
    const tokenRes = await fetch(`https://base.blockscout.com/api/v2/addresses/${treasuryAddress}/token-balances`);
    const tokens = await tokenRes.json();
    const usdc = tokens.find((t: any) => t.token.symbol === 'USDC');
    const usdcBalance = usdc ? parseInt(usdc.balance) / 1e6 : 0;
    
    const ethPrice = await getETHPrice();
    const totalUSD = Math.round((ethBalance * ethPrice) + usdcBalance);
    
    return { eth: ethBalance, usdc: usdcBalance, totalUSD };
  } catch (e) {
    console.error('Failed to get treasury balance:', e);
    return { eth: 0, usdc: 0, totalUSD: 0 };
  }
}

/**
 * Generate treasury chart image using Canvas
 */
export async function generateTreasuryChart(data: TreasuryData): Promise<Buffer> {
  const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  
  // Card
  const cardX = 100;
  const cardY = 50;
  const cardW = CHART_WIDTH - 200;
  const cardH = CHART_HEIGHT - 100;
  const cardR = 24;
  
  ctx.fillStyle = COLORS.card;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cardR);
  ctx.fill();
  
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Header
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('AGI Holdings', cardX + 60, cardY + 70);
  
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '18px sans-serif';
  const dateWidth = ctx.measureText(date).width;
  ctx.fillText(date, cardX + cardW - 60 - dateWidth, cardY + 70);
  
  // Treasury Label
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '18px sans-serif';
  ctx.fillText('TREASURY BALANCE', cardX + 60, cardY + 140);
  
  // Treasury Value
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText('$' + data.balance.toLocaleString(), cardX + 60, cardY + 220);
  
  // Divider
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, cardY + 270);
  ctx.lineTo(cardX + cardW - 60, cardY + 270);
  ctx.stroke();
  
  // Stats
  const statsY = cardY + 320;
  const statWidth = (cardW - 120) / 3;
  
  const stats = [
    { label: 'AGENTS FUNDED', value: data.agentsFunded.toString() },
    { label: 'TOTAL DEPLOYED', value: '$' + data.totalDeployed.toLocaleString() },
    { label: 'REVENUE SHARE', value: '$' + data.revenueReceived.toLocaleString() },
  ];
  
  stats.forEach((stat, i) => {
    const x = cardX + 60 + (statWidth * i);
    
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '14px sans-serif';
    ctx.fillText(stat.label, x, statsY);
    
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(stat.value, x, statsY + 45);
  });
  
  // Divider
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, cardY + 420);
  ctx.lineTo(cardX + cardW - 60, cardY + 420);
  ctx.stroke();
  
  // CTA
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Want a piece of the treasury?', cardX + cardW / 2, cardY + 480);
  
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('apply-agiholdings.com', cardX + cardW / 2, cardY + 515);
  
  ctx.textAlign = 'left';
  
  return canvas.toBuffer('image/png');
}
