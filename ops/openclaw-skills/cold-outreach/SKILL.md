---
name: cold-outreach
description: Run end-to-end cold email outreach campaigns. Draft personalized emails, manage sequences, handle replies, and optimize deliverability.
user-invocable: true
metadata: {"openclaw":{"emoji":"🎯","requires":{"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Cold Outreach — Campaign Engine

Orchestrates the full cold email outreach workflow. Mechanical operations (sending, inbox checks, pipeline updates, follow-ups) are handled by the CLI. Only email drafting uses AI.

## Campaign Workflow

### Phase 1: Build Prospect List (CLI — No AI)

```bash
# Discover prospects
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --niche "supplements" --limit 30

# Research companies
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"

# Score and rank
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"

# Find emails
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "score_min=8"

# Review hot leads
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list --tag hot
```

### Phase 2: Draft Emails (AI — Small Token Usage)

This is the ONLY step that uses AI tokens. For each prospect ready for outreach:

1. Get the prospect data: `exec python3 /home/ubuntu/convertra-leads/cli.py pipeline get --id p_001`
2. Use the prospect's `personalization_hooks`, `pain_signals`, and `company_intel` to draft a personalized email
3. Store the draft on the prospect record via `pipeline update`

**Email Rules:**
- Subject: Under 6 words, lowercase, no spam triggers
- Body: Under 125 words, plain text only
- First line: Personalized to THEM specifically
- One CTA only: "Would a 15-min call make sense?"
- End with: "Reply STOP to opt out."
- No links, no images, no HTML in first email

**Templates by Bucket:**

**convertra_saas** (DTC/Ecommerce):
```
Subject: quick question about [company]'s ad creative

Hey [first name],

Saw [company] is scaling paid social — [specific observation]. Smart move.

One thing we're seeing with brands at your stage: the creative testing bottleneck becomes the ceiling on scale. Teams that automate the test-and-iterate cycle are shipping 10x more creatives without adding headcount.

Would it make sense to show you how we're doing this? 15 min, no pitch — just the framework.

Either way, appreciate what you're building.

[sender name]

Reply STOP to opt out.
```

**enterprise_partner** (Agencies):
```
Subject: your clients' creative pipeline

Hey [first name],

[Specific observation about their agency].

Quick question: how are you handling the creative testing volume as you scale accounts? We're working with a few agencies who are using AI to multiply their creative output without multiplying their team.

Curious if that's a bottleneck you're feeling. If so, happy to share the approach in a quick call.

[sender name]

Reply STOP to opt out.
```

### Phase 3: Send (CLI — No AI)

```bash
# Check daily send capacity
exec python3 /home/ubuntu/convertra-leads/cli.py mail daily-status

# Send a single email
exec python3 /home/ubuntu/convertra-leads/cli.py mail send --to "jane@acme.com" --subject "quick question" --body "Hey Jane, ..."

# Send batch to all ready prospects
exec python3 /home/ubuntu/convertra-leads/cli.py mail batch --pipeline-filter "stage=ready_to_send" --limit 20 --delay 45
```

### Phase 4: Handle Replies (CLI + AI for responses)

```bash
# Check for replies cross-referenced against pipeline
exec python3 /home/ubuntu/convertra-leads/cli.py inbox replies --pipeline-cross-ref

# Check for bounces and opt-outs
exec python3 /home/ubuntu/convertra-leads/cli.py inbox check --days 3
```

**Reply handling:**
- Positive reply → `pipeline update --id p_001 --stage replied_interested` → Draft response (AI)
- Not now → `pipeline update --id p_001 --stage replied_not_now` → Set reminder
- Not interested → `pipeline update --id p_001 --stage replied_not_interested`
- Unsubscribe → `pipeline update --id p_001 --stage opted_out`
- Bounce → `pipeline update --id p_001 --stage invalid_email`

### Phase 5: Follow-Ups (CLI — No AI)

```bash
# Check what follow-ups are due today
exec python3 /home/ubuntu/convertra-leads/cli.py followup due

# Schedule a follow-up
exec python3 /home/ubuntu/convertra-leads/cli.py followup schedule --id p_001 --step followup_1
```

## Deliverability Rules

1. Plain text only — no HTML
2. No links in first email
3. Under 125 words
4. Personalize every email
5. Monitor bounce rate — pause if >3%
6. Monitor reply rate — revise copy if <2% after 50 sends

## When to Use AI

ONLY for:
1. Drafting initial personalized emails (Phase 2) — use prospect data from CLI
2. Drafting responses to positive replies (Phase 4)
3. Interpreting ambiguous reply sentiment

Everything else is handled by the CLI.
