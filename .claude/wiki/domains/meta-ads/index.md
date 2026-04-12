---
title: Meta Ads Integration
type: domain-index
sources: [raw/claude-md.md]
related: [[architecture]], [[ai-integration]], [[multi-tenant-credentials]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Meta Ads Integration

Everything Meta Marketing API: proxy architecture, ad publishing, rate limits, developer policy guard, Ad Library, OAuth, and App Review.

Last updated: 2026-04-12

## Pages

- [[meta-api-proxy]] — Backend proxy architecture, metaProxy() helper, credential resolution
- [[ad-publishing]] — Campaign/ad set/ad creation, critical parameters, encoding rules
- [[developer-policy-guard]] — Rate limiting, request queue, response cache, error classification
- [[ad-library-api]] — ads_archive endpoint, identity verification, geographic limitations
- [[facebook-login-for-business]] — FLB OAuth configuration, config_id vs scope, callback flow
- [[meta-app-review]] — Permissions, submission process, description templates, troubleshooting

## Sources

- [[source-claude-md]] — Master CLAUDE.md technical reference
