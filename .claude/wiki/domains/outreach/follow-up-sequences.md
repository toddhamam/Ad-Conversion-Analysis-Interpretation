---
title: Follow-Up Sequences
type: concept
sources: [raw/cold-email-resources.md, raw/skill-follow-up-sequences.md, raw/skill-cold-outreach.md]
related: [[cold-email-strategy]], [[outreach-workflow]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Follow-Up Sequences

**Two-touch only**: 1 opener + 1 follow-up (day 3). Non-responders after follow-up are recycled into new campaigns with different subject lines and angles [source: raw/cold-email-resources.md].

## Why Two-Touch

- Follow-up 1 boosts replies by **49%**
- Short bumps only — never re-pitch features in follow-ups
- "Just floating this back up" outperforms feature-heavy follow-ups

## Timing

- Follow-up 1: **Day 2-3** after opener
- One follow-up max per sequence
- Non-responders recycled with different angles

## CLI Commands

```bash
cli.py followup due                                    # What's due today
cli.py followup schedule --id p_001 --step followup_1  # Schedule bump
```

## Related

- [[cold-email-strategy]] — Follow-up philosophy
- [[outreach-workflow]] — Where follow-ups fit (Phase 5)
