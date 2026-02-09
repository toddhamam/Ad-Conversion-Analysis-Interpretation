/**
 * Google Ads Keyword Planner API client.
 *
 * Uses the Google Ads REST API to fetch keyword ideas (search volume,
 * competition, CPC data) for seed keywords or a URL.
 *
 * Required env vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN  — from Google Ads → Tools → API Center
 *   GOOGLE_ADS_CUSTOMER_ID      — Google Ads account ID (no dashes)
 *   GOOGLE_ADS_REFRESH_TOKEN    — OAuth refresh token with adwords scope
 *   GOOGLE_CLIENT_ID            — OAuth client ID (shared with GSC)
 *   GOOGLE_CLIENT_SECRET        — OAuth client secret (shared with GSC)
 *
 * Optional env vars:
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID — MCC (Manager) account ID if developer token
 *                                  is under a manager account (no dashes)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  competitionIndex: number;
  topOfPageBidLow: number;  // micros (divide by 1_000_000 for dollars)
  topOfPageBidHigh: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleAdsKeywordResult {
  text?: string;
  keywordIdeaMetrics?: {
    avgMonthlySearches?: string;
    competition?: string;
    competitionIndex?: string;
    lowTopOfPageBidMicros?: string;
    highTopOfPageBidMicros?: string;
    monthlySearchVolumes?: Array<{
      month?: string;
      year?: string;
      monthlySearches?: string;
    }>;
  };
}

interface GoogleAdsResponse {
  results?: GoogleAdsKeywordResult[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// ─── Configuration ───────────────────────────────────────────────────────────

const ADS_API_VERSION = 'v23';

export function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
}

// ─── Token Management ────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAdsAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Google Ads OAuth credentials not configured');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Ads token refresh failed:', response.status, errorText);
      return null;
    }

    const data: TokenResponse = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  } catch (err) {
    console.error('Google Ads token refresh error:', err);
    return null;
  }
}

// ─── Keyword Planner API ─────────────────────────────────────────────────────

export async function fetchKeywordIdeas(
  seeds: string[],
  options?: { useUrl?: boolean }
): Promise<{ keywords: KeywordIdea[]; error?: string }> {
  if (!isGoogleAdsConfigured()) {
    return { keywords: [], error: 'Google Ads API not configured' };
  }

  const accessToken = await getGoogleAdsAccessToken();
  if (!accessToken) {
    return { keywords: [], error: 'Failed to get Google Ads access token' };
  }

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '');
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;

  // Build request body
  const body: Record<string, unknown> = {
    language: 'languageConstants/1000',           // English
    geoTargetConstants: ['geoTargetConstants/2840'], // United States
    keywordPlanNetwork: 'GOOGLE_SEARCH',
  };

  if (options?.useUrl && seeds.length === 1) {
    body.urlSeed = { url: seeds[0] };
  } else {
    body.keywordSeed = { keywords: seeds.slice(0, 10) }; // API limit: max 10 seeds
  }

  try {
    const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}:generateKeywordIdeas`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };

    // Required when developer token belongs to a Manager (MCC) account
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');
    if (loginCustomerId) {
      headers['login-customer-id'] = loginCustomerId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Ads Keyword Planner error:', response.status, errorText);

      // Parse structured error if possible
      try {
        const errorData = JSON.parse(errorText);
        const msg = errorData.error?.message || `API error ${response.status}`;

        // Add actionable hint for permission errors
        if (response.status === 403 || msg.toLowerCase().includes('permission')) {
          const hint = !loginCustomerId
            ? ' — Try setting GOOGLE_ADS_LOGIN_CUSTOMER_ID to your MCC (Manager) account ID'
            : '';
          return { keywords: [], error: `${msg}${hint}` };
        }

        return { keywords: [], error: msg };
      } catch {
        return { keywords: [], error: `Keyword Planner API error (${response.status})` };
      }
    }

    const data: GoogleAdsResponse = await response.json();

    if (data.error) {
      return { keywords: [], error: data.error.message };
    }

    const keywords: KeywordIdea[] = (data.results || [])
      .filter((r) => r.text && r.keywordIdeaMetrics)
      .map((r) => {
        const metrics = r.keywordIdeaMetrics!;
        return {
          keyword: r.text!.toLowerCase(),
          avgMonthlySearches: parseInt(metrics.avgMonthlySearches || '0', 10),
          competition: parseCompetition(metrics.competition),
          competitionIndex: parseInt(metrics.competitionIndex || '0', 10),
          topOfPageBidLow: parseInt(metrics.lowTopOfPageBidMicros || '0', 10),
          topOfPageBidHigh: parseInt(metrics.highTopOfPageBidMicros || '0', 10),
        };
      })
      .filter((k) => k.avgMonthlySearches > 0); // Skip zero-volume keywords

    return { keywords };
  } catch (err) {
    console.error('Keyword Planner fetch error:', err);
    return { keywords: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

function parseCompetition(value?: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' {
  if (!value) return 'UNKNOWN';
  const upper = value.toUpperCase();
  if (upper === 'LOW') return 'LOW';
  if (upper === 'MEDIUM') return 'MEDIUM';
  if (upper === 'HIGH') return 'HIGH';
  return 'UNKNOWN';
}
