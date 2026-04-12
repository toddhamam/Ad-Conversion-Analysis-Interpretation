import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt, encrypt, isEncryptionConfigured } from './_lib/encryption.js';
import { initSentry, captureError, flushSentry } from './_lib/sentry.js';
import { refreshMetaToken, isWithinRefreshWindow, isTokenExpired } from './_lib/meta-token.js';
import {
  handleReportSchedules,
  handleReportExport,
  handleReportSend,
  handleReportCron,
  handleReportHistory,
} from './_lib/report-handlers.js';
// DISABLED: External API access to Meta Platform Data disabled for policy compliance.
// import { handleExternalSummary } from './_lib/external-report.js';

initSentry();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Authentication ──────────────────────────────────────────────────────────

interface AuthContext {
  userId: string;
  organizationId: string;
}

async function authenticateRequest(req: VercelRequest): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id')
    .eq('auth_id', user.id)
    .single();

  if (!profile) return null;
  return { userId: profile.id, organizationId: profile.organization_id };
}

// ─── Credential loading ─────────────────────────────────────────────────────

interface MetaCredentials {
  accessToken: string;
  adAccountId: string | null;
  pageId: string | null;
  pixelId: string | null;
}

interface CredentialDiagnostics {
  reason: string;
  status?: string;
  tokenExpiresAt?: string | null;
  hasRow: boolean;
}

let _lastCredDiag: CredentialDiagnostics | null = null;

function getLastCredentialDiagnostics(): CredentialDiagnostics | null {
  return _lastCredDiag;
}

async function loadCredentials(
  organizationId: string,
  requestedAdAccountId?: string
): Promise<MetaCredentials | null> {
  const { data: cred, error: credError } = await supabase
    .from('organization_credentials')
    .select('access_token_encrypted, ad_account_id, page_id, pixel_id, status, token_expires_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('provider', 'meta')
    .single();

  if (credError || !cred) {
    _lastCredDiag = { reason: credError ? `DB error: ${credError.message}` : 'No credential row found', hasRow: false };
    return null;
  }

  if (cred.status !== 'active') {
    _lastCredDiag = { reason: `Status is '${cred.status}' (not 'active')`, status: cred.status, tokenExpiresAt: cred.token_expires_at, hasRow: true };
    return null;
  }

  // Token already expired — mark and reject
  if (isTokenExpired(cred.token_expires_at)) {
    _lastCredDiag = { reason: `Token expired at ${cred.token_expires_at}`, status: cred.status, tokenExpiresAt: cred.token_expires_at, hasRow: true };
    await supabase
      .from('organization_credentials')
      .update({ status: 'expired' })
      .eq('organization_id', organizationId)
      .eq('provider', 'meta');
    return null;
  }

  // Token nearing expiry — attempt inline refresh (non-blocking)
  if (isWithinRefreshWindow(cred.token_expires_at)) {
    // Skip if already refreshed within the last 5 minutes (dedup concurrent requests)
    const lastRefreshed = cred.updated_at ? new Date(cred.updated_at).getTime() : 0;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    if (lastRefreshed < fiveMinutesAgo) {
      try {
        const result = await refreshMetaToken(organizationId, cred.access_token_encrypted, supabase);
        if (result.success) {
          // Re-read the refreshed token from DB
          const { data: refreshedCred } = await supabase
            .from('organization_credentials')
            .select('access_token_encrypted, ad_account_id, page_id, pixel_id')
            .eq('organization_id', organizationId)
            .eq('provider', 'meta')
            .single();

          if (refreshedCred) {
            const refreshedToken = decrypt(refreshedCred.access_token_encrypted);
            // If a specific ad account was requested, resolve its config
            if (requestedAdAccountId) {
              const accountConfig = await resolveAdAccountConfig(organizationId, requestedAdAccountId);
              if (accountConfig) {
                return { accessToken: refreshedToken, ...accountConfig };
              }
            }
            return {
              accessToken: refreshedToken,
              adAccountId: refreshedCred.ad_account_id,
              pageId: refreshedCred.page_id,
              pixelId: refreshedCred.pixel_id,
            };
          }
        }
        // Refresh failed — fall through to use the current (still valid) token
        console.warn(`Meta token refresh failed for org ${organizationId}: ${result.error}`);
      } catch (err: unknown) {
        console.warn('Inline token refresh error:', err instanceof Error ? err.message : err);
      }
    }
  }

  const accessToken = decrypt(cred.access_token_encrypted);

  // If a specific ad account was requested, look up its config from organization_ad_accounts
  if (requestedAdAccountId) {
    const accountConfig = await resolveAdAccountConfig(organizationId, requestedAdAccountId);
    if (accountConfig) {
      return { accessToken, ...accountConfig };
    }
    // Requested account not found or inactive — throw instead of silently falling back
    throw new Error(`Ad account ${requestedAdAccountId} is not active or not found for this organization.`);
  }

  return {
    accessToken,
    adAccountId: cred.ad_account_id,
    pageId: cred.page_id,
    pixelId: cred.pixel_id,
  };
}

// ── Helper: Resolve per-account config from organization_ad_accounts ──
async function resolveAdAccountConfig(
  organizationId: string,
  adAccountId: string
): Promise<{ adAccountId: string; pageId: string | null; pixelId: string | null; businessType: string | null } | null> {
  const { data: account } = await supabase
    .from('organization_ad_accounts')
    .select('ad_account_id, page_id, pixel_id, is_active, business_type')
    .eq('organization_id', organizationId)
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account || !account.is_active) return null;

  return {
    adAccountId: account.ad_account_id,
    pageId: account.page_id,
    pixelId: account.pixel_id,
    businessType: account.business_type || null,
  };
}

// ─── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = req.query.route as string;

  if (!route) {
    return res.status(400).json({ error: 'route query parameter is required' });
  }

  try {
    switch (route) {
      case 'proxy':
        return handleProxy(req, res);
      case 'status':
        return handleStatus(req, res);
      case 'upload':
        return handleUpload(req, res);
      case 'insights':
        return handleInsights(req, res);
      case 'campaigns':
        return handleCampaigns(req, res);
      case 'update-selection':
        return handleUpdateSelection(req, res);
      case 'fetch-pixels':
        return handleFetchPixels(req, res);
      case 'save-credentials':
        return handleSaveCredentials(req, res);
      case 'disconnect':
        return handleDisconnect(req, res);
      case 'ad-library':
        return handleAdLibrary(req, res);
      case 'snapshot-images':
        return handleSnapshotImages(req, res);
      case 'refresh-tokens':
        return handleRefreshTokens(req, res);
      case 'ai-chat':
        return handleAIChat(req, res);
      case 'ai-images':
        return handleAIImages(req, res);
      case 'video-upload':
        return handleVideoUpload(req, res);
      case 'ad-accounts':
        return handleAdAccounts(req, res);
      case 'refresh-available':
        return handleRefreshAvailable(req, res);
      case 'report-schedules':
        return handleReportSchedules(req, res);
      case 'report-export':
        return handleReportExport(req, res);
      case 'report-send':
        return handleReportSend(req, res);
      case 'report-cron':
        return handleReportCron(req, res);
      case 'report-history':
        return handleReportHistory(req, res);
      case 'swipe-list':
        return handleSwipeList(req, res);
      case 'swipe-save':
        return handleSwipeSave(req, res);
      case 'swipe-update':
        return handleSwipeUpdate(req, res);
      case 'swipe-delete':
        return handleSwipeDelete(req, res);
      case 'swipe-image':
        return handleSwipeImage(req, res);
      case 'swipe-check':
        return handleSwipeCheck(req, res);
      case 'image-fetch':
        return handleImageFetch(req, res);
      case 'external-summary':
      case 'reports-external-summary':
        // DISABLED: External API access to Meta Platform Data is not covered by
        // our approved App Review use cases. Meta's Platform Terms (Section 3.a)
        // require data to be used only within the approved application.
        return res.status(410).json({
          error: 'External API access disabled',
          message: 'This endpoint has been disabled for Meta Platform Policy compliance. '
            + 'Meta Platform Data may only be accessed through the Convertra web application.',
        });
      default:
        return res.status(400).json({ error: `Unknown route: ${route}` });
    }
  } catch (err: unknown) {
    // Handle thrown "table not found in schema cache" errors gracefully —
    // report tables may not be provisioned yet (migration pending)
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('schema cache')) {
      return res.status(501).json({
        error: 'Feature not yet available',
        message: 'A required database table has not been created. Database migration pending.',
      });
    }

    console.error(`Meta API error (${route}):`, err);
    captureError(err, { route: `meta/${route}` });
    await flushSentry();
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ─── Route: proxy ────────────────────────────────────────────────────────────
// General-purpose Meta Graph API proxy. Token stays server-side.

async function handleProxy(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    method = 'GET',
    endpoint,
    params = {},
    body,
    formEncoded = false,
    adAccountId: requestedAdAccountId,
  } = req.body || {};

  // Load credentials, optionally scoped to a specific ad account (multi-account support)
  const creds = await loadCredentials(auth.organizationId, requestedAdAccountId || undefined);
  if (!creds) {
    const diag = getLastCredentialDiagnostics();
    return res.status(404).json({
      error: 'Meta credentials not found',
      message: `Please connect your Meta Ads account first`,
      diagnostics: diag ? `${diag.reason} (orgId: ${auth.organizationId.slice(0, 8)}...)` : 'Unknown',
    });
  }

  // Allow empty endpoint for batch lookups via ?ids= (Meta's root-level Graph API)
  if (endpoint !== '' && (!endpoint || typeof endpoint !== 'string')) {
    return res.status(400).json({ error: 'endpoint is required' });
  }

  const apiUrl = new URL(endpoint ? `${GRAPH_API_BASE}/${endpoint}` : `${GRAPH_API_BASE}/`);
  apiUrl.searchParams.set('access_token', creds.accessToken);

  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        apiUrl.searchParams.set(key, String(value));
      }
    }
  }

  let fetchOptions: RequestInit = { method: method as string };

  if (method === 'POST' || method === 'DELETE') {
    if (formEncoded && body) {
      const formBody = new URLSearchParams();
      formBody.set('access_token', creds.accessToken);
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          formBody.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
      }
      fetchOptions.body = formBody.toString();
      fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    } else if (body) {
      fetchOptions.body = JSON.stringify({
        ...body,
        access_token: creds.accessToken,
      });
      fetchOptions.headers = { 'Content-Type': 'application/json' };
    }
  }

  const response = await fetch(apiUrl.toString(), fetchOptions);
  const data = await response.json();

  // Forward Meta rate limit headers to the frontend for the DevPolicyGuard
  const rateLimitHeaderNames = ['x-app-usage', 'x-business-use-case-usage', 'x-fb-ads-insights-throttle'];
  const rateLimitHeaders: Record<string, string> = {};
  for (const headerName of rateLimitHeaderNames) {
    const val = response.headers.get(headerName);
    if (val) {
      rateLimitHeaders[headerName] = val;
      res.setHeader(headerName, val);
    }
  }

  if (!response.ok) {
    if (data.error?.code === 190) {
      await supabase
        .from('organization_credentials')
        .update({ status: 'expired', last_error: data.error.message })
        .eq('organization_id', auth.organizationId)
        .eq('provider', 'meta');
    }

    return res.status(response.status).json({
      error: 'Meta API error',
      message: data.error?.message || 'Unknown error from Meta API',
      code: data.error?.code,
      subcode: data.error?.error_subcode,
      fbtrace_id: data.error?.fbtrace_id,
      _rateLimitHeaders: Object.keys(rateLimitHeaders).length > 0 ? rateLimitHeaders : undefined,
    });
  }

  return res.status(200).json(data);
}

// ─── Route: status ───────────────────────────────────────────────────────────
// Returns non-sensitive credential status for the authenticated user's org.

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: cred } = await supabase
    .from('organization_credentials')
    .select('ad_account_id, page_id, pixel_id, status, token_expires_at, metadata')
    .eq('organization_id', auth.organizationId)
    .eq('provider', 'meta')
    .single();

  if (!cred) {
    return res.status(200).json({
      connected: false,
      status: 'not_connected',
      adAccountId: null,
      pageId: null,
      pixelId: null,
      tokenExpiresAt: null,
      accountName: null,
      availableAccounts: [],
      availablePages: [],
      needsConfiguration: false,
      adAccounts: [],
    });
  }

  const isExpired = cred.token_expires_at && new Date(cred.token_expires_at) < new Date();
  const isActive = cred.status === 'active' && !isExpired;

  // One-time migration: ensure the primary credential's ad account exists in
  // organization_ad_accounts. Handles orgs set up before multi-account migration.
  // Uses INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates) so it:
  // - Never overwrites user-configured page_id/pixel_id on existing rows
  // - Never re-activates intentionally deactivated accounts
  // - Only inserts if the row doesn't exist at all
  if (cred.ad_account_id) {
    await supabase
      .from('organization_ad_accounts')
      .upsert({
        organization_id: auth.organizationId,
        ad_account_id: cred.ad_account_id,
        ad_account_name: cred.metadata?.selected_account_name || null,
        page_id: cred.page_id,
        pixel_id: cred.pixel_id,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,ad_account_id', ignoreDuplicates: true });
  }

  // Load activated ad accounts from organization_ad_accounts table
  const { data: adAccounts, error: adAccountsError } = await supabase
    .from('organization_ad_accounts')
    .select('id, ad_account_id, ad_account_name, page_id, pixel_id, is_active, account_status, currency, business_type, products')
    .eq('organization_id', auth.organizationId)
    .eq('is_active', true)
    .order('ad_account_name', { ascending: true });

  if (adAccountsError) {
    captureError(adAccountsError, { route: 'meta/status', organizationId: auth.organizationId });
    // Don't fail the whole status response — return empty adAccounts so frontend can fallback
  }

  return res.status(200).json({
    connected: isActive,
    status: isExpired ? 'expired' : cred.status,
    adAccountId: cred.ad_account_id,
    pageId: cred.page_id,
    pixelId: cred.pixel_id,
    tokenExpiresAt: cred.token_expires_at,
    accountName: cred.metadata?.selected_account_name || null,
    availableAccounts: cred.metadata?.available_accounts || [],
    availablePages: cred.metadata?.available_pages || [],
    needsConfiguration: isActive && (!cred.ad_account_id || !cred.page_id),
    adAccounts: adAccounts || [],
  });
}

// ─── Route: upload ───────────────────────────────────────────────────────────
// Image upload proxy for Meta adimages endpoint.

async function handleUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { imageBase64, filename, adAccountId: requestedAdAccountId } = req.body || {};

  // Load credentials, optionally scoped to a specific ad account (multi-account support)
  const creds = await loadCredentials(auth.organizationId, requestedAdAccountId || undefined);
  if (!creds) {
    return res.status(404).json({ error: 'Meta credentials not found' });
  }

  if (!creds.adAccountId) {
    return res.status(400).json({ error: 'No ad account configured' });
  }

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  const boundary = `----MetaUpload${Date.now()}`;
  const parts: Buffer[] = [];

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${creds.accessToken}\r\n`
  ));

  const imageName = filename || 'ad_image.jpg';
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${imageName}"\r\nContent-Type: image/jpeg\r\n\r\n`
  ));
  parts.push(imageBuffer);
  parts.push(Buffer.from('\r\n'));

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const multipartBody = Buffer.concat(parts);

  const uploadUrl = `${GRAPH_API_BASE}/${creds.adAccountId}/adimages`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length),
    },
    body: multipartBody,
  });

  const data = await response.json();

  // Forward Meta rate limit headers to the frontend for the DevPolicyGuard
  const rateLimitHeaderNames = ['x-app-usage', 'x-business-use-case-usage', 'x-fb-ads-insights-throttle'];
  for (const headerName of rateLimitHeaderNames) {
    const val = response.headers.get(headerName);
    if (val) res.setHeader(headerName, val);
  }

  if (!response.ok) {
    console.error('Meta image upload error:', data);
    return res.status(response.status).json({
      error: 'Image upload failed',
      message: data.error?.message || 'Unknown error',
      code: data.error?.code,
    });
  }

  return res.status(200).json(data);
}

// ─── Route: insights ─────────────────────────────────────────────────────────
// Legacy insights proxy (uses organizationId query param for backwards compat).

async function handleInsights(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const organizationId =
    req.method === 'GET'
      ? req.query.organizationId
      : req.body?.organizationId || req.query.organizationId;

  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  const creds = await loadCredentials(organizationId);
  if (!creds) {
    return res.status(404).json({
      error: 'Meta credentials not found',
      message: 'Please connect your Meta Ads account first',
    });
  }

  const endpoint = req.method === 'GET' ? req.query.endpoint : req.body?.endpoint;
  const fields = req.method === 'GET' ? req.query.fields : req.body?.fields;
  const datePreset = req.method === 'GET' ? req.query.date_preset : req.body?.date_preset;
  const timeRange = req.method === 'GET' ? req.query.time_range : req.body?.time_range;
  const level = req.method === 'GET' ? req.query.level : req.body?.level;
  const limit = req.method === 'GET' ? req.query.limit : req.body?.limit;

  let apiUrl: URL;

  if (endpoint && typeof endpoint === 'string') {
    apiUrl = new URL(`${GRAPH_API_BASE}/${endpoint}`);
  } else if (creds.adAccountId) {
    apiUrl = new URL(`${GRAPH_API_BASE}/${creds.adAccountId}/insights`);
  } else {
    return res.status(400).json({ error: 'No ad account configured' });
  }

  apiUrl.searchParams.set('access_token', creds.accessToken);

  if (fields) {
    apiUrl.searchParams.set('fields', String(fields));
  } else {
    apiUrl.searchParams.set(
      'fields',
      'spend,impressions,clicks,conversions,cpc,cpm,ctr,cost_per_conversion,actions,action_values'
    );
  }

  if (datePreset) {
    apiUrl.searchParams.set('date_preset', String(datePreset));
  } else if (timeRange) {
    apiUrl.searchParams.set('time_range', String(timeRange));
  } else {
    apiUrl.searchParams.set('date_preset', 'last_30d');
  }

  if (level) apiUrl.searchParams.set('level', String(level));
  if (limit) apiUrl.searchParams.set('limit', String(limit));

  const response = await fetch(apiUrl.toString());
  const data = await response.json();

  if (!response.ok) {
    console.error('Meta API error:', data);

    if (data.error?.code === 190) {
      await supabase
        .from('organization_credentials')
        .update({ status: 'invalid' })
        .eq('organization_id', organizationId)
        .eq('provider', 'meta');

      return res.status(401).json({
        error: 'Invalid token',
        message: 'Meta access token is invalid. Please reconnect your account.',
      });
    }

    return res.status(response.status).json({
      error: 'Meta API error',
      message: data.error?.message || 'Unknown error from Meta API',
      code: data.error?.code,
    });
  }

  return res.status(200).json(data);
}

// ─── Route: campaigns ────────────────────────────────────────────────────────
// Legacy campaigns proxy (uses organizationId query param for backwards compat).

async function handleCampaigns(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { organizationId, fields, limit, status } = req.query;

  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  const creds = await loadCredentials(organizationId);
  if (!creds) {
    return res.status(404).json({
      error: 'Meta credentials not found',
      message: 'Please connect your Meta Ads account first',
    });
  }

  if (!creds.adAccountId) {
    return res.status(400).json({ error: 'No ad account configured' });
  }

  const apiUrl = new URL(`${GRAPH_API_BASE}/${creds.adAccountId}/campaigns`);
  apiUrl.searchParams.set('access_token', creds.accessToken);

  if (fields) {
    apiUrl.searchParams.set('fields', String(fields));
  } else {
    apiUrl.searchParams.set(
      'fields',
      'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time,effective_status,insights{spend,impressions,clicks,conversions,ctr,cpc}'
    );
  }

  if (limit) apiUrl.searchParams.set('limit', String(limit));

  if (status && typeof status === 'string') {
    const statusFilter = status.split(',').map((s) => `'${s.toUpperCase()}'`).join(',');
    apiUrl.searchParams.set('filtering', JSON.stringify([{ field: 'effective_status', operator: 'IN', value: statusFilter }]));
  }

  const response = await fetch(apiUrl.toString());
  const data = await response.json();

  if (!response.ok) {
    console.error('Meta API error:', data);
    return res.status(response.status).json({
      error: 'Meta API error',
      message: data.error?.message || 'Unknown error',
    });
  }

  return res.status(200).json(data);
}

// ─── Route: update-selection ────────────────────────────────────────────────
// User-facing endpoint to save ad account / page / pixel selection.
// Organization ID is derived from JWT — never trusted from the request body.

async function handleUpdateSelection(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { adAccountId, pageId, pixelId, products, reference_image_metadata } = req.body || {};

  if (!adAccountId) {
    return res.status(400).json({ error: 'adAccountId is required' });
  }

  // Load current metadata to preserve it
  const { data: cred } = await supabase
    .from('organization_credentials')
    .select('metadata')
    .eq('organization_id', auth.organizationId)
    .eq('provider', 'meta')
    .single();

  if (!cred) {
    return res.status(404).json({ error: 'No Meta credentials found. Please connect your Meta account first.' });
  }

  // Find selected account name from available accounts
  const availableAccounts = cred.metadata?.available_accounts || [];
  const selectedAccount = availableAccounts.find((acc: { id: string }) => acc.id === adAccountId);

  const { error: dbError } = await supabase
    .from('organization_credentials')
    .update({
      ad_account_id: adAccountId,
      page_id: pageId || null,
      pixel_id: pixelId || null,
      status: 'active',
      last_error: null,
      metadata: {
        ...cred.metadata,
        selected_account_name: selectedAccount?.name || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', auth.organizationId)
    .eq('provider', 'meta');

  if (dbError) {
    console.error('Failed to update selection:', dbError);
    captureError(dbError, { route: 'meta/update-selection', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: 'Failed to save configuration' });
  }

  // Also sync to organization_ad_accounts table (multi-account support)
  if (adAccountId) {
    await supabase
      .from('organization_ad_accounts')
      .upsert({
        organization_id: auth.organizationId,
        ad_account_id: adAccountId,
        ad_account_name: selectedAccount?.name || null,
        page_id: pageId || null,
        pixel_id: pixelId || null,
        is_active: true,
        account_status: selectedAccount?.account_status || null,
        currency: selectedAccount?.currency || null,
        ...(products !== undefined ? { products } : {}),
        ...(reference_image_metadata !== undefined ? { reference_image_metadata } : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,ad_account_id' });
    await updateSeatCount(auth.organizationId);
  }

  return res.status(200).json({ success: true });
}

// ─── Route: save-credentials ────────────────────────────────────────────────
// Self-service credential entry for users who can't use OAuth
// (e.g. when the Facebook App is in Development mode).
// JWT-authenticated — org derived from user's profile, never trusted from body.

async function handleSaveCredentials(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { accessToken, adAccountId, pageId, pixelId } = req.body || {};

  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  if (!isEncryptionConfigured()) {
    return res.status(500).json({ error: 'Encryption is not configured on the server' });
  }

  const errors: string[] = [];

  // 1. Validate token via debug_token
  try {
    const debugUrl = new URL(`${GRAPH_API_BASE}/debug_token`);
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('access_token', accessToken);

    const debugRes = await fetch(debugUrl.toString());
    const debugData = await debugRes.json();

    if (debugData.data) {
      if (!debugData.data.is_valid) {
        errors.push('Token is not valid — it may be expired or revoked');
      }
    } else if (debugData.error) {
      errors.push(`Token validation failed: ${debugData.error.message}`);
    }
  } catch (err: unknown) {
    errors.push(`Token validation request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Token validation failed', errors });
  }

  // 2. Fetch available ad accounts
  let availableAccounts: Array<{ id: string; name: string; account_id: string; account_status: number; currency: string }> = [];
  try {
    const acctUrl = new URL(`${GRAPH_API_BASE}/me/adaccounts`);
    acctUrl.searchParams.set('access_token', accessToken);
    acctUrl.searchParams.set('fields', 'account_id,id,name,account_status,currency');

    const acctRes = await fetch(acctUrl.toString());
    const acctData = await acctRes.json();
    availableAccounts = acctData.data || [];
  } catch {
    // Non-fatal — user may still enter ad account ID manually
  }

  // 3. Fetch available pages
  let availablePages: Array<{ id: string; name: string }> = [];
  try {
    const pagesUrl = new URL(`${GRAPH_API_BASE}/me/accounts`);
    pagesUrl.searchParams.set('access_token', accessToken);
    pagesUrl.searchParams.set('fields', 'id,name');

    const pagesRes = await fetch(pagesUrl.toString());
    const pagesData = await pagesRes.json();
    availablePages = pagesData.data || [];
  } catch {
    // Non-fatal
  }

  // 4. Verify ad account access if provided
  let accountName: string | null = null;
  if (adAccountId) {
    try {
      const accountUrl = new URL(`${GRAPH_API_BASE}/${adAccountId}`);
      accountUrl.searchParams.set('access_token', accessToken);
      accountUrl.searchParams.set('fields', 'id,name,account_status');

      const accountRes = await fetch(accountUrl.toString());
      const accountData = await accountRes.json();

      if (accountData.error) {
        errors.push(`Ad account access failed: ${accountData.error.message}`);
      } else {
        accountName = accountData.name;
        if (accountData.account_status !== 1) {
          errors.push(`Ad account is not active (status: ${accountData.account_status})`);
        }
      }
    } catch (err: unknown) {
      errors.push(`Ad account validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', errors });
  }

  // 5. Encrypt and store
  const encryptedToken = encrypt(accessToken);

  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 60);

  const needsConfiguration = !adAccountId;

  const { error: dbError } = await supabase
    .from('organization_credentials')
    .upsert(
      {
        organization_id: auth.organizationId,
        provider: 'meta',
        access_token_encrypted: encryptedToken,
        ad_account_id: adAccountId || null,
        page_id: pageId || null,
        pixel_id: pixelId || null,
        token_expires_at: tokenExpiresAt.toISOString(),
        status: 'active',
        last_error: null,
        metadata: {
          selected_account_name: accountName,
          available_accounts: availableAccounts,
          available_pages: availablePages,
          connected_at: new Date().toISOString(),
          connection_method: 'manual',
        },
      },
      { onConflict: 'organization_id,provider' }
    );

  if (dbError) {
    console.error('Failed to save credentials:', dbError);
    captureError(dbError, { route: 'meta/save-credentials', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: 'Failed to save credentials' });
  }

  return res.status(200).json({
    success: true,
    needsConfiguration,
    availableAccounts,
    availablePages,
  });
}

// ─── Route: fetch-pixels ────────────────────────────────────────────────────
// User-facing endpoint to fetch available pixels for a selected ad account.

async function handleFetchPixels(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { adAccountId } = req.body || {};
  if (!adAccountId) {
    return res.status(400).json({ error: 'adAccountId is required' });
  }

  const creds = await loadCredentials(auth.organizationId);
  if (!creds) {
    return res.status(404).json({ error: 'No Meta credentials found' });
  }

  const pixelsUrl = new URL(`${GRAPH_API_BASE}/${adAccountId}/adspixels`);
  pixelsUrl.searchParams.set('access_token', creds.accessToken);
  pixelsUrl.searchParams.set('fields', 'id,name');

  const pixelsResponse = await fetch(pixelsUrl.toString());

  // Forward Meta rate limit headers to the frontend for the DevPolicyGuard
  const rlHeaderNames = ['x-app-usage', 'x-business-use-case-usage', 'x-fb-ads-insights-throttle'];
  for (const headerName of rlHeaderNames) {
    const val = pixelsResponse.headers.get(headerName);
    if (val) res.setHeader(headerName, val);
  }

  const pixelsData = await pixelsResponse.json();

  if (pixelsData.error) {
    return res.status(400).json({ error: `Meta API error: ${pixelsData.error.message}` });
  }

  return res.status(200).json({ pixels: pixelsData.data || [] });
}

// ─── Route: disconnect ──────────────────────────────────────────────────────
// Remove Meta credentials for the authenticated user's organization.

async function handleDisconnect(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { error: dbError } = await supabase
    .from('organization_credentials')
    .delete()
    .eq('organization_id', auth.organizationId)
    .eq('provider', 'meta');

  if (dbError) {
    console.error('Failed to disconnect Meta:', dbError);
    captureError(dbError, { route: 'meta/disconnect', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: 'Failed to disconnect Meta account' });
  }

  return res.status(200).json({ success: true });
}

// ─── Route: ad-library ──────────────────────────────────────────────────────
// Search the Meta Ad Library for competitor/industry ad inspiration.

async function handleAdLibrary(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const creds = await loadCredentials(auth.organizationId);
  if (!creds) {
    return res.status(404).json({
      error: 'Meta credentials not found',
      message: 'Connect your Meta Ads account to search the Ad Library.',
    });
  }

  // Check token type — Ad Library API only works with User access tokens,
  // not System User tokens. Detect early to give a clear error message.
  let tokenType: string | null = null;
  try {
    const debugUrl = new URL(`${GRAPH_API_BASE}/debug_token`);
    debugUrl.searchParams.set('input_token', creds.accessToken);
    debugUrl.searchParams.set('access_token', creds.accessToken);
    const debugRes = await fetch(debugUrl.toString());
    const debugData = await debugRes.json();
    tokenType = debugData.data?.type || null;

    if (tokenType === 'SYSTEM_USER') {
      return res.status(400).json({
        error: 'Ad Library not supported with System User tokens',
        message: 'The Ad Library API requires a User access token (from OAuth login), not a System User token. Re-connect your Meta account via the OAuth flow in Settings to enable Ad Library search.',
        token_type: 'SYSTEM_USER',
      });
    }
  } catch {
    // Non-fatal — continue with the request and let the ads_archive call fail
    // with its own error if the token is invalid
    console.warn('Ad Library: debug_token check failed, proceeding with request');
  }

  const {
    search_terms,
    search_page_ids,
    ad_reached_countries = ['GB'],
    ad_active_status = 'ALL',
    ad_delivery_date_min,
    ad_delivery_date_max,
    publisher_platforms,
    limit = 25,
    after,
  } = req.body || {};

  if (!search_terms && !search_page_ids) {
    return res.status(400).json({ error: 'search_terms or search_page_ids is required' });
  }

  // Build request params — fields kept minimal to avoid error code 1 on
  // commercial ads (spend, impressions, link_captions are restricted to
  // political/issue ads and EU transparency reports)
  const fields = [
    'ad_creative_bodies',
    'ad_creative_link_titles',
    'ad_creative_link_descriptions',
    'ad_snapshot_url',
    'ad_delivery_start_time',
    'ad_delivery_stop_time',
    'page_name',
    'page_id',
    'publisher_platforms',
  ];

  const params = new URLSearchParams();
  params.set('access_token', creds.accessToken);
  params.set('ad_reached_countries', JSON.stringify(
    Array.isArray(ad_reached_countries) ? ad_reached_countries : [ad_reached_countries]
  ));
  params.set('ad_active_status', ad_active_status);
  params.set('fields', fields.join(','));
  params.set('limit', String(Math.min(Number(limit) || 25, 50)));

  if (search_terms) params.set('search_terms', search_terms);
  if (search_page_ids) params.set('search_page_ids', JSON.stringify(search_page_ids));
  if (ad_delivery_date_min) params.set('ad_delivery_date_min', ad_delivery_date_min);
  if (ad_delivery_date_max) params.set('ad_delivery_date_max', ad_delivery_date_max);
  // Meta requires uppercase platform values: FACEBOOK, INSTAGRAM, MESSENGER, AUDIENCE_NETWORK
  if (publisher_platforms) {
    const platforms = (Array.isArray(publisher_platforms) ? publisher_platforms : [publisher_platforms])
      .map((p: string) => p.toUpperCase());
    params.set('publisher_platforms', JSON.stringify(platforms));
  }
  if (after) params.set('after', after);

  // Log request params (excluding access token) for diagnostics
  const debugParams = new URLSearchParams(params);
  debugParams.delete('access_token');
  console.log('Ad Library request:', debugParams.toString());

  const apiUrl = `${GRAPH_API_BASE}/ads_archive?${params.toString()}`;

  // Retry transient errors (code 1) up to 2 times with exponential backoff
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      // Forward Meta rate limit headers to the frontend for the DevPolicyGuard
      const rlHeaderNames = ['x-app-usage', 'x-business-use-case-usage', 'x-fb-ads-insights-throttle'];
      for (const headerName of rlHeaderNames) {
        const val = response.headers.get(headerName);
        if (val) res.setHeader(headerName, val);
      }

      if (!response.ok || data.error) {
        const metaError = data.error || {};
        console.error('Ad Library API error:', {
          message: metaError.message,
          code: metaError.code,
          error_subcode: metaError.error_subcode,
          type: metaError.type,
          fbtrace_id: metaError.fbtrace_id,
          attempt,
        });

        // Retry on transient error code 1 (generic unknown error)
        if (metaError.code === 1 && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1500; // 1.5s, 3s
          console.warn(`⚠️ Ad Library transient error (code 1), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        captureError(new Error(metaError.message || 'Ad Library API error'), {
          route: 'meta/ad-library',
          organizationId: auth.organizationId,
        });
        await flushSentry();

        // Detect identity verification errors
        const requiresVerification =
          (metaError.code === 10 && metaError.error_subcode === 2332002) ||
          (metaError.type === 'OAuthException' && metaError.code === 1);

        // Build a descriptive error message including the error code for debugging
        let errorMessage: string;
        if (metaError.code === 10 && metaError.error_subcode === 2332002) {
          errorMessage = 'Ad Library API requires identity verification. Complete verification at facebook.com/ID to enable Ad Library access.';
        } else if (metaError.type === 'OAuthException' && metaError.code === 1) {
          // We already checked for system user tokens above, so if we get here
          // with a user token the issue is almost certainly identity verification
          if (tokenType === 'USER') {
            errorMessage = 'Ad Library API requires identity verification. The Facebook account linked to this token must complete government ID verification at facebook.com/ID before the Ad Library API can be used. Verification may take several days.';
          } else {
            errorMessage = 'Ad Library access error — your Meta token may lack Ad Library API permissions. This usually means: (1) the Facebook account needs identity verification at facebook.com/ID, or (2) the selected country only supports political/issue ads via the API (try an EU/UK country for commercial ads).';
          }
        } else {
          const errorParts = [metaError.message || 'Unknown error from Meta API'];
          if (metaError.code) errorParts.push(`(code ${metaError.code})`);
          if (metaError.error_subcode) errorParts.push(`(subcode ${metaError.error_subcode})`);
          errorMessage = errorParts.join(' ');
        }

        return res.status(response.status || 500).json({
          error: 'Ad Library API error',
          message: errorMessage,
          code: metaError.code,
          error_subcode: metaError.error_subcode,
          type: metaError.type,
          requires_verification: requiresVerification,
          token_type: tokenType,
          meta_message: metaError.message || null,
        });
      }

      return res.status(200).json(data);
    } catch (fetchErr: unknown) {
      // Network errors — retry on first attempts
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1500;
        console.warn(`⚠️ Ad Library fetch error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('Ad Library fetch error (all retries exhausted):', fetchErr);
      captureError(fetchErr, { route: 'meta/ad-library', organizationId: auth.organizationId });
      await flushSentry();
      return res.status(500).json({
        error: 'Failed to fetch from Ad Library',
        message: fetchErr instanceof Error ? fetchErr.message : 'Network error',
      });
    }
  }

  // Should not reach here, but TypeScript safety
  return res.status(500).json({ error: 'Unexpected error in Ad Library handler' });
}

// ─── Route: snapshot-images ────────────────────────────────────────────────
// Batch-extract og:image URLs from Ad Library snapshot pages.
// Called after ad-library search to resolve creative preview images.

async function handleSnapshotImages(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array is required' });
  }

  // Limit to 25 URLs per batch to prevent abuse
  const batch = urls.slice(0, 25) as string[];

  // Extract og:image from each snapshot URL in parallel (max 6 concurrent)
  const MAX_CONCURRENT = 6;
  const results: Record<string, string | null> = {};

  for (let i = 0; i < batch.length; i += MAX_CONCURRENT) {
    const chunk = batch.slice(i, i + MAX_CONCURRENT);
    const promises = chunk.map(async (url: string) => {
      // Only allow facebook.com snapshot URLs
      if (!url.startsWith('https://www.facebook.com/ads/archive/render_ad/')) {
        results[url] = null;
        return;
      }
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Convertra/1.0)',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        });
        if (!response.ok) {
          results[url] = null;
          return;
        }
        const html = await response.text();

        // Extract og:image meta tag
        const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
          || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
        if (ogMatch) {
          results[url] = ogMatch[1];
          return;
        }

        // Fallback: look for image in _raw_ad_text div or any large image src
        const imgMatch = html.match(/<img[^>]+src=["'](https:\/\/scontent[^"']+)["']/i)
          || html.match(/<img[^>]+src=["'](https:\/\/external[^"']+)["']/i);
        results[url] = imgMatch ? imgMatch[1] : null;
      } catch {
        results[url] = null;
      }
    });
    await Promise.all(promises);
  }

  return res.status(200).json({ images: results });
}

// ─── Route: refresh-tokens ─────────────────────────────────────────────────
// Cron-triggered batch refresh for Meta tokens nearing expiry.
// Runs daily to keep inactive users' tokens alive.

async function handleRefreshTokens(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Find all active Meta credentials expiring within 7 days
    const refreshThreshold = new Date();
    refreshThreshold.setDate(refreshThreshold.getDate() + 7);

    const { data: credentials, error: queryError } = await supabase
      .from('organization_credentials')
      .select('organization_id, access_token_encrypted, token_expires_at, updated_at')
      .eq('provider', 'meta')
      .eq('status', 'active')
      .lt('token_expires_at', refreshThreshold.toISOString())
      .gt('token_expires_at', new Date().toISOString());

    if (queryError) {
      captureError(
        new Error(`Failed to query credentials for token refresh: ${queryError.message}`),
        { route: 'meta/refresh-tokens', extra: { code: queryError.code, details: queryError.details } }
      );
      await flushSentry();
      return res.status(500).json({ error: 'Failed to query credentials' });
    }

    if (!credentials || credentials.length === 0) {
      return res.status(200).json({ message: 'No tokens need refreshing', refreshed: 0, failed: 0 });
    }

    const results: Array<{ organizationId: string; success: boolean; error?: string }> = [];

    for (const cred of credentials) {
      // Skip if already refreshed within the last 12 hours
      if (cred.updated_at) {
        const lastRefreshed = new Date(cred.updated_at).getTime();
        const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
        if (lastRefreshed > twelveHoursAgo) {
          results.push({ organizationId: cred.organization_id, success: true, error: 'Skipped — refreshed recently' });
          continue;
        }
      }

      const result = await refreshMetaToken(cred.organization_id, cred.access_token_encrypted, supabase);
      results.push({
        organizationId: cred.organization_id,
        success: result.success,
        error: result.error,
      });

      if (!result.success) {
        captureError(
          new Error(`Cron token refresh failed: ${result.error}`),
          { route: 'meta/refresh-tokens', organizationId: cred.organization_id }
        );
      }
    }

    await flushSentry();

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return res.status(200).json({
      message: `Refreshed ${successCount} tokens, ${failCount} failed`,
      refreshed: successCount,
      failed: failCount,
    });
  } catch (err: unknown) {
    console.error('Token refresh cron error:', err);
    captureError(err, { route: 'meta/refresh-tokens' });
    await flushSentry();
    return res.status(500).json({
      error: 'Cron handler failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ─── Route: ai-chat ─────────────────────────────────────────────────────────
// Proxy for OpenAI chat completions. API key stays server-side.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function handleAIChat(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured on server' });
  }

  const body = req.body;
  if (!body || !body.messages) {
    return res.status(400).json({ error: 'Request body with messages is required' });
  }

  // Stream the response to keep the serverless function alive.
  // Without streaming, GPT-5.4 reasoning + images exceeds the 60s
  // function limit because the ENTIRE response must complete before
  // any data is sent back. With streaming, tokens start flowing within
  // seconds and the connection stays active throughout.
  const streamBody = {
    ...body,
    stream: true,
    stream_options: { include_usage: true },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(streamBody),
    });

    // Non-OK responses come as JSON (not streamed) — pass through directly
    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    if (!response.body) {
      return res.status(500).json({ error: 'Failed to read AI response stream' });
    }

    // Pipe the SSE stream from OpenAI directly to the frontend
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } finally {
      res.end();
    }
  } catch (err: unknown) {
    // If headers haven't been sent yet, return JSON error
    if (!res.headersSent) {
      return res.status(500).json({
        error: { message: err instanceof Error ? err.message : 'AI service error' },
      });
    }
    // If mid-stream, just close the connection
    res.end();
  }
}

// ─── Route: ai-images ───────────────────────────────────────────────────────
// Proxy for OpenAI image generation. API key stays server-side.

async function handleAIImages(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured on server' });
  }

  const body = req.body;
  if (!body || !body.prompt) {
    return res.status(400).json({ error: 'Request body with prompt is required' });
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(response.status).json(data);
  }

  return res.status(200).json(data);
}

// ─── Route: video-upload ──────────────────────────────────────────────────────
// Fetches video from Veo using server-side GEMINI_API_KEY, then uploads to Meta
// using chunked upload API to stay within Vercel's 4.5MB body limit.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (well within Vercel's 4.5MB limit)

async function handleVideoUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const creds = await loadCredentials(auth.organizationId);
  if (!creds) {
    return res.status(404).json({ error: 'Meta credentials not found' });
  }

  if (!creds.adAccountId) {
    return res.status(400).json({ error: 'No ad account configured' });
  }

  const { veoFileRef, title } = req.body || {};
  if (!veoFileRef) {
    return res.status(400).json({ error: 'veoFileRef is required' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  try {
    // Step 1: Validate veoFileRef — only accept Veo file references, never arbitrary URLs.
    // This prevents SSRF attacks where a caller could pass an arbitrary URL and leak the API key.
    if (veoFileRef.startsWith('http') || veoFileRef.includes('://')) {
      return res.status(400).json({
        error: 'Invalid veoFileRef',
        message: 'Full URLs are not accepted. Provide a Veo file reference (e.g. files/abc123).',
      });
    }
    if (!veoFileRef.match(/^files\/[a-zA-Z0-9_-]+(?::download)?$/)) {
      return res.status(400).json({
        error: 'Invalid veoFileRef format',
        message: 'Expected format: files/{fileId}',
      });
    }

    const downloadUrl = `https://generativelanguage.googleapis.com/v1beta/${veoFileRef}?alt=media`;

    console.log('Fetching video from Veo...');
    const veoResponse = await fetch(downloadUrl, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });

    if (!veoResponse.ok) {
      const errText = await veoResponse.text();
      console.error('Veo fetch failed:', errText);
      return res.status(502).json({
        error: 'Failed to fetch video from Veo',
        message: `Veo returned ${veoResponse.status}`,
      });
    }

    const videoBuffer = Buffer.from(await veoResponse.arrayBuffer());
    const fileSize = videoBuffer.length;
    console.log(`Video fetched: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

    // Step 2: Meta chunked upload — start phase
    const startParams = new URLSearchParams({
      upload_phase: 'start',
      file_size: String(fileSize),
      access_token: creds.accessToken,
    });

    const startResponse = await fetch(
      `${GRAPH_API_BASE}/${creds.adAccountId}/advideos?${startParams.toString()}`,
      { method: 'POST' }
    );
    const startData = await startResponse.json();

    if (!startResponse.ok || !startData.upload_session_id) {
      console.error('Meta video upload start failed:', startData);
      return res.status(502).json({
        error: 'Failed to start Meta video upload',
        message: startData.error?.message || 'No upload_session_id returned',
      });
    }

    const uploadSessionId = startData.upload_session_id;
    console.log('Meta upload session started:', uploadSessionId);

    // Step 3: Meta chunked upload — transfer phase (send in chunks)
    let offset = 0;
    while (offset < fileSize) {
      const end = Math.min(offset + CHUNK_SIZE, fileSize);
      const chunk = videoBuffer.subarray(offset, end);

      const boundary = `----MetaVideoChunk${Date.now()}`;
      const parts: Buffer[] = [];

      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${creds.accessToken}\r\n`
      ));
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="upload_phase"\r\n\r\ntransfer\r\n`
      ));
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="upload_session_id"\r\n\r\n${uploadSessionId}\r\n`
      ));
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="start_offset"\r\n\r\n${offset}\r\n`
      ));
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="video_file_chunk"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
      ));
      parts.push(chunk);
      parts.push(Buffer.from('\r\n'));
      parts.push(Buffer.from(`--${boundary}--\r\n`));

      const multipartBody = Buffer.concat(parts);

      const transferResponse = await fetch(
        `${GRAPH_API_BASE}/${creds.adAccountId}/advideos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(multipartBody.length),
          },
          body: multipartBody,
        }
      );

      const transferData = await transferResponse.json();
      if (!transferResponse.ok) {
        console.error('Meta video chunk transfer failed:', transferData);
        return res.status(502).json({
          error: 'Failed to upload video chunk to Meta',
          message: transferData.error?.message || 'Chunk transfer failed',
        });
      }

      offset = end;
      console.log(`Uploaded ${offset}/${fileSize} bytes`);
    }

    // Step 4: Meta chunked upload — finish phase
    const finishParams = new URLSearchParams({
      upload_phase: 'finish',
      upload_session_id: uploadSessionId,
      access_token: creds.accessToken,
      ...(title ? { title } : {}),
    });

    const finishResponse = await fetch(
      `${GRAPH_API_BASE}/${creds.adAccountId}/advideos?${finishParams.toString()}`,
      { method: 'POST' }
    );
    const finishData = await finishResponse.json();

    if (!finishResponse.ok || !finishData.video_id) {
      console.error('Meta video upload finish failed:', finishData);
      return res.status(502).json({
        error: 'Failed to finalize Meta video upload',
        message: finishData.error?.message || 'No video_id returned',
      });
    }

    const videoId = finishData.video_id;
    console.log('Meta video uploaded, ID:', videoId);

    // Forward Meta rate limit headers from the finish response
    const rlHeaders = ['x-app-usage', 'x-business-use-case-usage', 'x-fb-ads-insights-throttle'];
    for (const headerName of rlHeaders) {
      const val = finishResponse.headers.get(headerName);
      if (val) res.setHeader(headerName, val);
    }

    // Step 5: Poll for video processing completion (max 2 minutes)
    const maxPollTime = 2 * 60 * 1000;
    const pollStart = Date.now();
    let videoStatus = 'processing';

    while (Date.now() - pollStart < maxPollTime) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        `${GRAPH_API_BASE}/${videoId}?fields=status&access_token=${creds.accessToken}`
      );
      const statusData = await statusResponse.json();
      videoStatus = statusData.status?.video_status || 'processing';

      if (videoStatus === 'ready') {
        console.log('Video processing complete, ready for use');
        break;
      }
      if (videoStatus === 'error') {
        return res.status(502).json({
          error: 'Meta video processing failed',
          message: 'Video was uploaded but failed to process',
        });
      }
    }

    return res.status(200).json({
      video_id: videoId,
      status: videoStatus,
    });
  } catch (err: unknown) {
    console.error('Video upload error:', err);
    captureError(err, { route: 'meta/video-upload', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({
      error: 'Video upload failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ─── Graph API pagination helper ────────────────────────────────────────────

interface PaginatedGraphResponse<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

async function fetchAllGraphPages<T>(initialUrl: string): Promise<{ data: T[]; rateLimitHeaders: Record<string, string> }> {
  const all: T[] = [];
  let url: string | null = initialUrl;
  const lastRateLimitHeaders: Record<string, string> = {};

  while (url) {
    const response = await fetch(url);
    if (!response.ok) break;

    // Capture rate limit headers from each response (last page is most current)
    for (const key of ['x-app-usage', 'x-business-use-case-usage', 'x-fb-ads-insights-throttle']) {
      const val = response.headers.get(key);
      if (val) lastRateLimitHeaders[key] = val;
    }

    const data: PaginatedGraphResponse<T> = await response.json();
    if (data.data) all.push(...data.data);
    url = data.paging?.next || null;
  }

  return { data: all, rateLimitHeaders: lastRateLimitHeaders };
}

// ─── Route: refresh-available ────────────────────────────────────────────────
// Re-fetch available ad accounts and pages from the Graph API using the stored
// token. Updates organization_credentials.metadata without re-running OAuth.
// Also reconciles stale selections: if the current ad_account_id / page_id / pixel_id
// no longer exists in the refreshed list, it is cleared from organization_credentials.

async function handleRefreshAvailable(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const creds = await loadCredentials(auth.organizationId);
  if (!creds) {
    return res.status(404).json({ error: 'No Meta credentials found. Please connect your Meta account first.' });
  }

  try {
    // Fetch all ad accounts (paginated)
    const adAccountsUrl = new URL(`${GRAPH_API_BASE}/me/adaccounts`);
    adAccountsUrl.searchParams.set('access_token', creds.accessToken);
    adAccountsUrl.searchParams.set('fields', 'account_id,id,name,account_status,currency');
    adAccountsUrl.searchParams.set('limit', '100');

    const accountsResult = await fetchAllGraphPages<{
      account_id: string; id: string; name: string; account_status: number; currency: string;
    }>(adAccountsUrl.toString());
    const freshAccounts = accountsResult.data;

    // Fetch all pages (paginated)
    const pagesUrl = new URL(`${GRAPH_API_BASE}/me/accounts`);
    pagesUrl.searchParams.set('access_token', creds.accessToken);
    pagesUrl.searchParams.set('fields', 'id,name');
    pagesUrl.searchParams.set('limit', '100');

    const pagesResult = await fetchAllGraphPages<{ id: string; name: string }>(pagesUrl.toString());
    const freshPages = pagesResult.data;

    // Forward Meta rate limit headers to the frontend for the DevPolicyGuard
    const mergedRateLimitHeaders = { ...accountsResult.rateLimitHeaders, ...pagesResult.rateLimitHeaders };
    for (const [headerName, headerValue] of Object.entries(mergedRateLimitHeaders)) {
      res.setHeader(headerName, headerValue);
    }

    // Load current credential row to reconcile stale selections
    const { data: cred } = await supabase
      .from('organization_credentials')
      .select('ad_account_id, page_id, pixel_id, metadata')
      .eq('organization_id', auth.organizationId)
      .eq('provider', 'meta')
      .single();

    if (!cred) {
      return res.status(404).json({ error: 'Credential record not found' });
    }

    // Reconcile: clear selections that are no longer valid in the refreshed scope
    const accountStillValid = !cred.ad_account_id ||
      freshAccounts.some(a => a.id === cred.ad_account_id);
    const pageStillValid = !cred.page_id ||
      freshPages.some(p => p.id === cred.page_id);

    const updates: Record<string, unknown> = {
      metadata: {
        ...cred.metadata,
        available_accounts: freshAccounts,
        available_pages: freshPages,
        last_refreshed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    if (!accountStillValid) {
      updates.ad_account_id = null;
      updates.page_id = null;
      updates.pixel_id = null;
    } else if (!pageStillValid) {
      updates.page_id = null;
    }

    await supabase
      .from('organization_credentials')
      .update(updates)
      .eq('organization_id', auth.organizationId)
      .eq('provider', 'meta');

    // Also sync metadata (name, currency, status) for activated accounts
    // in organization_ad_accounts from the fresh Graph API data
    const { data: activatedAccounts } = await supabase
      .from('organization_ad_accounts')
      .select('ad_account_id')
      .eq('organization_id', auth.organizationId)
      .eq('is_active', true);

    if (activatedAccounts && activatedAccounts.length > 0) {
      for (const activated of activatedAccounts) {
        const fresh = freshAccounts.find(a => a.id === activated.ad_account_id);
        if (fresh) {
          await supabase
            .from('organization_ad_accounts')
            .update({
              ad_account_name: fresh.name || null,
              account_status: fresh.account_status || null,
              currency: fresh.currency || null,
              updated_at: new Date().toISOString(),
            })
            .eq('organization_id', auth.organizationId)
            .eq('ad_account_id', activated.ad_account_id);
        }
      }
    }

    return res.status(200).json({
      availableAccounts: freshAccounts,
      availablePages: freshPages,
      selectionsCleared: !accountStillValid || !pageStillValid,
    });
  } catch (err: unknown) {
    console.error('Failed to refresh available data:', err);
    captureError(err, { route: 'meta/refresh-available', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({
      error: 'Failed to refresh available data from Meta',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ─── Route: ad-accounts ──────────────────────────────────────────────────────
// Manage multiple Meta ad accounts per organization (agency multi-account).
// GET: List activated ad accounts for the org.
// POST: Activate, deactivate, or configure ad accounts.

async function handleAdAccounts(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return handleAdAccountsList(req, res, auth);
  }
  if (req.method === 'POST') {
    return handleAdAccountsWrite(req, res, auth);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleAdAccountsList(
  _req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext
) {
  const { data: accounts, error } = await supabase
    .from('organization_ad_accounts')
    .select('*')
    .eq('organization_id', auth.organizationId)
    .eq('is_active', true)
    .order('ad_account_name', { ascending: true });

  if (error) {
    captureError(error, { route: 'meta/ad-accounts', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: 'Failed to load ad accounts' });
  }

  // Also load the org's seat limits
  const { data: org } = await supabase
    .from('organizations')
    .select('ad_account_seats, ad_account_seats_used, plan_tier')
    .eq('id', auth.organizationId)
    .single();

  const planTier = org?.plan_tier || 'free';
  const maxByPlan: Record<string, number> = {
    free: 1, starter: 1, pro: 3, agency: 25, enterprise: -1, velocity_partner: -1,
  };

  return res.status(200).json({
    accounts: accounts || [],
    seats: org?.ad_account_seats || 1,
    seatsUsed: org?.ad_account_seats_used || 0,
    maxAccounts: maxByPlan[planTier] ?? 1,
  });
}

async function handleAdAccountsWrite(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext
) {
  const { action, adAccountId, adAccountName, pageId, pixelId, currency, businessType, products, reference_image_metadata } = req.body || {};

  if (!action || !adAccountId) {
    return res.status(400).json({ error: 'action and adAccountId are required' });
  }

  // ── Activate an ad account ──
  if (action === 'activate') {
    // Check seat limit
    const { data: org } = await supabase
      .from('organizations')
      .select('ad_account_seats, plan_tier')
      .eq('id', auth.organizationId)
      .single();

    const seatLimit = org?.ad_account_seats || 1;

    // -1 means unlimited seats — skip the count query and limit check entirely
    if (seatLimit !== -1) {
      const { count } = await supabase
        .from('organization_ad_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', auth.organizationId)
        .eq('is_active', true);

      if (count !== null && count >= seatLimit) {
        return res.status(403).json({
          error: 'Ad account seat limit reached',
          message: `You have ${count} of ${seatLimit} seats in use. Upgrade your plan to add more accounts.`,
          seatsUsed: count,
          seatsTotal: seatLimit,
        });
      }
    }

    // Validate the ad account exists in the org's available accounts (from OAuth)
    const { data: cred } = await supabase
      .from('organization_credentials')
      .select('metadata')
      .eq('organization_id', auth.organizationId)
      .eq('provider', 'meta')
      .single();

    if (!cred) {
      return res.status(404).json({ error: 'No Meta credentials found. Please connect your Meta account first.' });
    }

    const availableAccounts = cred.metadata?.available_accounts || [];
    const metaAccount = availableAccounts.find((acc: { id: string }) => acc.id === adAccountId);

    if (!metaAccount) {
      return res.status(400).json({
        error: 'Ad account not found in your connected Meta Business Manager.',
        message: `The account ${adAccountId} is not accessible via your current Meta credentials.`,
      });
    }

    // Upsert into organization_ad_accounts
    const { error: upsertError } = await supabase
      .from('organization_ad_accounts')
      .upsert({
        organization_id: auth.organizationId,
        ad_account_id: adAccountId,
        ad_account_name: adAccountName || metaAccount?.name || null,
        page_id: pageId || null,
        pixel_id: pixelId || null,
        is_active: true,
        account_status: metaAccount?.account_status || null,
        currency: currency || metaAccount?.currency || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,ad_account_id' });

    if (upsertError) {
      captureError(upsertError, { route: 'meta/ad-accounts/activate', organizationId: auth.organizationId });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to activate ad account' });
    }

    await updateSeatCount(auth.organizationId);
    return res.status(200).json({ success: true });
  }

  // ── Deactivate an ad account ──
  if (action === 'deactivate') {
    const { error: updateError } = await supabase
      .from('organization_ad_accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId);

    if (updateError) {
      captureError(updateError, { route: 'meta/ad-accounts/deactivate', organizationId: auth.organizationId });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to deactivate ad account' });
    }

    await updateSeatCount(auth.organizationId);
    return res.status(200).json({ success: true });
  }

  // ── Configure an ad account (update page_id, pixel_id) ──
  if (action === 'configure') {
    const { error: updateError } = await supabase
      .from('organization_ad_accounts')
      .update({
        page_id: pageId !== undefined ? (pageId || null) : undefined,
        pixel_id: pixelId !== undefined ? (pixelId || null) : undefined,
        business_type: businessType !== undefined ? (businessType || null) : undefined,
        products: products !== undefined ? products : undefined,
        reference_image_metadata: reference_image_metadata !== undefined ? reference_image_metadata : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId);

    if (updateError) {
      captureError(updateError, { route: 'meta/ad-accounts/configure', organizationId: auth.organizationId });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to configure ad account' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}

// ─── Swipe Library Handlers ─────────────────────────────────────────────────

// List swipe library items (excludes image_data for performance)
async function handleSwipeList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const adAccountId = req.query.ad_account_id as string;
  if (!adAccountId) return res.status(400).json({ error: 'ad_account_id required' });

  const conversionType = req.query.conversion_type as string | undefined;
  const campaignType = req.query.campaign_type as string | undefined;
  const search = req.query.search as string | undefined;
  const sort = (req.query.sort as string) || 'newest';
  const limit = Math.min(parseInt(req.query.limit as string) || 500, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    // Select all columns except image_data (loaded on demand via swipe-image)
    // element_type filtering is done client-side to preserve grouped ad context
    let query = supabase
      .from('swipe_library_items')
      .select(
        'id, organization_id, ad_account_id, element_type, text_content, image_thumbnail, image_mime_type, meta_ad_id, meta_campaign_name, meta_adset_name, performance_snapshot, content_hash, tags, notes, is_pinned, saved_by, created_at, updated_at, group_id, campaign_type',
        { count: 'exact' }
      )
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId);

    // Filter by conversion type stored in the performance_snapshot JSONB.
    // Include items without conversion_type (saved before this feature) so they aren't hidden.
    if (conversionType === 'purchase') {
      query = query.or('performance_snapshot->>conversion_type.eq.purchase,performance_snapshot->>conversion_type.eq.both,performance_snapshot->>conversion_type.is.null');
    } else if (conversionType === 'lead') {
      query = query.or('performance_snapshot->>conversion_type.eq.lead,performance_snapshot->>conversion_type.eq.both,performance_snapshot->>conversion_type.is.null');
    }

    if (campaignType) {
      query = query.eq('campaign_type', campaignType);
    }

    if (search) {
      // Wrap ilike values in double quotes so PostgREST treats commas/parens as literal text
      const escaped = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query = query.or(`text_content.ilike."%${escaped}%",meta_campaign_name.ilike."%${escaped}%"`);
    }

    // Sort: pinned items first, then group elements together, then by user-selected sort
    switch (sort) {
      case 'oldest':
        query = query.order('is_pinned', { ascending: false })
          .order('created_at', { ascending: true })
          .order('group_id').order('element_type');
        break;
      case 'cvr':
        query = query.order('is_pinned', { ascending: false })
          .order('performance_snapshot->cvr', { ascending: false, nullsFirst: false })
          .order('group_id').order('element_type');
        break;
      case 'cpa':
        query = query.order('is_pinned', { ascending: false })
          .order('performance_snapshot->cpa', { ascending: true, nullsFirst: false })
          .order('group_id').order('element_type');
        break;
      case 'newest':
      default:
        query = query.order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .order('group_id').order('element_type');
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return res.status(200).json({ items: data || [], total: count || 0 });
  } catch (err: unknown) {
    captureError(err, { route: 'meta/swipe-list', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch swipe library' });
  }
}

// Save items to swipe library (with ignoreDuplicates to protect user curation)
async function handleSwipeSave(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ad_account_id, items } = req.body;
  if (!ad_account_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ad_account_id and items[] required' });
  }

  if (items.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 items per save request' });
  }

  try {
    const rows = items.map((item: {
      element_type: string;
      text_content?: string;
      image_data?: string;
      image_thumbnail?: string;
      image_mime_type?: string;
      meta_ad_id?: string;
      meta_campaign_name?: string;
      meta_adset_name?: string;
      performance_snapshot?: Record<string, unknown>;
      content_hash: string;
      tags?: string[];
      group_id?: string;
      campaign_type?: string;
    }) => ({
      organization_id: auth.organizationId,
      ad_account_id,
      element_type: item.element_type,
      text_content: item.text_content || null,
      image_data: item.image_data || null,
      image_thumbnail: item.image_thumbnail || null,
      image_mime_type: item.image_mime_type || null,
      meta_ad_id: item.meta_ad_id || null,
      meta_campaign_name: item.meta_campaign_name || null,
      meta_adset_name: item.meta_adset_name || null,
      performance_snapshot: item.performance_snapshot || {},
      content_hash: item.content_hash,
      tags: item.tags || [],
      saved_by: auth.userId,
      group_id: item.group_id || item.meta_ad_id || crypto.randomUUID(),
      campaign_type: item.campaign_type || null,
    }));

    // ignoreDuplicates: true — silently skips rows that match the unique constraint
    // without overwriting user-curated fields (tags, notes, is_pinned).
    // Try the 5-column constraint first (correct after migration 018). If that fails
    // (stale 4-column constraint still present), retry with the 4-column onConflict
    // so duplicates are resolved against the constraint that actually exists.
    let data: { id: string; element_type: string; content_hash: string }[] | null = null;
    let error: { message?: string; code?: string; details?: string } | null = null;

    const result = await supabase
      .from('swipe_library_items')
      .upsert(rows, {
        onConflict: 'organization_id,ad_account_id,element_type,content_hash,group_id',
        ignoreDuplicates: true,
      })
      .select('id, element_type, content_hash');

    data = result.data;
    error = result.error;

    // Fallback: if the 5-column upsert failed (stale 4-column unique constraint from
    // before migration 018), retry with the 4-column onConflict that matches the
    // constraint actually present in the database. This correctly deduplicates
    // against the active constraint instead of plain insert() which would count
    // valid cross-group saves as duplicates.
    if (error) {
      const fallback = await supabase
        .from('swipe_library_items')
        .upsert(rows, {
          onConflict: 'organization_id,ad_account_id,element_type,content_hash',
          ignoreDuplicates: true,
        })
        .select('id, element_type, content_hash');

      if (fallback.error) {
        // Both upsert strategies failed — this is a real error (RLS, schema, etc.)
        captureError(fallback.error, { route: 'meta/swipe-save-fallback', organizationId: auth.organizationId });
        await flushSentry();
        const msg = fallback.error.message || 'Failed to save to swipe library';
        return res.status(500).json({ error: msg });
      }

      data = fallback.data;
      error = null;
    }

    const savedCount = data?.length || 0;
    const duplicateCount = items.length - savedCount;

    return res.status(200).json({ saved: savedCount, duplicates: duplicateCount, items: data || [] });
  } catch (err: unknown) {
    captureError(err, { route: 'meta/swipe-save', organizationId: auth.organizationId });
    await flushSentry();
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Failed to save to swipe library';
    return res.status(500).json({ error: msg });
  }
}

// Update tags, notes, or pinned status
async function handleSwipeUpdate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, tags, notes, is_pinned } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (tags !== undefined) updates.tags = tags;
    if (notes !== undefined) updates.notes = notes;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;

    const { data, error } = await supabase
      .from('swipe_library_items')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('id, tags, notes, is_pinned, updated_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Item not found' });

    return res.status(200).json(data);
  } catch (err: unknown) {
    captureError(err, { route: 'meta/swipe-update', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update swipe item' });
  }
}

// Bulk delete items
async function handleSwipeDelete(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids[] required' });
  }

  try {
    const { error } = await supabase
      .from('swipe_library_items')
      .delete()
      .in('id', ids)
      .eq('organization_id', auth.organizationId);

    if (error) throw error;

    return res.status(200).json({ deleted: ids.length });
  } catch (err: unknown) {
    captureError(err, { route: 'meta/swipe-delete', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete swipe items' });
  }
}

// On-demand full image fetch (excludes image_data from list queries for performance)
async function handleSwipeImage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const { data, error } = await supabase
      .from('swipe_library_items')
      .select('id, image_data, image_mime_type')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Image not found' });

    return res.status(200).json(data);
  } catch (err: unknown) {
    captureError(err, { route: 'meta/swipe-image', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch swipe image' });
  }
}

// Fetch an image URL server-side (bypasses CORS restrictions on Meta CDN)
async function handleImageFetch(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' });
  }

  // Only allow Facebook/Meta CDN domains to prevent SSRF
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTPS URLs are allowed' });
  }

  // Dot-prefixed domain check: "scontent.fbcdn.net" matches ".fbcdn.net",
  // but "evilfbcdn.net" does not. Also allow exact domain matches.
  const allowedDomains = ['fbcdn.net', 'facebook.com', 'fbsbx.com', 'fb.com'];
  const hostname = parsedUrl.hostname;
  const isAllowed = allowedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
  if (!isAllowed) {
    return res.status(400).json({ error: 'Only Facebook/Meta image URLs are allowed' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `Image fetch failed: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL did not return an image' });
    }

    const buffer = await response.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    const mimeType = contentType.split(';')[0].trim();

    return res.status(200).json({ base64Data, mimeType });
  } catch (err: unknown) {
    captureError(err, { route: 'meta/image-fetch', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch image' });
  }
}

// Batch dedup check — returns which content hashes already exist
async function handleSwipeCheck(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ad_account_id, content_hashes, group_ids } = req.body;
  if (!ad_account_id || !Array.isArray(content_hashes) || content_hashes.length === 0) {
    return res.status(400).json({ error: 'ad_account_id and content_hashes[] required' });
  }

  try {
    let query = supabase
      .from('swipe_library_items')
      .select('content_hash, group_id')
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', ad_account_id)
      .in('content_hash', content_hashes);

    // When group_ids provided, only match items in those groups
    // This prevents false "Saved" states when different ads share the same content
    if (Array.isArray(group_ids) && group_ids.length > 0) {
      query = query.in('group_id', group_ids);
    }

    const { data, error } = await query;

    if (error) throw error;

    const saved = (data || []).map(row => row.content_hash);
    return res.status(200).json({ saved });
  } catch (err: unknown) {
    captureError(err, { route: 'meta/swipe-check', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check swipe library' });
  }
}

// ── Helper: Update denormalized seat count ──
async function updateSeatCount(organizationId: string) {
  const { count } = await supabase
    .from('organization_ad_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  await supabase
    .from('organizations')
    .update({ ad_account_seats_used: count || 0, updated_at: new Date().toISOString() })
    .eq('id', organizationId);
}
