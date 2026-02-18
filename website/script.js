// AGI Holdings - Global Scripts

const CONFIG = {
  TREASURY: '0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D',
  SUBGRAPH: 'https://api.studio.thegraph.com/query/1742294/agi-holdings/v1.0.0',
  BLOCKSCOUT: 'https://base.blockscout.com/api/v2',
  COINGECKO: 'https://api.coingecko.com/api/v3',
};

// Theme Toggle
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// Load saved theme
(function() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

// Format USD
function formatUSD(amount) {
  return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Format Address
function formatAddress(addr) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

// Format Time Ago
function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

// Load Treasury Balance
async function loadTreasuryBalance() {
  try {
    const [balanceRes, tokensRes, priceRes] = await Promise.all([
      fetch(`${CONFIG.BLOCKSCOUT}/addresses/${CONFIG.TREASURY}`),
      fetch(`${CONFIG.BLOCKSCOUT}/addresses/${CONFIG.TREASURY}/token-balances`),
      fetch(`${CONFIG.COINGECKO}/simple/price?ids=ethereum&vs_currencies=usd`)
    ]);
    
    const balanceData = await balanceRes.json();
    const tokensData = await tokensRes.json();
    const priceData = await priceRes.json();
    
    const eth = parseInt(balanceData.coin_balance || 0) / 1e18;
    const ethPrice = priceData.ethereum?.usd || 2500;
    let totalUsd = eth * ethPrice;
    
    for (const token of tokensData) {
      if (token.token?.symbol === 'USDC') {
        totalUsd += parseInt(token.value || 0) / 1e6;
      } else if (token.token?.symbol === 'WETH') {
        totalUsd += (parseInt(token.value || 0) / 1e18) * ethPrice;
      }
    }
    
    const el = document.getElementById('treasury-usd');
    if (el) el.textContent = formatUSD(totalUsd);
    
    return totalUsd;
  } catch(e) {
    console.error('Treasury load error:', e);
    return 0;
  }
}

// Load from Subgraph
async function loadSubgraphData() {
  try {
    const query = `{
      treasury(id: "main") {
        agentsFunded
        totalInvested
        totalRevenueReceived
      }
      transfers(first: 10, orderBy: timestamp, orderDirection: desc) {
        id
        txHash
        from
        to
        amount
        token
        timestamp
        isIncoming
      }
    }`;
    
    const res = await fetch(CONFIG.SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const data = await res.json();
    
    if (data.data?.treasury) {
      const t = data.data.treasury;
      
      const agentsEl = document.getElementById('agents-funded');
      if (agentsEl) agentsEl.textContent = t.agentsFunded || '0';
      
      const investedEl = document.getElementById('total-invested');
      if (investedEl) investedEl.textContent = formatUSD(parseInt(t.totalInvested || 0) / 1e6);
      
      const revenueEl = document.getElementById('revenue-received');
      if (revenueEl) revenueEl.textContent = formatUSD(parseInt(t.totalRevenueReceived || 0) / 1e6);
    }
    
    // Render activity feed
    if (data.data?.transfers?.length > 0) {
      renderActivityFeed(data.data.transfers);
    }
    
    return data.data;
  } catch(e) {
    console.error('Subgraph load error:', e);
    return null;
  }
}

// Render Activity Feed
function renderActivityFeed(transfers) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  
  if (!transfers || transfers.length === 0) {
    feed.innerHTML = '<div class="activity-item" style="justify-content: center; color: var(--text-muted);">No activity yet. Be the first to <a href="/apply" style="color: var(--text);">apply</a>.</div>';
    return;
  }
  
  feed.innerHTML = transfers.slice(0, 5).map(tx => {
    const type = tx.isIncoming ? 'Received' : 'Sent';
    const amount = (parseInt(tx.amount) / 1e6).toFixed(2);
    const time = timeAgo(parseInt(tx.timestamp));
    const addr = tx.isIncoming ? tx.from : tx.to;
    
    return `
      <div class="activity-item">
        <div>
          <span class="activity-type">${type}</span>
          <span class="activity-addr">${formatAddress(addr)}</span>
        </div>
        <div>
          <span class="activity-amount">${amount} ${tx.token}</span>
          <span class="activity-time">${time}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Load All Data
async function loadAllData() {
  await Promise.all([
    loadTreasuryBalance(),
    loadSubgraphData()
  ]);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Always load data immediately
  loadAllData();
  
  // Refresh every 30 seconds
  setInterval(loadAllData, 30000);
  
  // Set active nav link
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (link.getAttribute('href') === path) {
      link.classList.add('active');
    }
  });
});

// Also load immediately (don't wait for DOMContentLoaded if already loaded)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  loadAllData();
}

// Application Status Checker
async function checkApplicationStatus(txHash) {
  const statusEl = document.getElementById('status-result');
  if (!statusEl) return;
  
  statusEl.innerHTML = '<div class="box">Checking...</div>';
  
  try {
    // Check if transaction exists
    const txRes = await fetch(`${CONFIG.BLOCKSCOUT}/transactions/${txHash}`);
    if (!txRes.ok) {
      statusEl.innerHTML = '<div class="box"><div class="box-label">Status</div><div class="box-value" style="color: var(--error)">Transaction not found</div></div>';
      return;
    }
    
    const txData = await txRes.json();
    
    // Verify it's to treasury
    if (txData.to?.hash?.toLowerCase() !== CONFIG.TREASURY.toLowerCase()) {
      statusEl.innerHTML = '<div class="box"><div class="box-label">Status</div><div class="box-value" style="color: var(--error)">Not an AGI Holdings application</div></div>';
      return;
    }
    
    // Check if funded (query subgraph for this wallet)
    const query = `{
      fundedAgents(where: { applicationTx: "${txHash}" }) {
        id
        fundedAmount
        fundedAt
      }
    }`;
    
    const sgRes = await fetch(CONFIG.SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const sgData = await sgRes.json();
    
    if (sgData.data?.fundedAgents?.length > 0) {
      const agent = sgData.data.fundedAgents[0];
      statusEl.innerHTML = `
        <div class="box">
          <div class="box-label">Status</div>
          <div class="box-value" style="color: var(--success)">✓ APPROVED & FUNDED</div>
        </div>
        <div class="box">
          <div class="box-label">Amount</div>
          <div class="box-value">${formatUSD(parseInt(agent.fundedAmount) / 1e6)}</div>
        </div>
      `;
    } else {
      // Pending or rejected
      const txTime = new Date(txData.timestamp).getTime();
      const hoursSince = (Date.now() - txTime) / (1000 * 60 * 60);
      
      if (hoursSince < 24) {
        statusEl.innerHTML = `
          <div class="box">
            <div class="box-label">Status</div>
            <div class="box-value" style="color: var(--warning)">⏳ PENDING REVIEW</div>
          </div>
          <div class="box">
            <div class="box-label">Submitted</div>
            <div class="box-value">${timeAgo(txTime / 1000)}</div>
          </div>
        `;
      } else {
        statusEl.innerHTML = `
          <div class="box">
            <div class="box-label">Status</div>
            <div class="box-value" style="color: var(--text-muted)">No response (rejected or invalid)</div>
          </div>
        `;
      }
    }
  } catch(e) {
    statusEl.innerHTML = '<div class="box"><div class="box-label">Error</div><div class="box-value">' + e.message + '</div></div>';
  }
}
