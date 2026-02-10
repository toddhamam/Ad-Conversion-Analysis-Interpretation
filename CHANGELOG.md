# Changelog

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
