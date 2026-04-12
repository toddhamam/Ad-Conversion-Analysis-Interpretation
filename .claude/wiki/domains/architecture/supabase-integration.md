---
title: Supabase Integration
type: entity
sources: [raw/claude-md.md]
related: [[jwt-auth-and-tenant-isolation]], [[multi-tenant-credentials]], [[environment-variables]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Supabase Integration

Supabase provides **auth, database, and real-time** capabilities. The frontend uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; serverless functions use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` [source: raw/claude-md.md].

## Serverless Client Pattern

```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

## PostgREST Schema Cache Gotcha

After DDL migrations (CREATE TABLE, ALTER TABLE), PostgREST may not see new tables/columns immediately. Run `NOTIFY pgrst, 'reload schema';` in the SQL Editor to force a cache refresh. Without this, queries fail with "Could not find the table in the schema cache."

## Key Tables

- `organizations` — Plan tier, subscription status, current_period_end
- `organization_credentials` — Encrypted Meta credentials per org
- `users` — Auth ID, org ID, role, super admin flag
- `funnel_events` — Written by external system, read-only in this codebase
- `seo_sites`, `seo_keywords`, `seo_articles` — SEO IQ data

## Auth Flow

- Frontend uses `supabase.auth` for login/signup/password reset
- Backend validates tokens via `supabase.auth.getUser(token)` — see [[jwt-auth-and-tenant-isolation]]
- `src/lib/authToken.ts` provides session access token helper

## Related

- [[jwt-auth-and-tenant-isolation]] — How Supabase auth integrates with API routes
- [[multi-tenant-credentials]] — Credential storage in Supabase
- [[environment-variables]] — Both `SUPABASE_URL` and `VITE_SUPABASE_URL` must be set
