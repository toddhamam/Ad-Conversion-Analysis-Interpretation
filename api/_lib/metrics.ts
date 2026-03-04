/**
 * Shared metric computation module for dashboard reports.
 *
 * Mirrors the calculation logic in src/pages/Dashboard.tsx (lines 698-805).
 * When updating formulas here, update Dashboard.tsx too and vice-versa.
 *
 * This file is a shared helper in api/_lib/ — it is NOT a serverless function
 * and does not count toward Vercel's 12-function limit.
 */

// Stripe transaction fee rate — must stay in sync with Dashboard.tsx
const TRANSACTION_FEE_RATE = 0.062;

// ─── Input Types ──────────────────────────────────────────────────────────────

/** Aggregated campaign-level data (summed across all campaigns). */
export interface RawMetaData {
  totalSpend: number;
  totalPurchases: number;
  totalPurchaseValue: number;
  totalClicks: number;
  totalImpressions: number;
  totalLeads: number;
  totalLinkClicks: number;
  totalPostEngagements: number;
  totalLandingPageViews: number;
  totalAddToCart: number;
  totalInitiateCheckout: number;
  totalVideoViews: number;
}

/** Account-level unique-user metrics (cannot be summed across campaigns). */
export interface AccountLevelData {
  reach: number;
  uniqueLinkClicks: number;
}

// ─── Output Type ──────────────────────────────────────────────────────────────

/** All dashboard metrics — mirrors DashboardStats in Dashboard.tsx. */
export interface DashboardStats {
  totalRevenue: number;
  totalPurchases: number;
  conversionRate: number;
  aov: number;
  uniqueCustomers: number;
  sessions: number;
  adSpend: number;
  roas: number;
  cac: number;
  transactionFees: number;
  netProfit: number;
  // Lead metrics
  leads: number;
  costPerLead: number;
  leadRate: number;
  // Click metrics
  linkClicks: number;
  cpc: number;
  costPerLinkClick: number;
  uniqueLinkClicks: number;
  costPerUniqueLinkClick: number;
  linkCtr: number;
  uniqueLinkCtr: number;
  // Awareness metrics
  impressions: number;
  reach: number;
  cpm: number;
  frequency: number;
  // Engagement metrics
  postEngagements: number;
  cpe: number;
  // Funnel metrics
  landingPageViews: number;
  costPerLandingPageView: number;
  addToCart: number;
  costPerAddToCart: number;
  initiateCheckout: number;
  costPerInitiateCheckout: number;
  // Video metrics
  videoViews: number;
  costPerVideoView: number;
}

// ─── Computation ──────────────────────────────────────────────────────────────

/**
 * Compute all dashboard metrics from raw Meta API data.
 *
 * Requires two inputs because reach and unique link clicks must come from
 * account-level insights (Meta deduplicates at account level, not campaign).
 *
 * Funnel-only metrics (uniqueCustomers, aov, cac, sessions) are set to 0
 * in v1 — they require a separate Supabase funnel API call.
 */
export function computeMetrics(
  meta: RawMetaData,
  accountLevel: AccountLevelData,
): DashboardStats {
  const adSpend = meta.totalSpend;
  const totalPurchases = meta.totalPurchases;
  const totalRevenue = meta.totalPurchaseValue;
  const totalClicks = meta.totalClicks;
  const roas = adSpend > 0 ? totalRevenue / adSpend : 0;

  // Funnel metrics excluded from v1 reports — set to 0
  const uniqueCustomers = 0;
  const aov = 0;
  const cac = 0;
  const sessions = 0;

  // Conversion rate: fallback to clicks-to-purchase when no funnel data
  const conversionRate =
    totalClicks > 0 && totalPurchases > 0
      ? (totalPurchases / totalClicks) * 100
      : 0;

  const transactionFees = totalRevenue * TRANSACTION_FEE_RATE;
  const netProfit = totalRevenue - adSpend - transactionFees;

  // Raw counts from Meta API
  const totalImpressions = meta.totalImpressions;
  const totalLeads = meta.totalLeads;
  const totalLinkClicks = meta.totalLinkClicks;
  const totalReach = accountLevel.reach;
  const totalUniqueLinkClicks = accountLevel.uniqueLinkClicks;
  const totalPostEngagements = meta.totalPostEngagements;
  const totalLandingPageViews = meta.totalLandingPageViews;
  const totalAddToCart = meta.totalAddToCart;
  const totalInitiateCheckout = meta.totalInitiateCheckout;
  const totalVideoViews = meta.totalVideoViews;

  // Derived metrics
  const costPerLead = totalLeads > 0 && adSpend > 0 ? adSpend / totalLeads : 0;
  const leadRate = totalLinkClicks > 0 && totalLeads > 0 ? (totalLeads / totalLinkClicks) * 100 : 0;
  const cpcAll = totalClicks > 0 && adSpend > 0 ? adSpend / totalClicks : 0;
  const costPerLinkClick = totalLinkClicks > 0 && adSpend > 0 ? adSpend / totalLinkClicks : 0;
  const costPerUniqueLinkClick = totalUniqueLinkClicks > 0 && adSpend > 0 ? adSpend / totalUniqueLinkClicks : 0;
  const linkCtr = totalImpressions > 0 && totalLinkClicks > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;
  const uniqueLinkCtr = totalImpressions > 0 && totalUniqueLinkClicks > 0 ? (totalUniqueLinkClicks / totalImpressions) * 100 : 0;
  const cpmVal = totalImpressions > 0 && adSpend > 0 ? (adSpend / totalImpressions) * 1000 : 0;
  const frequencyVal = totalReach > 0 && totalImpressions > 0 ? totalImpressions / totalReach : 0;
  const cpeVal = totalPostEngagements > 0 && adSpend > 0 ? adSpend / totalPostEngagements : 0;
  const costPerLandingPageView = totalLandingPageViews > 0 && adSpend > 0 ? adSpend / totalLandingPageViews : 0;
  const costPerAddToCartVal = totalAddToCart > 0 && adSpend > 0 ? adSpend / totalAddToCart : 0;
  const costPerInitiateCheckoutVal = totalInitiateCheckout > 0 && adSpend > 0 ? adSpend / totalInitiateCheckout : 0;
  const costPerVideoViewVal = totalVideoViews > 0 && adSpend > 0 ? adSpend / totalVideoViews : 0;

  return {
    totalRevenue,
    totalPurchases,
    conversionRate,
    aov,
    uniqueCustomers,
    sessions,
    adSpend,
    roas,
    cac,
    transactionFees,
    netProfit,
    leads: totalLeads,
    costPerLead,
    leadRate,
    linkClicks: totalLinkClicks,
    cpc: cpcAll,
    costPerLinkClick,
    uniqueLinkClicks: totalUniqueLinkClicks,
    costPerUniqueLinkClick,
    linkCtr,
    uniqueLinkCtr,
    impressions: totalImpressions,
    reach: totalReach,
    cpm: cpmVal,
    frequency: frequencyVal,
    postEngagements: totalPostEngagements,
    cpe: cpeVal,
    landingPageViews: totalLandingPageViews,
    costPerLandingPageView,
    addToCart: totalAddToCart,
    costPerAddToCart: costPerAddToCartVal,
    initiateCheckout: totalInitiateCheckout,
    costPerInitiateCheckout: costPerInitiateCheckoutVal,
    videoViews: totalVideoViews,
    costPerVideoView: costPerVideoViewVal,
  };
}

// ─── Metric Metadata ──────────────────────────────────────────────────────────

export type MetricFormat = 'currency' | 'currency_precise' | 'percent' | 'number' | 'multiplier' | 'decimal';

export interface MetricMeta {
  label: string;
  format: MetricFormat;
  /** Funnel-only metrics are excluded from v1 scheduled reports. */
  funnelOnly?: boolean;
}

/** Metadata for all 36 dashboard metrics. */
export const METRIC_META: Record<string, MetricMeta> = {
  totalRevenue: { label: 'Total Revenue', format: 'currency' },
  totalPurchases: { label: 'Total Conversions', format: 'number' },
  conversionRate: { label: 'Conversion Rate', format: 'percent' },
  aov: { label: 'Avg. Order Value', format: 'currency', funnelOnly: true },
  uniqueCustomers: { label: 'Unique Customers', format: 'number', funnelOnly: true },
  sessions: { label: 'Sessions', format: 'number', funnelOnly: true },
  adSpend: { label: 'Ad Spend', format: 'currency' },
  roas: { label: 'ROAS', format: 'multiplier' },
  cac: { label: 'CAC', format: 'currency', funnelOnly: true },
  transactionFees: { label: 'Transaction Fees', format: 'currency' },
  netProfit: { label: 'Net Profit', format: 'currency' },
  leads: { label: 'Leads', format: 'number' },
  costPerLead: { label: 'Cost Per Lead', format: 'currency_precise' },
  leadRate: { label: 'Lead Rate', format: 'percent' },
  linkClicks: { label: 'Link Clicks', format: 'number' },
  cpc: { label: 'CPC (All Clicks)', format: 'currency_precise' },
  costPerLinkClick: { label: 'Cost Per Link Click', format: 'currency_precise' },
  uniqueLinkClicks: { label: 'Unique Link Clicks', format: 'number' },
  costPerUniqueLinkClick: { label: 'Cost Per Unique Link Click', format: 'currency_precise' },
  linkCtr: { label: 'Link CTR', format: 'percent' },
  uniqueLinkCtr: { label: 'Unique Link CTR', format: 'percent' },
  impressions: { label: 'Impressions', format: 'number' },
  reach: { label: 'Reach', format: 'number' },
  cpm: { label: 'CPM', format: 'currency_precise' },
  frequency: { label: 'Frequency', format: 'decimal' },
  postEngagements: { label: 'Post Engagements', format: 'number' },
  cpe: { label: 'CPE (Cost Per Engagement)', format: 'currency_precise' },
  landingPageViews: { label: 'Landing Page Views', format: 'number' },
  costPerLandingPageView: { label: 'Cost Per LPV', format: 'currency_precise' },
  addToCart: { label: 'Add to Cart', format: 'number' },
  costPerAddToCart: { label: 'Cost Per Add to Cart', format: 'currency_precise' },
  initiateCheckout: { label: 'Initiate Checkout', format: 'number' },
  costPerInitiateCheckout: { label: 'Cost Per Checkout', format: 'currency_precise' },
  videoViews: { label: 'Video Views (3-sec)', format: 'number' },
  costPerVideoView: { label: 'Cost Per Video View', format: 'currency_precise' },
};

/** IDs of metrics that are excluded from v1 scheduled reports (funnel-only). */
export const FUNNEL_ONLY_METRICS = ['uniqueCustomers', 'aov', 'sessions', 'cac'];

// ─── Formatting ───────────────────────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyPreciseFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat('en-US');

/** Format a metric value for display in emails and CSV exports. */
export function formatMetricValue(metricId: string, value: number): string {
  const meta = METRIC_META[metricId];
  if (!meta) return String(value);

  switch (meta.format) {
    case 'currency':
      return value !== 0 ? currencyFmt.format(value) : '—';
    case 'currency_precise':
      return value > 0 ? currencyPreciseFmt.format(value) : '—';
    case 'percent':
      return value > 0 ? `${value.toFixed(2)}%` : '—';
    case 'multiplier':
      return value > 0 ? `${value.toFixed(2)}x` : '—';
    case 'decimal':
      return value > 0 ? value.toFixed(2) : '—';
    case 'number':
      return numberFmt.format(value);
    default:
      return String(value);
  }
}

// ─── Meta API Data Fetching (Server-Side) ─────────────────────────────────────

/** Fields requested from Meta Graph API for campaign-level insights. */
export const META_INSIGHTS_FIELDS =
  'campaign_id,campaign_name,spend,impressions,clicks,ctr,actions,action_values,reach,unique_actions';

/** Fields requested for account-level insights. */
export const META_ACCOUNT_FIELDS = 'reach,unique_actions';

/**
 * Parse a campaign insight row from Meta Graph API into raw metric values.
 * Aggregates across multiple rows for summing.
 */
export function parseCampaignInsights(rows: any[]): RawMetaData {
  let totalSpend = 0;
  let totalPurchases = 0;
  let totalPurchaseValue = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalLeads = 0;
  let totalLinkClicks = 0;
  let totalPostEngagements = 0;
  let totalLandingPageViews = 0;
  let totalAddToCart = 0;
  let totalInitiateCheckout = 0;
  let totalVideoViews = 0;

  for (const row of rows) {
    const getAction = (actionType: string): number =>
      parseInt(row.actions?.find((a: any) => a.action_type === actionType)?.value || '0', 10);
    const getActionValue = (actionType: string): number =>
      parseFloat(row.action_values?.find((a: any) => a.action_type === actionType)?.value || '0');

    totalSpend += parseFloat(row.spend || '0');
    totalPurchases += getAction('offsite_conversion.fb_pixel_purchase');
    totalPurchaseValue += getActionValue('offsite_conversion.fb_pixel_purchase');
    totalClicks += parseInt(row.clicks || '0', 10);
    totalImpressions += parseInt(row.impressions || '0', 10);
    totalLeads += getAction('lead');
    totalLinkClicks += getAction('link_click');
    totalPostEngagements += getAction('post_engagement');
    totalLandingPageViews += getAction('landing_page_view');
    totalAddToCart += getAction('offsite_conversion.fb_pixel_add_to_cart');
    totalInitiateCheckout += getAction('offsite_conversion.fb_pixel_initiate_checkout');
    totalVideoViews += getAction('video_view');
  }

  return {
    totalSpend,
    totalPurchases,
    totalPurchaseValue,
    totalClicks,
    totalImpressions,
    totalLeads,
    totalLinkClicks,
    totalPostEngagements,
    totalLandingPageViews,
    totalAddToCart,
    totalInitiateCheckout,
    totalVideoViews,
  };
}

/**
 * Parse account-level insights row from Meta Graph API.
 */
export function parseAccountInsights(row: any): AccountLevelData {
  if (!row) return { reach: 0, uniqueLinkClicks: 0 };

  const reach = parseInt(row.reach || '0', 10);
  const uniqueLinkClicks = parseInt(
    row.unique_actions?.find((a: any) => a.action_type === 'link_click')?.value || '0',
    10,
  );

  return { reach, uniqueLinkClicks };
}

/**
 * Fetch all campaign insight rows from Meta Graph API with pagination.
 * Follows `paging.next` links to get complete data for accounts with >100 campaigns.
 */
export async function fetchAllCampaignInsights(
  adAccountId: string,
  accessToken: string,
  dateParams: Record<string, string>,
): Promise<any[]> {
  const params = new URLSearchParams({
    fields: META_INSIGHTS_FIELDS,
    level: 'campaign',
    limit: '100',
    access_token: accessToken,
    ...dateParams,
  });

  let allData: any[] = [];
  let url: string | null = `https://graph.facebook.com/v24.0/${adAccountId}/insights?${params.toString()}`;

  while (url) {
    const response = await fetch(url);
    const json = await response.json();

    if (json.error) {
      throw new Error(json.error.message || `Meta API error: ${JSON.stringify(json.error)}`);
    }

    allData = allData.concat(json.data || []);
    url = json.paging?.next || null;
  }

  return allData;
}

/**
 * Fetch account-level insights (reach, unique link clicks) from Meta Graph API.
 */
export async function fetchAccountInsights(
  adAccountId: string,
  accessToken: string,
  dateParams: Record<string, string>,
): Promise<AccountLevelData> {
  const params = new URLSearchParams({
    fields: META_ACCOUNT_FIELDS,
    access_token: accessToken,
    ...dateParams,
  });

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${adAccountId}/insights?${params.toString()}`,
  );
  const json = await response.json();

  if (json.error) {
    throw new Error(json.error.message || `Meta API error: ${JSON.stringify(json.error)}`);
  }

  return parseAccountInsights(json.data?.[0]);
}

// ─── Date Range Helpers ───────────────────────────────────────────────────────

/** Map a date_range_preset to Meta API date parameters. */
export function buildDateParamsForPreset(preset: string): Record<string, string> {
  // Map our preset names to Meta API date_preset values
  const metaPresets: Record<string, string> = {
    today: 'today',
    yesterday: 'yesterday',
    last_3d: 'last_3d',
    last_7d: 'last_7d',
    last_14d: 'last_14d',
    last_28d: 'last_28d',
    last_30d: 'last_30d',
    this_week: 'this_week_sun_today',
    last_week: 'last_week_sun_sat',
    this_month: 'this_month',
    last_month: 'last_month',
    maximum: 'maximum',
  };

  const metaPreset = metaPresets[preset];
  if (metaPreset) {
    return { date_preset: metaPreset };
  }

  // Fallback to last 30 days
  return { date_preset: 'last_30d' };
}

/** Get human-readable label for a date range preset. */
export function getPresetLabel(preset: string): string {
  const labels: Record<string, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last_3d: 'Last 3 days',
    last_7d: 'Last 7 days',
    last_14d: 'Last 14 days',
    last_28d: 'Last 28 days',
    last_30d: 'Last 30 days',
    this_week: 'This week',
    last_week: 'Last week',
    this_month: 'This month',
    last_month: 'Last month',
    maximum: 'All time',
  };
  return labels[preset] || preset;
}

/**
 * Get the previous period date range for comparison.
 * E.g., for "last_7d", the previous period is the 7 days before that.
 */
export function getPreviousPeriodDates(preset: string): { since: string; until: string } {
  const now = new Date();
  let currentStart: Date;
  let currentEnd: Date;

  switch (preset) {
    case 'today':
      currentStart = new Date(now);
      currentEnd = new Date(now);
      break;
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      currentStart = yesterday;
      currentEnd = yesterday;
      break;
    }
    case 'last_3d':
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 3);
      break;
    case 'last_7d':
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 7);
      break;
    case 'last_14d':
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 14);
      break;
    case 'last_28d':
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 28);
      break;
    case 'last_30d':
    default:
      currentEnd = new Date(now);
      currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - 30);
      break;
  }

  const periodLength = Math.ceil(
    (currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24),
  ) + 1;

  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodLength + 1);

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { since: fmt(prevStart), until: fmt(prevEnd) };
}

/** Get the actual date range (since/until) for a preset. */
export function getPresetDateRange(preset: string): { since: string; until: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  let start: Date;
  let end: Date = new Date(now);

  switch (preset) {
    case 'today':
      start = new Date(now);
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = y;
      end = new Date(y);
      break;
    }
    case 'last_3d':
      start = new Date(now);
      start.setDate(start.getDate() - 3);
      break;
    case 'last_7d':
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case 'last_14d':
      start = new Date(now);
      start.setDate(start.getDate() - 14);
      break;
    case 'last_28d':
      start = new Date(now);
      start.setDate(start.getDate() - 28);
      break;
    case 'last_30d':
    default:
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
  }
  return { since: fmt(start), until: fmt(end) };
}

// ─── CSV Generation ───────────────────────────────────────────────────────────

/** Generate a CSV string from computed metrics. */
export function generateCSV(
  stats: DashboardStats,
  metricIds: string[],
  dateRangeLabel: string,
  accountName?: string,
): string {
  const rows: string[][] = [];

  rows.push(['Metric', 'Value']);
  rows.push(['Date Range', dateRangeLabel]);
  if (accountName) {
    rows.push(['Ad Account', accountName]);
  }
  rows.push(['Generated', new Date().toISOString()]);
  rows.push([]);

  for (const id of metricIds) {
    const meta = METRIC_META[id];
    if (!meta) continue;
    const value = stats[id as keyof DashboardStats] as number;
    rows.push([meta.label, formatMetricValue(id, value)]);
  }

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
