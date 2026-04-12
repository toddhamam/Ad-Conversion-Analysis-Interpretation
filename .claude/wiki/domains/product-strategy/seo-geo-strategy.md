---
title: SEO/GEO Strategy
type: concept
sources: [raw/rules-md.md]
related: [[product-philosophy]], [[ai-feature-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# SEO/GEO Strategy

Convertra's approach to search visibility prioritizes **GEO (Generative Engine Optimization) over traditional SEO**. AI citation is considered more critical than traditional search rankings [source: raw/rules-md.md].

## Strategic Priority: GEO > Traditional SEO

- Content must be **"AI-first"** with authority signals, factual density, and quotable statements
- AI citation (appearing in ChatGPT, Claude, Perplexity answers) is the primary goal
- Traditional SEO (Google rankings) is secondary but still important
- The two are complementary — strong GEO signals also improve traditional SEO

## Implementation Principles

- **"Fully and completely optimize"** — Comprehensive, end-to-end approach to both SEO and GEO
- **"Hit the ground running"** — Strong foundation from day one, not iterative SEO improvements
- **No performance/UI impact** — SEO implementations must be invisible to end-users
- **Invisible optimizations** — Meta tags, schema, and config files achieve SEO without altering UI

## Content Standards for GEO

- **Mandatory FAQ sections** — Articles must include FAQ as a critical GEO signal
- **Authority signals** — Include quotable statistics, clear definitions, factual density
- **Human-like writing** — Authentic, conversational, specific language; no corporate buzzwords
- **Avoid AI-sounding phrases** — No hedging, no filler, no generic marketing-speak
- **Category consistency** — Provide existing categories to AI to maintain consistent taxonomy

## AI Bot Access

`robots.txt` allows AI crawlers: GPTBot, Claude-Web, PerplexityBot, Google-Extended. This is deliberate — maximizes the chance of AI systems citing Convertra content.

## SEO IQ UI Standards

- **Label data sources** — Distinguish GSC-sourced vs Keyword Planner-sourced data
- **Don't gate features on GSC** — If it works with Keyword Planner alone, don't require GSC
- **Progress feedback** — Real-time step messages for multi-step operations (Smart Discover, Autopilot)
- **Independent step execution** — If one step fails, others should still run; show partial results

## Related

- [[product-philosophy]] — Strategic priorities that drive the GEO-first approach
- [[ai-feature-standards]] — How AI features generate GEO-optimized content
