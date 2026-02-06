import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../lib/encryption';
import { getGoogleAccessToken } from '../lib/google-auth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-exp-image-generation';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
