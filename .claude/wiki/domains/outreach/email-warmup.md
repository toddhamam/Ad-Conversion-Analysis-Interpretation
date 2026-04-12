---
title: Email Warmup
type: concept
sources: [raw/skill-email-warmup.md]
related: [[outreach-workflow]], [[outreach-tooling]], [[cold-email-strategy]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Email Warmup

Gmail account warmup strategy to build sender reputation before cold outreach. CLI tracks warmup week and enforces limits automatically [source: raw/skill-email-warmup.md].

## Warmup Schedule

| Week | Daily Limit | Activities |
|------|-------------|------------|
| 1 | 5/day | Known contacts, get replies, subscribe to newsletters |
| 2 | 10/day | Mix of warm + a few new conversations |
| 3 | 20/day | Light outreach to people you've met |
| 4 | 20/day | 10 warm + 10 cold outreach |
| 5+ | 40/day | Steady state — mix of warm and cold |

**Maximum**: 50 emails/day regardless of warmup stage.

## Technical Setup Checklist

1. **SPF Record**: `v=spf1 include:_spf.google.com ~all`
2. **DKIM**: Enable in Google Workspace Admin Console
3. **DMARC**: `_dmarc.yourdomain.com TXT "v=DMARC1; p=none"`
4. **2-Step Verification**: Required for App Password
5. **IMAP Enabled**: Gmail Settings > Enable IMAP
6. **Profile Picture**: Upload a real photo
7. **Email Signature**: Name, title, company, one link

## Red Flags — Stop Immediately

- Bounce rate exceeds 5%
- Reply rate drops below 1% after 50+ sends
- Gmail account suspension warning
- Multiple spam complaints

**Recovery**: Stop all cold outreach → send only to known contacts for 2 weeks → gradually reintroduce cold.

## Related

- [[outreach-workflow]] — Warmup gates the send phase
- [[outreach-tooling]] — Gmail/Instantly integration
