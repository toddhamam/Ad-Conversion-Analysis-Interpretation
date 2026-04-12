---
title: Branding Guidelines
type: concept
sources: [raw/rules-md.md, raw/claude-md.md]
related: [[product-philosophy]], [[ai-feature-standards]], [[ux-design-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Branding Guidelines

Convertra uses a four-tier brand hierarchy, each serving a distinct context. Correct usage reinforces the premium enterprise positioning described in [[product-philosophy]].

## Brand Hierarchy

| Context | Brand Name | Usage |
|---------|------------|-------|
| Product/App | **Conversion Intelligence (CI)** | Internal dashboard, app UI |
| Sales/Marketing | **Convertra** | Sales landing page, external marketing |
| Proprietary Technology | **ConversionIQ™** | The unique mechanism — Extract, Interpret, Generate, Repeat |
| AI Creative Feature | **CreativeIQ™** | AI-powered ad creative generation (the "hero action" of the app) |

## Visual Identity

- **Logo**: `public/convertra-logo.png` — "Convertra" wordmark with stylized "v" as upward arrow featuring lime-to-violet gradient
- **Favicon**: `public/favicon.svg` — Stylized "V" arrow icon with lime-to-violet gradient
- **Primary accent**: Lime green (`--accent-primary: #d4e157`)
- **Secondary accent**: Violet (`--accent-violet: #a855f7`)
- **Signature gradient**: Lime-to-violet holographic (`--gradient-holographic`)

## ConversionIQ™ Integration

ConversionIQ™ branding must be integrated throughout the UI, especially for:

- **Loading states** — Always "ConversionIQ™ analyzing..." never "Loading..."
- **Data processing** — "ConversionIQ™ extracting insights..."
- **Channel syncing** — "ConversionIQ™ syncing channels..."
- **AI operations** — See [[ai-feature-standards]] for reasoning level branding

## CreativeIQ™ Prominence

CreativeIQ™ is the **"hero action"** of the app — AI creative generation. It should be:

- Visually distinct and prominent in the sidebar navigation
- Styled as a prominent CTA button, not a regular nav item
- The most visually attention-grabbing element in the navigation

## Related

- [[product-philosophy]] — Enterprise positioning that branding reinforces
- [[ai-feature-standards]] — How IQ branding applies to AI reasoning levels
- [[ux-design-standards]] — Loading states and component patterns that use branded messaging
