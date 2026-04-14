# Hot Cache

**Last updated:** 2026-04-13

## What Just Happened

Ingested the GEO/SEO Content Hub feature into the wiki. This is a major addition: a public blog (`/blog`, `/blog/:slug`), FAQ page (`/faq`), and content management system with server-side prerendering for search crawlers and AI bots.

**3 new pages created:**
- [[content-hub-api]] (architecture) — `api/content.ts` catch-all: public JSON endpoints, prerender routes with JSON-LD (Article, FAQPage, HowTo, BreadcrumbList), admin CRUD. Uses `marked` for markdown; isomorphic-dompurify removed (crashes Vercel serverless). Blog posts in `blog_posts` table with RLS + `faq_pairs` JSONB.
- [[content-hub-frontend]] (product-strategy) — Mintlify-inspired UI: BlogHub (3-column grid, category pills, pagination), BlogPost (react-markdown + remark-gfm + rehype-slug, auto-TOC via IntersectionObserver, FAQ accordion), FAQPage (search-filtered accordion aggregating all posts' FAQ pairs).
- [[billing-consolidation]] (billing) — `checkout.ts` + `portal.ts` merged into `subscription.ts` catch-all. Freed 2 Vercel function slots (12→10), content.ts used 1 (→11/12). Credit system added.

**10 existing pages updated** across architecture (api-architecture, vercel-deployment, project-structure, tech-stack), product-strategy (seo-geo-strategy), billing (checkout-flow), and ai-integration (seo-iq-system).

Key technical decisions: static sitemap.xml replaced by dynamic sitemap, domain corrected to convertraiq.com, Vite `build.manifest: true` for prerender asset resolution.

## Currently Active

- **Content hub** — New public-facing blog + FAQ for GEO. See [[content-hub-api]] for backend, [[content-hub-frontend]] for frontend, [[seo-geo-strategy]] for strategic context
- **Serverless functions** — Now at 11/12 (one slot available). See [[api-architecture]] for updated inventory
- **Growth playbooks** — 6 founder case studies. See [[key-takeaways-for-convertra]], [[distribution-strategies]]
- **Email outreach** — 10-page pipeline. See [[outreach-workflow]], [[outreach-orchestrator]]

## Wiki Status: 9 Domains, 56 Pages

| Domain | Pages | Focus |
|--------|-------|-------|
| Architecture | 9 | System design, APIs, auth, deployment, content hub API |
| Meta Ads | 6 | Meta API proxy, publishing, OAuth, rate limits |
| AI Integration | 5 | GPT-5.4, Gemini, creative pipeline, SEO IQ |
| Billing | 4 | Stripe checkout, subscription gating, billing consolidation |
| Product Strategy | 9 | Philosophy, branding, UX, code quality, content hub frontend |
| CI/CD | 4 | PR review, Sentry, health monitor |
| Outreach | 10 | Cold email, enrichment, warmup, templates |
| Infrastructure | 4 | VPS, OpenClaw, CLI, cron |
| Growth Playbooks | 5 | Founder case studies, distribution, pricing, PMF |
