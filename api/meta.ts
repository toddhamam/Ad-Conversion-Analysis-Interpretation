import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt, encrypt, isEncryptionConfigured } from './_lib/encryption.js';

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

async function loadCredentials(organizationId: string): Promise<MetaCredentials | null> {
  const { data: cred, error: credError } = await supabase
    .from('organization_credentials')
    .select('access_token_encrypted, ad_account_id, page_id, pixel_id, status, token_expires_at')
    .eq('organization_id', organizationId)
    .eq('provider', 'meta')
    .single();

  if (credError || !cred) return null;

  if (cred.status !== 'active') return null;

  if (cred.token_expires_at && new Date(cred.token_expires_at) < new Date()) {
    await supabase
      .from('organization_credentials')
      .update({ status: 'expired' })
      .eq('organization_id', organizationId)
      .eq('provider', 'meta');
    return null;
  }

  const accessToken = decrypt(cred.access_token_encrypted);

  return {
    accessToken,
    adAccountId: cred.ad_account_id,
    pageId: cred.page_id,
    pixelId: cred.pixel_id,
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
      default:
        return res.status(400).json({ error: `Unknown route: ${route}` });
    }
  } catch (err: unknown) {
    console.error(`Meta API error (${route}):`, err);
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

  const creds = await loadCredentials(auth.organizationId);
  if (!creds) {
    return res.status(404).json({
      error: 'Meta credentials not found',
      message: 'Please connect your Meta Ads account first',
    });
  }

  const {
    method = 'GET',
    endpoint,
    params = {},
    body,
    formEncoded = false,
  } = req.body || {};

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'endpoint is required' });
  }

  const apiUrl = new URL(`${GRAPH_API_BASE}/${endpoint}`);
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
    });
  }

  const isExpired = cred.token_expires_at && new Date(cred.token_expires_at) < new Date();
  const isActive = cred.status === 'active' && !isExpired;

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

  const creds = await loadCredentials(auth.organizationId);
  if (!creds) {
    return res.status(404).json({ error: 'Meta credentials not found' });
  }

  if (!creds.adAccountId) {
    return res.status(400).json({ error: 'No ad account configured' });
  }

  const { imageBase64, filename } = req.body || {};

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

  if (!response.ok) {
    console.error('Meta image upload error:', data);
    return res.status(response.status).json({
      error: 'Image upload failed',
      message: data.error?.message || 'Unknown error',
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

  const { adAccountId, pageId, pixelId } = req.body || {};

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
    return res.status(500).json({ error: 'Failed to save configuration' });
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
  const pixelsData = await pixelsResponse.json();

  if (pixelsData.error) {
    return res.status(400).json({ error: `Meta API error: ${pixelsData.error.message}` });
  }

  return res.status(200).json({ pixels: pixelsData.data || [] });
}
