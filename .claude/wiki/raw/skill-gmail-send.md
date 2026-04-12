---
name: gmail-send
description: Send emails via Gmail SMTP with warmup enforcement and daily limits.
user-invocable: true
metadata: {"openclaw":{"emoji":"📤","requires":{"bins":["python3"],"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]},"primaryEnv":"GMAIL_APP_PASSWORD"}}
---

# Gmail Send — SMTP Email Sending

Send emails using the Convertra Leads CLI. Handles SMTP connection, warmup limits, daily send tracking, and pipeline updates automatically.

## Commands

### Send a Single Email

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py mail send --to "jane@acme.com" --subject "quick question about Acme" --body "Hey Jane, ..."
```

The CLI automatically:
- Checks daily send limits (warmup enforcement)
- Appends the configured signature
- Increments the daily send counter
- Returns JSON with send status and timestamp

### Send Batch to Pipeline Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py mail batch --pipeline-filter "stage=ready_to_send" --limit 20 --delay 45
```

Sends to all prospects in the specified stage. Automatically:
- Enforces warmup limits (stops when daily limit hit)
- Adds 45-second delay between sends
- Updates each prospect's stage to `email_1_sent`
- Logs interactions in pipeline.json

### Check Daily Send Status

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py mail daily-status
```

Returns: `sent_today`, `limit`, `remaining`, `warmup_week`, `start_date`.

## Warmup Schedule

| Week | Daily Limit |
|------|-------------|
| 1 | 5 |
| 2 | 10 |
| 3 | 20 |
| 4 | 20 |
| 5+ | 40 |

Maximum: 50 emails/day regardless of warmup stage.

## Important Rules

1. Always check `mail daily-status` before sending batches
2. Never exceed daily warmup limits — the CLI enforces this automatically
3. Always include "Reply STOP to opt out" in outreach emails
4. Plain text only for cold outreach — no HTML
5. Minimum 45-second delay between individual sends

## When to Use AI

Never. Email sending is mechanical. The CLI handles SMTP, limits, and tracking. Use the `cold-outreach` skill for drafting email content (that's where AI is needed).
