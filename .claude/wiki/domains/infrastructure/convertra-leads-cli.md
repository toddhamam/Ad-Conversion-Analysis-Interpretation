---
title: Convertra Leads CLI
type: entity
sources: [raw/operations-guide.md, raw/ops-runbook.md]
related: [[vps-deployment]], [[outreach-workflow]], [[outreach-orchestrator]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Convertra Leads CLI

Pure Python CLI at `/home/ubuntu/convertra-leads/` powering all outreach operations. All 9 OpenClaw skills are thin wrappers around this CLI [source: raw/ops-runbook.md].

## Structure

```
/home/ubuntu/convertra-leads/
├── cli.py              # Main dispatcher
├── orchestrator.py     # Automated daily routines
├── config.py           # .env + config.json loader
├── requirements.txt    # requests, beautifulsoup4, dnspython, ddgs
├── .env                # API keys (synced with local ops/convertra-leads/.env)
├── modules/            # 10 Python modules
│   ├── drafter.py      # AI email drafting
│   ├── job_scraper.py  # Job listing discovery
│   └── notifier.py     # Telegram notifications
└── data/               # pipeline.json, config.json, templates.json
```

## Key Command Groups

```bash
cli.py discover   # Prospect discovery
cli.py research   # Company intelligence
cli.py score      # Lead scoring (17-point rubric)
cli.py email      # Email finding and verification
cli.py mail       # Send emails, daily status, warmup tracking
cli.py inbox      # Read inbox, cross-reference pipeline
cli.py followup   # Follow-up scheduling
cli.py pipeline   # Pipeline management (list, get, update)
cli.py report     # Daily metrics report
cli.py notify     # Telegram notifications
```

## Deployment

```bash
scp -i ~/.ssh/convertra-ops.key -r ops/convertra-leads/* ubuntu@152.69.171.177:/home/ubuntu/convertra-leads/
ssh ubuntu@152.69.171.177 "cd /home/ubuntu/convertra-leads && pip3 install -r requirements.txt"
```

Both `.env` files (local and VPS) must stay in sync. Local copy is gitignored.

## Related

- [[vps-deployment]] — Where the CLI runs
- [[outreach-workflow]] — What the CLI commands map to
- [[outreach-orchestrator]] — Automated daily runs
