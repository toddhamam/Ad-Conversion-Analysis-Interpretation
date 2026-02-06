import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../lib/encryption';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  if (method === 'GET') {
    return handleGet(req, res);
  } else if (method === 'POST') {
    return handlePost(req, res);
  } else if (method === 'PUT') {
    return handlePut(req, res);
  } else if (method === 'DELETE') {
    return handleDelete(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { organizationId, siteId } = req.query;

  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'organizationId is required' });
  }

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

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { organizationId, name, domain, gsc_property, slug_prefix, voice_guide, target_supabase_url, target_supabase_key, target_table_name } = req.body;

  if (!organizationId || !name || !domain) {
    return res.status(400).json({ error: 'organizationId, name, and domain are required' });
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
  if (target_supabase_url) {
    insertData.target_supabase_url_encrypted = encrypt(target_supabase_url);
  }
  if (target_supabase_key) {
    insertData.target_supabase_key_encrypted = encrypt(target_supabase_key);
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
    return res.status(500).json({ error: 'Failed to create site', message: error.message });
  }

  return res.status(201).json({
    ...data,
    has_target_credentials: !!(data.target_supabase_url_encrypted && data.target_supabase_key_encrypted),
    target_supabase_url_encrypted: undefined,
    target_supabase_key_encrypted: undefined,
  });
}

async function handlePut(req: VercelRequest, res: VercelResponse) {
  const { siteId, organizationId, name, gsc_property, slug_prefix, voice_guide, target_supabase_url, target_supabase_key, target_table_name } = req.body;

  if (!siteId || !organizationId) {
    return res.status(400).json({ error: 'siteId and organizationId are required' });
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

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { siteId, organizationId } = req.query;

  if (!siteId || typeof siteId !== 'string' || !organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'siteId and organizationId are required' });
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
