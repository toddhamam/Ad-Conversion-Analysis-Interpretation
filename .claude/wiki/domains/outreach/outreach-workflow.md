---
title: Outreach Workflow
type: concept
sources: [raw/skill-cold-outreach.md, raw/operations-guide.md]
related: [[cold-email-strategy]], [[lead-enrichment-pipeline]], [[email-warmup]], [[follow-up-sequences]], [[outreach-orchestrator]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Outreach Workflow

End-to-end 5-phase cold email campaign workflow. All mechanical operations run via the CLI — only email drafting uses AI (~500 tokens per email via GPT-5.2) [source: raw/skill-cold-outreach.md].

## Phase 1: Build Prospect List (CLI — No AI)

```bash
cli.py discover search --niche "supplements" --limit 30
cli.py research batch --pipeline-filter "stage=discovered"
cli.py score batch --pipeline-filter "stage=researched"
cli.py email batch --pipeline-filter "score_min=8"
```

See [[lead-enrichment-pipeline]] for details on research, scoring, and email finding.

## Phase 2: Draft Emails (AI — Small Token Usage)

The **only** step using AI tokens. For each prospect:
1. Get prospect data from pipeline
2. Use `personalization_hooks`, `pain_signals`, `company_intel` to draft personalized email
3. Store draft on prospect record

See [[email-templates]] for template structures and [[cold-email-strategy]] for copy rules.

## Phase 3: Send (CLI — No AI)

```bash
cli.py mail daily-status       # Check capacity
cli.py mail batch --pipeline-filter "stage=ready_to_send" --limit 20 --delay 45
```

Respects [[email-warmup]] daily limits automatically.

## Phase 4: Handle Replies (CLI + AI for responses)

```bash
cli.py inbox replies --pipeline-cross-ref
cli.py inbox check --days 3    # Bounces and opt-outs
```

| Reply Type | Pipeline Stage | Action |
|-----------|---------------|--------|
| Positive | `replied_interested` | Draft response (AI) |
| Not now | `replied_not_now` | Set reminder |
| Not interested | `replied_not_interested` | Archive |
| Unsubscribe | `opted_out` | Remove |
| Bounce | `invalid_email` | Flag |

## Phase 5: Follow-Up (CLI — No AI)

See [[follow-up-sequences]] — two-touch only, day 3 bump.

## Related

- [[cold-email-strategy]] — Principles governing all copy
- [[lead-enrichment-pipeline]] — Phase 1 enrichment details
- [[outreach-orchestrator]] — Automated daily runs
