---
title: Meta API Proxy
type: concept
sources: [raw/claude-md.md]
related: [[multi-tenant-credentials]], [[developer-policy-guard]], [[api-architecture]], [[ad-publishing]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Meta API Proxy

All Meta Graph API calls route through `api/meta.ts` — access tokens are decrypted server-side and **never sent to the browser**. Frontend uses `metaProxy()` helper which calls `/api/meta/proxy` with JWT auth [source: raw/claude-md.md].

## Proxy Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `proxy` | POST | General-purpose Meta Graph API proxy |
| `status` | GET | Non-sensitive credential status (connected, IDs, expiry) |
| `upload` | POST | Image upload proxy for `adimages` endpoint |
| `insights` | GET/POST | Legacy insights proxy (backwards compat) |
| `campaigns` | GET | Legacy campaigns proxy (backwards compat) |

## Frontend Helper

```typescript
async function metaProxy(endpoint, options?) {
  const token = await getAuthToken();
  const res = await fetch('/api/meta/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, endpoint, params, body, formEncoded }),
  });
}
```

**Dev mode fallback**: When no auth token is available, `metaApi.ts` falls back to `VITE_META_*` env vars for local development.

## Critical Rules

- **All ~20 Meta functions** in `metaApi.ts` go through `metaProxy()` — no direct Meta API calls
- Graph API version: **v24.0**
- All requests must go through [[developer-policy-guard]] queue
- Backend forwards `X-App-Usage` headers to frontend for rate limit tracking

## Related

- [[multi-tenant-credentials]] — How the proxy resolves per-org credentials
- [[developer-policy-guard]] — Rate limiting layer
- [[ad-publishing]] — How the proxy is used for write operations
