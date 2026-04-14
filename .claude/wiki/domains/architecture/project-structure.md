---
title: Project Structure
type: entity
sources: [raw/claude-md.md]
related: [[tech-stack]], [[api-architecture]], [[content-hub-api]], [[content-hub-frontend]]
created: 2026-04-12
updated: 2026-04-13
confidence: high
---

# Project Structure

```
src/
├── pages/           # Route-level components
│   └── blog/        # Content hub: BlogHub, BlogPost, FAQPage, Blog.css
├── components/      # Reusable UI
├── services/        # API integrations (metaApi, openaiApi, stripeApi, contentApi, imageCache)
├── lib/             # Shared utilities (supabase, authToken)
├── contexts/        # React contexts (Auth, Organization, AdAccount)
├── remotion/        # VSL video composition
├── types/           # TypeScript interfaces
└── data/            # Mock data for development

api/
├── _lib/            # Shared helpers (encryption, google-auth, sentry, schema-builders, markdown) — NOT serverless functions
├── admin/           # Admin-only routes
├── auth/            # OAuth flows
├── billing/         # Stripe routes (subscription.ts catch-all + webhook.ts)
├── funnel/          # Funnel metrics
├── content.ts       # Content hub catch-all (blog, FAQ, sitemap, prerender, admin)
├── meta.ts          # Meta API catch-all proxy
├── seoiq.ts         # SEO IQ catch-all
└── google-auth.ts   # Google OAuth tokens
```

## Route Map

**Public**: `/` (sales landing), `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/blog` (hub), `/blog/:slug` (article), `/faq`

**Protected**: `/dashboard`, `/channels`, `/channels/meta-ads`, `/creatives`, `/publish`, `/products`, `/insights`, `/seo-iq`, `/integrations`, `/billing`, `/account`

## Architecture Decisions

- No global state — components fetch their own data, cache in localStorage
- Service layer abstraction — all API calls through `src/services/`
- Frontend/backend separation — sensitive ops handled by serverless functions
- `MainLayout.tsx` `<Outlet />` must NOT have `key={location.pathname}` — causes full remounts

## Related

- [[tech-stack]] — Technologies powering this structure
- [[api-architecture]] — Backend function organization
- [[content-hub-api]] — Content hub backend architecture
- [[content-hub-frontend]] — Blog/FAQ React pages
