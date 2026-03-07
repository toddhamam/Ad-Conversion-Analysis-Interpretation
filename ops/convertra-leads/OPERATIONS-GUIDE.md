# Convertra Leads — Tokenless Operations Guide

This guide replaces the OpenClaw runbook. Everything runs as pure Python on your VPS — no AI tokens consumed except for email drafting (~500 tokens per email via GPT-5.2).

---

## 1. First-Time Setup (VPS)

### SSH into your VPS

```bash
ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177
```

### Copy the new files

Upload the following from `ops/convertra-leads/` to `/home/ubuntu/convertra-leads/`:

```
orchestrator.py
modules/drafter.py
modules/job_scraper.py
modules/notifier.py
crontab.example
```

### Add environment variables

Edit `/home/ubuntu/convertra-leads/.env` — this must match the local copy at `ops/convertra-leads/.env` (gitignored).

```bash
# Email (IMAP inbox monitoring + SMTP)
GMAIL_ADDRESS=convertraiq@gmail.com
GMAIL_APP_PASSWORD=...              # Google App Passwords

# AI drafting
OPENAI_API_KEY=sk-...               # GPT-5.2 for email drafting (~500 tokens/email)

# Notifications
TELEGRAM_BOT_TOKEN=...              # From @BotFather
TELEGRAM_CHAT_ID=...                # Your chat ID

# Enrichment (Apollo primary — 10K credits/month free)
APOLLO_API_KEY=...                   # apollo.io → Settings → API Keys (PRIMARY — 10K/mo free)
HUNTER_API_KEY=...                   # hunter.io → API (FALLBACK — 25/mo free)

# Instantly (cold email sending)
INSTANTLY_API_KEY=...                # app.instantly.ai → Settings → Integrations → API

# Vayne (LinkedIn Sales Navigator scraping — OPTIONAL, requires Starter plan)
# VAYNE_API_KEY=...                  # vayne.io → Dashboard → API Settings → generate token
```

**Where to get these:**
- `OPENAI_API_KEY` — From https://platform.openai.com/api-keys
- `TELEGRAM_BOT_TOKEN` — Already exists in your OpenClaw config (`/home/ubuntu/.openclaw/openclaw.json`), or from @BotFather
- `TELEGRAM_CHAT_ID` — Send a message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and look for `chat.id`
- `APOLLO_API_KEY` — From app.apollo.io → Settings → API Keys. Free plan: 10,000 credits/month. Primary enrichment source
- `HUNTER_API_KEY` — From Hunter.io → API → Copy your API key. Free plan: 25 searches/month. Fallback enrichment
- `INSTANTLY_API_KEY` — From app.instantly.ai → Settings → Integrations → API. Base64-encoded key used for campaign management and lead push
- `VAYNE_API_KEY` — (OPTIONAL) From vayne.io → Dashboard → API Settings. Requires Starter plan ($49/mo). Enables automated Sales Nav scraping via API instead of manual CSV export

**Important:** Both `.env` files (local `ops/convertra-leads/.env` and VPS `/home/ubuntu/convertra-leads/.env`) must stay in sync. The local copy is gitignored and persists across branches.

### Create logs directory

```bash
mkdir -p /home/ubuntu/convertra-leads/logs
```

### Verify everything works

```bash
cd /home/ubuntu/convertra-leads

# Test notification
python3 cli.py notify send --message "Orchestrator setup complete"

# Test daily routine (dry run — will check inbox, send follow-ups, report)
python3 orchestrator.py daily

# Test job scraper
python3 cli.py discover jobs --keywords "media buyer"
```

### Install the cron schedule

```bash
crontab -e
```

Paste these lines:

```
# Daily fill: 7am AEST weekdays — hunt leads + push to Instantly
0 7 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py fill --target 25 >> /home/ubuntu/convertra-leads/logs/fill.log 2>&1

# Daily routine: 9am AEST weekdays — inbox check, follow-ups, reports
0 9 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py daily >> /home/ubuntu/convertra-leads/logs/daily.log 2>&1

# Weekly review: 10am AEST Monday
0 10 * * 1 cd /home/ubuntu/convertra-leads && python3 orchestrator.py weekly >> /home/ubuntu/convertra-leads/logs/weekly.log 2>&1

# Pipeline backup: midnight Sunday
0 0 * * 0 cd /home/ubuntu/convertra-leads && python3 cli.py pipeline backup >> /home/ubuntu/convertra-leads/logs/backup.log 2>&1
```

### Stop OpenClaw

Once you've confirmed the orchestrator works for 2-3 days:

```bash
cd /home/ubuntu/openclaw-deploy
sudo docker compose down
```

---

## 2. Daily Lead Fill (Instantly — Automated)

The `fill` mode is the core daily automation. It runs at **7am AEST** (before Instantly's 9am sending window) and ensures 20-30 fresh leads are queued in your Instantly campaign every morning.

### What happens at 7am every weekday

1. **Pipeline check** — Counts existing `ready_to_send` leads
2. **Prospect hunt** — If more leads are needed, runs the full pipeline:
   - Discovery (DuckDuckGo + Ad Library + job listings)
   - Research (website scraping for signals)
   - Scoring (17-point rubric, keeps warm+ leads with score >= 5)
   - Email finding (Hunter.io + pattern matching)
   - AI drafting (GPT-5.2, ~500 tokens each)
3. **Instantly push** — Pushes all `ready_to_send` leads to the active campaign
4. **Telegram notification** — Sends you a summary card

### Telegram summary example

```
Daily Fill — 2026-02-27

Pipeline: 3 existing ready
Needed: 22

Hunt:
- 40 discovered
- 24 drafted
- 6 rounds in 12m 34s

Instantly Push:
- 24 leads pushed to campaign

Remaining in pipeline: 0 ready_to_send
```

### Adjusting the daily target

```bash
# Week 1 (conservative warmup): 20 leads/day
python3 orchestrator.py fill --target 20

# Normal operation: 25 leads/day (default)
python3 orchestrator.py fill --target 25

# Scaling up: 40 leads/day
python3 orchestrator.py fill --target 40

# Different Instantly campaign
python3 orchestrator.py fill --target 25 --campaign-id "YOUR-CAMPAIGN-UUID"

# Specific niches only
python3 orchestrator.py fill --target 25 --niches "supplements,skincare"
```

### How Instantly handles the sending

Instantly manages its own warmup and send pacing. Your campaign is configured with:
- **Daily limit**: 50/day
- **Schedule**: Weekdays 9am-5pm AEST
- **Two-touch sequence**: Initial email (day 0) + follow-up (day 3)
- **Stop on reply**: Yes

You just keep the campaign topped up with leads. Instantly decides how many to send each day based on account warmup status.

### Cron schedule

Edit with `crontab -e`:

```
# Daily fill at 7am AEST (before 9am sending window)
0 7 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py fill --target 25 >> /home/ubuntu/convertra-leads/logs/fill.log 2>&1
```

To scale up later, just change `--target 25` to `--target 40`.

---

## 3. Daily Inbox Monitoring (Automated)

Once cron is installed, the daily routine runs itself every weekday at 9am. You don't need to do anything — just watch Telegram for the summary card.

### What happens automatically at 9am

1. **Inbox check** — Reads Gmail via IMAP, cross-references against pipeline
   - Bounces → marks prospect as `invalid_email`
   - Opt-outs (mentions "stop", "unsubscribe") → marks as `opted_out`
   - Positive replies → marks as `replied_interested`
   - Deferrals ("not right now", "maybe later") → marks as `replied_not_now`
   - Negative replies → marks as `replied_not_interested`

2. **Follow-up sends** — Checks which prospects are due for follow-ups
   - Uses pre-built templates (NOT AI) — zero tokens
   - Two-touch rule: 1 opener + 1 follow-up (day 3), then sequence complete
   - Non-responders marked `sequence_complete` for recycle into new campaign
   - Skips weekends, opted-out, and already-replied prospects

3. **Ready email sends** — Sends any emails sitting in `ready_to_send` stage
   - Respects warmup limits (5/10/20/20/40 per day by week)
   - 45-second delay between sends

4. **Telegram summary** — Sends you a card like:

```
Convertra Daily Ops — 2026-02-24

Inbox
- 2 replies (1 interested, 1 not now)
- 0 bounces, 0 opt-outs

Follow-ups
- 3 sent, 0 failed

Outreach
- 5 initial emails sent, 0 failed
- Warmup: 8/20 used (week 3)

Pipeline
- 47 total prospects, 2 due follow-ups
```

### What happens automatically each Monday

The weekly review runs at 10am and checks for red flags:

| Red Flag | Threshold | Action |
|----------|-----------|--------|
| Bounce rate | > 3% | **Auto-pauses all sequences** |
| Reply rate | < 2% after 50+ sends | Warning in Telegram |
| Pipeline depth | < 10 ready to send | "Run a campaign" reminder |
| Opt-out rate | > 5% | Targeting/messaging warning |

---

## 4. Running a Campaign (Manual)

When you need fresh prospects, SSH in and launch a campaign:

```bash
ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177
cd /home/ubuntu/convertra-leads
```

### Full campaign (discovery + research + score + email find + draft)

```bash
# Single niche
python3 orchestrator.py campaign --niches "supplements"

# Multiple niches
python3 orchestrator.py campaign --niches "supplements,skincare,fitness"

# Include job listing scraper (finds companies hiring media buyers)
python3 orchestrator.py campaign --niches "supplements,skincare" --include-jobs

# Name the campaign for tracking
python3 orchestrator.py campaign --niches "courses,coaching" --include-jobs --campaign "mar-2026"
```

### What happens during a campaign

```
Phase 1: Discovery
├── DuckDuckGo search per niche (20 per niche)
├── Meta Ad Library scrape per niche (20 per niche)
└── Job listing search (if --include-jobs)

Phase 2: Research
└── Scrapes each prospect's website for signals
    (tech stack, team size, hiring, funding, content marketing)

Phase 3: Scoring
└── 17-point rubric → hot/warm/cool/skip tiers

Phase 4: Enrichment + Email Finding
├── Hunter.io enrichment (if HUNTER_API_KEY set)
│   └── Verified emails, roles, LinkedIn, seniority, location
└── Fallback: DNS verification + pattern matching + web search
    (only for warm+ prospects, score >= 5)

Phase 5: AI Email Drafting ← ONLY step that uses tokens
└── GPT-5.2 drafts personalized cold emails
    (~500 tokens each, falls back to templates if API fails, score >= 5)

Phase 6: Summary
└── Telegram notification with pipeline results
```

After a campaign, prospects are in `ready_to_send`. The next daily cron run will start sending them.

---

## 5. Prospect Hunt (Persistent Discovery)

When a single campaign doesn't produce enough hot leads, use the prospect hunt. It loops discovery → research → score across all niches until it accumulates your target number of hot leads, then runs email finding and AI drafting as a single final batch.

```bash
ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177
cd /home/ubuntu/convertra-leads
```

### Basic usage

```bash
# Hunt for 20 hot leads (default target)
python3 orchestrator.py prospect --target 20

# Hunt for 5 hot leads (quick test)
python3 orchestrator.py prospect --target 5

# Specific niches only, no job listings
python3 orchestrator.py prospect --target 20 --niches "supplements,skincare" --no-jobs

# More rounds allowed, custom score threshold
python3 orchestrator.py prospect --target 30 --max-rounds 15 --score-threshold 10
```

### How the hunt works

```
Round 1: supplements (niche)
├── Discover: DuckDuckGo + Ad Library → 20 new prospects
├── Research: scrape each company website
├── Score: 17-point rubric → 3 hot, 5 warm, 12 other
└── Telegram: "Hot scored: 3/20 target"

Round 2: skincare (niche)
├── Same pipeline → 4 more hot
└── Telegram: "Hot scored: 7/20 target"

Round 3: job_listings (every 3rd round)
├── Search for companies hiring media buyers
└── Telegram: "Hot scored: 9/20 target"

... continues rotating through niches ...

Round 8: supplements (2nd pass — returns 0 new, marked exhausted)
Round 9: skincare 2026 (expanded keyword variant)

FINAL BATCH (runs once after loop ends):
├── Hunter.io enrichment (verified emails + contact data)
├── Email finding fallback for remaining leads (score >= 5)
└── AI drafting via GPT-5.2 (~500 tokens each)
```

### Key behaviors

- **All leads kept** — hot, warm, cool, and skip leads all stay in the pipeline. The target only controls when the loop stops.
- **Niche rotation** — cycles through all 6 niches round-robin, plus job listings every 3rd round.
- **Exhaustion detection** — if a niche returns 0 new prospects (DuckDuckGo gives the same results for repeated queries), it's marked exhausted and skipped.
- **Expanded keywords** — when all standard niches exhaust, generates variants like "supplements 2026", "skincare startup", etc.
- **Deferred AI costs** — discovery/research/scoring is free (no tokens). Email drafting only happens once at the end.
- **Telegram progress** — sends a per-round update and a final summary card.

### Scoring tiers (recalibrated)

| Tier | Score | What it means |
|------|-------|---------------|
| **Hot** | 8+ | High-intent: multiple ad signals + strong company indicators |
| **Warm** | 5-7 | Moderate intent: some ad activity or strong website signals |
| **Cool** | 3-4 | Low intent: minimal signals but worth keeping |
| **Skip** | < 3 | Not a fit: dead website, solo operation, or negative signals |

Realistic max score from available data is ~11 points (website research: ~5-7 pts from hiring, funding, tech stack, content; Ad Library: ~2-4 pts from ad count, platforms).

---

## 6. Individual Commands

For ad-hoc operations when you need to do something specific:

### Pipeline management

```bash
# See your full pipeline health
python3 cli.py report pipeline-summary

# List hot leads
python3 cli.py pipeline list --tag hot

# List prospects ready to send
python3 cli.py pipeline list --stage ready_to_send

# Search for a specific prospect
python3 cli.py pipeline search --query "acme"

# View a specific prospect
python3 cli.py pipeline get --id p_042

# Manually change a prospect's stage
python3 cli.py pipeline update --id p_042 --stage replied_interested

# Backup the pipeline
python3 cli.py pipeline backup
```

### Discovery (find new prospects)

```bash
# Search by niche (DuckDuckGo)
python3 cli.py discover search --niche supplements --limit 30

# Search by custom keywords
python3 cli.py discover search --keywords "DTC brand,performance marketing"

# Search across all niches
python3 cli.py discover batch --niches "supplements,skincare,fitness"

# Find companies hiring media buyers
python3 cli.py discover jobs --keywords "media buyer,paid social manager"

# Search LinkedIn profiles (legacy)
python3 cli.py discover linkedin --query "CMO DTC brand"
```

### LinkedIn Discovery (NEW — highest quality B2B leads)

```bash
# List available personas
python3 cli.py discover linkedin-personas

# Find agency owners/founders on LinkedIn
python3 cli.py discover linkedin-people --persona agency_owners --limit 30

# Find enterprise marketing leaders (CMOs, VPs)
python3 cli.py discover linkedin-people --persona enterprise_marketing --limit 30

# Find senior media buyers
python3 cli.py discover linkedin-people --persona media_buyers --limit 30

# Find SaaS founders running ads
python3 cli.py discover linkedin-people --persona saas_founders --limit 30

# Find agency companies on LinkedIn
python3 cli.py discover linkedin-companies --persona agency_owners --limit 30

# Search + add to pipeline in one step
python3 cli.py discover linkedin-people --persona agency_owners --add --campaign "linkedin-mar-2026"
```

### Shopify Store Discovery (NEW — DTC brands)

```bash
# Find Shopify stores by niche (verifies via /products.json)
python3 cli.py discover shopify --niche supplements --limit 30

# Custom keyword search
python3 cli.py discover shopify --keywords "organic skincare,natural beauty" --limit 20

# Skip verification (faster, less accurate)
python3 cli.py discover shopify --niche fitness --no-verify --limit 50

# Search + add to pipeline
python3 cli.py discover shopify --niche supplements --add --campaign "shopify-mar-2026"
```

### Agency Discovery (NEW — Google Business / directories)

```bash
# Find agencies by location
python3 cli.py discover agencies --location "new york" --limit 30

# Search all top cities in a country
python3 cli.py discover agencies --country us --limit 50

# Specific agency type
python3 cli.py discover agencies --location "london" --type ecommerce_agency

# Search agency directories (Clutch, DesignRush, etc.)
python3 cli.py discover directories --limit 30

# Search + add to pipeline
python3 cli.py discover agencies --country us --add --campaign "agencies-mar-2026"
```

### Ad Library scraping

```bash
# Search Meta Ad Library for active advertisers
python3 cli.py scrape search --niche supplements --limit 20

# Get all ads for a specific page
python3 cli.py scrape page --page-id 123456789
```

### Research & scoring

```bash
# Research a single company website
python3 cli.py research company --url https://example.com

# Research all discovered prospects
python3 cli.py research batch

# Score a single prospect
python3 cli.py score prospect --id p_042

# Score all researched prospects
python3 cli.py score batch --stage researched
```

### Enrichment (Apollo primary, Hunter fallback)

```bash
# Check which enrichment provider is active
python3 cli.py enrich status

# Enrich a single person (uses 1 credit)
python3 cli.py enrich person --name "Jane Smith" --domain example.com

# Enrich by LinkedIn URL (Apollo only — great for LinkedIn-sourced leads)
python3 cli.py enrich person --name "Jane Smith" --domain example.com --linkedin "https://linkedin.com/in/janesmith"

# Enrich a pipeline prospect by ID
python3 cli.py enrich prospect --id p_042

# Batch enrich all researched prospects
python3 cli.py enrich batch --stage researched --score-min 5
```

**Apollo.io** (primary) finds verified emails + enriches with title, seniority, department, phone, company size, and industry — all in a single API call. 10,000 credits/month on free tier.

**Hunter.io** (fallback) activates when Apollo misses a match, or when only `HUNTER_API_KEY` is set. 25 credits/month free.

Provider priority: Apollo (if `APOLLO_API_KEY` set) → Hunter (if `HUNTER_API_KEY` set) → pattern guessing.

### Email finding

```bash
# Find email for a specific person
python3 cli.py email find --name "Jane Smith" --domain example.com

# Verify an email address
python3 cli.py email verify --address jane@example.com

# Find emails for all scored prospects (8+)
python3 cli.py email batch --score-min 8
```

### Email drafting (uses GPT-5.2)

```bash
# Draft email for a single prospect (~500 tokens)
python3 cli.py draft email --id p_042

# Batch draft for all qualified prospects
python3 cli.py draft batch --score-min 8
```

#### Optimized Email Copy Formula (v5)

Every cold email follows a strict 4-part structure. Two variants: SaaS/DTC founders and Agency owners.

**Subject Lines:** 11 Tier 1 (pain-point) variants actively split tested. Tiers 2-6 documented in `templates.json` for future rounds. Subject lines are picked randomly from the active pool per prospect.

**SaaS/DTC Founder Formula:**
```
1. GREETING:     Hi {first_name},
2. OPENING:      Just [specific observation — ad activity, hiring, ecommerce growth,
                 or what they're building]. Uses strongest available signal.
   BRIDGE:       Dynamic based on data:
                 - With ad count: "At that volume, the biggest challenge is usually..."
                 - Without:       "The biggest challenge for brands scaling Meta ads is usually..."
3. VIDEO CTA:   I recorded a quick video for you showing how we're helping businesses
                 just like {company} transform their full Meta ad creative generation
                 and testing process from days into just minutes, (literally, under 3
                 minutes)... No designers. No briefs. No agencies. No waiting...
                 Want me to send it over?
4. SIGN-OFF:     {sender_name}
```
- No product name in the email. Convertra is introduced on the reply.
- CTA offers a personalized video showing time-saving benefit with {company} name.
- "No designers. No briefs. No agencies. No waiting." eliminates objections in-line.

**Agency Owner Formula:**
```
1. GREETING:     Hi {first_name},
2. OPENING:      Just [specific observation — client accounts, scaling].
   BRIDGE:       At that volume, the biggest challenge is usually keeping enough
                 fresh variations flowing into testing for each client.
3. VALUE OFFER:  Convertra can help you pump out fresh winning creatives to test
                 for your clients in less than 3 minutes. I shot a video to show
                 you how. Want me to send it over?
4. SIGN-OFF:     {sender_name}
```
- Product named because agencies evaluate tooling.
- Video CTA works because they're assessing a tool for their workflow.

**Copy rules:**
- NEVER use em dashes. They are a dead giveaway of AI-written copy. Use periods, commas, or ellipsis instead.
- Opening must start with "Just" + a specific observation (ad count, hiring signals, product launches)
- Bridge must NOT frame as criticism. Frame as a natural challenge that comes with scale.
- Under 80 words, plain text only, no links, no "Reply STOP to opt out"

**Follow-up sequence — two-touch rule (based on 2026 cold email research):**
- Follow-up 1 (day 3): Social proof + personalized CTA — "Our users are launching high-converting Meta ad creatives ready to test in under 3 minutes. No designers. No briefs. No agencies. No waiting. I've still got that video ready for you if you want to see how it would work for {company}?"
- That's it. No follow-up 2, no breakup email.
- Non-responders after 2 emails are recycled into a new campaign with a different Tier 1 subject line and a different opening angle.

### Sending

```bash
# Check warmup status
python3 cli.py mail daily-status

# Send a single email
python3 cli.py mail send --to "jane@example.com" --subject "quick question" --body "Hey Jane..."

# Send batch (all ready_to_send, respects warmup limits)
python3 cli.py mail batch --limit 10
```

### Inbox

```bash
# Check recent inbox
python3 cli.py inbox check --days 3

# Check for pipeline-matched replies
python3 cli.py inbox replies

# Search messages from a specific sender
python3 cli.py inbox search --from jane@example.com
```

### Follow-ups

```bash
# See what's due today
python3 cli.py followup due

# Manually schedule a follow-up
python3 cli.py followup schedule --id p_042 --step followup_1

# Pause a sequence
python3 cli.py followup pause --id p_042

# Resume a paused sequence
python3 cli.py followup resume --id p_042
```

### Reports

```bash
# Daily activity report
python3 cli.py report daily

# Full pipeline summary
python3 cli.py report pipeline-summary

# Campaign performance
python3 cli.py report campaign --campaign "feb-2026"
```

### Notifications

```bash
# Send a test message to Telegram
python3 cli.py notify send --message "Pipeline check: all systems go"
```

---

## 7. Monitoring

### Check logs

```bash
# Today's daily run
tail -50 /home/ubuntu/convertra-leads/logs/daily.log

# Last weekly review
tail -50 /home/ubuntu/convertra-leads/logs/weekly.log

# Follow the daily log live
tail -f /home/ubuntu/convertra-leads/logs/daily.log
```

### Verify cron is running

```bash
# List installed cron jobs
crontab -l

# Check if cron ran today (look for orchestrator entries)
grep orchestrator /var/log/syslog | tail -5
```

### Pipeline health check (quick)

```bash
cd /home/ubuntu/convertra-leads
python3 -c "
from config import load_env; load_env()
from modules.reporter import pipeline_summary
import json
s = pipeline_summary()
print(f\"Total: {s.get('total_prospects', 0)}\")
print(f\"By tier: {json.dumps(s.get('by_tier', {}))}\")
print(f\"Ready to send: {s.get('by_stage', {}).get('ready_to_send', 0)}\")
"
```

---

## 8. Typical Weekly Workflow

| Day | What Happens | Your Action |
|-----|-------------|-------------|
| **Mon-Fri 7am** | Cron fills Instantly with 25 fresh leads | Check Telegram for fill summary |
| **Mon-Fri 9am** | Cron checks inbox, sends legacy follow-ups | Check Telegram for inbox summary |
| **Mon-Fri 9am-5pm** | Instantly sends queued emails automatically | Nothing — Instantly handles pacing |
| **Monday 10am** | Cron runs weekly review | Review red flags in Telegram |
| **When you get a reply** | Daily routine auto-classifies it | Check Telegram, follow up personally if interested |
| **When scaling up** | Change `--target 25` to `--target 40` in crontab | `crontab -e` on VPS |

### If you need to pause everything

```bash
# Remove cron jobs temporarily
crontab -r

# Or just comment them out
crontab -e
# Add # before each line
```

### If bounce rate spikes

The weekly review auto-pauses sequences if bounce rate > 3%. To resume after fixing the issue:

```bash
# Check which prospects are paused
python3 cli.py pipeline list --stage email_1_sent
python3 cli.py pipeline list --stage followup_1_sent

# Resume individual sequences
python3 cli.py followup resume --id p_042
```

---

## 9. Token Cost Summary

| Operation | Tokens | Frequency |
|-----------|--------|-----------|
| Daily routine (inbox, follow-ups, sends) | **0** | Every weekday |
| Weekly review (health check, red flags) | **0** | Every Monday |
| Campaign discovery + research + scoring | **0** | As needed |
| Email finding (DNS + web search) | **0** | As needed |
| **Email drafting (GPT-5.2)** | **~500 per email** | Per prospect |
| Follow-up emails (templates) | **0** | Automatic |
| Telegram notifications | **0** | Every run |

**Estimated monthly cost at 25 prospects/day (fill mode)**: ~250K tokens/month (~$3)
**vs. OpenClaw**: ~2M+ tokens/month

---

## 10. File Reference

```
/home/ubuntu/convertra-leads/
├── orchestrator.py          ← Main automation (daily/weekly/campaign)
├── cli.py                   ← All individual commands
├── config.py                ← Config loader
├── .env                     ← Secrets (tokens, passwords)
├── modules/
│   ├── pipeline.py          ← JSON CRM
│   ├── scraper.py           ← Meta Ad Library
│   ├── discovery.py         ← DuckDuckGo prospect search
│   ├── research.py          ← Website scraping
│   ├── scorer.py            ← 17-point lead scoring
│   ├── email_finder.py      ← Email discovery + DNS verify
│   ├── enrichment.py        ← Provider router: Apollo (primary) → Hunter (fallback)
│   ├── apollo_enrichment.py ← Apollo.io People Match API (10K credits/mo free)
│   ├── linkedin_discovery.py← LinkedIn x-ray search via DuckDuckGo
│   ├── shopify_discovery.py ← Shopify store discovery via /products.json
│   ├── google_business.py   ← Google Business + agency directory discovery
│   ├── mailer.py            ← Gmail SMTP + warmup
│   ├── inbox.py             ← Gmail IMAP reader
│   ├── followup.py          ← Sequence scheduling
│   ├── reporter.py          ← Pipeline metrics
│   ├── drafter.py           ← GPT-5.2 email drafting + video CTA
│   ├── job_scraper.py       ← Job listing scraper
│   ├── vayne.py             ← Vayne.io API (LinkedIn Sales Nav scraping)
│   └── notifier.py          ← Telegram notifications
├── data/
│   ├── pipeline.json        ← All prospect records
│   ├── config.json          ← Warmup state, email settings
│   └── templates.json       ← Email templates
├── logs/
│   ├── daily.log            ← Daily cron output
│   ├── weekly.log           ← Weekly cron output
│   └── backup.log           ← Backup cron output
└── crontab.example          ← Cron schedule to install
```

---

## Changelog

### 2026-03-07 — Add Vayne.io API Integration for Automated Sales Nav Scraping

Added full Vayne API integration to eliminate the manual Sales Navigator CSV export step. The module, CLI commands, and orchestrator pipeline are built and ready — activation requires only adding `VAYNE_API_KEY` to `.env` (Vayne Starter plan, $49/mo).

**New module: `modules/vayne.py`**
- `scrape_and_import()` — one-call automation: Sales Nav URL → create order → poll → download CSV → pipeline import
- `people_search_to_pipeline()` — account-based prospecting: find decision makers by company + title + location (100 credits, 25 results)
- `check_health()` — LinkedIn cookie status + credit balance
- `validate_url()` — free URL validation before spending credits
- Order management: `create_order()`, `list_orders()`, `get_order()`, `export_order()`, `wait_for_order()`
- Cookie rotation: `update_cookie()` for when LinkedIn sessions expire

**New CLI commands: `vayne`**
- `vayne health` / `vayne credits` — health check + credit balance
- `vayne validate --url` — free Sales Nav URL validation
- `vayne scrape --url` — scrape + import to pipeline (waits for completion)
- `vayne orders` / `vayne order-status` — order management
- `vayne import-order` — import a completed order
- `vayne search --companies --titles` — people search (account-based)
- `vayne update-cookie` — rotate LinkedIn cookie

**New orchestrator mode: `orchestrate vayne`**
- Full pipeline: Vayne scrape → research → score → enrich → draft → push → Telegram notify
- Same 7-step pipeline as `orchestrate import` but starts from a URL instead of a CSV file

**Daily routine enhancement**
- Vayne health check added to 9am daily cron (non-blocking)
- Expired LinkedIn cookie warning included in Telegram notification

**Current status**: Using Vayne web UI for manual CSV exports (free plan). API integration dormant until Starter plan upgrade.

**Files changed:** `modules/vayne.py` (new), `cli.py`, `orchestrator.py`, `OPERATIONS-GUIDE.md`

### 2026-03-04 — Fix Lead Pipeline Yield (~6% → ~30%+ conversion)

The `fill --target 25` pipeline was completing all 25 rounds but only producing ~15 ready-to-send prospects. Five structural bottlenecks were identified and fixed:

**1. Stop double enrichment** (`email_finder.py`, `orchestrator.py`)
- `batch_find_emails()` internally called `batch_enrich()`, but callers (`_run_enrichment_pass`, `run_campaign`) had already called it — burning Apollo credits twice per round.
- Added `skip_enrichment` parameter; all orchestrator call sites now pass `skip_enrichment=True`.

**2. Domain Search fallback when People Match fails** (`apollo_enrichment.py`)
- When Apollo People Match returned `no_match` for a named prospect, the code gave up entirely.
- Now tries `search_domain_contacts(domain)` as a fallback to find any contact at the company with a verified email.

**3. Retryable enrichment** (`apollo_enrichment.py`, `enrichment.py`)
- `enrichment_status="no_match"` permanently blocked prospects from ever being retried.
- Replaced with `enrichment_attempts` counter — prospects get 2 attempts before being skipped.

**4. Low-yield niche detection + sub-niche injection** (`orchestrator.py`)
- Niches were only marked exhausted when returning exactly 0 results. A niche returning 1-2 duplicates kept getting picked.
- Threshold lowered to < 3 new results. Sub-niches are immediately injected into the queue when a parent niche exhausts.

**5. More LinkedIn People rounds in source rotation** (`orchestrator.py`)
- LinkedIn People (the only source producing named contacts) ran ~4/25 rounds.
- Doubled to ~8/25 rounds by assigning positions 1 and 4 in the 6-round cycle.

**Files changed:** `modules/apollo_enrichment.py`, `modules/email_finder.py`, `modules/enrichment.py`, `orchestrator.py`

### 2026-03-05 — Pipeline Audit: Discovery Throttle Diagnosis

Full audit of the outreach pipeline to understand why `fill --target 25` with 25 rounds only produced ~15 leads (before the yield fixes above). The enrichment fixes (PR #287) improved conversion from discovered → ready_to_send from ~6% to ~30-35%, but a second systemic issue was identified: **all 6 discovery sources are artificially throttled at the DDG query level**.

#### Root cause: All 6 sources use DuckDuckGo

Every discovery module — niche DDG, LinkedIn x-ray, Shopify stores, agencies, job listings, LinkedIn companies — uses DuckDuckGo as its sole data source with different query templates. The queries ARE diverse enough to produce different results (LinkedIn profiles vs Shopify domains vs agency websites), so the sources themselves are effectively unlimited at our scale. The problem is three artificial throttles:

**1. `max_results` per DDG query is capped at ~11**

All discovery modules calculate results per query as:
```python
max_results = limit // len(queries) + 5   # = 20 // 3 + 5 = ~11
```
DDG can return 50-100+ per query. The system asks for a tablespoon when it could ask for a bucket.

Where this is set:
- `modules/discovery.py` line 254: `_ddg_search(query, max_results=limit // len(queries) + 5)` — niche DDG
- `modules/linkedin_discovery.py` line 116: same pattern — LinkedIn people
- `modules/linkedin_discovery.py` line 175: same pattern — LinkedIn companies
- `modules/shopify_discovery.py` line 91: same pattern — Shopify stores
- `modules/google_business.py` line 114: same pattern — agencies
- `modules/job_scraper.py` line 68: same pattern — job listings
- `orchestrator.py` line 751: `batch_discover(niches=niches, limit_per_niche=20)` — the limit fed to all niche discovery

**2. Same queries return same results on repeat**

DDG is deterministic. The niche queue wraps around after 6 niches, so Round 19 "supplements" sends the exact same 3 queries as Round 1 — every result is already in the pipeline. Rounds 19, 21, 25 are wasted unless sub-niches have been injected.

**3. Pipeline-wide dedup is permanent**

`_get_pipeline_domains()` in every discovery module loads ALL prospects ever added (including those already pushed to Instantly and completed). Over multiple days, the dedup set grows and new DDG results increasingly hit existing domains.

#### Expected yield with vs without throttles

**Current (throttled) — 25 rounds:**
```
25 rounds × ~5-10 new per round   = 125-250 discovered
× ~35% enrichment conversion       = ~45-85 ready_to_send
```

**With max_results raised to 30-50 per query — 25 rounds:**
```
25 rounds × ~15-25 new per round   = 375-625 discovered
× ~35% enrichment conversion        = ~130-220 ready_to_send
```

#### Fixes implemented (2026-03-05)

1. **Raised `max_results`** in all 6 discovery modules — DDG queries now request `max(30, ...)` results instead of ~11. Applies to: `discovery.py`, `linkedin_discovery.py`, `shopify_discovery.py`, `google_business.py`, `job_scraper.py`
2. **Raised all orchestrator limits** from 20 to 50 — `batch_discover(limit_per_niche=50)`, LinkedIn people/companies `limit=50`, Shopify `limit=50`, agencies `limit=50`, jobs `limit=50`
3. **Session-level query dedup** — each module's `_ddg_search()` now tracks queries used this session via `_used_queries` set and returns `[]` for repeats. `reset_query_cache()` called at start of each prospect hunt
4. **Raised `max_rounds` default** from 25 to 50 in `run_fill()`

**Files changed:** `modules/discovery.py`, `modules/linkedin_discovery.py`, `modules/shopify_discovery.py`, `modules/google_business.py`, `modules/job_scraper.py`, `orchestrator.py`

### 2026-03-05 — Fix Enrichment Bottleneck & DDG Error Swallowing

A `fill --target 100` test discovered 171 prospects but only 15 reached `ready_to_send` (8.8% conversion). Two root causes fixed:

**1. Apollo credit budgets too low** (`orchestrator.py`)
- Fill mode: `max_credits` raised from 50 → 300 per enrichment pass
- Campaign mode: `max_credits` raised from 100 → 500
- Still well within Apollo's 10,000/month free tier (~333/day)

**2. Consolidated `_ddg_search()` into single shared function** (5 files)
- 5 modules each had their own copy of `_ddg_search()` with separate `_used_queries` sets
- Silent error swallowing: errors returned as `[{"title":"ERROR"...}]` dict entries that polluted downstream results, or were silently dropped
- `reset_query_cache()` only cleared `discovery.py`'s set, not the other 4
- **Fix**: All 4 duplicate modules now import `_ddg_search` from `discovery.py`. Errors are logged via `logging` and return clean `[]`

**3. Pin `typing_extensions`** (`requirements.txt`)
- `ddgs` package depends on `typing_extensions` but doesn't declare it in its metadata
- Without it, every DDG search crashed with `ModuleNotFoundError` but `except Exception` handlers silently swallowed it — the entire previous 100-lead run had zero working DDG searches
- Pinned to `typing_extensions==4.15.0`

**Files changed:** `orchestrator.py`, `modules/discovery.py`, `modules/shopify_discovery.py`, `modules/linkedin_discovery.py`, `modules/google_business.py`, `modules/job_scraper.py`, `requirements.txt`

---

## Sales Navigator CSV Import

Import leads from LinkedIn Sales Navigator into the full outreach pipeline. This replaces the web scraper as the primary lead source — Sales Nav provides real names, roles, and companies that Apollo/Hunter can actually match to email addresses.

### Workflow

1. **Build a lead list in Sales Navigator** — use filters (Title, Industry, Company Size, Geography)
2. **Export to CSV** from Sales Navigator
3. **Upload to VPS:**
   ```bash
   scp ~/Downloads/sales-nav-export.csv ubuntu@152.69.171.177:~/convertra-leads/imports/
   ```
4. **Run the full pipeline:**
   ```bash
   ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177
   cd ~/convertra-leads
   mkdir -p imports
   python3 cli.py orchestrate import --file imports/sales-nav-export.csv --campaign agency-march
   ```

### What the Pipeline Does (7 steps, automated)

| Step | Command | What It Does |
|------|---------|-------------|
| 1. Import | CSV parser | Loads CSV, maps Sales Nav columns, deduplicates against existing pipeline |
| 2. Research | `batch_research` | Scrapes company websites for tech stack, hiring signals, Meta Pixel, pain signals |
| 3. Score | `batch_score` | Evaluates fit based on research intel (12+ = hot, 8-11 = warm) |
| 4. Enrich | `batch_enrich` | Apollo/Hunter finds email addresses using real names + domains |
| 5. Draft | `batch_draft` | AI writes personalized cold emails using research hooks |
| 6. Push | `push_leads` | Sends ready leads to Instantly campaign (optional) |
| 7. Notify | Telegram | Summary notification with counts |

### CLI Commands

**Quick import (just load CSV, no enrichment):**
```bash
python3 cli.py pipeline import-csv --file imports/export.csv --campaign "agency-march"
```

**Full pipeline (import → research → score → enrich → draft → push):**
```bash
python3 cli.py orchestrate import \
  --file imports/export.csv \
  --campaign "agency-march" \
  --score-threshold 8 \
  --push-to "8b466981-54d8-4487-ade3-b27ddab16a4e"
```

### CSV Column Mapping

The importer auto-detects Sales Navigator column names:

| Sales Nav Column | Prospect Field |
|-----------------|---------------|
| First Name + Last Name | `name` |
| Company / Company Name for Leads | `company` |
| Title / Job Title | `role` |
| Person Linkedin Url | `linkedin_url` |
| Website / Company Website | `company_url` |
| Industry | `company_type` (inferred) |
| Geography / Location | `notes` |
| Company Size | `notes` |
| Email (if available) | `email` |

### Deduplication

Prospects are deduplicated by:
1. **LinkedIn URL** — normalized (strips query params, trailing slashes)
2. **Name + Company** — exact match (case-insensitive)

### Files

| File | Purpose |
|------|---------|
| `modules/csv_importer.py` | CSV parser, column mapping, dedup, prospect creation |
| `cli.py` | `pipeline import-csv` and `orchestrate import` commands |
| `orchestrator.py` | `run_import()` — 7-step automated pipeline |

---

## Vayne — Automated LinkedIn Sales Navigator Scraping

Vayne (vayne.io) is a LinkedIn Sales Navigator scraping service. Currently used via the web UI for manual CSV exports. The API integration is built and ready to activate — it eliminates the manual export step entirely.

### Current Workflow (Manual — No API Key Required)

1. **Build a lead list in Sales Navigator** — filter by title, industry, company size, geography
2. **Copy the Sales Nav search URL** into Vayne's web UI
3. **Vayne scrapes LinkedIn** using your connected LinkedIn cookie
4. **Download the CSV** from Vayne's dashboard
5. **Upload to VPS and run the pipeline:**
   ```bash
   scp ~/Downloads/vayne-export.csv ubuntu@152.69.171.177:~/convertra-leads/imports/
   ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177
   cd ~/convertra-leads
   python3 cli.py orchestrate import \
     --file imports/vayne-export.csv \
     --campaign "agency-march" \
     --source vayne \
     --push-to "8b466981-54d8-4487-ade3-b27ddab16a4e"
   ```

This uses the same `orchestrate import` pipeline as Sales Nav CSV exports. Vayne's CSV format is compatible with the existing column mapper.

### Future Workflow (Automated — Requires Vayne Starter Plan + API Key)

When ready to upgrade, add `VAYNE_API_KEY` to `.env` and the entire manual step disappears:

```bash
# One command: Sales Nav URL → scrape → research → score → enrich → draft → push
python3 cli.py orchestrate vayne \
  --url "https://www.linkedin.com/sales/search/people?query=..." \
  --campaign "agency-march" \
  --score-threshold 8 \
  --push-to "8b466981-54d8-4487-ade3-b27ddab16a4e"
```

No browser, no manual CSV download, no SCP upload. The API handles:
1. Validate the Sales Nav URL (free, no credits)
2. Submit the scraping order
3. Poll until complete (up to 10 minutes)
4. Download CSV → import to pipeline
5. Research → score → enrich → draft → push (same as `orchestrate import`)
6. Telegram notification with full results

### Vayne CLI Commands

```bash
# Health check (LinkedIn cookie + credit balance)
python3 cli.py vayne health

# Check credit balance
python3 cli.py vayne credits

# Validate a Sales Nav URL (free — no credits consumed)
python3 cli.py vayne validate --url "https://linkedin.com/sales/search/..."

# Scrape + import to pipeline (waits for completion)
python3 cli.py vayne scrape \
  --url "https://linkedin.com/sales/search/..." \
  --campaign "dtc-march" \
  --limit 500

# List all orders
python3 cli.py vayne orders

# Check order status
python3 cli.py vayne order-status --order-id 123

# Import a completed order to pipeline
python3 cli.py vayne import-order --order-id 123

# People search: find decision makers at specific companies (100 credits)
python3 cli.py vayne search \
  --companies "https://linkedin.com/company/meta/,https://linkedin.com/company/shopify/" \
  --titles "Head of Growth,Media Buyer,CMO"

# Update LinkedIn cookie (when it expires)
python3 cli.py vayne update-cookie --cookie "AQEDAx..."
```

### People Search (Account-Based Prospecting)

The `vayne search` command is distinct from order-based scraping. It searches LinkedIn by company + job title + location and returns up to 25 profiles per call (costs 100 credits).

Best use case: when your scoring identifies a hot company, immediately find the right decision makers there without building a full Sales Nav search.

```bash
# Find media buyers at specific companies
python3 cli.py vayne search \
  --companies "https://linkedin.com/company/gymshark/,https://linkedin.com/company/huel/" \
  --titles "Media Buyer,Head of Performance,CMO" \
  --locations "United Kingdom"
```

Results are deduplicated against the existing pipeline and added at `discovered` stage.

### Health Monitoring

When `VAYNE_API_KEY` is set, the daily cron routine (9am) automatically checks:
- LinkedIn cookie status (active/expired)
- Credit balance

If the LinkedIn cookie has expired, the daily Telegram notification includes a warning:
```
⚠️ Vayne LinkedIn cookie expired — update via: cli.py vayne update-cookie
```

### Vayne API Limits

| Limit | Value |
|-------|-------|
| Daily scraping | Up to 15,000 profiles |
| Rate limit (burst) | 3 requests per 5 seconds |
| Rate limit (sustained) | 20 requests per minute |
| People search | 25 profiles per call, 100 credits |
| Order export formats | Simple or Advanced CSV |

### Pricing (Vayne.io)

API access requires the Starter plan. The web UI works on the free plan.

| Plan | API Access | Credits |
|------|-----------|---------|
| Free | Web UI only | Limited |
| Starter ($49/mo) | Full API | Included |

### When to Upgrade

Upgrade to the Starter plan when:
- You're running outbound campaigns regularly (weekly+)
- The manual CSV export step is a bottleneck
- You want to automate the full Sales Nav → Instantly pipeline on cron

The module, CLI commands, and orchestrator integration are already built. Adding the API key is the only step needed.
