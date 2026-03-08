#!/usr/bin/env node

/**
 * Convertra MCP Server
 *
 * Exposes Convertra's ad performance metrics and AI analysis as tools
 * for Claude Code. Calls the deployed Convertra API — no direct DB access.
 *
 * Environment variables:
 *   CONVERTRA_API_URL — e.g., https://www.convertraiq.com
 *   CONVERTRA_API_KEY — same value as EXTERNAL_REPORT_API_KEY in Vercel
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = process.env.CONVERTRA_API_URL || 'https://www.convertraiq.com';
const API_KEY = process.env.CONVERTRA_API_KEY || '';

// ─── In-memory cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  data: Record<string, unknown>;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key: string): Record<string, unknown> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── API Client ──────────────────────────────────────────────────────────────

async function callApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resp = await fetch(`${API_URL}/api/meta/external-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(`API error (${resp.status}): ${(error as Record<string, string>).error || resp.statusText}`);
  }

  const result = await resp.json() as Record<string, unknown>;
  if (!(result as { success?: boolean }).success) {
    throw new Error(`API returned error: ${(result as { error?: string }).error || 'Unknown error'}`);
  }
  return (result as { data: Record<string, unknown> }).data;
}

async function getAnalysisData(
  dateRange: string,
  adAccountId?: string,
): Promise<Record<string, unknown>> {
  const cacheKey = `analysis:${adAccountId || 'default'}:${dateRange}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await callApi({
    date_range: dateRange,
    ad_account_id: adAccountId || null,
    include_comparison: true,
    include_analysis: true,
  });

  setCache(cacheKey, data);
  return data;
}

// ─── MCP Server Setup ────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'convertra',
  version: '1.0.0',
});

// ─── Tool: get_metrics ───────────────────────────────────────────────────────

server.tool(
  'get_metrics',
  'Get ad performance metrics for a date range. Fast (5-8s). Returns metrics like ROAS, spend, conversions, CPA, etc. with optional period-over-period comparison.',
  {
    date_range: z.enum(['today', 'yesterday', 'last_7d', 'last_30d', 'this_month'])
      .describe('Date range for metrics'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID (e.g., act_123456789). Omit for default/aggregate.'),
    include_comparison: z.boolean().default(true)
      .describe('Include previous period comparison with delta percentages'),
  },
  async ({ date_range, ad_account_id, include_comparison }) => {
    const data = await callApi({
      date_range,
      ad_account_id: ad_account_id || null,
      include_comparison,
      include_analysis: false,
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    };
  },
);

// ─── Tool: get_analysis ──────────────────────────────────────────────────────

server.tool(
  'get_analysis',
  'Get AI-powered channel analysis with creative insights. SLOW (30-45s) and costs AI tokens. Results are cached for 10 minutes. Returns executive summary, health score, winning/losing patterns, recommendations, and top/bottom ad breakdowns.',
  {
    date_range: z.enum(['last_7d', 'last_30d'])
      .describe('Date range for analysis'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID. Omit for default.'),
  },
  async ({ date_range, ad_account_id }) => {
    const data = await getAnalysisData(date_range, ad_account_id);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    };
  },
);

// ─── Tool: get_top_ads ───────────────────────────────────────────────────────

server.tool(
  'get_top_ads',
  'Get top performing ads with explanations of why they work. Uses cached analysis if available (otherwise triggers AI analysis — costs tokens, 30-45s).',
  {
    date_range: z.enum(['last_7d', 'last_30d'])
      .describe('Date range for analysis'),
    limit: z.number().min(1).max(10).default(5)
      .describe('Number of top ads to return'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID. Omit for default.'),
  },
  async ({ date_range, limit, ad_account_id }) => {
    const data = await getAnalysisData(date_range, ad_account_id);
    const analysis = data.analysis as Record<string, unknown> | null;

    if (!analysis) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'Analysis not available', analysisError: data.analysisError }, null, 2),
        }],
      };
    }

    const topAds = (analysis.topAds as Array<Record<string, unknown>>) || [];

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(topAds.slice(0, limit), null, 2),
      }],
    };
  },
);

// ─── Tool: get_bottom_ads ────────────────────────────────────────────────────

server.tool(
  'get_bottom_ads',
  'Get worst performing ads with explanations of why they fail and suggested fixes. Uses cached analysis if available (otherwise triggers AI analysis — costs tokens, 30-45s).',
  {
    date_range: z.enum(['last_7d', 'last_30d'])
      .describe('Date range for analysis'),
    limit: z.number().min(1).max(10).default(5)
      .describe('Number of bottom ads to return'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID. Omit for default.'),
  },
  async ({ date_range, limit, ad_account_id }) => {
    const data = await getAnalysisData(date_range, ad_account_id);
    const analysis = data.analysis as Record<string, unknown> | null;

    if (!analysis) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'Analysis not available', analysisError: data.analysisError }, null, 2),
        }],
      };
    }

    const bottomAds = (analysis.bottomAds as Array<Record<string, unknown>>) || [];

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(bottomAds.slice(0, limit), null, 2),
      }],
    };
  },
);

// ─── Tool: get_recommendations ───────────────────────────────────────────────

server.tool(
  'get_recommendations',
  'Get strategic recommendations for ad optimization. Uses cached analysis if available (otherwise triggers AI analysis — costs tokens, 30-45s).',
  {
    date_range: z.enum(['last_7d', 'last_30d'])
      .describe('Date range for analysis'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID. Omit for default.'),
  },
  async ({ date_range, ad_account_id }) => {
    const data = await getAnalysisData(date_range, ad_account_id);
    const analysis = data.analysis as Record<string, unknown> | null;

    if (!analysis) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'Analysis not available', analysisError: data.analysisError }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(analysis.recommendations, null, 2),
      }],
    };
  },
);

// ─── Tool: get_winning_patterns ──────────────────────────────────────────────

server.tool(
  'get_winning_patterns',
  'Get winning creative patterns (headlines, copy elements, emotional triggers, CTAs). Uses cached analysis if available (otherwise triggers AI analysis — costs tokens, 30-45s).',
  {
    date_range: z.enum(['last_7d', 'last_30d'])
      .describe('Date range for analysis'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID. Omit for default.'),
  },
  async ({ date_range, ad_account_id }) => {
    const data = await getAnalysisData(date_range, ad_account_id);
    const analysis = data.analysis as Record<string, unknown> | null;

    if (!analysis) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'Analysis not available', analysisError: data.analysisError }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(analysis.winningPatterns, null, 2),
      }],
    };
  },
);

// ─── Tool: get_campaign_breakdown ────────────────────────────────────────────

server.tool(
  'get_campaign_breakdown',
  'Get per-campaign metrics breakdown. Fast (5-8s), no AI tokens. Returns spend, revenue, ROAS, purchases, CPC, CTR per campaign.',
  {
    date_range: z.enum(['today', 'yesterday', 'last_7d', 'last_30d', 'this_month'])
      .describe('Date range for campaign data'),
    ad_account_id: z.string().optional()
      .describe('Specific ad account ID. Omit for default.'),
  },
  async ({ date_range, ad_account_id }) => {
    const data = await callApi({
      date_range,
      ad_account_id: ad_account_id || null,
      scope: 'campaigns',
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    };
  },
);

// ─── Tool: get_ad_accounts ───────────────────────────────────────────────────

server.tool(
  'get_ad_accounts',
  'List connected ad accounts with their names, business types, and status.',
  {},
  async () => {
    const data = await callApi({
      date_range: 'yesterday', // Required by API but not used for accounts scope
      scope: 'accounts',
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      }],
    };
  },
);

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Convertra MCP server started');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
