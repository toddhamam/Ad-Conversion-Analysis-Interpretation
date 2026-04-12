---
title: Ad Publisher Standards
type: concept
sources: [raw/rules-md.md]
related: [[product-philosophy]], [[ux-design-standards]], [[ai-feature-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Ad Publisher Standards

Standards for the ad publishing workflow — from creative generation through to Meta ad account publication. The publish flow must be **"ultra smooth and user friendly"** [source: raw/rules-md.md].

## Default Configuration

| Setting | Default | Rationale |
|---------|---------|-----------|
| Campaign objective | Sales (`OUTCOME_SALES`) | Not Traffic — optimizes for conversions |
| Budget mode | CBO (Campaign Budget Optimization) | Budget managed at campaign level |
| CTA button | `SHOP_NOW` | Most common e-commerce CTA |
| Ad status | `PAUSED` | Safety-first — never go live without user review |

## Targeting & Audience

- **Targeting presets** — Users save and load targeting configurations (countries, interests, audiences)
- **Real-time targeting search** — Search Meta's targeting suggestions API live, not manual ID entry
- **Custom audiences via API** — Fetch from ad account automatically, not manual ID input
- **Interest bucketing** — Most targeting suggestions are `interests` (not `demographics`) unless type is explicitly `behavior`

## Multi-Step UX

- Clear step indicators showing progress through the publish flow
- Collapsible sections for complex forms
- Predictable behavior (click-outside to close dropdowns)
- **Error-code-specific fallbacks** — Check alternative permissions or endpoints before failing
- **Graceful degradation for non-critical checks** — Log warnings instead of blocking for non-essential validation

## Safety Rules

- **Always create ads with `status: 'PAUSED'`** — prevents accidental live publication
- **Pre-publish validation** — Run `validatePageAccess` before publishing
- **Campaign propagation delay** — Wait 3 seconds + verification read after campaign creation before creating ad set
- **UTM handling** — Use Meta's `url_tags` field, never bake UTMs into `link_data.link` or body copy
- **Post-publish auto-cleanup** — Clear generated ads from localStorage only after confirmed success

## Post-Publish UX

- "Open Ads Manager" button deep-links to the correct ad account and campaign
- Auto-clear localStorage after successful publish to prevent storage warnings
- Preserve ads for retry if publish fails

## Related

- [[product-philosophy]] — "Ultra smooth" standards and demo readiness
- [[ux-design-standards]] — Form patterns, error handling, loading states
- [[ai-feature-standards]] — CreativeIQ™ generation that feeds into publishing
