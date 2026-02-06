import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from '../lib/google-auth';
import { scoreQuickWin, scoreCTROptimization, scoreContentGap } from './prompts';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GSCResponse {
  rows?: GSCRow[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { site_id, days = 90 } = req.body;

  if (!site_id) {
    return res.status(400).json({ error: 'site_id is required' });
  }

  try {
    // Fetch site config
    const { data: site, error: siteError } = await supabase
      .from('seo_sites')
      .select('id, domain, gsc_property, google_status')
      .eq('id', site_id)
      .single();

    if (siteError || !site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    if (site.google_status !== 'active') {
      return res.status(400).json({ error: 'Google is not connected for this site. Please connect Google first.' });
    }

    // Get a valid Google access token (auto-refreshes if expired)
    const accessToken = await getGoogleAccessToken(site_id);
    if (!accessToken) {
      return res.status(401).json({ error: 'Failed to get Google access token. Please reconnect Google.' });
    }

    // Build GSC property URL
    const gscProperty = site.gsc_property || `sc-domain:${site.domain}`;

    // Calculate date range (GSC data has ~3 day delay)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Fetch query data from GSC
    const gscResponse = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscProperty)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query'],
          rowLimit: 5000,
          startRow: 0,
        }),
      }
    );

    if (!gscResponse.ok) {
      const errorText = await gscResponse.text();
      console.error('GSC API error:', gscResponse.status, errorText);
      return res.status(502).json({ error: 'Failed to fetch data from Google Search Console', details: errorText });
    }

    const gscData: GSCResponse = await gscResponse.json();
    const queries = gscData.rows || [];

    // Fetch existing articles for this site (to check topic coverage)
    const { data: existingArticles } = await supabase
      .from('seo_articles')
      .select('slug, primary_keyword')
      .eq('site_id', site_id);

    const existingKeywords = new Set(
      (existingArticles || [])
        .map((a) => a.primary_keyword?.toLowerCase())
        .filter(Boolean)
    );

    // Score and upsert keywords
    let upsertCount = 0;
    let scoredCount = 0;

    for (const row of queries) {
      const keyword = row.keys[0];
      if (!keyword) continue;

      const clicks = row.clicks || 0;
      const impressions = row.impressions || 0;
      const ctr = Math.round((row.ctr || 0) * 10000) / 100; // Convert to percentage
      const position = Math.round((row.position || 0) * 10) / 10;

      // Score this keyword
      const quickWinScore = scoreQuickWin(position, impressions, ctr, clicks);
      const ctrScore = scoreCTROptimization(impressions, ctr, position);

      // Pick the best opportunity type
      let opportunityType: string | null = null;
      let score = 0;
      let reasoning = '';
      let action = '';

      if (quickWinScore > ctrScore && quickWinScore > 0) {
        opportunityType = 'quick_win';
        score = quickWinScore;
        reasoning = `Position ${position} with ${impressions} impressions. A dedicated article could push this to page 1.`;
        action = `Write a dedicated article targeting this keyword to move from position ${position} to top 5.`;
      } else if (ctrScore > 0) {
        opportunityType = 'ctr_optimization';
        score = ctrScore;
        reasoning = `${impressions} impressions but only ${ctr}% CTR at position ${position}. Better title/meta could double clicks.`;
        action = 'Optimize the title tag and meta description for better CTR.';
      }

      // Skip keywords we've already written articles for
      if (existingKeywords.has(keyword.toLowerCase())) {
        score = Math.max(score - 30, 0);
      }

      const cluster = classifyCluster(keyword);

      const { error: upsertError } = await supabase
        .from('seo_keywords')
        .upsert(
          {
            site_id,
            keyword,
            clicks,
            impressions,
            ctr,
            current_position: position,
            opportunity_type: opportunityType,
            opportunity_score: score,
            reasoning,
            action,
            topic_cluster: cluster,
            status: existingKeywords.has(keyword.toLowerCase()) ? 'used' : 'active',
          },
          { onConflict: 'site_id,keyword' }
        );

      if (!upsertError) {
        upsertCount++;
        if (score > 0) scoredCount++;
      }
    }

    return res.status(200).json({
      gsc_queries: queries.length,
      keywords_upserted: upsertCount,
      opportunities_scored: scoredCount,
    });
  } catch (err) {
    console.error('Refresh keywords error:', err);
    return res.status(500).json({ error: 'Failed to refresh keywords', message: err instanceof Error ? err.message : 'Unknown error' });
  }
}

/**
 * Classify a keyword into a topic cluster.
 * This is a generic version — sites can customize via voice_guide.
 */
function classifyCluster(keyword: string): string {
  const kw = keyword.toLowerCase();

  if (kw.includes('how to') || kw.includes('tutorial') || kw.includes('guide') || kw.includes('step'))
    return 'How-To';
  if (kw.includes('best') || kw.includes('top') || kw.includes('review') || kw.includes('vs'))
    return 'Comparison';
  if (kw.includes('what is') || kw.includes('meaning') || kw.includes('definition'))
    return 'Explainer';
  if (kw.includes('why') || kw.includes('reason') || kw.includes('cause'))
    return 'Analysis';
  if (kw.includes('example') || kw.includes('template') || kw.includes('sample'))
    return 'Resource';
  if (kw.includes('tip') || kw.includes('trick') || kw.includes('hack'))
    return 'Tips';
  if (kw.includes('mistake') || kw.includes('problem') || kw.includes('issue') || kw.includes('fix'))
    return 'Troubleshooting';

  return 'General';
}
