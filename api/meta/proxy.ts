import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../_lib/encryption.js';

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

  // Check status
  if (cred.status !== 'active') return null;

  // Check expiry
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

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  // Authenticate
  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Load credentials
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

  try {
    // Build Meta Graph API URL
    const apiUrl = new URL(`${GRAPH_API_BASE}/${endpoint}`);
    apiUrl.searchParams.set('access_token', creds.accessToken);

    // Add query params for GET requests
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
        // Form-encoded body — used by ad sets and ads
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
        // JSON body — used by campaigns
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
      // Handle expired/invalid tokens
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
  } catch (err: unknown) {
    console.error('Meta proxy error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Failed to proxy Meta API request',
    });
  }
}
