---
name: cold-outreach
description: Run end-to-end cold email outreach campaigns. Draft personalized emails, manage sequences, handle replies, and optimize deliverability.
user-invocable: true
metadata: {"openclaw":{"emoji":"🎯","requires":{"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Cold Outreach — Campaign Engine

This skill orchestrates the full cold email outreach workflow. It combines the gmail-send, gmail-read, prospect-research, and pipeline-tracker skills into a unified campaign engine.

## Campaign Workflow

### Phase 1: Build Your Prospect List

Before sending anything, build a qualified prospect list:

1. Use the `prospect-research` skill to identify targets
2. Use the `lead-enrichment` skill to find email addresses and context
3. Add all prospects to `pipeline.json` via the `pipeline-tracker` skill
4. Every prospect must have: name, email, company, role, and a personalization hook

### Phase 2: Draft Outreach Emails

For each prospect, draft a personalized cold email following these rules:

**Subject Line Rules:**
- Keep under 6 words
- No spam trigger words (free, guarantee, act now, limited time, discount)
- Make it feel like a 1-to-1 email, not a blast
- Use lowercase (except proper nouns) — looks more personal
- Examples: "quick question about [company]", "saw your [specific thing]", "[mutual connection] suggested I reach out"

**Email Body Structure (keep under 125 words):**

```
Line 1: Personalized opener referencing something specific about them
(What they recently posted, their company's news, a mutual connection, etc.)

Line 2-3: The bridge — connect their situation to the value you offer
(Position the problem they likely have, not your solution)

Line 4: The offer — one clear, low-commitment ask
(NOT "buy my thing" — instead "would a 15-min call make sense?")

Line 5: Easy opt-out
("No worries if the timing isn't right — happy to reconnect later")

Signature: First name only. Keep it casual.
```

**Critical Rules:**
- First line must be personalized to THEM — never generic
- Never pitch in the first email — open a conversation
- One call-to-action only — don't overwhelm
- Write at an 8th grade reading level — short sentences, simple words
- No HTML formatting — plain text only (looks like a real person wrote it)
- No images, no links in the first email (kills deliverability)
- Include "Reply STOP to opt out" at the bottom

### Phase 3: Send Sequence

**Day 0: Initial Email**
- Send between 8-10 AM in the prospect's timezone (Tuesday-Thursday best)
- Log send in pipeline.json with timestamp
- Update prospect stage to "email_1_sent"

**Day 3: Follow-up 1 (if no reply)**
- Reply to the original thread (same subject line, RE: prefix)
- Short — 2-3 sentences max
- Different angle than initial email
- Example: "Just bumping this up — I know inboxes get buried. [New angle]. Worth a quick chat?"
- Update stage to "followup_1_sent"

**Day 7: Follow-up 2 (if no reply)**
- Still in the same thread
- Provide a small piece of value (insight, stat, article relevant to them)
- Example: "Saw [relevant industry data] — thought of you. [Brief insight]. Happy to share more if helpful."
- Update stage to "followup_2_sent"

**Day 14: Breakup Email (if no reply)**
- Last email in the sequence
- Acknowledge they're busy, leave the door open
- Example: "I'll assume the timing isn't right and stop reaching out. If things change, I'm here. Cheers, [name]"
- Update stage to "sequence_complete"

### Phase 4: Handle Replies

Check inbox daily using gmail-read skill:

**Positive reply (interested):**
- Update stage to "replied_interested"
- Draft a response within 2 hours proposing next steps
- Ask the user to review before sending

**Neutral reply (not now):**
- Update stage to "replied_not_now"
- Respond acknowledging timing, ask when to reconnect
- Set a follow-up date in pipeline

**Negative reply (not interested):**
- Update stage to "replied_not_interested"
- Send a gracious close: "Totally understand — appreciate you letting me know"
- Mark as closed in pipeline

**Unsubscribe request:**
- Update stage to "opted_out"
- Respond confirming removal
- NEVER contact them again

**Bounce-back:**
- Update stage to "invalid_email"
- Use lead-enrichment to find an alternative email
- If found, update and restart sequence

## Email Templates

### Template: SaaS Founder / CMO

```
Subject: quick question about [company]'s ad creative

Hey [first name],

Saw [company] is scaling paid social — [specific observation, e.g., "noticed you're running multiple creative variants across Meta"]. Smart move.

One thing we're seeing with brands at your stage: the creative testing bottleneck becomes the ceiling on scale. Teams that automate the test-and-iterate cycle are shipping 10x more creatives without adding headcount.

Would it make sense to show you how we're doing this? 15 min, no pitch — just the framework.

Either way, appreciate what you're building.

[first name]

Reply STOP to opt out.
```

### Template: Agency Owner

```
Subject: your clients' creative pipeline

Hey [first name],

[Specific observation about their agency — e.g., "Saw [agency] just picked up [client]" or "Your portfolio on [platform] looks sharp"].

Quick question: how are you handling the creative testing volume as you scale accounts? We're working with a few agencies who are using AI to multiply their creative output without multiplying their team.

Curious if that's a bottleneck you're feeling. If so, happy to share the approach in a quick call.

[first name]

Reply STOP to opt out.
```

### Template: Warm Intro / Mutual Connection

```
Subject: [mutual connection] mentioned you

Hey [first name],

[Mutual connection] and I were chatting about [topic] and your name came up — specifically around [relevant context].

I work on [brief description] and thought there might be some overlap worth exploring.

Would you be open to a quick chat this week? No pressure either way.

[first name]

Reply STOP to opt out.
```

## Sending Schedule

- **Maximum 20 emails/day** during first 2 weeks (warmup period)
- **Maximum 40 emails/day** weeks 3-4
- **Maximum 50 emails/day** after week 4
- **Send window**: 8 AM - 11 AM recipient's local time
- **Best days**: Tuesday, Wednesday, Thursday
- **Avoid**: Monday morning, Friday afternoon, weekends
- **Spacing**: Minimum 45 seconds between individual sends

## Deliverability Rules

1. Never send HTML-formatted emails — plain text only
2. No links in the first email (add one link max in follow-ups)
3. No images or attachments in cold emails
4. No spam trigger words in subject or body
5. Keep emails under 125 words
6. Personalize every single email — no identical copies
7. Warm up the account gradually (see email-warmup skill)
8. Monitor bounce rate — pause if it exceeds 3%
9. Monitor reply rate — if below 2% after 50 sends, revise the copy

## Tracking Metrics

After each batch, calculate and report:
- **Send count**: Total emails sent today
- **Bounce rate**: Bounced / Sent (target: < 3%)
- **Reply rate**: Replies / Sent (target: > 5%)
- **Positive reply rate**: Interested replies / Total replies (target: > 30%)
- **Opt-out rate**: Unsubscribes / Sent (target: < 1%)
