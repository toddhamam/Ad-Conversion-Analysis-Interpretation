import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Authentication ──────────────────────────────────────────────────────────

async function authenticateRequest(req: VercelRequest): Promise<{ organizationId: string } | null> {
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
  return { organizationId: profile.organization_id };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
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
      });
    }

    const isExpired = cred.token_expires_at && new Date(cred.token_expires_at) < new Date();

    return res.status(200).json({
      connected: cred.status === 'active' && !isExpired,
      status: isExpired ? 'expired' : cred.status,
      adAccountId: cred.ad_account_id,
      pageId: cred.page_id,
      pixelId: cred.pixel_id,
      tokenExpiresAt: cred.token_expires_at,
      accountName: cred.metadata?.selected_account_name || null,
    });
  } catch (err: unknown) {
    console.error('Meta status error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Failed to fetch Meta status',
    });
  }
}
