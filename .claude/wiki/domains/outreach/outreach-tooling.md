---
title: Outreach Tooling
type: entity
sources: [raw/operations-guide.md, raw/skill-email-warmup.md]
related: [[lead-enrichment-pipeline]], [[outreach-workflow]], [[email-warmup]], [[vps-deployment]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Outreach Tooling

The tools powering the Convertra Leads pipeline [source: raw/operations-guide.md].

## Tool Stack

| Tool | Purpose | Pricing |
|------|---------|---------|
| **Apollo** | Primary enrichment — prospect discovery, contact data | 10K credits/month free |
| **Hunter** | Fallback enrichment — email finding | 25 searches/month free |
| **Instantly** | Cold email sending platform — campaigns, warmup | Paid (API key base64-encoded) |
| **Vayne** | LinkedIn Sales Navigator scraping | Optional, $49/mo Starter plan |
| **Gmail** | IMAP inbox monitoring + SMTP sending | Free (App Password required) |
| **GPT-5.2** | Email drafting only (~500 tokens/email) | API cost |
| **Telegram** | Notifications (@convertra_ops_bot) | Free |

## When AI Is Used

**Only for:**
1. Drafting initial personalized emails
2. Drafting responses to positive replies
3. Interpreting ambiguous reply sentiment

Everything else (discovery, enrichment, scoring, sending, follow-ups, inbox monitoring) is deterministic CLI operations.

## Environment Variables

All stored in `/home/ubuntu/convertra-leads/.env` — must stay in sync with local `ops/convertra-leads/.env` (gitignored).

Key vars: `APOLLO_API_KEY`, `HUNTER_API_KEY`, `INSTANTLY_API_KEY`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`

## Related

- [[lead-enrichment-pipeline]] — How Apollo/Hunter are used for enrichment
- [[outreach-workflow]] — How Instantly and Gmail are used for sending
- [[email-warmup]] — Gmail warmup before cold sending
- [[vps-deployment]] — Where these tools run
