---
title: API Architecture
type: concept
sources: [raw/claude-md.md]
related: [[tech-stack]], [[jwt-auth-and-tenant-isolation]], [[vercel-deployment]], [[meta-api-proxy]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# API Architecture

All backend logic runs as Vercel serverless functions in the `api/` directory. The critical constraint is Vercel Hobby's **12 serverless function limit** — the project is currently at exactly 12/12 [source: raw/claude-md.md].

## Catch-All Handler Pattern

Multi-route handlers use a single serverless function with `route` query param dispatching. Vercel rewrites map friendly URLs to query params:

```json
{ "source": "/api/meta/:path(.*)", "destination": "/api/meta?route=:path" }
```

This consolidation is **required** to stay within the 12-function limit.

## Current Function Inventory (12/12)

1. `api/admin/credentials.ts` — Admin credential management
2. `api/auth/meta/callback.ts` — Meta OAuth callback
3. `api/auth/meta/connect.ts` — Meta OAuth initiation
4. `api/billing/checkout.ts` — Stripe checkout (JWT-authenticated)
5. `api/billing/portal.ts` — Stripe customer portal
6. `api/billing/subscription.ts` — Subscription status lookup
7. `api/billing/webhook.ts` — Stripe webhook handler
8. `api/funnel/active-sessions.ts` — Active funnel sessions
9. `api/funnel/metrics.ts` — Funnel metrics
10. `api/google-auth.ts` — Google OAuth tokens
11. `api/meta.ts` — Meta API catch-all (proxy, status, upload, insights, campaigns)
12. `api/seoiq.ts` — SEO IQ catch-all (sites, keywords, articles, autopilot)

**Files in `api/_lib/` are shared helpers, NOT serverless functions.**

## Adding New Routes

Never create new `api/*.ts` files. Instead, add routes to existing catch-all handlers (`api/meta.ts` or `api/seoiq.ts`). The deployment will fail if you exceed 12 functions.

## Authentication Pattern

All multi-tenant routes use [[jwt-auth-and-tenant-isolation]]. Organization ID is derived from the authenticated user's JWT — never trusted from client input.

## Related

- [[jwt-auth-and-tenant-isolation]] — How routes authenticate
- [[vercel-deployment]] — Hosting constraints
- [[meta-api-proxy]] — How the Meta catch-all works
