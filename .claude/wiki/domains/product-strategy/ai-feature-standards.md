---
title: AI Feature Standards
type: concept
sources: [raw/rules-md.md]
related: [[product-philosophy]], [[branding-guidelines]], [[ux-design-standards]], [[seo-geo-strategy]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# AI Feature Standards

Standards for how AI-powered features are presented and controlled in the Convertra UI. Users must have granular control over AI processing depth and cost [source: raw/rules-md.md].

## ConversionIQ™ Reasoning Levels

The `IQSelector` component gives users control over AI reasoning depth before major operations:

| Level | Parameter | Description | Est. Time |
|-------|-----------|-------------|-----------|
| IQ Standard | `reasoning.effort: "low"` | Fast analysis, essential insights | ~10 sec |
| IQ Deep | `reasoning.effort: "medium"` | Balanced depth and speed | ~30 sec |
| IQ Maximum | `reasoning.effort: "high"` or `"xhigh"` | Comprehensive analysis, highest token usage | ~60 sec |

**Display before** each major AI process: ad analysis, channel analysis, ad generation.

## AI UI/UX Requirements

- **Clear descriptions** — Each reasoning level has a non-technical description
- **Visual cues** — Icons, estimated timing, and token usage indicators
- **Intuitive design** — Aesthetically pleasing and easy for non-technical users
- **Accurate timing** — Realistic time estimates (not optimistic guesses)
- **Branding consistency** — Use "ConversionIQ™", "IQ Standard" etc. per [[branding-guidelines]]

## Loading States for AI Operations

- Always show branded messages: "ConversionIQ™ analyzing..." (never "Loading...")
- Display the selected reasoning level during processing
- **Progress callbacks** for long-running operations — update UI with step-by-step status
- Static loading messages for 30-90s operations feel broken to users; use `onProgress` pattern

## Media Display Control

- **Don't auto-load many images on page mount** — use "Show Images" button
- Users control when large media elements load
- Prevents crashes on media-heavy pages and improves responsiveness

## Two-Layer AI Context

The AI needs two complementary layers for accurate ad generation:

| Layer | Source | What It Provides |
|-------|--------|-----------------|
| **Performance patterns** | Channel Analysis (account-wide) | "Curiosity-gap headlines convert 3x", winning visual elements |
| **Product identity** | Product Context (per-product) | "This is The Resistance Protocol by Marcus Reid" |

Without product context, the AI references the platform name instead of the actual product.

## Related

- [[product-philosophy]] — Why user control over AI is a core principle
- [[branding-guidelines]] — ConversionIQ™ and CreativeIQ™ brand integration
- [[ux-design-standards]] — Loading state patterns and error handling
- [[seo-geo-strategy]] — How AI features generate GEO-optimized content
