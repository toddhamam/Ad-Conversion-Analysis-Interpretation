---
title: API Architecture
type: concept
sources: [raw/claude-md.md]
related: [[tech-stack]], [[jwt-auth-and-tenant-isolation]], [[vercel-deployment]], [[meta-api-proxy]], [[content-hub-api]], [[billing-consolidation]]
created: 2026-04-12
updated: 2026-04-13
confidence: high
---

# API Architecture

All backend logic runs as Vercel serverless functions in the `api/` directory. The critical constraint is Vercel Hobby's **12 serverless function limit** — the project is currently at **11/12** after [[billing-consolidation]] merged `checkout.ts` and `portal.ts` into `subscription.ts`, and [[content-hub-api]] was added as the 11th function.

## Catch-All Handler Pattern

Multi-route handlers use a single serverless function with `route` query param dispatching. Vercel rewrites map friendly URLs to query params:

```json
{ "source": "/api/meta/:path(.*)", "destination": "/api/meta?route=:path" }
```

This consolidation is **required** to stay within the 12-function limit.

## Current Function Inventory (11/12)

1. `api/admin/credentials.ts` — Admin credential management
2. `api/auth/meta/callback.ts` — Meta OAuth callback
3. `api/auth/meta/connect.ts` — Meta OAuth initiation
4. `api/billing/subscription.ts` — Consolidated billing catch-all: checkout, portal, usage (see [[billing-consolidation]])
5. `api/billing/webhook.ts` — Stripe webhook handler (separate — needs raw body for signature verification)
6. `api/content.ts` — Content hub catch-all: blog posts, FAQs, sitemap, prerender, admin CRUD (see [[content-hub-api]])
7. `api/funnel/active-sessions.ts` — Active funnel sessions
8. `api/funnel/metrics.ts` — Funnel metrics
9. `api/google-auth.ts` — Google OAuth tokens
10. `api/meta.ts` — Meta API catch-all (proxy, status, upload, insights, campaigns)
11. `api/seoiq.ts` — SEO IQ catch-all (sites, keywords, articles, autopilot)

**Files in `api/_lib/` are shared helpers, NOT serverless functions.**

## Adding New Routes

One slot remains (11/12). If needed, add routes to existing catch-all handlers (`api/meta.ts`, `api/seoiq.ts`, `api/content.ts`, `api/billing/subscription.ts`). The deployment will fail if you exceed 12 functions.

## Authentication Pattern

All multi-tenant routes use [[jwt-auth-and-tenant-isolation]]. Organization ID is derived from the authenticated user's JWT — never trusted from client input.

## Shared Helpers (`api/_lib/`)

| File | Purpose |
|------|---------|
| `sentry.ts` | `initSentry()`, `captureError()`, `flushSentry()` shared across all routes |
| `encryption.ts` | AES-256-GCM encryption for Meta access tokens |
| `google-auth.ts` | Per-site Google OAuth token management for GSC |
| `google-ads.ts` | Google Ads Keyword Planner API client |
| `seo-prompts.ts` | SEO article generation prompts and keyword scoring |
| `schema-builders.ts` | Pure JSON-LD builders for Article, FAQPage, HowTo, BreadcrumbList structured data |
| `markdown.ts` | Server-side markdown-to-HTML via `marked` (no DOMPurify — crashes serverless) |

## Related

- [[jwt-auth-and-tenant-isolation]] — How routes authenticate
- [[vercel-deployment]] — Hosting constraints
- [[meta-api-proxy]] — How the Meta catch-all works
- [[content-hub-api]] — Blog/FAQ/sitemap catch-all handler
- [[billing-consolidation]] — How billing was merged to free a function slot
