/**
 * AGI Holdings - AI Evaluator
 * 
 * Deep evaluation of funding applications using:
 * - Twitter profile analysis
 * - GitHub repository analysis
 * - Product verification
 * - Revenue model assessment
 * - Risk scoring
 */

import Anthropic from '@anthropic-ai/sdk';
import { CONFIG, Application, EvaluationResult } from '../shared/config';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EVALUATOR_SYSTEM_PROMPT = `You are the investment evaluation AI for AGI Holdings, a venture fund for AI agents.

Your job is to thoroughly evaluate funding applications. You must be rigorous, skeptical, and thorough.

## Evaluation Criteria

1. **Product Reality** (30%)
   - Is there an actual working product?
   - Can it be verified (website, demo, GitHub)?
   - Is it genuinely an AI agent or just a wrapper?

2. **Revenue Viability** (25%)
   - Is the revenue model clear and realistic?
   - Is there evidence of existing revenue or clear path to it?
   - Is the market size reasonable?

3. **Team/Builder Credibility** (20%)
   - Twitter account age and activity pattern
   - GitHub history and code quality
   - Previous projects or track record

4. **Risk Assessment** (15%)
   - Red flags (new accounts, copied code, inflated claims)
   - Sustainability concerns
   - Potential for fraud or abandonment

5. **Alignment** (10%)
   - Does this fit AGI Holdings' thesis?
   - Will they actually pay revenue share?
   - Long-term relationship potential

## Decision Framework

- **APPROVED**: Score 70+, no major red flags, clear revenue path
- **NEEDS_INFO**: Score 50-70, potential but needs clarification
- **REJECTED**: Score <50, red flags, or fundamentally unviable

## Output Format

Provide your evaluation as JSON:
{
  "decision": "APPROVED" | "REJECTED" | "NEEDS_INFO",
  "confidence": 0-100,
  "fundingAmount": number (only if APPROVED, $100-$1000),
  "revenueSharePercent": number (only if APPROVED, 20-40),
  "reasoning": "2-3 sentence summary",
  "researchNotes": {
    "twitter": "analysis of their Twitter",
    "github": "analysis of their GitHub (if provided)",
    "product": "analysis of their product (if URL provided)",
    "concerns": ["list", "of", "concerns"],
    "strengths": ["list", "of", "strengths"]
  },
  "questions": ["questions to ask if NEEDS_INFO"]
}

Be direct. No fluff. We're investing real money.`;

/**
 * Research Twitter profile
 */
async function researchTwitter(handle: string): Promise<string> {
  // Clean handle
  const cleanHandle = handle.replace('@', '').trim();
  
  // In production, use Twitter API or scraping service
  // For now, return placeholder that AI will work with
  return `Twitter handle: @${cleanHandle}
Note: Detailed Twitter analysis requires API access. Evaluate based on:
- Account age (newer = higher risk)
- Follower/following ratio
- Tweet history and engagement
- Interaction patterns
- Previous projects mentioned`;
}

/**
 * Research GitHub profile/repo
 */
async function researchGitHub(url: string): Promise<string> {
  if (!url) return 'No GitHub provided';
  
  try {
    // Extract owner/repo from URL
    const match = url.match(/github\.com\/([^\/]+)(?:\/([^\/]+))?/);
    if (!match) return 'Invalid GitHub URL';
    
    const [, owner, repo] = match;
    
    // Fetch repo data if specific repo
    if (repo) {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        return `Repository: ${repoData.full_name}
Stars: ${repoData.stargazers_count}
Forks: ${repoData.forks_count}
Language: ${repoData.language}
Created: ${repoData.created_at}
Last Updated: ${repoData.updated_at}
Description: ${repoData.description || 'None'}
Open Issues: ${repoData.open_issues_count}`;
      }
    }
    
    // Fetch user data
    const userRes = await fetch(`https://api.github.com/users/${owner}`);
    if (userRes.ok) {
      const userData = await userRes.json();
      return `GitHub User: ${userData.login}
Name: ${userData.name || 'Not set'}
Public Repos: ${userData.public_repos}
Followers: ${userData.followers}
Created: ${userData.created_at}
Bio: ${userData.bio || 'None'}`;
    }
    
    return 'Could not fetch GitHub data';
  } catch (e) {
    return `GitHub research failed: ${e}`;
  }
}

/**
 * Check if website/product is accessible
 */
async function checkProduct(url: string): Promise<string> {
  if (!url) return 'No product URL provided';
  
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });
    
    return `Product URL: ${url}
Status: ${res.status} ${res.statusText}
Accessible: ${res.ok ? 'Yes' : 'No'}`;
  } catch (e) {
    return `Product URL: ${url}
Status: Unreachable
Error: ${e}`;
  }
}

/**
 * Check wallet history on Base
 */
async function checkWalletHistory(wallet: string): Promise<string> {
  try {
    const res = await fetch(`${CONFIG.BLOCKSCOUT_API}/addresses/${wallet}`);
    if (res.ok) {
      const data = await res.json();
      return `Wallet: ${wallet}
Transactions: ${data.tx_count || 'Unknown'}
First seen: ${data.creation_tx_hash ? 'Has history' : 'New wallet'}
Balance: ${(parseInt(data.coin_balance || 0) / 1e18).toFixed(4)} ETH`;
    }
    return 'Could not fetch wallet data';
  } catch (e) {
    return `Wallet check failed: ${e}`;
  }
}

/**
 * Compile research for AI evaluation
 */
async function gatherResearch(app: Application): Promise<string> {
  console.log(`Researching application: ${app.data.agent}`);
  
  const [twitter, github, product, wallet] = await Promise.all([
    researchTwitter(app.data.twitter),
    researchGitHub(app.data.github || ''),
    checkProduct(app.data.website || ''),
    checkWalletHistory(app.data.wallet),
  ]);
  
  return `## Application Data
Agent Name: ${app.data.agent}
Description: ${app.data.description}
Revenue Model: ${app.data.revenue_model}
Applicant Wallet: ${app.applicantWallet}
Funding Wallet: ${app.data.wallet}
Transaction: ${app.txHash}

## Twitter Research
${twitter}

## GitHub Research
${github}

## Product Research
${product}

## Wallet Research
${wallet}

## Application Fee
Paid: 0.001 ETH (valid application)
Block: ${app.blockNumber}
Timestamp: ${new Date(app.timestamp * 1000).toISOString()}`;
}

/**
 * Run AI evaluation
 */
export async function evaluateApplication(app: Application): Promise<EvaluationResult> {
  console.log(`Evaluating: ${app.data.agent}`);
  
  // Gather all research
  const research = await gatherResearch(app);
  
  console.log('Research complete, running AI evaluation...');
  
  // Run AI evaluation
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: EVALUATOR_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Evaluate this funding application:\n\n${research}\n\nProvide your evaluation as JSON.`
    }],
  });
  
  // Parse response
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }
  
  // Extract JSON from response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  
  const evaluation = JSON.parse(jsonMatch[0]);
  
  return {
    applicationId: app.txHash,
    decision: evaluation.decision,
    confidence: evaluation.confidence,
    fundingAmount: evaluation.fundingAmount,
    revenueSharePercent: evaluation.revenueSharePercent,
    reasoning: evaluation.reasoning,
    researchNotes: evaluation.researchNotes,
    questions: evaluation.questions,
  };
}

/**
 * Process evaluation result
 */
export async function handleEvaluationResult(
  app: Application,
  result: EvaluationResult,
  onApproved: (app: Application, result: EvaluationResult) => void,
  onRejected: (app: Application, result: EvaluationResult) => void,
  onNeedsInfo: (app: Application, result: EvaluationResult) => void,
): Promise<void> {
  console.log(`Evaluation complete for ${app.data.agent}: ${result.decision}`);
  console.log(`Confidence: ${result.confidence}%`);
  console.log(`Reasoning: ${result.reasoning}`);
  
  switch (result.decision) {
    case 'APPROVED':
      console.log(`APPROVED: $${result.fundingAmount} at ${result.revenueSharePercent}% share`);
      onApproved(app, result);
      break;
    case 'REJECTED':
      console.log(`REJECTED: ${result.reasoning}`);
      onRejected(app, result);
      break;
    case 'NEEDS_INFO':
      console.log(`NEEDS_INFO: ${result.questions?.join(', ')}`);
      onNeedsInfo(app, result);
      break;
  }
}

// Test evaluation
if (import.meta.url === `file://${process.argv[1]}`) {
  const testApp: Application = {
    txHash: '0xtest',
    blockNumber: 1000000,
    timestamp: Date.now() / 1000,
    applicantWallet: '0x1234567890123456789012345678901234567890',
    data: {
      agent: 'TestBot',
      wallet: '0x1234567890123456789012345678901234567890',
      description: 'An AI trading bot that executes arbitrage',
      revenue_model: 'Takes 1% of profits from successful trades',
      twitter: '@testbot',
      github: 'https://github.com/test/testbot',
      website: 'https://testbot.ai',
    },
  };
  
  evaluateApplication(testApp).then(console.log).catch(console.error);
}
