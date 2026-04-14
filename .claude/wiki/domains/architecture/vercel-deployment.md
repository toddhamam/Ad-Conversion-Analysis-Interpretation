---
title: Vercel Deployment
type: entity
sources: [raw/claude-md.md]
related: [[api-architecture]], [[tech-stack]], [[environment-variables]], [[ci-auto-fix]], [[content-hub-api]]
created: 2026-04-12
updated: 2026-04-13
confidence: high
---

# Vercel Deployment

Conversion Intelligence is a SPA deployed on Vercel. The catch-all rewrite `/(.*) → /index.html` must be **last** in `vercel.json` to enable client-side routing for deep links and page refreshes [source: raw/claude-md.md].

## Serverless Function Limit

**Critical**: Vercel Hobby plan allows max **12 serverless functions**. Currently at **11/12** after [[billing-consolidation]] freed 2 slots and [[content-hub-api]] used 1. One slot remains.

## Rewrites

Key rewrites (order matters — SPA catch-all must be last):

```json
{ "source": "/api/seo-iq/:path(.*)", "destination": "/api/seoiq?route=:path" },
{ "source": "/api/meta/:path(.*)", "destination": "/api/meta?route=:path" },
{ "source": "/api/billing/checkout", "destination": "/api/billing/subscription?route=checkout" },
{ "source": "/api/billing/portal", "destination": "/api/billing/subscription?route=portal" },
{ "source": "/api/content/:path(.*)", "destination": "/api/content?route=:path" },
{ "source": "/sitemap.xml", "destination": "/api/content?route=sitemap" },
{ "source": "/blog/:slug", "destination": "/api/content?route=prerender&type=post&slug=:slug" },
{ "source": "/blog", "destination": "/api/content?route=prerender&type=listing" },
{ "source": "/faq", "destination": "/api/content?route=prerender&type=faq" },
{ "source": "/(.*)", "destination": "/index.html" }
```

The `/blog`, `/blog/:slug`, and `/faq` rewrites serve **prerendered HTML** for crawlers (see [[content-hub-api]]). Browsers with JS get the SPA React version via the catch-all.

## Dev Commands

```bash
npm run dev    # Start dev server (port 5175)
npm run build  # TypeScript check + Vite build
npm run lint   # ESLint with TypeScript rules
```

## Vite Build Manifest

`vite.config.ts` has `build.manifest: true` to generate `dist/.vite/manifest.json`. The [[content-hub-api]] prerender function reads `dist/index.html` at cold start to extract hashed CSS/JS asset tags for the HTML shell.

## Related

- [[api-architecture]] — 11-function constraint details
- [[content-hub-api]] — Blog/FAQ prerender using build manifest
- [[billing-consolidation]] — How function slots were freed
- [[environment-variables]] — Required Vercel env vars
- [[ci-auto-fix]] — Automated deployment failure remediation
