// Meta Marketing API Service
console.log('🔥🔥🔥 metaApi.ts VERSION 5.0 LOADED AT', new Date().toISOString(), '🔥🔥🔥');

const META_API_VERSION = 'v24.0';
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

      if (code === 190) {
        return { valid: false, error: pageData.error.message, diagnosis: 'Access token is expired or invalid. Generate a new token.' };
      }

      // Error code 10: missing pages_read_engagement permission.
      // The token may still have ads_management permission, which is sufficient
      // to create ads on this Page. Fall back to the promote_pages check.
      if ((code === 10 || code === 100) && AD_ACCOUNT_ID) {
        console.warn(`⚠️ Cannot read Page ${targetPageId} directly (code ${code}). Falling back to promote_pages check...`);
        const promoteUrl = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/promote_pages?fields=id,name&access_token=${ACCESS_TOKEN}`;
        const promoteResponse = await fetch(promoteUrl);
        const promoteData = await promoteResponse.json();

        if (!promoteData.error && promoteData.data) {
          const matchedPage = promoteData.data.find((p: { id: string }) => p.id === targetPageId);
          if (matchedPage) {
            console.log(`✅ Page "${matchedPage.name}" (${targetPageId}) confirmed via promote_pages (direct read unavailable)`);
            return { valid: true, pageName: matchedPage.name };
          }
        }

        return { valid: false, error: pageData.error.message, diagnosis: `Page ID ${targetPageId} is not accessible. Verify the ID is correct and the Page is added to your Business Manager.` };
      }

      if (code === 10 || code === 100) {
        return { valid: false, error: pageData.error.message, diagnosis: `Page ID ${targetPageId} is not accessible. Verify the ID is correct and the Page is added to your Business Manager.` };
      }
      return { valid: false, error: pageData.error.message, diagnosis: `Token cannot access Page ${targetPageId}. In Business Manager → Settings → Pages, ensure this Page is added and your token has permission.` };
    }

    // Page is readable. Now check if this Page is available as a promote target for the ad account
    if (AD_ACCOUNT_ID) {
      const promoteUrl = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/promote_pages?fields=id,name&access_token=${ACCESS_TOKEN}`;
      const promoteResponse = await fetch(promoteUrl);
      const promoteData = await promoteResponse.json();

      if (promoteData.error) {
        // If the promote_pages check fails, log it but don't block — the Page may still work
        console.warn('⚠️ Could not verify Page via promote_pages:', promoteData.error.message);
      } else if (promoteData.data) {
        const pageLinked = promoteData.data.some((p: { id: string }) => p.id === targetPageId);
        if (!pageLinked) {
          return {
            valid: false,
            pageName: pageData.name,
            error: `Page "${pageData.name}" is not linked to ad account ${AD_ACCOUNT_ID} for promotion.`,
            diagnosis: `In Business Manager → Settings → Pages → "${pageData.name}", ensure the Page is assigned to the ad account. Or in Ad Account Settings → Page, add this Page.`,
          };
        }
      }
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

// Conversion event types for OUTCOME_SALES objective
export type ConversionEvent = 'PURCHASE' | 'ADD_TO_CART' | 'LEAD' | 'COMPLETE_REGISTRATION' | 'INITIATE_CHECKOUT' | 'ADD_PAYMENT_INFO' | 'SEARCH' | 'VIEW_CONTENT';

// Gender targeting: 0=all, 1=male, 2=female
export type GenderTarget = 0 | 1 | 2;

// Budget optimization mode
export type BudgetMode = 'ABO' | 'CBO';

// Interest/behavior for flexible_spec targeting
export interface DetailedTargetingItem {
  id: string;
  name: string;
  type: 'interest' | 'behavior' | 'demographic';
  audienceSize?: number;
}

// Ad pixel / dataset reference
export interface PixelRef {
  id: string;
  name: string;
}

// Custom/Lookalike audience reference
export interface AudienceRef {
  id: string;
  name: string;
  subtype?: string;
  approximateCount?: number;
}

// Placement configuration
export type PublisherPlatform = 'facebook' | 'instagram' | 'audience_network' | 'messenger';

export type FacebookPosition =
  | 'feed'
  | 'right_hand_column'
  | 'marketplace'
  | 'video_feeds'
  | 'story'
  | 'reels'
  | 'search'
  | 'instream_video';

export type InstagramPosition =
  | 'stream'
  | 'story'
  | 'reels'
  | 'explore'
  | 'explore_home'
  | 'profile_feed';

export interface PlacementConfig {
  automatic: boolean;
  publisherPlatforms?: PublisherPlatform[];
  facebookPositions?: FacebookPosition[];
  instagramPositions?: InstagramPosition[];
}

// Full targeting specification
export interface FullTargetingSpec {
  geoLocations: { countries: string[] };
  ageMin: number;
  ageMax: number;
  genders: GenderTarget[];
  flexibleSpec?: DetailedTargetingItem[][];
  customAudiences?: AudienceRef[];
  excludedCustomAudiences?: AudienceRef[];
}

// Named preset for publisher configuration
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
  };
}

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
  budgetMode: BudgetMode;
  dailyBudget?: number; // In dollars, only used when budgetMode is 'CBO'
}

export interface CreateAdSetRequest {
  name: string;
  campaignId: string;
  dailyBudget?: number; // In dollars, only for ABO mode
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
  const requestBody: Record<string, any> = {
    access_token: ACCESS_TOKEN,
    name: request.name,
    objective: request.objective,
    status: 'PAUSED', // CRITICAL: Always create as draft
    special_ad_categories: [], // Required field - empty array for non-special ads
    // Highest Volume (no bid cap required)
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  };

  if (request.budgetMode === 'CBO' && request.dailyBudget) {
    // CBO: budget set at campaign level
    requestBody.daily_budget = Math.round(request.dailyBudget * 100); // Convert to cents
  } else {
    // ABO: budget set at ad set level, disable campaign budget sharing
    requestBody.is_adset_budget_sharing_enabled = false;
  }

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

  // Determine optimization goal based on configuration
  let optimizationGoal = request.optimization;
  if (request.promotedObject) {
    optimizationGoal = 'OFFSITE_CONVERSIONS';
  } else if (optimizationGoal === 'OFFSITE_CONVERSIONS' && !request.promotedObject) {
    optimizationGoal = 'LINK_CLICKS';
  }

  // Build targeting — minimal required format
  const targeting: Record<string, any> = {
    geo_locations: {
      countries: request.targeting.geoLocations.countries,
    },
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
        // Meta returns 'interests' from API — map all non-behavior items to 'interests'
        // since most targeting suggestions are interests, not demographics
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

  // Build form-encoded params (URLSearchParams) — matching createAdCreative/createAd
  const params = new URLSearchParams();
  params.append('access_token', ACCESS_TOKEN);
  params.append('name', request.name);
  params.append('campaign_id', request.campaignId);
  params.append('billing_event', 'IMPRESSIONS');
  params.append('optimization_goal', optimizationGoal);
  params.append('targeting', JSON.stringify(targeting));
  params.append('status', 'PAUSED');
  params.append('destination_type', 'WEBSITE');

  if (request.dailyBudget) {
    params.append('daily_budget', String(Math.round(request.dailyBudget * 100)));
  }

  if (request.promotedObject) {
    params.append('promoted_object', JSON.stringify({
      pixel_id: request.promotedObject.pixelId,
      custom_event_type: request.promotedObject.customEventType,
    }));
  }

  if (!request.placements.automatic) {
    if (request.placements.publisherPlatforms?.length) {
      params.append('publisher_platforms', JSON.stringify(request.placements.publisherPlatforms));
    }
    if (request.placements.facebookPositions?.length) {
      params.append('facebook_positions', JSON.stringify(request.placements.facebookPositions));
    }
    if (request.placements.instagramPositions?.length) {
      params.append('instagram_positions', JSON.stringify(request.placements.instagramPositions));
    }
  }

  // Log full request (redact token)
  const debugParams = new URLSearchParams(params);
  debugParams.set('access_token', '***REDACTED***');
  console.log('📤 Creating ad set — full request body:', debugParams.toString());

  const response = await fetch(`${META_GRAPH_API}/${AD_ACCOUNT_ID}/adsets`, {
    method: 'POST',
    body: params,
  });

  const responseText = await response.text();
  console.log('📥 Raw Meta API response (HTTP ' + response.status + '):', responseText);

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Meta returned non-JSON (HTTP ${response.status}): ${responseText.substring(0, 500)}`);
  }

  if (!response.ok || data.error) {
    const err = data.error || {};
    const rawInfo = JSON.stringify(data, null, 2);
    throw new Error(
      `${err.error_user_msg || err.message || 'Unknown error'}\n\n` +
      `Full Meta response:\n${rawInfo}`
    );
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
 * Search Meta's Targeting API for interests, behaviors, and demographics
 * Used for the detailed targeting suggestions in the publisher
 */
export async function searchTargetingSuggestions(
  query: string,
  type: 'adinterest' | 'adinterestsuggestion' | 'adTargetingCategory' = 'adinterest'
): Promise<DetailedTargetingItem[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    q: query,
    type: type,
    limit: '25',
  });

  const url = `${META_GRAPH_API}/search?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    const msg = data.error?.message || `HTTP ${response.status}`;
    console.error('❌ Targeting search failed:', msg);
    throw new Error(msg);
  }

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.type === 'interests' ? 'interest' : item.type === 'behaviors' ? 'behavior' : 'demographic',
    audienceSize: item.audience_size || item.audience_size_upper_bound,
  }));
}

/**
 * Fetch custom and lookalike audiences for the ad account
 */
export async function fetchCustomAudiences(): Promise<AudienceRef[]> {
  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound',
    limit: '100',
  });

  const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/customaudiences?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    const msg = data.error?.message || `HTTP ${response.status}`;
    console.error('❌ Failed to fetch custom audiences:', msg);
    throw new Error(msg);
  }

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    subtype: item.subtype,
    approximateCount: item.approximate_count_upper_bound || item.approximate_count_lower_bound,
  }));
}

/**
 * Fetch Meta Pixels (datasets) for the ad account.
 * Tries the adspixels endpoint first, then falls back to datasets.
 */
export async function fetchAdPixels(): Promise<PixelRef[]> {
  const params = new URLSearchParams({
    access_token: ACCESS_TOKEN,
    fields: 'id,name',
    limit: '100',
  });

  // Try adspixels first
  const pixelUrl = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/adspixels?${params.toString()}`;
  try {
    const response = await fetch(pixelUrl);
    const data = await response.json();

    if (!data.error && data.data && data.data.length > 0) {
      return data.data.map((item: any) => ({
        id: item.id,
        name: item.name || `Pixel ${item.id}`,
      }));
    }

    // If adspixels returned empty or errored, try datasets
    if (data.error) {
      console.warn('⚠️ adspixels endpoint failed, trying datasets:', data.error.message);
    }
  } catch (err) {
    console.warn('⚠️ adspixels fetch failed, trying datasets:', err);
  }

  // Fallback to datasets endpoint
  const datasetUrl = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/datasets?${params.toString()}`;
  const response = await fetch(datasetUrl);
  const data = await response.json();

  if (!response.ok || data.error) {
    const msg = data.error?.message || `HTTP ${response.status}`;
    console.error('❌ Failed to fetch pixels/datasets:', msg);
    throw new Error(msg);
  }

  return (data.data || []).map((item: any) => ({
    id: item.id,
    name: item.name || `Dataset ${item.id}`,
  }));
}

/**
 * Main publish function - orchestrates the entire publishing process
 * Handles all three modes: new_campaign, new_adset, existing_adset
 *
 * Supports full configuration: CBO/ABO budgets, conversion tracking,
 * detailed targeting, custom audiences, and manual placements.
 */
export async function publishAds(config: PublishConfig): Promise<PublishResult> {
  console.log('🚀 Starting ad publish process...', config.mode);
  console.log('📋 Full config:', JSON.stringify(config, null, 2));

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

  try {
    // Step 0: Validate Page access (non-blocking — ad creation APIs will fail with
    // their own clear errors if the page is truly inaccessible)
    console.log('🔐 Step 0: Validating Facebook Page access...');
    const pageValidation = await validatePageAccess(config.settings.pageId);
    if (!pageValidation.valid) {
      console.warn(`⚠️ Page pre-validation failed: ${pageValidation.error} — proceeding anyway, ad creation will fail if page is truly inaccessible.`);
    } else {
      console.log(`✅ Page "${pageValidation.pageName}" validated for ad creation`);
    }

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

    // Step 1.5: Full diagnostic — token, account, and app info
    console.log('🔍 Step 1.5: Running diagnostics...');
    const diagnostics: string[] = [];
    try {
      // Debug the access token
      const debugUrl = `${META_GRAPH_API}/debug_token?input_token=${ACCESS_TOKEN}&access_token=${ACCESS_TOKEN}`;
      const debugResp = await fetch(debugUrl);
      const debugData = await debugResp.json();
      if (debugData.data) {
        const d = debugData.data;
        const granularInfo = (d.granular_scopes || []).map((s: any) => `${s.scope}→[${(s.target_ids || []).join(',')}]`).join(', ');
        const info = `Token: type=${d.type}, app_id=${d.app_id}, valid=${d.is_valid}, scopes=[${(d.scopes || []).join(', ')}], granular_scopes=[${granularInfo}], expires=${d.expires_at === 0 ? 'never' : new Date(d.expires_at * 1000).toISOString()}`;
        console.log('🔑', info);
        diagnostics.push(info);
      }
    } catch (e) { console.warn('Token debug failed:', e); }

    try {
      // Check ad account
      const acctUrl = `${META_GRAPH_API}/${AD_ACCOUNT_ID}?fields=account_status,disable_reason,name,currency,owner,business,capabilities&access_token=${ACCESS_TOKEN}`;
      const acctResp = await fetch(acctUrl);
      const acctData = await acctResp.json();
      if (!acctData.error) {
        const statusNames: Record<number, string> = { 1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW', 9: 'IN_GRACE_PERIOD', 101: 'CLOSED' };
        const info = `Account: "${acctData.name}" status=${statusNames[acctData.account_status] || acctData.account_status} disable_reason=${acctData.disable_reason} currency=${acctData.currency} capabilities=[${(acctData.capabilities || []).join(', ')}]`;
        console.log('🏥', info);
        diagnostics.push(info);
        if (acctData.account_status !== 1) {
          throw new Error(`Ad account is not active (status: ${statusNames[acctData.account_status] || acctData.account_status}). Check Business Manager → Billing.`);
        }
      } else {
        diagnostics.push(`Account check error: ${acctData.error.message}`);
      }
    } catch (acctErr: any) {
      if (acctErr.message.includes('not active')) throw acctErr;
      console.warn('Account check failed:', acctErr.message);
    }

    // Store diagnostics for error reporting
    (result as any)._diagnostics = diagnostics;

    // Determine effective objective — OUTCOME_SALES requires a pixel for
    // conversion tracking. Without one, fall back to OUTCOME_TRAFFIC.
    let effectiveObjective = config.settings.campaignObjective || 'OUTCOME_SALES';
    if (effectiveObjective === 'OUTCOME_SALES' && !config.settings.pixelId) {
      console.warn('⚠️ No pixel configured — switching objective from OUTCOME_SALES to OUTCOME_TRAFFIC');
      effectiveObjective = 'OUTCOME_TRAFFIC';
    }

    // Step 2: Create or select campaign
    console.log('🎯 Step 2: Setting up campaign...');
    let campaignId: string;
    if (config.mode === 'new_campaign') {
      console.log(`📝 Creating new campaign: "${config.settings.campaignName}" with objective: ${effectiveObjective}, budget mode: ${budgetMode}`);
      try {
        campaignId = await createCampaign({
          name: config.settings.campaignName || 'CI Generated Campaign',
          objective: effectiveObjective,
          budgetMode: budgetMode,
          dailyBudget: budgetMode === 'CBO' ? (config.settings.dailyBudget || 50) : undefined,
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

    // Step 2.5: Verify campaign exists and wait for propagation
    // Meta's servers are eventually consistent — a just-created campaign
    // may not be visible to the server handling the ad set request
    if (config.mode === 'new_campaign') {
      console.log('⏳ Waiting for campaign propagation...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify the campaign is readable
      const verifyUrl = `${META_GRAPH_API}/${campaignId}?fields=id,name,status,objective&access_token=${ACCESS_TOKEN}`;
      const verifyResp = await fetch(verifyUrl);
      const verifyData = await verifyResp.json();
      if (verifyData.error) {
        console.error('❌ Campaign verification failed:', JSON.stringify(verifyData.error));
        throw new Error(`Campaign ${campaignId} was created but is not readable: ${verifyData.error.message}`);
      }
      console.log(`✅ Campaign verified: ${verifyData.name} (${verifyData.status}, ${verifyData.objective})`);
    }

    // Step 3: Create or select ad set
    console.log('📦 Step 3: Setting up ad set...');
    let adsetId: string;
    if (config.mode === 'existing_adset') {
      adsetId = config.existingAdSetId!;
      console.log(`📝 Using existing ad set: ${adsetId}`);
    } else {
      const targeting = config.settings.targeting || defaultTargeting;
      const placements = config.settings.placements || defaultPlacements;

      // Determine ad set optimization based on effective campaign objective
      let optimization: 'LINK_CLICKS' | 'OFFSITE_CONVERSIONS' | 'LANDING_PAGE_VIEWS' | 'CONVERSIONS' = 'LINK_CLICKS';
      let promotedObject: { pixelId: string; customEventType: string } | undefined;

      if (effectiveObjective === 'OUTCOME_SALES' && config.settings.pixelId) {
        optimization = 'OFFSITE_CONVERSIONS';
        promotedObject = {
          pixelId: config.settings.pixelId,
          customEventType: config.settings.conversionEvent || 'PURCHASE',
        };
      }
      // For OUTCOME_TRAFFIC (or OUTCOME_SALES downgraded to TRAFFIC), LINK_CLICKS is correct

      console.log(`📝 Creating new ad set: "${config.settings.adsetName}" (objective: ${effectiveObjective}, optimization: ${optimization})`);
      try {
        adsetId = await createAdSet({
          name: config.settings.adsetName || 'CI Generated Ad Set',
          campaignId: campaignId,
          dailyBudget: budgetMode === 'ABO' ? (config.settings.dailyBudget || 50) : undefined,
          optimization: optimization,
          targeting: targeting,
          placements: placements,
          promotedObject: promotedObject,
        });
        console.log(`✅ Ad set created: ${adsetId}`);
      } catch (adsetError: any) {
        throw new Error(adsetError.message);
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
    // Append diagnostics to error message so user can see token/account info
    const diag = (result as any)._diagnostics as string[] | undefined;
    const diagText = diag?.length ? `\n\nDiagnostics:\n${diag.join('\n')}` : '';
    result.error = error.message + diagText;
    result.details = error.stack;
    return result;
  }
}
