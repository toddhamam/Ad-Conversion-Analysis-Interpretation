import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { buildArticleSystemPrompt, buildArticleUserPrompt } from './prompts';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // Fetch existing article slugs for internal linking
    const { data: existingArticles } = await supabase
      .from('seo_articles')
      .select('slug')
      .eq('site_id', site_id)
      .eq('status', 'published');

    const existingSlugs = (existingArticles || []).map((a) => a.slug);

    // Build prompts
    const systemPrompt = buildArticleSystemPrompt(site.voice_guide);
    const userPrompt = buildArticleUserPrompt(
      keywordText,
      keywordData as Parameters<typeof buildArticleUserPrompt>[1],
      custom_instructions,
      existingSlugs,
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
