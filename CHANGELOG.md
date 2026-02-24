# Changelog

## 2026-02-24 — Switch Meta OAuth to Facebook Login for Business (config_id)

### Problem
External users could not authorize the app through the Meta OAuth flow despite all permissions being approved via App Review. The app uses **Facebook Login for Business**, which requires a `config_id` parameter instead of the standard `scope` parameter — without a configuration, external users were blocked at the authorization dialog.

### Solution
Replaced the `scope`-based OAuth URL with `config_id`-based flow to match Facebook Login for Business requirements.

### Changed
- **`api/auth/meta/connect.ts`** — Replaced `scope` parameter with `config_id` from `META_CONFIG_ID` env var; added `override_default_response_type` parameter; updated config validation to require `META_CONFIG_ID`; removed hardcoded `SCOPES` array

### New Environment Variables (Vercel)
- `META_CONFIG_ID` — Facebook Login for Business configuration ID (created in Meta Developer Dashboard → Facebook Login for Business → Configurations)

---

## 2026-02-23 — Replace OpenClaw bot with pure Python orchestrator

### Problem
OpenClaw (AI-powered Telegram bot on OpenCore) burned through too many tokens orchestrating the lead gen pipeline. Even after building deterministic Python CLI modules, OpenClaw still consumed ~80K-120K tokens/day just interpreting commands and routing decisions.

### Solution
Replaced OpenClaw entirely with a cron-driven Python orchestrator that calls existing CLI modules directly. Token usage drops from ~80K-120K/day to ~10K/day (only GPT-5.2 email drafting).

### Added
- **`orchestrator.py`**: Autonomous pipeline automation with three modes:
  - `daily` — inbox check, follow-up sends (templates), ready email dispatch, Telegram summary
  - `weekly` — pipeline health check, red flag detection (bounce >3% auto-pauses sequences), Telegram report
  - `campaign` — full discover → research → score → email-find → AI-draft pipeline
- **`modules/drafter.py`**: Direct GPT-5.2 email drafting via HTTP (`requests`), with `reasoning.effort: "low"` for cost efficiency. Falls back to `templates.json` if API fails
- **`modules/job_scraper.py`**: New lead source — finds businesses actively hiring media buyers via DuckDuckGo job listing search. Extracts company names, deduplicates against pipeline
- **`modules/notifier.py`**: Direct Telegram Bot API notifications (replaces OpenClaw's Telegram interface). Formats daily/weekly/campaign summaries
- **`crontab.example`**: Ready-to-install cron schedule (daily 9am AEST weekdays, weekly Monday 10am, Sunday midnight backup)
- **Deterministic reply classification**: Keyword-based classifier for inbox replies (interested/not interested/not now) — no AI tokens needed
- **New CLI commands**: `orchestrate daily/weekly/campaign`, `draft email/batch`, `discover jobs`, `notify send`

### New Environment Variables (VPS `.env`)
- `OPENAI_API_KEY` — For GPT-5.2 email drafting
- `TELEGRAM_BOT_TOKEN` — Direct Telegram Bot API
- `TELEGRAM_CHAT_ID` — Target chat for notifications

### Files Created
- `ops/convertra-leads/orchestrator.py`
- `ops/convertra-leads/modules/drafter.py`
- `ops/convertra-leads/modules/job_scraper.py`
- `ops/convertra-leads/modules/notifier.py`
- `ops/convertra-leads/crontab.example`

### Files Changed
- `ops/convertra-leads/cli.py` — Added orchestrate, draft, discover jobs, and notify command groups

---

## 2026-02-23 — Fix generated ads not appearing in Ad Publisher

### Fixed
- **Silent localStorage failure**: `flushAdsToStorage()` silently did nothing when serialized ad data exceeded 5MB (common with multiple base64 images from Gemini). The publisher then showed "No Generated Ads Found" because no data was written.
- **Recurring pattern**: This broke every time a new feature was added to the ad builder because each feature slightly increased payload size, pushing past the 5MB localStorage threshold.

### Added
- **In-memory publish store** (`src/services/publishStore.ts`): Module-level `setPublishData()` / `getPublishData()` functions that pass generated ads directly in memory — no size limits, instant, synchronous.
- **Dual handoff mechanism**: AdGenerator now sets the in-memory store as the PRIMARY handoff, with localStorage as a BACKUP for page refreshes.
- **Graceful >5MB fallback**: When data exceeds 5MB, `flushAdsToStorage()` now strips all images and saves metadata-only to localStorage instead of silently skipping the save entirely.

### Files Created
- `src/services/publishStore.ts` — Lightweight in-memory store for AdGenerator → AdPublisher data transfer

### Files Changed
- `src/pages/AdGenerator.tsx` — Import `setPublishData`, call it in `flushAdsToStorage()` before localStorage write, add >5MB metadata-only fallback
- `src/pages/AdPublisher.tsx` — Import `getPublishData`, add `loadPackages()` that checks in-memory store first then localStorage, share `_cachedPackages` between `extractMetadata()` and `loadImageDataForPublish()`

---

## 2026-02-23 — Point funnel API at funnel site's Supabase for authoritative data

### Fixed
- **Dual Supabase architecture**: Funnel metrics and active sessions APIs now read from the funnel site's Supabase (authoritative `funnel_events` source) while using Convertra's Supabase for JWT authentication. Fixes data discrepancy where Convertra's DB had incomplete events from fire-and-forget syncs.
- **Free funnel steps leaking into main-v1 view**: When `funnel_id` column was added with `DEFAULT 'main-v1'`, all historical events (including free funnel events like `free-optin`, `free-offer`) were tagged as `main-v1`. Added step validation filter that skips events whose `funnel_step` doesn't belong to the resolved funnel type's configured steps.
- **Diagnostics endpoint**: Added `?debug=true` query param to `/api/funnel/metrics` that reports which Supabase is active, decodes the JWT key role (`service_role` vs `anon`), and runs a test count query to detect RLS blocking.

### Environment Variables Added
- `FUNNEL_SUPABASE_URL` — Funnel site's Supabase project URL
- `FUNNEL_SUPABASE_SERVICE_ROLE_KEY` — Funnel site's service role key (bypasses RLS)

### Files Changed
- `api/funnel/metrics.ts` — Dual Supabase clients, step validation filter, debug endpoint with JWT decode and count query test
- `api/funnel/active-sessions.ts` — Dual Supabase clients, JWT auth gate replaces org-based filtering

---

## 2026-02-23 — Add "Headline in Image" option to CreativeIQ ad generation

### Added
- **Headline in Image selector**: New three-option control in Step 3 (Generate Creatives) between Image Size and Variation Count. Users can choose: **None** (image only, default), **From Copy** (use headlines selected in Step 2), or **Custom** (type a manual headline up to 80 characters)
- **From Copy preview**: When "From Copy" is selected, shows which headline(s) will be used. Multiple selected headlines rotate across variations (e.g., 3 headlines across 5 variations = H1, H2, H3, H1, H2)
- **Gemini prompt modification**: When a headline is provided, the "NO TEXT IN IMAGE" instruction is replaced with detailed headline rendering instructions — exact text rendering, bold legible typography, high contrast, upper-third/center positioning, composition-integrated design, and typography style matching from reference image analysis
- **DALL-E fallback support**: Same headline rendering logic applied to the DALL-E image generation path
- **Regeneration consistency**: Headlines are stored on `GeneratedAdPackage` so single-image regeneration preserves the correct headline for each variation
- **`imageHeadlines` on GeneratedAdPackage interface**: Persists headline data through localStorage for regeneration

### Files Changed
- `src/pages/AdGenerator.tsx` — New state (`headlineInImageMode`, `customImageHeadline`), Step 3 UI section, headline resolution in `handleGenerateCreatives`, headline passthrough in `handleRegenerateImage`
- `src/pages/AdGenerator.css` — Styles for `.headline-image-options`, `.headline-image-btn`, `.headline-preview`, `.headline-custom-input` with mobile responsive breakpoint
- `src/services/openaiApi.ts` — `headlineText` param on `generateAdImage`/`generateAdImageWithGemini`/`generateAdImageWithDallE`, `imageHeadlines` on `generateAdPackage` config and `GeneratedAdPackage` interface, conditional prompt logic, headline rotation in batch loop

---

## 2026-02-23 — Redesign Funnels dashboard to match reference layout

### Changed
- **Tab order**: Changed from Overview/Single/Compare to Single | Compare | Overview, matching the reference dashboard layout
- **Controls bar**: Moved visitor count, view tabs, funnel selector, and date range picker into a single inline header row
- **Single view**: Funnel selector moved from body to header controls; cleaner step breakdown table
- **Compare view**: Replaced small delta-only cards with large summary cards showing Revenue, Conv %, Sessions, and AOV with inline delta badges. Added A Rev / B Rev columns to the step comparison table. Deltas now use "pp" (percentage points) suffix for conversion rates
- **Compare selectors**: Simplified to plain dropdowns with "vs" separator, no labels
- **Overview**: Removed row checkboxes, "Version" column header, and funnel type badges. Plain type text with DD/MM/YYYY date format
- **Date format**: Changed to DD/MM/YYYY across all views

### Files Changed
- `src/pages/Funnels.tsx` — Tab reorder, CompareSummaryCard component, inline controls bar, removed unused calcDelta/funnels/onSelectFunnel
- `src/pages/Funnels.css` — Controls bar layout, compare summary cards, simplified selectors, responsive updates

---

## 2026-02-23 — Remove organization_id filter from funnel queries

### Fixed
- **"Failed to discover funnels" 500 error**: The `funnel_events` table has no `organization_id` column — all Supabase queries with `.eq('organization_id', ...)` silently failed. Replaced org-based filtering with JWT authentication gate only. Since the Funnels page is already gated behind `SuperAdminRoute`, tenant isolation is enforced at the routing level.

### Files Changed
- `api/funnel/metrics.ts` — Replaced `getOrganizationId()` with `isAuthenticated()`, removed all `.eq('organization_id', ...)` filters

---

## 2026-02-23 — Add Convertra Leads CLI for token-efficient outreach automation

### Added
- **Convertra Leads CLI** (`ops/convertra-leads/`): Full Python CLI that handles all mechanical outreach operations — lead discovery, company research, email finding, lead scoring, email sending, inbox monitoring, follow-up scheduling, and campaign reporting. Designed to run on the Oracle VPS alongside the OpenClaw Telegram bot, replacing AI-driven operations with deterministic Python scripts.
  - `cli.py` — Main argparse dispatcher with 10 top-level commands (pipeline, score, mail, inbox, followup, discover, scrape, research, email, report)
  - `config.py` — Loads `.env` secrets and `data/config.json` runtime settings
  - `modules/pipeline.py` — JSON-based CRM with file locking (fcntl.flock), 15+ prospect stages, auto-ID generation
  - `modules/scorer.py` — 17-point lead scoring rubric with bucket classification and tier assignment
  - `modules/mailer.py` — Gmail SMTP sender with warmup enforcement (5/10/20/20/40 daily limits by week)
  - `modules/inbox.py` — Gmail IMAP reader with pipeline cross-referencing, bounce and opt-out detection
  - `modules/followup.py` — Follow-up sequence scheduling (Day 3/7/14), weekend skipping, pause/resume
  - `modules/reporter.py` — Campaign metrics aggregation (reply rate, bounce rate, pipeline by stage/tier/bucket)
  - `modules/discovery.py` — Autonomous prospect discovery via DuckDuckGo search across 6 niches
  - `modules/scraper.py` — Meta Ad Library API client with retry logic and pagination
  - `modules/research.py` — Company website scraper (tech stack, team size, funding, hiring signals, dead site detection)
  - `modules/email_finder.py` — Email pattern generation + DNS MX verification + DuckDuckGo web search
  - `data/pipeline.json` — Lead pipeline storage
  - `data/config.json` — Runtime config (warmup stage, daily limits, email settings, sequence timing)
  - `data/templates.json` — Email templates for 3 prospect buckets + 3 follow-up stages
  - `requirements.txt` — requests, beautifulsoup4, dnspython, ddgs

### Changed
- **All 9 OpenClaw SKILL.md files rewritten as thin CLI wrappers**: Each skill now calls `exec python3 /home/ubuntu/convertra-leads/cli.py <command>` instead of doing work with AI tokens. Only `cold-outreach` retains AI usage (for drafting personalized emails). Skills updated: ad-library-scraper, cold-outreach, email-warmup, follow-up-sequences, gmail-read, gmail-send, lead-enrichment, pipeline-tracker, prospect-research.

### Context
The OpenClaw Telegram bot was burning through Claude Max tokens too quickly because it used AI for deterministic tasks (web scraping, lead scoring, email pattern matching, pipeline CRUD, SMTP sends). This CLI handles all mechanical work — the bot calls it via `exec`, gets structured JSON back, and only uses Claude for the one task that genuinely needs AI: drafting personalized email copy. Estimated token reduction: 80-90%.

### Files Created
- `ops/convertra-leads/cli.py`
- `ops/convertra-leads/config.py`
- `ops/convertra-leads/requirements.txt`
- `ops/convertra-leads/modules/__init__.py`
- `ops/convertra-leads/modules/pipeline.py`
- `ops/convertra-leads/modules/scorer.py`
- `ops/convertra-leads/modules/mailer.py`
- `ops/convertra-leads/modules/inbox.py`
- `ops/convertra-leads/modules/followup.py`
- `ops/convertra-leads/modules/reporter.py`
- `ops/convertra-leads/modules/discovery.py`
- `ops/convertra-leads/modules/scraper.py`
- `ops/convertra-leads/modules/research.py`
- `ops/convertra-leads/modules/email_finder.py`
- `ops/convertra-leads/data/pipeline.json`
- `ops/convertra-leads/data/config.json`
- `ops/convertra-leads/data/templates.json`

### Files Changed
- `ops/openclaw-skills/ad-library-scraper/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/cold-outreach/SKILL.md` — Rewritten as CLI wrapper (retains AI for email drafting)
- `ops/openclaw-skills/email-warmup/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/follow-up-sequences/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/gmail-read/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/gmail-send/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/lead-enrichment/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/pipeline-tracker/SKILL.md` — Rewritten as CLI wrapper
- `ops/openclaw-skills/prospect-research/SKILL.md` — Rewritten as CLI wrapper

---

## 2026-02-23 — Fix funnel data sync and port multi-funnel dashboard

### Fixed
- **Broken funnel metrics API**: The metrics endpoint hardcoded only 6 step names (`landing`, `checkout`, `upsell-1`, `downsell-1`, `upsell-2`, `thank-you`) — events from the `free` funnel type (7 steps with `free-` prefix) were silently dropped. Removed hardcoded steps; steps are now dynamically discovered from event data and sorted using funnel config.
- **Mixed funnel data**: The API didn't select or filter by `funnel_id`, mixing data from different funnel versions (e.g., `main-v1`, `main-v2`, `free-v1`) into a single aggregate. Added `funnelId` (exact match) and `funnel` (type prefix match) query param filters.
- **Missing order bump revenue**: `order_bump_purchase` events were not recognized, causing revenue from order bumps to be uncounted. Now tracked separately with take rate calculation.

### Added
- **Funnel version discovery** (`api/funnel/metrics.ts` → `?discover=true`): New query-param route returns `FunnelVersionSummary[]` — lists all funnel versions with session counts, purchase counts, revenue, and conversion rates. Added within existing serverless function to stay within Vercel's 12-function limit.
- **Three-mode Funnels dashboard** (`src/pages/Funnels.tsx`):
  - **Overview**: Table of all discovered funnel versions with type badges, metrics, and last event timestamps. Click a row to drill into it; select two rows to compare.
  - **Single Funnel**: Deep-dive view with hero metric cards (Revenue, Ad Spend/ROAS, CAC/Customers), dynamic step breakdown table, order bump sub-row under checkout, and A/B test variant comparison.
  - **Compare**: Side-by-side funnel comparison with delta chips (green/red percentage badges), winner indicators, and step-by-step metric deltas.
- **Order bump metrics**: New `OrderBumpMetrics` type tracking purchases, take rate (vs checkout sessions), and revenue. Displayed as an indented sub-row under the checkout step in Single view.
- **Dynamic funnel configs**: `FunnelConfig` type with per-type step definitions, step display names, entry/checkout step identifiers, and `noMetricsSteps` for steps excluded from conversion calculations.
- **New TypeScript types**: `FunnelVersionSummary`, `FunnelConfig`, `OrderBumpMetrics` added to `src/types/funnel.ts`. `FunnelStep` changed from narrow union to `string` to support dynamic step names.

### Backward Compatible
- **Dashboard unchanged**: `src/pages/Dashboard.tsx` fetches `/api/funnel/metrics` without `funnelId` — returns combined metrics across all funnels (existing behavior preserved).
- **Super-admin only**: The Funnels page remains gated behind `SuperAdminRoute`; no changes to access control.

### Files Changed
- `src/types/funnel.ts` — Added `order_bump_purchase` event type, `FunnelConfig`, `FunnelVersionSummary`, `OrderBumpMetrics`; changed `FunnelStep` to `string`; added `funnel_id` to `FunnelEvent`, `orderBump` to `DashboardMetrics`
- `api/funnel/metrics.ts` — Complete rewrite: funnel configs, dynamic step discovery, `funnelId`/`funnel`/`discover` query params, order bump metrics, `funnel_id` in Supabase select
- `src/pages/Funnels.tsx` — Complete rebuild: three view modes (Overview/Single/Compare), funnel selector, delta chips, compare cards, order bump row
- `src/pages/Funnels.css` — Complete rewrite: view tabs, overview table, funnel type badges, compare grid, delta chips, order bump row, responsive breakpoints

---

## 2026-02-22 — Add Ad Library creative image previews via server-side extraction

### Added
- **Server-side snapshot image extraction** (`api/meta.ts` → `snapshot-images` route): New backend endpoint that batch-fetches Meta's `ad_snapshot_url` HTML pages and extracts `og:image` meta tags (with fallback to `scontent`/`external` CDN `<img>` tags) to resolve actual ad creative image URLs. Limited to 25 URLs per batch with 6 concurrent fetches. Only allows `facebook.com/ads/archive/render_ad/` URLs for security.
- **`fetchSnapshotImages()` frontend service** (`src/services/metaApi.ts`): Calls `/api/meta/snapshot-images` with JWT auth to batch-resolve preview images after search results arrive.
- **Image-first card layout**: Ad Library cards now show the creative image at the top (4:3 aspect ratio) with page identity, headline, body copy, and actions below. Three visual states: loaded image, shimmer loading placeholder, and graceful "View Ad Creative" fallback when extraction fails.

### Fixed
- **Broken JSX structure**: Removed duplicate nested `<div className="ad-library-card-content">` that caused unbalanced tag structure and potential rendering issues.
- **Replaced hero card layout**: Previous iteration showed styled text cards with a "View Ad Creative" button but no actual images. Now shows real ad creative images extracted server-side.

### Files Changed
- `api/meta.ts` — Added `snapshot-images` route with `handleSnapshotImages()` for batch og:image extraction
- `src/services/metaApi.ts` — Added `fetchSnapshotImages()` export
- `src/components/AdLibraryBrowser.tsx` — Image-first card layout with `previewImages` state, lazy loading via useEffect, shimmer/fallback states
- `src/components/AdLibraryBrowser.css` — Image preview styles, shimmer animation, fallback placeholder, updated card layout from hero to image-first

---

## 2026-02-22 — Fix Ad Library API errors and redesign creative browser

### Fixed
- **System User token detection**: Ad Library API calls now introspect the token type via `debug_token` before calling `ads_archive`. System User tokens (from manual credential entry) are immediately blocked with a clear error message explaining that Ad Library requires a User access token from OAuth — previously these returned a generic "Ad Library access error" after 3 failed retries.
- **Precise error messaging**: When a verified User token still gets OAuthException code 1, the error now specifically says identity verification is needed instead of listing multiple possible causes. Token type and raw Meta error message are included in the error response for diagnostics.

### Improved
- **Visual Ad Library browser**: Redesigned from a text-only vertical list to a 2-column grid with embedded ad creative previews via iframe (`ad_snapshot_url`). Each card shows the actual ad creative at the top, with page name, headline, body copy, duration badge, platform tags, and save button below.
- **Hover-to-preview overlay**: Cards show an "Open full preview" pill on hover that opens the Meta ad snapshot in a new tab.
- **Responsive grid**: 2 columns on desktop, 1 column on tablet/mobile with adjusted preview heights.
- **Expanded viewport**: Results area increased from 400px to 700px max-height to accommodate visual content.

### Files Changed
- `api/meta.ts` — Token type introspection in `handleAdLibrary`, improved error messages, `token_type` and `meta_message` in error response
- `src/components/AdLibraryBrowser.tsx` — Grid layout with iframe creative previews, hover overlay, updated error display for system user tokens
- `src/components/AdLibraryBrowser.css` — Visual-first card design, 2-column grid, creative preview area, responsive breakpoints
- `src/services/metaApi.ts` — Dev-mode diagnostic logging for Ad Library errors

---

## 2026-02-22 — Fix missing `last_refreshed_at` column breaking Meta connection

### Fixed
- **Meta connection fails with DB error**: All Supabase queries in `loadCredentials()` and `handleRefreshTokens()` selected `last_refreshed_at` from `organization_credentials`, but this column was never added to the production database. This caused a DB error on every Meta API call, blocking the entire integration with: "column organization_credentials.last_refreshed_at does not exist."
- **Replaced with `updated_at`**: The refresh dedup logic (skip refresh if already refreshed within 5 minutes / 12 hours) now uses `updated_at`, which already exists and is written on every credential update.
- **Removed phantom write**: `refreshMetaToken()` no longer writes `last_refreshed_at` on token refresh — `updated_at` serves the same purpose.

### Files Changed
- `api/meta.ts` — Replaced `last_refreshed_at` with `updated_at` in all `.select()` queries and dedup logic
- `api/_lib/meta-token.ts` — Removed `last_refreshed_at` from token refresh DB update
- `src/types/organization.ts` — Removed `last_refreshed_at` from `OrganizationCredential` interface

---

## 2026-02-22 — Fix Meta credentials stuck in expired status after re-authorization

### Fixed
- **Saving Integrations selection now resets credential status to `active`**: The `update-selection` endpoint in `api/meta.ts` only updated `ad_account_id`, `page_id`, and `pixel_id` but never touched the `status` field. If a previous API call with an expired token had set `status: 'expired'` (via Meta error code 190), reconnecting via OAuth and saving selections on the Integrations page would not reset it — leaving `loadCredentials()` to reject the row and return "Please connect your Meta Ads account first." Now the endpoint also sets `status: 'active'` and clears `last_error`.
- **Stale credential cache auto-refresh**: `fetchAdInsights()` and `fetchCampaignSummaries()` now force-refresh the `_orgMeta` cache from the backend if the ad account ID is empty, preventing stale singleton state from blocking data loads after reconnection.
- **Credential diagnostics in proxy errors**: When `loadCredentials()` returns null, the proxy now includes the specific reason (no DB row, status not active, token expired) in the error response. Frontend surfaces this diagnostic info in error messages for faster debugging.

### Files Changed
- `api/meta.ts` — `handleUpdateSelection` sets `status: 'active'` and `last_error: null`; `loadCredentials` tracks diagnostic reason; `handleProxy` includes diagnostics in 404 response
- `src/services/metaApi.ts` — `fetchAdInsights` and `fetchCampaignSummaries` auto-refresh `_orgMeta` cache on empty ad account; `metaFetch` appends diagnostic suffix to error messages

---

## 2026-02-22 — Preserve Meta account selections during OAuth re-authorization

### Fixed
- **Dashboard shows no data after Meta re-authorization**: When a user re-authorized their Meta account (e.g., after token expiry), the OAuth callback unconditionally set `ad_account_id`, `page_id`, and `pixel_id` to `null` — wiping existing account selections. The status endpoint then returned `needsConfiguration: true` with no ad account to query, so the dashboard showed "connected" but no data appeared. Now the callback reads existing selections before upserting and preserves them if they're still valid in the new token's scope (i.e., the account/page still appears in the available accounts list from Meta). First-time connections still start with `null` selections as before.

### Files Changed
- `api/auth/meta/callback.ts` — Read existing credentials before upsert, validate selections against new token's available accounts/pages, preserve valid selections

---

## 2026-02-22 — Restrict SEO IQ to super admin only

### Changed
- **SEO IQ route gated by `SuperAdminRoute`**: The `/seo-iq` route is now wrapped with `<SuperAdminRoute>`, redirecting non-super-admin users to the dashboard. Same pattern used for Funnels.
- **SEO IQ sidebar link hidden for regular users**: The "SEO IQ" nav item only renders when `isSuperAdmin` is true.
- **Removed SEO IQ subscription gating**: Removed `/seo-iq` from `ACTION_PATHS` and `PAID_ONLY_PATHS` in `SubscriptionGate.tsx`, and removed the `PaidOnlyGate` component — no longer needed since the route is fully gated at the routing level.

### Context
SEO IQ adds too much complexity for users at this stage. The focus is on iterating and improving the Meta Ads creative builder and related features. Super admin retains full access for continued development and testing.

### Files Changed
- `src/App.tsx` — Wrapped `/seo-iq` route with `<SuperAdminRoute>`
- `src/components/Sidebar.tsx` — Conditional render of SEO IQ nav link based on `isSuperAdmin`
- `src/components/SubscriptionGate.tsx` — Removed `/seo-iq` from action/paid-only paths, removed `PaidOnlyGate` component

---

## 2026-02-21 — Add automatic Meta token refresh to prevent 60-day expiry

### Added
- **`api/_lib/meta-token.ts`** (new) — Shared helper for Meta token refresh with three exports:
  - `refreshMetaToken()` — Exchanges a still-valid long-lived token for a fresh ~60 day token via Meta's `fb_exchange_token` endpoint, encrypts and stores the new token
  - `isWithinRefreshWindow()` — Returns true if token expires within 7 days but hasn't expired yet
  - `isTokenExpired()` — Returns true if token is already expired
- **Inline refresh in `loadCredentials()`** (`api/meta.ts`) — When any Meta API call is made and the token is within 7 days of expiry, silently refreshes before returning. If refresh fails, the current still-valid token is used (non-blocking). A 5-minute dedup window via `last_refreshed_at` prevents concurrent requests from double-refreshing.
- **`refresh-tokens` cron route** (`api/meta.ts`) — Daily batch refresh of all org tokens nearing expiry. Handles inactive users who haven't logged in. Skips tokens refreshed within the last 12 hours. Uses the same `CRON_SECRET` auth pattern as the SEO IQ autopilot cron.
- **Vercel cron schedule** (`vercel.json`) — `/api/meta/refresh-tokens` runs daily at 3:00 AM UTC

### Context
Meta OAuth long-lived tokens expire after ~60 days. Previously, expired tokens blocked users and required manual re-authentication via OAuth. Now tokens are refreshed automatically both when users are active (inline on API calls) and when they're inactive (daily cron), so users never need to re-authenticate due to token expiry. This was a prerequisite for going live after Meta App Review approval of all 5 permissions.

### Files Changed
- `api/_lib/meta-token.ts` (new) — Shared refresh helper with `refreshMetaToken()`, `isWithinRefreshWindow()`, `isTokenExpired()`
- `api/meta.ts` — Updated `loadCredentials()` with inline refresh, added `refresh-tokens` cron route to switch block
- `vercel.json` — Added cron entry for daily token refresh at 3:00 AM UTC

---

## 2026-02-20 — Add Ad Library lead scraper skill for automated prospect discovery

### Added
- **`ad-library-scraper` OpenClaw skill** — Automates lead discovery by mining the Meta Ad Library for active ad spenders who match Convertra's ICP. The bot scrapes advertiser data, qualifies prospects by ad volume and creative sophistication, scores them on a 17-point rubric, and feeds qualified leads into the outreach pipeline.
  - **Autonomous mode**: Sweeps 6 niches (Supplements, Skincare, Fitness, Courses, Ecommerce, SaaS) without prompting, stops at 15-20 hot leads
  - **3 prospect buckets**: `convertra_saas` (DTC/ecommerce), `enterprise_partner` (agencies/large brands), `media_buying` (stale creative, high spend)
  - **17-point scoring rubric**: Ad count, platform diversity, creative fatigue, hiring signals, funding, revenue signals
  - **Full pipeline integration**: Hands off to `lead-enrichment`, `pipeline-tracker`, and `cold-outreach` skills

### Changed
- **OPS-RUNBOOK.md** — Updated skill count from 8 to 9, added `ad-library-scraper` to the custom skills table

### Deployment Notes
- Skill deployed to VPS at `/home/ubuntu/.openclaw/workspace/skills/ad-library-scraper/SKILL.md`
- Instructions also embedded in `AGENTS.md` system prompt for reliable loading (OpenClaw's Sonnet 4 model doesn't always read skill files on demand)
- Added `"ad-library-scraper": {"enabled": true}` to `openclaw.json` skills entries

### Files Changed
- `ops/openclaw-skills/ad-library-scraper/SKILL.md` (new) — Complete scraping instructions with scoring, filtering, and pipeline integration
- `ops/openclaw-skills/OPS-RUNBOOK.md` — Updated skill count and table

---

## 2026-02-20 — Add keyword relevance filtering to Smart Discover

### Added
- **Site niche and negative keywords**: New `niche` (free-form text) and `negative_keywords` (array) columns on `seo_sites` table for keyword relevance context
- **`scoreRelevance()` function** (`api/_lib/seo-prompts.ts`): Fast token-overlap scoring (sub-millisecond per keyword) that scores keyword relevance to the site's niche (0–100). Full niche phrase match = 100, 2+ word overlap = 80, 1 word = 50, no overlap = 0. Returns 100 when no niche is configured (preserves current behavior)
- **Hard filtering**: Keywords containing any negative term are completely removed before scoring
- **Soft filtering**: Relevance score applied as a multiplier to content gap scores (`gapScore * max(relevance/100, 0.1)`), pushing irrelevant keywords to the bottom without deleting them
- **Niche-qualified seeds**: Smart Discover Step 2 now appends the first niche term to product seeds (e.g., "The Resistance Protocol" → also "The Resistance Protocol personal development") to guide Google Keyword Planner toward relevant results
- **Site creation form**: Niche and exclude keywords inputs added between Domain and Supabase fields
- **Keywords tab "Site Context" panel**: Collapsible inline editor for niche and negative keywords on existing sites, with save button and status indicators

### Context
After getting Google Ads Keyword Planner working, Smart Discover pulled ~1000 keywords but many were irrelevant. "The Resistance Protocol" (a personal development product) generated fitness/running keywords like "run map" because Google interprets "resistance" broadly. This change adds 3 layers of relevance control: niche-qualified seeds, hard exclusion of negative terms, and soft relevance scoring.

### Files Changed
- `supabase/migrations/006_keyword_relevance.sql` — **New** — ALTER TABLE add niche, negative_keywords
- `api/_lib/seo-prompts.ts` — Added `scoreRelevance()` function
- `api/seoiq.ts` — Site CRUD fields, negative keyword hard filter, relevance scoring multiplier in `handleResearchKeywords`
- `src/types/seoiq.ts` — Added niche, negative_keywords to SeoSite/CreateSeoSiteRequest/UpdateSeoSiteRequest; keywords_filtered to ResearchKeywordsResponse
- `src/pages/SeoIQ.tsx` — Site context UI (creation form + Keywords tab editor), niche-qualified seeds in Smart Discover

### Migration Required
Run `006_keyword_relevance.sql` on Supabase to add the `niche` and `negative_keywords` columns to `seo_sites`.

---

## 2026-02-20 — Surface Google OAuth errors in Keyword Planner diagnostics

### Fixed
- **Generic "check your env vars" error hid actual Google OAuth failure**: When the Google Ads refresh token failed to exchange for an access token, the Keyword Planner returned a generic message ("check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN") that swallowed the actual error from Google's token endpoint. Now parses and surfaces Google's `error_description` (e.g., "Token has been expired or revoked", "unauthorized_client", "invalid_grant") in both `fetchKeywordIdeas()` and `diagnoseGoogleAdsConfig()`.

### Context
Google Ads API Basic Access was approved, and all 6 env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`) are deployed in Vercel. The token refresh is failing — this change surfaces the actual rejection reason so the root cause can be identified and fixed.

### Files Changed
- `api/_lib/google-ads.ts` — Parse Google's error response in `getGoogleAdsAccessToken()`, propagate error through `fetchKeywordIdeas()` and `diagnoseGoogleAdsConfig()`

---

## 2026-02-18 — Add OpenClaw Ops Bot skills for cold email outreach

### Added
- **8 custom OpenClaw skills** for the Convertra Ops Bot (`@convertra_ops_bot` on Telegram):
  - `gmail-send` — Send emails via Gmail SMTP with Python smtplib
  - `gmail-read` — Read/search Gmail inbox via IMAP with Python imaplib
  - `cold-outreach` — End-to-end cold email campaign orchestration with templates and timing rules
  - `prospect-research` — Find and qualify targets using web search, Ad Library, and public profiles
  - `pipeline-tracker` — JSON-based CRM for tracking prospect stages and interactions
  - `email-warmup` — 4-week Gmail sender reputation warmup schedule
  - `follow-up-sequences` — Automated drip campaign management with sequence timing
  - `lead-enrichment` — Email discovery, verification, and company intelligence gathering
- **OPS-RUNBOOK.md** — Comprehensive operations runbook documenting VPS infrastructure, how OpenClaw skills work (three-layer loading, eligibility filtering, session snapshot caching), step-by-step procedures for adding/updating skills, and troubleshooting guide

### Key Technical Discoveries
- Custom skills must be placed in the **workspace** directory (`~/.openclaw/workspace/skills/`), not the bundled location (`/app/skills/`), to bypass the internal `allowBundled` allowlist
- SKILL.md metadata must NOT include `requires` gates — these filter skills out at load time. Environment variables are injected via `skills.entries` in `openclaw.json` instead
- OpenClaw caches a `skillsSnapshot` per session — after adding new skills, session files must be deleted and the container restarted for skills to appear

### Files Added
- `ops/openclaw-skills/OPS-RUNBOOK.md` — Operations runbook
- `ops/openclaw-skills/gmail-send/SKILL.md`
- `ops/openclaw-skills/gmail-read/SKILL.md`
- `ops/openclaw-skills/cold-outreach/SKILL.md`
- `ops/openclaw-skills/prospect-research/SKILL.md`
- `ops/openclaw-skills/pipeline-tracker/SKILL.md`
- `ops/openclaw-skills/email-warmup/SKILL.md`
- `ops/openclaw-skills/follow-up-sequences/SKILL.md`
- `ops/openclaw-skills/lead-enrichment/SKILL.md`

---

## 2026-02-18 — Meta App Review resubmission (round 2)

### Context
All 5 permission requests (`ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_show_list`) were rejected on 2026-02-17 with the same reason: "Screencast Not Aligned with Use Case Details." Meta confirmed the use case is allowed for all permissions — the issue was purely the screen recordings.

**Root cause**: The screen recordings showed a "Reconnect" flow instead of a first-time "Connect" flow. Because the Facebook account had previously authorized the app, the OAuth dialog skipped the permissions consent screen entirely. Meta reviewers need to see the full first-time authorization including the permissions grant step.

**Fix**: Revoked the app's OAuth authorization from Facebook Settings → Business Integrations → Remove, then recorded a fresh first-time consent flow and spliced it as the intro for all 5 permission-specific videos.

### Changed
- **CLAUDE.md**: Added "Screencast Not Aligned with Use Case Details" troubleshooting entry with revocation steps, screen recording requirements, and efficient recording strategy. Added Submission History table tracking review rounds.

### Resubmitted
- All 5 permissions resubmitted with updated screen recordings showing the complete first-time OAuth consent flow

---

## 2026-02-18 — Enable Ad Library API access with EU/UK defaults and geographic guidance

### Changed
- **Default country changed from US to GB (United Kingdom)**: The Ad Library API only returns commercial ads for EU/UK countries. US and other non-EU countries only return political/issue ads via the API. Default changed across frontend (`AdLibraryBrowser.tsx`), frontend service (`metaApi.ts`), and backend handler (`api/meta.ts`)
- **Country dropdown reorganized with `<optgroup>` sections**: "EU/UK (all ads available)" lists 13 EU/UK countries; "Other (political/issue ads only)" lists US, CA, AU, BR, IN, IL — makes the geographic limitation immediately visible
- **Geographic availability notice**: Amber info banner appears when a non-EU/UK country is selected, explaining that only political/issue ads are available and suggesting switching to an EU/UK country

### Improved
- **Identity verification error handling**: Backend detects error code 10 / subcode 2332002 (identity verification required) and OAuthException code 1, returning descriptive messages that mention both possible causes: (1) identity verification at facebook.com/ID, and (2) geographic limitations
- **Clickable verification link**: When errors mention permissions, a help link to facebook.com/ID is rendered inline with the error message
- **Simplified frontend error handling**: Frontend now uses the backend's descriptive error messages directly instead of duplicating error detection logic

### Documented
- **CLAUDE.md**: Added "Ad Library API" subsection documenting identity verification requirement, geographic limitations (EU/UK for commercial, global for political only), token requirements, and known error codes

### Files Changed
- `src/components/AdLibraryBrowser.tsx` — Default to GB, optgroup country dropdown, geo notice banner, verification link in error display
- `src/components/AdLibraryBrowser.css` — Styles for `.ad-library-geo-notice`, `.ad-library-error-help` with link styling
- `src/services/metaApi.ts` — Default countries to GB, simplified error handling (uses backend messages)
- `api/meta.ts` — Default countries to GB, detect identity verification errors (code 10/2332002), enhanced OAuthException message with both causes, return `requires_verification` flag
- `CLAUDE.md` — Added Ad Library API documentation section

---

## 2026-02-18 — Fix Ad Library search error code 1 with retry logic, uppercase platforms, and diagnostics

### Fixed
- **Ad Library search returning "An unknown error has occurred (code 1)"**: Multiple fixes to address the persistent error from Meta's `ads_archive` endpoint:
  - **Removed `ad_type: 'ALL'` parameter** — Meta defaults to `ALL`, and the explicit param may conflict with v24.0 API changes
  - **Fixed `publisher_platforms` to uppercase** — Meta requires `FACEBOOK`, `INSTAGRAM`, `MESSENGER`, `AUDIENCE_NETWORK` (not lowercase). Updated both frontend dropdown values and backend serialization with `.toUpperCase()` normalization
  - **Added retry logic for error code 1** — Up to 2 retries with exponential backoff (1.5s, 3s), matching the existing error code 2 retry pattern. Error code 1 is often transient on the `ads_archive` endpoint
  - **Added diagnostic request logging** — Logs exact request parameters (minus access token) to Vercel function logs for troubleshooting
  - **Forwarded error `type` in API response** — Frontend can now detect `OAuthException` vs other error types
  - **Actionable error message for OAuthException** — When Meta returns `OAuthException` with code 1, displays a message about token permissions instead of the generic "unknown error" text

### Files Changed
- `api/meta.ts` — Removed `ad_type: 'ALL'`; added retry loop with backoff; uppercase platform normalization; diagnostic logging; forward error `type` in response
- `src/components/AdLibraryBrowser.tsx` — Changed platform filter values to uppercase (`FACEBOOK`, `INSTAGRAM`, etc.)
- `src/services/metaApi.ts` — Updated `AdLibrarySearchParams` platform types to uppercase; added OAuthException detection with actionable error message

---

## 2026-02-17 — Fix Ad Library search error code 1 by removing unavailable fields

### Fixed
- **Ad Library search still returning "An unknown error has occurred (code 1)"**: The previous fix (PR #194) added `ad_type` and `search_type` params but the error persisted. Root cause: the `spend` field is only available for political/issue ads and EU transparency reports — requesting it for regular commercial ads causes Meta to return error code 1. Also removed `ad_creative_link_captions` (not used in the UI) and `search_type` parameter (KEYWORD_UNORDERED is already the default) to reduce the request surface.

### Files Changed
- `api/meta.ts` — Removed `spend` and `ad_creative_link_captions` from requested fields; removed `search_type` parameter
- `src/services/metaApi.ts` — Removed `spend` and `ad_creative_link_captions` from `AdLibraryResult` interface
- `src/components/AdLibraryBrowser.tsx` — Removed spend display (field no longer available)
- `src/components/AdLibraryBrowser.css` — Removed `.ad-library-card-spend` styles

---

## 2026-02-17 — Fix Ad Library search returning "An unknown error has occurred"

### Fixed
- **Ad Library search failing with Meta API error**: Searching the Ad Library (e.g., "Shadow work") returned "An unknown error has occurred" from Meta's `ads_archive` endpoint. Added required `ad_type=ALL` and `search_type=KEYWORD_UNORDERED` parameters matching the [official Facebook Ad Library API](https://facebookresearch.github.io/Radlibrary/reference/adlib_build_query.html) defaults. Removed `impressions` field (not displayed in UI, may not be available for non-political/non-EU ads).
- **Opaque Meta API error messages**: Error responses from the Ad Library now include the Meta error code and subcode (e.g., "An unknown error has occurred (code 1)") for easier debugging. Full error details (code, subcode, type, fbtrace_id) logged to server console and Sentry.

### Files Changed
- `api/meta.ts` — Added `ad_type`, `search_type` params; removed `impressions` field; improved error response with code/subcode
- `src/services/metaApi.ts` — Removed unused `impressions` field from `AdLibraryResult` interface

---

## 2026-02-17 — Add Meta Ad Library integration for CreativeIQ inspiration

### Added
- **Meta Ad Library search** (`api/meta.ts` → `ad-library` route): JWT-authenticated endpoint that searches the Meta Ad Library (`ads_archive` API) for competitor and cross-industry ads. Supports search terms, country filtering, active/inactive status, platform filtering, date ranges, and cursor-based pagination. Added to existing catch-all handler (no new serverless function).
- **`searchAdLibrary()` frontend service** (`src/services/metaApi.ts`): Types (`AdLibrarySearchParams`, `AdLibraryResult`, `AdLibraryResponse`) and API function calling `/api/meta/ad-library` with JWT auth.
- **`AdLibraryInspiration` type** (`src/types/index.ts`): Interface for saved inspiration ads with page name, ad copy, headlines, duration, active status, and save timestamp.
- **`AdLibraryBrowser` component** (`src/components/AdLibraryBrowser.tsx` + `.css`): Collapsible panel in CreativeIQ Step 1 for searching the Meta Ad Library. Features debounced search (500ms), country selector, Active/All/Ended status tabs, collapsible advanced filters (platform, running since, min duration, sort by) in a 2-column grid, result cards with duration badges (green "Long Runner" 6+ months, amber "Established" 3-6 months), ad copy preview with show more/less, platform badges, spend ranges, save/unsave buttons, and cursor-based pagination.
- **`InspirationSelector` component** (`src/components/InspirationSelector.tsx`): Compact checklist below the browser showing saved inspirations with checkboxes to activate/deactivate each for the current generation. Max 5 active at once to keep prompt token usage reasonable.
- **Ad Library section label with info panel**: "Ad Library Inspiration *(optional)*" label with click-to-toggle info panel explaining the feature — avoids users thinking it's required.
- **Inspiration status indicator**: Shows "X Ad Library inspirations active for generation" badge when inspirations are selected.
- **AI prompt integration** (`src/services/openaiApi.ts`):
  - **Copy generation** (`generateCopyOptions`): Active inspirations injected as a `=== COMPETITOR/INDUSTRY INSPIRATION ===` section in the user prompt with page name, duration signal, headlines, body copy (truncated to 400 chars), and instructions to extract strategies without copying text verbatim.
  - **Image generation** (`generateAdImageWithGemini`): Top 3 active inspirations injected as thematic direction context (text only, no images from Ad Library).
  - **Package generation** (`generateAdPackage`): Passes inspirations through to individual image generation calls.

### Architecture
- **Third reference layer**: Ad Library Inspiration joins Channel Analysis (account-wide patterns) and Product Context (per-product identity) as a third independent input to AI generation. All three layers are additive and can be used in any combination.
- **Duration as quality proxy**: Long-running ads are surfaced first and highlighted with color-coded badges since the Ad Library API doesn't expose performance metrics.
- **Global localStorage storage**: Inspirations stored globally in `ci_ad_library_inspirations` (max 20 saved, max 5 active) — not per-product, since inspiration can cross product lines.
- **No new serverless functions**: Routes through existing `api/meta.ts` catch-all (stays within 12/12 Vercel limit).

### Files Created
- `src/components/AdLibraryBrowser.tsx` — Ad Library search browser component
- `src/components/AdLibraryBrowser.css` — Browser, filters, result cards, inspiration selector styles
- `src/components/InspirationSelector.tsx` — Saved inspiration activation checklist

### Files Changed
- `api/meta.ts` — Added `ad-library` route with `handleAdLibrary()` function
- `src/services/metaApi.ts` — Added `searchAdLibrary()`, types for Ad Library API
- `src/services/openaiApi.ts` — Added inspiration context to copy generation, image generation, and package generation
- `src/pages/AdGenerator.tsx` — State management, localStorage persistence, UI integration, inspiration pass-through to generation functions
- `src/types/index.ts` — Added `AdLibraryInspiration` interface

---

## 2026-02-16 — Condense sales landing page sections and add calculator card styling

### Changed
- **ROI Calculator**: Wrapped sliders and results inside a white card container with rounded corners, subtle shadow, and a horizontal divider — the calculator now stands out as a distinct widget rather than blending into the page background. Result cards use `var(--bg-secondary)` to contrast against the white card.
- **"How It Works" mechanism steps** (Extract, Interpret, Generate, Repeat): Converted from four large stacked full-width cards with multiple paragraphs and decorative animations into a compact **2x2 grid** with step pill, title, and single condensed paragraph each.
- **"Automated Partnership" bespoke features** (Bespoke Implementation, White Glove Management, Dedicated Partnership): Converted from three tall stacked cards with multi-paragraph copy and animated visuals into a compact **3-column grid** with icon, title, and single paragraph each.

### Removed
- Decorative CSS animations from mechanism steps: platform dots, insight bubbles, mini ad cards, growth chart bars and their associated `@keyframes` (`platformFloat`, `bubblePop`, `cardFan`, `barGrow`).
- Decorative CSS animations from bespoke features: config pulse dots, team avatar circles, handshake icon and their associated `@keyframes` (`configPulse`).
- Verbose multi-paragraph copy from both sections — replaced with concise single-paragraph summaries.
- ~360 lines of unused CSS removed.

---

## 2026-02-16 — Add interactive ROI calculator to sales landing page

### Added
- **ROI Calculator section** on the sales landing page (`/`): Interactive calculator that lets enterprise prospects input their own numbers (monthly ad spend, creative team size, cost per team member, creatives produced per week, days from brief to launch) and see personalized annual savings in real-time.
- **5 range slider inputs** with live-updating values, lime-themed thumb styling, and accessible labels.
- **5 calculated output metrics**: Annual Team Cost Savings, Wasted Ad Spend Recovered, Total Annual Savings (featured with lime-to-violet gradient text), Creative Velocity Increase (Xx faster), and Team Hours Freed Per Year.
- **"Calculate Your Savings" teaser** inside the Cost of Waiting total card — contextual CTA with down-arrow that smooth-scrolls to the calculator section.
- **Footer nav link** for ROI Calculator.
- **Full responsive design**: 3-column result cards on desktop, single-column on tablet/mobile, larger touch targets on small screens.
- **Calculation formulas**: Team savings (70% of manual creative labor replaced), ad spend recovery (47% reduction on the 60% wasted on non-converting creatives), velocity multiple (250 creatives/week vs manual rate), hours freed (manual hours per creative × 52 weeks).

### Default outputs (with default inputs)
- $252,000 annual team savings + $338,400 ad spend recovered = **$590,400 total annual savings**
- 83x creative velocity increase, 3,120 team hours freed per year

---

## 2026-02-15 — Clean up connected integration display

### Changed
- **Integrations page**: Simplified the connected Meta Ads card by removing the read-only "Connection Details" grid (Account, Ad Account ID, Page ID, Token Expires). Connected state now shows only the configuration dropdowns and a Disconnect button.
- **Save Configuration button**: Now only appears when the user changes a dropdown to a different value than what's saved. Once configuration is saved, the button disappears — only Disconnect remains.
- **Configuration dropdowns**: Always visible when connected (no longer gated by `needsConfiguration` flag).

### Removed
- Connection Details section CSS (`.integration-details`, `.detail-item`, `.detail-label`, `.detail-value`)
- `formatExpiry()` helper function (no longer needed)
- "Account Configuration" heading from config section

---

## 2026-02-15 — Add Integrations page and Meta disconnect flow

### Added
- **Integrations page** (`/integrations`): Self-service page for managing connected advertising platforms. Shows Meta Ads connection status (connected/expired/not connected), account details (ad account ID, page ID, token expiry), and connect/disconnect actions. Includes ad account, Facebook page, and Meta pixel selection dropdowns when connected. Google Ads and TikTok Ads shown as "Coming Soon" placeholders.
- **Meta disconnect API** (`api/meta.ts` → `disconnect` route): JWT-authenticated endpoint that deletes Meta credentials from `organization_credentials`. Added to existing catch-all handler (no new serverless function).
- **`disconnectMeta()` frontend service** (`src/services/metaApi.ts`): Calls the disconnect endpoint with JWT auth and clears the local credential cache.
- **Sidebar nav item**: "Integrations" link added below SEO IQ with link icon.
- **Profile dropdown menu item**: "Integrations" option added between Account Settings and Billing Details.
- **`pages_show_list` OAuth scope**: Added to `api/auth/meta/connect.ts` — required for `GET /me/accounts` to list Facebook Pages during OAuth connection.
- **Meta App Review resubmission guide** (`.context/meta-app-review-resubmission-guide.md`): Comprehensive guide with per-permission screen recording scripts, submission descriptions, and reviewer instructions for all 5 permissions.

### Changed
- **SubscriptionGate**: Added `/integrations` to `ALWAYS_ALLOWED_PATHS` so users can manage integrations regardless of subscription status.
- **`OrgMetaIds` type** now exported from `metaApi.ts` for use by the Integrations page.

### Files Created
- `src/pages/Integrations.tsx` — Integrations management page
- `src/pages/Integrations.css` — Integrations page styles
- `.context/meta-app-review-resubmission-guide.md` — Meta App Review resubmission guide

### Files Changed
- `api/auth/meta/connect.ts` — Added `pages_show_list` to OAuth scopes
- `api/meta.ts` — Added `disconnect` route handler
- `src/services/metaApi.ts` — Added `disconnectMeta()`, exported `OrgMetaIds` type
- `src/App.tsx` — Added `/integrations` route
- `src/components/Sidebar.tsx` — Added Integrations nav item
- `src/components/SubscriptionGate.tsx` — Added `/integrations` to always-allowed paths
- `src/components/UserProfileDropdown.tsx` — Added Integrations menu item
- `CLAUDE.md` — Updated OAuth scopes documentation to include `pages_show_list`

---

## 2026-02-14 — Filter Supabase Auth AbortError from Sentry

### Fixed
- **Sentry noise reduction**: Filter out `AbortError: signal is aborted without reason` from Supabase Auth's `navigator.locks` mechanism in `beforeSend`. This harmless error fires when the browser's Web Locks API is interrupted by page navigation, tab switching, or component unmount — not a real user-facing issue.

### Files Changed
- `src/instrument.ts` — Added AbortError filter alongside existing ResizeObserver filter

---

## 2026-02-13 — Add Sentry error monitoring for frontend and backend

### Added
- **Frontend Sentry SDK** (`@sentry/react` v10.38): Browser tracing, session replay on error sessions (100% capture rate), React 19 error handlers (`onUncaughtError`, `onCaughtError`, `onRecoverableError`), ResizeObserver noise filtering
- **Backend Sentry SDK** (`@sentry/node` v10.38): Shared helper `api/_lib/sentry.ts` with `initSentry()`, `captureError()`, `flushSentry()` instrumented across all 12 serverless functions
- **Source map uploads** (`@sentry/vite-plugin` v4.9): Hidden source maps uploaded during production builds for readable stack traces in Sentry; auto-disabled without `SENTRY_AUTH_TOKEN`
- **User/org context tagging**: Sentry errors tagged with `organization_id` and `plan_tier` via `OrganizationContext.tsx`
- **Frontend init** (`src/instrument.ts`): Imported as first module in `main.tsx` for earliest possible initialization
- **Security**: Authorization and cookie headers scrubbed from backend error events; fetch request bodies stripped from breadcrumbs

### Environment Variables (Vercel)
| Variable | Purpose |
|----------|---------|
| `VITE_SENTRY_DSN` | Frontend DSN (public, exposed to browser) |
| `SENTRY_DSN` | Backend DSN (same value, for serverless functions) |
| `SENTRY_AUTH_TOKEN` | Source map upload auth token |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |

### Files Changed
- `src/instrument.ts` — New frontend Sentry initialization
- `src/main.tsx` — Import instrument first, React 19 error handlers on `createRoot()`
- `src/contexts/OrganizationContext.tsx` — Sentry user/org context tagging
- `vite.config.ts` — Added `sentryVitePlugin`, `sourcemap: 'hidden'`
- `api/_lib/sentry.ts` — New shared backend Sentry helper
- `api/meta.ts`, `api/seoiq.ts` — Sentry capture in catch blocks
- `api/billing/checkout.ts`, `api/billing/portal.ts`, `api/billing/webhook.ts`, `api/billing/subscription.ts` — Sentry capture in catch blocks
- `api/funnel/metrics.ts`, `api/funnel/active-sessions.ts` — Sentry capture in catch blocks
- `api/admin/credentials.ts`, `api/auth/meta/callback.ts`, `api/auth/meta/connect.ts`, `api/google-auth.ts` — Sentry capture in catch blocks
- `.gitignore` — Added `.env.sentry-build-plugin`
- `package.json` — Added `@sentry/react`, `@sentry/node`, `@sentry/vite-plugin`

---

## 2026-02-13 — Add standalone demo video and "See It In Action" landing page section

### Added
- **Standalone DemoVideo Remotion composition** (`src/remotion/DemoVideo.tsx`): Extracts the 3-scene product demo sequence (countdown intro, live demo playback at 2x, completion reveal) into its own ~86-second video, separate from the full 3+ minute VSL
- **"See It In Action" section** on sales landing page: Replaces the mid-page full VSL replay with the focused demo video, positioned after the mechanism reveal (How It Works)
- **DemoPoster component**: Branded dark poster with "See ConversionIQ™ In Action" headline and pulsing play button, shown before user clicks play
- **`DEMO_VIDEO_CONFIG` and `DEMO_SCENES`** in `brand.ts`: Standalone video config (2570 frames @ 30fps) and scene timing constants
- **Nav link**: "See It In Action" added to desktop and mobile navigation, replacing "About", linking to `#demo` anchor
- **Brush underline**: "Under 3 Minutes" in the section headline uses the lime-to-violet brush underline effect

### Files Changed
- `src/remotion/DemoVideo.tsx` — New standalone demo video composition (3 scenes + background music)
- `src/remotion/brand.ts` — Added `DEMO_VIDEO_CONFIG` and `DEMO_SCENES` constants
- `src/remotion/Root.tsx` — Registered `DemoVideo` composition alongside existing VSL
- `src/pages/SalesLanding.tsx` — New `DemoPoster` component, replaced mid-page VSL with demo video, updated nav links
- `src/pages/SalesLanding.css` — New styles for `.see-it-in-action-section`, `.demo-poster-*` with responsive breakpoints

---

## 2026-02-12 — Fix browser crashes during ad generation from memory exhaustion

### Fixed
- **Redundant Gemini API calls causing memory explosion**: Each parallel image variation was independently calling `analyzeReferenceImages()` — a full Gemini API call sending up to 6 large base64 reference images. With 5 variations, this meant 5 redundant analysis calls + 10 total API requests with ~60-180MB of base64 data held in memory simultaneously. Now pre-computes reference analysis once and shares it across all parallel calls.
- **Unbounded parallel image generation**: All image variations (up to 5) fired simultaneously via `Promise.allSettled`, each carrying large base64 payloads. Now batches in pairs (max 2 concurrent) to prevent memory exhaustion.
- **`requestIdleCallback` causing data loss**: `requestIdleCallback` cleanup cancels pending callbacks on component unmount, losing localStorage saves before navigation. Replaced with simple `setTimeout` (100-200ms) throughout AdGenerator.
- **`handleRegenerateImage` bypassed image stripping**: Was saving all ads with full base64 images directly, bypassing the `MAX_ADS_WITH_IMAGES` safety limit. Now relies on the `useEffect` save path which correctly strips images from older ads.
- **Storage warning always cleared on save**: Line 418 (`setStorageWarning(null)`) ran unconditionally after save, overwriting the warning set when data exceeded 3MB. Warning mechanism was effectively non-functional for 3-5MB data sizes.
- **Unnecessary re-renders on all GeneratedAdCards**: Component was not memoized, causing all cards (with large base64 images) to re-render whenever any ad in the array changed.

### Changed
- **`generateAdPackage()`**: Pre-computes reference images and analysis once before parallel generation loop, passes `precomputedRefs` to each `generateAdImage()` call
- **`generateAdImageWithGemini()`**: Accepts optional `precomputedRefs` parameter; computes references on-the-fly only for single image regeneration
- **`GeneratedAdCard`**: Wrapped in `React.memo()` to prevent expensive re-renders
- **Initial ads load**: Reduced delay from 3000ms to 100ms for faster page load

### Files Changed
- `src/services/openaiApi.ts` — Pre-computed reference analysis, concurrency limit of 2 for image generation
- `src/pages/AdGenerator.tsx` — Removed `requestIdleCallback`, fixed storage warning logic, simplified save paths
- `src/components/GeneratedAdCard.tsx` — Added `React.memo()` wrapper

---

## 2026-02-12 — Fix copy selection crash and enable ConversionIQ™ reasoning levels

### Fixed
- **Chrome crash on copy selection panel**: Replaced `transition: all 0.2s ease` with targeted property transitions (`border-color`, `background-color`) on all copy option buttons and checkboxes — eliminates expensive layout recalculations that caused Chrome to freeze with long body copy text
- **Body copy text overwhelming the DOM**: Long body copy (>250 chars) is now truncated to 4 lines with a "Show more" / "Show less" toggle, preventing massive text walls from crashing the browser
- **Unnecessary re-renders on toggle clicks**: Wrapped `CopySelectionPanel` in `React.memo` and stabilized toggle handlers with `useCallback` to prevent cascading re-renders from the parent `AdGenerator` component
- **ConversionIQ™ reasoning levels had no effect**: The `reasoning.effort` parameter was accepted by the IQ selector UI but silently ignored — never sent to the GPT-5.2 API. All IQ levels (Standard, Deep, Maximum) produced identical results
- **Temperature + reasoning API conflict**: When reasoning effort is active, temperature is now omitted from the request body to avoid potential GPT-5.2 API conflicts. When reasoning is `'none'`, the reasoning parameter is omitted entirely

### Added
- **`BodyCopyOption` component**: Dedicated component for body copy items with local expand/collapse state and keyboard accessibility (`onKeyDown` for Enter/Space)
- **CSS `contain: content`**: Added to `.copy-option` for isolated paint contexts, preventing layout shifts from propagating between options

### Changed
- **`callOpenAI()`**: Now sends `reasoning: { effort }` parameter to GPT-5.2 when effort is not `'none'`
- **`callOpenAIWithVision()`**: Same reasoning parameter fix — channel analysis IQ levels now work too
- Updated stale JSDoc comments that incorrectly stated reasoning was "not supported"

### Files Changed
- `src/components/CopySelectionPanel.tsx` — `React.memo`, `BodyCopyOption` with truncation and keyboard a11y
- `src/components/CopySelectionPanel.css` — Targeted transitions, `contain: content`, truncation styles
- `src/pages/AdGenerator.tsx` — `useCallback` on toggle handlers
- `src/services/openaiApi.ts` — Reasoning parameter sent to API, temperature/reasoning conflict handling

---

## 2026-02-12 — Document Meta App Review permissions and submission process

### Added (CLAUDE.md)
- **Meta App Review — Permissions & Submission Guide**: Comprehensive documentation section covering the full Meta App Review process for future reference, including:
  - Key concepts: Development vs Live/Published mode, "Ready for testing" vs "Ready to publish" vs "Advanced Access" — and the critical distinction that app-level publish status and per-permission access levels are independent
  - Required OAuth scopes (`ads_management`, `ads_read`, `business_management`, `pages_read_engagement`) and what each is used for in the codebase
  - Permissions NOT needed (`pages_manage_ads`, `email`) with rationale
  - Prerequisites checklist (Privacy Policy URL, Terms of Service, Data Deletion URL, App Icon, Business Verification, Data Use Checkup)
  - Step-by-step submission process for bundling multiple permissions in a single review
  - Copy-paste description templates for all 5 permissions: `ads_management`, `ads_read`, `pages_read_engagement`, `business_management`, `pages_show_list`
  - Data handling questionnaire answers with processor justifications (Vercel, Supabase, Google LLC, OpenAI LLC)
  - Reviewer instructions template with testing steps and credential format
  - Troubleshooting guide for common errors: "Feature unavailable" OAuth error, permissions stuck at "Ready for testing", "Data handling questions" gray dot, app published but users still blocked

### Context
External users were blocked with "Feature unavailable — Facebook Login is currently unavailable for this app" error. Root cause: only "Ads Management Standard Access" had been submitted for App Review, but the OAuth flow requests `ads_management`, `ads_read`, `business_management`, and `pages_read_engagement` — all of which need Advanced Access independently. Submitted all 5 permissions for review on 2026-02-12.

### Files Changed
- `CLAUDE.md` — Added "Meta App Review — Permissions & Submission Guide" section

---

## 2026-02-12 — Add full demo video to VSL and sales landing page

### Added (VSL — Remotion)
- **Demo Intro scene**: "Think that sounds too good to be true? Watch it happen. In real time." with animated 3-2-1 countdown and white flash transition
- **Demo Playback scene**: Full app walkthrough video plays at 2x speed with a synced countdown timer (top-center, 64px, lime brand color, includes milliseconds), LIVE DEMO badge, and ConversionIQ™ branding
- **Demo Complete scene**: Animated checkmark reveal — "Brand-new high-converting creatives. Published from scratch. In exactly 2 minutes and 21 seconds." with "Powered by ConversionIQ™" badge
- **`DEMO_CONFIG`** in `brand.ts`: Configurable `videoDuration` (141s) and `playbackRate` (2x) for easy tuning
- **Music looping**: Two `<Audio>` elements in separate `<Sequence>` components with shared `musicVolume()` volume envelope — music dips to 8% during demo playback
- **Web-optimized demo video**: Converted 66MB .mov to 12MB .mp4 (H.264, faststart, 30fps, CRF 23, no audio)

### Changed (VSL — Remotion)
- **Total VSL duration**: Increased from ~110s to ~195s (~3:15) to accommodate full demo showcase
- **Scene timing**: Added `demoIntro`, `demoPlayback`, `demoComplete` scenes; shifted Results, Cost of Waiting, Enterprise, and CTA scenes accordingly

### Changed (Sales Landing Page)
- **Hero VSL caption**: Moved from below the video to above it with compelling copy — "Launch high-converting ads in under 3 minutes — See ConversionIQ™ in action"
- **VSL poster label**: Updated from "Watch the 90-Second Breakdown" to "Watch the Full Demo"
- **Mid-page VSL player**: Added a second VSL player between Mechanism Reveal and Bespoke Differentiator sections — "Don't Take Our Word for It. Watch It Happen in Under 3 Minutes." — catches users who scroll past the hero

### Files Changed
- `src/remotion/ConvertraVSL.tsx` — DemoIntroScene, DemoPlaybackScene, DemoCompleteScene, music looping with `musicVolume()` helper
- `src/remotion/brand.ts` — DEMO_CONFIG, updated SCENES timing, VIDEO_CONFIG.durationInFrames
- `src/pages/SalesLanding.tsx` — Above-video headline, mid-page VSL section, poster label update
- `src/pages/SalesLanding.css` — Demo caption restyled as headline, mid-page VSL section styles

### Files Added
- `public/vsl-broll.mp4` — Web-optimized demo video (12MB)

---

## 2026-02-11 — Fix Supabase security linter errors and warnings

### Fixed (SQL Migration 005)
- **`funnel_events` table exposed without RLS** (ERROR): Enabled Row Level Security on the `funnel_events` table. All access is via service role key (backend API), so no policies are needed — RLS with no policies blocks all direct PostgREST/client access while service role key bypasses RLS. This also resolves the sensitive `session_id` column exposure.
- **`update_updated_at_column()` and `update_updated_at()` mutable search_path** (WARN): Added `SET search_path = ''` to both trigger functions to prevent schema shadowing attacks.
- **Overly permissive INSERT policies on `organizations` and `users`** (WARN): Dropped 3 RLS policies that allowed unrestricted inserts via PostgREST — "Allow signup inserts for organizations" (anon), "Authenticated users can create organizations" (authenticated), and "Allow signup inserts for users" (anon). All org/user creation goes through `handleProvisionOrg()` in `api/seoiq.ts` using service role key, so these policies were unused security holes.

### Not Changed (Manual / No Action)
- **Leaked password protection** (WARN): Requires Supabase Pro plan — cannot enable on Hobby tier.
- **`organization_credentials` RLS enabled with no policies** (INFO): Correct behavior — credentials table is only accessed via service role key. No policies = no PostgREST access, which is the intended security model.

### Files Created
- `supabase/migrations/005_security_fixes.sql` — RLS enablement, search_path fixes, policy drops

---

## 2026-02-11 — Fix infinite resync loop on Meta Ads page

### Fixed
- **Meta Ads page stuck in perpetual "Syncing your ad data..." loop**: The `autoFetchingRefs` guard flag was stored as `useState`, causing an infinite re-render cascade: state change → `autoFetchTopImages` callback recreated → `loadMetaData` callback recreated → `useEffect` re-fires → fetches all data again → repeat. Changed to `useRef` since the flag is only a concurrency guard and doesn't need to trigger re-renders.

### Files Changed
- `src/pages/MetaAds.tsx` — Changed `autoFetchingRefs` from `useState` to `useRef`, removed it from `useCallback` dependency array

---

## 2026-02-11 — Gate Funnels feature to super admin only

### Changed
- **Funnels page restricted to super admins**: The `/funnels` route is now wrapped with `SuperAdminRoute` — non-super-admin users are redirected to the dashboard if they navigate there directly.
- **Funnels nav link hidden for regular users**: The "Funnels" item in the sidebar only renders when `isSuperAdmin` is true.
- **Dashboard skips funnel API for non-super-admins**: The funnel metrics fetch (`/api/funnel/metrics`) is skipped entirely for regular users, avoiding unnecessary API calls and error states.
- **Funnel-only dashboard metrics hidden**: Unique Customers, AOV, Sessions, and CAC stat cards are hidden from the dashboard grid and the Customize panel for non-super-admin users. Meta-only metrics (Revenue, Conversions, Conversion Rate, Ad Spend, ROAS) remain visible.
- **Funnel warning banner suppressed**: The "Funnel data unavailable" warning no longer appears for non-super-admin users.

### Files Changed
- `src/App.tsx` — Wrapped `/funnels` route with `<SuperAdminRoute>`
- `src/components/Sidebar.tsx` — Conditional render of Funnels nav link based on `isSuperAdmin`
- `src/pages/Dashboard.tsx` — Skip funnel fetch, hide funnel-only metrics and warning for non-super-admins

---

## 2026-02-11 — Meta manual credential fallback and comprehensive legal pages

### Fixed
- **External users blocked by Meta OAuth "Feature unavailable" error**: When a Facebook App is in Development mode, external users cannot use the OAuth connect flow. Added a manual credential entry fallback in the onboarding setup so users can paste their Meta access token, ad account ID, page ID, and pixel ID directly.

### Added
- **Manual Meta credential entry** (`api/meta.ts` → `save-credentials` route): JWT-authenticated endpoint that validates the token via `debug_token`, fetches available ad accounts and pages, encrypts the token with AES-256-GCM, and upserts to `organization_credentials`. Added to existing catch-all handler (no new serverless function).
- **`saveManualCredentials()` frontend service** (`src/services/metaApi.ts`): Calls the new backend route with JWT auth.
- **Manual entry UI in onboarding** (`src/components/MetaOnboardingSetup.tsx`): Expandable "Enter credentials manually" section with form fields, validation, and save flow. Appears below the OAuth connect button.
- **Privacy Policy page** (`/privacy`): Comprehensive policy covering data collection (Meta API, Stripe, AI processing), sharing, security (AES-256-GCM encryption), retention, user rights, and Meta Platform compliance.
- **Terms of Service page** (`/terms`): Full terms covering eligibility, subscription/billing, acceptable use, IP (ConversionIQ™/CreativeIQ™), AI-generated content, liability, and governing law (Delaware).
- **Cookie Policy page** (`/cookies`): Covers essential auth cookies (Supabase), CSRF cookies, localStorage usage (dashboard prefs, analysis cache, image cache, product data, publisher presets), and third-party cookies (Stripe, Meta).
- **Data Deletion page** (`/data-deletion`): Data deletion instructions required by Meta App Review — request methods, 30-day timeline, retained data, Meta disconnect option, and Facebook data deletion callback compliance.
- **Shared legal page layout** (`src/pages/LegalPage.tsx` + `LegalPage.css`): Reusable wrapper with sticky header (Convertra logo + back to home link), content area, and footer with cross-links to all legal pages. Uses SEO component for meta tags.
- **Legal links in sales landing footer** (`src/pages/SalesLanding.tsx`): Privacy Policy, Terms of Service, Cookie Policy, and Data Deletion links added below the existing footer navigation.

### Files Changed
- `api/meta.ts` — Added `save-credentials` route with token validation, encryption, and credential upsert
- `src/services/metaApi.ts` — Added `saveManualCredentials()` export
- `src/components/MetaOnboardingSetup.tsx` — Manual credential entry UI with toggle, form, and save handler
- `src/components/MetaOnboardingSetup.css` — Manual entry section styles
- `src/App.tsx` — Added 4 public routes: `/privacy`, `/terms`, `/cookies`, `/data-deletion`
- `src/pages/SalesLanding.tsx` — Added legal links to footer
- `src/pages/SalesLanding.css` — Added `.footer-legal` styles

### Files Created
- `src/pages/LegalPage.tsx` — Shared legal page layout wrapper
- `src/pages/LegalPage.css` — Legal page layout styles
- `src/pages/PrivacyPolicy.tsx` — Privacy Policy content
- `src/pages/TermsOfService.tsx` — Terms of Service content
- `src/pages/CookiePolicy.tsx` — Cookie Policy content
- `src/pages/DataDeletion.tsx` — Data Deletion instructions

---

## 2026-02-11 — Trial billing hardening and early-bird discount UX

### Fixed
- **Early-bird coupon never applied for new signups**: `api/billing/checkout.ts` checked `subscription_status === 'trialing'` to apply the early-bird coupon, but new signups have status `'incomplete'` at checkout time. Now checks for both `'trialing'` and `'incomplete'` so the coupon fires on first checkout.
- **Webhook silently defaulted to 'active' on failure**: `api/billing/webhook.ts` defaulted `subscriptionStatus` to `'active'` if `stripe.subscriptions.retrieve()` failed during `checkout.session.completed`. Now skips the status update entirely and relies on the separate `customer.subscription.created` webhook to set the correct status.

### Changed
- **TrialBanner made non-dismissible**: Removed dismiss button and state. Banner now persists throughout the entire trial period with a star icon and stronger copy: "Subscribe before it ends and save 10% on Starter." Shows "Hurry!" urgency when <= 2 days remain.

### Added
- **Dashboard early-bird card**: Trial users see a violet-accented card below the onboarding checklist with "Early Bird Offer" messaging and a "View Plans" CTA linking to `/billing`.
- **Sidebar trial countdown badge**: Compact pill showing "{days}d left — Upgrade" in the sidebar nav. Collapses to a small number badge when sidebar is collapsed. Links to `/billing`.

### Files Changed
- `api/billing/checkout.ts` — Early-bird coupon condition includes `'incomplete'` status
- `api/billing/webhook.ts` — Subscription retrieval fallback no longer defaults to `'active'`
- `src/components/TrialBanner.tsx` — Non-dismissible, star icon, stronger discount messaging
- `src/components/TrialBanner.css` — Removed dismiss styles, added icon styles, bolder background
- `src/pages/Dashboard.tsx` — Early-bird offer card for trial users
- `src/pages/Dashboard.css` — Early-bird card styles
- `src/components/Sidebar.tsx` — Trial countdown badge
- `src/components/Sidebar.css` — Trial badge styles

---

## 2026-02-11 — Fix org provisioning diagnostics and onboarding error states

### Fixed
- **Onboarding checklist invisible when org provisioning fails**: The checklist returned `null` when `organization` was `null` (during loading or after provisioning failure). New users saw a blank dashboard with no onboarding. Now shows loading state during provisioning, error state with retry button on failure, and full checklist on success.
- **Provisioning errors silently swallowed**: `OrganizationContext` set an error string but nothing displayed it. The `OnboardingChecklist` now reads `orgError` from context and renders an "Account Setup Issue" card with the actual error message and a "Retry Setup" button.

### Added
- **Provision endpoint diagnostics**: `api/seoiq.ts` `handleProvisionOrg` now logs `[Provision]` prefixed messages for every failure path — missing env vars, token validation failures, org/user insert errors (with Supabase error code and details). Returns `detail` field in error responses.
- **Env var guard on provisioning**: Returns 503 with a clear message if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are missing from Vercel environment variables.
- **Onboarding loading state**: Animated indeterminate progress bar with "Setting up your account..." while org is being provisioned.
- **Onboarding error state**: Red-bordered card showing the provisioning error message with a retry button.

### Changed
- **Error detail surfaced in UI**: `OrganizationContext` now extracts `detail` from provision API error responses and appends it to the user-facing error message.

### Files Changed
- `api/seoiq.ts` — Env var guard, detailed error logging and response fields in provision handler
- `src/components/OnboardingChecklist.tsx` — Loading, error, and retry states; reads orgLoading/orgError/refresh from context
- `src/components/OnboardingChecklist.css` — Error card styles, retry button, indeterminate progress animation
- `src/contexts/OrganizationContext.tsx` — Surface `detail` field from provision API errors

## 2026-02-11 — Funnel tenant isolation, onboarding checklist UX, and clean new-account experience

### Fixed
- **Funnel data leaking across accounts**: `api/funnel/metrics.ts` and `api/funnel/active-sessions.ts` had no `organization_id` filter — all users saw all funnel events from every account. Added JWT authentication and org-scoped queries so each account only sees its own data.
- **Onboarding checklist not appearing**: Changed `setup_completed` check from truthiness (`if (organization.setup_completed)`) to strict equality (`if (organization.setup_completed === true)`). The original check hid the checklist when the field was `null` or `undefined` (e.g., column not yet populated), not just when explicitly `true`.
- **Hardcoded mock data on Channels page**: Removed static "2,138 conversions" display from channel cards — new accounts no longer see phantom metrics from `mockData.ts`.

### Added
- **Onboarding progress bar**: Violet-to-lime gradient bar showing "1/5 steps complete" for visual progress tracking.
- **Collapsible onboarding checklist**: Chevron button collapses/expands the checklist (persisted per-org in localStorage). Dismiss button still fully hides it.
- **Branded checklist icon**: Checkmark icon in header with violet/lime gradient background for visual prominence.

### Changed
- **Dashboard funnel fetch sends JWT**: `Dashboard.tsx` now includes `Authorization: Bearer` header when calling `/api/funnel/metrics` so the backend can scope data to the authenticated user's org.
- **Funnels page fetch sends JWT**: `Funnels.tsx` now sends auth headers on both `/api/funnel/metrics` and `/api/funnel/active-sessions` calls.
- **Funnel API Supabase client**: Moved from inline creation per-request to module-level singleton for connection reuse in both funnel endpoints.

### Files Changed
- `api/funnel/metrics.ts` — Add JWT auth, org-scoped queries, module-level Supabase client
- `api/funnel/active-sessions.ts` — Add JWT auth, org-scoped queries, module-level Supabase client
- `src/pages/Dashboard.tsx` — Send auth headers with funnel API fetch
- `src/pages/Funnels.tsx` — Send auth headers with both funnel API fetches
- `src/pages/Channels.tsx` — Remove hardcoded conversion count display
- `src/components/OnboardingChecklist.tsx` — Strict setup_completed check, progress bar, collapsible UI
- `src/components/OnboardingChecklist.css` — Progress bar, collapse/expand button, icon styles

## 2026-02-10 — Email confirmation flow, explore-first onboarding, and rate limit UX

### Added
- **Email confirmation screen on signup**: After registration, users see a "Check your email" confirmation screen instead of being silently redirected. Shows the submitted email address and a "try again" link to re-show the form.
- **Explore-first onboarding flow**: New users on the free plan can now freely browse data pages (Dashboard, Channels, Meta Ads, Products, Funnels) before choosing a plan. Action features (ConversionIQ, CreativeIQ, Ad Publisher, SEO IQ) are gated with a "Choose a Plan to Begin Your Free Trial" screen that links to `/choose-plan`.
- **User-friendly rate limit errors**: Login, Register, and Forgot Password pages now detect Supabase rate limit errors and show helpful messages ("Too many attempts. Please wait a few minutes...") instead of raw API error strings.

### Fixed
- **Org provisioning bypassed Stripe billing**: `handleProvisionOrg` was creating orgs with `plan_tier: 'pro'` and `subscription_status: 'trialing'` with a fake 7-day trial end date, letting users skip Stripe checkout entirely. Now creates orgs as `plan_tier: 'free'` with `subscription_status: 'incomplete'`.
- **Onboarding checklist not showing**: Added `setup_completed: false` to org provisioning insert so the welcome checklist appears on the dashboard for new self-service signups.
- **Frontend org creation failed silently due to RLS**: Removed `createOrganizationAndUser()` from `AuthContext.tsx` — this function used the anon key which was blocked by Row Level Security. Org creation is now handled exclusively by the backend `handleProvisionOrg` endpoint (via OrganizationContext fallback) which uses the service role key.

### Changed
- **Signup redirect flow**: After email confirmation, users land on `/dashboard` (was `/choose-plan`). The `emailRedirectTo` option is now set on `supabase.auth.signUp()`.
- **AuthContext signUp return type**: Now returns `{ confirmationPending?: boolean }` so the Register page can distinguish between email-confirmation-required (show confirmation screen) and dev-mode (navigate directly to dashboard).
- **SubscriptionGate gating logic**: Free-plan users are no longer hard-redirected to `/choose-plan`. Instead, data exploration routes pass through and only action routes (`/insights`, `/creatives`, `/publish`, `/seo-iq`) show the plan selection gate.
- **FreePlanGate component**: Updated title to "Choose a Plan to Begin Your Free Trial", uses `<Link to="/choose-plan">` instead of direct Stripe checkout redirect.

### Files Changed
- `api/seoiq.ts` — Fix org provisioning: free/incomplete instead of pro/trialing, add setup_completed: false
- `src/contexts/AuthContext.tsx` — Add email confirmation support, remove frontend org creation
- `src/pages/Register.tsx` — Add "Check your email" confirmation screen, rate limit error handling
- `src/pages/Register.css` — Add confirmation screen styles
- `src/components/SubscriptionGate.tsx` — Explore-first gating with ACTION_PATHS
- `src/pages/Login.tsx` — Rate limit error handling
- `src/pages/ForgotPassword.tsx` — Rate limit error handling

## 2026-02-10 — Reconfigure signup flow with Stripe-native trial & plan selection

### Added
- **Plan selection page (`/choose-plan`)**: New standalone page shown after signup where users choose Starter or Pro to start a 7-day free trial via Stripe Checkout (credit card required). Enterprise option links to demo scheduling.
- **Stripe-native trial support**: Checkout API now accepts `trialDays` param, adding `subscription_data.trial_period_days` to the Stripe session. Trial is managed by Stripe instead of database-only.
- **Dynamic checkout redirect URLs**: Checkout API accepts optional `successUrl` and `cancelUrl` params, falling back to `/billing` defaults for existing upgrade flows.
- **Post-checkout polling**: After Stripe Checkout, the choose-plan page polls the organization status every 2 seconds until the webhook updates the subscription, then redirects to the dashboard.

### Changed
- **Signup flow**: Register now redirects to `/choose-plan` instead of `/dashboard`. New orgs are created with `plan_tier: 'free'` and `subscription_status: 'incomplete'` (previously auto-granted a 7-day Pro trial).
- **Webhook accuracy**: `checkout.session.completed` handler now retrieves the actual Stripe subscription status (`trialing`/`active`) instead of hardcoding `'active'`. Also stores `current_period_start` and `current_period_end` from the Stripe subscription.
- **SubscriptionGate**: Users with `incomplete` status are redirected to `/choose-plan` instead of seeing the free-plan gate. `/choose-plan` added to always-allowed paths.
- **Sales landing pricing**: Enterprise pricing cards now show "Custom Pricing" instead of dollar amounts, encouraging demo call scheduling.

### Files Changed
- `api/billing/checkout.ts` — Accept `trialDays`, `successUrl`, `cancelUrl` params
- `api/billing/webhook.ts` — Retrieve actual subscription status from Stripe
- `src/contexts/AuthContext.tsx` — Create orgs as `free`/`incomplete` instead of `pro`/`trialing`
- `src/pages/Register.tsx` — Redirect to `/choose-plan`
- `src/services/stripeApi.ts` — Add options param to `redirectToCheckout()`
- `src/components/SubscriptionGate.tsx` — Redirect incomplete users to plan selection
- `src/App.tsx` — Add `/choose-plan` protected route
- `src/pages/ChoosePlan.tsx` + `ChoosePlan.css` — New plan selection page
- `src/pages/SalesLanding.tsx` + `SalesLanding.css` — Hide enterprise pricing

## 2026-02-10 — Fix Stripe API errors: subscription mode constraints

### Fixed
- **`customer_creation: 'always'` error**: Removed invalid parameter from checkout — Stripe auto-creates customers in subscription mode. Was causing "customer_creation can only be used in payment mode" error.
- **`subscription_data.add_invoice_items` error**: Moved enterprise/velocity partner setup fee from `subscription_data.add_invoice_items` (not a valid Checkout Session param) to an additional entry in `line_items`. Was causing "unknown parameter: subscription_data[add_invoice_items]" error.

## 2026-02-10 — Fix super admin blocked by subscription gate, user identity, and checkout resilience

### Fixed
- **Super admins blocked by subscription gate**: `SubscriptionGate` now exempts super admins entirely — they always have full app access regardless of trial/subscription status.
- **"Demo User" display for authenticated users**: `UserProfileDropdown` and `AccountSettings` now read user identity from `OrganizationContext` (Supabase) instead of localStorage, fixing the "Demo User" display for Supabase-authenticated users.
- **Checkout blocked when org lookup fails**: Org lookup in checkout endpoint is now non-fatal — if Supabase lookup fails, checkout proceeds without trial coupon and stored customer ID instead of blocking entirely. Supports dev environments and edge cases.

## 2026-02-10 — Fix billing "Organization not found" error with JWT auth

### Fixed
- **"Organization not found" error on upgrade buttons**: Clicking any upgrade button on the Billing page returned "Organization not found" because the checkout and portal API endpoints trusted client-provided `organizationId` instead of deriving it from the authenticated user's JWT token. The Supabase lookup was failing silently.
- **Billing portal endpoint had no org resolution**: `api/billing/portal.ts` relied entirely on client-provided `customerId` with no server-side verification or org lookup.

### Changed
- **JWT authentication added to `api/billing/checkout.ts`**: Now derives `organizationId` from the authenticated user's profile via JWT (matching the `meta.ts` auth pattern). Falls back to client-provided ID only when JWT is unavailable.
- **JWT authentication added to `api/billing/portal.ts`**: Now authenticates via JWT, looks up `stripe_customer_id` from the org record in Supabase, and falls back to client-provided customer ID.
- **Frontend billing API calls now send auth headers**: `fetchBillingData`, `redirectToCheckout`, and `createPortalSession` in `stripeApi.ts` now include `Authorization: Bearer <token>` using `getAuthToken()`.
- **Improved error logging in checkout endpoint**: Org lookup failures now log the actual Supabase error code and message for diagnostics.
- **Improved error messages**: Changed generic "Organization not found" to actionable "Organization not found. Please sign out and sign back in."
- **Removed `organizationId` from Stripe redirect URLs**: Success/cancel URLs no longer leak org IDs in query params.

## 2026-02-10 — Add Starter tier, reprice Pro, and tabbed pricing layout

### Added
- **Starter plan tier** ($99/month, $79/month yearly): New entry-level plan for solopreneurs — 100 creatives/month, 50 analyses, 3 channels, 3 team members. Early-bird price of $89/month during trial.
- **`starter` plan tier** across the full stack: type system (`billing.ts`, `organization.ts`), pricing config (`stripeApi.ts`), plan limits, checkout API, subscription API, and webhook handler.
- **Tabbed pricing cards on Billing page**: Replaced 3 separate plan cards with 2 side-by-side tabbed cards — "Small Business" (Starter/Pro tabs) and "Enterprise Solutions" (Self-Service/Velocity Partner tabs). Creates price anchoring effect with enterprise pricing visible next to small business pricing.
- **"Small Business" label badge**: Lime gradient pill badge above the small business tabbed card.
- **"Enterprise Solutions" label badge**: Violet gradient pill badge above the enterprise tabbed card.
- **Embedded PlanCard mode**: `embedded` prop removes card wrapper styling (glass, shadow, border) when PlanCard is rendered inside a tabbed container.

### Changed
- **Pro plan repriced**: $149/month (was $99), $119/month yearly (was $79). Features bumped to 250 creatives, 100 analyses, 5 channels, 10 team members.
- **Early-bird coupon target**: Checkout API now applies early-bird coupon to `starter` tier (was `pro`).
- **Tier ordering** updated: free(0) → starter(1) → pro(2) → enterprise(3) → velocity_partner(4).
- **Webhook default fallback**: Default plan tier changed from `'pro'` to `'starter'` on subscription events.
- **Pricing grid layout**: Changed from flat card row to two tabbed card containers with `align-items: start`.

### New Environment Variables
- `STRIPE_PRICE_STARTER_MONTHLY` — Stripe recurring price ID for Starter $99/month
- `STRIPE_PRICE_STARTER_YEARLY` — Stripe recurring price ID for Starter yearly

## 2026-02-10 — Enforce trial-only signup and add beta tester promo code support

### Fixed
- **Provision-org fallback created free plan instead of trial**: The `/api/seo-iq/provision-org` endpoint created organizations with `plan_tier: 'free'` and no trial period, allowing users to bypass the paywall entirely. Now creates `plan_tier: 'pro'` with `subscription_status: 'trialing'` and a 7-day trial — matching the normal signup flow.
- **Free plan users bypassed subscription gating**: `isSubscriptionValid` returned `true` for free-plan users (since `subscription_status === 'active'`), letting them access the full app without ever subscribing. Now excludes free-plan users unless they are super admins.

### Added
- **FreePlanGate component** in `SubscriptionGate.tsx`: Dedicated gate for non-admin free-plan users with "Start your free trial" messaging and CTA.
- **Super admin exemption for free plan**: Only `is_super_admin === true` users can remain on the free plan without hitting the paywall. All other users must be on trial or paid.
- **Promo code support at checkout**: New `usePromoCode` flag enables Stripe's built-in promotion code field at checkout. Mutually exclusive with the auto-applied early-bird coupon — when promo mode is active, the early-bird is skipped so users can enter their own code (e.g., 100% off beta tester code).
- **"I have a promo code" toggle** on Billing page: Checkbox above plan cards lets users opt into promo code entry at Stripe Checkout.
- **Card-free checkout for $0 subscriptions**: Added `payment_method_collection: 'if_required'` to Stripe checkout sessions so fully-discounted subscriptions (100% off coupon) don't require a credit card.

### Stripe Setup Required
- Create a **100% off coupon** in Stripe Dashboard (Products → Coupons) with duration "forever" for beta testers
- Create a **promotion code** from that coupon (e.g., `BETA100`) and share with beta testers
- No new environment variables needed

## 2026-02-10 — Enterprise Self-Service and Velocity Partner pricing tiers

### Added
- **Velocity Partner plan tier**: New highest-tier plan at $3,500/month + $2,500 setup fee. Full partnership where Convertra installs, configures, and runs the platform — including a dedicated media buyer who manages creative testing, ad launching, and optimization on behalf of the client.
- **`velocity_partner` plan tier** across the full stack: type system (`billing.ts`, `organization.ts`), pricing config (`stripeApi.ts`), plan limits, checkout API, subscription API, billing page, sales landing, and admin portal.
- **Two-card pricing layout on sales landing**: Replaced single enterprise card with side-by-side comparison — Enterprise (Self-Service) at $1,500/mo and Velocity Partner (Full Partnership) at $3,500/mo. Each card shows price, setup fee, feature checklist, and "Schedule a Demo" CTA.
- **Velocity Partner badge** in billing page with lime-to-violet gradient styling.
- **Managed media buying** and **weekly creative output quota** features shown on Velocity Partner plan card in billing.
- **Admin support**: Velocity Partner added to organization creation form, plan filter dropdown, and pricing labels.

### Changed
- **Enterprise plan repositioned** as "Self-Service" — we install and configure, the client's team runs it day-to-day with a dedicated Convertra point of contact.
- **Sales landing pricing header** updated from "Enterprise Pricing Only — For Now" to "Two Ways to Partner With Convertra".
- **Tier ordering** updated: free(0) → pro(1) → enterprise(2) → velocity_partner(3).
- **Setup fee** now applies to both Enterprise and Velocity Partner tiers in checkout API.
- **Admin pricing labels** corrected: Enterprise shows $1,500/mo (was $499/mo).

### New Environment Variables
- `STRIPE_PRICE_VELOCITY_PARTNER_MONTHLY` — Stripe recurring price ID for Velocity Partner $3,500/month
- `STRIPE_PRICE_VELOCITY_PARTNER_YEARLY` — Stripe recurring price ID for Velocity Partner yearly
- `STRIPE_PRICE_PRO_YEARLY` — Stripe recurring price ID for Pro yearly
- `STRIPE_PRICE_ENTERPRISE_YEARLY` — Stripe recurring price ID for Enterprise yearly

## 2026-02-09 — 7-day free trial, billing enforcement, and pricing overhaul

### Added
- **7-day Pro trial for all new signups**: New organizations start with `plan_tier: 'pro'`, `subscription_status: 'trialing'`, and `current_period_end` set 7 days out. No credit card required.
- **SubscriptionGate component** (`src/components/SubscriptionGate.tsx`): Wraps app content in `MainLayout` and blocks access when the subscription is invalid (expired trial, canceled). Always allows `/billing` and `/account` so users can upgrade. Blocks `/seo-iq` for trial users (paid-only feature).
- **TrialBanner component** (`src/components/TrialBanner.tsx`): Persistent countdown banner during trial — "X days left in your free trial. Subscribe now and lock in $89/month". Turns amber when 2 or fewer days remain. Dismissible per session.
- **Early-bird pricing**: Pro plan shows $89/month (instead of $99) during the trial period. Stripe coupon (`STRIPE_EARLY_BIRD_COUPON_ID`) applied automatically at checkout when the org is trialing.
- **Enterprise setup fee**: $2,500 one-time charge added to the first invoice via `subscription_data.add_invoice_items` when subscribing to Enterprise.
- **Trial computed fields** in `OrganizationContext`: `isTrialing`, `isSubscriptionValid`, `trialDaysRemaining` derived from org data and exposed via context.
- **Trial helpers** in `stripeApi.ts`: `isInTrial(org)` and `getTrialDaysRemaining(org)` utility functions.
- **Trial status card** on Billing page: Shows countdown and early-bird messaging when trialing.
- **Trial expired alert** on Billing page: Prompts upgrade when trial has ended.

### Changed
- **Free tier removed**: No more free plan in pricing UI. `PRICING_PLANS` array now contains only Pro ($99/month) and Enterprise ($1,500/month).
- **Pricing grid**: Changed from 3-column to 2-column layout (free tier removed).
- **Enterprise pricing updated**: $1,500/month (was $499), $1,250/month yearly, with $2,500 one-time setup fee.
- **PlanCard component**: Now supports `showEarlyBird` prop, early-bird badge, strikethrough regular price, setup fee display, and dedicated account manager feature.
- **`isCurrentPlan` logic**: Only marks a plan as "current" when `subscription_status === 'active'` (not during trial).
- **Webhook `customer.subscription.deleted`**: No longer resets `plan_tier` to `'free'` — keeps existing tier so user sees "resubscribe" instead of "upgrade".
- **Checkout endpoint**: Detects trial status from Supabase and applies early-bird coupon or enterprise setup fee accordingly.

### New Environment Variables
- `STRIPE_EARLY_BIRD_COUPON_ID` — Stripe coupon ID for early-bird $10/month discount
- `STRIPE_PRICE_ENTERPRISE_SETUP` — Stripe one-time price ID for $2,500 enterprise setup fee
- `STRIPE_PRICE_PRO_MONTHLY` — Stripe recurring price ID for Pro $99/month
- `STRIPE_PRICE_ENTERPRISE_MONTHLY` — Stripe recurring price ID for Enterprise $1,500/month

## 2026-02-09 — Self-service Meta onboarding for users

### Added
- **Self-service Meta connect flow on Dashboard**: Users can now connect their own Meta Ads account directly from the onboarding checklist on the Dashboard, without needing an admin. The "Connect Meta Ads" button triggers the same Facebook OAuth flow used by admins.
- **Account/page/pixel configuration UI in onboarding**: After OAuth, the onboarding checklist shows dropdowns for selecting ad account, Facebook page, and Meta pixel — identical to the admin flow but accessible to regular users.
- **`MetaOnboardingSetup` component** (`src/components/MetaOnboardingSetup.tsx`): New 3-state card component — not connected (connect button), needs configuration (selection dropdowns), or fully configured (success state).
- **User-facing `update-selection` route** in `api/meta.ts`: Lets authenticated users save their ad account/page/pixel selection. Organization ID is derived from JWT, never from the request body.
- **User-facing `fetch-pixels` route** in `api/meta.ts`: Fetches available Meta pixels for a selected ad account, with JWT auth.
- **OAuth redirect handling on Dashboard**: Detects `?meta_connected=true` query param after OAuth callback, refreshes Meta credential cache, and shows a success notification prompting configuration.

### Changed
- **`handleStatus` in `api/meta.ts`** now returns `availableAccounts`, `availablePages`, and `needsConfiguration` fields to all authenticated users (previously only the admin endpoint returned these).
- **`OrgMetaIds` interface** in `metaApi.ts` expanded with `availableAccounts`, `availablePages`, and `needsConfiguration` fields.
- **`OnboardingChecklist`** now embeds `MetaOnboardingSetup` inline when Meta is not fully configured, instead of just showing a passive link.
- **Meta "connected" check** in onboarding now requires both `adAccountId` and `pageId` to be set (not just an active token) to count as fully configured.

## 2026-02-09 — Add account/page/pixel selection UI to Meta OAuth onboarding

### Changed
- **OAuth callback no longer auto-selects first ad account**: Previously auto-selected the first active ad account, leaving page_id and pixel_id blank. Now stores all available accounts and pages in metadata without selecting anything, allowing the admin to choose.
- **OAuth callback fetches Facebook Pages**: Added `/me/accounts` fetch during the callback to populate available pages alongside ad accounts.

### Added
- **Configure Connection card** on Meta Setup tab: When connected but no selections made, shows dropdown selectors for ad account, Facebook page, and Meta pixel with a "Save Configuration" button.
- **`fetch-pixels` admin action**: Decrypts the org's stored Meta token and fetches available pixels for a given ad account via the Meta API.
- **`update-selection` admin action**: Saves the admin's chosen ad account ID, page ID, and pixel ID to the credentials row.
- **Status API returns available options**: `handleStatus` now includes `availableAccounts` and `availablePages` from metadata so the frontend can populate dropdowns.

## 2026-02-09 — Fix Meta OAuth redirect URI pointing to dead domain

### Fixed
- **Meta OAuth callback redirected to non-existent `app.convertra.io`**: The `META_REDIRECT_URI` env var was not set, so both `connect.ts` and `callback.ts` fell back to the hardcoded `https://app.convertra.io/api/auth/meta/callback` — a domain that doesn't exist (DNS_PROBE_FINISHED_NXDOMAIN). Replaced the static fallback with a `getRedirectUri(req)` function that derives the redirect URI dynamically from the request's host header, falling back to `www.convertraiq.com`.
- **Callback success redirect also referenced `app.convertra.io`**: The post-OAuth return URL constructor used `app.convertra.io` as its origin fallback. Updated to `www.convertraiq.com`.

## 2026-02-09 — Fix Meta OAuth invalid scope and tab refresh issues

### Fixed
- **Meta OAuth `read_insights` scope rejected by Facebook**: Removed deprecated `read_insights` scope from OAuth permission request in `api/auth/meta/connect.ts`. The `ads_read` scope already covers reading ad performance and insights data.
- **Pages refresh when switching browser tabs**: Removed `visibilitychange` event listener in `AdGenerator.tsx` that was reloading products from localStorage every time the browser tab regained focus, causing unnecessary re-renders and the appearance of a page refresh.
- **Admin pages remount on every navigation**: Removed `key={location.pathname}` from `<Outlet>` in `AdminLayout.tsx` which was causing full component unmount/remount cycles on every route change, destroying local state and re-triggering all API calls.

## 2026-02-09 — Fix admin onboarding flow (Save Branding, Meta Setup errors, OAuth error handling)

### Fixed
- **Save Branding button was a no-op**: The "Save Branding" button on the Settings tab of the Organization Detail admin page had no click handler and used uncontrolled inputs. Wired it up with controlled state, a save handler, and a new `update-branding` backend action that persists logo URL, primary color, and secondary color to the `organizations` table.
- **Connect via Facebook showed raw JSON error**: When `META_APP_ID` was not configured, the OAuth initiation endpoint returned a JSON error response directly to the browser (since the flow uses `window.location.href` redirect). Changed to redirect back to the admin page with error query params so the existing notification banner displays a human-readable message.
- **Meta Setup tab silently swallowed errors**: The `loadMetaStatus` function caught errors but only logged them to `console.error`. Now shows a notification banner when the Meta status fetch fails or returns a non-200 response.

### Added
- `update-branding` action in `api/admin/credentials.ts` to save organization branding settings (logo URL, primary/secondary colors)
