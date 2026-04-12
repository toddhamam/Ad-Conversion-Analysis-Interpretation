---
title: Prospect Research
type: concept
sources: [raw/skill-lead-enrichment.md, raw/skill-prospect-research.md]
related: [[lead-enrichment-pipeline]], [[outreach-workflow]], [[outreach-tooling]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Prospect Research

Company intelligence gathering via website scraping — all deterministic, no AI [source: raw/skill-lead-enrichment.md].

## What Gets Extracted

- **Tech stack**: Shopify, BigCommerce, WooCommerce, Klaviyo, HubSpot, etc.
- **Team size estimate**
- **Funding signals**
- **Hiring signals**: Creative/media roles (strong buying signal)
- **Content marketing presence**
- **Dead website detection**: Filters out inactive companies

## CLI Commands

```bash
cli.py research company --url "https://acmedtc.com"         # Single company
cli.py research batch --pipeline-filter "stage=discovered"   # Batch
```

## Scoring

17-point rubric producing: total score, tier (hot/warm/cool/skip), bucket classification, score breakdown.

```bash
cli.py score prospect --id p_001                             # Single
cli.py score batch --pipeline-filter "stage=researched"      # Batch
```

## Related

- [[lead-enrichment-pipeline]] — Research feeds into the enrichment flow
- [[outreach-workflow]] — Research is Phase 1
- [[outreach-tooling]] — Tools used for research
