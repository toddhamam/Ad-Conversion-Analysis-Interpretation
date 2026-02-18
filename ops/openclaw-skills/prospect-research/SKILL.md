---
name: prospect-research
description: Research and qualify prospects using web search, website analysis, and social media profiles. Build targeted prospect lists for outreach campaigns.
user-invocable: true
metadata: {"openclaw":{"emoji":"🔍"}}
---

# Prospect Research — Find and Qualify Targets

Use the `web_search`, `web_fetch`, and `browser` tools to research and qualify prospects for cold outreach campaigns.

## Ideal Customer Profile (ICP) for Convertra

Primary targets for Convertra's AI-powered ad creative platform:

### Tier 1 — Highest Value
- **DTC brand founders/CMOs** spending $10K+/month on Meta ads
- **Performance marketing agencies** managing 5+ ad accounts
- **Growth leads** at funded startups (Series A+) with active paid acquisition

### Tier 2 — Good Fit
- **Ecommerce brand owners** running Meta/Google ads
- **Freelance media buyers** managing multiple clients
- **Marketing directors** at mid-market companies ($5M-$100M revenue)

### Tier 3 — Opportunistic
- **Course creators / info product sellers** running paid ads
- **SaaS marketing teams** doing paid acquisition
- **Local agencies** expanding into paid social

## Research Process

### Step 1: Identify Prospect Companies

Use `web_search` to find companies matching the ICP:

Search queries to use:
- `"DTC brand" "scaling ads" site:linkedin.com`
- `"performance marketing agency" "Meta ads" [city]`
- `"ecommerce brand" "ad spend" hiring media buyer`
- `"head of growth" OR "CMO" "DTC" "paid social" site:linkedin.com`
- `best DTC brands [year] funded`
- `"media buyer" "freelance" "Meta ads" portfolio`

### Step 2: Analyze Company Fit

For each potential company, use `web_fetch` to check their website and gather:

1. **Product/service type** — what do they sell?
2. **Scale indicators** — team size, funding, revenue signals
3. **Ad activity** — are they actively running ads? (Check Meta Ad Library)
4. **Tech stack** — what tools do they use? (Check job postings, BuiltWith)
5. **Pain signals** — hiring for creative roles? Scaling challenges mentioned in content?

### Step 3: Find the Right Contact

The best person to reach at each company:

| Company Type | Target Role | Why |
|---|---|---|
| DTC brand (< 20 people) | Founder / CEO | They make the buying decision |
| DTC brand (20-100 people) | CMO / VP Marketing / Head of Growth | They own the ad budget |
| Agency | Founder / Managing Director | They decide on tools for the team |
| Agency (large) | Head of Paid Media / Director of Ops | They feel the creative bottleneck daily |
| Startup | VP Growth / Head of Acquisition | They're optimizing CAC |

### Step 4: Build the Research Brief

For each qualified prospect, compile this information:

```json
{
  "name": "Full Name",
  "email": "",
  "company": "Company Name",
  "role": "Their Title",
  "company_url": "https://...",
  "linkedin_url": "https://linkedin.com/in/...",
  "company_type": "dtc_brand | agency | startup | ecommerce",
  "estimated_ad_spend": "low | medium | high",
  "pain_signals": [
    "Hiring for creative designer",
    "Posted about ad fatigue on LinkedIn",
    "Running 50+ ad variants in Ad Library"
  ],
  "personalization_hooks": [
    "Recently featured in [publication]",
    "Just launched [product]",
    "Posted about [topic] on LinkedIn 3 days ago"
  ],
  "fit_score": 8,
  "notes": "Freeform research notes"
}
```

**fit_score** (1-10):
- 9-10: Perfect ICP match, strong pain signals, actively spending on ads
- 7-8: Good fit, some pain signals, likely spending on ads
- 5-6: Decent fit but missing some signals
- Below 5: Skip — not worth the outreach effort

### Step 5: Find Email Addresses

Try these methods in order:

1. **Company website** — check /about, /team, /contact pages
2. **Common patterns** — try firstname@company.com, first.last@company.com
3. **LinkedIn** — check their profile for contact info
4. **Web search** — `"[name]" "[company]" email`
5. **GitHub** — if they're technical, check their Git commits for email
6. **Podcast appearances** — show notes often include email

Use the `lead-enrichment` skill to verify email addresses before adding to pipeline.

## Research Templates

### Company Research Prompt

When using web_search to research a company:

```
Search: "[company name]" site:linkedin.com company
Search: "[company name]" funding OR revenue OR raised
Search: "[company name]" "ad spend" OR "paid social" OR "Meta ads"
Search: "[company name]" hiring "media buyer" OR "creative" OR "growth"
```

Then web_fetch their website to analyze:
- Product pages (what they sell)
- About page (team size, mission)
- Careers page (what roles they're hiring for — pain signals)
- Blog (thought leadership, challenges they talk about)

### Person Research Prompt

When researching a specific contact:

```
Search: "[person name]" "[company name]" site:linkedin.com
Search: "[person name]" "[company name]" podcast OR interview OR speaking
Search: "[person name]" "[company name]" twitter OR X
```

Look for:
- Recent posts/articles they've written (personalization hooks)
- Conference talks or podcast appearances
- Career history (how long at current company, previous roles)
- Content themes they care about

## Output

After researching, add each qualified prospect to the pipeline using the `pipeline-tracker` skill with all research attached. Only add prospects with a fit_score of 6 or above.

## Batch Research

When building a list for a new campaign:

1. Start with 20-30 companies matching the ICP
2. Research and qualify down to the best 15-20
3. Find the right contact at each
4. Build the research brief for each
5. Find/verify email addresses
6. Add to pipeline with stage "researched"
7. Present the list for user review before any outreach begins
