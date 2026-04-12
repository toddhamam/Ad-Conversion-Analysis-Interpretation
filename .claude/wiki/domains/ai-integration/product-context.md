---
title: Product Context
type: concept
sources: [raw/claude-md.md]
related: [[creative-generation-flow]], [[gemini-image-generation]], [[model-configuration]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Product Context

The AI needs two complementary layers to generate accurate ads. Changing one never affects the other [source: raw/claude-md.md].

## Two-Layer Architecture

| Layer | Source | What It Provides | Stored In |
|-------|--------|-----------------|-----------|
| **Performance patterns** | Channel Analysis (Insights page) | "Curiosity-gap headlines convert 3x", winning visual elements | `channel_analysis_cache` in localStorage |
| **Product identity** | Products page | "This is The Resistance Protocol by Marcus Reid" | `convertra_products` in localStorage |

- Channel analysis is **account-wide** — analyzes all ads for last 30 days
- Product context is **per-product** — tells AI what to call it and what it looks like
- Without product context, AI may reference the platform name instead of the actual product

## Product Data Structure

```typescript
interface ProductContext {
  name: string;           // "The Resistance Protocol"
  author: string;         // "Marcus Reid"
  description: string;    // 1-2 sentences
  landingPageUrl: string;
  productImages: Array<{  // Max 5, resized to 1024px, JPEG 80%
    base64Data: string;
    mimeType: string;
    fileName: string;
  }>;
}
```

Product mockup images are sent to Gemini alongside performance-based cached images as reference material.

## Related

- [[creative-generation-flow]] — How both layers are injected into the pipeline
- [[gemini-image-generation]] — Product mockups as reference images
