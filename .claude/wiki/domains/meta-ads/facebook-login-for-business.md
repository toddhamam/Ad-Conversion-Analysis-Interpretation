---
title: Facebook Login for Business
type: concept
sources: [raw/claude-md.md]
related: [[multi-tenant-credentials]], [[meta-app-review]], [[meta-api-proxy]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Facebook Login for Business

The app uses **Facebook Login for Business (FLB)**, not standard Facebook Login. FLB uses `config_id` instead of `scope` — permissions are defined in a Configuration object in the Meta App Dashboard [source: raw/claude-md.md].

## Key Difference

- **Standard**: `scope=ads_management,ads_read,...` in OAuth URL
- **FLB**: `config_id=<id>` in OAuth URL — permissions come from the configuration

## OAuth URL Parameters

- `client_id` — Meta App ID
- `config_id` — FLB configuration ID (replaces `scope`)
- `response_type=code` — server-side authorization code flow
- `override_default_response_type=true` — required for server-side flow with FLB
- `redirect_uri` + `state` — standard OAuth

## Required Permissions (in FLB config)

`ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_show_list`

**Critical**: `public_profile` must have **Advanced Access** in App Review or external users are blocked.

## Creating the Configuration

Meta App Dashboard → Facebook Login for Business → Configurations → Create:
- Login variation: "General"
- Token type: "User access token"
- Select all required permissions → Save → Copy `config_id`
- Set `META_CONFIG_ID=<config_id>` in Vercel env vars

## Related

- [[multi-tenant-credentials]] — What happens after OAuth succeeds
- [[meta-app-review]] — Getting permissions approved for external users
