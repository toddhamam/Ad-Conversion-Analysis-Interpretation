import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { initSentry, captureError, flushSentry } from '../_lib/sentry.js';

initSentry();

// Auth Supabase — Convertra's database (JWT verification)
const authSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Funnel Supabase — funnel site's database (authoritative funnel_events source)
const funnelSupabase = process.env.FUNNEL_SUPABASE_URL && process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.FUNNEL_SUPABASE_URL, process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY)
  : authSupabase;

/** Verify JWT Bearer token is valid (auth gate) */
async function isAuthenticated(req: VercelRequest): Promise<boolean> {
  if (!authSupabase) return false;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await authSupabase.auth.getUser(token);
  return !error && !!user;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!funnelSupabase || !authSupabase) {
      return res.status(200).json({ count: 0 });
    }

    // Verify JWT — return zero if unauthenticated
    const authed = await isAuthenticated(req);
    if (!authed) {
      return res.status(200).json({ count: 0 });
    }

    // Get sessions active in the last 5 minutes from funnel site's database
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await funnelSupabase
      .from('funnel_events')
      .select('funnel_session_id')
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
