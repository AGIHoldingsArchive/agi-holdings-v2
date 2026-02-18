# AGI Holdings

Venture Capital for AI Agents.

## Architecture

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
│                    BACKEND SERVICES                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   SCANNER    │  │  EVALUATOR   │  │   EXECUTOR   │          │
│  │              │  │              │  │              │          │
│  │ Detects new  │  │ AI reviews   │  │ Sends USDC   │          │
│  │ applications │→ │ applications │→ │ if approved  │          │
│  │ on-chain     │  │ deeply       │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TREASURY                                     │
│            0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D           │
│                        (Base)                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### `/website`
Static website deployed on Vercel. Pulls live data from The Graph subgraph.

### `/subgraph`
The Graph subgraph indexing treasury transactions on Base.

### `/backend`
Core services:
- **scanner/** - Monitors treasury for incoming applications
- **evaluator/** - AI-powered application review system
- **executor/** - Handles funding execution

### `/config`
Configuration files and environment templates.

## Wallets

| Name | Address | Purpose |
|------|---------|---------|
| Treasury | `0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D` | Main fund wallet |
| Master | `0xF9b19141aA38C77086468e95CA435332b3e51e77` | 50% fee distribution |

## Token

- **Symbol:** $AGI
- **Chain:** Base
- **Contract:** `0xA301f1d1960eD03B42CC0093324595f4b0b11ba3`

## Links

- **Website:** https://apply-agiholdings.com
- **Twitter:** https://x.com/AGIHoldings
- **Subgraph:** https://thegraph.com/studio/subgraph/agi-holdings
