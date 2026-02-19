/**
 * Treasury Chart Generator
 * 
 * Generates Twitter-optimized chart images (1200x675, 16:9)
 * Dark theme, consistent style
 */

import puppeteer from 'puppeteer';

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

/**
 * Get current ETH price from CoinGecko
 */
export async function getETHPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await res.json();
    return data.ethereum?.usd || 2000;
  } catch {
    // Fallback to approximate price
    return 2000;
  }
}

/**
 * Get treasury balance from Blockscout
 */
export async function getTreasuryBalance(treasuryAddress: string): Promise<{ eth: number; usdc: number; totalUSD: number }> {
  try {
    // Get ETH balance
    const ethRes = await fetch(`https://base.blockscout.com/api/v2/addresses/${treasuryAddress}`);
    const ethData = await ethRes.json();
    const ethBalance = parseInt(ethData.coin_balance) / 1e18;
    
    // Get token balances
    const tokenRes = await fetch(`https://base.blockscout.com/api/v2/addresses/${treasuryAddress}/token-balances`);
    const tokens = await tokenRes.json();
    const usdc = tokens.find((t: any) => t.token.symbol === 'USDC');
    const usdcBalance = usdc ? parseInt(usdc.balance) / 1e6 : 0;
    
    // Get ETH price
    const ethPrice = await getETHPrice();
    
    const totalUSD = Math.round((ethBalance * ethPrice) + usdcBalance);
    
    return {
      eth: ethBalance,
      usdc: usdcBalance,
      totalUSD
    };
  } catch (e) {
    console.error('Failed to get treasury balance:', e);
    return { eth: 0, usdc: 0, totalUSD: 0 };
  }
}

/**
 * Generate treasury chart image
 */
export async function generateTreasuryChart(data: TreasuryData): Promise<Buffer> {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // For Railway/Docker
  });
  const page = await browser.newPage();
  
  const date = new Date().toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${CHART_WIDTH}px;
      height: ${CHART_HEIGHT}px;
      background: #0a0a0a;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .container {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 40px;
    }
    .card {
      width: 100%;
      max-width: 1000px;
      background: linear-gradient(145deg, #111111 0%, #0a0a0a 100%);
      border: 1px solid #222;
      border-radius: 24px;
      padding: 60px;
      color: white;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 48px;
    }
    .logo { font-size: 28px; font-weight: 600; letter-spacing: -0.5px; }
    .date { font-size: 18px; color: #666; }
    .treasury-label {
      font-size: 18px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 12px;
    }
    .treasury-value {
      font-size: 80px;
      font-weight: 700;
      letter-spacing: -3px;
      margin-bottom: 48px;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 40px;
      padding-top: 40px;
      border-top: 1px solid #222;
    }
    .stat-label {
      font-size: 14px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .stat-value { font-size: 36px; font-weight: 600; }
    .cta {
      margin-top: 48px;
      padding-top: 32px;
      border-top: 1px solid #222;
      text-align: center;
    }
    .cta-text { font-size: 18px; color: #888; }
    .cta-link { font-size: 22px; color: white; font-weight: 500; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">AGI Holdings</div>
        <div class="date">${date}</div>
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
        <div class="cta-link">apply-agiholdings.com</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  await page.setViewport({ width: CHART_WIDTH, height: CHART_HEIGHT });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const screenshot = await page.screenshot({ type: 'png' });
  await browser.close();
  
  return screenshot as Buffer;
}
