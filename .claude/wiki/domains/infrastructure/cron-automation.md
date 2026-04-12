---
title: Cron Automation
type: concept
sources: [raw/operations-guide.md]
related: [[vps-deployment]], [[outreach-orchestrator]], [[convertra-leads-cli]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Cron Automation

Scheduled jobs on the VPS automating daily outreach operations [source: raw/operations-guide.md].

## Schedule

```cron
# Daily fill: 7am AEST weekdays — hunt leads + push to Instantly
0 7 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py fill --target 25 >> logs/fill.log 2>&1

# Daily routine: 9am AEST weekdays — inbox check, follow-ups, reports
0 9 * * 1-5 cd /home/ubuntu/convertra-leads && python3 orchestrator.py daily >> logs/daily.log 2>&1
```

## Logs

- `/home/ubuntu/convertra-leads/logs/fill.log` — Lead discovery output
- `/home/ubuntu/convertra-leads/logs/daily.log` — Inbox/follow-up/report output

## Related

- [[outreach-orchestrator]] — The orchestrator these crons invoke
- [[vps-deployment]] — The VPS where crons run
- [[convertra-leads-cli]] — The CLI the orchestrator wraps
