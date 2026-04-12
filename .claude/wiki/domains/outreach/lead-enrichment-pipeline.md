---
title: Lead Enrichment Pipeline
type: concept
sources: [raw/skill-lead-enrichment.md, raw/operations-guide.md]
related: [[outreach-workflow]], [[prospect-research]], [[outreach-tooling]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Lead Enrichment Pipeline

All enrichment is deterministic — no AI needed. The CLI handles email finding, DNS verification, web scraping, and lead scoring [source: raw/skill-lead-enrichment.md].

## Pipeline Flow

```
Discover → Research → Score → Find Email → Review Hot Leads
```

### 1. Email Finding

Generates common patterns (jane@, jane.smith@, jsmith@, j.smith@), verifies domain MX records, searches DuckDuckGo for actual addresses. Returns: `best_match`, `mx_valid`, `method` (web_search or pattern_guess).

**Sources**: Apollo (primary — 10K credits/month free), Hunter (fallback — 25/month free)

### 2. Email Verification

Checks MX records, rejects generic addresses (noreply@, info@, support@).

### 3. Company Research

See [[prospect-research]] — scrapes website for tech stack, team size, funding/hiring signals.

### 4. Lead Scoring

**17-point rubric** returning: total score, tier (hot/warm/cool/skip), bucket classification, score breakdown.

### Batch Operations

```bash
cli.py research batch --pipeline-filter "stage=discovered"
cli.py score batch --pipeline-filter "stage=researched"
cli.py email batch --pipeline-filter "score_min=8"
cli.py pipeline list --tag hot
```

## Related

- [[outreach-workflow]] — Where enrichment fits in the campaign
- [[prospect-research]] — Company intelligence details
- [[outreach-tooling]] — Apollo, Hunter, and other tools used
