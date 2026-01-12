// Meta Marketing API Service
console.log('🔥🔥🔥 metaApi.ts VERSION 4.0 LOADED AT', new Date().toISOString(), '🔥🔥🔥');

const META_API_VERSION = 'v21.0';
const META_GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;

const ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = import.meta.env.VITE_META_AD_ACCOUNT_ID;

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
}

export interface TrafficType {
  id: string;
  name: string;
  conversions: number;
  spend: number;
}

/**
 * Fetch ad insights from Meta Marketing API
 */
/**
 * Fetch ad-level insights with creative details for conversion intelligence
 */
export async function fetchAdInsights(): Promise<MetaAdInsight[]> {
  console.log('🔍 Fetching Ad-Level Insights with Creative Details...');
  console.log('Access Token:', ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 20)}...` : 'MISSING');
  console.log('Ad Account ID:', AD_ACCOUNT_ID);

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;

    // Fetch AD-LEVEL data with creative details for conversion intelligence
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,impressions,clicks,spend,actions,ctr,cpc,cpp,frequency',
      level: 'ad',  // Changed from 'campaign' to 'ad' for creative-level insights
      date_preset: 'last_30d',
      limit: '100',  // Increased limit to get more ad data
      filtering: JSON.stringify([{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }])  // Only ads with impressions
    });

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

    // Extract image - prefer image_url, fall back to thumbnail_url
    imageUrl = creative?.image_url ||
               spec?.link_data?.picture ||
               spec?.video_data?.picture ||
               creative?.thumbnail_url;

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
export async function fetchAdCreatives(): Promise<AdCreative[]> {
  console.log('💥💥💥 fetchAdCreatives() EXECUTING - VERSION 4.0 💥💥💥');
  adCounter = 0; // Reset counter

  try {
    const insights = await fetchAdInsights();

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
export async function fetchTrafficTypes(): Promise<TrafficType[]> {
  console.log('Fetching traffic types...');

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_name,spend,actions',
      level: 'campaign',
      date_preset: 'last_30d',
      limit: '100'
    });

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
