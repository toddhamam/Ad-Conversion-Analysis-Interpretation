---
title: Gemini Image Generation
type: concept
sources: [raw/claude-md.md]
related: [[model-configuration]], [[creative-generation-flow]], [[product-context]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Gemini Image Generation

Reference images (cached ads + product mockups) can total **25-50MB of base64 data**. Without explicit cleanup, this causes browser crashes [source: raw/claude-md.md].

## Memory Management (Critical)

- **After generation loop**: Null out `precomputedRefs` — `precomputedRefs.referenceImages.length = 0; precomputedRefs = undefined`
- **After JSON.stringify**: Clear `requestParts.length = 0` so base64 can be GC'd during fetch
- **Concurrency limit**: `MAX_CONCURRENT = 2` — do not increase (each call holds ~10-15MB)
- **Error logging**: Never `JSON.stringify` full Gemini response — may contain base64

## Timeout & Retry Policy

- `MAX_RETRIES = 2` with delays `[2000, 5000]` ms — do NOT increase above 2
- Two models tried sequentially: primary (`gemini-3-pro-image-preview`), fallback (`gemini-3.1-flash-image-preview`)
- **AbortController timeout**: 120s per `fetch()` (reference images can be 25-50MB)
- Every Gemini `fetch()` MUST have an AbortController timeout (browser default is ~5 min)

## Progress Callbacks

`regenerateAllImages` and `generateAdPackage` accept `onProgress?: (message: string) => void`:
- "Analyzing reference styles..."
- "Generating image 1 of N..."

Static loading messages for 30-90s operations feel broken — always use progress callbacks.

## Related

- [[model-configuration]] — Which Gemini models are used
- [[creative-generation-flow]] — Where image generation fits in the pipeline
- [[product-context]] — Product mockups sent as reference images
