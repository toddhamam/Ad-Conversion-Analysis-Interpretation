---
name: follow-up-sequences
description: Manage automated follow-up email sequences. Track timing, draft context-aware follow-ups, and handle sequence progression.
user-invocable: true
metadata: {"openclaw":{"emoji":"🔄","requires":{"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Follow-Up Sequences — Automated Drip Campaigns

Manage follow-up email sequences using the Convertra Leads CLI. Timing, scheduling, and pipeline updates are handled by the CLI. Follow-up emails use pre-built templates — no AI needed.

## Commands

### Check Due Follow-Ups

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py followup due [--date today]
```

Returns prospects with a due follow-up (followup_1 on day 3) with due dates.

### Schedule a Follow-Up

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py followup schedule --id p_001 --step followup_1
```

### Pause a Sequence

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py followup pause --id p_001
```

### Resume a Sequence

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py followup resume --id p_001
```

## Sequence Timing (Two-Touch Only)

| Step | Delay After Previous | Stage After Send |
|---|---|---|
| Email 1 (Opener) | Day 0 | `email_1_sent` |
| Follow-up 1 (Bump) | +3 days | `followup_1_sent` → `sequence_complete` |

Non-responders after the follow-up are recycled into new campaigns with different subject lines and angles — not hammered with more emails in the same thread.

## Daily Routine

Run this every morning to process the follow-up queue:

```bash
# Step 1: Check inbox for replies first (CRITICAL — never follow up on someone who replied)
exec python3 /home/ubuntu/convertra-leads/cli.py inbox replies --pipeline-cross-ref

# Step 2: Check what follow-ups are due
exec python3 /home/ubuntu/convertra-leads/cli.py followup due

# Step 3: Send follow-ups (the CLI uses pre-built templates from templates.json)
# For each due follow-up, send via the mail command
exec python3 /home/ubuntu/convertra-leads/cli.py mail send --to "jane@acme.com" --subject "RE: quick question about Acme" --body "Hey Jane, just floating this back up..."

# Step 4: Update pipeline
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id p_001 --stage followup_1_sent
```

## Skip Conditions

The CLI automatically skips follow-ups for prospects in these stages:
- `opted_out` — Never contact again
- `invalid_email` — Email bounced
- `replied_interested` — Already engaged
- `replied_not_interested` — Closed
- `replied_not_now` — Waiting for reconnect date
- `won` / `lost` — Deal completed
- `sequence_complete` — All emails sent

Also skips weekends (Saturday/Sunday) and paused sequences.

## Follow-Up Template

Pre-built template is in `data/templates.json` on the VPS. One follow-up stage only:

**Follow-up 1 (The Bump)**: Short, casual float-back-up. Under 40 words. No new angle — just a nudge.

Template: `"Just floating this back up. The ad variations are ready whenever you want them."`

## When to Use AI

Rarely. Follow-up emails use pre-built templates with merge fields ({first_name}, {company}, etc.). AI is only needed if the user wants a custom follow-up that doesn't fit the templates, or to interpret an ambiguous reply before deciding next steps.
