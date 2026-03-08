/**
 * External Reports API handler.
 *
 * Provides a simple bearer-token-authenticated endpoint for external consumers
 * (GitHub Actions, MCP servers) to fetch Convertra ad metrics and AI analysis.
 *
 * Auth: Bearer token checked against EXTERNAL_REPORT_API_KEY env var.
 * Org: Resolved from EXTERNAL_REPORT_ORG_ID env var.
 *
 * This file is a shared helper in api/_lib/ — NOT a serverless function.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { loadAccessToken, fetchMetricsForAccount } from './report-handlers.js';
import type { FetchedMetrics } from './report-handlers.js';
import {
  computeMetrics,
  parseCampaignInsights,
  fetchAllCampaignInsights,
  fetchAccountInsights,
  getPreviousPeriodDates,
  getPresetDateRange,
  METRIC_META,
} from './metrics.js';
import type { RawMetaData, DashboardStats } from './metrics.js';
import { captureError, flushSentry } from './sentry.js';
import { analyzeServerSide } from './external-analysis.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VALID_DATE_RANGES = ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month'] as const;
type DateRange = typeof VALID_DATE_RANGES[number];

// ─── Auth ────────────────────────────────────────────────────────────────────

interface ExternalAuthContext {
  organizationId: string;
}

function authenticateExternal(req: VercelRequest): ExternalAuthContext | null {
  const apiKey = process.env.EXTERNAL_REPORT_API_KEY;
  const orgId = process.env.EXTERNAL_REPORT_ORG_ID;

  if (!apiKey || !orgId) return null;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (token !== apiKey) return null;

  return { organizationId: orgId };
}

// ─── Comparison ──────────────────────────────────────────────────────────────

interface ComparisonEntry {
  value: number;
  previous: number;
  change_pct: number | null;
}

function buildComparison(
  current: DashboardStats,
  previous: DashboardStats,
): Record<string, ComparisonEntry> {
  const result: Record<string, ComparisonEntry> = {};

  for (const key of Object.keys(METRIC_META)) {
    const cur = (current as Record<string, number>)[key] ?? 0;
    const prev = (previous as Record<string, number>)[key] ?? 0;
    const changePct = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
    result[key] = { value: cur, previous: prev, change_pct: changePct !== null ? Math.round(changePct * 10) / 10 : null };
  }

  return result;
}

// ─── Metrics Response Builder ────────────────────────────────────────────────

function buildMetricsResponse(stats: DashboardStats): Record<string, number | null> {
  return {
    totalRevenue: stats.totalRevenue,
    adSpend: stats.adSpend,
    roas: stats.roas,
    cac: stats.cac || null,
    netProfit: stats.netProfit,
    totalPurchases: stats.totalPurchases,
    conversionRate: stats.conversionRate,
    aov: stats.aov || null,
    linkClicks: stats.linkClicks,
    cpc: stats.cpc,
    cpm: stats.cpm,
    ctr: stats.linkCtr,
    impressions: stats.impressions,
    reach: stats.reach,
    frequency: stats.frequency,
    landingPageViews: stats.landingPageViews,
    addToCart: stats.addToCart,
    initiateCheckout: stats.initiateCheckout,
    costPerLead: stats.costPerLead || null,
    leads: stats.leads || null,
    postEngagements: stats.postEngagements,
    videoViews: stats.videoViews,
  };
}

// ─── Scope: Accounts ─────────────────────────────────────────────────────────

async function handleAccountsScope(organizationId: string, res: VercelResponse) {
  const { data: accounts, error } = await supabase
    .from('organization_ad_accounts')
    .select('ad_account_id, ad_account_name, business_type, is_active')
    .eq('organization_id', organizationId);

  if (error) {
    return res.status(500).json({ success: false, error: `Database error: ${error.message}` });
  }

  return res.status(200).json({
    success: true,
    data: {
      accounts: (accounts || []).map(a => ({
        id: a.ad_account_id,
        name: a.ad_account_name || a.ad_account_id,
        business_type: a.business_type || 'ecommerce',
        status: a.is_active ? 'active' : 'inactive',
      })),
    },
  });
}

// ─── Scope: Campaigns ────────────────────────────────────────────────────────

async function handleCampaignsScope(
  accessToken: string,
  adAccountId: string,
  dateRange: DateRange,
  res: VercelResponse,
) {
  const GRAPH_API_BASE = 'https://graph.facebook.com/v24.0';
  const fields = 'campaign_id,campaign_name,spend,impressions,clicks,ctr,actions,action_values';

  // Build date params
  const dateParams: Record<string, string> = { date_preset: dateRange };

  // Fetch with pagination
  let rows: Array<Record<string, unknown>> = [];
  let nextUrl: string | null = `${GRAPH_API_BASE}/act_${adAccountId.replace('act_', '')}/insights?` +
    new URLSearchParams({
      ...dateParams,
      fields,
      level: 'campaign',
      limit: '100',
      access_token: accessToken,
    }).toString();

  while (nextUrl) {
    const resp = await fetch(nextUrl);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({
        success: false,
        error: `Meta API error: ${err?.error?.message || resp.statusText}`,
      });
    }

    const data = await resp.json();
    rows = rows.concat(data.data || []);
    nextUrl = data.paging?.next || null;
  }

  const campaigns = rows.map((row: Record<string, unknown>) => {
    const actions = (row.actions as Array<{ action_type: string; value: string }>) || [];
    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) || [];

    const purchases = Number(actions.find((a: { action_type: string }) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);
    const revenue = Number(actionValues.find((a: { action_type: string }) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);
    const spend = Number(row.spend || 0);
    const clicks = Number(row.clicks || 0);

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend,
      revenue,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
      purchases,
      clicks,
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
    };
  });

  return res.status(200).json({
    success: true,
    data: { campaigns },
  });
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function handleExternalSummary(req: VercelRequest, res: VercelResponse) {
  // POST only
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  // Auth
  const auth = authenticateExternal(req);
  if (!auth) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const {
      ad_account_id,
      date_range,
      include_comparison = false,
      include_analysis = false,
      scope = 'metrics',
    } = req.body || {};

    // Validate date_range
    if (!date_range || !VALID_DATE_RANGES.includes(date_range)) {
      return res.status(400).json({
        success: false,
        error: `Invalid date_range. Must be one of: ${VALID_DATE_RANGES.join(', ')}`,
      });
    }

    // Handle "accounts" scope
    if (scope === 'accounts') {
      return handleAccountsScope(auth.organizationId, res);
    }

    // Load Meta credentials
    const accessToken = await loadAccessToken(auth.organizationId);
    if (!accessToken) {
      return res.status(503).json({
        success: false,
        error: 'Meta credentials not configured or expired for this organization',
      });
    }

    // Handle "campaigns" scope
    if (scope === 'campaigns') {
      // Resolve ad account ID
      const resolvedAccountId = ad_account_id || await getDefaultAdAccountId(auth.organizationId);
      if (!resolvedAccountId) {
        return res.status(400).json({ success: false, error: 'No ad account ID provided and no default found' });
      }
      return handleCampaignsScope(accessToken, resolvedAccountId, date_range, res);
    }

    // ─── Metrics scope (default) ───────────────────────────────────────────────

    // Determine accounts to fetch
    let accounts: Array<{ ad_account_id: string; ad_account_name?: string; business_type?: string }> = [];

    if (ad_account_id) {
      accounts = [{ ad_account_id }];
    } else {
      // Fetch all active accounts for cross-account aggregation
      const { data: orgAccounts } = await supabase
        .from('organization_ad_accounts')
        .select('ad_account_id, ad_account_name, business_type')
        .eq('organization_id', auth.organizationId)
        .eq('is_active', true);

      if (orgAccounts && orgAccounts.length > 0) {
        accounts = orgAccounts;
      } else {
        // Fallback: get ad_account_id from org credentials
        const { data: cred } = await supabase
          .from('organization_credentials')
          .select('ad_account_id')
          .eq('organization_id', auth.organizationId)
          .eq('provider', 'meta')
          .single();

        if (cred?.ad_account_id) {
          accounts = [{ ad_account_id: cred.ad_account_id }];
        }
      }
    }

    if (accounts.length === 0) {
      return res.status(400).json({ success: false, error: 'No ad accounts found for this organization' });
    }

    // Fetch metrics for all accounts
    const allResults: Array<FetchedMetrics & { adAccountId: string; businessType?: string }> = [];

    for (const account of accounts) {
      const result = await fetchMetricsForAccount(accessToken, account.ad_account_id, date_range);
      allResults.push({
        ...result,
        adAccountId: account.ad_account_id,
        businessType: account.business_type,
        accountName: result.accountName || account.ad_account_name,
      });
    }

    // Build aggregated metrics if multiple accounts
    let aggregatedStats: DashboardStats;
    let primaryAccountName: string | undefined;
    let primaryAdAccountId: string;

    if (allResults.length === 1) {
      aggregatedStats = allResults[0].stats;
      primaryAccountName = allResults[0].accountName;
      primaryAdAccountId = allResults[0].adAccountId;
    } else {
      // Sum raw meta data across accounts
      const summedRaw: RawMetaData = {
        totalSpend: 0, totalPurchases: 0, totalPurchaseValue: 0,
        totalClicks: 0, totalImpressions: 0, totalLeads: 0,
        totalLinkClicks: 0, totalPostEngagements: 0, totalLandingPageViews: 0,
        totalAddToCart: 0, totalInitiateCheckout: 0, totalVideoViews: 0,
      };
      let totalReach = 0;
      let totalUniqueLinkClicks = 0;

      for (const r of allResults) {
        for (const key of Object.keys(summedRaw) as Array<keyof RawMetaData>) {
          summedRaw[key] += r.rawMeta[key];
        }
        totalReach += r.accountLevel.reach;
        totalUniqueLinkClicks += r.accountLevel.uniqueLinkClicks;
      }

      aggregatedStats = computeMetrics(summedRaw, { reach: totalReach, uniqueLinkClicks: totalUniqueLinkClicks });
      primaryAccountName = 'All Accounts';
      primaryAdAccountId = 'aggregate';
    }

    // Build response
    const responseData: Record<string, unknown> = {
      metrics: buildMetricsResponse(aggregatedStats),
    };

    // Include per-account breakdown for multi-account
    if (allResults.length > 1) {
      responseData.accountBreakdown = allResults.map(r => ({
        adAccountId: r.adAccountId,
        accountName: r.accountName,
        metrics: buildMetricsResponse(r.stats),
      }));
    }

    // Comparison
    if (include_comparison) {
      const prevDates = getPreviousPeriodDates(date_range);

      if (allResults.length === 1) {
        const prevDateParams = { time_range: JSON.stringify({ since: prevDates.since, until: prevDates.until }) };
        const prevCampaignRows = await fetchAllCampaignInsights(
          allResults[0].adAccountId, accessToken, prevDateParams,
        );
        const prevRaw = parseCampaignInsights(prevCampaignRows);
        const prevAccountLevel = await fetchAccountInsights(
          allResults[0].adAccountId, accessToken, prevDateParams,
        );
        const prevStats = computeMetrics(prevRaw, prevAccountLevel);
        responseData.comparison = buildComparison(aggregatedStats, prevStats);
      } else {
        // Multi-account comparison: sum previous period across all accounts
        const prevDateParams = { time_range: JSON.stringify({ since: prevDates.since, until: prevDates.until }) };
        const prevSummedRaw: RawMetaData = {
          totalSpend: 0, totalPurchases: 0, totalPurchaseValue: 0,
          totalClicks: 0, totalImpressions: 0, totalLeads: 0,
          totalLinkClicks: 0, totalPostEngagements: 0, totalLandingPageViews: 0,
          totalAddToCart: 0, totalInitiateCheckout: 0, totalVideoViews: 0,
        };
        let prevReach = 0;
        let prevUniqueLinkClicks = 0;

        for (const r of allResults) {
          const prevRows = await fetchAllCampaignInsights(r.adAccountId, accessToken, prevDateParams);
          const prevRaw = parseCampaignInsights(prevRows);
          const prevAL = await fetchAccountInsights(r.adAccountId, accessToken, prevDateParams);
          for (const key of Object.keys(prevSummedRaw) as Array<keyof RawMetaData>) {
            prevSummedRaw[key] += prevRaw[key];
          }
          prevReach += prevAL.reach;
          prevUniqueLinkClicks += prevAL.uniqueLinkClicks;
        }

        const prevStats = computeMetrics(prevSummedRaw, { reach: prevReach, uniqueLinkClicks: prevUniqueLinkClicks });
        responseData.comparison = buildComparison(aggregatedStats, prevStats);
      }
    }

    // Analysis (Phase 2)
    // When multiple accounts exist, analyze each and merge results.
    // When a single account is specified, analyze just that one.
    if (include_analysis) {
      const accountsToAnalyze = ad_account_id
        ? [{ id: ad_account_id, businessType: allResults[0]?.businessType }]
        : allResults.map(r => ({ id: r.adAccountId, businessType: r.businessType }));

      try {
        if (accountsToAnalyze.length === 1) {
          const analysis = await analyzeServerSide(
            accessToken, accountsToAnalyze[0].id, date_range,
            accountsToAnalyze[0].businessType as 'ecommerce' | 'leadgen' | undefined,
          );
          responseData.analysis = analysis;
        } else {
          // Multi-account: analyze each, then merge
          const analyses = [];
          for (const acct of accountsToAnalyze) {
            try {
              const analysis = await analyzeServerSide(
                accessToken, acct.id, date_range,
                acct.businessType as 'ecommerce' | 'leadgen' | undefined,
              );
              analyses.push(analysis);
            } catch {
              // Skip accounts that fail analysis — partial results are better than none
            }
          }
          if (analyses.length > 0) {
            // Use first analysis as base, merge arrays from others
            const merged = { ...analyses[0] };
            for (let i = 1; i < analyses.length; i++) {
              const a = analyses[i];
              merged.topAds = [...merged.topAds, ...a.topAds];
              merged.bottomAds = [...merged.bottomAds, ...a.bottomAds];
              merged.performanceBreakdown.totalAdsAnalyzed += a.performanceBreakdown.totalAdsAnalyzed;
              merged.performanceBreakdown.totalSpend += a.performanceBreakdown.totalSpend;
              merged.performanceBreakdown.totalConversions += a.performanceBreakdown.totalConversions;
            }
            responseData.analysis = merged;
          } else {
            responseData.analysis = null;
            responseData.analysisError = 'Analysis failed for all accounts';
          }
        }
      } catch (analysisError: unknown) {
        const errMsg = analysisError instanceof Error ? analysisError.message : String(analysisError);
        responseData.analysis = null;
        responseData.analysisError = errMsg;
      }
    }

    // Metadata
    const dateRangeObj = getPresetDateRange(date_range);
    responseData.metadata = {
      dateRange: dateRangeObj,
      accountName: primaryAccountName,
      adAccountId: primaryAdAccountId,
      generatedAt: new Date().toISOString(),
      analysisIncluded: include_analysis && !!responseData.analysis,
    };

    return res.status(200).json({ success: true, data: responseData });
  } catch (err: unknown) {
    console.error('External report error:', err);
    captureError(err, { route: 'external-summary' });
    await flushSentry();
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getDefaultAdAccountId(organizationId: string): Promise<string | null> {
  // Try organization_ad_accounts first
  const { data: accounts } = await supabase
    .from('organization_ad_accounts')
    .select('ad_account_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(1);

  if (accounts?.[0]?.ad_account_id) return accounts[0].ad_account_id;

  // Fallback to org credentials
  const { data: cred } = await supabase
    .from('organization_credentials')
    .select('ad_account_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'meta')
    .single();

  return cred?.ad_account_id || null;
}
