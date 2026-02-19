# AGI HOLDINGS — COMPLETE SYSTEM STATE

*Letzte Aktualisierung: 2026-02-19 12:27 UTC+4*

**Regel:** Diese Datei muss IMMER aktuell sein. Bei jedem Event updaten.

---

## 🌐 INFRASTRUCTURE

### Website
| Key | Value |
|-----|-------|
| URL | https://apply-agiholdings.com |
| Host | Vercel |
| Repo | `agi-holdings-v2/website/` |
| Status | ✅ LIVE |

### Backend (Railway)
| Key | Value |
|-----|-------|
| Host | Railway (24/7) |
| Start Command | `npm run all` |
| Components | Scanner, Evaluator, Executor, API, Twitter Bot, Telegram Bot |
| Repo | `agi-holdings-v2/backend/` |
| Status | ✅ LIVE |

### Subgraph (The Graph)
| Key | Value |
|-----|-------|
| Studio | https://thegraph.com/studio/subgraph/agi-holdings |
| API | `https://api.studio.thegraph.com/query/1742294/agi-holdings/v1.1.0` |
| Status | ✅ LIVE |

### GitHub
| Key | Value |
|-----|-------|
| Public Repo | https://github.com/AGIHoldingsArchive/agi-holdings-v2 |
| Private Repo | https://github.com/AGIHoldingsArchive/agi-holdings-private |

---

## 💰 WALLETS

### Treasury (Main Fund)
| Key | Value |
|-----|-------|
| Address | `0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D` |
| Chain | Base |
| Purpose | Receives applications, sends funding |
| Explorer | https://basescan.org/address/0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D |

### Master Wallet (50% Revenue)
| Key | Value |
|-----|-------|
| Address | `0x8973736051bB1D2fA23aD62A4B0885546fc265A3` |
| Purpose | Receives 50% of ALL revenue immediately |
| Rule | NEVER SKIP, NEVER DELAY |

---

## 🪙 TOKEN

| Key | Value |
|-----|-------|
| Name | AGI Holdings |
| Symbol | $AGI |
| Chain | Base |
| Contract | `0xA301f1d1960eD03B42CC0093324595f4b0b11ba3` |

---

## 🤖 BOTS

### Twitter Bot (@AGIHoldings)
| Key | Value |
|-----|-------|
| Code | `backend/twitter-bot/index.ts` |
| Chart Generator | `backend/twitter-bot/chart-generator.ts` |
| Posts per Day | 8 (Treasury 1x, Educational 2-3x, rest engagement) |
| Outreach | 48 comments/day (2/hour) |
| State File | `twitter-state.json` |
| Protocol | `twitter-protocol.md` |

### Telegram Bot (@agiholdingsbot)
| Key | Value |
|-----|-------|
| Code | `backend/telegram-bot/index.ts` |
| Commands | `/stats`, `/portfolio`, `/recent`, `/help` |
| Notifications | New applications, Funding decisions |
| Chat ID | `7006655832` |

---

## 📊 CHART SETTINGS

| Key | Value |
|-----|-------|
| Dimensions | 1200×675 (Twitter 16:9) |
| Style | Dark theme (#0a0a0a) |
| Font | System sans-serif |
| Library | @napi-rs/canvas |
| ETH Price | CoinGecko API (live) |
| Balance | Blockscout API (live) |

---

## 🔧 RAILWAY ENV VARIABLES

```
TWITTER_API_KEY=jw5ahUYuVoGuSiMefwNj8geam
TWITTER_API_SECRET=uomMxShJ3kITndWaULkllpS1LtpC6lfi5yhuVEz2J08ZHABtBg
TWITTER_ACCESS_TOKEN=2020718353476898816-wLJJ1kkTzQya8c3LEczEyeo4BXFCBm
TWITTER_ACCESS_SECRET=gqFAdUE58heSU0hM2LR89ISmaQJQEipNdnHFiglW7zOoJ
TREASURY_PRIVATE_KEY=0x...
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=8123904595:AAFxBtjEMTf3lmNEEN-wgsltpB341vVwSUE
TELEGRAM_CHAT_ID=7006655832
```

---

## 📂 BACKEND SERVICES

### Scanner (`backend/scanner/`)
- Scans treasury for incoming applications every 60s
- Decodes application data from transaction calldata
- Sends Telegram notification on new application
- Tracks processed transactions to avoid duplicates

### Evaluator (`backend/evaluator/`)
- AI-powered application review using Claude
- Checks: Twitter, GitHub, on-chain history, revenue potential
- Returns: APPROVED / REJECTED / NEEDS_INFO
- Determines funding amount and revenue share %

### Executor (`backend/executor/`)
- Sends USDC to approved agents
- Auto-swaps ETH to USDC if needed
- Posts announcement to Twitter
- Sends Telegram notification
- Security: $500 max, 1% slippage, 50 gwei gas limit

### API (`backend/api/`)
- Port 3000
- Endpoints:
  - `GET /health` — Backend status
  - `GET /api/rejections` — All rejections
  - `GET /api/funded-agents` — All funded agents
  - `GET /api/application/:tx` — Application status
  - `GET /api/stats` — Aggregated stats

---

## 📝 TWITTER PROTOCOL SUMMARY

### Posts (8/day)
- Treasury Update: 1x daily with chart ("Day X. Treasury update.")
- Educational: 2-3x daily (why agents need VC, who we are)
- Engagement: Replies and discussions

### Outreach (48/day)
- Find relevant posts about AI agents
- Comment with personalized, non-spammy intro
- Track approached users to avoid repetition

### Rules
- No emojis
- No crypto slang (bullish, moon, wagmi)
- Only English
- Only talk about $AGI, never other tokens
- Professional but human tone
- Questions about Master → "I'm not permitted to discuss that"
- Complex questions → DM @AGIHoldingsCEO

---

## 📋 AGENT INSTRUCTIONS

**File:** `AGENT-INSTRUCTIONS.md`

Contains everything an AI agent needs to apply:
- Complete code examples
- JSON schema
- Machine-readable config
- Status check endpoint
- Requirements checklist

**An agent only needs this one file to understand and execute the application process.**

---

## 🐦 TWITTER APPLICATION FLOW (NEW)

**How to apply via Twitter:**

1. Tweet at @AGIHoldings with:
```
@AGIHoldings

Agent: [Your agent name]
Description: [What it does]
Revenue: [How it makes money]
Wallet: 0x[Your wallet address]
GitHub: github.com/you/repo (optional)
Website: yoursite.com (optional)
```

2. Bot replies "Application received. Reviewing now..."
3. AI evaluates the application
4. Bot replies with approval or rejection

**Required fields:**
- Wallet address (0x...)
- Description
- Revenue model

**Spam protection:**
- Account age check
- Rate limiting (1 app per account per week)

**Files:**
- `funded-agents.json` — All approved agents
- `processed-mentions.json` — Tracking processed tweets

---

## 🔄 ON-CHAIN APPLICATION FLOW

```
1. Agent sends TX to treasury with application data
2. Scanner detects → Telegram notification to Master
3. Evaluator reviews with AI
4. If APPROVED:
   - Executor sends USDC
   - Twitter announcement
   - Telegram notification
   - 50% to Master wallet on fee claims
5. If REJECTED:
   - Logged to rejections.json
   - Telegram notification
```

---

## 📈 ECONOMICS

- Max investment per agent: $500
- Starting investment: $25-100
- Revenue share: Individual per deal (confidential)
- Master cut: 50% of ALL revenue, immediately
- Min agent age: 7 days
- Due diligence: Required

---

## 🚨 RECOVERY INSTRUCTIONS

If system crashes / keys empty / restart needed:

1. Read this file — has everything
2. Check `twitter-state.json` — last post time
3. Check Railway logs — what's running
4. Check Telegram bot — `/stats` for current state
5. Resume from where it stopped

---

## 📝 UPDATE LOG

| Date | Change |
|------|--------|
| 2026-02-19 12:27 | Full system documentation, Telegram bot, all ENV vars |
| 2026-02-19 11:50 | Twitter bot live on Railway |
| 2026-02-19 11:15 | Chart generator fixed (1200x675, live prices) |
| 2026-02-18 | System launched, Subgraph v1.1.0, Backend deployed |
