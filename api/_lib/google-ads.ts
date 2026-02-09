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
  scope?: string;
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
    details?: Array<{
      '@type'?: string;
      errors?: Array<{
        errorCode?: Record<string, string>;
        message?: string;
      }>;
    }>;
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

async function getGoogleAdsAccessToken(): Promise<{ token: string; scopes?: string } | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return { token: cachedToken.token };
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
    return { token: data.access_token, scopes: data.scope };
  } catch (err) {
    console.error('Google Ads token refresh error:', err);
    return null;
  }
}

// ─── Error Parsing ──────────────────────────────────────────────────────────

/**
 * Parse the Google Ads API error response into an actionable message.
 * Google returns detailed error codes in `error.details[].errors[].errorCode`
 * that tell us exactly what's wrong (e.g., DEVELOPER_TOKEN_NOT_APPROVED).
 */
function parseGoogleAdsError(errorText: string, statusCode: number, loginCustomerId?: string): string {
  try {
    const errorData = JSON.parse(errorText);
    const topMessage = errorData.error?.message || `API error ${statusCode}`;
    const details = errorData.error?.details;

    // Extract specific error codes from the details array
    const errorCodes: string[] = [];
    if (Array.isArray(details)) {
      for (const detail of details) {
        if (Array.isArray(detail.errors)) {
          for (const err of detail.errors) {
            if (err.errorCode) {
              // errorCode is an object like { "authorizationError": "DEVELOPER_TOKEN_NOT_APPROVED" }
              const entries = Object.entries(err.errorCode);
              for (const [category, code] of entries) {
                errorCodes.push(`${category}: ${code}`);
              }
            }
          }
        }
      }
    }

    // Build diagnostic message
    const parts: string[] = [topMessage];

    if (errorCodes.length > 0) {
      parts.push(`[${errorCodes.join(', ')}]`);
    }

    // Add actionable hints based on specific error codes
    const allCodes = errorCodes.join(' ').toUpperCase();

    if (allCodes.includes('DEVELOPER_TOKEN_NOT_APPROVED')) {
      parts.push('Your developer token is in test mode. Apply for Standard or Basic access at Google Ads → Tools → API Center.');
    } else if (allCodes.includes('USER_PERMISSION_DENIED') || allCodes.includes('CUSTOMER_NOT_ALLOWED')) {
      parts.push('The OAuth user does not have access to this Google Ads account. Verify the refresh token was created by a user with access to the account.');
    } else if (allCodes.includes('NOT_ADS_USER')) {
      parts.push('The OAuth user is not a Google Ads user. The refresh token must be from a Google account that has Google Ads access.');
    } else if (allCodes.includes('OAUTH_TOKEN_INVALID')) {
      parts.push('The refresh token is invalid or revoked. Generate a new refresh token with the adwords scope.');
    } else if (statusCode === 403 && !loginCustomerId) {
      parts.push('Try setting GOOGLE_ADS_LOGIN_CUSTOMER_ID to your MCC (Manager) account ID.');
    } else if (statusCode === 403 && loginCustomerId) {
      parts.push(`login-customer-id is set to ${loginCustomerId}. Verify this matches your MCC account and that the developer token is under this account.`);
    }

    return parts.join(' — ');
  } catch {
    return `Keyword Planner API error (${statusCode})`;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

/**
 * Run diagnostic checks on the Google Ads API configuration.
 * Returns a detailed report of what's configured and what's failing.
 */
export async function diagnoseGoogleAdsConfig(): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    apiVersion: ADS_API_VERSION,
  };

  // Check env vars (mask values for security)
  report.envVars = {
    GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? `${process.env.GOOGLE_ADS_DEVELOPER_TOKEN.slice(0, 4)}...` : 'NOT SET',
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID || 'NOT SET',
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || 'NOT SET',
    GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN ? `${process.env.GOOGLE_ADS_REFRESH_TOKEN.slice(0, 8)}...` : 'NOT SET',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}...` : 'NOT SET',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '****' : 'NOT SET',
  };

  if (!isGoogleAdsConfigured()) {
    report.status = 'MISSING_CONFIG';
    report.message = 'One or more required env vars are not set';
    return report;
  }

  // Step 1: Test OAuth token refresh
  const tokenResult = await getGoogleAdsAccessToken();
  if (!tokenResult) {
    report.status = 'TOKEN_REFRESH_FAILED';
    report.message = 'Failed to refresh OAuth access token. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN.';
    return report;
  }

  report.tokenRefresh = 'OK';
  if (tokenResult.scopes) {
    report.tokenScopes = tokenResult.scopes;
    report.hasAdwordsScope = tokenResult.scopes.includes('adwords') || tokenResult.scopes.includes('ads');
  }

  // Step 2: Test a minimal API call (list accessible customers — doesn't need a customer ID)
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');

  try {
    const listHeaders: Record<string, string> = {
      'Authorization': `Bearer ${tokenResult.token}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (loginCustomerId) {
      listHeaders['login-customer-id'] = loginCustomerId;
    }

    const listResponse = await fetch(
      `https://googleads.googleapis.com/${ADS_API_VERSION}/customers:listAccessibleCustomers`,
      { method: 'GET', headers: listHeaders }
    );

    if (listResponse.ok) {
      const listData = await listResponse.json() as { resourceNames?: string[] };
      report.accessibleCustomers = listData.resourceNames || [];
      report.listCustomersStatus = 'OK';

      // Check if target customer ID is in the accessible list
      const targetId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '');
      const accessible = (listData.resourceNames || []).map((r: string) => r.replace('customers/', ''));
      report.targetCustomerId = targetId;
      report.targetCustomerAccessible = accessible.includes(targetId);

      if (!accessible.includes(targetId)) {
        report.message = `Customer ID ${targetId} is not in the accessible accounts list. The refresh token user may not have access to this account.`;
      }
    } else {
      const errorText = await listResponse.text();
      report.listCustomersStatus = 'FAILED';
      report.listCustomersError = parseGoogleAdsError(errorText, listResponse.status, loginCustomerId);
    }
  } catch (err) {
    report.listCustomersStatus = 'EXCEPTION';
    report.listCustomersError = err instanceof Error ? err.message : 'Unknown error';
  }

  // Step 3: Test generateKeywordIdeas with a simple seed
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '');
  try {
    const kpHeaders: Record<string, string> = {
      'Authorization': `Bearer ${tokenResult.token}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };
    if (loginCustomerId) {
      kpHeaders['login-customer-id'] = loginCustomerId;
    }

    const kpResponse = await fetch(
      `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}:generateKeywordIdeas`,
      {
        method: 'POST',
        headers: kpHeaders,
        body: JSON.stringify({
          language: 'languageConstants/1000',
          geoTargetConstants: ['geoTargetConstants/2840'],
          keywordPlanNetwork: 'GOOGLE_SEARCH',
          keywordSeed: { keywords: ['test'] },
          pageSize: 1,
        }),
      }
    );

    if (kpResponse.ok) {
      report.keywordPlannerStatus = 'OK';
      report.status = 'ALL_CHECKS_PASSED';
    } else {
      const errorText = await kpResponse.text();
      report.keywordPlannerStatus = 'FAILED';
      report.keywordPlannerError = parseGoogleAdsError(errorText, kpResponse.status, loginCustomerId);
      report.status = 'KEYWORD_PLANNER_FAILED';
    }
  } catch (err) {
    report.keywordPlannerStatus = 'EXCEPTION';
    report.keywordPlannerError = err instanceof Error ? err.message : 'Unknown error';
    report.status = 'KEYWORD_PLANNER_EXCEPTION';
  }

  return report;
}

// ─── Keyword Planner API ─────────────────────────────────────────────────────

export async function fetchKeywordIdeas(
  seeds: string[],
  options?: { useUrl?: boolean }
): Promise<{ keywords: KeywordIdea[]; error?: string }> {
  if (!isGoogleAdsConfigured()) {
    return { keywords: [], error: 'Google Ads API not configured' };
  }

  const tokenResult = await getGoogleAdsAccessToken();
  if (!tokenResult) {
    return { keywords: [], error: 'Failed to get Google Ads access token — check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN' };
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
      'Authorization': `Bearer ${tokenResult.token}`,
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
      return { keywords: [], error: parseGoogleAdsError(errorText, response.status, loginCustomerId) };
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
