// Meta Marketing API Service
// All API calls are routed through the backend proxy (/api/meta/proxy)
// which handles per-org credential loading and token decryption.
// Falls back to VITE_ env vars in dev mode when Supabase is not configured.

import { getAuthToken } from '../lib/authToken';

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

interface AvailableAdAccount {
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

interface OrgMetaIds {
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
}

let _orgMeta: OrgMetaIds | null = null;

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
    };
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
    };
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
}

/**
 * Save ad account / page / pixel selection for the current org.
 * Used by the self-service onboarding flow.
 */
export async function saveMetaSelection(selection: {
  adAccountId: string;
  pageId: string | null;
  pixelId: string | null;
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
 * Fetch available pixels for a given ad account.
 * Used by the self-service onboarding flow.
 */
export async function fetchAvailablePixels(adAccountId: string): Promise<Array<{ id: string; name: string }>> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/meta/fetch-pixels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ adAccountId }),
  });

  if (!res.ok) {
    console.warn('Failed to fetch pixels');
    return [];
  }

  const data = await res.json();
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
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.message || data.error || `Meta API error (${res.status})`;
      const err = new Error(msg);
      (err as any).metaCode = data.code;
      (err as any).metaSubcode = data.subcode;
      (err as any).fullResponse = data;
      throw err;
    }

    return data;
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
    const res = await fetch('/api/meta/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ imageBase64 }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Image upload failed');
    }
    return data;
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
 * Get the current ad account ID (from org credentials or env var fallback)
 */
function getAdAccountId(): string {
  return _orgMeta?.adAccountId || FALLBACK_AD_ACCOUNT_ID;
}

/**
 * Get the current page ID (from org credentials or env var fallback)
 */
function getPageId(): string {
  return _orgMeta?.pageId || FALLBACK_PAGE_ID;
}

/**
 * Get the current pixel ID (from org credentials or env var fallback)
 */
export function getPixelId(): string {
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
  roas?: number;
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
}

// ─── Campaign type detection ─────────────────────────────────────────────────

function detectCampaignType(campaignName: string): CampaignType {
  const name = campaignName.toLowerCase();
  if (name.includes('prospecting') || name.includes('prospect') || name.includes('cold') || name.includes('acquisition')) return 'Prospecting';
  if (name.includes('retargeting') || name.includes('retarget') || name.includes('remarketing') || name.includes('warm')) return 'Retargeting';
  if (name.includes('retention') || name.includes('existing') || name.includes('customer') || name.includes('loyalty')) return 'Retention';
  return 'Other';
}

// ─── Read functions ──────────────────────────────────────────────────────────

/**
 * Fetch ad-level insights with creative details for conversion intelligence
 */
export async function fetchAdInsights(dateOptions?: DateRangeOptions): Promise<MetaAdInsight[]> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  try {
    const data = await metaFetch(`${adAccountId}/insights`, {
      params: {
        fields: 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,impressions,clicks,spend,actions,ctr,cpc,cpp,frequency',
        level: 'ad',
        limit: '100',
        filtering: JSON.stringify([{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }]),
        ...buildDateParams(dateOptions),
      },
    });
    return data.data || [];
  } catch (error) {
    console.error('Error fetching ad insights:', error);
    throw error;
  }
}

let adCounter = 0;

/**
 * Fetch actual ad creative content
 */
async function fetchAdCreativeDetails(adId: string): Promise<{
  headline?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  callToAction?: string;
}> {
  adCounter++;
  const logThis = adCounter <= 3;

  try {
    const data = await metaFetch(adId, {
      params: {
        fields: 'name,creative{name,title,body,image_url,thumbnail_url,object_story_spec,effective_object_story_id}',
      },
    });

    let headline: string | undefined;
    let body: string | undefined;
    let imageUrl: string | undefined;

    const creative = data.creative;
    const spec = creative?.object_story_spec;
    const isCatalogAd = creative?.name?.includes('{{') || false;

    if (isCatalogAd) {
      headline = data.name;
    } else {
      headline = creative?.title || creative?.name || spec?.link_data?.name || spec?.video_data?.title || data.name;
    }

    if (isCatalogAd) {
      body = 'Dynamic catalog ad - content varies by product shown to each user';
    } else {
      body = creative?.body || spec?.link_data?.message || spec?.link_data?.description || spec?.video_data?.message;
    }

    imageUrl = creative?.image_url || spec?.link_data?.picture || spec?.video_data?.picture;

    if (logThis) {
      console.log(`Extracted creative for ${adId}:`, { headline, hasBody: !!body, hasImage: !!imageUrl });
    }

    return { headline, body, imageUrl, videoUrl: undefined, callToAction: undefined };
  } catch (error) {
    if (logThis) console.error(`Error fetching creative for ad ${adId}:`, error);
    return {};
  }
}

/**
 * Fetch ad creatives with performance data
 */
export async function fetchAdCreatives(dateOptions?: DateRangeOptions): Promise<AdCreative[]> {
  adCounter = 0;

  try {
    const insights = await fetchAdInsights(dateOptions);

    const creativeDetailsPromises = insights.map(ad => fetchAdCreativeDetails(ad.ad_id));
    const creativeDetails = await Promise.all(creativeDetailsPromises);

    return insights.map((ad, index) => {
      const creative = creativeDetails[index];
      const conversions = ad.actions?.find(
        action => action.action_type === 'offsite_conversion.fb_pixel_purchase'
      )?.value || '0';

      const spend = parseFloat(ad.spend || '0');
      const conversionCount = parseInt(conversions, 10);
      const clicks = parseInt(ad.clicks || '0', 10);
      const impressions = parseInt(ad.impressions || '0', 10);

      const conversionRate = clicks > 0 ? (conversionCount / clicks) * 100 : 0;
      const costPerConversion = conversionCount > 0 ? spend / conversionCount : 0;
      const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;

      let status: 'Winning' | 'Testing' | 'Fatigued' = 'Testing';
      if (conversionRate > 5 && conversionCount > 10) status = 'Winning';
      else if (spend > 50 && conversionRate < 1) status = 'Fatigued';

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
export async function fetchTrafficTypes(dateOptions?: DateRangeOptions): Promise<TrafficType[]> {
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

    return (data.data || []).map((campaign: any, index: number) => ({
      id: campaign.campaign_id || `traffic-${index}`,
      name: campaign.campaign_name || 'Unknown',
      spend: parseFloat(campaign.spend || '0'),
      conversions: parseInt(
        campaign.actions?.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0',
        10
      ),
    }));
  } catch (error) {
    console.error('Error fetching traffic types:', error);
    return [];
  }
}

/**
 * Fetch campaign summaries with purchase conversion value for dashboard
 */
export async function fetchCampaignSummaries(dateOptions?: DateRangeOptions): Promise<CampaignSummary[]> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) return [];

  try {
    const data = await metaFetch(`${adAccountId}/insights`, {
      params: {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,actions,action_values',
        level: 'campaign',
        limit: '100',
        ...buildDateParams(dateOptions),
      },
    });

    return (data.data || []).map((campaign: any, index: number) => {
      const spend = parseFloat(campaign.spend || '0');
      const impressions = parseInt(campaign.impressions || '0', 10);
      const clicks = parseInt(campaign.clicks || '0', 10);
      const ctr = parseFloat(campaign.ctr || '0');
      const purchases = parseInt(
        campaign.actions?.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0',
        10
      );
      const purchaseValue = parseFloat(
        campaign.action_values?.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
      );
      const roas = spend > 0 ? purchaseValue / spend : 0;
      const campaignName = campaign.campaign_name || 'Unknown';

      return {
        campaignId: campaign.campaign_id || `campaign-${index}`,
        campaignName,
        campaignType: detectCampaignType(campaignName),
        spend,
        purchases,
        purchaseValue,
        roas,
        impressions,
        clicks,
        ctr,
      };
    });
  } catch (error) {
    console.error('Error fetching campaign summaries:', error);
    return [];
  }
}

/**
 * Get aggregated metrics by campaign type
 */
export function aggregateByType(campaigns: CampaignSummary[]): CampaignTypeMetrics[] {
  const typeMap = new Map<CampaignType, CampaignTypeMetrics>();

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
    });
  });

  campaigns.forEach(campaign => {
    const metrics = typeMap.get(campaign.campaignType)!;
    metrics.totalSpend += campaign.spend;
    metrics.totalPurchases += campaign.purchases;
    metrics.totalPurchaseValue += campaign.purchaseValue;
    metrics.totalClicks += campaign.clicks;
    metrics.totalImpressions += campaign.impressions;
    metrics.campaignCount += 1;
  });

  typeMap.forEach(metrics => {
    metrics.roas = metrics.totalSpend > 0 ? metrics.totalPurchaseValue / metrics.totalSpend : 0;
    metrics.costPerPurchase = metrics.totalPurchases > 0 ? metrics.totalSpend / metrics.totalPurchases : 0;
    metrics.conversionRate = metrics.totalClicks > 0 ? (metrics.totalPurchases / metrics.totalClicks) * 100 : 0;
    metrics.aov = metrics.totalPurchases > 0 ? metrics.totalPurchaseValue / metrics.totalPurchases : 0;
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
  };
}

export interface CampaignForPublish {
  id: string;
  name: string;
  status: string;
  objective: string;
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
    imageBase64: string;
    headline: string;
    bodyText: string;
    callToAction: CallToActionType;
  }>;
  settings: {
    campaignName?: string;
    campaignObjective?: CampaignObjective;
    budgetMode?: BudgetMode;
    adsetName?: string;
    dailyBudget?: number;
    landingPageUrl: string;
    pageId?: string;
    conversionEvent?: ConversionEvent;
    pixelId?: string;
    targeting?: FullTargetingSpec;
    placements?: PlacementConfig;
  };
  existingCampaignId?: string;
  existingAdSetId?: string;
}

export interface PublishResult {
  success: boolean;
  campaignId?: string;
  adsetId?: string;
  adIds?: string[];
  creativeIds?: string[];
  imageHashes?: string[];
  error?: string;
  details?: string;
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
    params: { fields: 'id,name,status,objective', limit: '100' },
  });

  const ALLOWED_STATUSES = new Set(['ACTIVE', 'PAUSED']);
  return (data.data || [])
    .filter((c: any) => ALLOWED_STATUSES.has(c.status))
    .map((c: any) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective }));
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
  return data.id;
}

export async function createAdSet(request: CreateAdSetRequest): Promise<string> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  let optimizationGoal = request.optimization;
  if (request.promotedObject) {
    optimizationGoal = 'OFFSITE_CONVERSIONS';
  } else if (optimizationGoal === 'OFFSITE_CONVERSIONS' && !request.promotedObject) {
    optimizationGoal = 'LINK_CLICKS';
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
}): Promise<{ adId: string; creativeId: string }> {
  const adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error('No ad account configured');

  const creative = {
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
    creativeIds: [],
    adIds: [],
  };

  const diagnostics: string[] = [];

  try {
    // Step 0: Validate Page access
    const pageValidation = await validatePageAccess(config.settings.pageId);
    if (!pageValidation.valid) {
      console.warn(`Page pre-validation failed: ${pageValidation.error} — proceeding anyway`);
    }

    // Step 1: Upload all images
    for (let i = 0; i < config.ads.length; i++) {
      try {
        const hash = await uploadAdImage(config.ads[i].imageBase64);
        result.imageHashes!.push(hash);
      } catch (imgError: unknown) {
        throw new Error(`Image upload failed for ad ${i + 1}: ${imgError instanceof Error ? imgError.message : 'Unknown error'}`);
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

    // Determine effective objective
    let effectiveObjective = config.settings.campaignObjective || 'OUTCOME_SALES';
    if (effectiveObjective === 'OUTCOME_SALES' && !config.settings.pixelId) {
      console.warn('No pixel configured — switching objective from OUTCOME_SALES to OUTCOME_TRAFFIC');
      effectiveObjective = 'OUTCOME_TRAFFIC';
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

    // Step 3: Create or select ad set
    let adsetId: string;
    if (config.mode === 'existing_adset') {
      adsetId = config.existingAdSetId!;
    } else {
      const targeting = config.settings.targeting || defaultTargeting;
      const placements = config.settings.placements || defaultPlacements;

      let optimization: 'LINK_CLICKS' | 'OFFSITE_CONVERSIONS' | 'LANDING_PAGE_VIEWS' | 'CONVERSIONS' = 'LINK_CLICKS';
      let promotedObject: { pixelId: string; customEventType: string } | undefined;

      if (effectiveObjective === 'OUTCOME_SALES' && config.settings.pixelId) {
        optimization = 'OFFSITE_CONVERSIONS';
        promotedObject = {
          pixelId: config.settings.pixelId,
          customEventType: config.settings.conversionEvent || 'PURCHASE',
        };
      }

      adsetId = await createAdSet({
        name: config.settings.adsetName || 'CI Generated Ad Set',
        campaignId,
        dailyBudget: budgetMode === 'ABO' ? (config.settings.dailyBudget || 50) : undefined,
        optimization,
        targeting,
        placements,
        promotedObject,
      });
    }
    result.adsetId = adsetId;

    // Step 4: Create ads with inline creatives
    const pageId = config.settings.pageId || getPageId();
    if (!pageId) throw new Error('Facebook Page ID is required.');

    for (let i = 0; i < config.ads.length; i++) {
      const ad = config.ads[i];
      const imageHash = result.imageHashes![i];

      const { adId, creativeId } = await createAdWithCreative({
        name: `CI Ad ${i + 1} - ${ad.headline.substring(0, 30)}`,
        adsetId,
        pageId,
        imageHash,
        headline: ad.headline,
        bodyText: ad.bodyText,
        linkUrl: config.settings.landingPageUrl,
        callToAction: ad.callToAction,
        pixelId: config.settings.pixelId,
      });
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
