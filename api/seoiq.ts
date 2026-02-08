import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt, isEncryptionConfigured } from './_lib/encryption.js';
import { getGoogleAccessToken } from './_lib/google-auth.js';
import {
  scoreQuickWin,
  scoreCTROptimization,
  scoreContentGap,
  buildArticleSystemPrompt,
  buildArticleUserPrompt,
} from './_lib/seo-prompts.js';
import { fetchKeywordIdeas, isGoogleAdsConfigured } from './_lib/google-ads.js';

// ─── Shared Supabase client ────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Shared constants ──────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-exp-image-generation';

// ─── Shared interfaces ────────────────────────────────────────────────────

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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface GeneratedArticle {
  title: string;
  slug: string;
  metaDescription: string;
  content: string;
  wordCount: number;
  category: string;
  readTimeMinutes: number;
  secondaryKeywords: string[];
  thumbnailPrompt: string;
  faqQuestions: Array<{ question: string; answer: string }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }>;
    };
  }>;
  error?: { message: string };
}

// ─── Authentication helper ─────────────────────────────────────────────────

interface AuthContext {
  userId: string;
  organizationId: string;
  authUserId: string;
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
  return { userId: profile.id, organizationId: profile.organization_id, authUserId: user.id };
}

async function verifySiteOwnership(siteId: string, organizationId: string): Promise<boolean> {
  const { data } = await supabase
    .from('seo_sites')
    .select('organization_id')
    .eq('id', siteId)
    .single();

  if (!data) return false;
  return data.organization_id === organizationId;
}

// ─── Main catch-all handler ────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Route is passed via vercel.json rewrite: /api/seo-iq/:path* → /api/seoiq?route=:path
  const route = typeof req.query.route === 'string' ? req.query.route : '';

  if (!route) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Routes with their own auth mechanisms
  if (route === 'provision-org') return handleProvisionOrg(req, res);
  if (route === 'autopilot-cron') return handleAutopilotCron(req, res);

  // All other routes require JWT authentication
  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  switch (route) {
    case 'sites':
      return handleSites(req, res, auth);
    case 'keywords':
      return handleKeywords(req, res, auth);
    case 'articles':
      return handleArticles(req, res, auth);
    case 'refresh-keywords':
      return handleRefreshKeywords(req, res, auth);
    case 'generate-article':
      return handleGenerateArticle(req, res, auth);
    case 'publish-article':
      return handlePublishArticle(req, res, auth);
    case 'autopilot-pick-keyword':
      return handleAutopilotPickKeyword(req, res, auth);
    case 'autopilot-status':
      return handleAutopilotStatus(req, res, auth);
    case 'autopilot-config':
      return handleAutopilotConfig(req, res, auth);
    case 'autopilot-schedule':
      return handleAutopilotSchedule(req, res, auth);
    case 'research-keywords':
      return handleResearchKeywords(req, res, auth);
    default:
      return res.status(404).json({ error: `Unknown route: ${route}` });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SITES HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleSites(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { method } = req;

  if (method === 'GET') {
    return handleSitesGet(req, res, auth);
  } else if (method === 'POST') {
    return handleSitesPost(req, res, auth);
  } else if (method === 'PUT') {
    return handleSitesPut(req, res, auth);
  } else if (method === 'DELETE') {
    return handleSitesDelete(req, res, auth);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSitesGet(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { siteId } = req.query;
  const organizationId = auth.organizationId;

  // Single site fetch
  if (siteId && typeof siteId === 'string') {
    const { data, error } = await supabase
      .from('seo_sites')
      .select('id, organization_id, name, domain, google_status, google_scopes, target_table_name, gsc_property, slug_prefix, voice_guide, target_supabase_url_encrypted, target_supabase_key_encrypted, created_at, updated_at')
      .eq('id', siteId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Site not found' });
    }

    return res.status(200).json({
      ...data,
      has_target_credentials: !!(data.target_supabase_url_encrypted && data.target_supabase_key_encrypted),
      // Strip encrypted fields from response
      target_supabase_url_encrypted: undefined,
      target_supabase_key_encrypted: undefined,
    });
  }

  // List all sites for org
  const { data, error } = await supabase
    .from('seo_sites')
    .select('id, organization_id, name, domain, google_status, google_scopes, target_table_name, gsc_property, slug_prefix, voice_guide, target_supabase_url_encrypted, target_supabase_key_encrypted, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch sites', message: error.message });
  }

  const sites = (data || []).map((site) => ({
    ...site,
    has_target_credentials: !!(site.target_supabase_url_encrypted && site.target_supabase_key_encrypted),
    target_supabase_url_encrypted: undefined,
    target_supabase_key_encrypted: undefined,
  }));

  return res.status(200).json(sites);
}

async function handleSitesPost(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { name, domain, gsc_property, slug_prefix, voice_guide, target_supabase_url, target_supabase_key, target_table_name } = req.body;
  const organizationId = auth.organizationId;

  if (!name || !domain) {
    return res.status(400).json({ error: 'name and domain are required' });
  }

  const insertData: Record<string, unknown> = {
    organization_id: organizationId,
    name,
    domain: domain.replace(/^https?:\/\//, '').replace(/\/$/, ''), // Strip protocol and trailing slash
    gsc_property: gsc_property || null,
    slug_prefix: slug_prefix || '',
    voice_guide: voice_guide || null,
    target_table_name: target_table_name || 'articles',
  };

  // Encrypt target Supabase credentials if provided
  if (target_supabase_url || target_supabase_key) {
    if (!isEncryptionConfigured()) {
      console.error('CREDENTIAL_ENCRYPTION_KEY is not configured');
      return res.status(500).json({ error: 'Server encryption is not configured. Site credentials cannot be stored securely.' });
    }
    if (target_supabase_url) {
      insertData.target_supabase_url_encrypted = encrypt(target_supabase_url);
    }
    if (target_supabase_key) {
      insertData.target_supabase_key_encrypted = encrypt(target_supabase_key);
    }
  }

  const { data, error } = await supabase
    .from('seo_sites')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A site with this domain already exists in your organization' });
    }
    console.error('Failed to create site:', error);
    return res.status(500).json({ error: 'Failed to create site', message: error.message });
  }

  return res.status(201).json({
    ...data,
    has_target_credentials: !!(data.target_supabase_url_encrypted && data.target_supabase_key_encrypted),
    target_supabase_url_encrypted: undefined,
    target_supabase_key_encrypted: undefined,
  });
}

async function handleSitesPut(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { siteId, name, gsc_property, slug_prefix, voice_guide, target_supabase_url, target_supabase_key, target_table_name } = req.body;
  const organizationId = auth.organizationId;

  if (!siteId) {
    return res.status(400).json({ error: 'siteId is required' });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) updateData.name = name;
  if (gsc_property !== undefined) updateData.gsc_property = gsc_property;
  if (slug_prefix !== undefined) updateData.slug_prefix = slug_prefix;
  if (voice_guide !== undefined) updateData.voice_guide = voice_guide;
  if (target_table_name !== undefined) updateData.target_table_name = target_table_name;

  if (target_supabase_url) {
    updateData.target_supabase_url_encrypted = encrypt(target_supabase_url);
  }
  if (target_supabase_key) {
    updateData.target_supabase_key_encrypted = encrypt(target_supabase_key);
  }

  const { data, error } = await supabase
    .from('seo_sites')
    .update(updateData)
    .eq('id', siteId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to update site', message: error.message });
  }

  return res.status(200).json({
    ...data,
    has_target_credentials: !!(data.target_supabase_url_encrypted && data.target_supabase_key_encrypted),
    target_supabase_url_encrypted: undefined,
    target_supabase_key_encrypted: undefined,
  });
}

async function handleSitesDelete(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { siteId } = req.query;
  const organizationId = auth.organizationId;

  if (!siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'siteId is required' });
  }

  const { error } = await supabase
    .from('seo_sites')
    .delete()
    .eq('id', siteId)
    .eq('organization_id', organizationId);

  if (error) {
    return res.status(500).json({ error: 'Failed to delete site', message: error.message });
  }

  return res.status(200).json({ success: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORDS HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleKeywords(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId } = req.query;

  if (!siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'siteId is required' });
  }

  if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  const { data, error } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('site_id', siteId)
    .order('opportunity_score', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch keywords', message: error.message });
  }

  return res.status(200).json(data || []);
}

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLES HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleArticles(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method === 'GET') {
    return handleArticlesGet(req, res, auth);
  } else if (req.method === 'PUT') {
    return handleArticlesUpdate(req, res, auth);
  } else if (req.method === 'DELETE') {
    return handleArticlesDelete(req, res, auth);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleArticlesGet(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { siteId, articleId, status } = req.query;

  if (!siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'siteId is required' });
  }

  if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  // Single article fetch
  if (articleId && typeof articleId === 'string') {
    const { data, error } = await supabase
      .from('seo_articles')
      .select('*')
      .eq('id', articleId)
      .eq('site_id', siteId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Article not found' });
    }

    return res.status(200).json(data);
  }

  // List articles for site
  let query = supabase
    .from('seo_articles')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });

  if (status && typeof status === 'string') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch articles', message: error.message });
  }

  return res.status(200).json(data || []);
}

async function handleArticlesUpdate(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { articleId, siteId, title, slug, meta_description, content, category, status } = req.body;

  if (!articleId || !siteId) {
    return res.status(400).json({ error: 'articleId and siteId are required' });
  }

  if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (title !== undefined) updateData.title = title;
  if (slug !== undefined) updateData.slug = slug;
  if (meta_description !== undefined) updateData.meta_description = meta_description;
  if (content !== undefined) {
    updateData.content = content;
    updateData.word_count = content.split(/\s+/).length;
  }
  if (category !== undefined) updateData.category = category;
  if (status !== undefined) updateData.status = status;

  const { data, error } = await supabase
    .from('seo_articles')
    .update(updateData)
    .eq('id', articleId)
    .eq('site_id', siteId)
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to update article', message: error.message });
  }

  return res.status(200).json(data);
}

async function handleArticlesDelete(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { articleId, siteId } = req.query;

  if (!articleId || typeof articleId !== 'string' || !siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'articleId and siteId are required' });
  }

  if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  const { error } = await supabase
    .from('seo_articles')
    .delete()
    .eq('id', articleId)
    .eq('site_id', siteId);

  if (error) {
    return res.status(500).json({ error: 'Failed to delete article', message: error.message });
  }

  return res.status(200).json({ success: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH KEYWORDS HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleRefreshKeywords(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { site_id, days = 90 } = req.body;

  if (!site_id) {
    return res.status(400).json({ error: 'site_id is required' });
  }

  if (!(await verifySiteOwnership(site_id, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
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

    // Fetch existing keyword records to check for prior search volume data
    const { data: existingKeywordRecords } = await supabase
      .from('seo_keywords')
      .select('keyword, search_volume, competition, competition_index')
      .eq('site_id', site_id);

    const existingKeywordMap = new Map(
      (existingKeywordRecords || []).map((k) => [k.keyword.toLowerCase(), k])
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

      // Check for prior search volume data from Keyword Planner research
      const priorData = existingKeywordMap.get(keyword.toLowerCase());
      let contentGapScore = 0;
      if (priorData?.search_volume > 0 && position > 10) {
        contentGapScore = scoreContentGap(
          priorData.search_volume,
          priorData.competition || 'UNKNOWN',
          priorData.competition_index || 0,
          keyword
        );
      }

      // Pick the best opportunity type (highest of three scores)
      let opportunityType: string | null = null;
      let score = 0;
      let reasoning = '';
      let action = '';

      if (contentGapScore > quickWinScore && contentGapScore > ctrScore && contentGapScore > 0) {
        opportunityType = 'content_gap';
        score = contentGapScore;
        reasoning = `${priorData!.search_volume!.toLocaleString()} monthly searches, position ${position}. High-value content gap — not ranking on page 1 despite search demand.`;
        action = `Write a comprehensive article targeting "${keyword}" to capture ${priorData!.search_volume!.toLocaleString()} monthly searches.`;
      } else if (quickWinScore > ctrScore && quickWinScore > 0) {
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

// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH KEYWORDS HANDLER (Google Ads Keyword Planner)
// ═══════════════════════════════════════════════════════════════════════════

async function handleResearchKeywords(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { site_id, seeds, use_url } = req.body;

  if (!site_id) {
    return res.status(400).json({ error: 'site_id is required' });
  }

  if (!seeds || !Array.isArray(seeds) || seeds.length === 0) {
    return res.status(400).json({ error: 'seeds array is required (comma-separated keywords or a URL)' });
  }

  if (!(await verifySiteOwnership(site_id, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  if (!isGoogleAdsConfigured()) {
    return res.status(400).json({ error: 'Google Ads API is not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and GOOGLE_ADS_REFRESH_TOKEN.' });
  }

  try {
    // Fetch keyword ideas from Google Ads Keyword Planner
    const { keywords: keywordIdeas, error: apiError } = await fetchKeywordIdeas(seeds, { useUrl: !!use_url });

    if (apiError) {
      return res.status(502).json({ error: `Keyword Planner error: ${apiError}` });
    }

    if (keywordIdeas.length === 0) {
      return res.status(200).json({ keywords_fetched: 0, keywords_upserted: 0, content_gaps_found: 0 });
    }

    // Fetch existing keywords for this site (to check overlap and preserve GSC data)
    const { data: existingKeywords } = await supabase
      .from('seo_keywords')
      .select('keyword, current_position, opportunity_score')
      .eq('site_id', site_id);

    const existingMap = new Map(
      (existingKeywords || []).map((k) => [k.keyword.toLowerCase(), k])
    );

    // Fetch existing articles (to mark used keywords)
    const { data: existingArticles } = await supabase
      .from('seo_articles')
      .select('primary_keyword')
      .eq('site_id', site_id);

    const usedKeywords = new Set(
      (existingArticles || [])
        .map((a) => a.primary_keyword?.toLowerCase())
        .filter(Boolean)
    );

    let upsertCount = 0;
    let contentGapsFound = 0;

    for (const idea of keywordIdeas) {
      const existing = existingMap.get(idea.keyword.toLowerCase());

      // Skip if already ranking well (position <= 10) — not a content gap
      if (existing?.current_position && existing.current_position <= 10) {
        // Still upsert volume/competition data but keep existing score
        const { error: upsertError } = await supabase
          .from('seo_keywords')
          .upsert(
            {
              site_id,
              keyword: idea.keyword,
              search_volume: idea.avgMonthlySearches,
              competition: idea.competition,
              competition_index: idea.competitionIndex,
            },
            { onConflict: 'site_id,keyword' }
          );
        if (!upsertError) upsertCount++;
        continue;
      }

      // Score as content gap
      const gapScore = scoreContentGap(
        idea.avgMonthlySearches,
        idea.competition,
        idea.competitionIndex,
        idea.keyword
      );

      // Only override score if new score > existing score
      const finalScore = Math.max(gapScore, existing?.opportunity_score || 0);
      const isContentGap = gapScore >= (existing?.opportunity_score || 0);

      const cluster = classifyCluster(idea.keyword);

      const { error: upsertError } = await supabase
        .from('seo_keywords')
        .upsert(
          {
            site_id,
            keyword: idea.keyword,
            search_volume: idea.avgMonthlySearches,
            competition: idea.competition,
            competition_index: idea.competitionIndex,
            opportunity_type: isContentGap ? 'content_gap' : undefined,
            opportunity_score: finalScore,
            reasoning: isContentGap
              ? `${idea.avgMonthlySearches.toLocaleString()} monthly searches, ${idea.competition} competition. High-value content gap opportunity.`
              : undefined,
            action: isContentGap
              ? `Write a comprehensive article targeting "${idea.keyword}" to capture ${idea.avgMonthlySearches.toLocaleString()} monthly searches.`
              : undefined,
            topic_cluster: cluster,
            status: usedKeywords.has(idea.keyword.toLowerCase()) ? 'used' : 'active',
          },
          { onConflict: 'site_id,keyword' }
        );

      if (!upsertError) {
        upsertCount++;
        if (isContentGap && gapScore > 0) contentGapsFound++;
      }
    }

    return res.status(200).json({
      keywords_fetched: keywordIdeas.length,
      keywords_upserted: upsertCount,
      content_gaps_found: contentGapsFound,
    });
  } catch (err) {
    console.error('Research keywords error:', err);
    return res.status(500).json({
      error: 'Failed to research keywords',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE ARTICLE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleGenerateArticle(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  const { site_id, keyword_id, keyword: manualKeyword, custom_instructions, iq_level = 'medium' } = req.body;

  if (!site_id) {
    return res.status(400).json({ error: 'site_id is required' });
  }

  if (!keyword_id && !manualKeyword) {
    return res.status(400).json({ error: 'Either keyword_id or keyword is required' });
  }

  if (!(await verifySiteOwnership(site_id, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  try {
    // Fetch site config
    const { data: site, error: siteError } = await supabase
      .from('seo_sites')
      .select('id, domain, voice_guide, slug_prefix')
      .eq('id', site_id)
      .single();

    if (siteError || !site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Resolve keyword data
    let keywordText = manualKeyword;
    let keywordData: Record<string, unknown> | undefined;

    if (keyword_id) {
      const { data: kw } = await supabase
        .from('seo_keywords')
        .select('*')
        .eq('id', keyword_id)
        .single();

      if (kw) {
        keywordText = kw.keyword;
        keywordData = {
          searchVolume: kw.search_volume,
          competition: kw.competition,
          currentPosition: kw.current_position,
          impressions: kw.impressions,
          opportunityType: kw.opportunity_type,
          cluster: kw.topic_cluster,
        };
      }
    }

    if (!keywordText) {
      return res.status(400).json({ error: 'Could not resolve keyword' });
    }

    // Fetch existing articles with titles, categories, and keywords for intelligent internal linking
    const { data: existingArticles } = await supabase
      .from('seo_articles')
      .select('slug, title, category, primary_keyword')
      .eq('site_id', site_id)
      .eq('status', 'published');

    const articleContext = (existingArticles || []).map((a) => ({
      slug: a.slug,
      title: a.title,
      category: a.category,
      keyword: a.primary_keyword,
    }));

    // Collect existing categories for taxonomy consistency
    const existingCategories = [...new Set(articleContext.map((a) => a.category).filter(Boolean))];

    // Build prompts
    const systemPrompt = buildArticleSystemPrompt(site.voice_guide);
    const userPrompt = buildArticleUserPrompt(
      keywordText,
      keywordData as Parameters<typeof buildArticleUserPrompt>[1],
      custom_instructions,
      articleContext,
      existingCategories,
    );

    // Map IQ level to max_tokens
    const maxTokens = iq_level === 'high' ? 8192 : iq_level === 'low' ? 4096 : 6144;

    // Call Anthropic API
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ] as AnthropicMessage[],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errorText);
      return res.status(502).json({ error: 'Failed to generate article', details: errorText });
    }

    const anthropicData: AnthropicResponse = await anthropicResponse.json();
    const responseText = anthropicData.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    // Parse JSON from response (handle optional code fences)
    let articleData: GeneratedArticle;
    try {
      const jsonStr = responseText
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
      articleData = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse article JSON:', responseText.substring(0, 500));
      return res.status(502).json({
        error: 'Failed to parse generated article',
        rawResponse: responseText.substring(0, 2000),
      });
    }

    // Insert as draft
    const { data: article, error: insertError } = await supabase
      .from('seo_articles')
      .insert({
        site_id,
        keyword_id: keyword_id || null,
        title: articleData.title,
        slug: articleData.slug,
        meta_description: articleData.metaDescription,
        content: articleData.content,
        word_count: articleData.wordCount || articleData.content.split(/\s+/).length,
        primary_keyword: keywordText,
        secondary_keywords: articleData.secondaryKeywords || [],
        category: articleData.category || 'General',
        read_time_minutes: articleData.readTimeMinutes || Math.ceil(articleData.content.split(/\s+/).length / 200),
        thumbnail_prompt: articleData.thumbnailPrompt || null,
        status: 'draft',
        generation_model: ANTHROPIC_MODEL,
        generation_params: {
          iq_level,
          max_tokens: maxTokens,
          input_tokens: anthropicData.usage.input_tokens,
          output_tokens: anthropicData.usage.output_tokens,
          faq_questions: articleData.faqQuestions || [],
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert article:', insertError);
      return res.status(500).json({ error: 'Failed to save generated article', message: insertError.message });
    }

    // Mark the keyword as used
    if (keyword_id) {
      await supabase
        .from('seo_keywords')
        .update({ status: 'used', updated_at: new Date().toISOString() })
        .eq('id', keyword_id);
    }

    return res.status(201).json({ article });
  } catch (err) {
    console.error('Generate article error:', err);
    return res.status(500).json({
      error: 'Failed to generate article',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH ARTICLE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handlePublishArticle(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { article_id, generate_thumbnail = true, submit_indexing = true } = req.body;

  if (!article_id) {
    return res.status(400).json({ error: 'article_id is required' });
  }

  try {
    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from('seo_articles')
      .select('*')
      .eq('id', article_id)
      .single();

    if (articleError || !article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Verify the article's site belongs to the user's organization
    if (!(await verifySiteOwnership(article.site_id, auth.organizationId))) {
      return res.status(403).json({ error: 'Access denied: article does not belong to your organization' });
    }

    if (article.status === 'published') {
      return res.status(400).json({ error: 'Article is already published' });
    }

    // Mark as publishing
    await supabase
      .from('seo_articles')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', article_id);

    // Fetch site with encrypted credentials
    const { data: site, error: siteError } = await supabase
      .from('seo_sites')
      .select('*')
      .eq('id', article.site_id)
      .single();

    if (siteError || !site) {
      await markFailed(article_id, 'Site not found');
      return res.status(404).json({ error: 'Site not found' });
    }

    // Verify target Supabase credentials exist
    if (!site.target_supabase_url_encrypted || !site.target_supabase_key_encrypted) {
      await markFailed(article_id, 'Target Supabase credentials not configured');
      return res.status(400).json({ error: 'Target Supabase credentials not configured for this site' });
    }

    // Decrypt target Supabase credentials
    const targetUrl = decrypt(site.target_supabase_url_encrypted);
    const targetKey = decrypt(site.target_supabase_key_encrypted);
    const targetTable = site.target_table_name || 'articles';

    // Create inline Supabase client for the target database
    const targetSupabase = createClient(targetUrl, targetKey);

    // Publish article to target database
    const publishData: Record<string, unknown> = {
      slug: article.slug,
      title: article.title,
      description: article.meta_description,
      content: article.content,
      category: article.category,
      read_time_minutes: article.read_time_minutes,
      is_published: true,
      is_featured: true,
      published_at: new Date().toISOString(),
      meta_title: article.title,
      meta_description: article.meta_description,
    };

    const { data: publishedData, error: publishError } = await targetSupabase
      .from(targetTable)
      .upsert(publishData, { onConflict: 'slug' })
      .select()
      .single();

    if (publishError) {
      console.error('Target Supabase publish error:', publishError);
      await markFailed(article_id, `Publish failed: ${publishError.message}`);
      return res.status(502).json({ error: 'Failed to publish to target site', details: publishError.message });
    }

    const publishedUrl = `https://${site.domain}${site.slug_prefix || '/articles/'}${article.slug}`;
    let thumbnailGenerated = false;
    let indexingSubmitted = false;

    // Generate thumbnail via Gemini (optional)
    if (generate_thumbnail && article.thumbnail_prompt && GEMINI_API_KEY) {
      const thumbnailUrl = await generateThumbnail(article.slug, article.thumbnail_prompt);
      if (thumbnailUrl) {
        // Update thumbnail in target database
        await targetSupabase
          .from(targetTable)
          .update({ featured_image: thumbnailUrl })
          .eq('slug', article.slug);

        // Update thumbnail in our database
        await supabase
          .from('seo_articles')
          .update({ thumbnail_url: thumbnailUrl })
          .eq('id', article_id);

        thumbnailGenerated = true;
      }
    }

    // Submit to Google Indexing API (optional)
    if (submit_indexing && site.google_status === 'active') {
      const googleToken = await getGoogleAccessToken(site.id);
      if (googleToken) {
        indexingSubmitted = await submitToIndexingApi(publishedUrl, googleToken);

        if (indexingSubmitted) {
          await supabase
            .from('seo_articles')
            .update({
              indexing_status: 'submitted',
              indexing_submitted_at: new Date().toISOString(),
            })
            .eq('id', article_id);
        }
      }
    }

    // Mark as published
    await supabase
      .from('seo_articles')
      .update({
        status: 'published',
        published_url: publishedUrl,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', article_id);

    return res.status(200).json({
      published_url: publishedUrl,
      thumbnail_generated: thumbnailGenerated,
      indexing_submitted: indexingSubmitted,
    });
  } catch (err) {
    console.error('Publish article error:', err);
    await markFailed(article_id, err instanceof Error ? err.message : 'Unknown error');
    return res.status(500).json({
      error: 'Failed to publish article',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ─── Publish Article helpers ───────────────────────────────────────────────

async function markFailed(articleId: string, error: string) {
  await supabase
    .from('seo_articles')
    .update({
      status: 'failed',
      publish_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId);
}

async function generateThumbnail(slug: string, prompt: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      return null;
    }

    const data: GeminiResponse = await response.json();

    if (data.error) {
      console.error('Gemini error:', data.error.message);
      return null;
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const extension = part.inlineData.mimeType.split('/')[1] || 'png';
        // Return the path the target site would use
        return `/images/articles/${slug}.${extension}`;
      }
    }

    return null;
  } catch (err) {
    console.error('Thumbnail generation error:', err);
    return null;
  }
}

async function submitToIndexingApi(url: string, accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Indexing API error:', response.status, errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Indexing API error:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVISION ORGANIZATION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleProvisionOrg(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authId, email, fullName, companyName } = req.body || {};

  if (!authId || !email) {
    return res.status(400).json({ error: 'authId and email are required' });
  }

  // Verify JWT matches the authId being provisioned
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (authUser.id !== authId) {
    return res.status(403).json({ error: 'Access denied: token does not match the requested authId' });
  }

  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*, organization:organizations(*)')
      .eq('auth_id', authId)
      .single();

    if (existingUser) {
      return res.status(200).json({
        organization: existingUser.organization,
        user: { ...existingUser, organization: undefined },
      });
    }

    // Create organization
    const name = companyName || fullName || 'My Company';
    const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name,
        slug: `${slug}-${Date.now().toString(36)}`,
        setup_mode: 'self_service',
        plan_tier: 'free',
      })
      .select()
      .single();

    if (orgErr || !org) {
      console.error('Failed to create organization:', orgErr);
      return res.status(500).json({ error: 'Failed to create organization' });
    }

    // Create user linked to organization
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({
        auth_id: authId,
        email,
        full_name: fullName || email,
        organization_id: org.id,
        role: 'owner',
        status: 'active',
      })
      .select()
      .single();

    if (userErr || !user) {
      console.error('Failed to create user:', userErr);
      // Rollback org creation
      await supabase.from('organizations').delete().eq('id', org.id);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    return res.status(201).json({ organization: org, user });
  } catch (err) {
    console.error('Provision org error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOPILOT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleAutopilotPickKeyword(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { site_id } = req.body;
  if (!site_id) {
    return res.status(400).json({ error: 'site_id is required' });
  }

  if (!(await verifySiteOwnership(site_id, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  const { data: keyword, error } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('site_id', site_id)
    .eq('status', 'active')
    .gt('opportunity_score', 0)
    .order('opportunity_score', { ascending: false })
    .limit(1)
    .single();

  if (error || !keyword) {
    return res.status(404).json({ error: 'No active keywords with opportunities found. Refresh keywords first.' });
  }

  return res.status(200).json(keyword);
}

async function handleAutopilotStatus(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId } = req.query;
  if (!siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'siteId is required' });
  }

  if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  const { data, error } = await supabase
    .from('seo_sites')
    .select('autopilot_enabled, autopilot_cadence, autopilot_iq_level, autopilot_articles_per_run, autopilot_next_run_at, autopilot_pipeline_step, autopilot_pipeline_keyword_id, autopilot_pipeline_article_id, autopilot_last_run_at, autopilot_last_error')
    .eq('id', siteId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Site not found' });
  }

  return res.status(200).json(data);
}

async function handleAutopilotConfig(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId, autopilot_enabled, autopilot_cadence, autopilot_iq_level, autopilot_articles_per_run, autopilot_pipeline_step } = req.body;
  if (!siteId) {
    return res.status(400).json({ error: 'siteId is required' });
  }

  if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
    return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (autopilot_enabled !== undefined) updateData.autopilot_enabled = autopilot_enabled;
  if (autopilot_cadence !== undefined) updateData.autopilot_cadence = autopilot_cadence;
  if (autopilot_iq_level !== undefined) updateData.autopilot_iq_level = autopilot_iq_level;
  if (autopilot_articles_per_run !== undefined) {
    updateData.autopilot_articles_per_run = Math.min(Math.max(autopilot_articles_per_run, 1), 5);
  }

  // Allow clearing pipeline state (after resume completes)
  if (autopilot_pipeline_step !== undefined) {
    updateData.autopilot_pipeline_step = autopilot_pipeline_step;
    if (autopilot_pipeline_step === null) {
      updateData.autopilot_pipeline_keyword_id = null;
      updateData.autopilot_pipeline_article_id = null;
    }
  }

  // Calculate next run time when enabling
  if (autopilot_enabled) {
    const cadence = autopilot_cadence || 'weekly';
    const now = new Date();
    let nextRun: Date;
    if (cadence === 'daily') {
      nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (cadence === 'every_3_days') {
      nextRun = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    } else {
      nextRun = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    nextRun.setUTCHours(6, 0, 0, 0);
    updateData.autopilot_next_run_at = nextRun.toISOString();
  } else if (autopilot_enabled === false) {
    updateData.autopilot_next_run_at = null;
  }

  const { data, error } = await supabase
    .from('seo_sites')
    .update(updateData)
    .eq('id', siteId)
    .select('autopilot_enabled, autopilot_cadence, autopilot_iq_level, autopilot_articles_per_run, autopilot_next_run_at, autopilot_pipeline_step, autopilot_pipeline_keyword_id, autopilot_pipeline_article_id, autopilot_last_run_at, autopilot_last_error')
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to update autopilot config', message: error.message });
  }

  return res.status(200).json(data);
}

async function handleAutopilotCron(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
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
    // Find sites due for autopilot run
    const now = new Date().toISOString();
    const { data: sites, error } = await supabase
      .from('seo_sites')
      .select('id, domain, google_status, autopilot_cadence, autopilot_iq_level, autopilot_articles_per_run, autopilot_pipeline_step')
      .eq('autopilot_enabled', true)
      .lte('autopilot_next_run_at', now)
      .is('autopilot_pipeline_step', null)
      .limit(1);

    if (error || !sites || sites.length === 0) {
      return res.status(200).json({ message: 'No sites due for autopilot run' });
    }

    const site = sites[0];

    // Pick the top keyword (fast DB query, stays within 10s timeout)
    // Keywords can come from GSC refresh OR Keyword Planner research
    const { data: keyword } = await supabase
      .from('seo_keywords')
      .select('id, keyword')
      .eq('site_id', site.id)
      .eq('status', 'active')
      .gt('opportunity_score', 0)
      .order('opportunity_score', { ascending: false })
      .limit(1)
      .single();

    if (!keyword) {
      await supabase.from('seo_sites').update({
        autopilot_last_error: 'No active keywords found — research keywords or refresh from GSC first',
        updated_at: new Date().toISOString(),
      }).eq('id', site.id);
      return res.status(200).json({ message: 'No keywords available', siteId: site.id });
    }

    // Mark as awaiting generation (user needs to click Resume in the UI)
    await supabase.from('seo_sites').update({
      autopilot_pipeline_step: 'awaiting_generation',
      autopilot_pipeline_keyword_id: keyword.id,
      autopilot_last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', site.id);

    // ── Process content calendar scheduled runs for today ──
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data: scheduledRuns } = await supabase
      .from('autopilot_scheduled_runs')
      .select('id, site_id')
      .eq('status', 'pending')
      .eq('scheduled_date', today);

    if (scheduledRuns && scheduledRuns.length > 0) {
      for (const run of scheduledRuns) {
        // Pick top keyword for each scheduled run
        const { data: kw } = await supabase
          .from('seo_keywords')
          .select('id, keyword')
          .eq('site_id', run.site_id)
          .eq('status', 'active')
          .gt('opportunity_score', 0)
          .order('opportunity_score', { ascending: false })
          .limit(1)
          .single();

        if (kw) {
          await supabase.from('autopilot_scheduled_runs').update({
            status: 'keyword_picked',
            keyword_id: kw.id,
            keyword_text: kw.keyword,
            updated_at: new Date().toISOString(),
          }).eq('id', run.id);
        } else {
          await supabase.from('autopilot_scheduled_runs').update({
            status: 'failed',
            error: 'No active keywords available',
            updated_at: new Date().toISOString(),
          }).eq('id', run.id);
        }
      }
    }

    return res.status(200).json({
      message: 'Keyword picked, awaiting article generation',
      siteId: site.id,
      keywordId: keyword.id,
      keyword: keyword.keyword,
      scheduledRunsProcessed: scheduledRuns?.length || 0,
    });
  } catch (err) {
    console.error('Autopilot cron error:', err);
    return res.status(500).json({
      error: 'Cron handler failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT CALENDAR SCHEDULE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleAutopilotSchedule(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { method } = req;

  if (method === 'GET') {
    // Fetch scheduled runs for a site + month
    const { siteId, month } = req.query;
    if (!siteId || typeof siteId !== 'string') {
      return res.status(400).json({ error: 'siteId is required' });
    }
    if (!month || typeof month !== 'string') {
      return res.status(400).json({ error: 'month is required (YYYY-MM)' });
    }

    if (!(await verifySiteOwnership(siteId, auth.organizationId))) {
      return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
    }

    // Calculate date range for the month
    const [year, mon] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = `${year}-${String(mon + 1).padStart(2, '0')}-01`;
    // Handle December → next year January
    const endDateFinal = mon === 12 ? `${year + 1}-01-01` : endDate;

    const { data, error } = await supabase
      .from('autopilot_scheduled_runs')
      .select('*')
      .eq('site_id', siteId)
      .gte('scheduled_date', startDate)
      .lt('scheduled_date', endDateFinal)
      .order('scheduled_date', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch scheduled runs', message: error.message });
    }

    return res.status(200).json(data || []);
  }

  if (method === 'POST') {
    // Bulk-create scheduled runs
    const { site_id, dates } = req.body;
    if (!site_id) {
      return res.status(400).json({ error: 'site_id is required' });
    }
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'dates array is required' });
    }

    if (!(await verifySiteOwnership(site_id, auth.organizationId))) {
      return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
    }

    const rows = dates.map((date: string) => ({
      site_id,
      scheduled_date: date,
      status: 'pending',
    }));

    const { data, error } = await supabase
      .from('autopilot_scheduled_runs')
      .upsert(rows, { onConflict: 'site_id,scheduled_date', ignoreDuplicates: true })
      .select('*');

    if (error) {
      return res.status(500).json({ error: 'Failed to create scheduled runs', message: error.message });
    }

    return res.status(201).json(data || []);
  }

  if (method === 'DELETE') {
    // Delete a single scheduled run (only if pending)
    const { site_id, scheduled_date } = req.body;
    if (!site_id || !scheduled_date) {
      return res.status(400).json({ error: 'site_id and scheduled_date are required' });
    }

    if (!(await verifySiteOwnership(site_id, auth.organizationId))) {
      return res.status(403).json({ error: 'Access denied: site does not belong to your organization' });
    }

    const { error } = await supabase
      .from('autopilot_scheduled_runs')
      .delete()
      .eq('site_id', site_id)
      .eq('scheduled_date', scheduled_date)
      .eq('status', 'pending');

    if (error) {
      return res.status(500).json({ error: 'Failed to delete scheduled run', message: error.message });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
