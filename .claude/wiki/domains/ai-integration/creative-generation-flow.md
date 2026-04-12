---
title: Creative Generation Flow
type: concept
sources: [raw/claude-md.md]
related: [[model-configuration]], [[gemini-image-generation]], [[product-context]], [[ad-publishing]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Creative Generation Flow

The end-to-end pipeline from configuration through to Meta ad publish [source: raw/claude-md.md].

## Pipeline Steps

1. **Step 1 (Config)**: Select product, audience type, concept angle, copy length, IQ reasoning level
2. **GPT-5.4 generates copy**: Headlines, body texts, CTAs using channel analysis + [[product-context]]
3. **Step 2 (Copy Selection)**: User picks preferred headlines, body texts, CTAs
4. **Step 3 (Final Config)**: Select ad type (image/video), image size, variation count
5. **Gemini generates images**: With product mockups as reference images — see [[gemini-image-generation]]
6. **Review**: User can regenerate individual images without regenerating the full set
7. **Export to Meta**: Via Ad Publisher — see [[ad-publishing]]

## localStorage Management

| Cache | Key | Limit |
|-------|-----|-------|
| Generated ads | `conversion_intelligence_generated_ads` | Max 10 packages, images on latest 5 |
| Image reference cache | `conversion_intelligence_image_cache` | Max 20 images |

**Critical pitfalls**:
- **Flush before navigate**: Synchronous write to localStorage before `navigate()` — `requestIdleCallback` writes get cancelled on unmount
- **Auto-clear on publish**: Clear generated ads after successful Meta publish
- **QuotaExceededError**: Clear image cache first, then retry — generated ads take priority

## Related

- [[model-configuration]] — GPT-5.4 and Gemini models used
- [[gemini-image-generation]] — Image generation constraints
- [[product-context]] — What the AI knows about the product
- [[ad-publishing]] — How creatives reach Meta
