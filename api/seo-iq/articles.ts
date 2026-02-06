import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PUT') {
    return handleUpdate(req, res);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { siteId, articleId, status } = req.query;

  if (!siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'siteId is required' });
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

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const { articleId, siteId, title, slug, meta_description, content, category, status } = req.body;

  if (!articleId || !siteId) {
    return res.status(400).json({ error: 'articleId and siteId are required' });
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

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { articleId, siteId } = req.query;

  if (!articleId || typeof articleId !== 'string' || !siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'articleId and siteId are required' });
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
