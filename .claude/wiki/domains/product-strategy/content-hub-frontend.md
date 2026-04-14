---
title: Content Hub Frontend
type: concept
sources: []
related: [[content-hub-api]], [[seo-geo-strategy]], [[ux-design-standards]], [[branding-guidelines]], [[tech-stack]]
created: 2026-04-13
updated: 2026-04-13
confidence: high
---

# Content Hub Frontend

The **Content Hub** frontend consists of three React pages with a Mintlify-inspired UI design, located in `src/pages/blog/`. These are public routes (no auth required) that complement the server-rendered prerender pages for crawler-friendly HTML (see [[content-hub-api]]).

## Pages

### BlogHub (`src/pages/blog/BlogHub.tsx`)

The main blog listing page at `/blog`:

- **3-column layout** with sidebar navigation, content area, and metadata
- **Category filter pills** — All, FAQ, Comparison, Guide, Listicle, Case Study
- **Card grid** with featured image, category tag, title, excerpt, read time, author
- **Pagination** via URL search params (`?page=2&category=guide`)
- Fetches data from `/api/content/posts` via `contentApi.ts`

### BlogPost (`src/pages/blog/BlogPost.tsx`)

Individual article page at `/blog/:slug`:

- **Markdown rendering** via `react-markdown` + `remark-gfm` (GitHub Flavored Markdown) + `rehype-slug` (auto-generates heading IDs)
- **Auto-generated Table of Contents** — extracts `##` and `###` headings from markdown, tracks active section via `IntersectionObserver`
- **FAQ accordion** — renders `faq_pairs` from the post as expandable Q&A items (critical GEO signal per [[seo-geo-strategy]])
- **Feedback buttons** — user feedback collection on article quality
- **Breadcrumb navigation** — Blog > Category > Article title
- SEO meta tags via the `SEO` component

### FAQPage (`src/pages/blog/FAQPage.tsx`)

Aggregated FAQ page at `/faq`:

- **Search-filtered FAQ accordion** — text search across all questions and answers
- FAQs are **aggregated from all posts'** `faq_pairs` JSONB column (not a separate table)
- Includes FAQPage JSON-LD schema for rich snippets
- Links back to source articles via `sourceSlug` and `sourceTitle`

## Frontend API Service (`src/services/contentApi.ts`)

| Function | Endpoint | Auth | Purpose |
|----------|----------|------|---------|
| `fetchPosts()` | `GET /api/content/posts` | Public | Paginated listing with category filter |
| `fetchPost(slug)` | `GET /api/content/post?slug=` | Public | Single post by slug |
| `fetchFaqs()` | `GET /api/content/faqs` | Public | All FAQ pairs aggregated |
| `adminCreatePost()` | `POST /api/content/admin-create` | JWT (super admin) | Create new post |

## TypeScript Types

Defined in `src/services/contentApi.ts`:

- `BlogPost` — full post with all fields including `faq_pairs`, `schema_type`
- `BlogPostSummary` — lightweight listing version without content body
- `PostsResponse` — paginated response with `posts`, `total`, `page`, `totalPages`
- `FAQItem` — FAQ pair with source attribution (`sourceSlug`, `sourceTitle`, `category`)

## Content Categories

| Category | Slug | GEO Purpose |
|----------|------|-------------|
| FAQ | `faq` | Direct Q&A format maximizes AI citation probability |
| Comparison | `comparison` | "X vs Y" queries are high-intent and frequently cited |
| Guide | `guide` | In-depth how-to content with HowTo schema |
| Listicle | `listicle` | "Top N" formats are easily extractable by AI systems |
| Case Study | `case-study` | Authority signals via specific results and metrics |

## Mintlify-Inspired Design

The UI draws from Mintlify's documentation aesthetic (see [[ux-design-standards]]):

- Clean typography with generous whitespace
- Sidebar TOC with active section tracking
- Category pills with subtle hover effects
- Card-based article grid with consistent spacing
- Shared `Blog.css` stylesheet for all three pages

## Routing

These are **public routes** added alongside the sales landing and auth pages in `App.tsx`:

```
/blog          → BlogHub (listing)
/blog/:slug    → BlogPost (article)
/faq           → FAQPage (aggregated FAQs)
```

Crawlers see server-rendered HTML from the prerender routes (see [[content-hub-api]]). Browsers with JavaScript see the React SPA versions.

## Related

- [[content-hub-api]] — Backend API and prerender system
- [[seo-geo-strategy]] — Strategic context for content categories and FAQ emphasis
- [[ux-design-standards]] — Design system patterns used
- [[branding-guidelines]] — Convertra brand in article authorship
- [[project-structure]] — Where blog pages sit in the directory layout
