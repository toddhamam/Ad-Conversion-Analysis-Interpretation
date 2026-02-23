---
name: ad-library-scraper
description: Scrape the Meta Ad Library to find high-value advertisers as sales leads for Convertra. Identifies active ad spenders by niche, qualifies them by ad volume and creative sophistication, and feeds qualified prospects into the outreach pipeline.
user-invocable: true
metadata: {"openclaw":{"emoji":"🕵️"}}
---

# Ad Library Lead Scraper

Find active ad spenders using the Convertra Leads CLI. All scraping, scoring, and pipeline management is handled by the CLI — no AI tokens needed.

## Full Lead Gen Pipeline (Autonomous Mode)

When the user says "find leads" or "scrape ads" without specifics, run this full pipeline:

```bash
# Step 1: Discover prospects by niche via DuckDuckGo
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --niche "supplements" --limit 30

# Step 2: Scrape Meta Ad Library for active advertisers
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --niche "supplements" --limit 20

# Step 3: Research all discovered companies (website scraping)
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"

# Step 4: Score all researched prospects (17-point rubric)
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"

# Step 5: Find emails for hot/warm leads
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "score_min=8"

# Step 6: Review results
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list --tag hot --limit 20
```

## Individual Commands

### Discover Prospects (DuckDuckGo Search)

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --niche "supplements" [--limit 30]
exec python3 /home/ubuntu/convertra-leads/cli.py discover search --keywords "DTC brand,media buyer,hiring"
exec python3 /home/ubuntu/convertra-leads/cli.py discover batch [--niches supplements,skincare,fitness] [--limit-per-niche 20]
exec python3 /home/ubuntu/convertra-leads/cli.py discover linkedin --query "CMO DTC brand"
```

Available niches: supplements, skincare, fitness, courses, ecommerce, saas.

### Scrape Meta Ad Library

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --niche "supplements" [--limit 20] [--country GB]
exec python3 /home/ubuntu/convertra-leads/cli.py scrape search --keyword "collagen supplement"
exec python3 /home/ubuntu/convertra-leads/cli.py scrape page --page-id 123456789
```

Default country is GB (commercial ads only available for EU/UK countries via API).

### Score Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py score prospect --id p_001
exec python3 /home/ubuntu/convertra-leads/cli.py score batch [--pipeline-filter "stage=researched"]
```

17-point scoring rubric: 12+ = Hot, 8-11 = Warm, 5-7 = Cool, <5 = Skip.

### Research Companies

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py research company --url "https://acmedtc.com"
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"
```

### Find Emails

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py email find --name "Jane Smith" --domain "acme.com"
exec python3 /home/ubuntu/convertra-leads/cli.py email verify --address "jane@acme.com"
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "score_min=8"
```

## Prospect Buckets

- **`convertra_saas`**: DTC brands, ecommerce, course creators. 10-100 ads, small team.
- **`enterprise_partner`**: Agencies, large brands. 100+ ads, sophisticated strategy.
- **`media_buying`**: Brands with stale creative, $20K+/mo spend.

## When to Use AI

Never. All discovery, scraping, scoring, and pipeline operations are deterministic. Format the JSON output for Telegram display.
