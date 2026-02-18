---
name: follow-up-sequences
description: Manage automated follow-up email sequences. Track timing, draft context-aware follow-ups, and handle sequence progression.
user-invocable: true
metadata: {"openclaw":{"emoji":"🔄","requires":{"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Follow-Up Sequences — Automated Drip Campaigns

This skill manages the timing and content of follow-up email sequences for prospects who haven't replied to the initial outreach.

## Default Sequence Timing

| Step | Delay After Previous | Email Type |
|---|---|---|
| Email 1 | Day 0 | Initial outreach |
| Follow-up 1 | +3 days | Gentle bump |
| Follow-up 2 | +4 days (Day 7) | Value-add |
| Breakup | +7 days (Day 14) | Graceful close |

## Before Sending Any Follow-Up

**ALWAYS do these checks first:**

1. **Check inbox for replies** from this prospect (use gmail-read skill)
2. **Check pipeline.json** — verify the prospect hasn't been updated by user
3. **Verify the prospect hasn't opted out** — stage must NOT be "opted_out"
4. **Verify the email is still valid** — stage must NOT be "invalid_email"
5. **Check the date** — don't send on weekends or holidays

## Follow-Up Templates

### Follow-Up 1: The Bump (Day 3)

Purpose: Short, casual reminder. Reply to the original thread.

```
Hey [first name],

Just floating this back up — I know how buried inboxes get.

[One sentence reframing the value from a different angle than email 1]

Worth a quick chat?

[your first name]
```

Rules:
- Reply to the original email (same thread)
- Under 40 words
- Different angle than email 1
- Still no links or attachments

### Follow-Up 2: The Value-Add (Day 7)

Purpose: Provide something useful — a stat, insight, or observation relevant to them.

```
Hey [first name],

[Relevant insight or data point about their industry/company]

[1-2 sentences connecting the insight to the problem you solve]

Happy to walk you through how we're approaching this if it's relevant.

[your first name]
```

Rules:
- Still in the same email thread
- Under 60 words
- Provide genuine value — not a veiled pitch
- One link allowed (to a relevant article, not your product)

### Follow-Up 3: The Breakup (Day 14)

Purpose: Close the loop gracefully. Last email in the sequence.

```
Hey [first name],

I'll take the hint and stop clogging your inbox.

If [the problem you solve] ever becomes a priority, feel free to reach back out — I'm not going anywhere.

Cheers,
[your first name]
```

Rules:
- Same thread
- Under 35 words
- No call-to-action — just a gracious exit
- This creates psychological reciprocity — often triggers the highest reply rate

## Sequence Management

### Daily Sequence Check

Run this every morning to process the queue:

```
1. Read pipeline.json
2. Get today's date
3. For each prospect with a next_action due today or earlier:
   a. Check inbox for any reply from this prospect
   b. If reply found:
      - Update stage based on reply sentiment
      - Remove from sequence
      - Flag for user attention
   c. If no reply:
      - Determine which follow-up step is next
      - Draft the follow-up email
      - Present to user for review/approval
      - On approval: send via gmail-send skill
      - Log in pipeline.json interactions
      - Set next_action date
4. Report summary: X follow-ups due, X sent, X had replies
```

### Skip Conditions

Do NOT send a follow-up if:
- It's a weekend (Saturday/Sunday)
- The prospect replied to any email in the thread
- The prospect is marked as opted_out or invalid_email
- The sending account has already sent 50+ emails today
- The user hasn't approved the follow-up content

### Pause/Resume Sequences

**Pause a sequence:**
- Set prospect's `next_action.type` to "paused"
- Add a note in interactions explaining why

**Resume a sequence:**
- Recalculate timing from today (don't send all missed follow-ups at once)
- Set the next follow-up as if starting fresh from the current step

## A/B Testing Follow-Ups

When managing 20+ prospects, split test follow-up approaches:

**Group A**: Standard bump follow-up
**Group B**: Question-based follow-up (ask about a specific challenge)

Track which approach gets more replies and adjust the templates accordingly.

## Escalation Rules

Flag for immediate user attention if:
- A prospect replies with a question about pricing
- A prospect asks to schedule a call
- A prospect mentions a competitor
- A prospect forwards the email to someone else (visible in thread)
- Any negative/angry response
