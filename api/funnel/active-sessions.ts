import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create Supabase client inline
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get sessions active in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
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
    return res.status(200).json({ count: 0 });
  }
}
