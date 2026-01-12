// Meta Marketing API Service
console.log('🔥🔥🔥 metaApi.ts VERSION 3.1 LOADED AT', new Date().toISOString(), '🔥🔥🔥');

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

/**
 * Fetch actual ad creative content with HIGH RESOLUTION images and multiple fallbacks
 */
async function fetchAdCreativeDetails(adId: string): Promise<{
  headline?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  callToAction?: string;
}> {
  try {
    const url = `${META_GRAPH_API}/${adId}`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      // Request comprehensive creative fields including effective_object_story_id for actual post content
      fields: 'name,creative{id,name,title,body,image_hash,image_url,thumbnail_url,effective_object_story_id,object_story_spec,asset_feed_spec,video_id,call_to_action_type},adcreatives{image_url,thumbnail_url,object_story_spec}'
    });

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      console.warn(`❌ Failed to fetch creative for ad ${adId}:`, response.status);
      return {};
    }

    const data = await response.json();

    // Only log first 2 ads to avoid console spam
    if (Math.random() < 0.03) { // Log ~3% of ads
      console.log(`📦 Sample ad data:`, JSON.stringify(data, null, 2));
    }

    let headline: string | undefined;
    let body: string | undefined;
    let imageUrl: string | undefined;
    let videoUrl: string | undefined;

    // STRATEGY 1: If there's an effective_object_story_id, fetch the actual post
    if (data.creative?.effective_object_story_id) {
      const storyId = data.creative.effective_object_story_id;
      console.log(`📖 Fetching object story: ${storyId}`);

      try {
        const storyParams = new URLSearchParams({
          access_token: ACCESS_TOKEN,
          fields: 'message,name,caption,description,full_picture,picture,attachments{media,media_type,title,description,url,subattachments}'
        });

        const storyResponse = await fetch(`${META_GRAPH_API}/${storyId}?${storyParams}`);

        if (storyResponse.ok) {
          const storyData = await storyResponse.json();
          console.log(`📖 Story data:`, JSON.stringify(storyData, null, 2));

          // Extract headline from story
          headline = storyData.name ||
                    storyData.attachments?.data?.[0]?.title ||
                    storyData.attachments?.data?.[0]?.description?.split('\n')?.[0];

          // Extract body from story
          body = storyData.message ||
                storyData.description ||
                storyData.caption ||
                storyData.attachments?.data?.[0]?.description;

          // Extract high-res image from story
          imageUrl = storyData.full_picture ||
                    storyData.attachments?.data?.[0]?.media?.image?.src ||
                    storyData.picture;
        }
      } catch (storyError) {
        console.warn(`⚠️ Could not fetch object story:`, storyError);
      }
    }

    // STRATEGY 2: Extract from creative object_story_spec
    const c = data.creative;
    if (c?.object_story_spec) {
      const spec = c.object_story_spec;

      // Try link_data first (most common for link ads)
      if (spec.link_data) {
        if (!headline) headline = spec.link_data.name || spec.link_data.link;
        if (!body) body = spec.link_data.message || spec.link_data.description;
        if (!imageUrl) imageUrl = spec.link_data.picture || spec.link_data.image_url;
      }

      // Try video_data (for video ads)
      if (spec.video_data) {
        if (!headline) headline = spec.video_data.title || spec.video_data.name;
        if (!body) body = spec.video_data.message || spec.video_data.description;
        if (!imageUrl) imageUrl = spec.video_data.picture || spec.video_data.image_url;
      }

      // Try photo_data (for image ads)
      if (spec.photo_data) {
        if (!body) body = spec.photo_data.message || spec.photo_data.caption;
        if (!imageUrl) imageUrl = spec.photo_data.picture || spec.photo_data.url;
      }
    }

    // STRATEGY 3: Try direct creative fields
    if (c) {
      if (!headline) headline = c.title || c.name;
      if (!body) body = c.body;
      if (!imageUrl) imageUrl = c.image_url || c.thumbnail_url;

      // Get image from image_hash if we still don't have one
      // Note: image_hash URLs may require redirect handling, use as last resort
      if (!imageUrl && c.image_hash) {
        // Don't use image_hash - it requires redirects and often fails in browsers
        console.warn(`⚠️ No direct image URL found for ad, image_hash available but skipped: ${c.image_hash}`);
      }

      if (c.video_id && !videoUrl) {
        videoUrl = c.thumbnail_url; // Use video thumbnail as image
      }
    }

    // STRATEGY 4: Try adcreatives array for images
    if (!imageUrl && data.adcreatives?.data?.length > 0) {
      const adCreative = data.adcreatives.data[0];
      imageUrl = adCreative.image_url ||
                 adCreative.thumbnail_url ||
                 adCreative.object_story_spec?.link_data?.picture ||
                 adCreative.object_story_spec?.video_data?.picture;
    }

    // STRATEGY 5: Asset feed spec (for dynamic ads)
    if (c?.asset_feed_spec && (!headline || !body)) {
      if (!headline && c.asset_feed_spec.titles) {
        headline = c.asset_feed_spec.titles[0]?.text;
      }
      if (!body && c.asset_feed_spec.bodies) {
        body = c.asset_feed_spec.bodies[0]?.text;
      } else if (!body && c.asset_feed_spec.descriptions) {
        body = c.asset_feed_spec.descriptions[0]?.text;
      }
    }

    // STRATEGY 6: Use ad name as last resort for headline
    if (!headline) {
      headline = data.name;
    }

    const finalImageUrl = imageUrl || videoUrl;

    // EXPLICIT LOGGING FOR DEBUGGING
    console.log(`🎯 Ad ${adId} FINAL DATA:`, {
      headline: headline,
      body: body?.substring(0, 100),
      imageUrl: finalImageUrl,
      imageSource: imageUrl ? 'direct' : (videoUrl ? 'video' : 'none')
    });

    if (!finalImageUrl) {
      console.warn(`⚠️ Ad ${adId} has NO IMAGE URL`);
    }

    return {
      headline,
      body,
      imageUrl: finalImageUrl,
      videoUrl,
      callToAction: c?.call_to_action_type
    };
  } catch (error) {
    console.error(`❌ Error fetching creative for ad ${adId}:`, error);
    return {};
  }
}

/**
 * Fetch ad creatives with performance data
 */
export async function fetchAdCreatives(): Promise<AdCreative[]> {
  console.log('💥💥💥 fetchAdCreatives() EXECUTING - VERSION 3.1 💥💥💥');
  try {
    const insights = await fetchAdInsights();

    console.log('🎨 Fetching creative details for', insights.length, 'ads...');

    // Fetch creative details for each ad in parallel
    const creativeDetailsPromises = insights.map(ad =>
      fetchAdCreativeDetails(ad.ad_id)
    );
    const creativeDetails = await Promise.all(creativeDetailsPromises);

    console.log('✅ Creative details fetched');

    return insights.map((ad, index) => {
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

      const adCreative = {
        id: ad.ad_id || `ad-${index}`,
        headline: creative.headline || ad.ad_name || `Ad ${index + 1}`,  // Use actual headline from creative
        bodySnippet: creative.body || 'No ad copy available',  // Use actual body text
        conversions: conversionCount,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        costPerConversion: parseFloat(costPerConversion.toFixed(2)),
        clickThroughRate: parseFloat(clickThroughRate.toFixed(2)),
        concept: ad.campaign_name || 'Meta Campaign',
        status,
        confidence,
        imageUrl: creative.imageUrl || creative.videoUrl,  // Use actual image/video URL
        spend,
        impressions,
        clicks,
        campaignName: ad.campaign_name,
        adsetName: ad.adset_name
      };

      // Log first 3 ads to verify data structure
      if (index < 3) {
        console.log(`🎨 AdCreative #${index}:`, {
          id: adCreative.id,
          headline: adCreative.headline?.substring(0, 40),
          body: adCreative.bodySnippet?.substring(0, 40),
          imageUrl: adCreative.imageUrl,
          hasImage: !!adCreative.imageUrl
        });
      }

      return adCreative;
    });
  } catch (error) {
    console.error('Error processing ad creatives:', error);
    throw error;
  }
}

/**
 * Fetch traffic types (campaign breakdown)
 */
export async function fetchTrafficTypes(): Promise<TrafficType[]> {
  try {
    console.log('📊 Fetching traffic types...');
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;

    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_id,campaign_name,spend,actions',  // Added campaign_id for consistency
      level: 'campaign',
      date_preset: 'last_30d',  // Use date preset instead of time_range
      limit: '50'
    });

    console.log('🌐 Traffic types URL:', `${url}?${params}`.replace(ACCESS_TOKEN, 'TOKEN_HIDDEN'));
    const response = await fetch(`${url}?${params}`);

    console.log('📡 Traffic types response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Traffic types error:', errorText);
      throw new Error(`Meta API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Traffic types data received:', data);
    const campaigns = data.data || [];

    // Add "All" traffic type
    const allConversions = campaigns.reduce((total: number, campaign: any) => {
      const conversions = campaign.actions?.find(
        (action: any) => action.action_type === 'offsite_conversion.fb_pixel_purchase'
      )?.value || '0';
      return total + parseInt(conversions, 10);
    }, 0);

    const allSpend = campaigns.reduce((total: number, campaign: any) => {
      return total + parseFloat(campaign.spend || '0');
    }, 0);

    const trafficTypes: TrafficType[] = [
      {
        id: 'all',
        name: 'All Traffic',
        conversions: allConversions,
        spend: allSpend
      }
    ];

    // Add individual campaigns
    campaigns.forEach((campaign: any) => {
      const conversions = campaign.actions?.find(
        (action: any) => action.action_type === 'offsite_conversion.fb_pixel_purchase'
      )?.value || '0';

      trafficTypes.push({
        id: campaign.campaign_id || campaign.campaign_name?.toLowerCase().replace(/\s+/g, '-') || `campaign-${Math.random()}`,
        name: campaign.campaign_name || `Campaign ${campaign.campaign_id}`,
        conversions: parseInt(conversions, 10),
        spend: parseFloat(campaign.spend || '0')
      });
    });

    return trafficTypes;
  } catch (error) {
    console.error('Error fetching traffic types:', error);
    throw error;
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
