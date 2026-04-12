---
title: Checkout Flow
type: concept
sources: [raw/claude-md.md]
related: [[subscription-gating]], [[stripe-pitfalls]], [[jwt-auth-and-tenant-isolation]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Checkout Flow

JWT-authenticated Stripe Checkout with non-fatal org lookup [source: raw/claude-md.md].

## Flow

1. Frontend calls `redirectToCheckout()` → `POST /api/billing/checkout` with JWT
2. Backend authenticates via JWT → derives `organizationId` from user profile
3. **Non-fatal** org lookup — if Supabase fails, checkout proceeds without trial coupon
4. Creates Stripe Checkout Session in `subscription` mode, returns `url`
5. Frontend redirects via `window.location.href = url`

## Discount Scenarios (mutually exclusive)

1. **User-entered promo code**: `allow_promotion_codes: true` shows Stripe's field
2. **Early-bird coupon**: If trialing + starter plan + `STRIPE_EARLY_BIRD_COUPON_ID` set → auto-applies via `discounts`
3. **Default**: Falls back to `allow_promotion_codes: true`

## Enterprise Setup Fee

Added as a **separate one-time line item** in `line_items` (not `subscription_data.add_invoice_items`). Applied to `enterprise` and `velocity_partner` tiers.

## Payment Method Collection

`payment_method_collection: 'if_required'` — allows fully-discounted subscriptions to skip card collection.

## Related

- [[subscription-gating]] — How subscriptions gate feature access
- [[stripe-pitfalls]] — Common mistakes to avoid
- [[jwt-auth-and-tenant-isolation]] — How the checkout authenticates
