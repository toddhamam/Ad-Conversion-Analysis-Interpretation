---
title: VPS Deployment
type: entity
sources: [raw/ops-runbook.md, raw/operations-guide.md]
related: [[openclaw-architecture]], [[convertra-leads-cli]], [[cron-automation]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# VPS Deployment

Oracle Cloud VPS hosting the Convertra Ops Bot and Leads CLI [source: raw/ops-runbook.md].

## Access

```bash
ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177
```

## Key Components

| Component | Value |
|-----------|-------|
| VPS | Oracle Cloud — `152.69.171.177` |
| Container | `alpine/openclaw:latest` via Docker Compose |
| Docker Compose | `/home/ubuntu/openclaw-deploy/docker-compose.yml` |
| Bot | `@convertra_ops_bot` on Telegram |
| Gmail | `convertraiq@gmail.com` |

## File Locations

| Path | Purpose |
|------|---------|
| `/home/ubuntu/.openclaw/openclaw.json` | Main OpenClaw config |
| `/home/ubuntu/.openclaw/workspace/skills/` | Custom skills (highest precedence) |
| `/home/ubuntu/.openclaw/workspace/AGENTS.md` | Bot personality |
| `/home/ubuntu/openclaw-deploy/docker-compose.yml` | Docker config |
| `/home/ubuntu/convertra-leads/` | Python CLI for outreach |

## Related

- [[openclaw-architecture]] — How skills are loaded in Docker
- [[convertra-leads-cli]] — The Python CLI running on this VPS
- [[cron-automation]] — Scheduled jobs on this VPS
