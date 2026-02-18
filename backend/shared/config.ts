// AGI Holdings Backend Configuration

export const CONFIG = {
  // Wallets
  TREASURY_ADDRESS: '0xC2f123B6C04e7950C882DF2C90e9C79ea176C91D',
  MASTER_ADDRESS: '0xF9b19141aA38C77086468e95CA435332b3e51e77',
  BANKR_WALLET: '0x6e58ab81a36ce48250a6162d2a28ad852d48397d', // Ignore for revenue
  
  // Wallets to NEVER treat as revenue (fees, internal transfers, etc.)
  IGNORED_WALLETS: [
    '0x6e58ab81a36ce48250a6162d2a28ad852d48397d', // Bankr - sends fees
    '0xF9b19141aA38C77086468e95CA435332b3e51e77', // Master wallet
  ],
  
  // Token addresses on Base
  USDC_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WETH_ADDRESS: '0x4200000000000000000000000000000000000006',
  AGI_TOKEN: '0xA301f1d1960eD03B42CC0093324595f4b0b11ba3',
  
  // Chain
  CHAIN_ID: 8453,
  RPC_URL: 'https://mainnet.base.org',
  
  // Application
  APPLICATION_FEE: '0.001', // ETH
  MIN_FUNDING_AMOUNT: 100, // USDC
  MAX_FUNDING_AMOUNT: 1000, // USDC
  
  // Timing
  SCANNER_INTERVAL_MS: 60_000, // 1 minute
  EVALUATOR_TIMEOUT_MS: 300_000, // 5 minutes
  
  // The Graph
  SUBGRAPH_URL: 'https://api.studio.thegraph.com/query/1742294/agi-holdings/v1.0.0',
  
  // APIs
  BLOCKSCOUT_API: 'https://base.blockscout.com/api/v2',
  COINGECKO_API: 'https://api.coingecko.com/api/v3',
  
  // Social
  TWITTER_HANDLE: '@AGIHoldings',
  EMAIL: 'agiholdingsx@gmail.com',
} as const;

export type Application = {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  applicantWallet: string;
  data: {
    agent: string;
    wallet: string;
    description: string;
    revenue_model: string;
    twitter: string;
    github?: string;
    website?: string;
  };
};

export type EvaluationResult = {
  applicationId: string;
  decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO';
  confidence: number; // 0-100
  fundingAmount?: number;
  revenueSharePercent?: number;
  reasoning: string;
  researchNotes: {
    twitter: string;
    github?: string;
    product?: string;
    concerns: string[];
    strengths: string[];
  };
  questions?: string[];
};

export type FundedAgent = {
  id: string;
  wallet: string;
  name: string;
  twitter: string;
  fundedAmount: number;
  fundedAt: number;
  revenueSharePercent: number;
  totalRevenuePaid: number;
  lastPayment?: number;
  status: 'active' | 'delinquent' | 'blacklisted';
};
