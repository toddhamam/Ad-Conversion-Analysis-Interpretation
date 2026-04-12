---
title: OpenClaw Architecture
type: concept
sources: [raw/ops-runbook.md]
related: [[vps-deployment]], [[convertra-leads-cli]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# OpenClaw Architecture

Three-layer skill loading system for the Convertra Ops Bot [source: raw/ops-runbook.md].

## Three-Layer Loading

1. **Gateway registers** all skills from `/app/skills/` (bundled) and `~/.openclaw/workspace/skills/` (workspace) as slash commands at startup
2. **Eligibility filtering** determines which skills the AI agent can see:
   - Bundled skills filtered by internal `allowBundled` allowlist (~5 pass)
   - **Workspace skills bypass the filter entirely** — always eligible
   - Skills with `metadata.openclaw.requires` gates filtered if requirements unmet
3. **Session snapshot** — eligible skill list frozen at session start, persists for session life

## Critical: Why Custom Skills Must Be in Workspace

Custom skills in `/app/skills/` (bundled) get filtered by the allowlist. Only `~/.openclaw/workspace/skills/` guarantees eligibility.

Docker Compose has both volume mounts:
- `/app/skills/` → merged bundled + custom set (NOT enough alone)
- `~/.openclaw/` → includes `workspace/skills/` (**this is what makes custom skills work**)

## Session Snapshot Gotcha

Skills are snapshotted per-session and cached. New skills added after session start are invisible. Fix:

```bash
cd /home/ubuntu/openclaw-deploy
sudo docker compose down
sudo rm -f /home/ubuntu/.openclaw/agents/main/sessions/*.jsonl
sudo rm -f /home/ubuntu/.openclaw/agents/main/sessions/sessions.json
sudo docker compose up -d
```

**Warning**: Clears conversation history. Bot starts fresh.

## Related

- [[vps-deployment]] — Where OpenClaw runs
- [[convertra-leads-cli]] — The CLI skills wrap around
