# Changelog

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
