---
name: ad-library-scraper
description: Scrape the Meta Ad Library to find high-value advertisers as sales leads for Convertra. Identifies active ad spenders by niche, qualifies them by ad volume and creative sophistication, and feeds qualified prospects into the outreach pipeline.
user-invocable: true
metadata: {"openclaw":{"emoji":"🕵️"}}
---

# Ad Library Lead Scraper

Mine the Meta Ad Library for active ad spenders who match Convertra's ICP. Use `browser`, `web_search`, and `web_fetch` tools.

## Default: Autonomous Mode

**When no niche is specified, run autonomous mode. Do NOT ask — just start scraping.**

1. Sweep these niches in order (1-2 keywords each): Supplements, Skincare, Fitness/Coaching, Courses/Info Products, Ecommerce/DTC, SaaS/B2B
2. Score and rank after each niche sweep
3. Stop when you have 15-20 leads scoring 8+
4. Classify every lead into buckets: `convertra_saas`, `enterprise_partner`, `media_buying`
5. Present ranked results and wait for approval before enrichment

If user specifies a niche, skip autonomous mode and deep-dive that vertical with 8-12 keyword searches.

## Niche Keywords

| Niche | Keywords |
|-------|---------|
| Supplements | `collagen supplement`, `gut health`, `nootropics`, `protein powder`, `vitamin subscription` |
| Skincare | `anti-aging serum`, `clean beauty`, `vitamin c serum`, `retinol`, `skincare routine` |
| Fitness | `online coaching`, `fitness program`, `weight loss program`, `personal training online` |
| Courses | `masterclass`, `online course`, `digital course`, `coaching program`, `mentorship` |
| Ecommerce | `free shipping`, `shop now`, `limited edition`, `new arrivals`, `subscribe and save` |
| SaaS | `free trial`, `book a demo`, `schedule a call`, `14-day trial`, `start free` |

## Prospect Buckets

- **`convertra_saas`**: DTC brands, ecommerce, course creators. 10-100 ads, small team. Pitch: "Scale creative testing without hiring."
- **`enterprise_partner`**: Agencies, large brands. 100+ ads, sophisticated strategy. Pitch: "White-glove creative velocity that compounds weekly."
- **`media_buying`**: Brands with stale/repetitive creative, $20K+/mo spend. Pitch: "We manage creative testing end-to-end."

## Scraping Process

### Step 1: Search the Ad Library

Use the `browser` tool:
```
https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q={keyword}
```

Extract: page name, ad count, creative snippets, start dates, platforms.

### Step 2: Filter

**KEEP**: 10+ active ads, appeared in 3+ searches, cross-platform, ads 30+ days old.
**SKIP**: 1-2 ads, <1K followers, political ads, Fortune 500, solo freelancers.

### Step 3: Deep Research

For each qualified advertiser:
```
web_search: "[company]" founder OR CEO site:linkedin.com
web_search: "[company]" revenue OR funding OR raised
web_search: "[company]" hiring "media buyer" OR "creative"
```
Then `web_fetch` their website for products, team size, tech stack.

View all their ads:
```
browser: https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id={page_id}
```

### Step 4: Score (17-point rubric)

| Signal | Points |
|--------|--------|
| 50+ active ads | +4 |
| 20-49 active ads | +3 |
| 10-19 active ads | +2 |
| Ads on 2+ platforms | +2 |
| Ads running 60+ days | +2 |
| Creative fatigue visible | +3 |
| Hiring creative/media roles | +3 |
| Series A+ funded | +2 |
| Revenue $1M+ signals | +2 |
| Active blog/content | +1 |
| Shopify/BigCommerce | +1 |
| Using competitor tool | +2 |
| Only 1-2 ads | -3 |
| Dead website | -5 |
| Solo operation | -3 |

**12+** = Hot, **8-11** = Warm, **5-7** = Cool, **<5** = Skip.

### Step 5: Find Decision Maker

| Company Type | Target |
|---|---|
| DTC < 20 people | Founder/CEO |
| DTC 20-100 | CMO / VP Marketing / Head of Growth |
| Agency < 20 | Founder / Managing Director |
| Agency 20+ | Head of Paid Media |
| Course creator | The creator |

### Step 6: Build Lead Record

Add to pipeline via `pipeline-tracker` skill:
```json
{
  "id": "p_XXX",
  "name": "Contact Name",
  "company": "Company",
  "role": "Title",
  "company_url": "https://...",
  "company_type": "dtc_brand|agency|course_creator|saas",
  "fit_score": 12,
  "campaign": "ad-library-{niche}-{date}",
  "stage": "researched",
  "source": "ad_library_scrape",
  "prospect_buckets": ["convertra_saas"],
  "estimated_ad_spend": "high",
  "personalization_hooks": ["Running 47 active Meta ads", "Creative fatigue visible"],
  "pain_signals": ["Same image across 15 variants", "No new creatives in 60 days"],
  "tags": ["hot", "ad-library-source"]
}
```

### Step 7: Enrich and Handoff

1. Use `lead-enrichment` skill to find emails
2. Use `pipeline-tracker` to add to pipeline.json
3. Present list for user review
4. Hand off to `cold-outreach` for email sequence

## Ad Spend Estimation

| Active Ads | Monthly Spend | Quality |
|---|---|---|
| 1-5 | $500-$2K | Low |
| 5-15 | $2K-$10K | Moderate |
| 15-30 | $10K-$30K | Good |
| 30-75 | $30K-$75K | Strong |
| 75-150 | $75K-$200K | Excellent |
| 150+ | $200K+ | Enterprise |

## Rules

1. Present leads for review before adding to pipeline
2. Max 50 advertisers per session
3. Space out browser requests — don't hammer the Ad Library
4. Skip Fortune 500 companies
5. Skip pages with <5 active ads (unless agency or funded)
6. Every lead needs `source: "ad_library_scrape"`
7. Deduplicate against existing pipeline.json
8. Prioritize creative fatigue prospects — highest conversion for Convertra pitch
9. Tag every lead with at least one prospect bucket
