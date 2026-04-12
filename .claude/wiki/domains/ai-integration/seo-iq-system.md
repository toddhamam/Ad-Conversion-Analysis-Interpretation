---
title: SEO IQ System
type: entity
sources: [raw/claude-md.md]
related: [[model-configuration]], [[seo-geo-strategy]], [[supabase-integration]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# SEO IQ System

Automated SEO/GEO content pipeline combining two keyword sources and three scoring algorithms to identify highest-value content opportunities [source: raw/claude-md.md].

## Dual Keyword Sources

| Source | Data Provided | Use Case |
|--------|--------------|----------|
| **Google Search Console (GSC)** | clicks, impressions, CTR, position | Keywords you already rank for |
| **Google Ads Keyword Planner** | search volume, competition | Keywords you don't rank for |

GSC requires per-site OAuth connection. Keyword Planner uses shared Google Ads account. Keywords tab works with either source independently.

## Three Scoring Algorithms (in `api/_lib/seo-prompts.ts`)

| Function | Type | What It Finds |
|----------|------|---------------|
| `scoreQuickWin()` | `quick_win` | Keywords at positions 5-20 that could reach page 1 |
| `scoreCTROptimization()` | `ctr_optimization` | High impressions, low CTR |
| `scoreContentGap()` | `content_gap` | High volume from Keyword Planner, not ranking |

## Autopilot Pipeline

```
Cron → Pick highest-scored keyword → Generate article via AI
     → Publish to target Supabase → Submit to Google Indexing API
     → Mark keyword as 'used'
```

Autopilot works with Keyword Planner keywords alone — GSC is not required.

## Related

- [[seo-geo-strategy]] — Strategic context for GEO > SEO priority
- [[model-configuration]] — AI models used for article generation
- [[supabase-integration]] — Where keyword and article data is stored
