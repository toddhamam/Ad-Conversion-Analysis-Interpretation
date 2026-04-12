---
title: JWT Auth & Tenant Isolation
type: concept
sources: [raw/claude-md.md]
related: [[api-architecture]], [[supabase-integration]], [[multi-tenant-credentials]], [[checkout-flow]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# JWT Auth & Tenant Isolation

All multi-tenant API routes enforce JWT authentication and derive the organization ID from the user's profile — never from client-provided input [source: raw/claude-md.md].

## Authentication Flow

```
Request → Bearer token in Authorization header
       → supabase.auth.getUser(token)
       → users table lookup by auth_id
       → Return { userId, organizationId, authUserId }
```

Returns `401 Unauthorized` for missing/invalid tokens, `403 Forbidden` for ownership failures.

## Tenant Isolation Rules

- **Never trust client-provided `organizationId`** — always derive from JWT
- **Verify resource ownership** before any read/write on tenant-scoped resources
- Return `403 Forbidden` for ownership failures
- `is_super_admin` defaults to `false`, never `true`

## Security Rules for Logging

- **Never log API tokens, keys, or secrets** — not even partially
- Wrap diagnostic logging in `if (import.meta.env.DEV)` for frontend
- **Never log Bearer tokens** in serverless functions

## Used By

All `api/seoiq.ts`, `api/meta.ts`, `api/billing/checkout.ts`, and `api/billing/portal.ts` routes follow this pattern. New API routes must follow it too.

## Related

- [[api-architecture]] — Where authentication is enforced
- [[supabase-integration]] — Database backing the auth system
- [[multi-tenant-credentials]] — How per-org credentials are stored and resolved
- [[checkout-flow]] — JWT auth in billing context
