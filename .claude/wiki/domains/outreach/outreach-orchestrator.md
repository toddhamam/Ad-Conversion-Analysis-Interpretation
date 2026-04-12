---
title: Outreach Orchestrator
type: entity
sources: [raw/operations-guide.md]
related: [[outreach-workflow]], [[lead-enrichment-pipeline]], [[cron-automation]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Outreach Orchestrator

`orchestrator.py` automates the daily outreach pipeline via cron jobs on the VPS [source: raw/operations-guide.md].

## Cron Schedule

```cron
# Daily fill: 7am AEST weekdays — hunt leads + push to Instantly
0 7 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py fill --target 25

# Daily routine: 9am AEST weekdays — inbox check, follow-ups, reports
0 9 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py daily
```

## `fill` Command

Hunts new leads up to the daily target (25) and pushes them to Instantly for sending. Runs the [[lead-enrichment-pipeline]] end-to-end.

## `daily` Command

- Inbox check (replies, bounces, opt-outs)
- Process follow-ups due today
- Generate daily report
- Send notification via Telegram

## Logs

Stored at `/home/ubuntu/convertra-leads/logs/fill.log` and `daily.log`.

## Related

- [[outreach-workflow]] — The manual version of what this automates
- [[lead-enrichment-pipeline]] — What the `fill` command runs
- [[cron-automation]] — VPS cron infrastructure
