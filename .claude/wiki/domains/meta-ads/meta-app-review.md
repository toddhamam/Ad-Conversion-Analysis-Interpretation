---
title: Meta App Review
type: concept
sources: [raw/claude-md.md]
related: [[facebook-login-for-business]], [[multi-tenant-credentials]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Meta App Review

All 5 OAuth permissions require **Advanced Access** via App Review for external users. "Published" app status and individual permission access levels are independent [source: raw/claude-md.md].

## Submission History

- **2026-02-12**: Initial submission rejected — screencast showed "Reconnect" instead of first-time consent
- **2026-02-18**: Resubmission with fresh first-time OAuth flow — all 5 permissions approved
- **2026-02-27**: App fully live — external users verified working

## Key Lesson: Screen Recording

Before recording, **revoke the app's authorization** at `facebook.com/settings?tab=applications` so Facebook shows the full first-time consent screen (not "Reconnect"). Use incognito window.

## Prerequisites (Settings → Basic)

Privacy Policy URL, Terms of Service URL, Data Deletion URL, App Icon, Category, Business Verification (green dot), Data Use Checkup (green dot)

## Data Processors

Google LLC, OpenAI LLC, Supabase Inc., Vercel — each has access to Meta Platform Data for specific purposes documented in the submission.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Feature unavailable" on login | Scopes at "Ready for testing" | Submit for App Review |
| "Ready for testing" after approval | Only submitted subset of permissions | Submit missing ones |
| App published but users blocked | Per-permission access independent of publish | Check each permission individually |

## Related

- [[facebook-login-for-business]] — The OAuth flow these permissions enable
- [[multi-tenant-credentials]] — Credential storage after successful OAuth
