# Convertra Ops Bot — OpenClaw Skills Runbook

## Infrastructure

| Component | Value |
|-----------|-------|
| VPS | Oracle Cloud — `152.69.171.177` |
| SSH | `ssh -i ~/.ssh/convertra-ops.key ubuntu@152.69.171.177` |
| Container | `alpine/openclaw:latest` via Docker Compose |
| Docker Compose | `/home/ubuntu/openclaw-deploy/docker-compose.yml` |
| Bot | `@convertra_ops_bot` on Telegram |
| Gmail | `convertraiq@gmail.com` (App Password: stored in openclaw.json) |

## File Locations on VPS

| Path | Purpose |
|------|---------|
| `/home/ubuntu/.openclaw/openclaw.json` | Main OpenClaw config (skills entries, env vars, channels, models) |
| `/home/ubuntu/.openclaw/workspace/skills/` | **Custom skills live here** (workspace location — highest precedence, bypasses bundled allowlist) |
| `/home/ubuntu/.openclaw/workspace/AGENTS.md` | Bot personality and instructions |
| `/home/ubuntu/.openclaw/agents/main/sessions/` | Session files with cached skill snapshots |
| `/home/ubuntu/openclaw-deploy/docker-compose.yml` | Docker Compose config with volume mounts |
| `/home/ubuntu/openclaw-skills-merged/` | Merged skills directory (bundled + custom, mounted over `/app/skills/`) |

## How Skills Work (Critical Knowledge)

### Three-Layer Loading

1. **Gateway registers** all skills from `/app/skills/` (bundled) and `~/.openclaw/workspace/skills/` (workspace) as slash commands at startup
2. **Eligibility filtering** determines which registered skills become available to the AI agent:
   - Bundled skills (`/app/skills/`) are filtered by an internal `allowBundled` allowlist — only ~5 pass by default
   - Workspace skills (`~/.openclaw/workspace/skills/`) **bypass** the `allowBundled` filter entirely
   - Skills with `metadata.openclaw.requires` gates are filtered if requirements aren't met
3. **Session snapshot** — when a new session starts, the eligible skill list is frozen into a `skillsSnapshot` that persists for the life of that session

### Why Custom Skills Must Be in Workspace

Custom skills placed in `/app/skills/` (bundled location) are treated as bundled and get filtered by the internal allowlist. Only the workspace location (`~/.openclaw/workspace/skills/`) guarantees eligibility.

Our docker-compose has both:
- Volume mount over `/app/skills/` (for bundled + custom merged set) — **this alone is NOT enough**
- Volume mount of `~/.openclaw` (which includes `workspace/skills/`) — **this is what makes custom skills work**

### Session Snapshot Caching (The Gotcha)

**Skills are snapshotted per-session and cached.** If you add new skills after a session already exists, that session will never see them. The fix:

```bash
# Stop container, delete session files, restart
cd /home/ubuntu/openclaw-deploy
sudo docker compose down
sudo rm -f /home/ubuntu/.openclaw/agents/main/sessions/*.jsonl
sudo rm -f /home/ubuntu/.openclaw/agents/main/sessions/sessions.json
sudo docker compose up -d
```

**Warning:** This clears conversation history. The bot starts fresh.

## Current Custom Skills (8)

All stored at `/home/ubuntu/.openclaw/workspace/skills/`:

| Skill | Slash Command | Purpose |
|-------|--------------|---------|
| `gmail-send` | `/gmail_send` | Send emails via Gmail SMTP |
| `gmail-read` | `/gmail_read` | Read/search inbox via IMAP |
| `cold-outreach` | `/cold_outreach` | End-to-end cold email campaigns |
| `prospect-research` | `/prospect_research` | Find & qualify targets |
| `pipeline-tracker` | `/pipeline_tracker` | JSON-based CRM pipeline |
| `email-warmup` | `/email_warmup` | Gmail sender reputation building |
| `follow-up-sequences` | `/follow_up_sequences` | Automated drip campaigns |
| `lead-enrichment` | `/lead_enrichment` | Email discovery & company intel |

## SKILL.md Metadata Format

Custom skills MUST use this clean format. Do NOT include `requires` gates:

```yaml
---
name: skill-name
description: What the skill does and when to use it.
user-invocable: true
metadata: {"openclaw":{"emoji":"..."}}
---
```

**Never add** `requires.bins` or `requires.env` to metadata — these create eligibility gates that filter the skill out if the binary/env var isn't detected at load time.

Environment variables are instead injected via `skills.entries` in `openclaw.json`:

```json
"skills": {
  "entries": {
    "gmail-send": {
      "enabled": true,
      "env": {
        "GMAIL_ADDRESS": "convertraiq@gmail.com",
        "GMAIL_APP_PASSWORD": "..."
      }
    }
  }
}
```

## How to Add a New Skill

1. **Create the skill directory** on the VPS:
   ```bash
   sudo mkdir -p /home/ubuntu/.openclaw/workspace/skills/new-skill
   ```

2. **Create SKILL.md** with clean metadata (no `requires` gates):
   ```bash
   sudo tee /home/ubuntu/.openclaw/workspace/skills/new-skill/SKILL.md << 'EOF'
   ---
   name: new-skill
   description: What this skill does.
   user-invocable: true
   metadata: {"openclaw":{"emoji":"..."}}
   ---

   # Skill instructions here...
   EOF
   ```

3. **Add to `openclaw.json`** `skills.entries` if env vars are needed:
   ```bash
   # Edit /home/ubuntu/.openclaw/openclaw.json
   # Add under skills.entries:
   "new-skill": { "enabled": true, "env": { ... } }
   ```

4. **Also copy to merged directory** (for bundled path consistency):
   ```bash
   sudo cp -r /home/ubuntu/.openclaw/workspace/skills/new-skill /home/ubuntu/openclaw-skills-merged/new-skill
   ```

5. **Delete sessions and restart**:
   ```bash
   cd /home/ubuntu/openclaw-deploy
   sudo docker compose down
   sudo rm -f /home/ubuntu/.openclaw/agents/main/sessions/*.jsonl
   sudo rm -f /home/ubuntu/.openclaw/agents/main/sessions/sessions.json
   sudo docker compose up -d
   ```

6. **Test** — send the bot a message and verify it lists the new skill.

## How to Update an Existing Skill

1. **Edit the SKILL.md** in the workspace location:
   ```bash
   sudo nano /home/ubuntu/.openclaw/workspace/skills/skill-name/SKILL.md
   ```

2. **Also update the merged copy**:
   ```bash
   sudo cp /home/ubuntu/.openclaw/workspace/skills/skill-name/SKILL.md /home/ubuntu/openclaw-skills-merged/skill-name/SKILL.md
   ```

3. **Delete sessions and restart** (same as above) — required because the SKILL.md body is only loaded on-demand, but the skill description in the system prompt comes from the snapshot.

## Troubleshooting

### Bot doesn't list custom skills
1. Check workspace: `sudo ls /home/ubuntu/.openclaw/workspace/skills/`
2. Check metadata: `sudo head -6 /home/ubuntu/.openclaw/workspace/skills/SKILL-NAME/SKILL.md` — ensure no `requires` gates
3. Delete sessions and restart (see above)
4. Verify snapshot: `sudo cat /home/ubuntu/.openclaw/agents/main/sessions/sessions.json | python3 -m json.tool | grep -A2 name`

### Bot not responding after restart
- Check container: `sudo docker ps -a`
- Check logs: `sudo docker logs openclaw-deploy-openclaw-gateway-1 2>&1`
- Check internal logs: `sudo docker exec openclaw-deploy-openclaw-gateway-1 cat /tmp/openclaw/openclaw-*.log`

### Skill loads but doesn't work (e.g., email fails)
- Verify env vars in `openclaw.json` under `skills.entries`
- For Gmail: ensure IMAP is enabled in Gmail Settings > Forwarding and POP/IMAP
- For Gmail: ensure App Password is correct (16 chars, no spaces)

## Docker Compose Volume Mounts

```yaml
volumes:
  - /home/ubuntu/.openclaw:/home/node/.openclaw          # Config + workspace + sessions
  - /home/ubuntu/.openclaw/workspace:/home/node/.openclaw/workspace  # Workspace (skills live here)
  - /home/ubuntu/openclaw-skills-merged:/app/skills       # Bundled skills override
```

All three are required. The workspace mount is what gives custom skills eligibility.

## Prerequisites Checklist

- [x] VPS SSH access configured (`~/.ssh/convertra-ops.key`)
- [x] Docker and Docker Compose installed on VPS
- [x] OpenClaw container running (`alpine/openclaw:latest`)
- [x] Telegram bot token configured in `openclaw.json`
- [x] Gmail App Password generated (2FA enabled on Google account)
- [x] Custom skills in workspace directory with clean metadata
- [x] Skills entries in `openclaw.json` with env vars
- [ ] IMAP enabled on convertraiq@gmail.com (required for gmail-read)
