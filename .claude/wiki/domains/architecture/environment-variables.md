---
title: Environment Variables
type: entity
sources: [raw/claude-md.md]
related: [[tech-stack]], [[vercel-deployment]], [[supabase-integration]], [[checkout-flow]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Environment Variables

Frontend vars require `VITE_` prefix (browser-accessible). Backend vars use `process.env` (serverless only). Both must be set separately in Vercel [source: raw/claude-md.md].

## Critical Pitfalls

- **URL vars must include `https://`** — Missing protocol crashes the app at runtime
- **`SUPABASE_URL` ≠ `VITE_SUPABASE_URL`** — Both must be set separately. Missing `SUPABASE_URL` causes backend queries to silently return empty data
- **`VITE_META_*` vars are dev-mode fallbacks** — Only used when Supabase auth is not configured

## Frontend (VITE_ prefix)

Key vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_APP_URL`, `VITE_SENTRY_DSN`, `VITE_META_*` (dev fallbacks)

## Backend (Vercel serverless)

Key vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `ENCRYPTION_KEY`, `META_CONFIG_ID`, `SENTRY_DSN`, `GOOGLE_*`

## Related

- [[vercel-deployment]] — Where env vars are configured
- [[supabase-integration]] — Dual URL requirement
- [[checkout-flow]] — Stripe env vars
