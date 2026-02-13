import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { initSentry, captureError, flushSentry } from '../_lib/sentry.js';

initSentry();

// Supabase client (module-level for connection reuse)
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/** Derive organizationId from JWT Bearer token */
async function getOrganizationId(req: VercelRequest): Promise<string | null> {
  if (!supabase) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_id', user.id)
    .single();

  return profile?.organization_id || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!supabase) {
      return res.status(200).json({ count: 0 });
    }

    // Derive organization from JWT — return zero if unauthenticated
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(200).json({ count: 0 });
    }

    // Get sessions active in the last 5 minutes, scoped to this organization
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('funnel_events')
      .select('funnel_session_id')
      .eq('organization_id', organizationId)
      .gte('created_at', fiveMinutesAgo);

    if (error) {
      console.error('[Active Sessions API] Error:', error);
      return res.status(200).json({ count: 0 });
    }

    // Count unique session IDs
    const uniqueSessions = new Set(
      data?.map((e: { funnel_session_id: string }) => e.funnel_session_id) || []
    );

    return res.status(200).json({
      count: uniqueSessions.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Active Sessions API] Error:', error);
    captureError(error, { route: 'funnel/active-sessions' });
    await flushSentry();
    return res.status(200).json({ count: 0 });
  }
}
