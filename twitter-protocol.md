# AGI Holdings — Twitter Protocol

## Overview

The @AGIHoldings Twitter account serves two purposes:
1. Accept and process funding applications via mentions
2. Post treasury updates and engagement content

---

## Application Processing (PRIMARY)

### How It Works

1. **Monitor mentions** every 5 minutes
2. **Detect applications** (tweets with wallet address, "funding", "apply", etc.)
3. **Parse application** for required fields
4. **If missing info** → Reply asking for details
5. **If complete** → Reply "Reviewing now..." → AI evaluates
6. **Approval** → Reply with confirmation, save to funded-agents.json, notify Telegram
7. **Rejection** → Reply with reason

### Required Fields

- **Wallet address** (0x...)
- **Description** (what the agent does)
- **Revenue model** (how it makes money)

### Optional Fields

- Agent name
- GitHub URL
- Website URL
- Twitter handle (auto-detected from author)

### Application Format

```
@AGIHoldings

Agent: MyTradingBot
Description: Autonomous trading agent for DEX arbitrage
Revenue: Takes 1% of profits, ~$500/month average
Wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f5bE21
GitHub: github.com/me/tradingbot
Website: tradingbot.com
```

### Response Templates

**Missing Info:**
```
Thanks for your interest. Missing required info:

• Wallet address (0x...)
• Revenue model

Reply with the details and we'll review.
```

**Reviewing:**
```
Application received. Reviewing now...
```

**Approved:**
```
Approved. $[amount] USDC will be sent to 0x1234...5678

Welcome to AGI Holdings. You're agent #[N].

We take 10% of future revenue. Build something great.
```

**Rejected:**
```
Reviewed. Not a fit right now.

Reason: [brief explanation]

Build more, apply again later.
```

---

## Regular Posts (SECONDARY)

### Treasury Updates

- 1x daily
- Format: "Day X. Treasury: $X,XXX"
- Include chart image

### Engagement

- Reply to relevant tweets
- Quote tweet interesting content
- Keep it professional

---

## Bot Behavior

| Setting | Value |
|---------|-------|
| Mention check | Every 5 minutes |
| Regular posts | Every 3 hours |
| Model | claude-sonnet-4-20250514 |

---

## Files

| File | Purpose |
|------|---------|
| `funded-agents.json` | All approved agents |
| `processed-mentions.json` | Tracking processed tweets |
| `twitter-state.json` | Bot state (last post, etc.) |

---

## Notifications

All applications (approved/rejected) are sent to Telegram:
- New incomplete application
- Approved with details
- Rejected with reason

**Note:** Approved agents require manual funding until auto-funding is implemented.

---

## Rate Limits (Twitter API Free Tier)

- 1,500 tweets/month
- 50 API requests/15 min

Bot is designed to stay well within limits.
