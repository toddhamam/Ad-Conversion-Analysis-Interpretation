---
title: Developer Policy Guard
type: entity
sources: [raw/claude-md.md]
related: [[meta-api-proxy]], [[ad-publishing]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Developer Policy Guard

`metaDevPolicyGuard.ts` wraps all Meta API calls to prevent rate limit violations and account bans [source: raw/claude-md.md].

## Enforcement Layers

1. **Request queue** — max 3 concurrent Meta requests with 200ms inter-request delay
2. **Response cache** — in-memory TTL (insights 5min, campaigns 5min, pixels 30min)
3. **Rate limit header monitoring** — parses `X-App-Usage`, `X-Business-Use-Case-Usage`
4. **Error classification** — maps Meta error codes to wait/retry/auth/fatal
5. **Batch processing** — `batchProcess()` replaces unbounded `Promise.all()` (concurrency ≤ 5)
6. **Usage tracking** — warns at 80% capacity, pauses at 95%

## Rate Limit Error Codes

| Code | Meaning | Backoff |
|------|---------|---------|
| 4 | App-level rate limit | 60s |
| 17 | User-level rate limit | 60s |
| 80000 | Ads Insights throttled | 5 min |
| 80004 | Ads Management throttled | 5 min |
| 80003 | Too many calls to ad account | 2 min |
| 2 | Transient server error | Exponential backoff |

## Critical Rules

- **Never use unbounded `Promise.all()`** for Meta API calls — triggers bot detection
- **All requests must go through `guardedFetch()`** — direct `fetch()` to Meta is prohibited
- **Write operations invalidate cache** — `createCampaign`, `createAdSet`, `createAdWithCreative`
- **Always cache read responses** — prevent redundant calls on page navigation

## Related

- [[meta-api-proxy]] — The proxy that sits above this guard
- [[ad-publishing]] — Write operations that invalidate cache
