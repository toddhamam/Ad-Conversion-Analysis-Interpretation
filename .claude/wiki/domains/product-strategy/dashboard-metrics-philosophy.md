---
title: Dashboard & Metrics Philosophy
type: concept
sources: [raw/rules-md.md]
related: [[product-philosophy]], [[ux-design-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Dashboard & Metrics Philosophy

How Convertra approaches data display, metric accuracy, and user customization. The dashboard is the first thing clients see — it must be both accurate and visually impressive [source: raw/rules-md.md].

## Core Principles

- **Visual clarity** — Metrics must be clear, well-presented. "Very nice, very nice" is the standard
- **Customization** — Strong user preference for building custom dashboards by choosing which metrics to display
- **Data accuracy** — Dashboard metrics must be verified against API endpoints and data sources. Never fabricate fallback data
- **Fix before build** — Fix existing metric issues before adding new visualization features

## Hybrid Data Sourcing

The Dashboard uses a deliberate hybrid approach:

| Source | Metrics | Why |
|--------|---------|-----|
| **Meta API** | Ad Spend, ROAS, Total Conversions, Total Revenue | Platform-level ad performance |
| **Supabase Funnel** | Unique Customers, AOV, Conversion Rate, CAC | Per-customer accuracy (Meta pixel fires multiple events per customer) |

This separation prevents inflated metrics — Meta's pixel may fire for front-end purchases, upsells, and downsells on the same customer.

## Data Source Clarity in UI

- **Always label data sources** — Users should know whether data comes from GSC, Keyword Planner, Meta, or Supabase
- **Tooltips for opportunity types** — Explain Quick Win, CTR Optimization, Content Gap on hover
- **Independent error handling** — If Meta API fails, funnel metrics still display (and vice versa). Show a warning banner for the failed source, never block the entire page
- **No silent failures** — If data is unavailable, show "data unavailable" state, never empty space

## Date Handling

- Use **local date formatting** for user-facing calendars — raw UTC `toISOString()` causes off-by-one errors
- Always adjust for timezones when comparing dates in calendar views
- Make date ranges configurable when user-facing; never hardcode

## Related

- [[product-philosophy]] — Why accuracy and polish are prioritized
- [[ux-design-standards]] — How metrics are visually presented
