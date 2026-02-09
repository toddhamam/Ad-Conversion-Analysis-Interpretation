import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { encrypt, isEncryptionConfigured } from '../_lib/encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Authentication ──────────────────────────────────────────────────────────

interface AdminAuthContext {
  userId: string;
  organizationId: string;
  authUserId: string;
  isSuperAdmin: boolean;
}

async function authenticateSuperAdmin(req: VercelRequest): Promise<AdminAuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id, is_super_admin')
    .eq('auth_id', user.id)
    .single();

  if (!profile || !profile.is_super_admin) return null;

  return {
    userId: profile.id,
    organizationId: profile.organization_id,
    authUserId: user.id,
    isSuperAdmin: true,
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  if (!action) {
    return res.status(400).json({ error: 'action query parameter is required' });
  }

  // All actions require super admin authentication
  const auth = await authenticateSuperAdmin(req);
  if (!auth) {
    return res.status(403).json({ error: 'Forbidden — super admin access required' });
  }

  try {
    switch (action) {
      case 'status':
        return handleStatus(req, res);
      case 'validate':
        return handleValidate(req, res);
      case 'save':
        return handleSave(req, res);
      case 'disconnect':
        return handleDisconnect(req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    console.error(`Admin credentials error (${action}):`, err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const organizationId = req.query.organizationId as string;
  if (!organizationId) {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  const { data: cred } = await supabase
    .from('organization_credentials')
    .select('id, provider, ad_account_id, page_id, pixel_id, business_id, status, token_expires_at, scopes, last_error, metadata, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('provider', 'meta')
    .single();

  if (!cred) {
    return res.status(200).json({
      connected: false,
      status: 'not_connected',
    });
  }

  const isExpired = cred.token_expires_at && new Date(cred.token_expires_at) < new Date();

  return res.status(200).json({
    connected: cred.status === 'active' && !isExpired,
    status: isExpired ? 'expired' : cred.status,
    adAccountId: cred.ad_account_id,
    pageId: cred.page_id,
    pixelId: cred.pixel_id,
    businessId: cred.business_id,
    tokenExpiresAt: cred.token_expires_at,
    scopes: cred.scopes,
    lastError: cred.last_error,
    accountName: cred.metadata?.selected_account_name || null,
    connectedAt: cred.metadata?.connected_at || cred.created_at,
  });
}

// ─── Validate ────────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  tokenInfo?: {
    appId: string;
    type: string;
    scopes: string[];
    expiresAt: string | null;
    isValid: boolean;
  };
  accountInfo?: {
    id: string;
    name: string;
    accountStatus: number;
    currency: string;
  };
  errors: string[];
}

async function handleValidate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessToken, adAccountId } = req.body || {};
  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  const result: ValidationResult = { valid: false, errors: [] };

  // 1. Debug token to check validity and scopes
  try {
    const debugUrl = new URL(`${GRAPH_API_BASE}/debug_token`);
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('access_token', accessToken);

    const debugRes = await fetch(debugUrl.toString());
    const debugData = await debugRes.json();

    if (debugData.data) {
      const d = debugData.data;
      result.tokenInfo = {
        appId: d.app_id || '',
        type: d.type || 'unknown',
        scopes: d.scopes || [],
        expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
        isValid: d.is_valid ?? false,
      };

      if (!d.is_valid) {
        result.errors.push('Token is not valid — it may be expired or revoked');
      }

      // Check required scopes
      const requiredScopes = ['ads_management', 'ads_read', 'pages_read_engagement', 'business_management'];
      const missing = requiredScopes.filter((s) => !(d.scopes || []).includes(s));
      if (missing.length > 0) {
        result.errors.push(`Missing required scopes: ${missing.join(', ')}`);
      }
    } else if (debugData.error) {
      result.errors.push(`Token debug failed: ${debugData.error.message}`);
    }
  } catch (err: unknown) {
    result.errors.push(`Token validation request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // 2. Verify ad account access if provided
  if (adAccountId) {
    try {
      const accountUrl = new URL(`${GRAPH_API_BASE}/${adAccountId}`);
      accountUrl.searchParams.set('access_token', accessToken);
      accountUrl.searchParams.set('fields', 'id,name,account_id,account_status,currency');

      const accountRes = await fetch(accountUrl.toString());
      const accountData = await accountRes.json();

      if (accountData.error) {
        result.errors.push(`Ad account access failed: ${accountData.error.message}`);
      } else {
        result.accountInfo = {
          id: accountData.id,
          name: accountData.name,
          accountStatus: accountData.account_status,
          currency: accountData.currency,
        };

        if (accountData.account_status !== 1) {
          result.errors.push(`Ad account is not active (status: ${accountData.account_status})`);
        }
      }
    } catch (err: unknown) {
      result.errors.push(`Ad account validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  result.valid = result.errors.length === 0;
  return res.status(200).json(result);
}

// ─── Save ────────────────────────────────────────────────────────────────────

async function handleSave(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { organizationId, accessToken, adAccountId, pageId, pixelId, accountName } = req.body || {};

  if (!organizationId || !accessToken) {
    return res.status(400).json({ error: 'organizationId and accessToken are required' });
  }

  if (!isEncryptionConfigured()) {
    return res.status(500).json({ error: 'Encryption is not configured on the server' });
  }

  // Encrypt the access token
  const encryptedToken = encrypt(accessToken);

  // Default token expiry: 60 days for long-lived tokens
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 60);

  const { error: dbError } = await supabase
    .from('organization_credentials')
    .upsert(
      {
        organization_id: organizationId,
        provider: 'meta',
        access_token_encrypted: encryptedToken,
        ad_account_id: adAccountId || null,
        page_id: pageId || null,
        pixel_id: pixelId || null,
        token_expires_at: tokenExpiresAt.toISOString(),
        status: 'active',
        last_error: null,
        scopes: ['ads_management', 'ads_read', 'pages_read_engagement', 'business_management', 'read_insights'],
        metadata: {
          selected_account_name: accountName || null,
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

  return res.status(200).json({ success: true });
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

async function handleDisconnect(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const organizationId = req.query.organizationId as string;
  if (!organizationId) {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  const { error: dbError } = await supabase
    .from('organization_credentials')
    .delete()
    .eq('organization_id', organizationId)
    .eq('provider', 'meta');

  if (dbError) {
    console.error('Failed to disconnect:', dbError);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }

  return res.status(200).json({ success: true });
}
