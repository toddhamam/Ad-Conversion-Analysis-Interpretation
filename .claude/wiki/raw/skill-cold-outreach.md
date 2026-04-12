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
- Subject: Pick from the Tier 1 subject line pool (see below), rotate across prospects
- Body: Under 125 words, plain text only, 4-part formula (Greeting → Opening+Bridge → Value Offer → Sign-off)
- First line: Personalized to THEM specifically
- One CTA only: offer to send something tangible (ad variations, video)
- End with: "Reply STOP to opt out."
- No links, no images, no HTML in first email

**Tier 1 Subject Line Pool** (rotate — never reuse the same subject for the same prospect):
1. `Ad fatigue?`
2. `{first_name}, creative bottleneck?`
3. `Waiting on designers?`
4. `{first_name}, quick creative question`
5. `Fresh creatives in 3 min`
6. `{company} ad variations`
7. `Saw {company}'s ads`
8. `Creative testing at {company}`
9. `{first_name}, ad creative idea`
10. `Scaling {company}'s creatives`
11. `{company}'s next winning ad`

**Templates by Bucket (4-Part Formula):**

**convertra_saas** (DTC/Ecommerce):
```
Subject: [pick from Tier 1 pool]

Hey [first name],

Just [specific observation about their ads/creative]. At that volume, the biggest challenge is usually keeping enough fresh variations flowing into testing.

I mocked up 2 fresh ad variations based on what's already winning in your account. Want me to send them over?

[sender name]

Reply STOP to opt out.
```

**enterprise_partner** (Agencies):
```
Subject: [pick from Tier 1 pool]

Hey [first name],

Just [specific observation about their agency/clients]. At that volume, the biggest challenge is usually keeping enough fresh variations flowing into testing for each client.

Convertra can help you pump out fresh winning creatives to test for your clients in less than 3 minutes. I shot a video to show you how. Want me to send it over?

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

### Phase 5: Follow-Up (CLI — No AI)

Two-touch only: 1 opener + 1 follow-up (day 3). Non-responders after the follow-up are recycled into new campaigns with different subject lines and angles.

```bash
# Check what follow-ups are due today
exec python3 /home/ubuntu/convertra-leads/cli.py followup due

# Schedule the follow-up (day 3 bump)
exec python3 /home/ubuntu/convertra-leads/cli.py followup schedule --id p_001 --step followup_1
```

## Deliverability Rules

1. Plain text only — no HTML
2. No links in any cold email (opener or follow-up)
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
