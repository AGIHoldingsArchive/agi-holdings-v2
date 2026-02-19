# AGI HOLDINGS — COMPLETE SYSTEM STATE

*Letzte Aktualisierung: 2026-02-19 11:05 UTC+4*

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

### Subgraph (The Graph)
| Key | Value |
|-----|-------|
| Studio | https://thegraph.com/studio/subgraph/agi-holdings |
| API | `https://api.studio.thegraph.com/query/1742294/agi-holdings/v1.1.0` |
| Status | ✅ LIVE, syncing |

### Backend
| Key | Value |
|-----|-------|
| Host | Railway (24/7) |
| Components | Scanner, Evaluator, Executor, API, **Twitter Bot** |
| Repo | `agi-holdings-v2/backend/` |
| Status | ✅ LIVE |
| Run All | `npm run all` (starts main + twitter bot) |

### Twitter Bot
| Key | Value |
|-----|-------|
| Code | `backend/twitter-bot/index.ts` |
| Run | `npm run twitter` |
| Posts | 8/day (every 3h) |
| Outreach | 48/day (2/hour) |
| State | `twitter-state.json` |
| Protocol | `twitter-protocol.md` |

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
| Purpose | Main fund, receives applications, sends funding |
| Explorer | https://basescan.org/address/0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D |

### Master Wallet (50% Revenue)
| Key | Value |
|-----|-------|
| Address | `0x8973736051bB1D2fA23aD62A4B0885546fc265A3` |
| Purpose | Receives 50% of ALL revenue immediately |
| Rule | NEVER SKIP, NEVER DELAY, NEVER DIFFERENT WALLET |

### Bankr Wallet (Agent Operations)
| Key | Value |
|-----|-------|
| Address | `0x6e58ab81a36ce48250a6162d2a28ad852d48397d` |
| Purpose | Agent operational wallet |

---

## 🪙 TOKEN

| Key | Value |
|-----|-------|
| Name | AGI Holdings |
| Symbol | $AGI |
| Chain | Base |
| Contract | `0xA301f1d1960eD03B42CC0093324595f4b0b11ba3` |
| Doppler | https://app.doppler.lol/tokens/base/0xA301f1d1960eD03B42CC0093324595f4b0b11ba3 |

---

## 🐦 TWITTER

### Accounts
| Account | Purpose |
|---------|---------|
| @AGIHoldings | Main agent account (automated) |
| @AGIHoldingsCEO | Master's account (manual, for complex questions) |

### Current State
| Key | Value |
|-----|-------|
| Day Counter | Day 2 (started 2026-02-18) |
| Last Treasury Post | — |
| Posts Today | 0 |
| Outreach Today | 0 |
| State File | `twitter-state.json` |
| Protocol | `twitter-protocol.md` |

---

## 📊 POSTING SCHEDULE

### Daily Posts (8 total)
| Type | Frequency | Last Posted |
|------|-----------|-------------|
| Treasury Update + Chart | 1x/day | — |
| Educational/Brand | 2-3x/day | — |
| Investment Announcements | On event | — |
| Filler/Engagement | Rest | — |

### Outreach
| Key | Value |
|-----|-------|
| Target | 48 comments/day |
| Rate | 2 per hour |
| Last Comment | — |

---

## 💼 PORTFOLIO

### Funded Agents
| Agent | Date | Amount | Status |
|-------|------|--------|--------|
| — | — | — | — |

*Wird bei jedem Investment aktualisiert*

### Pending Applications
| Agent | Received | Status |
|-------|----------|--------|
| — | — | — |

---

## 📈 METRICS

### Treasury
| Metric | Value | Updated |
|--------|-------|---------|
| Balance (USDC) | — | — |
| Total Deployed | — | — |
| Revenue Received | — | — |

### Social
| Metric | Value | Updated |
|--------|-------|---------|
| Followers | — | — |
| Total Posts | — | — |

---

## 🔄 LAST ACTIONS

| Timestamp | Action | Details |
|-----------|--------|---------|
| 2026-02-19 10:59 | System State Created | Initial setup |

---

## ⏭️ NEXT SCHEDULED

| Time | Action |
|------|--------|
| — | Treasury Post (Day 2) |
| — | First outreach batch |

---

## 🚨 RECOVERY INSTRUCTIONS

Falls System crashed / Keys leer / Neustart nötig:

1. **Lies diese Datei** — hat alles
2. **Check `twitter-state.json`** — wann war letzter Post?
3. **Check Subgraph** — aktueller Treasury Stand
4. **Resume** — nicht von vorne, sondern wo wir waren

---

## 📝 UPDATE LOG

| Date | Change |
|------|--------|
| 2026-02-19 | Initial system state created |
