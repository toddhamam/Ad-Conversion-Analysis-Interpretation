---
title: Content Hub API
type: concept
sources: []
related: [[api-architecture]], [[vercel-deployment]], [[seo-geo-strategy]], [[content-hub-frontend]], [[supabase-integration]], [[jwt-auth-and-tenant-isolation]]
created: 2026-04-13
updated: 2026-04-13
confidence: high
---

# Content Hub API

The **Content Hub** is a GEO/SEO blog, FAQ, and content system powered by `api/content.ts` — a catch-all serverless function that serves public JSON endpoints, server-rendered prerender pages, and admin CRUD routes. It was added as the 11th of 12 Vercel serverless functions (slot freed by [[billing-consolidation]]).

## Route Dispatch

Like [[api-architecture]]'s other catch-all handlers (`api/meta.ts`, `api/seoiq.ts`), the content API uses `route` query param dispatching. Vercel rewrites in `vercel.json` map friendly URLs:

```json
{ "source": "/api/content/:path(.*)", "destination": "/api/content?route=:path" }
{ "source": "/sitemap.xml", "destination": "/api/content?route=sitemap" }
{ "source": "/blog/:slug", "destination": "/api/content?route=prerender&type=post&slug=:slug" }
{ "source": "/blog", "destination": "/api/content?route=prerender&type=listing" }
{ "source": "/faq", "destination": "/api/content?route=prerender&type=faq" }
```

## Route Inventory

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `posts` | GET | Public | Paginated post listings with category filter |
| `post` | GET | Public | Single post by slug |
| `faqs` | GET | Public | All FAQ pairs aggregated from posts' `faq_pairs` |
| `sitemap` | GET | Public | Dynamic XML sitemap (replaces static `sitemap.xml`) |
| `prerender` | GET | Public | Server-rendered HTML for `/blog`, `/blog/:slug`, `/faq` |
| `admin-create` | POST | Super admin | Create blog post |
| `admin-update` | PUT | Super admin | Update blog post by ID |
| `admin-delete` | DELETE | Super admin | Delete blog post by ID |

## Prerender Strategy

The prerender routes serve **full HTML pages** for search engine crawlers and AI bots (critical for GEO — see [[seo-geo-strategy]]). This ensures `/blog`, `/blog/:slug`, and `/faq` have crawlable HTML with JSON-LD structured data, even though the SPA would normally serve an empty `index.html` shell.

### Asset Resolution

At cold start, the prerender function reads `dist/index.html` from the Vite build output to extract hashed CSS and JS asset tags. This requires `build.manifest: true` in `vite.config.ts`. The extracted tags are cached in a module-level variable (`_assetTags`) for the lifetime of the function instance.

Fallback for dev mode (where `dist/` doesn't exist): injects `<script type="module" src="/src/main.tsx"></script>`.

### JSON-LD Structured Data

Prerendered pages include rich schema markup via `api/_lib/schema-builders.ts` (pure functions, no React dependencies):

| Builder | Schema Type | Used On |
|---------|-------------|---------|
| `createArticleSchema()` | Article | Blog post pages |
| `createFAQPageSchema()` | FAQPage | FAQ page, posts with `faq_pairs` |
| `createHowToSchema()` | HowTo | Guide/how-to posts |
| `createBreadcrumbSchema()` | BreadcrumbList | All prerendered pages |

### Markdown Rendering (Server-side)

`api/_lib/markdown.ts` converts markdown to HTML using the `marked` library. **isomorphic-dompurify was intentionally removed** because it depends on jsdom, which crashes in Vercel's serverless environment (native binary dependencies). Since blog content is admin-authored only (not user-generated), full DOM purification is unnecessary.

## Database: `blog_posts` Table

Migration: `supabase/migrations/021_blog_posts.sql`

| Column | Type | Notes |
|--------|------|-------|
| `slug` | TEXT UNIQUE | Validated: `^[a-z0-9][a-z0-9-]*[a-z0-9]$` |
| `title` | TEXT | Required |
| `content` | TEXT | Markdown body |
| `category` | TEXT | `faq`, `comparison`, `guide`, `listicle`, `case-study` |
| `faq_pairs` | JSONB | Array of `{q, a}` — aggregated for FAQ page |
| `schema_type` | TEXT | `Article`, `FAQPage`, `HowTo` |
| `status` | TEXT | `draft`, `published`, `archived` |
| `published_at` | TIMESTAMPTZ | Scheduled publishing support |

**RLS Policy**: Public reads published posts where `published_at <= now()`. Service role bypasses RLS for admin writes.

**Auto-updated_at trigger**: `blog_posts_updated_at` trigger updates `updated_at` column on every row change.

## Caching Strategy

| Route | Cache-Control |
|-------|--------------|
| Posts listing | `s-maxage=300, stale-while-revalidate=600` (5min) |
| Single post | `s-maxage=3600, stale-while-revalidate=86400` (1hr) |
| FAQs | `s-maxage=3600, stale-while-revalidate=86400` (1hr) |
| Sitemap | `s-maxage=3600, stale-while-revalidate=86400` (1hr) |
| Prerender listing | `s-maxage=300, stale-while-revalidate=600` (5min) |
| Prerender post | `s-maxage=3600, stale-while-revalidate=86400` (1hr) |
| Prerender FAQ | `s-maxage=3600, stale-while-revalidate=86400` (1hr) |

## Dynamic Sitemap

The static `public/sitemap.xml` was deleted and replaced by a dynamic sitemap generated by the `sitemap` route. It includes:

- Static pages: `/`, `/for-agencies`, `/blog`, `/faq`, `/login`, `/signup`
- Dynamic pages: all published blog posts at `/blog/:slug`
- Vercel rewrite: `/sitemap.xml` -> `api/content?route=sitemap`

Protected app URLs (e.g., `/dashboard`, `/channels`) are **not** included — they require auth and should not be indexed.

## Related

- [[api-architecture]] — Catch-all pattern and serverless function inventory
- [[vercel-deployment]] — Rewrite configuration
- [[seo-geo-strategy]] — Why prerendering matters for GEO
- [[content-hub-frontend]] — React frontend pages (BlogHub, BlogPost, FAQPage)
- [[billing-consolidation]] — How the function slot was freed
- [[supabase-integration]] — Database layer
