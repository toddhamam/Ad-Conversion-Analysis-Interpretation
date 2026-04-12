---
title: Vercel Deployment
type: entity
sources: [raw/claude-md.md]
related: [[api-architecture]], [[tech-stack]], [[environment-variables]], [[ci-auto-fix]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Vercel Deployment

Conversion Intelligence is a SPA deployed on Vercel. The catch-all rewrite `/(.*) → /index.html` must be **last** in `vercel.json` to enable client-side routing for deep links and page refreshes [source: raw/claude-md.md].

## Serverless Function Limit

**Critical**: Vercel Hobby plan allows max **12 serverless functions**. Currently at 12/12. Adding new `api/*.ts` files will fail deployment. Consolidate into existing catch-all handlers.

## Rewrites

```json
{ "source": "/api/seo-iq/:path(.*)", "destination": "/api/seoiq?route=:path" },
{ "source": "/api/meta/:path(.*)", "destination": "/api/meta?route=:path" },
{ "source": "/(.*)", "destination": "/index.html" }
```

## Dev Commands

```bash
npm run dev    # Start dev server (port 5175)
npm run build  # TypeScript check + Vite build
npm run lint   # ESLint with TypeScript rules
```

## Related

- [[api-architecture]] — 12-function constraint details
- [[environment-variables]] — Required Vercel env vars
- [[ci-auto-fix]] — Automated deployment failure remediation
