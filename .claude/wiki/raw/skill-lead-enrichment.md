---
name: lead-enrichment
description: Verify and enrich prospect data. Find email addresses, validate deliverability, gather company intelligence, and score lead quality.
user-invocable: true
metadata: {"openclaw":{"emoji":"🧩"}}
---

# Lead Enrichment — Verify and Enrich Prospect Data

Find emails, verify domains, research companies, and score leads using the Convertra Leads CLI. All enrichment is deterministic — no AI needed.

## Commands

### Find Email for a Person

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py email find --name "Jane Smith" --domain "acme.com"
```

Automatically:
- Generates common email patterns (jane@, jane.smith@, jsmith@, j.smith@, janesmith@, smith@)
- Verifies domain MX records via DNS
- Searches DuckDuckGo for actual email addresses
- Returns: candidates, best_match, mx_valid, method (web_search or pattern_guess)

### Verify a Specific Email

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py email verify --address "jane@acme.com"
```

Returns: mx_valid, mx_records, is_generic (rejects noreply@, info@, support@, etc.).

### Search Web for Email

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py email search --name "Jane Smith" --company "Acme DTC"
```

### Batch Find Emails for Pipeline Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "stage=researched" [--score-min 8]
```

Processes all prospects in the given stage that lack a verified email. Updates pipeline.json with found emails.

### Research a Company

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py research company --url "https://acmedtc.com"
```

Scrapes the company website and extracts:
- Tech stack (Shopify, BigCommerce, WooCommerce, Klaviyo, HubSpot, etc.)
- Team size estimate
- Funding signals
- Hiring signals (creative/media roles)
- Content marketing presence
- Dead website detection

### Batch Research Pipeline Prospects

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"
```

### Score a Prospect

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py score prospect --id p_001
```

17-point rubric. Returns: total score, tier (hot/warm/cool/skip), bucket classification, score breakdown.

### Batch Score

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"
```

## Full Enrichment Pipeline

For a list of prospects that need enrichment:

```bash
# Step 1: Research companies
exec python3 /home/ubuntu/convertra-leads/cli.py research batch --pipeline-filter "stage=discovered"

# Step 2: Score all researched prospects
exec python3 /home/ubuntu/convertra-leads/cli.py score batch --pipeline-filter "stage=researched"

# Step 3: Find emails for qualified leads
exec python3 /home/ubuntu/convertra-leads/cli.py email batch --pipeline-filter "score_min=8"

# Step 4: Review results
exec python3 /home/ubuntu/convertra-leads/cli.py pipeline list --tag hot
```

## When to Use AI

Never. All enrichment operations (email finding, DNS verification, web scraping, scoring) are deterministic. The CLI handles everything.
