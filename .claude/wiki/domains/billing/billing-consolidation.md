---
title: Billing Consolidation
type: concept
sources: []
related: [[checkout-flow]], [[subscription-gating]], [[stripe-pitfalls]], [[api-architecture]], [[content-hub-api]]
created: 2026-04-13
updated: 2026-04-13
confidence: high
---

# Billing Consolidation

In April 2026, the billing API was consolidated from 3 serverless functions to 2, freeing a slot for the new [[content-hub-api]].

## Before (12/12 functions)

| File | Purpose |
|------|---------|
| `api/billing/checkout.ts` | Stripe Checkout session creation |
| `api/billing/portal.ts` | Stripe Customer Portal session |
| `api/billing/subscription.ts` | Subscription status lookup |

## After (11/12 functions → 12/12 with content.ts)

| File | Routes | Purpose |
|------|--------|---------|
| `api/billing/subscription.ts` | `checkout`, `portal`, usage routes | Consolidated catch-all with route dispatching |
| `api/billing/webhook.ts` | (standalone) | Stripe webhook handler (cannot be consolidated — needs raw body) |

## How It Works

Vercel rewrites map the original URLs to the consolidated handler:

```json
{ "source": "/api/billing/checkout", "destination": "/api/billing/subscription?route=checkout" }
{ "source": "/api/billing/portal", "destination": "/api/billing/subscription?route=portal" }
{ "source": "/api/billing/usage/:path(.*)", "destination": "/api/billing/subscription?route=:path" }
```

Frontend code (`stripeApi.ts`) continues to call `/api/billing/checkout` and `/api/billing/portal` as before — the rewrite is transparent.

## Why Webhook Stays Separate

`api/billing/webhook.ts` cannot be merged into the catch-all because Stripe webhook signature verification requires the **raw request body**. The catch-all handler's JSON parsing would invalidate the signature.

## Credit System

The consolidated `subscription.ts` also introduced a credit-based usage tracking system:

| Plan | Monthly Credits |
|------|----------------|
| Free | 0 |
| Trial | 21 |
| Starter | 100 |
| Pro | 300 |
| Agency | 750 |
| Agency Pro | 1,500 |
| Enterprise | 5,000 |
| Velocity Partner | Unlimited |

Credit costs: image ad (1), video ad (5), text ad (0.5), channel analysis (1).

## Impact on Function Count

| Step | Count |
|------|-------|
| Before consolidation | 12/12 |
| After merging checkout + portal into subscription | 10/12 |
| After adding `api/content.ts` | 11/12 |

One slot remains available for future serverless functions.

## Related

- [[checkout-flow]] — The checkout flow that was merged
- [[api-architecture]] — Serverless function inventory and 12-function limit
- [[content-hub-api]] — The feature that used the freed slot
- [[stripe-pitfalls]] — Pitfalls that still apply to the consolidated handler
