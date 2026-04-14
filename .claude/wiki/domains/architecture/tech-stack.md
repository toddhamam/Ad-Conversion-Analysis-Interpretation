---
title: Tech Stack
type: entity
sources: [raw/claude-md.md]
related: [[project-structure]], [[api-architecture]], [[vercel-deployment]], [[model-configuration]], [[content-hub-api]], [[content-hub-frontend]]
created: 2026-04-12
updated: 2026-04-13
confidence: high
---

# Tech Stack

**Conversion Intelligence** is a single-page application built with modern web technologies [source: raw/claude-md.md].

## Frontend

- **React 19** + TypeScript + Vite (dev server on port 5175)
- **State management**: React hooks + localStorage caching (no Redux/Context)
- **Styling**: Enterprise Light theme with CSS variables, no inline styles
- **Routing**: `react-router-dom` with public/protected route separation
- **Auth**: Supabase Auth with localStorage fallback when not configured
- `.npmrc` with `legacy-peer-deps=true` for React 19 peer dependency compatibility

## Backend

- **Vercel serverless functions** (`@vercel/node`) in `api/` directory
- **12-function hard limit** (Vercel Hobby plan) — see [[api-architecture]]
- Catch-all handler pattern with route-based dispatching
- **Supabase** for data persistence — see [[supabase-integration]]

## External APIs

| Provider | Model/Service | Purpose |
|----------|--------------|---------|
| OpenAI | GPT-5.4 | Ad analysis, copy generation, creative evaluation |
| Google | Gemini 3 Pro | Professional image asset generation |
| Google | Veo | Video variant generation |
| Meta | Marketing API v24.0 | Ad management, insights, publishing |
| Stripe | Checkout + Billing Portal | Subscription management |
| Sentry | Error monitoring | Frontend + backend error tracking |

## Content Hub Stack

The GEO/SEO content hub adds these libraries:

| Library | Purpose | Used By |
|---------|---------|---------|
| `marked` | Server-side markdown→HTML | `api/_lib/markdown.ts` (prerender) |
| `react-markdown` | Client-side markdown rendering | `BlogPost.tsx` |
| `remark-gfm` | GitHub Flavored Markdown support | `BlogPost.tsx` |
| `rehype-slug` | Auto-generates heading IDs for TOC | `BlogPost.tsx` |

**Note**: `isomorphic-dompurify` was evaluated and removed — it depends on jsdom which has native binary deps that crash Vercel serverless. Blog content is admin-authored only, so DOM purification is unnecessary.

## Related

- [[project-structure]] — How the codebase is organized
- [[api-architecture]] — Serverless function constraints
- [[vercel-deployment]] — How it's deployed
- [[content-hub-api]] — Content hub backend architecture
- [[content-hub-frontend]] — Blog/FAQ frontend pages
