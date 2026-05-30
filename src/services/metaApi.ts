// Meta Marketing API Service
// All API calls are routed through the backend proxy (/api/meta/proxy)
// which handles per-org credential loading and token decryption.
// Falls back to VITE_ env vars in dev mode when Supabase is not configured.

import { getAuthToken } from '../lib/authToken';
import { buildAdName, type AxisTag } from '../lib/axisTags';
import {
  guardedFetch,
  updateRateLimitState,
  classifyMetaError,
  invalidateCache,
  extractRateLimitHeaders,
  retryWithBackoff,
} from './metaDevPolicyGuard';

const META_API_VERSION = 'v24.0';
const META_GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;

// Dev fallback env vars (used when no auth token / Supabase not configured)
const FALLBACK_ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN || '';
const FALLBACK_AD_ACCOUNT_ID = import.meta.env.VITE_META_AD_ACCOUNT_ID || '';
const FALLBACK_PAGE_ID = import.meta.env.VITE_META_PAGE_ID || '';

// Dev-only config verification (no sensitive data logged)
if (import.meta.env.DEV) {
  console.log('Meta API configured:', { hasToken: !!FALLBACK_ACCESS_TOKEN, hasAccountId: !!FALLBACK_AD_ACCOUNT_ID });
}

// ─── Per-org credential state ────────────────────────────────────────────────

export interface AvailableAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
}

interface AvailablePage {
  id: string;
  name: string;
}

/** Product metadata stored in Supabase (no images — those stay in localStorage) */
export interface ProductMetadata {
  id: string;
  name: string;
  author: string;
  description: string;
  landingPageUrl: string;
  createdAt: string;
}

/** Reference image metadata stored in Supabase (no base64 — that stays in localStorage) */
export interface ReferenceImageMetadata {
  adId: string;
  conversionRate?: number;
  conversions?: number;
  qualityScore?: number;
  width?: number;
  height?: number;
  headline?: string;
  bodyText?: string;
  capturedAt: number;
}

/** Info about an activated ad account (from organization_ad_accounts table) */
export interface AdAccountInfo {
  id: string;              // UUID from organization_ad_accounts
  ad_account_id: string;   // "act_XXXXXXXXX"
  ad_account_name: string | null;
  page_id: string | null;
  pixel_id: string | null;
  is_active: boolean;
  account_status: number | null;
  currency: string | null;
  business_type: import('../types/organization').BusinessType | null;
  products: ProductMetadata[] | null;
  reference_image_metadata: ReferenceImageMetadata[] | null;
}

export interface OrgMetaIds {
  adAccountId: string;
  pageId: string;
  pixelId: string;
  connected: boolean;
  status: string;
  accountName: string | null;
  tokenExpiresAt: string | null;
  availableAccounts: AvailableAdAccount[];
  availablePages: AvailablePage[];
  needsConfiguration: boolean;
  /** Activated ad accounts for multi-account orgs */
  adAccounts: AdAccountInfo[];
}

let _orgMeta: OrgMetaIds | null = null;

/** The currently selected ad account for multi-account orgs */
let _currentAdAccount: AdAccountInfo | null = null;

/** Version counter that increments each time org meta credentials are loaded/cleared.
 *  Used by AdAccountContext to know when to re-read cached meta state. */
let _orgMetaVersion = 0;
const _orgMetaListeners = new Set<() => void>();

/** Subscribe to meta credential load events. Returns unsubscribe function. */
export function onOrgMetaChange(listener: () => void): () => void {
  _orgMetaListeners.add(listener);
  return () => { _orgMetaListeners.delete(listener); };
}

function notifyOrgMetaChange() {
  _orgMetaVersion++;
  _orgMetaListeners.forEach(fn => fn());
}

/** Get the current meta version counter (for use as a React dependency). */
export function getOrgMetaVersion(): number {
  return _orgMetaVersion;
}

/**
 * Load the current org's Meta credential IDs from the backend.
 * Called once on app init by OrganizationContext.
 */
export async function loadOrgMetaCredentials(): Promise<OrgMetaIds | null> {
  const token = await getAuthToken();
  if (!token) {
    // Dev fallback — use env vars
    _orgMeta = {
      adAccountId: FALLBACK_AD_ACCOUNT_ID,
      pageId: FALLBACK_PAGE_ID,
      pixelId: import.meta.env.VITE_META_PIXEL_ID || '',
      connected: !!FALLBACK_ACCESS_TOKEN,
      status: FALLBACK_ACCESS_TOKEN ? 'active' : 'not_connected',
      accountName: null,
      tokenExpiresAt: null,
      availableAccounts: [],
      availablePages: [],
      needsConfiguration: false,
      adAccounts: [],
    };
    notifyOrgMetaChange();
    return _orgMeta;
  }

  try {
    const res = await fetch('/api/meta/status', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('Failed to load Meta credential status:', res.status);
      return null;
    }
    const data = await res.json();
    _orgMeta = {
      adAccountId: data.adAccountId || '',
      pageId: data.pageId || '',
      pixelId: data.pixelId || '',
      connected: data.connected,
      status: data.status,
      accountName: data.accountName,
      tokenExpiresAt: data.tokenExpiresAt,
      availableAccounts: data.availableAccounts || [],
      availablePages: data.availablePages || [],
      needsConfiguration: data.needsConfiguration || false,
      adAccounts: data.adAccounts || [],
    };
    notifyOrgMetaChange();
    return _orgMeta;
  } catch (err) {
    console.warn('Failed to load Meta credentials:', err);
    return null;
  }
}

/**
 * Get cached org Meta IDs. Returns null if not yet loaded.
 */
export function getOrgMetaIds(): OrgMetaIds | null {
  return _orgMeta;
}

/**
 * Clear cached org Meta credentials. Call before loadOrgMetaCredentials()
 * to force a fresh fetch (e.g. after OAuth or configuration changes).
 */
export function clearOrgMetaCache(): void {
  _orgMeta = null;
  _currentAdAccount = null;
  // Do NOT call notifyOrgMetaChange() here — nulling the cache triggers
  // AdAccountContext to set currentAccount=null, which changes the Outlet key,
  // remounts the page, re-runs refreshStatus() → infinite loop.
  // The notification fires in loadOrgMetaCredentials() after fresh data arrives.
}

/**
 * Set the currently active ad account (for multi-account orgs).
 * Called by AdAccountContext when the user switches accounts.
 * Updates the internal getters so getAdAccountId()/getPageId()/getPixelId()
 * return values for the selected account.
 */
export function setCurrentAdAccount(account: AdAccountInfo | null): void {
  _currentAdAccount = account;
}

/**
 * Get the currently active ad account info (for multi-account orgs).
 */
export function getCurrentAdAccount(): AdAccountInfo | null {
  return _currentAdAccount;
}

/**
 * Disconnect Meta credentials for the current org.
 * Removes credentials server-side and clears the local cache.
 */
export async function disconnectMeta(): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/meta/disconnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to disconnect Meta account');
  }

  clearOrgMetaCache();
}

/**
 * Save ad account / page / pixel selection for the current org.
 * Used by the self-service onboarding flow.
 */
export async function saveMetaSelection(selection: {
  adAccountId: string;
  pageId: string | null;
  pixelId: string | null;
  products?: ProductMetadata[];
}): Promise<{ success: boolean }> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/meta/update-selection', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(selection),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save Meta configuration');
  }

  return res.json();
}

/**
 * Save manually-entered Meta credentials (bypass OAuth).
 * Validates the token server-side, encrypts, and stores.
 */
export async function saveManualCredentials(credentials: {
  accessToken: string;
  adAccountId?: string;
  pageId?: string;
  pixelId?: string;
}): Promise<{
  success: boolean;
  needsConfiguration: boolean;
  availableAccounts: AvailableAdAccount[];
  availablePages: AvailablePage[];
}> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/meta/save-credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errorMsg = data.errors?.join('. ') || data.error || 'Failed to save credentials';
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Fetch available pixels for a given ad account.
 * Used by the self-service onboarding flow.
 */
export async function fetchAvailablePixels(adAccountId: string): Promise<Array<{ id: string; name: string }>> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  // Route through guard queue — backend calls Meta Graph API (adspixels endpoint)
  const data: { pixels: Array<{ id: string; name: string }> } = await guardedFetch({
    endpoint: `${adAccountId}/adspixels`,
    method: 'GET',
    adAccountId,
    fetchFn: async () => {
      const res = await fetch('/api/meta/fetch-pixels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ adAccountId }),
      });

      const rateLimitHeaders = extractRateLimitHeaders(res.headers);

      if (!res.ok) {
        console.warn('Failed to fetch pixels');
        return { data: { pixels: [] }, headers: rateLimitHeaders || {} };
      }

      const json = await res.json();
      return { data: json, headers: rateLimitHeaders || {} };
    },
  });

  return data.pixels || [];
}

// ─── Unified Meta API fetch helpers ──────────────────────────────────────────

/**
 * Make a Meta API call. Routes through backend proxy when auth is available,
 * falls back to direct API calls with VITE_ env vars in dev mode.
 */
async function metaFetch(
  endpoint: string,
  options?: {
    method?: string;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    formEncoded?: boolean;
  }
): Promise<any> {
  const token = await getAuthToken();

  if (token) {
    // Proxy mode — token stays server-side
    // Routes through metaDevPolicyGuard for rate limiting, caching, and error classification
    const adAccountId = _currentAdAccount?.ad_account_id || undefined;

    return guardedFetch({
      endpoint,
      method: options?.method,
      params: options?.params,
      adAccountId,
      fetchFn: async () => {
        // Retry-aware fetch through the policy guard
        const data = await retryWithBackoff(async () => {
          const res = await fetch('/api/meta/proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              method: options?.method || 'GET',
              endpoint,
              params: options?.params,
              body: options?.body,
              formEncoded: options?.formEncoded,
              adAccountId,
            }),
          });

          // Extract rate limit headers from proxy response
          const rateLimitHeaders = extractRateLimitHeaders(res.headers);
          const responseData = await res.json();

          // Also check for rate limit headers embedded in error responses
          if (responseData._rateLimitHeaders) {
            updateRateLimitState(responseData._rateLimitHeaders);
          }

          if (!res.ok) {
            // Classify the error for proper retry/backoff handling
            const errorClass = classifyMetaError(responseData.code, responseData.subcode, res.status);
            if (errorClass.class === 'rate_limit') {
              console.warn(
                `[MetaDevPolicyGuard] Rate limited on ${endpoint}: ${errorClass.description}`
              );
            }

            const diagSuffix = responseData.diagnostics ? ` [${responseData.diagnostics}]` : '';
            const msg = (responseData.message || responseData.error || `Meta API error (${res.status})`) + diagSuffix;
            const err = new Error(msg);
            (err as any).metaCode = responseData.code;
            (err as any).metaSubcode = responseData.subcode;
            (err as any).fullResponse = responseData;
            throw err;
          }

          return { data: responseData, rateLimitHeaders };
        }, endpoint);

        return {
          data: data.data,
          headers: data.rateLimitHeaders || {},
        };
      },
    });
  }

  // Dev fallback — direct Meta API call
  if (!FALLBACK_ACCESS_TOKEN) {
    throw new Error('Meta API not configured. Set VITE_META_ACCESS_TOKEN or connect via admin.');
  }

  const url = new URL(`${META_GRAPH_API}/${endpoint}`);
  url.searchParams.set('access_token', FALLBACK_ACCESS_TOKEN);

  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }
  }

  const method = options?.method || 'GET';
  let fetchOptions: RequestInit = { method };

  if ((method === 'POST' || method === 'DELETE') && options?.body) {
    if (options.formEncoded) {
      const form = new URLSearchParams();
      form.set('access_token', FALLBACK_ACCESS_TOKEN);
      for (const [key, value] of Object.entries(options.body)) {
        if (value !== undefined && value !== null) {
          form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
      }
      fetchOptions.body = form.toString();
      fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    } else {
      fetchOptions.body = JSON.stringify({
        ...options.body,
        access_token: FALLBACK_ACCESS_TOKEN,
      });
      fetchOptions.headers = { 'Content-Type': 'application/json' };
    }
  }

  const response = await fetch(url.toString(), fetchOptions);
  const data = await response.json();

  if (!response.ok || data.error) {
    const msg = data.error?.message || `Meta API error (${response.status})`;
    const err = new Error(msg);
    (err as any).metaCode = data.error?.code;
    (err as any).fullResponse = data;
    throw err;
  }

  return data;
}

/**
 * Upload an image through the backend proxy or directly in dev mode.
 */
async function metaUpload(adAccountId: string, imageBase64: string): Promise<any> {
  const token = await getAuthToken();

  if (token) {
    // Route through guard queue to respect rate limits
    return guardedFetch({
      endpoint: `${adAccountId}/adimages`,
      method: 'POST',
      adAccountId: _currentAdAccount?.ad_account_id || undefined,
      fetchFn: async () => {
        const res = await fetch('/api/meta/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            imageBase64,
            adAccountId: _currentAdAccount?.ad_account_id || undefined,
          }),
        });

        const rateLimitHeaders = extractRateLimitHeaders(res.headers);
        const data = await res.json();
        if (!res.ok) {
          const err = new Error(data.message || data.error || 'Image upload failed');
          (err as any).metaCode = data.code;
          throw err;
        }
        return { data, headers: rateLimitHeaders || {} };
      },
    });
  }

  // Dev fallback — direct upload
  const url = `${META_GRAPH_API}/${adAccountId}/adimages`;
  const formData = new FormData();
  formData.append('access_token', FALLBACK_ACCESS_TOKEN);
  formData.append('bytes', imageBase64);

  const response = await fetch(url, { method: 'POST', body: formData });
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Failed to upload image');
  }

  return data;
}

/**
 * Get the current ad account ID.
 * In multi-account mode, returns the selected account's ID.
 * Falls back to the default credential row or env var.
 */
function getAdAccountId(): string {
  if (_currentAdAccount) return _currentAdAccount.ad_account_id;
  return _orgMeta?.adAccountId || FALLBACK_AD_ACCOUNT_ID;
}

/**
 * Get the current page ID.
 * In multi-account mode, returns the selected account's page ID.
 */
function getPageId(): string {
  if (_currentAdAccount?.page_id) return _currentAdAccount.page_id;
  return _orgMeta?.pageId || FALLBACK_PAGE_ID;
}

/**
 * Get the current pixel ID.
 * In multi-account mode, returns the selected account's pixel ID.
 */
export function getPixelId(): string {
  if (_currentAdAccount?.pixel_id) return _currentAdAccount.pixel_id;
  return _orgMeta?.pixelId || import.meta.env.VITE_META_PIXEL_ID || '';
}

// ─── Date range types ────────────────────────────────────────────────────────

export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_28d' | 'last_30d' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'maximum';

export interface DateRangeOptions {
  datePreset?: DatePreset;
  timeRange?: {
    since: string;
    until: string;
  };
}

function buildDateParams(dateOptions?: DateRangeOptions): Record<string, string> {
  if (dateOptions?.timeRange) {
    return { time_range: JSON.stringify(dateOptions.timeRange) };
  }
  return { date_preset: dateOptions?.datePreset || 'last_30d' };
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface MetaAdInsight {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpp: string;
  frequency: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export type DetectedConversionType = 'purchase' | 'lead' | 'both' | 'none';

// Meta reports conversions under multiple action types depending on tracking setup
// (pixel-only, Conversions API/CAPI, or both). Match all related types and take the max.
const PURCHASE_ACTION_TYPES = [
  'offsite_conversion.fb_pixel_purchase', // Pixel-only tracking
  'purchase',                              // Aggregated (pixel + CAPI)
  'omni_purchase',                         // Omnipanel (includes in-store + online)
];

const LEAD_ACTION_TYPES = [
  'lead',                                  // Aggregated lead events
  'offsite_conversion.fb_pixel_lead',      // Pixel-only lead tracking
  'onsite_conversion.lead_grouped',        // On-Facebook instant form leads
];

/**
 * Get conversion count by checking all related action types for a conversion category.
 * Returns the max value found across related types (they overlap as Meta aggregates differently).
 */
function getConversionCount(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string
): number {
  if (!actions) return 0;

  let typesToCheck: string[];

  if (actionType === 'offsite_conversion.fb_pixel_purchase') {
    typesToCheck = PURCHASE_ACTION_TYPES;
  } else if (actionType === 'lead') {
    typesToCheck = LEAD_ACTION_TYPES;
  } else {
    // Exact match for unknown action types
    return parseInt(actions.find(a => a.action_type === actionType)?.value || '0', 10);
  }

  const values = typesToCheck.map(type =>
    parseInt(actions.find(a => a.action_type === type)?.value || '0', 10)
  );
  return Math.max(...values, 0);
}

export interface AdCreative {
  id: string;
  headline: string;
  bodySnippet: string;
  conversions: number;
  conversionRate: number;
  costPerConversion: number;
  clickThroughRate: number;
  concept: string;
  status: 'Winning' | 'Testing' | 'Fatigued';
  confidence: 'High' | 'Medium' | 'Low';
  imageUrl?: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaignName: string;
  adsetName: string;
  adName?: string;        // Meta ad name — carries the creative-axis tag when published via the grid
  roas?: number;
  detectedConversionType?: DetectedConversionType;
  purchaseConversions: number;
  leadConversions: number;
}

export interface TrafficType {
  id: string;
  name: string;
  conversions: number;
  spend: number;
}

export type CampaignType = 'Prospecting' | 'Retargeting' | 'Retention' | 'Other';

export interface CampaignSummary {
  campaignId: string;
  campaignName: string;
  campaignType: CampaignType;
  spend: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
  // Extended Facebook Ads metrics
  leads: number;
  linkClicks: number;
  uniqueLinkClicks: number;
  postEngagements: number;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  videoViews: number;
  reach: number;
  // Objective-based result metrics
  results: number;
  objective?: string;
}

export interface CampaignTypeMetrics {
  campaignType: CampaignType;
  totalSpend: number;
  totalPurchases: number;
  totalPurchaseValue: number;
  totalClicks: number;
  totalImpressions: number;
  roas: number;
  costPerPurchase: number;
  conversionRate: number;
  aov: number;
  campaignCount: number;
  // Business-type-agnostic fields
  totalConversions: number;
  costPerConversion: number;
  totalLeads: number;
}

// ─── Campaign type detection ─────────────────────────────────────────────────

export function detectCampaignType(campaignName: string): CampaignType {
  const name = campaignName.toLowerCase();
  if (name.includes('prospecting') || name.includes('prospect') || name.includes('cold') || name.includes('acquisition')) return 'Prospecting';
  if (name.includes('retargeting') || name.includes('retarget') || name.includes('remarketing') || name.includes('warm')) return 'Retargeting';
  if (name.includes('retention') || name.includes('existing') || name.includes('customer') || name.includes('loyalty')) return 'Retention';
  return 'Other';
}

// ─── Objective → result action mapping ──────────────────────────────────────

/**
 * Map a campaign objective to the action_type that constitutes a "result" in Meta Ads Manager.
 * Falls back to the first non-zero conversion action if objective is unknown.
 */
function getResultActionType(objective?: string): string {
  switch (objective) {
    case 'OUTCOME_SALES':
      return 'offsite_conversion.fb_pixel_purchase';
    case 'OUTCOME_LEADS':
      return 'lead';
    case 'OUTCOME_TRAFFIC':
      return 'landing_page_view';
    case 'OUTCOME_ENGAGEMENT':
      return 'post_engagement';
    case 'OUTCOME_APP_PROMOTION':
      return 'app_installs';
    default:
      // Fallback: will be resolved per-campaign based on available actions
      return '';
  }
}

/**
 * Determine the result count for a campaign based on its objective.
 * If no objective is available, falls back to the first non-zero conversion action
 * in priority order: purchases → leads → landing page views → link clicks.
 */
function resolveResults(
  objective: string | undefined,
  getAction: (actionType: string) => number
): number {
  const resultActionType = getResultActionType(objective);
  if (resultActionType) {
    // For purchase/lead result types, check all related action types
    if (resultActionType === 'offsite_conversion.fb_pixel_purchase') {
      return Math.max(...PURCHASE_ACTION_TYPES.map(t => getAction(t)), 0);
    }
    if (resultActionType === 'lead') {
      return Math.max(...LEAD_ACTION_TYPES.map(t => getAction(t)), 0);
    }
    return getAction(resultActionType);
  }
  // Fallback: pick the first non-zero conversion in priority order (check all related types)
  const purchases = Math.max(...PURCHASE_ACTION_TYPES.map(t => getAction(t)), 0);
  if (purchases > 0) return purchases;
  const leads = Math.max(...LEAD_ACTION_TYPES.map(t => getAction(t)), 0);
  if (leads > 0) return leads;
  const lpv = getAction('landing_page_view');
  if (lpv > 0) return lpv;
  return getAction('link_click');
}

// ─── Read functions ──────────────────────────────────────────────────────────

/**
 * Fetch ad-level insights with creative details for conversion intelligence
 */
export async function fetchAdInsights(dateOptions?: DateRangeOptions): Promise<MetaAdInsight[]> {
  let adAccountId = getAdAccountId();
  if (!adAccountId) {
    await loadOrgMetaCredentials();
    adAccountId = getAdAccountId();
    if (!adAccountId) throw new Error('No ad account configured. Go to Integrations to select your ad account.');
  }

  try {
    const allInsights: MetaAdInsight[] = [];
    let after: string | undefined;

    // Paginate through all ad insights (Meta returns max 100 per page)
    do {
      const params: Record<string, string> = {
        fields: 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,impressions,clicks,spend,actions,ctr,cpc,cpp,frequency',
        level: 'ad',
        limit: '100',
        filtering: JSON.stringify([{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }]),
        ...buildDateParams(dateOptions),
      };
      if (after) params.after = after;

      const data = await metaFetch(`${adAccountId}/insights`, { params });
      const pageResults = data.data || [];
      allInsights.push(...pageResults);

      // Guard: stop if Meta returns an empty page (avoids infinite loop
      // when cursors are present but no data is returned)
      if (pageResults.length === 0) break;

      after = data.paging?.cursors?.after;
      // Safety cap — 1000 ads covers the vast majority of SMB accounts.
      // Each page is a separate proxied+rate-guarded API call, so unlimited
      // pagination risks rate limit violations on very large accounts.
    } while (after && allInsights.length < 1000);

    return allInsights;
  } catch (error) {
    console.error('Error fetching ad insights:', error);
    throw error;
  }
}

/** Max IDs per batch request to Meta's ?ids= endpoint */
const CREATIVE_BATCH_SIZE = 50;

const CREATIVE_FIELDS = 'name,creative{name,title,body,image_url,thumbnail_url,object_story_spec,effective_object_story_id}';

interface CreativeDetail {
  headline?: string;
  body?: string;
  imageUrl?: string;
}

/** Extract creative details from a single ad's API response object */
function parseCreativeFromResponse(adData: Record<string, unknown>): CreativeDetail {
  const creative = adData.creative as Record<string, unknown> | undefined;
  const spec = (creative?.object_story_spec as Record<string, unknown>) || undefined;
  const linkData = (spec?.link_data as Record<string, unknown>) || undefined;
  const videoData = (spec?.video_data as Record<string, unknown>) || undefined;
  const isCatalogAd = typeof creative?.name === 'string' && creative.name.includes('{{');

  const headline = isCatalogAd
    ? (adData.name as string | undefined)
    : (creative?.title || creative?.name || linkData?.name || videoData?.title || adData.name) as string | undefined;

  const body = isCatalogAd
    ? 'Dynamic catalog ad - content varies by product shown to each user'
    : (creative?.body || linkData?.message || linkData?.description || videoData?.message) as string | undefined;

  const imageUrl = (creative?.image_url || creative?.thumbnail_url || linkData?.picture || videoData?.picture) as string | undefined;

  return { headline, body, imageUrl };
}

/**
 * Fetch creative details for multiple ads in a single API call using Meta's ?ids= parameter.
 * Returns a Map of adId → creative details. Missing/failed IDs are silently skipped.
 */
async function fetchAdCreativeDetailsBatch(adIds: string[]): Promise<Map<string, CreativeDetail>> {
  const result = new Map<string, CreativeDetail>();
  if (adIds.length === 0) return result;

  try {
    // Meta's ?ids= endpoint returns an object keyed by ID, not a data array
    const data = await metaFetch('', {
      params: {
        ids: adIds.join(','),
        fields: CREATIVE_FIELDS,
      },
    });

    for (const [adId, adData] of Object.entries(data)) {
      if (adData && typeof adData === 'object') {
        result.set(adId, parseCreativeFromResponse(adData as Record<string, unknown>));
      }
    }
  } catch (error: unknown) {
    console.error('Batch creative fetch failed:', error instanceof Error ? error.message : error);
  }

  return result;
}

/**
 * Fetch creative details for all ads, using batched ?ids= requests.
 * Falls back to individual fetches for any IDs that fail in batch mode.
 */
async function fetchAllCreativeDetails(adIds: string[]): Promise<Map<string, CreativeDetail>> {
  const allDetails = new Map<string, CreativeDetail>();
  if (adIds.length === 0) return allDetails;

  // Split IDs into chunks for batch requests
  const chunks: string[][] = [];
  for (let i = 0; i < adIds.length; i += CREATIVE_BATCH_SIZE) {
    chunks.push(adIds.slice(i, i + CREATIVE_BATCH_SIZE));
  }

  if (import.meta.env.DEV) {
    console.log(`Fetching creative details: ${adIds.length} ads in ${chunks.length} batch request(s)`);
  }

  // Process chunks sequentially to respect the guard's rate limiting and usage tracking.
  // Each batch goes through guardedFetch which handles concurrency and inter-request delays.
  for (const chunk of chunks) {
    const batchMap = await fetchAdCreativeDetailsBatch(chunk);
    for (const [id, detail] of batchMap) {
      allDetails.set(id, detail);
    }
  }

  if (import.meta.env.DEV) {
    let logged = 0;
    for (const [adId, detail] of allDetails) {
      if (logged >= 3) break;
      console.log(`Extracted creative for ${adId}:`, { headline: detail.headline, hasBody: !!detail.body, hasImage: !!detail.imageUrl });
      logged++;
    }
    console.log(`Creative details loaded: ${allDetails.size}/${adIds.length}`);
  }

  return allDetails;
}

export interface FetchCreativeOptions {
  primaryActionType?: string;
  winningCVRThreshold?: number;
  fatiguedCVRThreshold?: number;
  winningConversionMin?: number;
  fatiguedSpendMin?: number;
  leadWinningCVRThreshold?: number;
  leadFatiguedCVRThreshold?: number;
}

/**
 * Fetch ad creatives with performance data
 */
export async function fetchAdCreatives(dateOptions?: DateRangeOptions, options?: FetchCreativeOptions): Promise<AdCreative[]> {
  try {
    const insights = await fetchAdInsights(dateOptions);

    // Batch-fetch creative details using Meta's ?ids= endpoint.
    // 50 IDs per request dramatically reduces API calls (e.g., 500 ads = 10 calls, not 500).
    // Each batch call goes through guardedFetch which handles rate limiting.
    const adIds = insights.map(ad => ad.ad_id).filter(Boolean);
    const creativeMap = await fetchAllCreativeDetails(adIds);

    return insights.map((ad, index) => {
      const creative = creativeMap.get(ad.ad_id) || {};
      const actionType = options?.primaryActionType || 'offsite_conversion.fb_pixel_purchase';

      // Always detect both purchase and lead conversion counts for filtering
      const purchases = getConversionCount(ad.actions, 'offsite_conversion.fb_pixel_purchase');
      const leads = getConversionCount(ad.actions, 'lead');

      let detectedConversionType: DetectedConversionType;
      if (purchases > 0 && leads > 0) {
        detectedConversionType = 'both';
      } else if (purchases > 0) {
        detectedConversionType = 'purchase';
      } else if (leads > 0) {
        detectedConversionType = 'lead';
      } else {
        detectedConversionType = 'none';
      }

      let conversionCount: number;
      if (actionType === 'hybrid') {
        conversionCount = Math.max(purchases, leads);
      } else {
        conversionCount = getConversionCount(ad.actions, actionType);
      }

      const spend = parseFloat(ad.spend || '0');
      const clicks = parseInt(ad.clicks || '0', 10);
      const impressions = parseInt(ad.impressions || '0', 10);

      const conversionRate = clicks > 0 ? (conversionCount / clicks) * 100 : 0;
      const costPerConversion = conversionCount > 0 ? spend / conversionCount : 0;
      const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;

      // Use type-aware thresholds for hybrid accounts
      const isLeadAd = detectedConversionType === 'lead';
      const winCVR = isLeadAd
        ? (options?.leadWinningCVRThreshold ?? 15)
        : (options?.winningCVRThreshold ?? 5);
      const fatigueCVR = isLeadAd
        ? (options?.leadFatiguedCVRThreshold ?? 3)
        : (options?.fatiguedCVRThreshold ?? 1);
      const winMin = options?.winningConversionMin ?? 10;
      const fatigueSpend = options?.fatiguedSpendMin ?? 50;

      let status: 'Winning' | 'Testing' | 'Fatigued' = 'Testing';
      if (conversionRate > winCVR && conversionCount > winMin) status = 'Winning';
      else if (spend > fatigueSpend && conversionRate < fatigueCVR) status = 'Fatigued';

      let confidence: 'High' | 'Medium' | 'Low' = 'Low';
      if (clicks > 1000 && conversionCount > 20) confidence = 'High';
      else if (clicks > 100 && conversionCount > 5) confidence = 'Medium';

      return {
        id: ad.ad_id || `ad-${index}`,
        headline: creative.headline || ad.ad_name || `Ad ${index + 1}`,
        bodySnippet: creative.body || 'No ad copy available',
        conversions: conversionCount,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        costPerConversion: parseFloat(costPerConversion.toFixed(2)),
        clickThroughRate: parseFloat(clickThroughRate.toFixed(2)),
        concept: ad.campaign_name || 'Meta Campaign',
        status,
        confidence,
        imageUrl: creative.imageUrl,
        spend,
        impressions,
        clicks,
        campaignName: ad.campaign_name,
        adsetName: ad.adset_name,
        adName: ad.ad_name,
        detectedConversionType,
        purchaseConversions: purchases,
        leadConversions: leads,
      };
    });
  } catch (error) {
    console.error('Error processing ad creatives:', error);
    throw error;
  }
}

/**
 * Fetch traffic type performance
 */
export async function fetchTrafficTypes(dateOptions?: DateRangeOptions, options?: { primaryActionType?: string }): Promise<TrafficType[]> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) return [];

  try {
    const data = await metaFetch(`${adAccountId}/insights`, {
      params: {
        fields: 'campaign_name,spend,actions',
        level: 'campaign',
        limit: '100',
        ...buildDateParams(dateOptions),
      },
    });

    const trafficActionType = options?.primaryActionType || 'offsite_conversion.fb_pixel_purchase';
    return (data.data || []).map((campaign: any, index: number) => {
      let conversions: number;
      if (trafficActionType === 'hybrid') {
        const purchases = getConversionCount(campaign.actions, 'offsite_conversion.fb_pixel_purchase');
        const leads = getConversionCount(campaign.actions, 'lead');
        conversions = purchases + leads;
      } else {
        conversions = getConversionCount(campaign.actions, trafficActionType);
      }
      return {
        id: campaign.campaign_id || `traffic-${index}`,
        name: campaign.campaign_name || 'Unknown',
        spend: parseFloat(campaign.spend || '0'),
        conversions,
      };
    });
  } catch (error) {
    console.error('Error fetching traffic types:', error);
    return [];
  }
}

/**
 * Fetch campaign summaries with purchase conversion value for dashboard
 */
export async function fetchCampaignSummaries(dateOptions?: DateRangeOptions): Promise<CampaignSummary[]> {
  let adAccountId = getAdAccountId();
  if (!adAccountId) {
    // Cache might be stale — force refresh from backend
    await loadOrgMetaCredentials();
    adAccountId = getAdAccountId();
    if (!adAccountId) {
      throw new Error('No ad account configured. Go to Integrations to select your ad account.');
    }
  }

  try {
    // Fetch insights and campaign objectives in parallel
    const [data, campaignsData] = await Promise.all([
      metaFetch(`${adAccountId}/insights`, {
        params: {
          fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,actions,action_values,reach,unique_actions',
          level: 'campaign',
          limit: '100',
          ...buildDateParams(dateOptions),
        },
      }),
      // Fetch campaign objectives to determine what "results" means per campaign
      metaFetch(`${adAccountId}/campaigns`, {
        params: {
          fields: 'id,objective',
          limit: '100',
        },
      }).catch(() => ({ data: [] })), // Non-fatal — fall back to heuristic if this fails
    ]);

    // Build objective lookup: campaignId → objective
    const objectiveMap = new Map<string, string>();
    for (const c of campaignsData.data || []) {
      if (c.id && c.objective) objectiveMap.set(c.id, c.objective);
    }

    return (data.data || []).map((campaign: any, index: number) => {
      const spend = parseFloat(campaign.spend || '0');
      const impressions = parseInt(campaign.impressions || '0', 10);
      const clicks = parseInt(campaign.clicks || '0', 10);
      const ctr = parseFloat(campaign.ctr || '0');
      const reach = parseInt(campaign.reach || '0', 10);

      // Helper to extract a value from the actions array by action_type
      const getAction = (actionType: string): number =>
        parseInt(campaign.actions?.find((a: any) => a.action_type === actionType)?.value || '0', 10);
      const getActionValue = (actionType: string): number =>
        parseFloat(campaign.action_values?.find((a: any) => a.action_type === actionType)?.value || '0');
      const getUniqueAction = (actionType: string): number =>
        parseInt(campaign.unique_actions?.find((a: any) => a.action_type === actionType)?.value || '0', 10);

      // Check all purchase-related action types (pixel, CAPI, omnipanel)
      const purchases = Math.max(
        ...PURCHASE_ACTION_TYPES.map(t => getAction(t)), 0
      );
      const purchaseValue = Math.max(
        ...PURCHASE_ACTION_TYPES.map(t => getActionValue(t)), 0
      );
      const roas = spend > 0 ? purchaseValue / spend : 0;
      const campaignName = campaign.campaign_name || 'Unknown';
      const campaignId = campaign.campaign_id || `campaign-${index}`;
      const objective = objectiveMap.get(campaignId);

      return {
        campaignId,
        campaignName,
        campaignType: detectCampaignType(campaignName),
        spend,
        purchases,
        purchaseValue,
        roas,
        impressions,
        clicks,
        ctr,
        leads: Math.max(...LEAD_ACTION_TYPES.map(t => getAction(t)), 0),
        linkClicks: getAction('link_click'),
        uniqueLinkClicks: getUniqueAction('link_click'),
        postEngagements: getAction('post_engagement'),
        landingPageViews: getAction('landing_page_view'),
        addToCart: getAction('offsite_conversion.fb_pixel_add_to_cart'),
        initiateCheckout: getAction('offsite_conversion.fb_pixel_initiate_checkout'),
        videoViews: getAction('video_view'),
        reach,
        results: resolveResults(objective, getAction),
        objective,
      };
    });
  } catch (error) {
    console.error('Error fetching campaign summaries:', error);
    return [];
  }
}

/**
 * Fetch account-level insights for deduplicated metrics (reach, purchases).
 * Fetched at account level (not summed across campaigns) so Meta deduplicates
 * actions that span multiple campaigns — preventing inflated counts.
 *
 * Note: Meta's `unique_actions` field does NOT support conversion-type actions
 * like purchases — only engagement actions (link_click, post_engagement, etc.).
 * We use `actions` at account level instead, which still deduplicates across
 * campaigns but counts multiple purchases by the same person separately.
 */
export interface AccountLevelInsights {
  reach: number;
  uniqueLinkClicks: number;
  /** Account-level purchase count (deduplicated across campaigns, not per-person) */
  uniquePurchases: number;
  /** Account-level lead count (deduplicated across campaigns) */
  uniqueLeads: number;
}

export async function fetchAccountLevelInsights(dateOptions?: DateRangeOptions): Promise<AccountLevelInsights> {
  let adAccountId = getAdAccountId();
  if (!adAccountId) {
    await loadOrgMetaCredentials();
    adAccountId = getAdAccountId();
    if (!adAccountId) {
      return { reach: 0, uniqueLinkClicks: 0, uniquePurchases: 0, uniqueLeads: 0 };
    }
  }

  try {
    const data = await metaFetch(`${adAccountId}/insights`, {
      params: {
        fields: 'reach,actions,unique_actions',
        ...buildDateParams(dateOptions),
      },
    });

    const row = data.data?.[0];
    if (!row) return { reach: 0, uniqueLinkClicks: 0, uniquePurchases: 0, uniqueLeads: 0 };

    const reach = parseInt(row.reach || '0', 10);

    // unique_actions works for engagement actions (link_click) but NOT conversions
    const uniqueLinkClicks = parseInt(
      row.unique_actions?.find((a: any) => a.action_type === 'link_click')?.value || '0',
      10
    );

    // Use account-level `actions` for purchases — deduplicates across campaigns
    // (Meta's unique_actions doesn't support offsite_conversion action types)
    // Check all purchase-related action types (pixel, CAPI, omnipanel)
    const uniquePurchases = getConversionCount(row.actions, 'offsite_conversion.fb_pixel_purchase');

    // Check all lead-related action types
    const uniqueLeads = getConversionCount(row.actions, 'lead');

    return { reach, uniqueLinkClicks, uniquePurchases, uniqueLeads };
  } catch (error: unknown) {
    console.error('Error fetching account-level insights:', error);
    return { reach: 0, uniqueLinkClicks: 0, uniquePurchases: 0, uniqueLeads: 0 };
  }
}

/**
 * Get aggregated metrics by campaign type
 * @param campaigns - Campaign summaries to aggregate
 * @param options - Optional config for business-type-aware aggregation
 */
export function aggregateByType(
  campaigns: CampaignSummary[],
  options?: { primaryConversionField?: 'purchases' | 'leads'; includeLeadsInTotal?: boolean }
): CampaignTypeMetrics[] {
  const typeMap = new Map<CampaignType, CampaignTypeMetrics>();
  const useLeads = options?.primaryConversionField === 'leads';
  const includeLeadsInTotal = options?.includeLeadsInTotal ?? false;

  const types: CampaignType[] = ['Prospecting', 'Retargeting', 'Retention', 'Other'];
  types.forEach(type => {
    typeMap.set(type, {
      campaignType: type,
      totalSpend: 0,
      totalPurchases: 0,
      totalPurchaseValue: 0,
      totalClicks: 0,
      totalImpressions: 0,
      roas: 0,
      costPerPurchase: 0,
      conversionRate: 0,
      aov: 0,
      campaignCount: 0,
      totalConversions: 0,
      costPerConversion: 0,
      totalLeads: 0,
    });
  });

  campaigns.forEach(campaign => {
    const metrics = typeMap.get(campaign.campaignType)!;
    metrics.totalSpend += campaign.spend;
    metrics.totalPurchases += campaign.purchases;
    metrics.totalPurchaseValue += campaign.purchaseValue;
    metrics.totalClicks += campaign.clicks;
    metrics.totalImpressions += campaign.impressions;
    metrics.totalLeads += campaign.leads;
    metrics.campaignCount += 1;
    // Business-type-agnostic: use the correct conversion field
    // For hybrid, combine purchases + leads (avoiding double-counting)
    if (includeLeadsInTotal) {
      metrics.totalConversions += campaign.purchases + campaign.leads;
    } else {
      metrics.totalConversions += useLeads ? campaign.leads : campaign.purchases;
    }
  });

  typeMap.forEach(metrics => {
    metrics.roas = metrics.totalSpend > 0 ? metrics.totalPurchaseValue / metrics.totalSpend : 0;
    metrics.costPerPurchase = metrics.totalPurchases > 0 ? metrics.totalSpend / metrics.totalPurchases : 0;
    metrics.conversionRate = metrics.totalClicks > 0 ? (metrics.totalConversions / metrics.totalClicks) * 100 : 0;
    metrics.aov = metrics.totalPurchases > 0 ? metrics.totalPurchaseValue / metrics.totalPurchases : 0;
    metrics.costPerConversion = metrics.totalConversions > 0 ? metrics.totalSpend / metrics.totalConversions : 0;
  });

  return Array.from(typeMap.values());
}

/**
 * Test Meta API connection
 */
export async function testMetaConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) return { success: false, message: 'No ad account configured' };

  try {
    const data = await metaFetch(adAccountId, {
      params: { fields: 'name,account_id,account_status' },
    });

    return { success: true, message: 'Connected successfully', data };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// =============================================================================
// AD PUBLISHER - Meta Marketing API Write Functions
// =============================================================================

export type CampaignObjective = 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_TRAFFIC';
export type CallToActionType = 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'SUBSCRIBE' | 'GET_OFFER' | 'BOOK_NOW' | 'CONTACT_US' | 'DOWNLOAD' | 'APPLY_NOW' | 'BUY_NOW' | 'ORDER_NOW' | 'LISTEN_NOW' | 'GET_SHOWTIMES' | 'REQUEST_TIME' | 'SEE_MENU' | 'PLAY_GAME';
export type ConversionEvent = 'PURCHASE' | 'ADD_TO_CART' | 'LEAD' | 'COMPLETE_REGISTRATION' | 'INITIATE_CHECKOUT' | 'ADD_PAYMENT_INFO' | 'SEARCH' | 'VIEW_CONTENT';
export type GenderTarget = 0 | 1 | 2;
export type BudgetMode = 'ABO' | 'CBO';

/**
 * The conversion event an objective optimizes for by default: lead-class objectives → LEAD,
 * everything else → PURCHASE. Single source of truth so the publisher UI and the ad-set builder
 * can't drift into an objective/event mismatch (which Meta rejects as "Invalid parameter").
 */
export function defaultConversionEventForObjective(objective: CampaignObjective): ConversionEvent {
  return objective === 'OUTCOME_LEADS' ? 'LEAD' : 'PURCHASE';
}

export interface DetailedTargetingItem {
  id: string;
  name: string;
  type: 'interest' | 'behavior' | 'demographic';
  audienceSize?: number;
}

export interface PixelRef {
  id: string;
  name: string;
}

export interface AudienceRef {
  id: string;
  name: string;
  subtype?: string;
  approximateCount?: number;
}

export type PublisherPlatform = 'facebook' | 'instagram' | 'audience_network' | 'messenger';
export type FacebookPosition = 'feed' | 'right_hand_column' | 'marketplace' | 'video_feeds' | 'story' | 'reels' | 'search' | 'instream_video';
export type InstagramPosition = 'stream' | 'story' | 'reels' | 'explore' | 'explore_home' | 'profile_feed';

export interface PlacementConfig {
  automatic: boolean;
  publisherPlatforms?: PublisherPlatform[];
  facebookPositions?: FacebookPosition[];
  instagramPositions?: InstagramPosition[];
}

export interface FullTargetingSpec {
  geoLocations: { countries: string[] };
  ageMin: number;
  ageMax: number;
  genders: GenderTarget[];
  flexibleSpec?: DetailedTargetingItem[][];
  customAudiences?: AudienceRef[];
  excludedCustomAudiences?: AudienceRef[];
}

export interface PublishPreset {
  id: string;
  name: string;
  createdAt: string;
  config: {
    campaignObjective: CampaignObjective;
    budgetMode: BudgetMode;
    dailyBudget: number;
    conversionEvent?: ConversionEvent;
    pixelId?: string;
    targeting: FullTargetingSpec;
    placements: PlacementConfig;
    landingPageUrl: string;
    ctaButtonType?: CallToActionType;
    urlParameters?: string;
    adSetSplit?: 'single' | 'by_angle'; // BlitzScale grid: one ad set per angle vs one shared
  };
}

export interface CampaignForPublish {
  id: string;
  name: string;
  status: string;
  objective: string;
  budgetMode: BudgetMode;
}

export interface AdSetForPublish {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  dailyBudget?: number;
}

export interface CreateCampaignRequest {
  name: string;
  objective: CampaignObjective;
  budgetMode: BudgetMode;
  dailyBudget?: number;
}

export interface CreateAdSetRequest {
  name: string;
  campaignId: string;
  dailyBudget?: number;
  optimization: 'CONVERSIONS' | 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS' | 'OFFSITE_CONVERSIONS';
  targeting: FullTargetingSpec;
  placements: PlacementConfig;
  promotedObject?: {
    pixelId: string;
    customEventType: string;
  };
}

export interface CreateAdRequest {
  name: string;
  adsetId: string;
  imageHash: string;
  headline: string;
  bodyText: string;
  linkUrl: string;
  callToAction: CallToActionType;
  pageId?: string;
}

export interface PublishConfig {
  mode: 'new_campaign' | 'new_adset' | 'existing_adset';
  ads: Array<{
    mediaType: 'image' | 'video';  // Per-ad media type
    imageBase64?: string;           // For image ads
    veoFileRef?: string;            // For video ads (Veo file reference)
    headline: string;
    bodyText: string;
    callToAction: CallToActionType;
    axisTag?: AxisTag;              // creative-axis tag → encoded into the Meta ad name
  }>;
  settings: {
    campaignName?: string;
    campaignObjective?: CampaignObjective;
    budgetMode?: BudgetMode;
    adsetName?: string;
    dailyBudget?: number;
    landingPageUrl: string;
    urlTags?: string;
    pageId?: string;
    conversionEvent?: ConversionEvent;
    pixelId?: string;
    targeting?: FullTargetingSpec;
    placements?: PlacementConfig;
  };
  existingCampaignId?: string;
  existingAdSetId?: string;
  // BlitzScale grid: split ads across multiple ad sets (e.g. one per angle). Each ad
  // index must appear in exactly one group. Ignored when mode is 'existing_adset'.
  adSetGroups?: Array<{ name: string; adIndices: number[] }>;
}

export interface PublishResult {
  success: boolean;
  campaignId?: string;
  adsetId?: string;
  adIds?: string[];
  creativeIds?: string[];
  imageHashes?: string[];
  videoIds?: string[];
  error?: string;
  details?: string;
}

// ─── Ad Library Search ───────────────────────────────────────────────────────

export interface AdLibrarySearchParams {
  searchTerms?: string;
  searchPageIds?: string[];
  countries?: string[];
  activeStatus?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  dateMin?: string;  // YYYY-MM-DD
  dateMax?: string;
  platforms?: ('FACEBOOK' | 'INSTAGRAM' | 'AUDIENCE_NETWORK' | 'MESSENGER')[];
  limit?: number;
  after?: string;  // pagination cursor
}

export interface AdLibraryResult {
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  page_name?: string;
  page_id?: string;
  publisher_platforms?: string[];
}

export interface AdLibraryResponse {
  data: AdLibraryResult[];
  paging?: {
    cursors?: { after?: string; before?: string };
    next?: string;
  };
}

export async function searchAdLibrary(params: AdLibrarySearchParams): Promise<AdLibraryResponse> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Meta API not configured. Connect your Meta account to search the Ad Library.');
  }

  // Route through guard queue to respect rate limits (ads_archive uses Meta Graph API)
  return guardedFetch({
    endpoint: 'ads_archive',
    method: 'GET',
    fetchFn: async () => {
      const res = await fetch('/api/meta/ad-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          search_terms: params.searchTerms,
          search_page_ids: params.searchPageIds,
          ad_reached_countries: params.countries || ['GB'],
          ad_active_status: params.activeStatus || 'ALL',
          ad_delivery_date_min: params.dateMin,
          ad_delivery_date_max: params.dateMax,
          publisher_platforms: params.platforms,
          limit: params.limit || 25,
          after: params.after,
        }),
      });

      const rateLimitHeaders = extractRateLimitHeaders(res.headers);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (import.meta.env.DEV) {
          console.warn('Ad Library API error details:', {
            code: errData.code,
            type: errData.type,
            token_type: errData.token_type,
            meta_message: errData.meta_message,
          });
        }
        const errMsg = errData.message || `Ad Library search failed (${res.status})`;
        const err = new Error(errMsg);
        (err as any).metaCode = errData.code;
        throw err;
      }

      const data = await res.json();
      return { data, headers: rateLimitHeaders || {} };
    },
  });
}

/**
 * Batch-extract og:image preview URLs from Ad Library snapshot pages.
 * Returns a map of snapshot_url → image_url (or null if extraction failed).
 */
export async function fetchSnapshotImages(snapshotUrls: string[]): Promise<Record<string, string | null>> {
  if (snapshotUrls.length === 0) return {};

  const token = await getAuthToken();
  if (!token) return {};

  try {
    const res = await fetch('/api/meta/snapshot-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ urls: snapshotUrls }),
    });

    if (!res.ok) return {};
    const data = await res.json();
    return data.images || {};
  } catch {
    return {};
  }
}

// ─── Page validation ─────────────────────────────────────────────────────────

/**
 * Validate that the current access token can use the Facebook Page for ad creation.
 */
export async function validatePageAccess(pageId?: string): Promise<{ valid: boolean; pageName?: string; error?: string; diagnosis?: string }> {
  const targetPageId = pageId || getPageId();
  const adAccountId = getAdAccountId();

  if (!targetPageId) {
    return { valid: false, error: 'No Facebook Page ID configured', diagnosis: 'Set Page ID in admin Meta setup.' };
  }

  try {
    const pageData = await metaFetch(targetPageId, {
      params: { fields: 'name,id' },
    });

    // Page is readable — verify it's linked to the ad account
    if (adAccountId) {
      try {
        const promoteData = await metaFetch(`${adAccountId}/promote_pages`, {
          params: { fields: 'id,name' },
        });

        if (promoteData.data) {
          const pageLinked = promoteData.data.some((p: { id: string }) => p.id === targetPageId);
          if (!pageLinked) {
            return {
              valid: false,
              pageName: pageData.name,
              error: `Page "${pageData.name}" is not linked to ad account ${adAccountId} for promotion.`,
              diagnosis: 'In Business Manager, assign the Page to the ad account.',
            };
          }
        }
      } catch {
        // promote_pages check failed — log but don't block
        console.warn('Could not verify Page via promote_pages — proceeding');
      }
    }

    return { valid: true, pageName: pageData.name };
  } catch (err: unknown) {
    const metaCode = (err as any)?.metaCode;

    // Permission errors — try fallback via promote_pages
    if ((metaCode === 10 || metaCode === 100) && adAccountId) {
      try {
        const promoteData = await metaFetch(`${adAccountId}/promote_pages`, {
          params: { fields: 'id,name' },
        });

        if (promoteData.data) {
          const matchedPage = promoteData.data.find((p: { id: string }) => p.id === targetPageId);
          if (matchedPage) {
            return { valid: true, pageName: matchedPage.name };
          }
        }
      } catch {
        // Fallback also failed
      }

      return { valid: false, error: err instanceof Error ? err.message : 'Page access failed', diagnosis: `Page ID ${targetPageId} is not accessible.` };
    }

    return { valid: false, error: err instanceof Error ? err.message : 'Page access failed', diagnosis: 'Network error checking Page access.' };
  }
}

// ─── Image upload ────────────────────────────────────────────────────────────

async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
      resolve(cleanBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload an image to the Meta Ad Account.
 * Accepts either base64 data or an image URL.
 * Returns the image hash for use in ad creatives.
 */
export async function uploadAdImage(imageSource: string): Promise<string> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  let cleanBase64: string;
  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    cleanBase64 = await imageUrlToBase64(imageSource);
  } else {
    cleanBase64 = imageSource.replace(/^data:image\/\w+;base64,/, '');
  }

  const data = await metaUpload(adAccountId, cleanBase64);

  const images = data.images;
  const imageKey = Object.keys(images)[0];
  const imageHash = images[imageKey]?.hash;

  if (!imageHash) throw new Error('No image hash returned from Meta');
  return imageHash;
}

// ─── Campaign / Ad Set / Ad fetch ────────────────────────────────────────────

export async function fetchCampaignsForPublish(): Promise<CampaignForPublish[]> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) return [];

  const data = await metaFetch(`${adAccountId}/campaigns`, {
    params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget', limit: '100' },
  });

  const ALLOWED_STATUSES = new Set(['ACTIVE', 'PAUSED']);
  return (data.data || [])
    .filter((c: any) => ALLOWED_STATUSES.has(c.status))
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      budgetMode: (c.daily_budget || c.lifetime_budget) ? 'CBO' as BudgetMode : 'ABO' as BudgetMode,
    }));
}

export async function fetchAdSetsForPublish(campaignId?: string): Promise<AdSetForPublish[]> {
  const adAccountId = getAdAccountId();
  const endpoint = campaignId ? `${campaignId}/adsets` : `${adAccountId}/adsets`;

  const data = await metaFetch(endpoint, {
    params: { fields: 'id,name,status,campaign_id,daily_budget', limit: '100' },
  });

  const ALLOWED_STATUSES = new Set(['ACTIVE', 'PAUSED']);
  return (data.data || [])
    .filter((a: any) => ALLOWED_STATUSES.has(a.status))
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      campaignId: a.campaign_id,
      dailyBudget: a.daily_budget ? parseInt(a.daily_budget) / 100 : undefined,
    }));
}

// ─── Campaign / Ad Set / Ad creation ─────────────────────────────────────────

export async function createCampaign(request: CreateCampaignRequest): Promise<string> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  const body: Record<string, unknown> = {
    name: request.name,
    objective: request.objective,
    status: 'PAUSED',
    special_ad_categories: [],
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  };

  if (request.budgetMode === 'CBO' && request.dailyBudget) {
    body.daily_budget = Math.round(request.dailyBudget * 100);
  } else {
    body.is_adset_budget_sharing_enabled = false;
  }

  // Campaigns use JSON content type
  const data = await metaFetch(`${adAccountId}/campaigns`, {
    method: 'POST',
    body,
  });

  if (!data.id) throw new Error('Campaign creation returned no ID');
  invalidateCache('campaigns');
  return data.id;
}

export async function createAdSet(request: CreateAdSetRequest): Promise<string> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  let optimizationGoal = request.optimization;
  if (request.promotedObject) {
    optimizationGoal = 'OFFSITE_CONVERSIONS';
  } else if (optimizationGoal === 'OFFSITE_CONVERSIONS') {
    // A conversion optimization with no pixel/event would silently fall back to delivering for clicks.
    // Refuse loudly instead — conversion ad sets must carry a promoted_object.
    throw new Error('Conversion optimization requires a pixel and conversion event (promoted_object).');
  }

  const targeting: Record<string, any> = {
    geo_locations: { countries: request.targeting.geoLocations.countries },
    age_min: request.targeting.ageMin,
    age_max: request.targeting.ageMax,
  };

  if (request.targeting.genders && !request.targeting.genders.includes(0)) {
    targeting.genders = request.targeting.genders;
  }
  if (request.targeting.flexibleSpec && request.targeting.flexibleSpec.length > 0) {
    targeting.flexible_spec = request.targeting.flexibleSpec.map(group => {
      const spec: Record<string, { id: string; name: string }[]> = {};
      for (const item of group) {
        const key = item.type === 'behavior' ? 'behaviors' : 'interests';
        if (!spec[key]) spec[key] = [];
        spec[key].push({ id: item.id, name: item.name });
      }
      return spec;
    });
  }
  if (request.targeting.customAudiences && request.targeting.customAudiences.length > 0) {
    targeting.custom_audiences = request.targeting.customAudiences.map(a => ({ id: a.id }));
  }
  if (request.targeting.excludedCustomAudiences && request.targeting.excludedCustomAudiences.length > 0) {
    targeting.excluded_custom_audiences = request.targeting.excludedCustomAudiences.map(a => ({ id: a.id }));
  }

  // Ad sets use form-encoded body
  const body: Record<string, unknown> = {
    name: request.name,
    campaign_id: request.campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    targeting,
    status: 'PAUSED',
    destination_type: 'WEBSITE',
  };

  if (request.dailyBudget) {
    body.daily_budget = String(Math.round(request.dailyBudget * 100));
  }

  if (request.promotedObject) {
    body.promoted_object = {
      pixel_id: request.promotedObject.pixelId,
      custom_event_type: request.promotedObject.customEventType,
    };
  }

  if (!request.placements.automatic) {
    if (request.placements.publisherPlatforms?.length) body.publisher_platforms = request.placements.publisherPlatforms;
    if (request.placements.facebookPositions?.length) body.facebook_positions = request.placements.facebookPositions;
    if (request.placements.instagramPositions?.length) body.instagram_positions = request.placements.instagramPositions;
  }

  const data = await metaFetch(`${adAccountId}/adsets`, {
    method: 'POST',
    body,
    formEncoded: true,
  });

  if (!data.id) throw new Error('Ad set creation returned no ID');
  invalidateCache('adsets');
  return data.id;
}

export async function createAdCreative(request: CreateAdRequest): Promise<string> {
  const adAccountId = getAdAccountId();
  const pageId = request.pageId || getPageId();
  if (!pageId) throw new Error('Facebook Page ID is required.');

  const objectStorySpec = {
    page_id: pageId,
    link_data: {
      image_hash: request.imageHash,
      link: request.linkUrl,
      message: request.bodyText,
      name: request.headline,
      call_to_action: {
        type: request.callToAction,
        value: { link: request.linkUrl },
      },
    },
  };

  const data = await metaFetch(`${adAccountId}/adcreatives`, {
    method: 'POST',
    body: {
      name: request.name,
      object_story_spec: objectStorySpec,
    },
    formEncoded: true,
  });

  if (!data.id) throw new Error('Ad creative creation returned no ID');
  return data.id;
}

export async function createAdWithCreative(request: {
  name: string;
  adsetId: string;
  pageId: string;
  imageHash: string;
  headline: string;
  bodyText: string;
  linkUrl: string;
  callToAction: string;
  pixelId?: string;
  urlTags?: string;
}): Promise<{ adId: string; creativeId: string }> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  const creative: Record<string, unknown> = {
    name: request.name,
    object_story_spec: {
      page_id: request.pageId,
      link_data: {
        image_hash: request.imageHash,
        link: request.linkUrl,
        message: request.bodyText,
        name: request.headline,
        description: request.headline,
        call_to_action: {
          type: request.callToAction,
          value: { link: request.linkUrl },
        },
      },
    },
  };

  if (request.urlTags) {
    creative.url_tags = request.urlTags;
  }

  const body: Record<string, unknown> = {
    name: request.name,
    adset_id: request.adsetId,
    creative,
    status: 'PAUSED',
  };

  if (request.pixelId) {
    body.tracking_specs = [
      { 'action.type': ['offsite_conversion'], 'fb_pixel': [request.pixelId] },
    ];
  }

  const data = await metaFetch(`${adAccountId}/ads`, {
    method: 'POST',
    body,
    formEncoded: true,
  });

  if (!data.id) throw new Error('Ad creation returned no ID');
  invalidateCache('ads');
  return { adId: data.id, creativeId: data.creative_id || '' };
}

/**
 * Upload a Veo-generated video to Meta via the backend chunked upload proxy.
 * Backend fetches from Veo using server-side GEMINI_API_KEY, then does chunked upload to Meta.
 */
export async function uploadVideoToMeta(veoFileRef: string, title?: string): Promise<string> {
  const token = await getAuthToken();

  // Route through guard queue to respect rate limits
  const data: any = await guardedFetch({
    endpoint: 'advideos',
    method: 'POST',
    adAccountId: _currentAdAccount?.ad_account_id || undefined,
    fetchFn: async () => {
      const response = await fetch('/api/meta/video-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ veoFileRef, title }),
      });

      const rateLimitHeaders = extractRateLimitHeaders(response.headers);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Unknown error' }));
        const error = new Error(err.message || `Video upload failed (${response.status})`);
        (error as any).metaCode = err.code;
        throw error;
      }

      const responseData = await response.json();
      return { data: responseData, headers: rateLimitHeaders || {} };
    },
  });

  if (!data.video_id) {
    throw new Error('Video upload returned no video_id');
  }

  // Ensure video is fully processed before returning — Meta will reject ad creation
  // if the video is still processing. The backend polls for up to 2 minutes, but may
  // return with status 'processing' on timeout.
  if (data.status && data.status !== 'ready') {
    throw new Error(
      `Video uploaded (ID: ${data.video_id}) but Meta is still processing it (status: ${data.status}). ` +
      'Please wait a minute and try publishing again.'
    );
  }

  return data.video_id;
}

/**
 * Create an ad with a video creative (inline spec, same pattern as image ads).
 * Uses object_story_spec.video_data instead of link_data.
 */
export async function createAdWithVideoCreative(request: {
  name: string;
  adsetId: string;
  pageId: string;
  videoId: string;
  headline: string;
  bodyText: string;
  linkUrl: string;
  callToAction: string;
  pixelId?: string;
  urlTags?: string;
}): Promise<{ adId: string; creativeId: string }> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  const creative: Record<string, unknown> = {
    name: request.name,
    object_story_spec: {
      page_id: request.pageId,
      video_data: {
        video_id: request.videoId,
        title: request.headline,
        message: request.bodyText,
        link_description: request.headline,
        call_to_action: {
          type: request.callToAction,
          value: { link: request.linkUrl },
        },
      },
    },
  };

  if (request.urlTags) {
    creative.url_tags = request.urlTags;
  }

  const body: Record<string, unknown> = {
    name: request.name,
    adset_id: request.adsetId,
    creative,
    status: 'PAUSED',
  };

  if (request.pixelId) {
    body.tracking_specs = [
      { 'action.type': ['offsite_conversion'], 'fb_pixel': [request.pixelId] },
    ];
  }

  const data = await metaFetch(`${adAccountId}/ads`, {
    method: 'POST',
    body,
    formEncoded: true,
  });

  if (!data.id) throw new Error('Video ad creation returned no ID');
  invalidateCache('ads');
  return { adId: data.id, creativeId: data.creative_id || '' };
}

// ─── Targeting & Audiences ───────────────────────────────────────────────────

export async function searchTargetingSuggestions(
  query: string,
  type: 'adinterest' | 'adinterestsuggestion' | 'adTargetingCategory' = 'adinterest'
): Promise<DetailedTargetingItem[]> {
  if (!query.trim()) return [];

  const data = await metaFetch('search', {
    params: { q: query, type, limit: '25' },
  });

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.type === 'interests' ? 'interest' : item.type === 'behaviors' ? 'behavior' : 'demographic',
    audienceSize: item.audience_size || item.audience_size_upper_bound,
  }));
}

export async function fetchCustomAudiences(): Promise<AudienceRef[]> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) return [];

  const data = await metaFetch(`${adAccountId}/customaudiences`, {
    params: {
      fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound',
      limit: '100',
    },
  });

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    subtype: item.subtype,
    approximateCount: item.approximate_count_upper_bound || item.approximate_count_lower_bound,
  }));
}

export async function fetchAdPixels(): Promise<PixelRef[]> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) return [];

  // Try adspixels first
  try {
    const data = await metaFetch(`${adAccountId}/adspixels`, {
      params: { fields: 'id,name', limit: '100' },
    });

    if (data.data && data.data.length > 0) {
      return data.data.map((item: any) => ({
        id: item.id,
        name: item.name || `Pixel ${item.id}`,
      }));
    }
  } catch {
    console.warn('adspixels endpoint failed, trying datasets');
  }

  // Fallback to datasets
  const data = await metaFetch(`${adAccountId}/datasets`, {
    params: { fields: 'id,name', limit: '100' },
  });

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name || `Dataset ${item.id}`,
  }));
}

// ─── Publish orchestrator ────────────────────────────────────────────────────

export async function publishAds(config: PublishConfig): Promise<PublishResult> {
  console.log('Starting ad publish process...', config.mode);

  const adAccountId = getAdAccountId();
  const budgetMode = config.settings.budgetMode || 'CBO';
  const defaultTargeting: FullTargetingSpec = {
    geoLocations: { countries: ['US', 'AU', 'GB', 'CA'] },
    ageMin: 18,
    ageMax: 65,
    genders: [0],
  };
  const defaultPlacements: PlacementConfig = { automatic: true };

  const result: PublishResult = {
    success: false,
    imageHashes: [],
    videoIds: [],
    creativeIds: [],
    adIds: [],
  };

  // Per-ad upload results: image_hash for images, video_id for videos
  const adMediaIds: Array<{ type: 'image' | 'video'; imageHash?: string; videoId?: string }> = [];

  const diagnostics: string[] = [];

  try {
    // Step 0a: Validate ad-set grouping BEFORE any media upload, so a bad grouping or an
    // under-minimum ABO split fails fast without wasting uploads.
    if (config.adSetGroups && config.adSetGroups.length > 0) {
      if (config.mode === 'existing_adset') {
        throw new Error('Cannot split into multiple ad sets when publishing into an existing ad set.');
      }
      const seenIdx = new Set<number>();
      for (const group of config.adSetGroups) {
        if (!group.adIndices || group.adIndices.length === 0) {
          throw new Error(`Ad-set group "${group.name}" has no ads assigned.`);
        }
        for (const idx of group.adIndices) {
          if (idx < 0 || idx >= config.ads.length) {
            throw new Error(`Ad-set group "${group.name}" references an out-of-range ad index (${idx}).`);
          }
          if (seenIdx.has(idx)) throw new Error(`Ad ${idx} is assigned to more than one ad set.`);
          seenIdx.add(idx);
        }
      }
      if (seenIdx.size !== config.ads.length) {
        throw new Error(`Ad-set groups cover ${seenIdx.size} of ${config.ads.length} ads — every ad must be in exactly one group.`);
      }
      if (budgetMode === 'ABO' && Math.floor((config.settings.dailyBudget || 50) / config.adSetGroups.length) < 1) {
        throw new Error(`Splitting $${config.settings.dailyBudget || 50}/day across ${config.adSetGroups.length} ad sets is below Meta's $1/day per-ad-set minimum. Raise the budget, switch to CBO, or use fewer groups.`);
      }
    }

    // Step 0: Validate Page access
    const pageValidation = await validatePageAccess(config.settings.pageId);
    if (!pageValidation.valid) {
      console.warn(`Page pre-validation failed: ${pageValidation.error} — proceeding anyway`);
    }

    // Step 1: Upload media per ad (image or video)
    for (let i = 0; i < config.ads.length; i++) {
      const ad = config.ads[i];
      const mediaType = ad.mediaType || 'image'; // Backwards compat default

      if (mediaType === 'video') {
        if (!ad.veoFileRef) {
          throw new Error(`Video ad ${i + 1} is missing veoFileRef — regenerate the video before publishing.`);
        }
        try {
          console.log(`Uploading video ${i + 1} to Meta via backend proxy...`);
          const videoId = await uploadVideoToMeta(ad.veoFileRef, ad.headline);
          adMediaIds.push({ type: 'video', videoId });
          result.videoIds!.push(videoId);
        } catch (vidError: unknown) {
          throw new Error(`Video upload failed for ad ${i + 1}: ${vidError instanceof Error ? vidError.message : 'Unknown error'}`);
        }
      } else {
        // Image upload (default)
        if (!ad.imageBase64) {
          throw new Error(`Image ad ${i + 1} is missing image data — regenerate the image before publishing.`);
        }
        try {
          const hash = await uploadAdImage(ad.imageBase64);
          adMediaIds.push({ type: 'image', imageHash: hash });
          result.imageHashes!.push(hash);
        } catch (imgError: unknown) {
          throw new Error(`Image upload failed for ad ${i + 1}: ${imgError instanceof Error ? imgError.message : 'Unknown error'}`);
        }
      }
    }

    // Step 1.5: Run diagnostics
    try {
      const acctData = await metaFetch(adAccountId, {
        params: { fields: 'account_status,disable_reason,name,currency,capabilities' },
      });
      const statusNames: Record<number, string> = { 1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW', 9: 'IN_GRACE_PERIOD', 101: 'CLOSED' };
      diagnostics.push(`Account: "${acctData.name}" status=${statusNames[acctData.account_status] || acctData.account_status}`);
      if (acctData.account_status !== 1) {
        throw new Error(`Ad account is not active (status: ${statusNames[acctData.account_status] || acctData.account_status}). Check Business Manager.`);
      }
    } catch (acctErr: unknown) {
      if (acctErr instanceof Error && acctErr.message.includes('not active')) throw acctErr;
      console.warn('Account check failed:', acctErr instanceof Error ? acctErr.message : acctErr);
    }

    // Determine effective objective. Sales and Leads are CONVERSION objectives — they optimize for a
    // pixel conversion event and require a pixel. We never silently downgrade a conversion objective to
    // traffic/link-clicks (that delivers the wrong audience — the bug that shipped link-click ad sets).
    // If the pixel is missing we fail clearly BEFORE creating a campaign, so nothing is left orphaned.
    const effectiveObjective = config.settings.campaignObjective || 'OUTCOME_SALES';
    const isConversionObjective = effectiveObjective === 'OUTCOME_SALES' || effectiveObjective === 'OUTCOME_LEADS';
    if (isConversionObjective && !config.settings.pixelId) {
      throw new Error(
        `${effectiveObjective === 'OUTCOME_LEADS' ? 'Leads' : 'Sales'} campaigns optimize for conversions and require a Meta Pixel. ` +
        'Add a pixel for this account in Integrations, then republish.'
      );
    }

    // Step 2: Create or select campaign
    let campaignId: string;
    if (config.mode === 'new_campaign') {
      campaignId = await createCampaign({
        name: config.settings.campaignName || 'CI Generated Campaign',
        objective: effectiveObjective,
        budgetMode,
        dailyBudget: budgetMode === 'CBO' ? (config.settings.dailyBudget || 50) : undefined,
      });
      result.campaignId = campaignId;

      // Wait for campaign propagation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify campaign
      const verifyData = await metaFetch(campaignId, {
        params: { fields: 'id,name,status,objective' },
      });
      console.log(`Campaign verified: ${verifyData.name} (${verifyData.status})`);
    } else {
      campaignId = config.existingCampaignId!;
      result.campaignId = campaignId;
    }

    // Step 3: Create or select ad set(s). Supports splitting ads across multiple ad sets
    // (config.adSetGroups) — e.g. one ad set per angle. Default = a single ad set.
    const adIndexToAdsetId: string[] = new Array(config.ads.length);
    if (config.mode === 'existing_adset') {
      const existingId = config.existingAdSetId!;
      adIndexToAdsetId.fill(existingId);
      result.adsetId = existingId;
    } else {
      const targeting = config.settings.targeting || defaultTargeting;
      const placements = config.settings.placements || defaultPlacements;

      // Conversion objectives (Sales, Leads) ALWAYS optimize for their pixel conversion event, never
      // link clicks. The configured event is kept objective-consistent at the source (the publisher
      // resets it when the objective changes), so here we trust it and only fall back to the
      // objective's default when it's unset.
      let optimization: 'LINK_CLICKS' | 'OFFSITE_CONVERSIONS' | 'LANDING_PAGE_VIEWS' | 'CONVERSIONS' = 'LINK_CLICKS';
      let promotedObject: { pixelId: string; customEventType: string } | undefined;

      if (isConversionObjective) {
        optimization = 'OFFSITE_CONVERSIONS';
        promotedObject = {
          pixelId: config.settings.pixelId!, // presence validated before campaign creation
          customEventType: config.settings.conversionEvent || defaultConversionEventForObjective(effectiveObjective),
        };
      }

      const groups = (config.adSetGroups && config.adSetGroups.length > 0)
        ? config.adSetGroups
        : [{ name: config.settings.adsetName || 'CI Generated Ad Set', adIndices: config.ads.map((_, idx) => idx) }];

      // ABO budget lives on each ad set — divide the daily budget across groups so the
      // total ≈ the user's intent (CBO shares one campaign budget automatically).
      const perAdsetBudget = budgetMode === 'ABO'
        ? Math.max(1, Math.floor((config.settings.dailyBudget || 50) / groups.length))
        : undefined;

      for (const group of groups) {
        const newAdsetId = await createAdSet({
          name: (group.name || 'CI Generated Ad Set').substring(0, 120),
          campaignId,
          dailyBudget: perAdsetBudget,
          optimization,
          targeting,
          placements,
          promotedObject,
        });
        for (const idx of group.adIndices) {
          if (idx >= 0 && idx < adIndexToAdsetId.length) adIndexToAdsetId[idx] = newAdsetId;
        }
        if (!result.adsetId) result.adsetId = newAdsetId; // first ad set → deep link target
      }
    }

    // Step 4: Create ads with inline creatives (per-ad media type dispatch)
    const pageId = config.settings.pageId || getPageId();
    if (!pageId) throw new Error('Facebook Page ID is required.');

    for (let i = 0; i < config.ads.length; i++) {
      const ad = config.ads[i];
      const media = adMediaIds[i];
      const adsetForAd = adIndexToAdsetId[i] || result.adsetId!;

      let adId: string;
      let creativeId: string;

      if (media.type === 'video' && media.videoId) {
        // Video ad — use video_data spec
        const result2 = await createAdWithVideoCreative({
          name: buildAdName(ad.axisTag, i, ad.headline, 'video'),
          adsetId: adsetForAd,
          pageId,
          videoId: media.videoId,
          headline: ad.headline,
          bodyText: ad.bodyText,
          linkUrl: config.settings.landingPageUrl,
          callToAction: ad.callToAction,
          pixelId: config.settings.pixelId,
          urlTags: config.settings.urlTags,
        });
        adId = result2.adId;
        creativeId = result2.creativeId;
      } else {
        // Image ad — use link_data spec
        const result2 = await createAdWithCreative({
          name: buildAdName(ad.axisTag, i, ad.headline, 'image'),
          adsetId: adsetForAd,
          pageId,
          imageHash: media.imageHash || '',
          headline: ad.headline,
          bodyText: ad.bodyText,
          linkUrl: config.settings.landingPageUrl,
          callToAction: ad.callToAction,
          pixelId: config.settings.pixelId,
          urlTags: config.settings.urlTags,
        });
        adId = result2.adId;
        creativeId = result2.creativeId;
      }

      result.adIds!.push(adId);
      if (creativeId) result.creativeIds!.push(creativeId);
    }

    result.success = true;
    return result;

  } catch (error: unknown) {
    console.error('Publish failed:', error);
    const diagText = diagnostics.length ? `\n\nDiagnostics:\n${diagnostics.join('\n')}` : '';
    result.error = (error instanceof Error ? error.message : 'Unknown error') + diagText;
    result.details = error instanceof Error ? error.stack : undefined;
    return result;
  }
}

// ─── Ad Account Management (multi-account) ────────────────────────────────────

export interface AdAccountListResponse {
  accounts: AdAccountInfo[];
  seats: number;
  seatsUsed: number;
  maxAccounts: number;
}

/**
 * Refresh the available ad accounts and pages from the Meta Graph API
 * using the stored token. Does not require re-authorization — just re-fetches
 * the list from Meta and updates the cached metadata.
 * Returns the updated lists and whether any stale selections were cleared.
 */
export async function refreshAvailableData(): Promise<{
  availableAccounts: AvailableAdAccount[];
  availablePages: AvailablePage[];
  selectionsCleared: boolean;
}> {
  const token = await getAuthToken();

  // Route through guard queue — backend calls Meta Graph API (me/adaccounts + me/accounts)
  return guardedFetch({
    endpoint: 'me/adaccounts',
    method: 'GET',
    fetchFn: async () => {
      const res = await fetch('/api/meta/refresh-available', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const rateLimitHeaders = extractRateLimitHeaders(res.headers);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to refresh available data (${res.status})`);
      }

      const data = await res.json();
      return { data, headers: rateLimitHeaders || {} };
    },
  });
}

/** Fetch activated ad accounts and seat info for the current org */
export async function fetchAdAccounts(): Promise<AdAccountListResponse> {
  const token = await getAuthToken();
  const res = await fetch('/api/meta/ad-accounts', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch ad accounts (${res.status})`);
  }
  return res.json();
}

/** Activate a new ad account (uses a seat) */
export async function activateAdAccount(adAccountId: string, config?: {
  pageId?: string;
  pixelId?: string;
}): Promise<{ success: boolean }> {
  const token = await getAuthToken();
  const res = await fetch('/api/meta/ad-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'activate',
      adAccountId,
      pageId: config?.pageId,
      pixelId: config?.pixelId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to activate ad account (${res.status})`);
  }
  return res.json();
}

/** Deactivate an ad account (frees a seat) */
export async function deactivateAdAccount(adAccountId: string): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch('/api/meta/ad-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'deactivate',
      adAccountId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to deactivate ad account (${res.status})`);
  }
}

/** Update configuration (page_id, pixel_id, products) for an activated ad account */
export async function configureAdAccount(adAccountId: string, config: {
  pageId?: string | null;
  pixelId?: string | null;
  businessType?: import('../types/organization').BusinessType | null;
  products?: ProductMetadata[];
  reference_image_metadata?: ReferenceImageMetadata[];
}): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch('/api/meta/ad-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: 'configure',
      adAccountId,
      pageId: config.pageId,
      pixelId: config.pixelId,
      businessType: config.businessType,
      ...(config.products !== undefined ? { products: config.products } : {}),
      ...(config.reference_image_metadata !== undefined ? { reference_image_metadata: config.reference_image_metadata } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to configure ad account (${res.status})`);
  }
}

/**
 * Persist reference image metadata (without base64) to Supabase so other
 * ad accounts can see it for cross-account import. Non-fatal — failures
 * are logged but don't block the user.
 */
export async function saveReferenceImageMetadata(
  adAccountId: string,
  metadata: ReferenceImageMetadata[],
): Promise<void> {
  try {
    await configureAdAccount(adAccountId, { reference_image_metadata: metadata });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Failed to persist reference image metadata to Supabase:', msg);
  }
}
