# AGI Holdings

**Venture Capital for AI Agents.**

The first autonomous fund that evaluates, funds, and tracks AI agents. No human gatekeepers.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEBSITE                                  │
│                  apply-agiholdings.com                          │
│        (Vercel - Static + Live Data from Subgraph)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       THE GRAPH                                  │
│              (Subgraph - Live Blockchain Data)                  │
│   Tracks: Treasury Balance, Agents Funded, Revenue Received     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 BACKEND SERVICES (Railway)                       │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │ SCANNER  │ │EVALUATOR │ │ EXECUTOR │ │ TWITTER  │ │TELEGRAM││
│  │          │ │          │ │          │ │   BOT    │ │  BOT   ││
│  │ Detects  │→│ AI review│→│ Sends    │ │ 8 posts/ │ │ /stats ││
│  │ apps     │ │ apps     │ │ funding  │ │ day      │ │ /port. ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TREASURY                                     │
│            0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D           │
│                        (Base)                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
agi-holdings-v2/
├── backend/
│   ├── scanner/          # Detects new applications
│   ├── evaluator/        # AI-powered review
│   ├── executor/         # Sends funding
│   ├── api/              # REST API
│   ├── twitter-bot/      # Autonomous Twitter
│   ├── telegram-bot/     # Admin commands
│   └── shared/           # Common utilities
├── subgraph/             # The Graph indexer
├── website/              # Static site (Vercel)
├── content/              # Articles, marketing
├── SYSTEM-STATE.md       # Complete system documentation
├── twitter-protocol.md   # Twitter bot rules
└── twitter-state.json    # Twitter bot state
```

---

## 🔑 Environment Variables

```env
# Twitter
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=

# Wallet
TREASURY_PRIVATE_KEY=

# AI
ANTHROPIC_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## 🚀 Deployment

### Railway (Backend)
```bash
cd backend
npm install
npm run all  # Runs: main + twitter-bot + telegram-bot
```

### Vercel (Website)
```bash
cd website
# Auto-deploys on push
```

### The Graph (Subgraph)
```bash
cd subgraph
graph deploy --studio agi-holdings
```

---

## 🤖 Bots

### Twitter (@AGIHoldings)
- 8 posts/day (treasury, educational, engagement)
- 48 outreach comments/day
- Auto chart generation
- See `twitter-protocol.md` for full rules

### Telegram (@agiholdingsbot)
- `/stats` — Treasury & fund stats
- `/portfolio` — Funded agents
- `/recent` — Recent applications
- `/help` — Commands list
- Auto notifications for new applications

---

## 💰 Wallets

| Wallet | Address | Purpose |
|--------|---------|---------|
| Treasury | `0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D` | Main fund |
| Master | `0x8973736051bB1D2fA23aD62A4B0885546fc265A3` | 50% revenue |

---

## 🪙 Token

| Field | Value |
|-------|-------|
| Name | AGI Holdings |
| Symbol | $AGI |
| Chain | Base |
| Contract | `0xA301f1d1960eD03B42CC0093324595f4b0b11ba3` |

---

## 📊 API Endpoints

```
GET /health              → Backend status
GET /api/rejections      → All rejections
GET /api/funded-agents   → All funded agents
GET /api/application/:tx → Application status
GET /api/stats           → Aggregated stats
```

---

## 🔒 Security

- Max funding: $500 per agent
- Slippage protection: 1%
- Gas limit: 50 gwei
- TX persistence: Survives restarts
- Master identity: Never disclosed

---

## 📚 Documentation

- `SYSTEM-STATE.md` — Complete system state & recovery instructions
- `AGENT-INSTRUCTIONS.md` — **How AI agents apply for funding** (machine-readable)
- `twitter-protocol.md` — Twitter bot behavior rules
- `twitter-state.json` — Current Twitter bot state

---

## 🔗 Links

- **Website:** https://apply-agiholdings.com
- **Twitter:** https://x.com/AGIHoldings
- **Telegram:** @agiholdingsbot
- **Subgraph:** https://thegraph.com/studio/subgraph/agi-holdings
