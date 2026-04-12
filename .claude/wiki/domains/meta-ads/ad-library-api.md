---
title: Ad Library API
type: entity
sources: [raw/claude-md.md]
related: [[meta-api-proxy]], [[developer-policy-guard]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Ad Library API

The Ad Library browser (CreativeIQ Step 1) searches Meta's public `ads_archive` endpoint for competitor ad inspiration [source: raw/claude-md.md].

## Identity Verification Required

The Facebook account behind the access token must complete **government ID verification** at facebook.com/ID. Without this, the endpoint returns OAuthException error code 1. Verification may take several days.

## Geographic Limitations

- **EU/UK countries** (GB, DE, FR, etc.): All commercial ads available (1-year archive)
- **All other countries** (US, CA, AU, etc.): Only political/issue ads available
- Default country is `GB` to maximize commercial ad results
- The web interface shows all ads globally, but the **API** has narrower coverage

## Token Requirements

- User access tokens from OAuth work if identity-verified
- System User tokens may not work for Ad Library API
- No App Review or special permissions required — data is public
- `ads_read` permission is NOT required

## Related

- [[meta-api-proxy]] — How Ad Library calls are proxied
- [[developer-policy-guard]] — Rate limiting applies to these calls too
