---
name: prospect-research
description: Research and qualify prospects using web search, website analysis, and social media profiles. Build targeted prospect lists for outreach campaigns.
user-invocable: true
metadata: {"openclaw":{"emoji":"🔍"}}
---

# Prospect Research — Find and Qualify Targets

Discover and research prospects using the Convertra Leads CLI. All web searching, website scraping, and scoring is handled by the CLI — no AI tokens needed.

## Commands

### Discover Prospects by Niche

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --niche "supplements" [--limit 30]
```

Available niches: supplements, skincare, fitness, courses, ecommerce, saas. Custom niches also supported.

### Discover by Custom Keywords

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --keywords "DTC brand,media buyer,hiring"
```

### Multi-Niche Batch Discovery

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py discover batch [--niches supplements,skincare,fitness] [--limit-per-niche 20]
```

Sweeps multiple niches, deduplicates against existing pipeline.

### LinkedIn Search

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py discover linkedin --query "CMO DTC brand"
```

### Research a Company

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py research company --url "https://acmedtc.com"
```

Extracts: tech stack, team size, funding, hiring signals, content marketing, dead website detection.

### Batch Research

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"
```

### Score Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py score prospect --id p_001
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"
```

### Scrape Meta Ad Library

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --niche "supplements" [--limit 20]
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --keyword "collagen supplement"
exec python3 /home/ubuntu/convertra-leads/cli.py scrape page --page-id 123456789
```

## Full Research Pipeline

When the user asks to "research prospects" or "build a list":

```bash
# Step 1: Discover companies via web search
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --niche "supplements" --limit 30

# Step 2: Also search Ad Library for active advertisers
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --niche "supplements" --limit 20

# Step 3: Research all discovered companies
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"

# Step 4: Score all researched prospects
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"

# Step 5: Find emails for qualified leads
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "score_min=8"

# Step 6: Present results
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list --tag hot --limit 20
```

## ICP for Convertra

**Tier 1**: DTC brand founders/CMOs spending $10K+/month on Meta ads, performance marketing agencies, growth leads at funded startups.

**Tier 2**: Ecommerce brand owners running ads, freelance media buyers, marketing directors at mid-market companies.

**Tier 3**: Course creators running paid ads, SaaS marketing teams, local agencies expanding into paid social.

## When to Use AI

Never. All discovery, research, scraping, and scoring operations are deterministic. The CLI handles web search, website scraping, DNS verification, and scoring automatically. Format the JSON output for Telegram display.
