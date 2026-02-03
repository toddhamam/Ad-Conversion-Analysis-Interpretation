// Meta Marketing API Service
console.log('🔥🔥🔥 metaApi.ts VERSION 5.0 LOADED AT', new Date().toISOString(), '🔥🔥🔥');

const META_API_VERSION = 'v21.0';
const META_GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;

const ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = import.meta.env.VITE_META_AD_ACCOUNT_ID;

// Date range options for API calls
export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_28d' | 'last_30d' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'maximum';

export interface DateRangeOptions {
  datePreset?: DatePreset;
  timeRange?: {
    since: string;  // YYYY-MM-DD format
    until: string;  // YYYY-MM-DD format
  };
}

// Debug: Log the token being loaded (first and last 10 chars for security)
console.log('🔑 Loaded Access Token:', ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 10)}...${ACCESS_TOKEN.substring(ACCESS_TOKEN.length - 10)}` : 'MISSING');
console.log('📊 Loaded Ad Account ID:', AD_ACCOUNT_ID);

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
  ctr: string;  // Click-through rate
  cpc: string;  // Cost per click
  cpp: string;  // Cost per 1000 impressions
  frequency: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
}

export interface AdCreative {
  id: string;
  headline: string;
  bodySnippet: string;
  conversions: number;
  conversionRate: number;  // NEW: Conversion rate %
  costPerConversion: number;  // NEW: Cost per conversion
  clickThroughRate: number;  // NEW: CTR %
  concept: string;
  status: 'Winning' | 'Testing' | 'Fatigued';
  confidence: 'High' | 'Medium' | 'Low';
  imageUrl?: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaignName: string;  // NEW: For context
  adsetName: string;  // NEW: For context
  roas?: number;  // Return on Ad Spend
}

export interface TrafficType {
  id: string;
  name: string;
  conversions: number;
  spend: number;
}

// Campaign type classification
export type CampaignType = 'Prospecting' | 'Retargeting' | 'Retention' | 'Other';

// Campaign summary with conversion value for dashboard
export interface CampaignSummary {
  campaignId: string;
  campaignName: string;
  campaignType: CampaignType;
  spend: number;
  purchases: number;
  purchaseValue: number;  // Total conversion value
  roas: number;  // Return on Ad Spend (purchaseValue / spend)
  impressions: number;
  clicks: number;
  ctr: number;
}

// Aggregated metrics by campaign type
export interface CampaignTypeMetrics {
  campaignType: CampaignType;
  totalSpend: number;
  totalPurchases: number;
  totalPurchaseValue: number;
  totalClicks: number;
  totalImpressions: number;
  roas: number;
  costPerPurchase: number;  // CPP: Total Spend / Total Purchases
  conversionRate: number;   // CR%: (Purchases / Clicks) * 100
  aov: number;              // AOV: Total Purchase Value / Total Purchases
  campaignCount: number;
}

/**
 * Detect campaign type from campaign name
 */
function detectCampaignType(campaignName: string): CampaignType {
  const name = campaignName.toLowerCase();

  if (name.includes('prospecting') || name.includes('prospect') || name.includes('cold') || name.includes('acquisition')) {
    return 'Prospecting';
  }
  if (name.includes('retargeting') || name.includes('retarget') || name.includes('remarketing') || name.includes('warm')) {
    return 'Retargeting';
  }
  if (name.includes('retention') || name.includes('existing') || name.includes('customer') || name.includes('loyalty')) {
    return 'Retention';
  }

  return 'Other';
}

/**
 * Fetch ad insights from Meta Marketing API
 */
/**
 * Fetch ad-level insights with creative details for conversion intelligence
 */
export async function fetchAdInsights(dateOptions?: DateRangeOptions): Promise<MetaAdInsight[]> {
  console.log('🔍 Fetching Ad-Level Insights with Creative Details...');
  console.log('Access Token:', ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 20)}...` : 'MISSING');
  console.log('Ad Account ID:', AD_ACCOUNT_ID);
  console.log('📅 Date Options:', dateOptions);

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;

    // Fetch AD-LEVEL data with creative details for conversion intelligence
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,impressions,clicks,spend,actions,ctr,cpc,cpp,frequency',
      level: 'ad',  // Changed from 'campaign' to 'ad' for creative-level insights
      limit: '100',  // Increased limit to get more ad data
      filtering: JSON.stringify([{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }])  // Only ads with impressions
    });

    // Add date range parameters
    if (dateOptions?.timeRange) {
      // Use custom time range
      params.set('time_range', JSON.stringify(dateOptions.timeRange));
    } else {
      // Use date preset (default to last_30d)
      params.set('date_preset', dateOptions?.datePreset || 'last_30d');
    }

    const fullUrl = `${url}?${params}`;
    console.log('🌐 Request URL:', fullUrl.replace(ACCESS_TOKEN, 'TOKEN_HIDDEN'));

    const response = await fetch(fullUrl);

    console.log('📡 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:', errorText);

      try {
        const errorJson = JSON.parse(errorText);
        console.error('❌ Parsed error:', errorJson);
        throw new Error(`Meta API error: ${errorJson.error?.message || response.statusText}`);
      } catch {
        throw new Error(`Meta API error: ${response.statusText} - ${errorText}`);
      }
    }

    const data = await response.json();
    console.log('✅ Ad-level data received:', data);
    console.log('✅ Number of ads:', data.data?.length || 0);
    return data.data || [];
  } catch (error) {
    console.error('❌ Error fetching ad insights:', error);
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
  const logThis = adCounter <= 3; // Log first 3 ads for debugging

  try {
    const url = `${META_GRAPH_API}/${adId}`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'name,creative{name,title,body,image_url,thumbnail_url,object_story_spec,effective_object_story_id}'
    });

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      if (logThis) console.warn(`❌ Failed to fetch creative for ad ${adId}:`, response.status);
      return {};
    }

    const data = await response.json();

    if (logThis) {
      console.log(`📦📦📦 COMPLETE AD DATA FOR ${adId}:`, JSON.stringify(data, null, 2));
    }

    let headline: string | undefined;
    let body: string | undefined;
    let imageUrl: string | undefined;

    const creative = data.creative;
    const spec = creative?.object_story_spec;

    // Check if this is a dynamic catalog ad (contains template variables like {{product.name}})
    const isCatalogAd = creative?.name?.includes('{{') || false;

    // Extract headline - for catalog ads, use the ad name instead of template
    if (isCatalogAd) {
      headline = data.name; // Use ad name like "Retargeting - Ad 4" for catalog ads
    } else {
      headline = creative?.title ||
                 creative?.name ||
                 spec?.link_data?.name ||
                 spec?.video_data?.title ||
                 data.name;
    }

    // Extract body - for catalog ads, indicate it's dynamic
    if (isCatalogAd) {
      body = 'Dynamic catalog ad - content varies by product shown to each user';
    } else {
      body = creative?.body ||
             spec?.link_data?.message ||
             spec?.link_data?.description ||
             spec?.video_data?.message;
    }

    // Extract image - prefer full-size image_url over thumbnails
    // NOTE: Deliberately NOT using thumbnail_url as fallback - it's too low quality for reference images
    imageUrl = creative?.image_url ||
               spec?.link_data?.picture ||
               spec?.video_data?.picture;
    // thumbnail_url is intentionally excluded - images need to be at least 480px for quality references

    if (logThis) {
      console.log(`✅✅✅ EXTRACTED DATA FOR ${adId}:`, {
        headline,
        body: body?.substring(0, 100),
        imageUrl,
        hasHeadline: !!headline,
        hasBody: !!body,
        hasImage: !!imageUrl
      });
    }

    return {
      headline,
      body,
      imageUrl,
      videoUrl: undefined,
      callToAction: undefined
    };
  } catch (error) {
    if (logThis) console.error(`❌ Error fetching creative for ad ${adId}:`, error);
    return {};
  }
}

/**
 * Fetch ad creatives with performance data
 */
export async function fetchAdCreatives(dateOptions?: DateRangeOptions): Promise<AdCreative[]> {
  console.log('💥💥💥 fetchAdCreatives() EXECUTING - VERSION 4.0 💥💥💥');
  console.log('📅 Date Options for Creatives:', dateOptions);
  adCounter = 0; // Reset counter

  try {
    const insights = await fetchAdInsights(dateOptions);

    console.log('🎨 Fetching creative details for', insights.length, 'ads...');

    // Fetch creative details for each ad in parallel
    const creativeDetailsPromises = insights.map(ad =>
      fetchAdCreativeDetails(ad.ad_id)
    );
    const creativeDetails = await Promise.all(creativeDetailsPromises);

    console.log('✅ Creative details fetched');

    const results = insights.map((ad, index) => {
      const creative = creativeDetails[index];
      // Extract conversions from actions array
      const conversions = ad.actions?.find(
        action => action.action_type === 'offsite_conversion.fb_pixel_purchase'
      )?.value || '0';

      const spend = parseFloat(ad.spend || '0');
      const conversionCount = parseInt(conversions, 10);
      const clicks = parseInt(ad.clicks || '0', 10);
      const impressions = parseInt(ad.impressions || '0', 10);

      // CONVERSION INTELLIGENCE CALCULATIONS
      const conversionRate = clicks > 0 ? (conversionCount / clicks) * 100 : 0;
      const costPerConversion = conversionCount > 0 ? spend / conversionCount : 0;
      const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;

      // Determine status based on conversion rate (not just volume)
      let status: 'Winning' | 'Testing' | 'Fatigued' = 'Testing';
      if (conversionRate > 5 && conversionCount > 10) {
        status = 'Winning';  // High conversion rate with volume
      } else if (conversionRate > 2 && conversionCount > 5) {
        status = 'Testing';  // Moderate performance
      } else if (spend > 50 && conversionRate < 1) {
        status = 'Fatigued';  // Low conversion rate despite spend
      }

      // Determine confidence based on statistical significance
      let confidence: 'High' | 'Medium' | 'Low' = 'Low';
      if (clicks > 1000 && conversionCount > 20) {
        confidence = 'High';  // Statistically significant sample
      } else if (clicks > 100 && conversionCount > 5) {
        confidence = 'Medium';
      }

      const result = {
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
        adsetName: ad.adset_name
      };

      if (index < 2) {
        console.log(`🎯🎯🎯 FINAL AD CREATIVE #${index}:`, result);
      }

      return result;
    });

    console.log(`✅✅✅ RETURNING ${results.length} AD CREATIVES`);
    return results;
  } catch (error) {
    console.error('Error processing ad creatives:', error);
    throw error;
  }
}

/**
 * Fetch traffic type performance
 */
export async function fetchTrafficTypes(dateOptions?: DateRangeOptions): Promise<TrafficType[]> {
  console.log('Fetching traffic types...');
  console.log('📅 Date Options for Traffic Types:', dateOptions);

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_name,spend,actions',
      level: 'campaign',
      limit: '100'
    });

    // Add date range parameters
    if (dateOptions?.timeRange) {
      params.set('time_range', JSON.stringify(dateOptions.timeRange));
    } else {
      params.set('date_preset', dateOptions?.datePreset || 'last_30d');
    }

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      console.error('Failed to fetch traffic types');
      return [];
    }

    const data = await response.json();

    return data.data.map((campaign: any, index: number) => ({
      id: campaign.campaign_id || `traffic-${index}`,
      name: campaign.campaign_name || 'Unknown',
      spend: parseFloat(campaign.spend || '0'),
      conversions: parseInt(
        campaign.actions?.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0',
        10
      )
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
  console.log('📊 Fetching Campaign Summaries for Dashboard...');
  console.log('📅 Date Options:', dateOptions);

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,actions,action_values',
      level: 'campaign',
      limit: '100'
    });

    // Add date range parameters
    if (dateOptions?.timeRange) {
      params.set('time_range', JSON.stringify(dateOptions.timeRange));
    } else {
      params.set('date_preset', dateOptions?.datePreset || 'last_30d');
    }

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      console.error('Failed to fetch campaign summaries');
      return [];
    }

    const data = await response.json();
    console.log('📊 Campaign data received:', data.data?.length, 'campaigns');

    return data.data.map((campaign: any, index: number) => {
      const spend = parseFloat(campaign.spend || '0');
      const impressions = parseInt(campaign.impressions || '0', 10);
      const clicks = parseInt(campaign.clicks || '0', 10);
      const ctr = parseFloat(campaign.ctr || '0');

      // Get purchase count from actions
      const purchases = parseInt(
        campaign.actions?.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0',
        10
      );

      // Get purchase value from action_values
      const purchaseValue = parseFloat(
        campaign.action_values?.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || '0'
      );

      // Calculate ROAS (Return on Ad Spend)
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
        ctr
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

  // Initialize all types
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
      campaignCount: 0
    });
  });

  // Aggregate data
  campaigns.forEach(campaign => {
    const metrics = typeMap.get(campaign.campaignType)!;
    metrics.totalSpend += campaign.spend;
    metrics.totalPurchases += campaign.purchases;
    metrics.totalPurchaseValue += campaign.purchaseValue;
    metrics.totalClicks += campaign.clicks;
    metrics.totalImpressions += campaign.impressions;
    metrics.campaignCount += 1;
  });

  // Calculate derived metrics for each type
  typeMap.forEach(metrics => {
    // ROAS: Revenue / Spend
    metrics.roas = metrics.totalSpend > 0 ? metrics.totalPurchaseValue / metrics.totalSpend : 0;
    // Cost Per Purchase: Spend / Purchases
    metrics.costPerPurchase = metrics.totalPurchases > 0 ? metrics.totalSpend / metrics.totalPurchases : 0;
    // Conversion Rate: (Purchases / Clicks) * 100
    metrics.conversionRate = metrics.totalClicks > 0 ? (metrics.totalPurchases / metrics.totalClicks) * 100 : 0;
    // AOV: Revenue / Purchases
    metrics.aov = metrics.totalPurchases > 0 ? metrics.totalPurchaseValue / metrics.totalPurchases : 0;
  });

  return Array.from(typeMap.values());
}

/**
 * Test Meta API connection
 */
export async function testMetaConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  console.log('🧪 Testing Meta API Connection...');

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'name,account_id,account_status'
    });

    const fullUrl = `${url}?${params}`;
    console.log('🌐 Test URL:', fullUrl.replace(ACCESS_TOKEN, 'TOKEN_HIDDEN'));

    const response = await fetch(fullUrl);
    const data = await response.json();

    console.log('📡 Response status:', response.status);
    console.log('📡 Response data:', data);

    if (!response.ok || data.error) {
      console.error('❌ Connection test failed:', data);
      console.error('❌ Error details:', JSON.stringify(data.error, null, 2));
      return {
        success: false,
        message: data.error?.message || `HTTP ${response.status}: ${data.error?.type || 'Unknown error'}`,
        data
      };
    }

    console.log('✅ Connection successful:', data);
    return {
      success: true,
      message: 'Connected successfully',
      data
    };
  } catch (error: any) {
    console.error('❌ Connection test error:', error);
    console.error('❌ Error stack:', error.stack);
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}

// =============================================================================
// AD PUBLISHER - Meta Marketing API Write Functions
// =============================================================================

// Environment variable for Facebook Page ID (required for ad creation)
const PAGE_ID = import.meta.env.VITE_META_PAGE_ID;

/**
 * Validate that the current access token has permission to use the Facebook Page
 * for ad creation. This checks the Page is accessible before attempting to publish.
 */
export async function validatePageAccess(pageId?: string): Promise<{ valid: boolean; pageName?: string; error?: string; diagnosis?: string }> {
  const targetPageId = pageId || PAGE_ID;

  if (!targetPageId) {
    return { valid: false, error: 'No Facebook Page ID configured', diagnosis: 'Set VITE_META_PAGE_ID in your .env file.' };
  }

  try {
    // Check if the token can read the Page
    const pageUrl = `${META_GRAPH_API}/${targetPageId}?fields=name,id&access_token=${ACCESS_TOKEN}`;
    const pageResponse = await fetch(pageUrl);
    const pageData = await pageResponse.json();

    if (pageData.error) {
      const code = pageData.error.code;
      const subcode = pageData.error.error_subcode;

      if (code === 190) {
        return { valid: false, error: pageData.error.message, diagnosis: 'Access token is expired or invalid. Generate a new token.' };
      }
      if (code === 10 || code === 100) {
        return { valid: false, error: pageData.error.message, diagnosis: `Page ID ${targetPageId} is not accessible. Verify the ID is correct and the Page is added to your Business Manager.` };
      }
      return { valid: false, error: pageData.error.message, diagnosis: `Token cannot access Page ${targetPageId}. In Business Manager → Settings → Pages, ensure this Page is added and your token has permission.` };
    }

    // Page is readable. Now check if the token has ads_management permission for this Page
    // by checking if we can list the Page's ad accounts
    const promotableUrl = `${META_GRAPH_API}/${targetPageId}/promotable_posts?limit=1&access_token=${ACCESS_TOKEN}`;
    const promotableResponse = await fetch(promotableUrl);
    const promotableData = await promotableResponse.json();

    if (promotableData.error) {
      return {
        valid: false,
        pageName: pageData.name,
        error: promotableData.error.message,
        diagnosis: `Token can read Page "${pageData.name}" but lacks ad creation permissions. In Business Manager → Settings → Pages → "${pageData.name}", assign the 'Create Ads' permission to your System User or regenerate your token with pages_manage_ads permission.`,
      };
    }

    console.log(`✅ Page "${pageData.name}" (${targetPageId}) is accessible with ad permissions`);
    return { valid: true, pageName: pageData.name };
  } catch (err: any) {
    return { valid: false, error: err.message, diagnosis: 'Network error checking Page access.' };
  }
}

// Campaign objectives available in Meta
export type CampaignObjective = 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_TRAFFIC';

// Call-to-action types for ads
export type CallToActionType = 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'SUBSCRIBE' | 'GET_OFFER' | 'BOOK_NOW' | 'CONTACT_US' | 'DOWNLOAD' | 'APPLY_NOW' | 'BUY_NOW';

// Campaign for publisher dropdown
export interface CampaignForPublish {
  id: string;
  name: string;
  status: string;
  objective: string;
}

// Ad Set for publisher dropdown
export interface AdSetForPublish {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  dailyBudget?: number;
}

// Request interfaces
export interface CreateCampaignRequest {
  name: string;
  objective: CampaignObjective;
}

export interface CreateAdSetRequest {
  name: string;
  campaignId: string;
  dailyBudget: number; // In dollars (will be converted to cents)
  optimization: 'CONVERSIONS' | 'LINK_CLICKS' | 'LANDING_PAGE_VIEWS';
  targeting?: {
    geoLocations?: { countries: string[] };
    ageMin?: number;
    ageMax?: number;
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
  pageId?: string; // Optional, uses env var if not provided
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
    adsetName?: string;
    dailyBudget?: number;
    landingPageUrl: string;
    pageId?: string;
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

/**
 * Convert an image URL to base64
 */
async function imageUrlToBase64(url: string): Promise<string> {
  console.log('🔄 Converting URL to base64:', url.substring(0, 50) + '...');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove the data URL prefix to get raw base64
      const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
      resolve(cleanBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload an image to Meta Ad Account
 * Accepts either base64 data or an image URL
 * Returns the image hash for use in ad creatives
 */
export async function uploadAdImage(imageSource: string): Promise<string> {
  console.log('📤 Uploading image to Meta...');

  let cleanBase64: string;

  // Check if it's a URL (http/https) or base64 data
  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    console.log('🌐 Image is a URL, fetching and converting...');
    cleanBase64 = await imageUrlToBase64(imageSource);
  } else {
    // It's base64 data - remove data URL prefix if present
    cleanBase64 = imageSource.replace(/^data:image\/\w+;base64,/, '');
  }

  console.log('📊 Base64 data length:', cleanBase64.length);

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/adimages`;

  const formData = new FormData();
  formData.append('access_token', ACCESS_TOKEN);
  formData.append('bytes', cleanBase64);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Image upload failed:', data);
    console.error('❌ Full error details:', JSON.stringify(data.error, null, 2));
    throw new Error(data.error?.message || 'Failed to upload image');
  }

  // Extract the image hash from the response
  // Response format: { images: { "<filename>": { hash: "...", url: "..." } } }
  const images = data.images;
  const imageKey = Object.keys(images)[0];
  const imageHash = images[imageKey]?.hash;

  if (!imageHash) {
    throw new Error('No image hash returned from Meta');
  }

  console.log('✅ Image uploaded successfully, hash:', imageHash);
  return imageHash;
}

/**
 * Fetch existing campaigns for the publish dropdown
 */
export async function fetchCampaignsForPublish(): Promise<CampaignForPublish[]> {
  console.log('📋 Fetching campaigns for publish...');

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/campaigns`;
  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    fields: 'id,name,status,objective',
    limit: '100',
  });

  const response = await fetch(`${url}?${params}`);
  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Failed to fetch campaigns:', data);
    throw new Error(data.error?.message || 'Failed to fetch campaigns');
  }

  const campaigns: CampaignForPublish[] = (data.data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective,
  }));

  console.log(`✅ Fetched ${campaigns.length} campaigns`);
  return campaigns;
}

/**
 * Fetch existing ad sets for the publish dropdown
 */
export async function fetchAdSetsForPublish(campaignId?: string): Promise<AdSetForPublish[]> {
  console.log('📋 Fetching ad sets for publish...', campaignId ? `(campaign: ${campaignId})` : '');

  const url = campaignId
    ? `${META_GRAPH_API}/${campaignId}/adsets`
    : `${META_GRAPH_API}/${AD_ACCOUNT_ID}/adsets`;

  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    fields: 'id,name,status,campaign_id,daily_budget',
    limit: '100',
  });

  const response = await fetch(`${url}?${params}`);
  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Failed to fetch ad sets:', data);
    throw new Error(data.error?.message || 'Failed to fetch ad sets');
  }

  const adSets: AdSetForPublish[] = (data.data || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    campaignId: a.campaign_id,
    dailyBudget: a.daily_budget ? parseInt(a.daily_budget) / 100 : undefined,
  }));

  console.log(`✅ Fetched ${adSets.length} ad sets`);
  return adSets;
}

/**
 * Create a new campaign
 * ALWAYS creates in PAUSED status for safety
 */
export async function createCampaign(request: CreateCampaignRequest): Promise<string> {
  console.log('🚀 Creating campaign:', request.name);
  console.log('📋 Campaign Request:', JSON.stringify(request, null, 2));

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/campaigns`;

  // Build request body
  const requestBody = {
    access_token: ACCESS_TOKEN,
    name: request.name,
    objective: request.objective,
    status: 'PAUSED', // CRITICAL: Always create as draft
    special_ad_categories: [], // Required field - empty array for non-special ads
    // Required when using ad set level budget (not campaign budget)
    // Set to false to keep each ad set's budget independent
    is_adset_budget_sharing_enabled: false,
  };

  console.log('📤 Campaign API request:', {
    url,
    name: request.name,
    objective: request.objective,
    status: 'PAUSED',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Failed to create campaign - Full response:', JSON.stringify(data, null, 2));
    console.error('❌ Error code:', data.error?.code);
    console.error('❌ Error type:', data.error?.type);
    console.error('❌ Error message:', data.error?.message);
    console.error('❌ Error user message:', data.error?.error_user_msg);
    console.error('❌ Error user title:', data.error?.error_user_title);
    const errorMsg = data.error?.error_user_msg || data.error?.message || 'Failed to create campaign';
    throw new Error(errorMsg);
  }

  console.log('✅ Campaign created:', data.id);
  return data.id;
}

/**
 * Create a new ad set
 * ALWAYS creates in PAUSED status for safety
 * Uses LINK_CLICKS optimization (doesn't require pixel)
 */
export async function createAdSet(request: CreateAdSetRequest): Promise<string> {
  console.log('🚀 Creating ad set:', request.name);
  console.log('📋 Ad Set Request:', JSON.stringify(request, null, 2));

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/adsets`;

  // Convert daily budget from dollars to cents
  const dailyBudgetCents = Math.round(request.dailyBudget * 100);

  // Use LINK_CLICKS for traffic/awareness campaigns (doesn't require pixel)
  // Only use CONVERSIONS/OFFSITE_CONVERSIONS if pixel is configured
  let optimizationGoal = 'LINK_CLICKS';
  if (request.optimization === 'LANDING_PAGE_VIEWS') {
    optimizationGoal = 'LANDING_PAGE_VIEWS';
  }

  // Build targeting - Meta requires specific format
  const targeting = {
    geo_locations: {
      countries: request.targeting?.geoLocations?.countries || ['US', 'AU', 'GB', 'CA'],
    },
    age_min: request.targeting?.ageMin || 18,
    age_max: request.targeting?.ageMax || 65,
  };

  console.log('🎯 Targeting:', JSON.stringify(targeting, null, 2));
  console.log('🎯 Optimization Goal:', optimizationGoal);
  console.log('💰 Daily Budget (cents):', dailyBudgetCents);

  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    name: request.name,
    campaign_id: request.campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: dailyBudgetCents.toString(),
    targeting: JSON.stringify(targeting),
    status: 'PAUSED', // CRITICAL: Always create as draft
  });

  console.log('📤 Creating ad set with params:', {
    name: request.name,
    campaign_id: request.campaignId,
    optimization_goal: optimizationGoal,
    daily_budget: dailyBudgetCents,
  });

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Failed to create ad set:', data);
    console.error('❌ Error details:', JSON.stringify(data.error, null, 2));
    const errorMsg = data.error?.error_user_msg || data.error?.message || 'Failed to create ad set';
    throw new Error(`Ad Set creation failed: ${errorMsg}`);
  }

  console.log('✅ Ad set created:', data.id);
  return data.id;
}

/**
 * Create an ad creative
 */
export async function createAdCreative(request: CreateAdRequest): Promise<string> {
  console.log('🎨 Creating ad creative:', request.name);

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/adcreatives`;
  const pageId = request.pageId || PAGE_ID;

  if (!pageId) {
    throw new Error('Facebook Page ID is required. Set VITE_META_PAGE_ID in your environment.');
  }

  const objectStorySpec = {
    page_id: pageId,
    link_data: {
      image_hash: request.imageHash,
      link: request.linkUrl,
      message: request.bodyText,
      name: request.headline,
      call_to_action: {
        type: request.callToAction,
        value: {
          link: request.linkUrl,
        },
      },
    },
  };

  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    name: request.name,
    object_story_spec: JSON.stringify(objectStorySpec),
  });

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Failed to create ad creative - Full response:', JSON.stringify(data, null, 2));
    console.error('❌ Error code:', data.error?.code);
    console.error('❌ Error type:', data.error?.type);
    console.error('❌ Error message:', data.error?.message);
    console.error('❌ Error user message:', data.error?.error_user_msg);
    console.error('❌ Object story spec sent:', JSON.stringify(objectStorySpec, null, 2));
    const errorMsg = data.error?.error_user_msg || data.error?.message || 'Failed to create ad creative';
    throw new Error(errorMsg);
  }

  console.log('✅ Ad creative created:', data.id);
  return data.id;
}

/**
 * Create an ad
 * ALWAYS creates in PAUSED status for safety
 */
export async function createAd(adsetId: string, creativeId: string, name: string): Promise<string> {
  console.log('📝 Creating ad:', name);

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/ads`;

  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    name: name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'PAUSED', // CRITICAL: Always create as draft
  });

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error('❌ Failed to create ad:', data);
    throw new Error(data.error?.message || 'Failed to create ad');
  }

  console.log('✅ Ad created:', data.id);
  return data.id;
}

/**
 * Main publish function - orchestrates the entire publishing process
 * Handles all three modes: new_campaign, new_adset, existing_adset
 *
 * APPROACH:
 * - For new campaigns, uses OUTCOME_TRAFFIC objective (doesn't require pixel)
 * - For ad sets, uses LINK_CLICKS optimization (doesn't require pixel)
 * - User can modify campaign settings in Meta Ads Manager afterward
 */
export async function publishAds(config: PublishConfig): Promise<PublishResult> {
  console.log('🚀 Starting ad publish process...', config.mode);
  console.log('📋 Full config:', JSON.stringify(config, null, 2));

  const result: PublishResult = {
    success: false,
    imageHashes: [],
    creativeIds: [],
    adIds: [],
  };

  try {
    // Step 0: Validate Page access before doing anything
    console.log('🔐 Step 0: Validating Facebook Page access...');
    const pageValidation = await validatePageAccess(config.settings.pageId);
    if (!pageValidation.valid) {
      throw new Error(`Page access validation failed: ${pageValidation.error}\n\nDiagnosis: ${pageValidation.diagnosis}`);
    }
    console.log(`✅ Page "${pageValidation.pageName}" validated for ad creation`);

    // Step 1: Upload all images
    console.log(`📤 Step 1: Uploading ${config.ads.length} images...`);
    for (let i = 0; i < config.ads.length; i++) {
      console.log(`📤 Uploading image ${i + 1}/${config.ads.length}...`);
      const ad = config.ads[i];
      try {
        const hash = await uploadAdImage(ad.imageBase64);
        result.imageHashes!.push(hash);
        console.log(`✅ Image ${i + 1} uploaded, hash: ${hash}`);
      } catch (imgError: any) {
        throw new Error(`Image upload failed for ad ${i + 1}: ${imgError.message}`);
      }
    }

    // Step 2: Create or select campaign
    console.log('🎯 Step 2: Setting up campaign...');
    let campaignId: string;
    if (config.mode === 'new_campaign') {
      // Use OUTCOME_TRAFFIC by default - it's simpler and doesn't require pixel
      // User can change to OUTCOME_SALES in Meta Ads Manager
      const objective = config.settings.campaignObjective || 'OUTCOME_TRAFFIC';
      console.log(`📝 Creating new campaign: "${config.settings.campaignName}" with objective: ${objective}`);
      try {
        campaignId = await createCampaign({
          name: config.settings.campaignName || 'CI Generated Campaign',
          objective: objective,
        });
        console.log(`✅ Campaign created: ${campaignId}`);
      } catch (campError: any) {
        throw new Error(`Campaign creation failed: ${campError.message}`);
      }
      result.campaignId = campaignId;
    } else {
      campaignId = config.existingCampaignId!;
      console.log(`📝 Using existing campaign: ${campaignId}`);
      result.campaignId = campaignId;
    }

    // Step 3: Create or select ad set
    console.log('📦 Step 3: Setting up ad set...');
    let adsetId: string;
    if (config.mode === 'existing_adset') {
      adsetId = config.existingAdSetId!;
      console.log(`📝 Using existing ad set: ${adsetId}`);
    } else {
      console.log(`📝 Creating new ad set: "${config.settings.adsetName}"`);
      try {
        adsetId = await createAdSet({
          name: config.settings.adsetName || 'CI Generated Ad Set',
          campaignId: campaignId,
          dailyBudget: config.settings.dailyBudget || 50,
          optimization: 'LINK_CLICKS', // Use LINK_CLICKS - doesn't require pixel
        });
        console.log(`✅ Ad set created: ${adsetId}`);
      } catch (adsetError: any) {
        throw new Error(`Ad Set creation failed: ${adsetError.message}`);
      }
    }
    result.adsetId = adsetId;

    // Step 4: Create creatives and ads for each image
    console.log(`🎨 Step 4: Creating ${config.ads.length} ad creatives and ads...`);
    for (let i = 0; i < config.ads.length; i++) {
      const ad = config.ads[i];
      const imageHash = result.imageHashes![i];

      console.log(`📝 Creating creative ${i + 1}/${config.ads.length}...`);

      // Create the creative
      try {
        const creativeId = await createAdCreative({
          name: `CI Creative ${i + 1} - ${ad.headline.substring(0, 30)}`,
          adsetId: adsetId,
          imageHash: imageHash,
          headline: ad.headline,
          bodyText: ad.bodyText,
          linkUrl: config.settings.landingPageUrl,
          callToAction: ad.callToAction,
          pageId: config.settings.pageId,
        });
        result.creativeIds!.push(creativeId);
        console.log(`✅ Creative ${i + 1} created: ${creativeId}`);

        // Create the ad
        console.log(`📝 Creating ad ${i + 1}/${config.ads.length}...`);
        const adId = await createAd(
          adsetId,
          creativeId,
          `CI Ad ${i + 1} - ${ad.headline.substring(0, 30)}`
        );
        result.adIds!.push(adId);
        console.log(`✅ Ad ${i + 1} created: ${adId}`);
      } catch (adError: any) {
        throw new Error(`Ad creation failed for ad ${i + 1}: ${adError.message}`);
      }
    }

    result.success = true;
    console.log('✅✅✅ Publish complete!', result);
    return result;

  } catch (error: any) {
    console.error('❌❌❌ Publish failed:', error);
    console.error('❌ Error stack:', error.stack);
    result.error = error.message;
    result.details = error.stack;
    return result;
  }
}
