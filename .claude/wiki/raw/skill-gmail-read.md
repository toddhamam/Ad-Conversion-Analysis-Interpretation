---
name: gmail-read
description: Read, search, and manage Gmail inbox via IMAP. Check for replies, monitor bounce-backs, and track email engagement.
user-invocable: true
metadata: {"openclaw":{"emoji":"📥","requires":{"bins":["python3"],"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]},"primaryEnv":"GMAIL_APP_PASSWORD"}}
---

# Gmail Read — IMAP Inbox Management

Read and search the Gmail inbox using the Convertra Leads CLI. Handles IMAP connection, reply detection, bounce monitoring, and opt-out detection automatically.

## Commands

### Check Recent Inbox Messages

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py inbox check [--days 3] [--unread-only]
```

Returns recent messages with: from, subject, date, body_preview.

### Check Replies Cross-Referenced Against Pipeline

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py inbox replies --pipeline-cross-ref
```

This is the most important command. It automatically:
- Reads the last 14 days of inbox messages
- Cross-references sender addresses against pipeline prospect emails
- Categorizes into: **replies** (from prospects), **bounces** (from mailer-daemon/postmaster), **opt-outs** (containing "stop"/"unsubscribe")
- Returns structured JSON with prospect IDs matched to each message

### Search for Emails from a Specific Sender

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py inbox search --from "jane@acme.com"
```

## Daily Inbox Check Routine

Run this every morning:

```bash
# Step 1: Check for prospect replies, bounces, opt-outs
exec python3 /home/ubuntu/convertra-leads/cli.py inbox replies --pipeline-cross-ref

# Step 2: Update pipeline based on results
# For each reply — update stage appropriately
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id p_001 --stage replied_interested
# For each bounce
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id p_002 --stage invalid_email
# For each opt-out
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id p_003 --stage opted_out
```

## Important Rules

1. Always check for replies BEFORE sending follow-ups
2. Honor unsubscribe requests immediately — mark as `opted_out`
3. Log bounced emails — mark as `invalid_email`
4. Don't poll more than once every 15 minutes

## When to Use AI

Only for interpreting ambiguous reply sentiment (is the reply positive, negative, or neutral?). The inbox reading and categorization itself is handled entirely by the CLI.
