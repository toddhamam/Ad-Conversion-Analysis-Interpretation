---
name: pipeline-tracker
description: CRM-style pipeline tracking for outreach prospects. Track stages, log interactions, manage follow-ups, and report on campaign performance.
user-invocable: true
metadata: {"openclaw":{"emoji":"📊"}}
---

# Pipeline Tracker — Outreach CRM

Track all outreach prospects using the Convertra Leads CLI. All operations are handled by the CLI — no AI needed.

## Commands

### List Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list [--stage researched] [--campaign feb-2026] [--tag hot] [--limit 20]
```

### Get a Specific Prospect

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline get --id p_001
```

### Add a Prospect

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline add --json '{"name":"Jane Smith","company":"Acme DTC","role":"CMO","company_url":"https://acmedtc.com","company_type":"dtc_brand","campaign":"feb-2026","source":"ad_library_scrape"}'
```

Required fields: `name`, `company`. Optional: `email`, `role`, `company_url`, `linkedin_url`, `company_type`, `campaign`, `source`, `tags`, `notes`.

### Update a Prospect

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline update --id p_001 --stage email_1_sent --interaction '{"type":"email_sent","subject":"quick question about Acme","sequence_step":1,"notes":"Initial outreach"}'
```

### Search Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline search --query "acme"
```

### Get Due Actions

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline due [--date 2026-02-23]
```

### Backup Pipeline

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline backup
```

### Campaign Report

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py report campaign [--campaign feb-2026]
```

### Pipeline Summary

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py report pipeline-summary
```

### Daily Report

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py report daily
```

## Prospect Stages

| Stage | Meaning | Next Action |
|---|---|---|
| `researched` | Prospect identified and qualified | Draft email |
| `ready_to_send` | Email drafted and approved | Send initial email |
| `email_1_sent` | Initial email sent | Wait 3 days, then follow up |
| `followup_1_sent` | First follow-up sent | Wait 4 days |
| `followup_2_sent` | Second follow-up sent | Wait 7 days |
| `breakup_sent` | Final email in sequence | Wait 7 days |
| `sequence_complete` | All emails sent, no reply | Archive or revisit |
| `replied_interested` | Positive reply | Schedule call |
| `replied_not_now` | Timing not right | Set reminder |
| `replied_not_interested` | Not interested | Close |
| `meeting_scheduled` | Call booked | Attend meeting |
| `meeting_completed` | Had conversation | Follow up |
| `opportunity` | Active deal | Track progress |
| `won` | Closed deal | Onboard |
| `lost` | Lost | Log reason |
| `opted_out` | Requested stop | Never contact again |
| `invalid_email` | Bounced | Find new email |

## When to Use AI

Never. All pipeline operations are deterministic. Just run the CLI commands and format the JSON output for Telegram.
