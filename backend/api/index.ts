/**
 * AGI Holdings - API Server
 * 
 * Serves data that can't be on-chain:
 * - Rejections
 * - Application status
 * - Backend health
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CONFIG } from '../shared/config';

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = CONFIG.DATA_DIR;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get all rejections
app.get('/api/rejections', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'rejections.json'), 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

// Get funded agents
app.get('/api/funded-agents', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'funded-agents.json'), 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

// Check application status by TX hash
app.get('/api/application/:txHash', async (req, res) => {
  const { txHash } = req.params;
  
  try {
    // Check if rejected
    const rejectionsData = await fs.readFile(path.join(DATA_DIR, 'rejections.json'), 'utf-8').catch(() => '[]');
    const rejections = JSON.parse(rejectionsData);
    const rejection = rejections.find((r: any) => r.applicationId === txHash);
    
    if (rejection) {
      return res.json({
        status: 'REJECTED',
        timestamp: rejection.timestamp,
        reason: rejection.reason
      });
    }
    
    // Check if funded
    const fundedData = await fs.readFile(path.join(DATA_DIR, 'funded-agents.json'), 'utf-8').catch(() => '[]');
    const funded = JSON.parse(fundedData);
    const agent = funded.find((a: any) => a.id === txHash);
    
    if (agent) {
      return res.json({
        status: 'FUNDED',
        timestamp: agent.fundedAt,
        amount: agent.fundedAmount,
        wallet: agent.wallet
      });
    }
    
    // Check if in processing queue (pending)
    // For now, return unknown - could enhance with queue tracking
    return res.json({
      status: 'UNKNOWN',
      note: 'Application not found in our records. It may be pending or invalid.'
    });
    
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const fundedData = await fs.readFile(path.join(DATA_DIR, 'funded-agents.json'), 'utf-8').catch(() => '[]');
    const rejectionsData = await fs.readFile(path.join(DATA_DIR, 'rejections.json'), 'utf-8').catch(() => '[]');
    
    const funded = JSON.parse(fundedData);
    const rejections = JSON.parse(rejectionsData);
    
    const totalFunded = funded.reduce((sum: number, a: any) => sum + (a.fundedAmount || 0), 0);
    const totalRevenue = funded.reduce((sum: number, a: any) => sum + (a.totalRevenuePaid || 0), 0);
    
    res.json({
      agentsFunded: funded.length,
      totalInvested: totalFunded,
      totalRevenue: totalRevenue,
      totalRejections: rejections.length,
      lastUpdated: Date.now()
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export function startAPI(port: number = 3000): void {
  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
  });
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  startAPI(3000);
}
