---
name: daily-ops
description: Master orchestration for the Convertra outreach system. Run daily checks, launch campaigns, review metrics, and manage the full lead gen pipeline. Start here — this skill coordinates all other skills.
user-invocable: true
metadata: {"openclaw":{"emoji":"🎯"}}
---

# Daily Ops — Convertra Outreach Command Center

You are operating the Convertra lead generation system. Everything runs through the CLI at `/home/ubuntu/convertra-leads/cli.py`. All commands return structured JSON. You format the results for Telegram display.

**Rule: Never use AI tokens for work the CLI handles.** The only place AI is needed is drafting personalized cold emails and interpreting ambiguous reply sentiment. Everything else — discovery, research, scoring, email finding, sending, inbox, follow-ups, reporting — is deterministic CLI work.

---

## System Architecture

```
User sends Telegram command
  → You (OpenClaw) receive it
  → You call: exec python3 /home/ubuntu/convertra-leads/cli.py <command>
  → CLI returns JSON
  → You format and display the result
  → Only use AI for: email drafting + reply interpretation
```

### The 9 Skills and What They Do

| Skill | Slash Command | CLI Commands | AI? |
|-------|--------------|--------------|-----|
| pipeline-tracker | /pipeline_tracker | `pipeline list/get/add/update/due/search/backup` | Never |
| ad-library-scraper | /ad_library_scraper | `discover search/batch`, `scrape search/page` | Never |
| prospect-research | /prospect_research | `discover search/batch/linkedin`, `research company/batch`, `score prospect/batch` | Never |
| lead-enrichment | /lead_enrichment | `email find/verify/batch/search`, `research company/batch`, `score prospect/batch` | Never |
| cold-outreach | /cold_outreach | Full 5-phase pipeline | **Only Phase 2 (drafting) and Phase 4 (reply responses)** |
| gmail-send | /gmail_send | `mail send/batch/daily-status` | Never |
| gmail-read | /gmail_read | `inbox check/replies/search` | Only for ambiguous sentiment |
| follow-up-sequences | /follow_up_sequences | `followup due/schedule/pause/resume` | Rarely (custom follow-ups only) |
| email-warmup | /email_warmup | `mail daily-status`, `report daily` | Never |

---

## Three Operational Rhythms

### 1. DAILY ROUTINE (Run Every Morning)

Execute these steps in order. This is the minimum daily operation.

```bash
# Step 1: Check inbox for replies FIRST (never follow up on someone who replied)
exec python3 /home/ubuntu/convertra-leads/cli.py inbox replies --pipeline-cross-ref

# Step 2: Process what came back
# - Interested replies → update to replied_interested, draft response (AI)
# - Not interested → update to replied_not_interested
# - Opt-outs → update to opted_out (NEVER contact again)
# - Bounces → update to invalid_email
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id <id> --stage <new_stage>

# Step 3: Check warmup status
exec python3 /home/ubuntu/convertra-leads/cli.py mail daily-status

# Step 4: Send due follow-ups (only if warmup allows)
exec python3 /home/ubuntu/convertra-leads/cli.py followup due
# For each due follow-up, send using pre-built templates:
exec python3 /home/ubuntu/convertra-leads/cli.py mail send --to "<email>" --subject "RE: <original_subject>" --body "<template_body>"
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id <id> --stage followup_1_sent

# Step 5: Quick metrics check
exec python3 /home/ubuntu/convertra-leads/cli.py report daily
```

**Present results as:** A summary card showing replies received, follow-ups sent, warmup capacity remaining, and any red flags (bounce rate, opt-outs).

---

### 2. WEEKLY REVIEW (Run Once Per Week)

```bash
# Full pipeline health check
exec python3 /home/ubuntu/convertra-leads/cli.py report pipeline-summary

# Campaign performance
exec python3 /home/ubuntu/convertra-leads/cli.py report campaign

# Check if pipeline needs refilling
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list --stage ready_to_send
```

**Red flags to watch:**
- Bounce rate >3% → pause all cold outreach, review email quality
- Reply rate <2% after 50+ sends → revise email copy and targeting
- Pipeline running dry (<10 prospects in ready_to_send) → trigger new discovery

---

### 3. CAMPAIGN LAUNCH (New Outreach Batch)

This is the full autonomous pipeline. Run when you need fresh prospects.

```bash
# Phase 1: DISCOVER (CLI only, no AI)
# Option A: By niche
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --niche "supplements" --limit 30
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --niche "supplements" --limit 20

# Option B: By keywords
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --keywords "DTC brand,media buyer,hiring"

# Option C: Multi-niche sweep
exec python3 /home/ubuntu/convertra-leads/cli.py discover batch --niches supplements,skincare,fitness --limit-per-niche 20

# Phase 1b: RESEARCH + SCORE (CLI only)
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"

# Phase 1c: FIND EMAILS (CLI only)
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "score_min=8"

# Phase 1d: REVIEW HOT LEADS
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list --tag hot --limit 20
```

**Present the hot leads list** to the user. Wait for approval before proceeding to email drafting.

```bash
# Phase 2: DRAFT EMAILS (AI — this is the ONE place that uses tokens)
# For each approved prospect, use their data to write a personalized email:
# - Use prospect's company_intel, pain_signals, personalization_hooks
# - Template: convertra_saas (DTC/ecommerce) or enterprise_partner (agencies)
# - Subject: <6 words, lowercase, no spam triggers
# - Body: <125 words, plain text, personalized first line
# - One CTA: "Would a 15-min call make sense?"
# - End with: "Reply STOP to opt out."
# - NO links, images, or HTML in first email

# Phase 3: SEND (CLI only)
exec python3 /home/ubuntu/convertra-leads/cli.py mail daily-status
# If capacity allows:
exec python3 /home/ubuntu/convertra-leads/cli.py mail send --to "<email>" --subject "<subject>" --body "<body>"
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id <id> --stage email_1_sent
# Or batch send:
exec python3 /home/ubuntu/convertra-leads/cli.py mail batch --pipeline-filter "stage=ready_to_send" --limit 20 --delay 45
```

After sending, the **daily routine** handles everything else (replies, follow-ups, metrics).

---

## Email Drafting Rules (The Only AI-Powered Step)

When drafting cold emails, follow these rules exactly:

### Templates by Prospect Bucket

**convertra_saas** (DTC/Ecommerce founders, course creators):
- Subject: `quick question about {company}'s ad creative`
- Angle: Creative testing bottleneck is the ceiling on scale
- Hook: Reference their specific ads, hiring, or growth signals

**enterprise_partner** (Agencies, large brands):
- Subject: `your clients' creative pipeline`
- Angle: Scaling creative output across multiple client accounts
- Hook: Reference their client portfolio or team size

### Deliverability Rules (Non-Negotiable)
- Plain text only — no HTML, no images, no rich formatting
- No links in the first email (link allowed in follow-up 2 only)
- Personalize every email — the first line must be specific to the prospect
- Under 125 words for the body
- Subject under 6 words, lowercase, no exclamation marks, no spam trigger words
- Always end with: `Reply STOP to opt out.`
- Minimum 45-second delay between sends

---

## Follow-Up Sequence Timing

The CLI uses pre-built templates from `data/templates.json`. No AI needed.

| Step | Days After Previous | Template | Stage After Send |
|------|-------------------|----------|-----------------|
| Email 1 | Day 0 | convertra_saas or enterprise_partner | email_1_sent |
| Follow-up 1 | +3 days | The Bump (short, casual, <40 words) | followup_1_sent |
| Follow-up 2 | +4 days (Day 7) | The Value-Add (insight + one link, <60 words) | followup_2_sent |
| Breakup | +7 days (Day 14) | The Close (graceful exit, <35 words, no CTA) | breakup_sent |

**Skip conditions** (CLI enforces automatically): opted_out, invalid_email, replied_interested, replied_not_interested, replied_not_now, won, lost, sequence_complete, weekends, paused sequences.

---

## Pipeline Stages (Full Lifecycle)

```
researched → ready_to_send → email_1_sent → followup_1_sent → followup_2_sent
→ breakup_sent → sequence_complete

At any point, a prospect can branch to:
→ replied_interested → meeting_scheduled → meeting_completed → won / lost
→ replied_not_interested (closed)
→ replied_not_now (park for later)
→ opted_out (never contact again)
→ invalid_email (bounced)
```

---

## Lead Scoring (17-Point Rubric)

The CLI scores automatically. Tiers:

| Score | Tier | Action |
|-------|------|--------|
| 12+ | Hot | Priority outreach — email immediately |
| 8-11 | Warm | Good prospect — include in next batch |
| 5-7 | Cool | Park for later — may mature |
| <5 | Skip | Don't pursue |

**Prospect buckets** (determined by scoring):
- `convertra_saas` — DTC, ecommerce, course creators (10-100 ads, small team)
- `enterprise_partner` — Agencies, large brands (100+ ads, sophisticated ops)
- `media_buying` — Stale creative, high spend ($20K+/mo), needs creative refresh

---

## Warmup Schedule

The CLI enforces these limits. You cannot exceed them.

| Week | Daily Limit | What to Send |
|------|-------------|-------------|
| 1 | 5/day | Known contacts only, get replies |
| 2 | 10/day | Mix of warm + a few new conversations |
| 3 | 20/day | Light outreach to people you've met |
| 4 | 20/day | 10 warm + 10 cold outreach |
| 5+ | 40/day | Steady state — mix of warm and cold |

Max: 50 emails/day regardless of warmup stage.

---

## Emergency Procedures

### Bounce Rate Exceeds 3%
1. `exec python3 /home/ubuntu/convertra-leads/cli.py followup pause --id all`
2. Stop ALL cold outreach immediately
3. Review email list quality — remove invalid domains
4. Resume after bounce rate drops below 1%

### Gmail Account Warning
1. Stop ALL sending immediately
2. Send only to known contacts who will reply for 2 weeks
3. Gradually reintroduce cold outreach after 2 weeks of clean signals

### Opt-Out Received
1. Immediately: `exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id <id> --stage opted_out`
2. This prospect is permanently excluded from all future outreach
3. The CLI auto-skips opted_out prospects in all batch operations

---

## Quick Command Reference

```
# Pipeline
pipeline list [--stage X] [--tag X] [--limit N]
pipeline get --id p_001
pipeline add --json '{...}'
pipeline update --id p_001 --stage <stage>
pipeline search --query "acme"
pipeline due
pipeline backup

# Scoring
score prospect --id p_001
score batch --pipeline-filter "stage=researched"

# Discovery
discover search --niche "supplements" [--limit 30]
discover search --keywords "DTC brand,media buyer"
discover batch --niches supplements,skincare [--limit-per-niche 20]

# Scraping
scrape search --niche "supplements" [--limit 20]
scrape page --page-id 123456789

# Research
research company --url "https://example.com"
research batch --pipeline-filter "stage=discovered"

# Email Finding
email find --name "Jane Smith" --domain "acme.com"
email verify --address "jane@acme.com"
email batch --pipeline-filter "score_min=8"

# Sending
mail send --to "jane@acme.com" --subject "..." --body "..."
mail batch --pipeline-filter "stage=ready_to_send" --limit 20 --delay 45
mail daily-status

# Inbox
inbox check [--days 3] [--unread-only]
inbox replies --pipeline-cross-ref
inbox search --from "jane@acme.com"

# Follow-ups
followup due [--date today]
followup schedule --id p_001 --step followup_1
followup pause --id p_001
followup resume --id p_001

# Reporting
report campaign
report daily
report pipeline-summary
```

---

## When the User Says...

| User Says | What to Do |
|-----------|-----------|
| "Run daily checks" / "morning routine" | Execute the Daily Routine (all 5 steps) |
| "Check my inbox" / "any replies?" | `inbox replies --pipeline-cross-ref` |
| "How's warmup?" / "can I send?" | `mail daily-status` |
| "Find me leads" / "new prospects" | Campaign Launch Phase 1 (discover → research → score → email) |
| "Find leads in [niche]" | `discover search --niche "[niche]"` then research → score → email |
| "Draft emails" / "write outreach" | Campaign Launch Phase 2 (AI drafts using prospect data) |
| "Send the emails" / "blast them" | `mail batch` (respects warmup limits) |
| "Show me the pipeline" | `pipeline list` or `report pipeline-summary` |
| "Weekly review" / "how are we doing?" | Execute Weekly Review (report pipeline-summary + report campaign) |
| "Follow up" / "send follow-ups" | `followup due` then send each due follow-up |
| "Research [company]" | `research company --url "[url]"` |
| "Score the leads" | `score batch --pipeline-filter "stage=researched"` |
| "Who's hot?" / "best leads" | `pipeline list --tag hot` |
| "Stop sending to [person]" | `pipeline update --id <id> --stage opted_out` |
| "Pause everything" | Pause all active follow-up sequences |
| "Campaign metrics" / "stats" | `report campaign` + `report daily` |
