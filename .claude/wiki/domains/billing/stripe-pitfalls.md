---
title: Stripe Pitfalls
type: analysis
sources: [raw/claude-md.md]
related: [[checkout-flow]], [[subscription-gating]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Stripe Pitfalls

Learned from PRs #157-#159 [source: raw/claude-md.md].

## Invalid Parameters

- **`customer_creation: 'always'`** is invalid in subscription mode — Stripe auto-creates customers
- **`subscription_data.add_invoice_items`** is not a valid Checkout Session parameter — use `line_items` for one-time charges
- **`stripe.redirectToCheckout({ sessionId })`** — don't use this. Use `window.location.href = url` instead

## Security

- **Client-provided `organizationId` must not be trusted** — always derive from JWT
- Billing endpoints fall back to client-provided IDs **only** when JWT is unavailable (dev mode)

## Resilience

- **Org lookup failures should not block checkout** — make them non-fatal to support dev environments and edge cases
- Log diagnostic info but don't prevent the checkout session from being created

## Related

- [[checkout-flow]] — The flow these pitfalls apply to
- [[subscription-gating]] — Downstream impact of billing errors
