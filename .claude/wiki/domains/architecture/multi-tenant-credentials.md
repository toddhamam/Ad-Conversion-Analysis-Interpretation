---
title: Multi-Tenant Credentials
type: concept
sources: [raw/claude-md.md]
related: [[jwt-auth-and-tenant-isolation]], [[supabase-integration]], [[meta-api-proxy]], [[facebook-login-for-business]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Multi-Tenant Credentials

Each organization has its own Meta credentials stored encrypted (AES-256-GCM) in `organization_credentials`. Access tokens **never reach the browser** — all Meta API calls are proxied through the backend [source: raw/claude-md.md].

## Credential Flow

```
Admin enters credentials (OAuth or manual)
  → POST /api/admin/credentials/validate (tests against Meta API)
  → POST /api/admin/credentials/save (encrypts, stores)
  → Status: active

Client uses app
  → Frontend calls metaProxy() → POST /api/meta/proxy with JWT
  → Backend: JWT → user → org_id → load encrypted creds → decrypt → Meta API
  → Response returned (token never exposed)
```

## `organization_credentials` Table

| Column | Type | Purpose |
|--------|------|---------|
| `access_token_encrypted` | TEXT | AES-256-GCM encrypted token |
| `ad_account_id` | TEXT | Format: `act_XXXXXXXXX` |
| `page_id` | TEXT | Facebook Page ID |
| `pixel_id` | TEXT | Meta Pixel ID (required) |
| `status` | TEXT | active, expired, invalid, not_connected |
| `token_expires_at` | TIMESTAMPTZ | Token expiration date |

## Frontend Credential State

Module-level cache in `metaApi.ts` (loaded once from `/api/meta/status`):

```typescript
let _orgMeta = { connected, adAccountId, pageId, pixelId };
// Initialized by loadOrgMetaCredentials() from OrganizationContext
```

## Onboarding Checklist

`OnboardingChecklist.tsx` shows a dismissible card when `organization.setup_completed === false`. Sidebar shows connection status dot: green (active), amber (expired), gray (not connected).

## Related

- [[meta-api-proxy]] — How the proxy uses these credentials
- [[facebook-login-for-business]] — OAuth flow for connecting accounts
- [[jwt-auth-and-tenant-isolation]] — How org is resolved from JWT
