// Meta Marketing API Service

const META_API_VERSION = 'v21.0';
const META_GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;

const ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = import.meta.env.VITE_META_AD_ACCOUNT_ID;

// Debug: Log the token being loaded (first and last 10 chars for security)
console.log('🔑 Loaded Access Token:', ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 10)}...${ACCESS_TOKEN.substring(ACCESS_TOKEN.length - 10)}` : 'MISSING');
console.log('📊 Loaded Ad Account ID:', AD_ACCOUNT_ID);

interface MetaAdInsight {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  creative?: {
    id: string;
    title: string;
    body: string;
    image_url?: string;
  };
}

export interface AdCreative {
  id: string;
  headline: string;
  bodySnippet: string;
  conversions: number;
  concept: string;
  status: 'Winning' | 'Testing' | 'Fatigued';
  confidence: 'High' | 'Medium' | 'Low';
  imageUrl?: string;
  spend: number;
  impressions: number;
  clicks: number;
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
export async function fetchAdInsights(): Promise<MetaAdInsight[]> {
  console.log('🔍 Fetching Meta Ad Insights...');
  console.log('Access Token:', ACCESS_TOKEN ? `${ACCESS_TOKEN.substring(0, 20)}...` : 'MISSING');
  console.log('Ad Account ID:', AD_ACCOUNT_ID);

  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;

    // Use a simpler time range that Meta accepts (last 30 days)
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions',  // Added campaign_id for unique keys
      level: 'campaign',
      date_preset: 'last_30d',  // Use date preset instead of time_range
      limit: '50'
    });

    const fullUrl = `${url}?${params}`;
    console.log('🌐 Request URL:', fullUrl.replace(ACCESS_TOKEN, 'TOKEN_HIDDEN'));

    const response = await fetch(fullUrl);

    console.log('📡 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:', errorText);

      // Parse error for better debugging
      try {
        const errorJson = JSON.parse(errorText);
        console.error('❌ Parsed error:', errorJson);
        throw new Error(`Meta API error: ${errorJson.error?.message || response.statusText}`);
      } catch {
        throw new Error(`Meta API error: ${response.statusText} - ${errorText}`);
      }
    }

    const data = await response.json();
    console.log('✅ Data received:', data);
    console.log('✅ Number of campaigns:', data.data?.length || 0);
    return data.data || [];
  } catch (error) {
    console.error('❌ Error fetching Meta ad insights:', error);
    throw error;
  }
}

/**
 * Fetch ad creatives with performance data
 */
export async function fetchAdCreatives(): Promise<AdCreative[]> {
  try {
    const insights = await fetchAdInsights();

    return insights.map((ad, index) => {
      // Extract conversions from actions array
      const conversions = ad.actions?.find(
        action => action.action_type === 'offsite_conversion.fb_pixel_purchase'
      )?.value || '0';

      const spend = parseFloat(ad.spend || '0');
      const conversionCount = parseInt(conversions, 10);

      // Determine status based on performance
      let status: 'Winning' | 'Testing' | 'Fatigued' = 'Testing';
      if (conversionCount > 50 && spend > 100) {
        status = 'Winning';
      } else if (spend > 200 && conversionCount < 10) {
        status = 'Fatigued';
      }

      // Determine confidence based on data volume
      const impressions = parseInt(ad.impressions || '0', 10);
      let confidence: 'High' | 'Medium' | 'Low' = 'Low';
      if (impressions > 10000) {
        confidence = 'High';
      } else if (impressions > 1000) {
        confidence = 'Medium';
      }

      return {
        id: ad.campaign_id || `campaign-${index}`,  // Use campaign_id or fallback to index
        headline: ad.creative?.title || ad.campaign_name || `Ad ${index + 1}`,
        bodySnippet: ad.creative?.body || 'No description available',
        conversions: conversionCount,
        concept: 'Meta Campaign', // You can enhance this with actual campaign categorization
        status,
        confidence,
        imageUrl: ad.creative?.image_url,
        spend,
        impressions,
        clicks: parseInt(ad.clicks || '0', 10)
      };
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

    if (!response.ok || data.error) {
      console.error('❌ Connection test failed:', data);
      return {
        success: false,
        message: data.error?.message || 'Unknown error',
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
    return {
      success: false,
      message: error.message || 'Network error'
    };
  }
}
