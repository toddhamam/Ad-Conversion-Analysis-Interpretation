---
name: pipeline-tracker
description: CRM-style pipeline tracking for outreach prospects. Track stages, log interactions, manage follow-ups, and report on campaign performance.
user-invocable: true
metadata: {"openclaw":{"emoji":"📊"}}
---

# Pipeline Tracker — Outreach CRM

Track all outreach prospects, their stages, interactions, and follow-up schedules using a JSON-based pipeline file.

## Pipeline File Structure

The pipeline lives at `pipeline.json` in the workspace. Structure:

```json
{
  "metadata": {
    "created": "2026-02-18",
    "last_updated": "2026-02-18",
    "total_prospects": 0,
    "campaigns": ["campaign-name"]
  },
  "prospects": []
}
```

### Prospect Schema

Each prospect in the `prospects` array:

```json
{
  "id": "p_001",
  "name": "Jane Smith",
  "email": "jane@company.com",
  "company": "Acme DTC",
  "role": "CMO",
  "company_url": "https://acmedtc.com",
  "linkedin_url": "https://linkedin.com/in/janesmith",
  "company_type": "dtc_brand",
  "fit_score": 8,
  "campaign": "feb-2026-dtc",
  "stage": "researched",
  "personalization_hooks": [
    "Just launched new product line",
    "Posted about creative fatigue on LinkedIn"
  ],
  "pain_signals": [
    "Hiring for 2 creative designers",
    "Running 80+ variants in Ad Library"
  ],
  "interactions": [
    {
      "type": "email_sent",
      "date": "2026-02-18T09:30:00Z",
      "subject": "quick question about Acme's ad creative",
      "sequence_step": 1,
      "notes": "Initial outreach — referenced their LinkedIn post"
    }
  ],
  "next_action": {
    "type": "followup_1",
    "date": "2026-02-21",
    "notes": "Follow up if no reply by this date"
  },
  "tags": ["high-priority", "agency-referral"],
  "notes": "Warm intro possible through Mike at XYZ agency",
  "created": "2026-02-18",
  "updated": "2026-02-18"
}
```

### Prospect Stages

| Stage | Meaning | Next Action |
|---|---|---|
| `researched` | Prospect identified and qualified | Draft email, get user approval |
| `ready_to_send` | Email drafted and approved | Send initial email |
| `email_1_sent` | Initial email sent | Wait 3 days, then follow up |
| `followup_1_sent` | First follow-up sent | Wait 4 days, then follow up |
| `followup_2_sent` | Second follow-up sent | Wait 7 days, then breakup email |
| `breakup_sent` | Final email in sequence | Wait 7 days, then mark complete |
| `sequence_complete` | All emails sent, no reply | Archive or revisit in 60 days |
| `replied_interested` | Positive reply received | Schedule call, send calendar link |
| `replied_not_now` | Timing not right | Set reminder date, follow up later |
| `replied_not_interested` | Not interested | Close gracefully |
| `meeting_scheduled` | Call/meeting booked | Prep and attend meeting |
| `meeting_completed` | Had the conversation | Follow up with next steps |
| `opportunity` | Active sales opportunity | Track deal progress |
| `won` | Closed deal | Onboard |
| `lost` | Lost opportunity | Log reason, revisit in 90 days |
| `opted_out` | Requested to stop emails | Never contact again |
| `invalid_email` | Email bounced | Find new email or discard |

## Pipeline Operations

### Add a Prospect

Read pipeline.json, append the new prospect to the `prospects` array, update metadata counts, and write back.

### Update Stage

When a prospect moves stages:
1. Read pipeline.json
2. Find prospect by id
3. Update `stage` and `updated` fields
4. Add an entry to `interactions` array
5. Set `next_action` based on the new stage
6. Write back

### Log an Interaction

After every email sent or received:
1. Read pipeline.json
2. Find prospect by id
3. Append to `interactions`:
```json
{
  "type": "email_sent | email_received | call | meeting | note",
  "date": "ISO timestamp",
  "subject": "Subject or summary",
  "sequence_step": 1,
  "notes": "Details"
}
```
4. Update `next_action` with the next step
5. Write back

### Get Daily Actions

Each day, check the pipeline for due actions:

```
1. Read pipeline.json
2. Find all prospects where next_action.date <= today
3. Group by action type:
   - followup_1: Prospects needing first follow-up
   - followup_2: Prospects needing second follow-up
   - breakup: Prospects needing breakup email
   - check_reply: Prospects to check for responses
4. Present the action list to the user
```

### Campaign Report

Generate performance metrics for a campaign:

```
Total prospects: X
Emails sent: X
  - Initial: X
  - Follow-up 1: X
  - Follow-up 2: X
  - Breakup: X
Replies received: X (X% reply rate)
  - Interested: X
  - Not now: X
  - Not interested: X
  - Opted out: X
Meetings scheduled: X
Bounce rate: X%
Pipeline value:
  - Researched: X
  - In sequence: X
  - Replied (active): X
  - Meetings: X
  - Opportunities: X
  - Won: X
  - Lost: X
```

## Important Rules

1. **Always read the latest pipeline.json before any modification** — another skill may have updated it
2. **Never modify a prospect's email or name without user confirmation**
3. **Never remove an opted-out prospect** — keep them flagged so they're never contacted again
4. **Always update timestamps** (`updated` field) when modifying a prospect
5. **Back up pipeline.json** periodically by copying to `pipeline-backup-{date}.json`
6. **Generate prospect IDs sequentially** — p_001, p_002, etc.
7. **Log every interaction** — even manual notes from the user
