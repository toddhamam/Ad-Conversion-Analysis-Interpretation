---
title: Daily Health Monitor
type: entity
sources: [raw/claude-md.md]
related: [[sentry-monitoring]], [[vercel-deployment]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Daily Health Monitor

`daily-health-monitor.yml` — pure bash script (no Claude SDK). Runs daily at 7am UTC [source: raw/claude-md.md].

## 5 Checks

1. **Production site** (`convertraiq.com`) — HTTP 200 check
2. **Supabase** — REST API reachability
3. **Sentry** — New unresolved errors in last 24h (0=pass, 1-3=warn, 4+=fail)
4. **Client credentials** — Expired Meta tokens in `organization_credentials`
5. **Stripe** — API reachability

Posts formatted report to Telegram (`chat_id=-1003806442463`, `message_thread_id=145`).

## Related

- [[sentry-monitoring]] — Error count check
- [[vercel-deployment]] — Production site being monitored
