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

Edit `/home/ubuntu/convertra-leads/.env` and add these lines:

```bash
# Existing (keep these)
META_ACCESS_TOKEN=...
GMAIL_ADDRESS=convertraiq@gmail.com
GMAIL_APP_PASSWORD=...

# Core (add these)
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Hunter.io enrichment (optional but recommended)
HUNTER_API_KEY=your-hunter-api-key
```

**Where to get these:**
- `OPENAI_API_KEY` — From https://platform.openai.com/api-keys
- `TELEGRAM_BOT_TOKEN` — Already exists in your OpenClaw config (`/home/ubuntu/.openclaw/openclaw.json`), or from @BotFather
- `TELEGRAM_CHAT_ID` — Send a message to your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` and look for `chat.id`
- `HUNTER_API_KEY` — From Hunter.io → API → Copy your API key. Free plan: 25 searches/month, all endpoints accessible

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
# Daily routine: 9am AEST weekdays
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

## 2. Daily Operations (Automated)

Once cron is installed, the daily routine runs itself every weekday at 9am. You don't need to do anything — just watch Telegram for the summary card.

### What happens automatically each morning

1. **Inbox check** — Reads Gmail via IMAP, cross-references against pipeline
   - Bounces → marks prospect as `invalid_email`
   - Opt-outs (mentions "stop", "unsubscribe") → marks as `opted_out`
   - Positive replies → marks as `replied_interested`
   - Deferrals ("not right now", "maybe later") → marks as `replied_not_now`
   - Negative replies → marks as `replied_not_interested`

2. **Follow-up sends** — Checks which prospects are due for follow-ups
   - Uses pre-built templates (NOT AI) — zero tokens
   - Follows the 3/7/14 day sequence: followup_1 → followup_2 → breakup
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

## 3. Running a Campaign (Manual)

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

## 4. Prospect Hunt (Persistent Discovery)

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

## 5. Individual Commands

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
# Search by niche
python3 cli.py discover search --niche supplements --limit 30

# Search by custom keywords
python3 cli.py discover search --keywords "DTC brand,performance marketing"

# Search across all niches
python3 cli.py discover batch --niches "supplements,skincare,fitness"

# Find companies hiring media buyers (NEW)
python3 cli.py discover jobs --keywords "media buyer,paid social manager"

# Search LinkedIn profiles
python3 cli.py discover linkedin --query "CMO DTC brand"
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

### Hunter.io enrichment

```bash
# Enrich a single person (uses 1 search credit)
python3 cli.py enrich person --name "Jane Smith" --domain example.com

# Enrich a pipeline prospect by ID
python3 cli.py enrich prospect --id p_042

# Batch enrich all researched prospects
python3 cli.py enrich batch --stage researched --score-min 5
```

Hunter.io finds verified emails via the Email Finder API, then enriches with job titles, LinkedIn URLs, seniority, and location via the People Enrichment API. All of this feeds into more personalized cold email drafts. If `HUNTER_API_KEY` is not set, enrichment is silently skipped and email finding falls back to pattern guessing.

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

#### Optimized Email Copy Formula (v4)

Every cold email follows a strict 5-part structure. The AI drafter and fallback templates both use this formula.

```
1. GREETING:     Hi {first_name},
2. OPENING:      Just [specific observation about their business]
3. PITCH:        The bottleneck is [problem]. Convertra automates all of this:
                 it maps the patterns already winning in your Meta account,
                 then auto-generates (and publishes) winning creatives inside
                 your ad account... without waiting on designers, copywriters,
                 or even media buyers.
4. CTA:          I shot a quick 2-min video for you showing exactly how this
                 could work for {company}. Want me to send it across?
5. SIGN-OFF:     {sender_name}
```

**Copy rules:**
- NEVER use em dashes. They are a dead giveaway of AI-written copy. Use periods, commas, or ellipsis instead.
- Opening must start with "Just" + a specific observation (product launches, hiring signals, ad activity)
- Pitch uses "maps" (not "finds"), includes "(and publishes)", and ends with "media buyers" (not "in-house staff")
- Subject format: `[company name] ad creative` (lowercase). Agencies: `[company name]'s creative pipeline`
- No "Reply STOP to opt out", no links, under 100 words, plain text only

**Follow-up sequence (templates, no AI):**
- Follow-up 1 (day 3): "Convertra also publishes directly inside your ad account" angle
- Follow-up 2 (day 7): "2-3 days per creative vs. minutes" angle
- Breakup (day 14): Graceful exit, leave door open

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

## 6. Monitoring

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

## 7. Typical Weekly Workflow

| Day | What Happens | Your Action |
|-----|-------------|-------------|
| **Mon-Fri 9am** | Cron runs daily routine automatically | Check Telegram summary |
| **Monday 10am** | Cron runs weekly review | Review red flags in Telegram |
| **When pipeline is low** | Weekly review says "< 10 ready to send" | SSH in, run a campaign |
| **When you get a reply** | Daily routine auto-classifies it | Check Telegram, follow up personally if interested |
| **Monthly** | Optional scheduled campaign | Uncomment the monthly cron line |

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

## 8. Token Cost Summary

| Operation | Tokens | Frequency |
|-----------|--------|-----------|
| Daily routine (inbox, follow-ups, sends) | **0** | Every weekday |
| Weekly review (health check, red flags) | **0** | Every Monday |
| Campaign discovery + research + scoring | **0** | As needed |
| Email finding (DNS + web search) | **0** | As needed |
| **Email drafting (GPT-5.2)** | **~500 per email** | Per prospect |
| Follow-up emails (templates) | **0** | Automatic |
| Telegram notifications | **0** | Every run |

**Estimated monthly cost at 20 prospects/week**: ~40K tokens/month (~$0.50)
**vs. OpenClaw**: ~2M+ tokens/month

---

## 9. File Reference

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
│   ├── enrichment.py        ← Hunter.io Email Finder + People Enrichment (NEW)
│   ├── mailer.py            ← Gmail SMTP + warmup
│   ├── inbox.py             ← Gmail IMAP reader
│   ├── followup.py          ← Sequence scheduling
│   ├── reporter.py          ← Pipeline metrics
│   ├── drafter.py           ← GPT-5.2 email drafting (NEW)
│   ├── job_scraper.py       ← Job listing scraper (NEW)
│   └── notifier.py          ← Telegram notifications (NEW)
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
