// Meta Marketing API Service

const META_API_VERSION = 'v21.0';
const META_GRAPH_API = `https://graph.facebook.com/${META_API_VERSION}`;

const ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = import.meta.env.VITE_META_AD_ACCOUNT_ID;

interface MetaAdInsight {
  id: string;
  name: string;
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
  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;

    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_name,impressions,clicks,spend,actions,adcreatives{title,body,image_url}',
      level: 'ad',
      time_range: JSON.stringify({ since: '2024-01-01', until: 'today' }),
      limit: '100'
    });

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      throw new Error(`Meta API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching Meta ad insights:', error);
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
        id: ad.id,
        headline: ad.creative?.title || ad.name || `Ad ${index + 1}`,
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
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}/insights`;

    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'campaign_name,spend,actions',
      level: 'campaign',
      time_range: JSON.stringify({ since: '2024-01-01', until: 'today' }),
      limit: '50'
    });

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      throw new Error(`Meta API error: ${response.statusText}`);
    }

    const data = await response.json();
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
        id: campaign.campaign_name?.toLowerCase().replace(/\s+/g, '-') || `campaign-${campaign.id}`,
        name: campaign.campaign_name || `Campaign ${campaign.id}`,
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
export async function testMetaConnection(): Promise<boolean> {
  try {
    const url = `${META_GRAPH_API}/${AD_ACCOUNT_ID}`;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      fields: 'name,account_id'
    });

    const response = await fetch(`${url}?${params}`);
    return response.ok;
  } catch (error) {
    console.error('Error testing Meta connection:', error);
    return false;
  }
}
