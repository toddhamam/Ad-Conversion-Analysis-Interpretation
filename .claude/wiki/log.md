# Wiki Operation Log

Chronological record of all wiki operations. Append-only.

---

## [2026-04-12] ingest | Initial wiki build from 12 source documents

Sources: raw/claude-md.md, raw/rules-md.md, raw/operations-guide.md, raw/ops-runbook.md, raw/cold-email-resources.md, raw/skill-cold-outreach.md, raw/skill-lead-enrichment.md, raw/skill-email-warmup.md, raw/skill-follow-up-sequences.md, raw/skill-gmail-send.md, raw/skill-gmail-read.md, raw/skill-prospect-research.md

Domains created: architecture, meta-ads, ai-integration, billing, product-strategy, ci-cd, outreach, infrastructure

Pages created (48):
- architecture: tech-stack, project-structure, api-architecture, jwt-auth-and-tenant-isolation, supabase-integration, multi-tenant-credentials, environment-variables, vercel-deployment
- meta-ads: meta-api-proxy, ad-publishing, developer-policy-guard, ad-library-api, facebook-login-for-business, meta-app-review
- ai-integration: model-configuration, creative-generation-flow, gemini-image-generation, product-context, seo-iq-system
- billing: checkout-flow, subscription-gating, stripe-pitfalls
- product-strategy: product-philosophy, branding-guidelines, code-quality-principles, ux-design-standards, dashboard-metrics-philosophy, seo-geo-strategy, ai-feature-standards, ad-publisher-standards
- ci-cd: pr-review-workflow, sentry-monitoring, daily-health-monitor, ci-auto-fix
- outreach: cold-email-strategy, outreach-workflow, lead-enrichment-pipeline, prospect-research, email-warmup, follow-up-sequences, outreach-tooling, ab-testing-framework, email-templates, outreach-orchestrator
- infrastructure: vps-deployment, openclaw-architecture, convertra-leads-cli, cron-automation

Source summaries created (6): source-claude-md, source-rules-md, source-operations-guide, source-cold-email-resources, source-outreach-skills, source-ops-runbook

Notes: First-ever wiki ingest. All 12 source documents processed. 48 wiki pages created across 8 domains with cross-references between them.

---

## [2026-04-13] ingest | Growth playbooks — 6 YouTube founder transcripts

Sources: raw/yt-eugene-narrow-niche-saas.txt, raw/yt-arvo-ai-seo-case-study.txt, raw/yt-mike-5apps-200k-mrr.txt, raw/yt-cluely-6m-arr-mindshare.txt, raw/yt-crimeal-cold-calling.txt, raw/yt-poppy-ai-50m-valuation.txt

Domain created: growth-playbooks

Pages created (5):
- growth-playbooks: founder-case-studies, distribution-strategies, pricing-tactics, product-market-fit-patterns, key-takeaways-for-convertra

Notes: Synthesized 6 YouTube transcripts from AI SaaS founders who scaled to impressive MRR. Key findings: affiliate marketing is the #1 underutilized channel (Poppy: $150K from one TikTok), mass UGC creator networks drive app installs at scale (Cluely: 1M installs in 2 months), FAQ-style SEO articles get the most LLM citations, cold calling beats all digital channels for professional/enterprise sales, and pricing optimization alone can 3x revenue. All findings mapped to Convertra-specific recommendations.

---

## [2026-04-13] ingest | GEO/SEO Content Hub — Blog, FAQ, Prerender, Billing Consolidation

Sources: (feature build — no raw source document; ingested from codebase changes)

Pages created (3):
- architecture: content-hub-api
- product-strategy: content-hub-frontend
- billing: billing-consolidation

Pages updated (10):
- architecture: api-architecture (function count 12→11, new inventory, shared helpers table)
- architecture: vercel-deployment (rewrites for blog/faq/sitemap, build manifest section)
- architecture: project-structure (blog/ directory, content.ts, public routes updated)
- architecture: tech-stack (content hub stack: marked, react-markdown, remark-gfm, rehype-slug)
- product-strategy: seo-geo-strategy (content hub section: categories, prerendering, FAQ pairs, dynamic sitemap)
- billing: checkout-flow (note about consolidation, updated flow step 1)
- ai-integration: seo-iq-system (relationship to content hub, distinction between client SEO IQ and Convertra blog)
- architecture/index.md (added content-hub-api, updated page count)
- product-strategy/index.md (added content-hub-frontend, updated page count)
- billing/index.md (added billing-consolidation, updated page count)

Notes: Major feature ingest. The GEO/SEO content hub adds a public blog (`/blog`, `/blog/:slug`) and FAQ page (`/faq`) with Mintlify-inspired UI. Backend uses `api/content.ts` as a catch-all serverless function (11th of 12) handling public JSON endpoints, server-rendered prerender pages with JSON-LD structured data (Article, FAQPage, HowTo, BreadcrumbList), and super-admin CRUD. The billing API was consolidated from 3 functions to 2 (checkout+portal merged into subscription catch-all), freeing the Vercel function slot. Key technical decisions: isomorphic-dompurify removed (crashes Vercel serverless due to jsdom native deps), static sitemap.xml replaced by dynamic sitemap, domain corrected from convertra.ai to convertraiq.com. Database: `blog_posts` table with RLS (public reads published), `faq_pairs` JSONB column for per-post FAQ pairs aggregated on the `/faq` page. Vite build manifest (`build.manifest: true`) enables the prerender function to extract hashed asset tags at cold start.
