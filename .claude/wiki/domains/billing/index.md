---
title: Stripe Billing
type: domain-index
sources: [raw/claude-md.md]
related: [[architecture]], [[jwt-auth-and-tenant-isolation]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Stripe Billing

Stripe integration, checkout flow, customer portal, subscription gating, promo codes, and plan tiers.

Last updated: 2026-04-12

## Pages

- [[checkout-flow]] — JWT-authenticated checkout, non-fatal org lookup, URL redirect pattern
- [[subscription-gating]] — SubscriptionGate component, plan tiers, access control matrix
- [[stripe-pitfalls]] — Learned from PRs #157-159: invalid params, trust boundaries

## Sources

- [[source-claude-md]] — Master CLAUDE.md technical reference
