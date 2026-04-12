---
title: Model Configuration
type: entity
sources: [raw/claude-md.md]
related: [[creative-generation-flow]], [[gemini-image-generation]], [[ai-feature-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Model Configuration

Model IDs and API URLs are defined as constants at the top of `src/services/openaiApi.ts` [source: raw/claude-md.md].

## Models

| Provider | Model ID | Purpose |
|----------|----------|---------|
| OpenAI | `gpt-5.4` | Ad analysis, copy generation, creative evaluation |
| Google | `gemini-3-pro-image-preview` | Professional image generation (primary) |
| Google | `gemini-3.1-flash-image-preview` | Image generation (fallback) |
| Google | Veo | Video variant generation |

## GPT-5.4 Reasoning

The `reasoning.effort` parameter controls depth:

| Context | Effort | Rationale |
|---------|--------|-----------|
| Analysis (ad, channel) | `xhigh` | Maximum ConversionIQ™ insight quality |
| Generation (copy, packages) | `high` | Balanced quality and speed |
| Regeneration | `low` | Avoids deterministic convergence |

Higher effort = more tokens = increased API cost. See [[ai-feature-standards]] for user-facing IQ selector.

## Psychological Frameworks for Copy

The ad generator uses: Cognitive Dissonance, Social Proof, Fear Elimination, Product Benefits, Transformation, Urgency/Scarcity, Authority.

## Related

- [[creative-generation-flow]] — How models are used in the pipeline
- [[gemini-image-generation]] — Gemini-specific configuration and constraints
- [[ai-feature-standards]] — User-facing IQ reasoning level selector
