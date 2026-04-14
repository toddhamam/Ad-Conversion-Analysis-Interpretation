---
title: Architecture
type: domain-index
sources: [raw/claude-md.md]
related: [[meta-ads]], [[billing]], [[ai-integration]], [[ci-cd]], [[design-system]], [[content-hub-frontend]]
created: 2026-04-12
updated: 2026-04-13
confidence: high
---

# Architecture

System design, API patterns, authentication, multi-tenancy, and deployment infrastructure for the Conversion Intelligence platform.

Last updated: 2026-04-13

## Pages

- [[tech-stack]] — React 19 + TypeScript + Vite SPA with Vercel serverless backend
- [[project-structure]] — Directory layout, key files, and route map
- [[api-architecture]] — Catch-all serverless functions, Vercel rewrites, 11/12-function limit
- [[jwt-auth-and-tenant-isolation]] — JWT authentication pattern, tenant isolation, security rules
- [[supabase-integration]] — Database, auth, PostgREST schema cache, client creation pattern
- [[multi-tenant-credentials]] — Per-org encrypted Meta credentials, credential flow, onboarding
- [[environment-variables]] — Frontend (VITE_) and backend env vars, common pitfalls
- [[vercel-deployment]] — SPA deployment, serverless function limit, rewrites, dev commands
- [[content-hub-api]] — Blog/FAQ/sitemap catch-all API, prerender strategy, JSON-LD schema builders

## Sources

- [[source-claude-md]] — Master CLAUDE.md technical reference (2,195 lines)
