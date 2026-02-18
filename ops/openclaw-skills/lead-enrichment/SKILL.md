---
name: lead-enrichment
description: Verify and enrich prospect data. Find email addresses, validate deliverability, gather company intelligence, and score lead quality.
user-invocable: true
metadata: {"openclaw":{"emoji":"🧩"}}
---

# Lead Enrichment — Verify and Enrich Prospect Data

Use web tools to verify email addresses, gather additional company intelligence, and enrich prospect records before outreach.

## Email Discovery Methods

Try these in order. Stop as soon as you find a verified address.

### Method 1: Company Website

Use `web_fetch` to check:
- `/about`, `/team`, `/contact`, `/our-team` pages
- Look for email patterns (first@domain, first.last@domain)
- Check for "mailto:" links in page source

### Method 2: Common Email Patterns

For a person named Jane Smith at acme.com, test these patterns:
1. `jane@acme.com`
2. `jane.smith@acme.com`
3. `jsmith@acme.com`
4. `j.smith@acme.com`
5. `janesmith@acme.com`

### Method 3: Web Search

Use `web_search` with queries:
- `"jane smith" "acme" email`
- `"jane smith" "@acme.com"`
- `"jane.smith@" OR "jane@" site:acme.com`
- `"jane smith" contact acme`

### Method 4: Public Profiles

Check these sources via `web_fetch` or `browser`:
- GitHub profiles (email in commits or profile)
- Personal websites/blogs (usually have contact info)
- Conference speaker pages (often list email)
- Podcast show notes (guest emails for booking)
- Substack/Medium profiles
- Twitter/X bio links

### Method 5: LinkedIn (via browser tool)

Use the `browser` tool to:
- Navigate to their LinkedIn profile
- Check "Contact Info" section (if publicly visible)
- Note their headline and recent activity for personalization

## Email Verification

Before adding an email to the pipeline, verify it:

### Quick DNS Check

Use `exec` to verify the domain accepts email:

```bash
python3 -c "
import dns.resolver
import sys

domain = 'acme.com'
try:
    mx = dns.resolver.resolve(domain, 'MX')
    print(f'MX records found for {domain}:')
    for record in mx:
        print(f'  {record.exchange} (priority: {record.preference})')
    print('Domain can receive email')
except:
    print(f'No MX records for {domain} — domain may not accept email')
"
```

Note: If `dns.resolver` is not available, use:
```bash
python3 -c "
import subprocess
result = subprocess.run(['dig', 'MX', 'acme.com', '+short'], capture_output=True, text=True)
print(result.stdout if result.stdout.strip() else 'No MX records found')
"
```

### Pattern Validation

Common invalid patterns to reject:
- `noreply@`, `info@`, `hello@`, `support@`, `admin@` — these are team inboxes, not personal
- Emails ending in `@gmail.com` for someone who should have a company email — might be personal
- Any email that looks auto-generated (random strings)

## Company Intelligence Gathering

For each prospect company, gather:

### Funding & Scale

Use `web_search`:
- `"[company]" funding OR raised OR series`
- `"[company]" revenue OR ARR OR valuation`
- `"[company]" employees OR team size site:linkedin.com`

### Ad Activity

Use `web_fetch` on Meta Ad Library:
- `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=[company]`
- Count active ads (more ads = higher ad spend = better prospect)
- Note creative variety (lots of variants = they test a lot = ideal prospect)

### Tech Stack & Tools

Use `web_search`:
- `"[company]" site:builtwith.com`
- `"[company]" "Shopify" OR "WooCommerce" OR "BigCommerce"` (for ecommerce)
- `"[company]" hiring "media buyer" OR "ad creative" OR "growth marketing"`

### Content & Social Presence

Check for:
- Blog/content marketing (indicates marketing sophistication)
- Podcast appearances by founders
- LinkedIn posting activity
- Twitter/X engagement

## Lead Scoring Enrichment

After gathering data, update the prospect's fit_score:

| Signal | Score Impact |
|---|---|
| Spending $50K+/month on ads (many active ads in Ad Library) | +3 |
| Spending $10K-50K/month | +2 |
| Hiring for creative/media buyer roles | +2 |
| Founder/CMO posts about ad challenges | +2 |
| Series A+ funded | +1 |
| Using Shopify/BigCommerce (DTC) | +1 |
| Active content marketing | +1 |
| Has email verified (not guessed) | +1 |
| Only personal Gmail found (no company email) | -1 |
| No active ads in Ad Library | -2 |
| Company website looks dormant | -3 |

## Enrichment Output

Update the prospect record in pipeline.json with:

```json
{
  "email": "verified-email@company.com",
  "email_source": "company website | linkedin | web search | pattern guess",
  "email_verified": true,
  "company_intel": {
    "funding": "Series B — $15M raised",
    "estimated_employees": "50-100",
    "estimated_ad_spend": "high",
    "active_ad_count": 47,
    "tech_stack": ["Shopify", "Klaviyo", "Meta Ads"],
    "hiring_signals": ["Senior Media Buyer", "Creative Director"],
    "content_marketing": true
  },
  "fit_score": 9,
  "enriched_date": "2026-02-18"
}
```

## Batch Enrichment

When processing a list:
1. Read pipeline.json
2. Find all prospects with stage "researched" that lack email verification
3. For each, run the discovery + verification process
4. Update records with findings
5. Flag any prospects where email couldn't be found (user may have direct info)
6. Report: X enriched, X verified, X email not found
