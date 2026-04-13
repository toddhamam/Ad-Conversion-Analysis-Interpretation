import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { initSentry, captureError, flushSentry } from './_lib/sentry.js';
import { markdownToHtml } from './_lib/markdown.js';
import {
  createArticleSchema,
  createFAQPageSchema,
  createBreadcrumbSchema,
} from './_lib/schema-builders.js';

initSentry();

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

import { readFileSync } from 'fs';
import { join } from 'path';

const SITE_URL = process.env.VITE_APP_URL || 'https://www.convertraiq.com';

// Extract asset tags from the built index.html (cached at cold start)
let _assetTags: string | null = null;
function getAssetTags(): string {
  if (_assetTags) return _assetTags;
  try {
    const html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf-8');
    const links = (html.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || []).join('\n  ');
    const scripts = (html.match(/<script[^>]+type="module"[^>]*><\/script>/g) || []).join('\n  ');
    _assetTags = `${links}\n  ${scripts}`;
  } catch {
    // Fallback for dev mode where dist/ doesn't exist
    _assetTags = '<script type="module" src="/src/main.tsx"></script>';
  }
  return _assetTags;
}

// ─── Authentication (for admin routes) ──────────────────────────────────────

interface AuthContext {
  userId: string;
  organizationId: string;
  isSuperAdmin: boolean;
}

async function authenticateAdmin(req: VercelRequest): Promise<AuthContext | null> {
  if (!supabase) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id, is_super_admin')
    .eq('auth_id', user.id)
    .single();

  if (!profile || !profile.is_super_admin) return null;
  return {
    userId: profile.id,
    organizationId: profile.organization_id,
    isSuperAdmin: true,
  };
}

// ─── Public Routes ──────────────────────────────────────────────────────────

async function handlePosts(req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const category = req.query.category as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = Math.min(parseInt((req.query.limit as string) || '12', 10), 50);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, category, author, featured_image, read_time_minutes, published_at, tags, schema_type', { count: 'exact' })
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  const { data: posts, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    posts: posts || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const slug = req.query.slug as string;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .single();

  if (error || !post) return res.status(404).json({ error: 'Post not found' });

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json(post);
}

async function handleFaqs(req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, category, faq_pairs')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .not('faq_pairs', 'eq', '[]')
    .order('published_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const allFaqs = (posts || []).flatMap((post) =>
    ((post.faq_pairs as Array<{ q: string; a: string }>) || []).map((pair) => ({
      ...pair,
      sourceSlug: post.slug,
      sourceTitle: post.title,
      category: post.category,
    }))
  );

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({ faqs: allFaqs });
}

async function handleSitemap(_req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at, published_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/for-agencies', priority: '0.9', changefreq: 'weekly' },
    { loc: '/blog', priority: '0.8', changefreq: 'daily' },
    { loc: '/faq', priority: '0.8', changefreq: 'weekly' },
    { loc: '/login', priority: '0.5', changefreq: 'monthly' },
    { loc: '/signup', priority: '0.6', changefreq: 'monthly' },
  ];

  const urls = staticPages
    .map(
      (p) => `  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    )
    .concat(
      (posts || []).map(
        (post) => `  <url>
    <loc>${SITE_URL}/blog/${post.slug}</loc>
    <lastmod>${(post.updated_at || post.published_at || '').split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
      )
    );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}

// ─── Prerender Routes ───────────────────────────────────────────────────────

async function handlePrerender(req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).send('Database not configured');

  const type = req.query.type as string;

  if (type === 'post') {
    return await prerenderPost(req, res);
  } else if (type === 'listing') {
    return await prerenderListing(req, res);
  } else if (type === 'faq') {
    return await prerenderFaq(req, res);
  }
  return res.status(400).send('Invalid prerender type');
}

async function prerenderPost(req: VercelRequest, res: VercelResponse) {
  const slug = req.query.slug as string;
  if (!slug || !supabase) return res.status(404).send('Not found');

  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .single();

  if (!post) return res.status(404).send('Post not found');

  const contentHtml = markdownToHtml(post.content);
  const categoryLabel = post.category.charAt(0).toUpperCase() + post.category.slice(1).replace('-', ' ');

  const schemas = [
    createArticleSchema({
      title: post.title,
      description: post.meta_description || post.excerpt || '',
      slug: post.slug,
      datePublished: post.published_at,
      dateModified: post.updated_at,
      author: post.author,
      image: post.featured_image || undefined,
    }),
    createBreadcrumbSchema([
      { name: 'Blog', url: `${SITE_URL}/blog` },
      { name: categoryLabel, url: `${SITE_URL}/blog?category=${post.category}` },
      { name: post.title, url: `${SITE_URL}/blog/${post.slug}` },
    ]),
  ];

  if (post.faq_pairs && (post.faq_pairs as Array<{ q: string; a: string }>).length > 0) {
    schemas.push(createFAQPageSchema(post.faq_pairs as Array<{ q: string; a: string }>));
  }

  const html = buildHtmlShell({
    title: `${post.title} | Convertra`,
    description: post.meta_description || post.excerpt || '',
    canonical: `${SITE_URL}/blog/${post.slug}`,
    ogType: 'article',
    ogImage: post.featured_image || `${SITE_URL}/og-image.png`,
    schemas,
    body: `<article class="blog-article"><h1>${escapeHtml(post.title)}</h1>${contentHtml}</article>`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

async function prerenderListing(_req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).send('Database not configured');

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, title, excerpt, category, published_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(20);

  const listItems = (posts || [])
    .map((p) => `<li><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a> — ${escapeHtml(p.excerpt || '')}</li>`)
    .join('\n');

  const schemas = [
    createBreadcrumbSchema([{ name: 'Blog', url: `${SITE_URL}/blog` }]),
  ];

  const html = buildHtmlShell({
    title: 'Blog | Convertra — Conversion Intelligence Insights',
    description: 'Expert insights on ad creative automation, conversion optimization, and AI-powered marketing for CMOs and media buyers.',
    canonical: `${SITE_URL}/blog`,
    ogType: 'website',
    schemas,
    body: `<main><h1>Blog</h1><ul>${listItems}</ul></main>`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).send(html);
}

async function prerenderFaq(_req: VercelRequest, res: VercelResponse) {
  if (!supabase) return res.status(500).send('Database not configured');

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('faq_pairs')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .not('faq_pairs', 'eq', '[]');

  const allPairs = (posts || []).flatMap(
    (p) => (p.faq_pairs as Array<{ q: string; a: string }>) || []
  );

  const faqItems = allPairs
    .map((pair) => `<details><summary>${escapeHtml(pair.q)}</summary><p>${escapeHtml(pair.a)}</p></details>`)
    .join('\n');

  const schemas = [
    createFAQPageSchema(allPairs),
    createBreadcrumbSchema([{ name: 'FAQ', url: `${SITE_URL}/faq` }]),
  ];

  const html = buildHtmlShell({
    title: 'FAQ | Convertra — Common Questions About AI Ad Creative',
    description: 'Answers to frequently asked questions about AI ad creative generation, conversion intelligence, and automated ad testing.',
    canonical: `${SITE_URL}/faq`,
    ogType: 'website',
    schemas,
    body: `<main><h1>Frequently Asked Questions</h1>${faqItems}</main>`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}

// ─── Admin Routes ───────────────────────────────────────────────────────────

async function handleAdminCreate(req: VercelRequest, res: VercelResponse) {
  const admin = await authenticateAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { slug, title, meta_description, content, excerpt, category, tags, author, featured_image, read_time_minutes, status, published_at, faq_pairs, schema_type } = req.body;

  if (!slug || !title || !content || !category) {
    return res.status(400).json({ error: 'Missing required fields: slug, title, content, category' });
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      slug, title, meta_description, content, excerpt, category,
      tags: tags || [], author: author || 'Convertra Team', featured_image,
      read_time_minutes: read_time_minutes || Math.ceil(content.split(/\s+/).length / 200),
      status: status || 'draft',
      published_at: published_at || (status === 'published' ? new Date().toISOString() : null),
      faq_pairs: faq_pairs || [], schema_type: schema_type || 'Article',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json(data);
}

async function handleAdminUpdate(req: VercelRequest, res: VercelResponse) {
  const admin = await authenticateAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing post id' });

  const { data, error } = await supabase
    .from('blog_posts')
    .update(req.body)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json(data);
}

async function handleAdminDelete(req: VercelRequest, res: VercelResponse) {
  const admin = await authenticateAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing post id' });

  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ deleted: true });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface HtmlShellOptions {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  ogImage?: string;
  schemas: object[];
  body: string;
}

function buildHtmlShell(opts: HtmlShellOptions): string {
  const schemasJson = opts.schemas
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <link rel="canonical" href="${opts.canonical}" />
  <meta property="og:title" content="${escapeHtml(opts.title)}" />
  <meta property="og:description" content="${escapeHtml(opts.description)}" />
  <meta property="og:type" content="${opts.ogType}" />
  <meta property="og:url" content="${opts.canonical}" />
  <meta property="og:image" content="${opts.ogImage || SITE_URL + '/og-image.png'}" />
  <meta property="og:site_name" content="Convertra" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(opts.title)}" />
  <meta name="twitter:description" content="${escapeHtml(opts.description)}" />
  ${schemasJson}
  ${getAssetTags()}
</head>
<body>
  <div id="root">${opts.body}</div>
</body>
</html>`;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = (req.query.route as string) || '';

  try {
    switch (route) {
      case 'posts':
        return await handlePosts(req, res);
      case 'post':
        return await handlePost(req, res);
      case 'faqs':
        return await handleFaqs(req, res);
      case 'sitemap':
        return await handleSitemap(req, res);
      case 'prerender':
        return await handlePrerender(req, res);
      case 'admin-create':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleAdminCreate(req, res);
      case 'admin-update':
        if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
        return await handleAdminUpdate(req, res);
      case 'admin-delete':
        if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
        return await handleAdminDelete(req, res);
      default:
        return res.status(404).json({ error: 'Unknown route' });
    }
  } catch (error: unknown) {
    console.error(`[Content API] Error (route: ${route}):`, error);
    captureError(error, { route: `content/${route}` });
    await flushSentry();
    return res.status(500).json({ error: 'Internal server error' });
  }
}
