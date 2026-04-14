---
title: Subscription Gating
type: concept
sources: [raw/claude-md.md]
related: [[checkout-flow]], [[stripe-pitfalls]], [[billing-consolidation]]
created: 2026-04-12
updated: 2026-04-13
confidence: high
---

# Subscription Gating

`SubscriptionGate.tsx` wraps protected routes and enforces subscription status [source: raw/claude-md.md].

## Access Control Matrix

| User State | Behavior |
|------------|----------|
| Super admin (`isSuperAdmin`) | Always full access — bypasses all gates |
| `/billing` or `/account` paths | Always accessible regardless of subscription |
| Free plan (`plan_tier === 'free'`) | Blocked — "Start free trial" gate |
| Expired trial / canceled | Blocked — "Your free trial has ended" gate |
| Trial on paid-only route (`/seo-iq`) | Blocked — "SEO IQ is a paid feature" gate |
| Active trial or paid subscription | Full access |

## Plan Tiers

`free`, `starter`, `pro`, `enterprise`, `velocity_partner` — each with monthly/yearly pricing.

## Beta Tester Provisioning

Set these 3 fields on org row in `organizations` table:

| Field | Value |
|-------|-------|
| `plan_tier` | `starter` or `pro` |
| `subscription_status` | `trialing` |
| `current_period_end` | Future ISO date |

All 3 required — if `current_period_end` is null/past, `trialDaysRemaining` = 0 and access is blocked. Do NOT set `is_super_admin = true` for beta testers.

## Related

- [[checkout-flow]] — How users upgrade from free/trial to paid
- [[stripe-pitfalls]] — Common billing mistakes
- [[billing-consolidation]] — How billing was consolidated and credit system added
