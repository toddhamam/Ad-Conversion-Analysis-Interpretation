---
title: Sentry Error Monitoring
type: entity
sources: [raw/claude-md.md]
related: [[pr-review-workflow]], [[vercel-deployment]], [[tech-stack]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Sentry Error Monitoring

Captures errors from both frontend (React) and backend (Vercel serverless) into a single project. Tagged with `organization_id` and `plan_tier` for tenant filtering [source: raw/claude-md.md].

## Frontend (`src/instrument.ts`)

- Runs as first import in `main.tsx`
- **Production only** (`enabled: import.meta.env.PROD`)
- Browser tracing at 10%, session replay on 100% of error sessions
- React 19 error handlers: `onUncaughtError`, `onCaughtError`, `onRecoverableError`
- Source maps uploaded via `@sentry/vite-plugin` (deleted after upload)

## Backend (`api/_lib/sentry.ts`)

All 12 API routes follow:
```typescript
import { initSentry, captureError, flushSentry } from './_lib/sentry.js';
initSentry(); // Module-level, once per cold start
// In catch: captureError(err, { route, organizationId });
// Before response: await flushSentry(); // CRITICAL for serverless
```

## Sentry MCP + `/sentry` Command

Sentry MCP server (OAuth at `https://mcp.sentry.dev/mcp`) allows Claude to query issues directly. `/sentry` command auto-pulls unresolved issues, reads traces, generates fixes.

## Related

- [[pr-review-workflow]] — Sentry auto-triage workflow
- [[vercel-deployment]] — Where serverless functions run
