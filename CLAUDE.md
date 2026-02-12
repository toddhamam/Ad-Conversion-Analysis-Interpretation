# Conversion Intelligence

A SaaS platform for CMOs and media buyers solving ad creative fatigue through automated high-converting ad generation and testing. CI automates the creative testing flywheel that traditionally takes weeks into minutes.

## Branding

| Context | Brand Name | Usage |
|---------|------------|-------|
| Product/App | Conversion Intelligence (CI) | Internal dashboard, app UI |
| Sales/Marketing | Convertra | Sales landing page, external marketing |
| Proprietary Technology | ConversionIQ™ | The unique mechanism—Extract, Interpret, Generate, Repeat |
| AI Creative Feature | CreativeIQ™ | AI-powered ad creative generation (the "hero action" of the app) |

**Logo**: `public/convertra-logo.png` - "Convertra" wordmark with stylized "v" as upward arrow featuring lime-to-violet gradient

**Favicon**: `public/favicon.svg` - Stylized "V" arrow icon with lime-to-violet gradient

### Loading States & ConversionIQ™ Branding

All loading indicators and data fetching states should use **ConversionIQ™** branded messaging. Use the `Loading` component (`src/components/Loading.tsx`) with on-brand messages:

```tsx
import Loading from '../components/Loading';

// Examples of on-brand loading messages:
<Loading size="large" message="ConversionIQ™ extracting insights..." />
<Loading size="medium" message="ConversionIQ™ syncing channels..." />
<Loading size="small" message="ConversionIQ™ analyzing..." />

// For fullscreen loading overlay:
<Loading fullScreen size="large" message="ConversionIQ™ initializing..." />
```

**Approved loading message patterns:**
- "ConversionIQ™ extracting insights..."
- "ConversionIQ™ syncing channels..."
- "ConversionIQ™ analyzing..."
- "ConversionIQ™ generating..."
- "ConversionIQ™ processing..."

**Never use generic messages like:**
- "Loading..."
- "Please wait..."
- "Connecting to API..."

## Quick Context

- **Stack**: React 19 + TypeScript + Vite
- **APIs**: Meta Marketing API, OpenAI GPT-5.2, Google Gemini 3 Pro
- **Styling**: Enterprise Light theme, subtle depth, CSS variables
- **State**: React hooks + localStorage caching (no Redux/Context)

## Project Structure

```
src/
├── pages/           # Route-level components (Channels, MetaAds, AdGenerator, Insights, SalesLanding)
├── components/      # Reusable UI (DateRangePicker, CampaignTypeDashboard, OnboardingChecklist, etc.)
├── services/        # API integrations (metaApi.ts, openaiApi.ts, imageCache.ts, stripeApi.ts)
├── lib/             # Shared frontend utilities (supabase.ts, authToken.ts)
├── contexts/        # React contexts (AuthContext, OrganizationContext)
├── remotion/        # Remotion VSL video composition and brand constants
├── types/           # TypeScript interfaces
└── data/            # Mock data for development

api/
├── _lib/            # Shared backend helpers (encryption, google-auth, google-ads, seo-prompts)
├── admin/           # Admin-only API routes (credentials.ts)
├── auth/            # OAuth flows (meta/connect.ts, meta/callback.ts)
├── billing/         # Stripe billing API routes (checkout.ts, portal.ts, webhook.ts)
├── funnel/          # Funnel metrics API routes
├── meta.ts          # Meta API catch-all proxy (proxy, status, upload, insights, campaigns)
├── seoiq.ts         # SEO IQ catch-all API
└── google-auth.ts   # Google OAuth token management

public/
├── convertra-logo.png  # Convertra brand logo
└── ...
```

## Key Files

| File | Purpose |
|------|---------|
| `src/services/metaApi.ts` | Meta Marketing API — all calls routed through backend proxy (`/api/meta/proxy`), token never reaches browser |
| `src/services/openaiApi.ts` | AI analysis (GPT-5.2) + creative generation (Gemini/Veo). Model IDs defined as constants at top of file |
| `src/services/imageCache.ts` | Client-side image caching with quality scoring |
| `src/pages/MetaAds.tsx` | Main dashboard - campaign metrics, creative analysis |
| `src/pages/AdGenerator.tsx` | AI-powered ad creative generation workflow |
| `src/pages/Insights.tsx` | Channel-level AI analysis with health scores |
| `src/pages/SalesLanding.tsx` | Convertra sales/marketing landing page |
| `src/pages/SalesLanding.css` | Sales landing page styles with animations |
| `src/components/Loading.tsx` | Branded loading component with animated logo |
| `src/components/Sidebar.tsx` | Collapsible sidebar navigation with direct links |
| `src/components/ProtectedRoute.tsx` | Auth guard for protected routes |
| `src/pages/Login.tsx` | Authentication login page |
| `src/pages/Register.tsx` | Company registration/signup page |
| `src/pages/ForgotPassword.tsx` | Request password reset email |
| `src/pages/ResetPassword.tsx` | Set new password after email link |
| `src/contexts/AuthContext.tsx` | Auth state management with Supabase integration |
| `src/lib/supabase.ts` | Supabase client singleton with configuration check |
| `src/components/UserProfileDropdown.tsx` | User profile dropdown with company branding, sign out, account actions |
| `src/components/MainLayout.tsx` | App shell with sidebar, header, and responsive navigation |
| `src/services/stripeApi.ts` | Stripe integration - checkout, portal, subscription management (sends JWT auth headers) |
| `src/pages/Billing.tsx` | Billing portal page with plan management |
| `src/pages/AccountSettings.tsx` | Account settings — reads user identity from OrganizationContext (Supabase) |
| `src/components/SubscriptionGate.tsx` | Subscription/trial gate — blocks free/expired users, exempts super admins |
| `src/pages/Dashboard.tsx` | Main dashboard with customizable stat cards, date range picker, fetches from both Meta API and Supabase funnel API |
| `src/pages/Funnels.tsx` | Funnel metrics page with ad spend configuration |
| `src/components/DashboardCustomizer.tsx` | Drag-and-drop dashboard layout customization |
| `src/components/StatCard.tsx` | Reusable stat card component for metrics display |
| `api/billing/checkout.ts` | Stripe Checkout sessions — JWT auth, non-fatal org lookup, promo code/coupon logic |
| `api/billing/portal.ts` | Stripe Customer Portal — JWT auth, org-derived customer ID resolution |
| `api/billing/subscription.ts` | Subscription status lookup for billing page |
| `api/billing/webhook.ts` | Stripe webhook handler for subscription lifecycle events |
| `api/seoiq.ts` | SEO IQ catch-all API — sites, keywords, articles, autopilot, keyword research (JWT-protected) |
| `api/_lib/google-ads.ts` | Google Ads Keyword Planner API client — token refresh + `fetchKeywordIdeas()` |
| `api/_lib/google-auth.ts` | Google OAuth token management — per-site access token refresh for GSC |
| `api/_lib/seo-prompts.ts` | SEO article generation prompts + keyword scoring (`scoreQuickWin`, `scoreCTROptimization`, `scoreContentGap`) |
| `api/funnel/metrics.ts` | Supabase funnel metrics API endpoint |
| `src/components/IQSelector.tsx` | ConversionIQ™ reasoning level selector for AI operations |
| `src/components/SEO.tsx` | Centralized SEO component for meta tags and structured data |
| `src/components/GeneratedAdCard.tsx` | Generated ad display with lazy images, copy clipboard, image regeneration |
| `src/components/CopySelectionPanel.tsx` | Multi-select UI for choosing headlines, body copy, and CTAs |
| `src/pages/Products.tsx` | Product CRUD manager (name, author, description, URL, mockup images) |
| `public/robots.txt` | Search engine crawl directives (allows AI bots for GEO) |
| `public/sitemap.xml` | XML sitemap for search engine indexing |
| `src/pages/SeoIQ.tsx` | SEO IQ dashboard — sites, keywords (GSC + Keyword Planner), articles, content calendar, autopilot |
| `src/services/seoIqApi.ts` | SEO IQ API service — all frontend API calls with auth header injection |
| `src/types/seoiq.ts` | SEO IQ TypeScript types — sites, keywords, articles, autopilot, research responses |
| `src/contexts/OrganizationContext.tsx` | Organization provisioning context with auth; loads org Meta credentials on init |
| `src/remotion/ConvertraVSL.tsx` | Remotion VSL video composition — 13-scene animated sales video with background music |
| `src/remotion/brand.ts` | VSL brand constants (colors, gradients, fonts, scene timing) |
| `public/vsl-background-music.mp3` | VSL background music — cinematic inspirational track |
| `src/remotion/Root.tsx` | Remotion composition entry point |
| `remotion.config.ts` | Remotion CLI configuration |
| `api/meta.ts` | Meta API catch-all proxy — routes: proxy, status, upload, insights, campaigns (JWT-protected) |
| `api/admin/credentials.ts` | Admin credential management — validate, save, status, disconnect (super-admin only) |
| `src/lib/authToken.ts` | Supabase session access token helper for API calls |
| `src/components/OnboardingChecklist.tsx` | Client welcome checklist shown on Dashboard for new orgs |
| `src/components/OnboardingChecklist.css` | Onboarding checklist styles |
| `src/types/organization.ts` | Organization & credential TypeScript types (includes `pixel_id`) |

## Routes

### Public Routes (no auth required)
```
/               → Sales landing page (Convertra marketing)
/login          → User authentication
/signup         → Company registration
/forgot-password → Request password reset email
/reset-password  → Set new password (from email link)
```

### Protected Routes (auth required)
```
/dashboard      → Dashboard overview
/channels       → Channel overview
/channels/meta-ads  → Meta Ads dashboard (main view)
/creatives      → AI ad generation
/publish        → Ad publisher
/products       → Products management
/insights       → Channel AI analysis (ConversionIQ™)
/seo-iq         → SEO IQ dashboard (sites, keywords, articles, autopilot)
/billing        → Billing & subscription management
/*              → 404 Not Found (catch-all for unknown routes)
```

## Architecture Decisions

1. **No global state** - Components fetch their own data, cache in localStorage
2. **Service layer abstraction** - All API calls go through `src/services/`
3. **Campaign type detection** - Naming conventions: `[P]`/`Prospecting`, `[R]`/`Retargeting`, `[RT]`/`Retention`
4. **Image caching** - Top 20 performing images cached by conversion rate
5. **Public/Protected route separation** - Sales & login are public; app routes require auth
6. **Supabase Auth** - Uses Supabase for authentication with localStorage fallback when not configured
7. **Frontend/Backend API separation** - Sensitive operations (Stripe, Supabase) handled by backend serverless functions
8. **Vercel serverless functions** - API routes in `api/` directory using `@vercel/node` (`VercelRequest`, `VercelResponse`)
9. **React 19 peer dependency handling** - `.npmrc` with `legacy-peer-deps=true` for libraries that haven't updated React peer deps
10. **Two-layer AI context** - Channel analysis provides performance patterns (account-wide); Product Context provides identity (product name, author, mockups). Both layers are injected into prompts independently — changing one never affects the other
11. **JWT auth on API routes** - All `api/seoiq.ts`, `api/billing/checkout.ts`, and `api/billing/portal.ts` routes require Bearer token authentication. Organization ID is derived from JWT, not client input. Billing endpoints fall back to client-provided IDs only when JWT is unavailable (dev mode)
12. **404 catch-all route** - Unknown routes render a branded 404 page instead of a blank screen, preventing route enumeration
13. **Meta API backend proxy** - All Meta Graph API calls route through `api/meta.ts` — access tokens are decrypted server-side and never sent to the browser. Frontend uses `metaProxy()` helper in `metaApi.ts` which calls `/api/meta/proxy` with JWT auth
14. **Catch-all serverless function consolidation** - Multi-route API handlers use a single serverless function with `route` query param dispatching (e.g., `api/meta.ts`, `api/seoiq.ts`). Vercel rewrites map friendly URLs to query params. This is required to stay within Vercel Hobby plan's **12 serverless function limit**
15. **Per-org encrypted credentials** - Meta access tokens stored encrypted (AES-256-GCM) in `organization_credentials` table via `api/_lib/encryption.ts`. Admin can enter credentials manually or use OAuth flow. Credentials include `access_token_encrypted`, `ad_account_id`, `page_id`, `pixel_id`
16. **Dev mode fallback** - When Supabase is not configured (local dev), `metaApi.ts` falls back to `VITE_META_*` env vars so development works without auth

---

## Stripe Billing Integration

### Architecture
- **Frontend**: `src/services/stripeApi.ts` handles UI-facing billing operations (sends JWT auth headers on all calls)
- **Backend**: `api/billing/*.ts` serverless functions for sensitive Stripe operations (JWT-authenticated)
- **Subscription gating**: `src/components/SubscriptionGate.tsx` blocks access for free/expired users
- **Plan tiers**: `free`, `starter`, `pro`, `enterprise`, `velocity_partner` (each with monthly/yearly pricing)

### Checkout Flow (JWT-Authenticated)
1. Frontend calls `redirectToCheckout()` in `stripeApi.ts` which sends `POST /api/billing/checkout` with JWT `Authorization` header
2. Backend authenticates via JWT → derives `organizationId` from user profile (falls back to client-provided ID only in dev mode)
3. Backend performs **non-fatal** org lookup — if Supabase fails, checkout proceeds without trial coupon or stored customer ID (logged for diagnostics but doesn't block)
4. Backend creates Stripe Checkout Session in `subscription` mode and returns `url`
5. Frontend redirects via `window.location.href = url`

**Important**: Do NOT use `customer_creation: 'always'` — it's invalid in subscription mode (Stripe auto-creates customers). Do NOT use `stripe.redirectToCheckout({ sessionId })` — use the URL redirect pattern instead.

### Customer Portal (JWT-Authenticated)
1. Frontend calls `createPortalSession()` in `stripeApi.ts` which sends `POST /api/billing/portal` with JWT `Authorization` header
2. Backend authenticates via JWT → derives `organizationId` → looks up `stripe_customer_id` from org record
3. Falls back to client-provided `customerId` if org lookup fails
4. Backend creates Stripe Billing Portal session and returns `url`
5. Frontend redirects to Stripe-hosted portal

### Promo Code & Coupon Logic
The checkout endpoint handles three mutually exclusive discount scenarios:
1. **User-entered promo code**: If `usePromoCode: true`, shows Stripe's promo code field (`allow_promotion_codes: true`)
2. **Early-bird coupon**: If org is trialing AND plan is `starter` AND `STRIPE_EARLY_BIRD_COUPON_ID` is set, auto-applies the coupon via `discounts`
3. **Default**: Falls back to `allow_promotion_codes: true`

### Enterprise/Velocity Partner Setup Fee
- Setup fee is added as a **separate one-time line item** in the `line_items` array
- Configured via `STRIPE_PRICE_ENTERPRISE_SETUP` environment variable
- Applied to both `enterprise` and `velocity_partner` plan tiers
- **Do NOT use** `subscription_data.add_invoice_items` — it's not a valid Checkout Session param in subscription mode

### Payment Method Collection
- `payment_method_collection: 'if_required'` is set on all checkout sessions
- This allows fully-discounted subscriptions (e.g., beta tester 100% off promo codes) to skip card collection

### SubscriptionGate Access Control
`SubscriptionGate.tsx` wraps protected routes and enforces subscription status:

| User State | Behavior |
|------------|----------|
| Super admin (`isSuperAdmin`) | Always has full access — bypasses all gates |
| `/billing` or `/account` paths | Always accessible regardless of subscription |
| Free plan (`plan_tier === 'free'`) | Blocked — shown "Start free trial" gate |
| Expired trial / canceled | Blocked — shown "Your free trial has ended" gate |
| Trial user on paid-only route (`/seo-iq`) | Blocked — shown "SEO IQ is a paid feature" gate |
| Active trial or paid subscription | Full access |

### API Route Pattern
```typescript
// api/billing/checkout.ts — JWT-authenticated with non-fatal org lookup
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

// JWT auth — derive organizationId from user profile, fall back to client ID in dev
const auth = await authenticateRequest(req);
const organizationId = auth?.organizationId || req.body.organizationId;
```

### Stripe Pitfalls (Learned from PRs #157-#159)
- **`customer_creation: 'always'`** is invalid in subscription mode — Stripe auto-creates customers
- **`subscription_data.add_invoice_items`** is not a valid Checkout Session parameter — use `line_items` for one-time charges
- **Client-provided organizationId** must not be trusted — always derive from JWT for security
- **Org lookup failures** should not block checkout — make them non-fatal to support dev environments and edge cases

---

## Supabase Integration

For data persistence, use Supabase with inline client creation in serverless functions:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

## API Authentication & Tenant Isolation

All multi-tenant API routes must enforce JWT authentication and tenant isolation. The pattern is used by `api/seoiq.ts`, `api/meta.ts`, `api/billing/checkout.ts`, and `api/billing/portal.ts`. Follow it for any new API routes.

### Authentication Pattern
```typescript
interface AuthContext {
  userId: string;
  organizationId: string;
  authUserId: string;
}

async function authenticateRequest(req: VercelRequest): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id')
    .eq('auth_id', user.id)
    .single();

  if (!profile) return null;
  return { userId: profile.id, organizationId: profile.organization_id, authUserId: user.id };
}
```

### Tenant Isolation Rules
- **Never trust client-provided `organizationId`** — always derive it from the authenticated user's profile
- **Verify resource ownership** before any read/write on tenant-scoped resources (e.g., sites, keywords, articles):
```typescript
async function verifySiteOwnership(siteId: string, organizationId: string): Promise<boolean> {
  const { data } = await supabase
    .from('seo_sites')
    .select('organization_id')
    .eq('id', siteId)
    .single();
  if (!data) return false;
  return data.organization_id === organizationId;
}
```
- Return `403 Forbidden` for ownership failures, `401 Unauthorized` for missing/invalid tokens

### Security Rules for Logging
- **Never log API tokens, keys, or secrets** — not even partially. Wrap any diagnostic logging in `if (import.meta.env.DEV)` for frontend code
- **Never log Bearer tokens** in serverless functions
- **Fallback defaults must be safe** — e.g., `is_super_admin` should default to `false`, never `true`

---

## Client Onboarding & Multi-Tenant Meta Credentials

### Overview

Each organization has its own Meta credentials stored encrypted in `organization_credentials`. The admin sets up credentials (via OAuth or manual entry), and all Meta API calls from the frontend are proxied through the backend — the access token never reaches the browser.

### Architecture

| Layer | Files | Purpose |
|-------|-------|---------|
| **Credential Storage** | `organization_credentials` table | Encrypted access tokens, ad account IDs, page IDs, pixel IDs per org |
| **Admin API** | `api/admin/credentials.ts` | Super-admin CRUD: validate, save, status, disconnect |
| **Meta API Proxy** | `api/meta.ts` | Catch-all proxy — decrypts token server-side, forwards to Meta Graph API |
| **Frontend Service** | `src/services/metaApi.ts` | All ~20 functions refactored to call `/api/meta/proxy` instead of Meta directly |
| **Auth Token Helper** | `src/lib/authToken.ts` | Gets Supabase session JWT for API calls |
| **Admin UI** | `src/pages/admin/OrganizationDetail.tsx` | "Meta Setup" tab with OAuth + manual credential entry |
| **Client Onboarding** | `src/components/OnboardingChecklist.tsx` | Welcome checklist on Dashboard |
| **Sidebar Status** | `src/components/Sidebar.tsx` | Meta connection status dot (green/amber/gray) |

### Credential Flow

```
Admin enters credentials (OAuth or manual)
  → POST /api/admin/credentials/validate (tests token + ad account against Meta API)
  → POST /api/admin/credentials/save (encrypts token, stores in organization_credentials)
  → Status: active

Client uses app
  → Frontend calls metaProxy() in metaApi.ts
  → POST /api/meta/proxy with JWT auth header
  → Backend: JWT → user → organization_id → load encrypted credentials → decrypt → forward to Meta
  → Response returned to frontend (token never exposed)
```

### Admin Credential Management (`api/admin/credentials.ts`)

All routes require `is_super_admin === true`.

| Action | Method | Purpose |
|--------|--------|---------|
| `status` | GET | Return credential status for an org (never returns token) |
| `validate` | POST | Test Meta token + ad account via `debug_token` and ad account endpoint |
| `save` | POST | Encrypt token via `encrypt()`, upsert into `organization_credentials` |
| `disconnect` | DELETE | Remove credentials for an org |

### Meta API Proxy (`api/meta.ts`)

Catch-all handler with route-based dispatching. Frontend URLs like `/api/meta/proxy` are rewritten to `/api/meta?route=proxy` by `vercel.json`.

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `proxy` | POST | JWT → org | General-purpose Meta Graph API proxy |
| `status` | GET | JWT → org | Non-sensitive credential status (connected, IDs, expiry) |
| `upload` | POST | JWT → org | Image upload proxy for `adimages` endpoint |
| `insights` | GET/POST | orgId param | Legacy insights proxy (backwards compat) |
| `campaigns` | GET | orgId param | Legacy campaigns proxy (backwards compat) |

### Frontend Proxy Helper (`metaApi.ts`)

```typescript
// All Meta API calls go through this helper
async function metaProxy(endpoint: string, options?: {
  method?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  formEncoded?: boolean;
}): Promise<any> {
  const token = await getAuthToken();
  const res = await fetch('/api/meta/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      method: options?.method || 'GET',
      endpoint,
      params: options?.params,
      body: options?.body,
      formEncoded: options?.formEncoded,
    }),
  });
  if (!res.ok) throw new Error(err.message || `Meta API error (${res.status})`);
  return res.json();
}
```

**Dev mode fallback**: When no auth token is available (Supabase not configured), `metaApi.ts` falls back to direct `VITE_META_*` env var calls so local development works without auth.

### Org Credential State

Module-level cache in `metaApi.ts` stores the org's IDs (loaded once from `/api/meta/status`):

```typescript
let _orgMeta: { connected: boolean; adAccountId: string; pageId: string; pixelId: string } | null = null;

export async function loadOrgMetaCredentials(): Promise<void> { /* calls /api/meta/status */ }
export function getOrgMetaIds() { return _orgMeta; }
export function getAdAccountId(): string { return _orgMeta?.adAccountId || VITE fallback; }
export function getPageId(): string { return _orgMeta?.pageId || VITE fallback; }
export function getPixelId(): string { return _orgMeta?.pixelId || VITE fallback; }
```

`loadOrgMetaCredentials()` is called from `OrganizationContext.tsx` on app init.

### Admin Meta Setup Tab

In `OrganizationDetail.tsx`, the "Meta Setup" tab provides:

1. **Connection Status Card** — Green/amber/gray indicator with account name, token expiry
2. **OAuth Connect** — Existing "Connect via Facebook" button
3. **Manual Credential Entry** — Form for System User token, ad account ID, page ID, pixel ID
4. **Validate & Save** — Tests token against Meta API before storing
5. **Collapsible Setup Guide** — Step-by-step instructions for getting Meta credentials

### Client Onboarding Checklist

`OnboardingChecklist.tsx` renders a dismissible welcome card on Dashboard when:
- `organization.setup_completed === false`
- Not previously dismissed (tracked in localStorage: `ci_onboarding_dismissed_{orgId}`)

Steps shown:
- Account created (always checked)
- Meta Ads connected (checked if credentials active)
- Explore your dashboard (link to /dashboard)
- Analyze your creatives (link to /channels/meta-ads)
- Generate new ads with CreativeIQ (link to /creatives)

### Sidebar Connection Status

`Sidebar.tsx` includes a `MetaConnectionDot` component next to the "Meta Ads" nav item:
- Green dot — Meta credentials active
- Amber dot — Token expired
- Gray dot — Not connected

Uses `getOrgMetaIds()` from `metaApi.ts` for cached status.

### Admin Setup Checklist (Overview Tab)

The Overview tab in `OrganizationDetail.tsx` shows a granular setup checklist:
- Organization created (always checked)
- Owner account active (checks user status)
- Meta Ads connected (links to Meta Setup tab)
- Ad Account ID configured (links to Meta Setup tab)
- Page ID configured (links to Meta Setup tab)
- Pixel ID configured (optional, links to Meta Setup tab)

### Database: `organization_credentials` Table

| Column | Type | Purpose |
|--------|------|---------|
| `organization_id` | UUID | Foreign key to organizations |
| `provider` | TEXT | Always `'meta'` for Meta credentials |
| `access_token_encrypted` | TEXT | AES-256-GCM encrypted access token |
| `ad_account_id` | TEXT | Format: `act_XXXXXXXXX` |
| `page_id` | TEXT | Facebook Page ID |
| `pixel_id` | TEXT | Meta Pixel ID |
| `status` | TEXT | `active`, `expired`, `invalid`, `not_connected` |
| `token_expires_at` | TIMESTAMPTZ | Token expiration date |
| `metadata` | JSONB | Additional data (e.g., `selected_account_name`) |
| `last_error` | TEXT | Last error message from Meta API |

---

## SEO IQ — Keyword Research & Content Automation

### Overview

SEO IQ is an automated SEO/GEO content pipeline that discovers keyword opportunities, generates optimized articles, and publishes them to a target Supabase instance. It combines two keyword data sources and three scoring algorithms to identify the highest-value content opportunities.

### Architecture

| Layer | Files | Purpose |
|-------|-------|---------|
| **Frontend** | `src/pages/SeoIQ.tsx`, `src/pages/SeoIQ.css` | 5-tab dashboard (Sites, Keywords, Generate, Articles, Autopilot) |
| **Frontend Service** | `src/services/seoIqApi.ts` | API calls with Supabase auth header injection |
| **Frontend Types** | `src/types/seoiq.ts` | TypeScript interfaces for all SEO IQ entities |
| **Backend API** | `api/seoiq.ts` | Catch-all route handler for all SEO IQ endpoints |
| **Google Ads Client** | `api/_lib/google-ads.ts` | Keyword Planner API — token refresh + `fetchKeywordIdeas()` |
| **Google Auth** | `api/_lib/google-auth.ts` | Per-site Google OAuth token management for GSC |
| **SEO Prompts** | `api/_lib/seo-prompts.ts` | Article generation prompts + keyword scoring functions |
| **Vercel Routing** | `vercel.json` | `/api/seo-iq/:path*` → rewritten to `/api/seoiq?route=:path` |

### Dual Keyword Sources

SEO IQ uses two complementary keyword data sources:

| Source | API | Data Provided | Use Case |
|--------|-----|--------------|----------|
| **Google Search Console (GSC)** | `googleapis.com/webmasters/v3/.../searchAnalytics/query` | clicks, impressions, CTR, position | Keywords you already rank for — find quick wins |
| **Google Ads Keyword Planner** | `googleads.googleapis.com/v18/customers/{id}:generateKeywordIdeas` | search volume, competition, competition index | Keywords you don't rank for — find content gaps |

- GSC requires per-site Google OAuth connection (stored encrypted in `seo_sites` table)
- Keyword Planner uses a shared Google Ads account (env vars, not per-site)
- Keywords tab works with either source independently — GSC connection is not required

### Three Scoring Algorithms

All scoring functions are in `api/_lib/seo-prompts.ts`:

| Function | Opportunity Type | When Used | What It Finds |
|----------|-----------------|-----------|---------------|
| `scoreQuickWin()` | `quick_win` | GSC position 5-20 | Keywords already ranking that could reach page 1 |
| `scoreCTROptimization()` | `ctr_optimization` | High impressions, low CTR | Keywords with visibility but poor click-through |
| `scoreContentGap()` | `content_gap` | High volume, not ranking | Keywords from Keyword Planner with no existing rankings |

When both data sources are available for a keyword, the system computes all applicable scores and keeps the highest.

### Data Merge Rules

Keywords are upserted with `onConflict: 'site_id,keyword'`, merging data from both sources:

| Scenario | search_volume | competition | GSC fields | Score |
|----------|--------------|-------------|------------|-------|
| Keyword Planner only (no GSC) | From KP | From KP | null/0 | `scoreContentGap()` |
| GSC only (no Keyword Planner) | 0 | UNKNOWN | From GSC | `scoreQuickWin()` or `scoreCTR()` |
| Both sources, GSC pos ≤ 10 | From KP | From KP | From GSC | Keep existing GSC score |
| Both sources, GSC pos > 10 | From KP | From KP | From GSC | Max of all three scores |

### API Routes

All routes go through `api/seoiq.ts` (catch-all handler). Key routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `sites` | GET/POST/PUT/DELETE | CRUD for SEO sites |
| `keywords` | GET | Fetch keywords for a site |
| `refresh-keywords` | POST | Pull latest GSC data + score (also runs 3-way scoring if KP data exists) |
| `research-keywords` | POST | Fetch Keyword Planner ideas for seed keywords, score with `scoreContentGap()` |
| `generate-article` | POST | Generate article for a keyword using AI |
| `articles` | GET/PUT/DELETE | CRUD for articles |
| `publish-article` | POST | Publish article to target Supabase + submit for Google indexing |
| `autopilot-config` | PUT | Enable/disable autopilot, set cadence |
| `autopilot-schedule` | GET/POST/DELETE | Content calendar scheduled runs |
| `autopilot-cron` | POST | Cron trigger — picks keyword, generates article, publishes |

### Google Ads Keyword Planner Integration

`api/_lib/google-ads.ts` handles the Keyword Planner API:

- **Token refresh**: Uses `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + `GOOGLE_ADS_REFRESH_TOKEN` to get access tokens (same OAuth pattern as GSC, separate refresh token)
- **Token caching**: Caches access tokens in memory with 60s expiry buffer
- **Keyword seeds**: Accepts up to 10 seed keywords, or a single URL seed for domain-based research
- **Request targets**: English language (`languageConstants/1000`), United States (`geoTargetConstants/2840`)
- **Zero-volume filtering**: Keywords with `avgMonthlySearches === 0` are automatically excluded

### Autopilot Pipeline Flow

The content calendar autopilot runs on a cron schedule and executes this pipeline:

```
1. Cron triggers → handleAutopilotCron()
2. Pick highest-scored keyword (any source — GSC or Keyword Planner)
   → ORDER BY opportunity_score DESC, status = 'active'
3. Generate article via AI (search volume + competition injected into prompt)
4. Publish to target Supabase instance
5. Submit URL to Google Indexing API
6. Mark keyword as 'used'
```

- Autopilot does **not** require GSC to be connected — it works with Keyword Planner keywords alone
- The keyword picker selects the best opportunity regardless of source
- Article generation prompt (`buildArticleUserPrompt()`) includes `searchVolume`, `competition`, and `opportunityType` for context-aware content

### Frontend Keyword Research UI

The Keywords tab includes a research toolbar:

- **Seed keyword input**: Comma-separated keywords (e.g., "ad creative, conversion rate optimization")
- **"Research" button**: Splits input, calls `researchKeywords()` API
- **"Use Site URL" button**: Uses the site's domain as a URL seed for Keyword Planner
- **Volume column**: Shows `search_volume` from Keyword Planner (dash if unavailable)
- **Competition column**: Colored tags — green (LOW), amber (MEDIUM), red (HIGH)
- **GSC not required**: Keywords tab works without GSC; "Refresh Keywords" button shows inline "Connect Google" prompt when GSC isn't connected

---

## Design System

### Theme: Enterprise Light

Clean, professional light theme with lime green primary accent and violet secondary for subtle depth and sophistication.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#ffffff` | Main background |
| `--bg-secondary` | `#f8fafc` | Section backgrounds, alternating rows |
| `--bg-card` | `#ffffff` | Card backgrounds |
| `--bg-card-hover` | `#f1f5f9` | Card hover state |

### Primary Accent (Lime)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-primary` | `#d4e157` | Primary buttons, highlights, CTAs |
| `--accent-secondary` | `#c0ca33` | Hover states, secondary emphasis |
| `--accent-glow` | `rgba(212, 225, 87, 0.3)` | Glow effects, shadows |

### Secondary Accent (Violet)

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-violet` | `#a855f7` | Subtle accents, gradient endpoints |
| `--accent-violet-bright` | `#c4b5fd` | Light violet for subtle details |
| `--accent-violet-glow` | `rgba(168, 85, 247, 0.15)` | Violet glow effects |

### Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#1e293b` | Headings, primary text |
| `--text-secondary` | `#475569` | Body text, descriptions |
| `--text-muted` | `#94a3b8` | Captions, helper text |

### Border Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--border-primary` | `#e2e8f0` | Default borders |
| `--border-violet` | `rgba(168, 85, 247, 0.2)` | Violet-tinted borders |
| `--border-secondary` | `#f1f5f9` | Subtle borders |

### Gradients

| Token | Value | Usage |
|-------|-------|-------|
| `--gradient-cyan` | `linear-gradient(135deg, #d4e157 0%, #c0ca33 100%)` | Lime gradient |
| `--gradient-violet` | `linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)` | Violet gradient |
| `--gradient-holographic` | `linear-gradient(135deg, #d4e157 0%, #a855f7 50%, #c4b5fd 100%)` | Lime-to-violet holographic |
| `--gradient-dual-glow` | `linear-gradient(135deg, #d4e157 0%, #a855f7 100%)` | Dual color glow |

### Shadows (Violet-tinted)

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(168, 85, 247, 0.05)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px rgba(168, 85, 247, 0.08)` | Cards, buttons |
| `--shadow-lg` | `0 10px 25px rgba(168, 85, 247, 0.12)` | Modals, dropdowns |
| `--shadow-glow` | `0 0 20px rgba(168, 85, 247, 0.1)` | Glow effect |

### Typography

| Property | Value |
|----------|-------|
| Font Family | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` |
| Line Height | `1.5` (body), `1.3` (headings) |
| Font Weight | `400` (body), `600` (headings), `700` (bold) |

### Spacing & Radius

| Element | Value |
|---------|-------|
| Border Radius (small) | `8px` |
| Border Radius (medium) | `12px` |
| Border Radius (large) | `16px` |
| Border Radius (pill) | `100px` |
| Section Padding | `100px 32px` (desktop), `60px 16px` (mobile) |
| Card Padding | `32px` |

---

## CSS Utility Classes

### Glass & Glow Effects

```css
/* Card with light background and subtle border */
.glass {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-sm);
}

/* Medium glow */
.glow {
  box-shadow: var(--shadow-md);
}

/* Violet glow */
.glow-violet {
  box-shadow: var(--shadow-glow);
}

/* Dual lime-violet glow */
.glow-dual {
  box-shadow: var(--shadow-lg), 0 0 30px var(--accent-violet-glow);
}

/* Lime text color */
.glow-text {
  color: var(--accent-primary);
}

/* Violet text color */
.glow-text-violet {
  color: var(--accent-violet);
}

/* Gradient text (lime to violet) */
.glow-text-dual {
  background: var(--gradient-dual-glow);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## Component Patterns

### Sales Landing Page Components

The sales landing (`/`) uses these specific patterns:

#### Pill Navigation
```css
.sales-nav {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 1100px;
  width: calc(100% - 48px);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-primary);
  border-radius: 100px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}
```

#### CTA Buttons
```css
.cta-primary {
  padding: 16px 40px;
  background: var(--lime-primary);
  color: #1e293b;
  font-size: 18px;
  font-weight: 600;
  border-radius: 12px;
}

.cta-primary:hover {
  transform: translateY(-3px);
  background: var(--lime-secondary);
  box-shadow: 0 8px 25px var(--lime-glow);
}
```

#### Animated Border Cards
```css
/* Rotating gradient border on hover */
.card-gradient-border {
  background: linear-gradient(135deg, var(--lime-primary), transparent, var(--lime-primary));
  background-size: 200% 200%;
  animation: rotateBorderGradient 8s linear infinite;
}

@keyframes rotateBorderGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

#### Scroll Animations
```css
.animate-on-scroll {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.animate-on-scroll.animate-in {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered delays */
.delay-1 { transition-delay: 0.1s; }
.delay-2 { transition-delay: 0.2s; }
.delay-3 { transition-delay: 0.3s; }
```

### Data Fetching Pattern
```tsx
const [data, setData] = useState<DataType[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const fetchData = async () => {
    try {
      const result = await someApiCall();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch:', error);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, []);
```

### User-Configurable State with localStorage
```tsx
// For values users can configure (like Ad Spend), persist to localStorage
const [adSpend, setAdSpend] = useState<number>(() => {
  const saved = localStorage.getItem('dashboard_ad_spend');
  return saved ? parseFloat(saved) : 1000;
});

const handleAdSpendChange = (value: number) => {
  setAdSpend(value);
  localStorage.setItem('dashboard_ad_spend', value.toString());
};
```

### Centralized Configuration for UI Elements
```tsx
// Define default configurations for reusable UI elements
const DEFAULT_METRICS = ['revenue', 'conversions', 'cpa', 'roas'];
const METRIC_ICONS: Record<string, JSX.Element> = { /* ... */ };
const METRIC_LABELS: Record<string, string> = { /* ... */ };
const METRIC_PERIODS: Record<string, string> = { /* ... */ };
```

### URLSearchParams for API Requests
```tsx
// Clean way to construct API URLs with query parameters
const params = new URLSearchParams({
  date_preset: 'last_30d',
  fields: 'spend,impressions,clicks,conversions',
  access_token: token,
});
const url = `${baseUrl}?${params.toString()}`;
```

### AI Analysis Pattern
```tsx
// Always include ad ID, metrics, and creative context
const analysis = await analyzeAdCreative(adId, {
  imageUrl,
  metrics: { conversionRate, ctr, roas },
  copy: { headline, body, cta }
});
```

### localStorage Storage Management

Browser localStorage is limited to ~5MB per origin. Two caches compete for this space:

| Cache | Key | Contents | Limit |
|-------|-----|----------|-------|
| Generated ads | `conversion_intelligence_generated_ads` | Ad packages with base64 images | Max 10 packages, images on latest 5 |
| Image reference cache | `conversion_intelligence_image_cache` | Base64 reference images from Meta ads | Max 20 images |

**Storage safety patterns:**
- **Flush before navigate**: When navigating from AdGenerator to AdPublisher, synchronously write to localStorage before `navigate()` — `requestIdleCallback` writes get cancelled on component unmount
- **Auto-clear on publish**: After successful Meta publish, clear generated ads from localStorage
- **Retry on QuotaExceededError**: Clear image reference cache first, then retry the save — generated ads take priority over reference images
- **Warning auto-clear**: Storage warnings should clear themselves when data drops below the 3MB threshold — never leave sticky warnings

**Critical pitfall**: Never use `requestIdleCallback` for writes that must complete before navigation. The cleanup function will cancel the pending callback when the component unmounts, causing data loss.

### Debounced Search Input
```tsx
// Use useRef for debounce timer to avoid excessive API calls
const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

const handleSearchChange = (query: string) => {
  setSearchQuery(query);
  if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  searchTimerRef.current = setTimeout(() => {
    fetchSearchResults(query);
  }, 300);
};
```

---

## Responsive Breakpoints

**Approach**: Desktop-down (media queries use `max-width`)

| Breakpoint | Target |
|------------|--------|
| `900px` | Tablet - hide desktop nav, show mobile menu |
| `600px` | Mobile - compact spacing, smaller typography |

### Mobile Adjustments
- Navigation: `border-radius: 50px`, reduced padding
- Hero headline: `32px` (from `56px`)
- Section padding: `60px 16px` (from `100px 32px`)
- Logo: `height: 26px` (from `32px`)

### MainLayout Routing
- `<Outlet />` in `MainLayout.tsx` must **not** have a `key={location.pathname}` prop — this would cause full component remounts on every navigation, destroying local state and triggering unnecessary API refetches

### CSS Techniques for Responsiveness
- **`calc()` for dynamic sizing**: Use for viewport-relative dimensions (e.g., `calc(100vh - 24px)`, `calc(100% - 24px)`)
- **`transition` for smoothness**: Apply to UI state changes (sidebar collapse, hover effects, mobile menu animations)
- **`isolation: isolate`**: Use on `.main-content` to prevent style bleed in complex layouts
- **CSS-only when possible**: Prefer CSS for layout and responsiveness over JavaScript state changes

---

## Environment Variables

### Frontend (VITE_ prefix required)
```bash
VITE_META_ACCESS_TOKEN=     # Facebook API token
VITE_META_AD_ACCOUNT_ID=    # Format: act_XXXXXXXXX
VITE_META_PAGE_ID=          # Facebook Page ID (required for publishing ads)
VITE_META_PIXEL_ID=         # Meta Pixel ID (required for conversion tracking with OUTCOME_SALES)
VITE_OPENAI_API_KEY=        # GPT-4o access
VITE_GEMINI_API_KEY=        # Image generation (optional)
VITE_STRIPE_PUBLISHABLE_KEY= # Stripe publishable key (pk_live_* or pk_test_*)
VITE_SUPABASE_URL=          # Supabase project URL (MUST include https://)
VITE_SUPABASE_ANON_KEY=     # Supabase anonymous key for frontend auth
VITE_APP_URL=               # App URL for redirects (https://www.convertraiq.com)
```

**Important**: URL environment variables (VITE_SUPABASE_URL, VITE_APP_URL) must include the full protocol (`https://`). Missing the protocol will cause the app to crash at runtime.

### Backend (Vercel serverless functions)
```bash
STRIPE_SECRET_KEY=          # Stripe secret key (sk_live_* or sk_test_*)
STRIPE_WEBHOOK_SECRET=      # Stripe webhook signing secret (whsec_*)
STRIPE_PRICE_STARTER_MONTHLY=   # Stripe Price ID for Starter monthly
STRIPE_PRICE_STARTER_YEARLY=    # Stripe Price ID for Starter yearly
STRIPE_PRICE_PRO_MONTHLY=       # Stripe Price ID for Pro monthly
STRIPE_PRICE_PRO_YEARLY=        # Stripe Price ID for Pro yearly
STRIPE_PRICE_ENTERPRISE_MONTHLY= # Stripe Price ID for Enterprise monthly
STRIPE_PRICE_ENTERPRISE_YEARLY=  # Stripe Price ID for Enterprise yearly
STRIPE_PRICE_VELOCITY_PARTNER_MONTHLY= # Stripe Price ID for Velocity Partner monthly
STRIPE_PRICE_VELOCITY_PARTNER_YEARLY=  # Stripe Price ID for Velocity Partner yearly
STRIPE_PRICE_ENTERPRISE_SETUP=  # Stripe Price ID for one-time enterprise/velocity setup fee
STRIPE_EARLY_BIRD_COUPON_ID=    # Stripe Coupon ID for early-bird trial-to-starter discount
SUPABASE_URL=               # Supabase project URL (MUST be set separately from VITE_SUPABASE_URL)
SUPABASE_SERVICE_ROLE_KEY=  # Supabase service role key (for server-side access)
GOOGLE_CLIENT_ID=           # Google OAuth client ID (shared across GSC + Google Ads)
GOOGLE_CLIENT_SECRET=       # Google OAuth client secret (shared across GSC + Google Ads)
GOOGLE_ADS_DEVELOPER_TOKEN= # From Google Ads → Tools → API Center
GOOGLE_ADS_CUSTOMER_ID=     # Google Ads account ID (no dashes, e.g. 1234567890)
GOOGLE_ADS_REFRESH_TOKEN=   # OAuth refresh token with adwords scope
ENCRYPTION_KEY=             # 32-byte hex key for encrypting Google OAuth tokens at rest
```

**Important**: `SUPABASE_URL` (backend) and `VITE_SUPABASE_URL` (frontend) must both be set in Vercel. The `VITE_` prefix makes variables available to the browser bundle only. Serverless functions in `api/` use `process.env.SUPABASE_URL` (no prefix). Missing `SUPABASE_URL` will cause funnel metrics and other backend Supabase queries to silently return empty data.

### Funnel Event Tracking

Funnel data (`funnel_events` table) is written by an **external system** (the funnel site repo), not by this codebase. This repo only reads from the table. The external system uses separate env vars (`CONVERTRA_SUPABASE_URL`, `CONVERTRA_SUPABASE_SERVICE_ROLE_KEY`) to write events to Convertra's Supabase via a fire-and-forget insert.

## Deployment (Vercel)

This is a Single Page Application (SPA) deployed on Vercel.

### Serverless Function Limit

**Critical**: Vercel Hobby plan allows a maximum of **12 serverless functions** per deployment. The project currently uses exactly 12. Before adding new `api/*.ts` files, consolidate into existing catch-all handlers or the deployment will fail.

Current serverless functions (12/12):
1. `api/admin/credentials.ts` — Admin credential management
2. `api/auth/meta/callback.ts` — Meta OAuth callback
3. `api/auth/meta/connect.ts` — Meta OAuth initiation
4. `api/billing/checkout.ts` — Stripe checkout (JWT-authenticated, non-fatal org lookup)
5. `api/billing/portal.ts` — Stripe customer portal (JWT-authenticated)
6. `api/billing/subscription.ts` — Subscription status lookup
7. `api/billing/webhook.ts` — Stripe webhook handler
8. `api/funnel/active-sessions.ts` — Active funnel sessions
9. `api/funnel/metrics.ts` — Funnel metrics
10. `api/google-auth.ts` — Google OAuth tokens
11. `api/meta.ts` — Meta API catch-all (proxy, status, upload, insights, campaigns)
12. `api/seoiq.ts` — SEO IQ catch-all (sites, keywords, articles, autopilot)

Files in `api/_lib/` are shared helpers, NOT serverless functions.

### Vercel Rewrites

The `vercel.json` maps friendly API URLs to catch-all handlers via query params:

```json
{
  "rewrites": [
    { "source": "/api/seo-iq/:path(.*)", "destination": "/api/seoiq?route=:path" },
    { "source": "/api/auth/google/:action", "destination": "/api/google-auth?action=:action" },
    { "source": "/api/admin/credentials/:action", "destination": "/api/admin/credentials?action=:action" },
    { "source": "/api/meta/:path(.*)", "destination": "/api/meta?route=:path" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The catch-all `/(.*) → /index.html` must be **last** — it enables `react-router-dom` to handle client-side routing for deep links and page refreshes.

## Development Commands

```bash
npm run dev    # Start dev server (port 5175)
npm run build  # TypeScript check + Vite build
npm run lint   # ESLint with TypeScript rules
npx remotion studio  # Open Remotion Studio for VSL preview/editing
```

### Starting the Dev Server
Always run `npm run dev` to start the development server before testing URLs. The server must be running for pages to be accessible.

---

## Common Tasks

### Adding a New Page
1. Create `src/pages/NewPage.tsx` and `NewPage.css`
2. Add route in `src/App.tsx`
3. Add nav item in `src/components/Sidebar.tsx` (for app pages)

### Adding a Public Page (like Sales Landing or Login)
1. Create `src/pages/NewPage.tsx` and `NewPage.css`
2. Add route in the public section of `src/App.tsx`:
```tsx
<Routes>
  {/* Public Routes - no auth required */}
  <Route path="/" element={<SalesLanding />} />
  <Route path="/login" element={<Login />} />
  <Route path="/new-page" element={<NewPage />} />  {/* Add here */}

  {/* Protected App Routes - auth required */}
  <Route path="/*" element={
    <ProtectedRoute>
      <MainLayout>...</MainLayout>
    </ProtectedRoute>
  } />
</Routes>
```

### Adding API Integration
1. Create service in `src/services/newApi.ts`
2. Define types in `src/types/index.ts`
3. Use in page/component with try/catch + loading state

### Working with Meta API
- All requests go through `metaApi.ts` → `metaProxy()` → `/api/meta/proxy` (backend). Access tokens never reach the browser.
- Graph API version: v24.0
- Creative fetching includes thumbnail URL extraction
- Campaign metrics include ROAS, CPA, CVR, CTR
- **Ad creation safety**: Always create ads with `status: 'PAUSED'` to prevent accidental live publication
- **Pre-publish validation**: Run `validatePageAccess` before publishing to catch permission/config issues early
- **Required scopes for publishing**: `ads_management`, `pages_read_engagement`, `pages_manage_ads`
- **Page ID required**: `VITE_META_PAGE_ID` must be set for ad creatives using `object_story_spec`
- **Field deprecations**: Meta deprecates fields without warning. Example: `approximate_count` was replaced by `approximate_count_lower_bound` and `approximate_count_upper_bound` on custom audiences. Always verify current field names against Meta's API docs.
- **Silent failures**: Meta API often returns `[]` on error instead of throwing, making it hard to distinguish "no results" from "failed call". Always check for error objects in responses and surface them explicitly.
- **Permission nuances**: `pages_read_engagement` and `ads_management` are distinct permissions. A token may have sufficient permissions to *create ads* (`ads_management`) even if it lacks permissions to *read page metadata* (`pages_read_engagement`). Don't block publishing solely because a page metadata check fails.
- **`promote_pages` fallback**: When direct page access validation fails (error codes `10` or `100`), use the `promote_pages` endpoint as a fallback to verify ad account/page linkage via `ads_management` permission.
- **Progressive validation**: Implement validation in stages. If a direct check fails with a permission-specific error (not an outright access denial), attempt a secondary validation using alternative permissions or endpoints before failing entirely. Log warnings (`console.warn`) for non-critical check failures instead of blocking the operation.

### Meta API Token Management
- **Short-lived tokens** (Graph API Explorer): Expire in 1-2 hours. Only for quick testing.
- **Long-lived tokens**: Exchange short-lived tokens for ~60-day tokens via the token exchange endpoint.
- **System User tokens**: Best for production. Can have `expires_at: 0` (never expire) but still require specific granular scopes.
- **Token caching pitfall**: A valid-looking UI may persist with an expired token due to cached data. Meta will reject new write requests even if cached read data still displays.

### Meta API Ad Publishing — Critical Parameters

These parameters were discovered through extensive trial-and-error (PRs #87-95). Missing any one of them causes opaque Meta API errors.

#### Campaign Level (`createCampaign`)
- `bid_strategy: 'LOWEST_COST_WITHOUT_CAP'` — **required**, otherwise Meta defaults to a strategy that demands `bid_amount` (error: "Bid amount required for bid strategy provided"). This maps to "Highest Volume" in the Meta UI.
- `special_ad_categories: []` — **required** even when empty
- `status: 'PAUSED'` — always create in draft/paused mode
- Budget in cents (multiply by 100)
- For `OUTCOME_SALES` objective, include `promoted_object` with `pixel_id` and `custom_event_type` for conversion tracking
- `optimization_goal` choices: `OFFSITE_CONVERSIONS` (preferred for sales with pixel), `LANDING_PAGE_VIEWS`, or `LINK_CLICKS` (fallback if no pixel)
- Default campaign objective: **Sales** (`OUTCOME_SALES`)

#### Ad Set Level (`createAdSet`)
- `destination_type: 'WEBSITE'` — **required** in v24.0 for `OUTCOME_SALES` and `OUTCOME_TRAFFIC`. Missing this causes a generic "Invalid parameter" error (code 100).
- `billing_event: 'IMPRESSIONS'` — standard setting
- Must use **form-encoded body** (`URLSearchParams`), NOT JSON — nested objects like `targeting` and `promoted_object` must be `JSON.stringify()`'d as string values
- **Campaign propagation delay**: Meta is eventually consistent. After creating a campaign, wait 3 seconds + do a verification read before creating the ad set, or the campaign ID may not be found.

#### Ad Level (`createAdWithCreative`)
- Use **inline creative spec** — pass the full `object_story_spec` in the `creative` param of the ad creation call. Do NOT create a creative separately then reference by ID, as this causes "Ad incomplete" errors (subcode 2446391).
- `tracking_specs` **required** for `OUTCOME_SALES` with pixel: `[{"action.type": ["offsite_conversion"], "fb_pixel": ["<pixel_id>"]}]`. Note: `offsite_conversion` is the correct API value for what the Meta UI calls "Website Events".
- `link_data` must include the `description` field (in addition to `name`/headline)

#### Ad Creative Structure (Inline Pattern)
```
ads endpoint → creative: {
  name,
  object_story_spec: {
    page_id,
    link_data: { image_hash, link, message, name, description, call_to_action }
  }
}
```

### Request Encoding Rules

Different Meta API endpoints require different content types. Using the wrong encoding causes silent failures or cryptic errors.

| Endpoint | Content Type | Notes |
|----------|-------------|-------|
| Campaigns | JSON body (`Content-Type: application/json`) | Standard JSON object |
| Ad Sets | Form-encoded (`URLSearchParams`) | Nested objects (`targeting`, `promoted_object`) must be `JSON.stringify()`'d |
| Ads | Form-encoded (`URLSearchParams`) | `creative` spec must be `JSON.stringify()`'d |
| Image uploads | `FormData` | Binary upload with `filename` field |

### Meta Business Manager Setup Requirements

These prerequisites must be completed in Meta Business Manager before ads can be created via the API. Missing any one causes errors that are not obvious from the error messages.

1. **System User must be Admin role** (not Employee). Employee-role System Users cannot accept required policies. You cannot change an existing System User's role — you must create a new one if the current user is Employee.
2. **Non-discrimination policy must be accepted** by the System User (error: "Certification required", subcode 2859024). Navigate to Business Settings → System Users → select the user → accept the policy. Only Admin-role users can do this.
3. **Page access must be assigned** to the System User: Business Settings → System Users → Add Assets → Pages. Without this, you get "You don't have the required permission to access this profile".
4. **Ad Account access must be assigned** to the System User.
5. **Pixel/Dataset access must be assigned** to the System User (for conversion tracking).
6. **Required API scopes**: `ads_management`, `pages_read_engagement`, `pages_manage_ads`, `business_management`

### Targeting (`flexible_spec`)

- Items from Meta's targeting search API should be bucketed as `interests` (not `demographics`) unless the item's `type` is explicitly `behavior`. Most targeting suggestions (personal development, well-being, mindfulness, etc.) are interests.
- Fetch targeting suggestions from Meta API in real-time (not manual ID entry)
- Fetch custom audiences from the ad account via API instead of requiring manual IDs

### Pre-Publish Diagnostics

The `publishAds()` function runs automatic diagnostics before ad set creation:

- **Token introspection** via `debug_token` endpoint: validates scopes, checks `granular_scopes` with `target_ids`, confirms expiration
- **Account health check**: verifies `account_status` (1=ACTIVE), `disable_reason` (0=none), currency, and capabilities
- Diagnostic output is appended to error messages when publishing fails, making it easier to identify token/permission issues

### Pixel Management

- Pixels are fetched via `fetchAdPixels()` from the `adspixels` endpoint (fallback: `datasets` endpoint)
- Never manually enter pixel IDs — always fetch from the API to ensure they're associated with the ad account
- Pixel ID is required for `OUTCOME_SALES` campaigns (used in both `promoted_object` and `tracking_specs`)

### Budget Modes (CBO vs ABO)
- **CBO (default)**: Budget set at campaign level via `createCampaign`
- **ABO**: Budget set at ad set level via `createAdSet`; requires `is_adset_budget_sharing_enabled: false`

### Image Upload Flow
1. Convert image URL to base64
2. Upload via `adimages` endpoint using `FormData`
3. Receive `image_hash` from response
4. Use `image_hash` in `object_story_spec` → `link_data` for creative creation

### Ad Publisher Configuration

The Ad Publisher (Step 3: Configure) provides these ad-level settings that are applied uniformly across all ads in a publish batch:

#### CTA Button Type
- Configurable via dropdown in Step 3 — overrides the AI-generated CTA text
- 16 options matching Meta's available CTA types: `SHOP_NOW`, `LEARN_MORE`, `SIGN_UP`, `SUBSCRIBE`, `GET_OFFER`, `BOOK_NOW`, `CONTACT_US`, `DOWNLOAD`, `APPLY_NOW`, `BUY_NOW`, `ORDER_NOW`, `LISTEN_NOW`, `GET_SHOWTIMES`, `REQUEST_TIME`, `SEE_MENU`, `PLAY_GAME`
- Default: `SHOP_NOW`
- Saved/restored with publish presets

#### URL Tracking Parameters
- Text input for UTM or custom tracking params (e.g., `utm_source=meta&utm_medium=paid&utm_campaign=ci`)
- Passed via Meta's native `url_tags` field on the ad creative — Meta appends them invisibly at click time
- **Never bake UTM params into `link_data.link`** — this breaks click tracking and creates ugly URLs in Ads Manager
- Saved/restored with publish presets

#### Body Copy URL Injection
- The **clean** landing page URL (without tracking parameters) is automatically appended to the bottom of the body copy (`message` field) when publishing
- Format: `{bodyText}\n\n{landingPageUrl}` — no UTM params in visible ad copy
- UTM tracking is handled separately via `url_tags` on the creative

#### Post-Publish Auto-Cleanup
- After a successful publish to Meta (`publishResult.success`), generated ads are automatically cleared from localStorage
- This prevents the "Storage full" warning from accumulating across sessions
- Ads are **only** cleared after confirmed success — if publish fails, ads are preserved for retry
- The image reference cache (`conversion_intelligence_image_cache`) is also cleared on `QuotaExceededError` and when "Clear All Ads" is clicked

#### Post-Publish "Open Ads Manager" Link
- After successful publish, the "Open Ads Manager" button links to the correct ad account using `VITE_META_AD_ACCOUNT_ID` (strips `act_` prefix)
- Deep-links to the campaign: `https://business.facebook.com/adsmanager/manage/campaigns?act={numericAccountId}&campaign_id={campaignId}`

---

## UI Design Guidelines

### User Preferences
- **Subtle styling** - Use "very light" glows and effects; avoid aggressive visual enhancements
- **Symmetrical layouts** - Maintain even spacing and margins; avoid asymmetric empty space
- **Clean and minimal** - Prefer uncluttered interfaces; less is more
- **Iterative refinement** - Make small, focused changes and gather feedback before continuing
- **Professional polish** - UI elements should look refined and high-quality

### When Making Visual Changes
- State exactly what was changed and where (e.g., "Updated line 34 in Sidebar.css")
- Offer to adjust if styling is "stronger or softer than desired"
- Always include responsive design considerations (media queries for different screen sizes)

---

## Things to Avoid

- Don't use Redux/Context - keep state local
- Don't hardcode API tokens - use env vars (fallbacks exist in vite.config.ts for dev)
- Don't create new components for one-off UI - inline or extend existing
- Don't skip TypeScript types - all API responses need interfaces
- Don't use inline styles - create/extend CSS files
- Don't use dark theme colors - this is a light theme (no cyan #00d4ff, no dark backgrounds)
- Don't confuse API endpoints - Dashboard uses BOTH Meta API (ad spend, ROAS, conversions) AND Supabase funnel API (unique customers, AOV, conversion rate, CAC)
- Don't hardcode date ranges - make them configurable when user-facing
- Don't hardcode brand colors in CSS - use CSS variables (`var(--accent-violet)` not `#a855f7`, `var(--text-primary)` not `#1e293b`, `var(--text-muted)` not `#94a3b8`). Semantic state colors (green for success, red for error, amber for warning) may remain hardcoded since they don't have CSS variable equivalents
- Don't log API tokens or keys - wrap diagnostic logging in `if (import.meta.env.DEV)` on frontend, never log secrets in serverless functions
- Don't trust client-provided organization IDs - always derive from authenticated user's JWT token
- Don't use `catch (error: any)` - use `catch (error: unknown)` and narrow the type
- Don't create new `api/*.ts` files without checking the serverless function count first — Vercel Hobby plan limit is 12 functions (currently at 12/12). Add new routes to existing catch-all handlers instead
- Don't send Meta access tokens to the browser — all Meta API calls must go through the backend proxy (`/api/meta/proxy`)
- Don't bake UTM parameters into `link_data.link` or body copy — use Meta's `url_tags` field on the ad creative instead
- Don't use `requestIdleCallback` for localStorage writes that must complete before navigation — the cleanup function cancels pending callbacks on unmount, causing data loss. Use synchronous writes before `navigate()`
- Don't leave localStorage storage warnings sticky — always clear them when the data size drops below threshold or after successful save

---

## AI Integration Details

### Model Configuration

| Provider | Model ID | Purpose |
|----------|----------|---------|
| OpenAI | `gpt-5.2` | Ad analysis, copy generation, creative evaluation |
| Google | `gemini-3-pro-image-preview` | Professional image asset generation |
| Google | Veo | Video variant generation |

**Important**: Model IDs and API URLs should be defined as constants at the top of `src/services/openaiApi.ts` for easy management and updates.

### ConversionIQ™ Reasoning Levels

The `IQSelector` component (`src/components/IQSelector.tsx`) allows users to control AI reasoning depth before major AI operations:

| Level | Parameter | Description | Est. Time |
|-------|-----------|-------------|-----------|
| IQ Standard | `reasoning.effort: "low"` | Fast analysis, essential insights | ~10 sec |
| IQ Deep | `reasoning.effort: "medium"` | Balanced depth and speed | ~30 sec |
| IQ Maximum | `reasoning.effort: "high"` or `"xhigh"` | Comprehensive analysis, highest token usage | ~60 sec |

**Usage**: Display the IQ selector before ad analysis, channel analysis, and ad generation workflows to give users control over processing depth and API costs.

### GPT-5.2 Reasoning API

The `gpt-5.2` model supports reasoning through the `reasoning.effort` parameter:
- Available levels: `none`, `low`, `medium`, `high`, `xhigh`
- Higher effort = more tokens consumed = increased API costs
- Pass via request body: `{ reasoning: { effort: "medium" } }`

### Psychological Concepts for Copy
The ad generator uses these frameworks:
- Cognitive Dissonance
- Social Proof
- Fear Elimination
- Product Benefits
- Transformation
- Urgency/Scarcity
- Authority

### Creative Generation Flow
1. **Step 1 (Config)**: User selects product, audience type, concept angle, copy length (short/long-form), and ConversionIQ™ reasoning level
2. GPT-5.2 generates copy options (headlines, body texts, CTAs) using channel analysis patterns + product context
3. **Step 2 (Copy Selection)**: User picks preferred headlines, body texts, and CTAs from generated options
4. **Step 3 (Final Config)**: User selects ad type (image/video), image size, variation count, and generates creatives
5. Gemini 3 Pro generates images (with product mockups as reference images) or Veo generates video
6. User reviews results — can regenerate individual images without regenerating the full set
7. User exports to Meta via Ad Publisher

### Product Context Architecture

The AI needs two complementary layers to generate accurate ads:

| Layer | Source | What It Provides | Stored In |
|-------|--------|-----------------|-----------|
| **Performance patterns** | ConversionIQ™ Channel Analysis (Insights page) | "Curiosity-gap headlines convert 3x", winning visual elements, emotional triggers | `channel_analysis_cache` in localStorage |
| **Product identity** | Product Context (Products page) | "This is The Resistance Protocol by Marcus Reid — a digital course about..." | `convertra_products` in localStorage |

- Channel analysis is **account-wide** — analyzes all ads for the last 30 days
- Product context is **per-product** — tells the AI what to call the product and what it looks like
- The AI combines both: proven patterns + correct identity
- Without product context, the AI may reference the platform name instead of the actual product
- Product mockup images are sent as additional reference images to Gemini alongside performance-based cached images

```typescript
interface ProductContext {
  id: string;
  name: string;           // "The Resistance Protocol"
  author: string;         // "Marcus Reid"
  description: string;    // 1-2 sentences
  landingPageUrl: string;
  productImages: Array<{  // Max 5, resized to 1024px, JPEG 80% quality
    base64Data: string;
    mimeType: string;
    fileName: string;
  }>;
  createdAt: string;
}
```

---

## Performance Metrics Glossary

| Metric | Calculation | Data Source |
|--------|-------------|-------------|
| CVR | conversions / clicks | Meta API |
| CPA | spend / conversions | Meta API |
| ROAS | revenue / spend | Meta API |
| CTR | clicks / impressions | Meta API |
| AOV | total revenue / unique customers | Supabase funnel (per-customer, includes upsells) |
| CAC | ad spend / unique customers | Meta spend ÷ Supabase unique customers |
| Conversion Rate | sessions to purchase | Supabase funnel |
| Health Score | AI-generated 0-100 based on trends | Calculated |

### Dashboard Data Source Strategy

The Dashboard uses a hybrid data approach to ensure accurate metrics:

- **Ad Platform Metrics** (from Meta API): Ad Spend, ROAS, Total Conversions, Total Revenue
- **Per-Customer Metrics** (from Supabase funnel): Unique Customers, AOV, Conversion Rate, CAC

This separation is important because Meta's pixel may fire multiple purchase events per customer (front-end, upsells, downsells), which would inflate metrics if used for per-customer calculations. The Supabase funnel tracks unique `funnel_session_id` to count actual unique buyers.

**Error handling**: Meta API and funnel API failures are handled independently. If the funnel API fails, the Dashboard shows a warning banner for funnel-specific metrics rather than blocking the entire page. Never fabricate fallback data for missing metrics — show a clear "data unavailable" state instead.

---

## Sales Landing Page Structure

The Convertra sales landing follows this architecture. The core messaging positions ConversionIQ™ as an **autonomous creative intelligence engine** that eliminates the creative bottleneck — launching, testing, and scaling winning ads at a velocity no human team can match.

### Messaging Pillars

| Pillar | Key Phrase | Used In |
|--------|-----------|---------|
| **Creative Bottleneck** | "Days per creative. Sound familiar?" | Problem, Loop visual |
| **Autonomous Velocity** | "Launches, tests, and scales dozens of creatives" | Hero, Mechanism, Outcome |
| **Automated Partnership** | "This isn't software you figure out" | Bespoke, Enterprise, Pricing |
| **Compounding Advantage** | "Every creative tested makes the next one smarter" | Repeat step, Outcome |

### Section Architecture

| Section | Purpose |
|---------|---------|
| Hero | "Scale Creative Testing. On Autopilot." + embedded Remotion VSL video with branded poster |
| Problem Agitation | Creative bottleneck pain — days per creative, human team limitations vs. autonomous velocity |
| Mechanism Reveal | Introduce ConversionIQ™ as "The Autonomous Creative Engine That Never Sleeps" — Extract, Interpret, Generate, Repeat |
| Bespoke Differentiator | "It's an Automated Partnership" — separate from self-serve tools, premium positioning |
| Outcome | "Creative Velocity on Autopilot — That Compounds Every Week" |
| Credibility | Enterprise-only positioning. "Done being bottlenecked." |
| Offer | Tangible deliverables. Autonomous Creative Velocity as a named offering. |
| Risk Reversal / Urgency | Cost of waiting — bloated creative teams, slow testing, creative fatigue |
| Final CTA | "Ready to Break Free From the Creative Bottleneck?" |
| Footer | "Scale creative testing on autopilot. That's ConversionIQ™." |

---

## Remotion VSL (Video Sales Letter)

### Overview

The sales landing page includes an embedded Remotion-powered VSL — a 109-second animated video that walks through the Convertra value proposition. It plays inline in the hero section with controls, background music, and a branded poster/thumbnail. The video plays once and stops on the CTA scene (no auto-replay).

### Architecture

| File | Purpose |
|------|---------|
| `src/remotion/ConvertraVSL.tsx` | Main composition — 13 scene components with animations and background music |
| `src/remotion/brand.ts` | Brand constants, video config (1920x1080 @ 30fps), scene timing |
| `src/remotion/Root.tsx` | Remotion composition registration |
| `remotion.config.ts` | Remotion CLI entry point (`./src/remotion/Root.tsx`) |

### Scene Structure (13 scenes, ~109 seconds)

| Scene | Timing | Purpose |
|-------|--------|---------|
| Hook | 0-6s | "While your competitors wait on designers..." — creative bottleneck framing |
| CIQ Velocity Reveal | 6-13s | "ConversionIQ™ is already testing 50 creatives" — autonomous velocity contrast |
| The Loop | 13-22s | Creative bottleneck cycle — brief, wait, revise, launch, one ad, repeat |
| Revelation | 22-29s | "What if creative testing ran itself?" — autopilot positioning |
| CIQ Reveal | 29-38s | ConversionIQ™ brand reveal with glow animation |
| Extract | 38-45s | Step 1 — Continuously ingest data, build real-time intelligence layer |
| Interpret | 45-53s | Step 2 — Reveal WHY conversions happen, not just what happened |
| Generate | 53-60s | Step 3 — Autonomously engineer new creatives from proven patterns |
| Repeat | 60-67s | Step 4 — Compounding creative velocity, each test makes the next smarter |
| Results | 67-76s | Metrics — 47% reduced CPA, 3.2x ROAS, 80% less waste |
| Cost of Waiting | 76-91s | Urgency — animated cost cards ($275K+/yr hidden waste), pulsing total reveal |
| Enterprise | 91-98s | Automated partnership, white glove, dedicated implementation |
| CTA | 98-109s | Schedule a demo with Convertra logo and button |

### Sales Landing Integration

The VSL is embedded in the hero section of `SalesLanding.tsx` using `@remotion/player`:

```tsx
import { Player } from '@remotion/player';
import { ConvertraVSL } from '../remotion/ConvertraVSL';
import { VIDEO_CONFIG } from '../remotion/brand';

<Player
  component={ConvertraVSL}
  durationInFrames={VIDEO_CONFIG.durationInFrames}
  fps={VIDEO_CONFIG.fps}
  compositionWidth={VIDEO_CONFIG.width}
  compositionHeight={VIDEO_CONFIG.height}
  controls
  renderPoster={({ width, height }) => <VSLPoster width={width} height={height} />}
  posterFillMode="player-size"
  showPosterWhenUnplayed
/>
```

The `VSLPoster` component renders a branded thumbnail with "Scale Creative Testing. On Autopilot." headline and play button, shown before the user clicks play.

### Animation Patterns

The VSL uses shared animation helpers defined at the top of `ConvertraVSL.tsx`:

- `fadeIn(frame, delay, duration)` — opacity 0→1
- `fadeOut(frame, startFrame, duration)` — opacity 1→0
- `slideUp(frame, delay, duration)` — translateY 30→0
- `scaleIn(frame, fps, delay)` — spring-based scale 0→1

Each scene manages its own fade-out near the end of its duration for smooth transitions.

### Development Commands

```bash
npx remotion studio    # Open Remotion Studio to preview/edit video
npx remotion render src/remotion/Root.tsx ConvertraVSL out/vsl.mp4  # Render to MP4
```

### Background Music

The VSL includes cinematic background music (`public/vsl-background-music.mp3`) with a volume envelope:

```tsx
<Audio
  src={staticFile('vsl-background-music.mp3')}
  volume={(f) =>
    interpolate(f, [0, 45, 3200, 3290], [0, 0.25, 0.25, 0], { extrapolateRight: 'clamp' })
  }
/>
```

- **Fade in**: 0 → 0.25 over 1.5 seconds (frames 0-45)
- **Sustain**: 0.25 (25% volume) through the body — present but not overpowering
- **Fade out**: 0.25 → 0 over 3 seconds (frames 3200-3290) for a clean ending
- Audio file is longer than the video (~134s vs ~109s); Remotion handles the truncation
- Place MP3 files in `public/` directory. Use `interpolate()` for fade-in/fade-out volume control.

### Modifying Scenes

- **Scene timing**: Adjust `SCENES` in `src/remotion/brand.ts` — values are in frames at 30fps
- **Total duration**: Update `VIDEO_CONFIG.durationInFrames` in `brand.ts`
- **Scene content**: Each scene is a standalone function component in `ConvertraVSL.tsx`
- **Brand colors**: Use constants from `brand.ts` (`COLORS`, `GRADIENTS`, `FONTS`)

### Important Notes

- React 19 requires `.npmrc` with `legacy-peer-deps=true` for Remotion compatibility
- All Remotion imports must be used — TypeScript strict mode rejects unused imports (TS6133)
- The `@remotion/player` package is used for inline playback; `@remotion/cli` for studio/rendering
- Scene components use `useCurrentFrame()` and `useVideoConfig()` from Remotion for animation timing
- Video does **not** loop — plays once and stops on CTA scene so the call-to-action remains visible
- When adding/removing scenes, update: scene timing in `brand.ts`, total `durationInFrames`, and audio fade-out keyframes in `ConvertraVSL.tsx`

---

## SEO & GEO Implementation

### Overview

The Convertra sales landing and public pages are optimized for both traditional SEO and GEO (Generative Engine Optimization) to maximize visibility in search engines and AI-generated content.

### SEO Component Pattern

Use the centralized `SEO.tsx` component for consistent meta tag management:

```tsx
import SEO from '../components/SEO';

// In page component:
<SEO
  title="Page Title | Convertra"
  description="Page description for search results"
  canonical="https://convertra.ai/page"
  noIndex={false}  // Set true for internal/protected pages
/>
```

### Structured Data (JSON-LD)

Use JSON-LD format for schema markup:

```tsx
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Convertra",
  "description": "AI-powered ad conversion intelligence platform",
  // ... additional schema properties
};

<script type="application/ld+json">
  {JSON.stringify(structuredData)}
</script>
```

### GEO Optimization

To maximize AI citations:
- Use clear definitions and quotable statistics in content
- Structure content with Q&A formats where appropriate
- Include authority signals (testimonials, case studies, enterprise clients)
- Allow AI bots in `robots.txt`: GPTBot, Claude-Web, PerplexityBot, Google-Extended

### Page SEO Strategy

| Page Type | SEO Approach |
|-----------|--------------|
| Sales Landing (`/`) | Full SEO with rich schema, keywords, Open Graph |
| Login/Signup | Basic meta tags, canonical URLs |
| Protected App Pages | `noindex` directive, basic title/description |

---

## Testing Notes

- No test framework currently configured
- Manual testing against live Meta API
- Use mock data in `src/data/` for UI development
- Dev server: `http://localhost:5175`
- Sales landing: `http://localhost:5175` (root)
- Login: `http://localhost:5175/login`
- Signup: `http://localhost:5175/signup`
- Dashboard: `http://localhost:5175/dashboard` (requires auth)

### Dev Server Troubleshooting
- Port 5175 may be in use by other processes/workspaces - try 5176, 5177 if needed
- Verify the running server is for the correct workspace (check `cwd` of process)
- For client-side rendering issues, try hard refresh (Cmd+Shift+R / Ctrl+Shift+R) or clear cache

---

## Accessibility

- Respect `prefers-reduced-motion` — disable animations when set (use `@media (prefers-reduced-motion: reduce)` to set `animation: none` and `transition: none`)
- All interactive elements have hover/focus states
- Use `focus-visible` outlines on interactive components (buttons, toggles, selectors) for keyboard navigation accessibility
- Color contrast meets WCAG AA standards
- Mobile navigation accessible via hamburger menu
- Use `aria-label` on icon-only buttons (e.g., `aria-label="Open menu"`)
- Use `aria-hidden="true"` on decorative icons and SVGs
- User profile dropdown accessible in both desktop header and mobile navigation
- Support safe-area-inset padding for notched/island devices via `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` behind `@supports`

---

## Meta App Review — Permissions & Submission Guide

### Overview

Meta requires App Review for each individual permission before external (non-tester) users can use the OAuth flow. The app being "Published" and having an approved App Review are **not sufficient** — each permission listed in the OAuth scopes must independently have **Advanced Access** for public users. Permissions stuck at "Ready for testing" will cause the error: **"Feature unavailable — Facebook Login is currently unavailable for this app as we are updating additional details for this app."**

### Key Concepts

| Term | Meaning |
|------|---------|
| **Development Mode** | Only app role users (admins, developers, testers) can use the app |
| **Live/Published Mode** | App is published, but individual permissions may still be restricted |
| **Ready for testing** | Permission is approved for app role users only — NOT available to the public |
| **Ready to publish** | Permission has been approved via App Review but needs activation |
| **Advanced Access** | Permission is fully live and available to all public users |

**Critical distinction**: An app can be "Published" while individual permissions remain at "Ready for testing." The app-level publish status and per-permission access levels are independent.

### Required OAuth Scopes

Defined in `api/auth/meta/connect.ts`:

```typescript
const SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
].join(',');
```

**All scopes requested in the OAuth flow must have Advanced Access**, or external users will be blocked at the Facebook Login dialog.

### Permissions Required & Their Usage

| Permission | API Calls | What It's Used For |
|---|---|---|
| **`ads_management`** | High | Create campaigns (PAUSED), ad sets, ads, upload images, validate page linkage via `promote_pages` |
| **`ads_read`** | High | Fetch insights, campaigns, ad sets, creative details, custom audiences, pixels, targeting suggestions, ad account details |
| **`pages_read_engagement`** | Medium | Validate Facebook Page access, fetch available Pages during OAuth (`me/accounts`), read Page metadata for `object_story_spec` |
| **`business_management`** | High | Access Business Manager-scoped assets — `me/adaccounts`, `me/accounts`, `debug_token` validation, ad account metadata verification |
| **`pages_show_list`** | Low | Display list of Pages the user manages for selection during credential setup |

### Permissions NOT Used (Do Not Request)

| Permission | Why Not Needed |
|---|---|
| `pages_manage_ads` | Ads are created at the ad account level via `ads_management`, not through page endpoints |
| `email` | App uses Supabase auth, not Facebook Login for end-user authentication |

### App Review Submission Process

#### Prerequisites (Settings → Basic)

Before submitting, ensure all of these are set:

- **Privacy Policy URL**: `https://www.convertraiq.com/privacy`
- **Terms of Service URL**: `https://www.convertraiq.com/terms`
- **User Data Deletion URL**: `https://www.convertraiq.com/data-deletion`
- **App Icon**: Uploaded (1024x1024)
- **Category**: Utility & productivity
- **Business Verification**: Completed (green dot)
- **Data Use Checkup**: Completed (green dot)

#### Submission Steps

1. **Navigate to**: Review → App Review → Start a New Submission (or edit existing)
2. **Add all permissions** to the same submission — Meta allows bundling multiple permissions in one review
3. **For each permission**, fill in:
   - **Description**: How the app uses it (see templates below)
   - **Screen recording**: Upload a video showing the full user flow
   - **API test calls**: Must be completed beforehand (check via Review → Testing)
   - **Agree to allowed usage**: Check the compliance box
4. **Complete Data Handling section** (see below)
5. **Complete Reviewer Instructions** with test credentials and testing steps
6. **Submit** — review takes up to 10 business days

#### Submitting Multiple Permissions Together

You can and should add all permissions to a single submission. On the "Allowed usage" step, each permission gets its own section. Meta may also auto-add dependencies (e.g., `ads_management` requires `pages_read_engagement`).

### Description Templates

#### `ads_management`

> Convertra is an AI-powered ad creative platform that helps advertisers generate and publish high-converting ad creatives to their Meta ad accounts.
>
> We use the ads_management permission to allow authenticated users to publish AI-generated ad creatives directly to their own Meta ad account. The full workflow is:
>
> 1. The user connects their Meta ad account via OAuth
> 2. The user uses our AI creative tools to generate ad headlines, body copy, and images
> 3. The user reviews and selects their preferred creatives
> 4. The user configures campaign settings — budget, targeting, placements, scheduling, CTA button type, and tracking parameters
> 5. The user clicks "Publish" to create the campaign in their ad account
>
> Specifically, ads_management is used to:
> - Create campaigns in PAUSED status (never live without user review in Ads Manager)
> - Create ad sets with user-configured targeting, budget, and optimization goals
> - Create ads with inline creative specs containing the AI-generated headline, body copy, image, and call-to-action
> - Upload AI-generated images to the user's ad account via the adimages endpoint
> - Validate that the user's Facebook Page is linked to their ad account via the promote_pages endpoint
>
> All ad creation is explicitly user-initiated. No campaigns are created automatically. All campaigns are created in PAUSED status so the user retains full control. Access tokens are encrypted at rest (AES-256-GCM) and stored server-side only.

#### `ads_read`

> Convertra uses ads_read to pull ad performance data from the user's Meta ad account and display it in our analytics dashboard, enabling advertisers to identify their best-performing creatives and optimize future campaigns.
>
> Specifically, we use this permission to:
> 1. Fetch ad-level insights — performance metrics (impressions, clicks, conversions, spend, ROAS, CPA, CTR) displayed in our Meta Ads dashboard
> 2. Fetch ad creative details — creative specs (headlines, body copy, images, thumbnails) displayed alongside performance metrics
> 3. Fetch campaigns and ad sets — campaign data (names, statuses, budgets, objectives) for dashboard organization and campaign selection during publishing
> 4. Fetch custom audiences — available audiences for targeting configuration when publishing
> 5. Fetch ad pixels — available Meta pixels for conversion tracking configuration
> 6. Search targeting suggestions — interest and behavior suggestions for ad set targeting
> 7. AI-powered creative analysis — ad metrics and creative copy analyzed by ConversionIQ™ to identify patterns in high-converting creatives

**Allowed usage selection**: "Provide API access to your ad performance data for use in custom dashboards and data analytics."

#### `pages_read_engagement`

> Convertra uses pages_read_engagement to read Facebook Page metadata when users connect their Meta ad account for ad publishing.
>
> Specifically, we use this permission to:
> 1. Validate Facebook Page access — verify the user's Page is accessible and linked to their ad account before publishing ads
> 2. Display Page name — fetch available Pages via me/accounts during OAuth so the admin can select which Page to use
> 3. Build ad creatives with object_story_spec — read the Page ID and name to correctly construct ad creatives that reference the user's Page
>
> We do not store Page content (posts, photos, videos). We only read Page metadata (ID and name).

#### `business_management`

> Convertra uses business_management to access and manage Business Manager assets when users connect their Meta ad account via OAuth.
>
> Specifically, we use this permission to:
> 1. Retrieve available ad accounts — call me/adaccounts to list accessible ad accounts during OAuth connection
> 2. Retrieve available Pages — call me/accounts to list Facebook Pages associated with the user's Business Manager
> 3. Token validation — use debug_token to validate token scopes, permissions, and expiration during credential setup
> 4. Ad account verification — read ad account metadata (status, currency, capabilities, disable reason) to verify eligibility for ad creation

#### `pages_show_list`

> Convertra uses pages_show_list to display the list of Facebook Pages that the user manages, so they can select which Page to associate with their ad account for ad creative publishing.
>
> We only read the list of Pages (ID and name). We do not modify, post to, or manage Page content.

### Data Handling Answers

These are completed during the "Data handling" step of the submission:

| Question | Answer |
|---|---|
| **Do you have data processors with access to Platform Data?** | **Yes** |
| **List all data processors** | Google LLC, OpenAI LLC, Supabase Inc., Vercel |
| **Responsible entity for Platform Data** | Spire Enterprises Pty Ltd |
| **Country** | Australia |
| **Shared data with public authorities in past 12 months?** | No |
| **Policies for public authority requests** | Select all four: required legality review, provisions for challenging, data minimization, documentation |

**Why each processor is listed:**

| Processor | Platform Data Access |
|---|---|
| **Vercel** | Serverless functions decrypt and process Meta access tokens, API requests pass through Vercel infrastructure |
| **Supabase** | Stores encrypted Meta access tokens, ad account IDs, and page IDs in `organization_credentials` table |
| **Google LLC** | Cached ad creative images (originating from Meta) sent to Gemini as reference images for AI generation |
| **OpenAI, LLC** | Ad metrics and creative copy (from Meta) sent to GPT for AI-powered analysis |

### Reviewer Instructions Template

**Site URL**: `https://www.convertraiq.com/login`

**Testing instructions**:

> Convertra uses Facebook Login to authenticate users and connect their Meta ad accounts. After login, the app uses the following Meta APIs:
>
> 1. ads_management — Create new ad campaigns, ad sets, and ads in PAUSED status, upload ad images
> 2. ads_read — Read ad performance data (impressions, clicks, conversions, spend, ROAS)
> 3. pages_read_engagement — Read Facebook Page metadata for displaying page names and building ad creatives
> 4. business_management — Access Business Manager assets (ad accounts, pages, pixels)
>
> Testing steps:
> 1. Go to https://www.convertraiq.com/login
> 2. Log in with the test credentials provided below
> 3. The Dashboard loads with live Meta ad performance metrics
> 4. Click "Meta Ads" in the left sidebar — view ad creatives with images, conversion rates, cost per conversion
> 5. Click "ConversionIQ" then "Run Channel Analysis"
> 6. Click "CreativeIQ" in the sidebar to open the ad generation workflow
> 7. Select a product, audience type, and concept angle, then click Generate
> 8. Select preferred headlines, body text, and CTAs from the generated options
> 9. Generate ad images, then click "Publish" to open the Ad Publisher
> 10. Configure campaign settings and publish ads in PAUSED status to the connected Meta ad account

**Test credentials**: Provide a pre-configured account with a connected Meta ad account containing live campaign data.

**Screen recording**: Attach a video demonstrating the complete workflow from login through ad publishing.

### Troubleshooting

#### "Feature unavailable — Facebook Login is currently unavailable for this app"

**Cause**: OAuth scopes include permissions that are still at "Ready for testing" (not Advanced Access). External users can't use permissions that haven't passed App Review.

**Fix**: Submit all requested OAuth scopes for App Review. All scopes in the `SCOPES` array in `api/auth/meta/connect.ts` must have Advanced Access.

#### Permissions show "Ready for testing" after App Review approval

**Cause**: App Review was only submitted for a subset of permissions (e.g., only "Ads Management Standard Access" but not the individual `ads_management`, `ads_read`, etc. permissions).

**Fix**: Submit a new App Review for each individual permission that's still at "Ready for testing."

#### "Data handling questions" gray dot in Requirements

**Cause**: The Data Handling section of the App Review submission hasn't been completed, or a new submission needs fresh Data Handling answers.

**Fix**: Complete the Data Handling questionnaire during the App Review submission process. Answers are pre-filled from previous submissions.

#### App is "Published" but external users still blocked

**Cause**: App publish status and individual permission access levels are independent. The app can be "Published" while permissions remain at "Ready for testing."

**Fix**: Verify each permission in Use Cases → Customize → Permissions and features shows Advanced Access (not "Ready for testing" or "Ready to publish").
