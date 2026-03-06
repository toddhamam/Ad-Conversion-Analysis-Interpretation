# Changelog

## 2026-03-06 — Add agency-targeted sales landing page

### Added
- **`src/pages/AgencySalesLanding.tsx`** — New sales landing page at `/for-agencies` targeting agencies. Same visual structure as the generic page but with agency-specific copy: multi-client scaling, capacity per operator, margin improvement, eliminating feedback loops.
- **Agency ROI Calculator** — Redesigned for agency economics: inputs are client accounts, media buyers, cost per buyer, ads per client/week, days to launch. Outputs: annual team savings, accounts per operator, margin improvement, velocity multiplier.
- **`src/components/sales/VSLPoster.tsx`** — Extracted shared VSL poster component (from SalesLanding.tsx).
- **`src/components/sales/DemoPoster.tsx`** — Extracted shared demo poster component (from SalesLanding.tsx).
- **`src/components/sales/useSalesPageEffects.ts`** — Shared hook for scroll animations, anchor smooth scrolling, and nav shadow state. Returns `{ isScrolled, isMobileMenuOpen, toggleMobileMenu }`.
- **`agencyFaqSchema`** in `SEO.tsx` — 6 agency-specific FAQ entries for structured data / GEO optimization.
- **Sitemap entry** — `/for-agencies` added to `public/sitemap.xml`.
- **UTM tracking** — Agency calendar URL includes `utm_source=website&utm_medium=landing&utm_campaign=agencies` for demo booking attribution.

### Changed
- **`SalesLanding.tsx`** — Refactored to import shared components (`VSLPoster`, `DemoPoster`, `useSalesPageEffects`) instead of defining inline. No copy changes.
- **`App.tsx`** — Added `/for-agencies` public route.

---

## 2026-03-05 — Add regenerate & remove for individual text ad images

### Added
- **Regenerate individual text ad images** — "Regenerate" button on each text ad image re-renders it with a different style from the selected presets (cycles to next style). Instant, no API calls.
- **Remove individual images** — Red "Remove" button on every image card (all ad types) lets users drop unwanted images before publishing to Meta. Guard: can't remove the last image.
- **`textAdConfig` persisted on `GeneratedAdPackage`** — Stores the original primary/highlight/anchor text and style IDs so text ad images can be regenerated after initial generation.

### Changed
- **`GeneratedAdCard`** — Added `onRemoveImage` prop, `Trash2` icon import, remove button with red styling (`.remove-btn`)
- **`AdGenerator.tsx`** — Added `handleRegenerateTextImage` and `handleRemoveImage` callbacks; text ads now receive `onRegenerateImage` (mapped to text handler) and `onRemoveImage`
- **`openaiApi.ts`** — `GeneratedAdPackage.textAdConfig` field added; populated in `generateAdPackage()` return for text ads

---

## 2026-03-05 — Add text-only ad image generation for CreativeIQ

### Overview
Added a new "Text Ad" creative type to the CreativeIQ ad generation workflow. Instead of using Gemini AI to generate photographic images, text ads render bold typographic images programmatically via the Canvas API — zero cost, instant generation, pixel-perfect text. This is especially effective for lead generation advertisers whose best-performing ads are text-only images with bold promises and guarantees.

### Added
- **`src/services/textAdCanvas.ts`** — New canvas rendering engine with 12 style presets (Clean Orange, Dark Orange, Navy Gold, Clean Red, Dark Lime, Clean Blue, Warm Gradient, Cool Gradient, High Contrast, Charcoal, Money Green, Electric Blue)
- **Multi-section image layout** — Primary text (accent color, top), highlight banner (dark contrast strip, middle), anchor text (trust word, bottom). Each section is optional; layout adjusts proportionally
- **Text Ad type button** in Step 3 (Final Config) alongside Image and Video
- **Structured text input fields** — Primary Text (required), Highlight Banner Text (optional), Anchor Text (optional) with separate inputs for each image zone
- **"Generate Suggestions with AI" button** — Calls new `generateTextAdCopy()` GPT function that produces text-ad-optimized copy (bold promises, quantified outcomes, trust anchors) tailored to audience type, concept angle, and business type
- **Clickable suggestion chips** — AI-generated suggestions appear as selectable chips above each text field; clicking one populates the field
- **Style preset selector** — Grid of 12 color swatches with multi-select; multiple styles = different style per variation
- **`TextAdConfig` interface** and `textAdConfig` parameter on `generateAdPackage()`
- **`TextAdCopyResult` interface** and `generateTextAdCopy()` export in openaiApi.ts

### Changed
- **`AdType` extended**: `'image' | 'video'` → `'image' | 'video' | 'text'`
- **`generateAdPackage()`** — Added explicit `else if (config.adType === 'text')` branch before the video else block (prevents text ads falling into the video path)
- **API key validation bypass** — Text ads skip Gemini/OpenAI key checks since Canvas rendering needs no external APIs
- **`canGenerateCreatives` validation** — Now also requires `textAdPrimaryText` when ad type is text
- **Ad type selector grid** — Changed from 2-column to 3-column layout
- **Image size selector** — Now shown for both image and text ad types
- **Progress message** — Shows "ConversionIQ™ rendering text creatives..." for text ads
- **`GeneratedAdCard`** — Badge shows "Text Ad" with Type icon; image display and error conditions include `adType === 'text'`

### Technical Notes
- Canvas renders at full Meta ad resolution (1080×1080, 1920×1080, 1080×1920)
- Text is auto-uppercased for maximum impact
- Font sizing algorithm steps down from 140px until text fits within section bounds (min 36px)
- Text ad images are significantly smaller than AI-generated images (~20-50KB vs 500KB-2MB), reducing localStorage pressure
- Ad Publisher requires no changes — text ads produce standard `GeneratedImageResult[]` that flows through the existing image upload pipeline unchanged
- `revisedPrompt` field populated with descriptive string for each canvas-rendered image

---

## 2026-03-05 — Remove org-level Business Type & require Pixel ID per account

### Removed
- **Business Type section from Account Settings** — eliminated the org-level business type setting entirely to avoid confusion. Business type is now managed exclusively at the per-ad-account level in Integrations.

### Changed
- **Pixel ID is now a required field** in the Integrations per-account configure panel — replaced the optional text input with a dropdown that loads available pixels from the Meta API via `fetchAvailablePixels()`
- **Pixel ID validation** — saving an account configuration without a pixel selected now shows an error message
- **Account status dot** — now shows amber (needs setup) when either page or pixel is missing, green only when both are configured
- **Account detail line** — shows "Needs pixel setup" when pixel is not configured

---

## 2026-03-05 — Move business type to per-ad-account level

### Overview
Moved the business type setting (`ecommerce` | `leadgen`) from the organization level to the per-ad-account level. Agencies managing multiple client accounts with different business models can now set each ad account independently. The org-level setting in Account Settings remains as the default for accounts without an override.

### Added
- **`business_type` column on `organization_ad_accounts`** — nullable, `NULL` inherits from org default (migration: `011_ad_account_business_type.sql`)
- **Per-account business type selector** in Integrations configure panel — dropdown with "Use organization default", "E-Commerce", and "Lead Generation" options
- **Business type badge** in Integrations account row detail line (shows "E-Commerce" or "Lead Gen" when overridden)
- **`accountBusinessType`** on `AdAccountContext` — resolved value: account override > org default > `'ecommerce'`

### Changed
- **All business type consumers** now read from `useAdAccount().accountBusinessType` instead of `useOrganization().businessType`:
  - Dashboard, MetaAds, AdGenerator, AdPublisher, Insights
- **Account fingerprint** in `AdAccountContext` now includes `business_type` to detect changes on refresh
- **Backend `api/meta.ts`** — `resolveAdAccountConfig`, `handleStatus`, `handleAdAccountsWrite` (configure action) all read/write `business_type`
- **`configureAdAccount()` in `metaApi.ts`** — accepts optional `businessType` parameter
- **AccountSettings** — text updated to reference "ConversionIQ™ analysis" and reframed as org default with note about per-account overrides

---

## 2026-03-05 — Add lead generation business type support across entire platform

### Overview
Added comprehensive lead generation (`leadgen`) business type support so the platform adapts all metrics, labels, AI prompts, and defaults based on whether an organization sells products (e-commerce) or generates leads (coaching, services, info products). Existing e-commerce organizations see zero behavior change.

### Added
- **`BusinessType` type** (`'ecommerce' | 'leadgen'`) on Organization model and context
- **`businessTypeConfig.ts`** — centralized config utility with labels, thresholds, AI prompt context, dashboard defaults, and ad publisher defaults per business type
- **Business Type selector** in Account Settings — radio card UI to switch between E-Commerce and Lead Generation, saves to Supabase `organizations.business_type`
- **Business Type selector** in Admin Create Organization flow — included in company step and review step
- **Business Type badge** in Admin Organization Detail header
- **`needsConversionTracking()` helper** in Ad Publisher — conversion tracking now applies to both `OUTCOME_SALES` and `OUTCOME_LEADS`

### Changed
- **Dashboard** — Default visible metrics swap based on business type (leadgen shows Leads, CPL, Lead Rate, Results; hides Revenue, ROAS, AOV). Includes localStorage migration to detect stale e-commerce configs for leadgen orgs
- **CampaignTypeDashboard** — Conditionally hides Revenue, ROAS, AOV columns for leadgen; shows CPL as primary KPI instead of ROAS
- **MetaAds** — Uses business-type-specific action types, thresholds, and labels for creative cards
- **Ad Publisher** — Defaults to OUTCOME_LEADS / LEAD / SIGN_UP for leadgen orgs; "(Recommended)" label is dynamic
- **AI Analysis (openaiApi.ts)** — Business context injected into `analyzeChannelPerformance`, `generateCopyOptions`, and `regenerateSingleCopy` prompts. Includes psychology shifts (purchase fears vs commitment fears) and retention context overrides
- **Insights page** — Passes business type to fetchAdCreatives and analyzeChannelPerformance
- **AdGenerator** — Passes business type to generateCopyOptions and regenerateSingleCopy
- **Backend `credentials.ts`** — `handleCreateOrg` now persists `business_type` in the org insert payload

### Fixed (from code review)
- **Stale closure in MetaAds `loadMetaData`** — added `businessType` to useCallback deps
- **Stale closure in Insights `runAnalysis`** — added `businessType` to useCallback deps
- **Dashboard metrics not updating after org hydration** — added useEffect to re-run migration when businessType changes
- **AccountSettings radio desync** — added useEffect to sync businessTypeValue when org context hydrates
- **AdPublisher defaults stuck on ecommerce** — added useEffect to reset objective/event/CTA when businessType resolves
- **`regenerateSingleCopy` missing business context** — added businessType param and injected AI context modifiers

### Database Migration Required
```sql
ALTER TABLE organizations ADD COLUMN business_type TEXT NOT NULL DEFAULT 'ecommerce' CHECK (business_type IN ('ecommerce', 'leadgen'));
NOTIFY pgrst, 'reload schema';
```

### Files Modified (18 files)
- `src/types/organization.ts` — Added `BusinessType`, `business_type` field
- `src/lib/businessTypeConfig.ts` — New centralized config utility
- `src/contexts/OrganizationContext.tsx` — Exposed `businessType` on context
- `src/services/metaApi.ts` — Parameterized fetch/aggregate functions
- `src/services/openaiApi.ts` — Business context in 3 AI functions
- `src/pages/Dashboard.tsx` — Metric defaults, migration, labels
- `src/components/CampaignTypeDashboard.tsx` — Conditional leadgen rendering
- `src/pages/MetaAds.tsx` — Business-type-aware data fetching
- `src/pages/Insights.tsx` — Business type passed to analysis
- `src/pages/AdGenerator.tsx` — Business type passed to copy generation
- `src/pages/AdPublisher.tsx` — Dynamic defaults and conversion tracking
- `src/pages/AccountSettings.tsx` + `.css` — Business type selector UI
- `src/pages/admin/CreateOrganization.tsx` — Business type in create flow
- `src/pages/admin/OrganizationDetail.tsx` — Business type badge
- `src/pages/admin/AdminDashboard.tsx` — Mock data updated
- `src/pages/admin/OrganizationsList.tsx` — Mock data updated
- `api/admin/credentials.ts` — Backend org creation includes business_type

---

## 2026-03-05 — Add Results, Cost Per Result, Result Rate, and Lead to Result Rate metrics

### Overview
Added 4 new customizable dashboard metrics that match Meta Ads Manager's "Results" column. Results are automatically determined per campaign based on its objective (purchases for sales campaigns, leads for lead gen campaigns, etc.), giving users a unified view of campaign performance regardless of objective mix.

### Added
- **Results** — Objective-based result count per campaign, summed across all campaigns
- **Cost Per Result** — `spend ÷ results`
- **Result Rate** — `results ÷ link clicks × 100` (click-to-result conversion rate)
- **Lead to Result Rate** — `results ÷ leads × 100` (e.g., call booking rate from leads)

### Changed
- **`fetchCampaignSummaries`** now fetches campaign objectives in parallel (`/campaigns?fields=id,objective`) and maps each campaign's objective to its corresponding Meta action type
- Objective fetch is non-fatal — falls back to a heuristic (purchases → leads → LPV → link clicks) if the campaigns endpoint fails
- All 4 metrics are hidden by default in the dashboard customizer and can be toggled on via the gear icon

### Objective → Result Mapping
| Campaign Objective | Result Action Type |
|---|---|
| `OUTCOME_SALES` | `offsite_conversion.fb_pixel_purchase` |
| `OUTCOME_LEADS` | `lead` |
| `OUTCOME_TRAFFIC` | `landing_page_view` |
| `OUTCOME_ENGAGEMENT` | `post_engagement` |
| Unknown/missing | First non-zero: purchases → leads → LPV → link clicks |

### Files Modified
- `src/services/metaApi.ts` — Added `results` and `objective` to `CampaignSummary`, added `getResultActionType()` and `resolveResults()` helpers, modified `fetchCampaignSummaries` to fetch objectives in parallel
- `src/pages/Dashboard.tsx` — Added 4 new metrics to `DashboardStats`, `DEFAULT_METRICS`, icons, labels, periods, aggregation, calculation, and formatting

---

## 2026-03-04 — Fix empty Unique Customers — use account-level actions instead of unique_actions

### Overview
Unique Customers, CPA, AOV, and CVR all showed 0/empty because Meta's `unique_actions` field does **not** support conversion-type action types like `offsite_conversion.fb_pixel_purchase`. It only works for engagement actions (link clicks, post engagements, etc.). Switched to using account-level `actions` for purchase counts, which still deduplicates across campaigns but is actually supported by Meta's API.

### Fixed
- **Unique Customers** — Now reads from `actions` (not `unique_actions`) at the account level; data actually returns from Meta
- **CPA, AOV, CVR** — All cascade from Unique Customers, so all are restored

### Changed
- **Meta API fields** — Account-level insights now requests `reach,actions,unique_actions` (added `actions`); purchases parsed from `actions` array, link clicks still from `unique_actions` (which does support engagement types)

### Trade-off
Account-level `actions` counts total purchase events, not unique people. If one customer makes 3 purchases, it counts as 3. Meta does not offer unique-person purchase counts through their Marketing API. For most ad accounts this is a reasonable proxy.

### Files Modified
- `src/services/metaApi.ts` — Changed `fetchAccountLevelInsights` to request `actions` alongside `unique_actions`, parse purchases from `actions` array
- `src/pages/Dashboard.tsx` — Updated comments to reflect the data source accurately

## 2026-03-04 — Fix double-counted purchases with Meta unique_actions

### Overview
Meta's pixel fires a `purchase` event for both the initial order AND any upsell/downsell in the post-purchase sequence. One customer could generate 2+ purchase events, inflating counts and distorting AOV, CPA, and CVR. Fixed by using Meta's `unique_actions` at the account level (fully deduplicated across campaigns) for per-customer metrics.

### Fixed
- **AOV** — Now uses `totalRevenue / uniquePurchases` instead of `totalRevenue / totalPurchases` (revenue per unique customer, not per order)
- **CPA** — Now uses `adSpend / uniquePurchases` (cost per unique customer acquired)
- **CVR** — Now uses `uniquePurchases / landingPageViews` (% of visitors who become unique customers)
- **Unique Customers** — Now sourced from Meta `unique_actions` instead of Supabase funnel data; works for all users, not just super admins with funnel tracking

### Changed
- **Unique Customers visible by default** — Card now works for all users (Meta-derived), no longer hidden behind funnel-only gate
- **FUNNEL_ONLY reduced** — Only `sessions` remains funnel-only; `uniqueCustomers`, `aov`, `cac` removed from funnel-only sets in both Dashboard and ReportSettings
- **STATIC_PERIODS clarified** — Descriptions updated to distinguish "all purchase events" from "unique customers"

### Not Changed
- **Total Conversions** — Still shows all purchase events (including upsells), matching Meta's reporting
- **COGS per-unit** — Still uses total purchases (each order has COGS)
- **ROAS** — Revenue is correct as-is (includes all upsells)
- **ConversionIQ / MetaAds** — Completely independent, not affected

### Files Modified
- `src/services/metaApi.ts` — Added `uniquePurchases` to `AccountLevelInsights`, extracting from `unique_actions` for `offsite_conversion.fb_pixel_purchase`
- `src/pages/Dashboard.tsx` — Wired `uniquePurchases` into AOV/CPA/CVR calculations, updated visibility and labels
- `src/pages/ReportSettings.tsx` — Removed `uniqueCustomers`/`aov`/`cac` from `FUNNEL_ONLY` set

## 2026-03-04 — Fix dashboard metric accuracy, add COGS & Net Profit P&L

### Overview
Dashboard metrics were inaccurate for agencies managing multiple ad accounts because several key metrics (Unique Customers, AOV, CAC, Conversion Rate) depended on a Supabase `funnel_events` table specific to one user's funnel setup. Agencies don't have this data. All core metrics are now derived from Meta API data so any user/agency can build reports with confidence. Also adds a proper P&L breakdown with configurable COGS.

### Fixed
- **AOV** — Changed from funnel-based (unique customers) to Meta-based (`purchaseValue / purchases`)
- **CAC → CPA** — Changed from `adSpend / funnel uniqueCustomers` to `adSpend / Meta purchases`; renamed label to "CPA" (Cost Per Acquisition)
- **Conversion Rate** — Changed from funnel sessions to `purchases / landingPageViews` (Meta LPV metric, most accurate denominator)
- **Unique Link CTR** — Fixed from `uniqueLinkClicks / impressions` to `uniqueLinkClicks / reach` (Meta's actual definition)
- **Fee rate validation** — `loadTransactionFeeRate()` now validates localStorage values with `Number.isFinite` and range checks (0-1), preventing NaN/Infinity propagation
- **Per-account scoping** — Transaction fee rate and COGS config now use `scopedStorage` for per-ad-account isolation

### Added
- **COGS card** — Configurable Cost of Goods Sold with inline editor: toggle between $/unit and % of revenue modes
- **Gross Profit card** — Revenue minus COGS (standard accounting definition)
- **Net Profit card** — Revenue minus COGS minus Ad Spend minus Transaction Fees (true bottom line)
- **Transaction fee editor** — Inline configurable fee rate on the Transaction Fees card (default 2.9%)
- **Export support** — COGS and Gross Profit included in CSV/PDF exports

### Changed
- **"Net Profit" renamed to "Gross Profit"** then re-added as true Net Profit with correct formula
- **Unique Customers** hidden by default (funnel-only metric)
- **CPA** visible by default (replaces CAC, now Meta-derived)
- **FUNNEL_ONLY_METRICS** reduced from 4 to 2 (`uniqueCustomers`, `sessions`)

### Files Modified
- `src/pages/Dashboard.tsx` — Core metric calculations, COGS config helpers, inline editors, scoped storage, P&L card structure
- `src/pages/Dashboard.css` — Styles for `.fee-rate-editor`, `.fee-rate-input`, `.cogs-mode-select` inline editors
- `src/components/ExportMenu.tsx` — Added `cogs` and `grossProfit` format entries

## 2026-03-04 — Show only active ad accounts in switcher dropdown

### Changed
- **Removed "Available Accounts" section** — The ad account switcher dropdown now only shows activated ad accounts, not all available accounts from Meta Business Manager
- **Removed inline activation** — Users activate accounts via the Integrations page instead of inline in the dropdown. The "Manage Accounts" footer link remains for easy navigation
- **Simplified dropdown logic** — Dropdown only appears when 2+ active accounts exist; cleaned up unused activation state, error handling, and the `AvailableAccountRow` component

### Files Modified
- `src/components/AccountSwitcher.tsx` — Removed available accounts section, `AvailableAccountRow` component, activation logic, and unused imports

## 2026-03-04 — Rename billing section and remove promo code toggle

### Changed
- **Page title** — Renamed "Billing" to "Billing and Plans" on the billing page
- **Dropdown menu** — Renamed "Billing Details" to "Billing and Plans" in the user profile dropdown
- **Removed promo code toggle** — Removed the "I have a promo code" checkbox and hint text from the billing page; Stripe's native promo code field now always shows during checkout

### Files Modified
- `src/pages/Billing.tsx` — Updated title, removed `usePromoCode` state and promo toggle UI, always pass `true` to `redirectToCheckout`
- `src/pages/Billing.css` — Removed `.promo-code-toggle`, `.promo-toggle-label`, `.promo-toggle-hint` styles
- `src/components/UserProfileDropdown.tsx` — Updated dropdown label from "Billing Details" to "Billing and Plans"

## 2026-03-04 — Move ad account switcher to top bar with inline activation

### Overview
Relocated the ad account switcher from the sidebar to the global top bar so it's visible and accessible on every page. The dropdown now shows both active and available (not-yet-activated) accounts, allowing users to activate new ad accounts inline without navigating to the Integrations page. Data persistence, per-account scoping, and page-level re-fetches continue to work as before.

### Changed
- **Switcher moved to top bar** — Renders in the desktop header (left of profile dropdown) and mobile header (between hamburger and profile). Removed from sidebar.
- **Two-section dropdown** — "Active Accounts" (click to switch) and "Available Accounts" (click to activate inline). Seat limits are enforced; shows "Upgrade" link when at plan capacity.
- **Inline activation flow** — Activating an account calls the API, refreshes org meta credentials and account list, then auto-switches to the newly activated account.
- **Static label for single account** — When only one account is active and none are available, the switcher renders as a non-interactive label (no chevron or dropdown).
- **Fixed `activateAdAccount` return type** — Corrected from `Promise<AdAccountInfo>` to `Promise<{ success: boolean }>` to match the backend response.

### Files Modified
- `src/components/AccountSwitcher.tsx` — Rewritten for top-bar layout with active + available account sections and inline activation
- `src/components/AccountSwitcher.css` — Restyled for top-bar trigger, dropdown with available account rows, mobile bottom-sheet
- `src/components/MainLayout.tsx` — Added AccountSwitcher to desktop top-bar and mobile header
- `src/components/MainLayout.css` — Added gap to top-bar flex layout
- `src/components/Sidebar.tsx` — Removed AccountSwitcher import and rendering
- `src/contexts/AdAccountContext.tsx` — Extended with `availableAccounts`, `seatInfo`, `activateAccount()`, and `activatingAccountId`
- `src/services/metaApi.ts` — Exported `AvailableAdAccount` type; fixed `activateAdAccount` return type

## 2026-03-04 — Fix ad account switcher showing stale/incomplete data

### Overview
The sidebar account switcher was only showing 1 account with a yellow status dot, while the Integrations page showed 2 active accounts with green dots. Three root causes identified and fixed.

### Fixed
- **Missing accounts in switcher** — AdAccountContext now fetches the authoritative account list from `/api/meta/ad-accounts` after the initial cached load, ensuring newly activated accounts always appear.
- **Yellow vs green status mismatch** — AccountSwitcher now uses the same status color logic as the Integrations page: green when `page_id` is set (pixel_id is optional), amber when page is missing.
- **Silent query failure in status endpoint** — Added error handling for the `organization_ad_accounts` query in `/api/meta/status` so failures are captured in Sentry instead of silently returning an empty array.

### Files Modified
- `src/contexts/AdAccountContext.tsx` — Fetch fresh accounts from `/api/meta/ad-accounts` after cached load; compare fingerprints to detect data changes
- `src/components/AccountSwitcher.tsx` — Status color now checks `page_id` only (matches Integrations page logic)
- `api/meta.ts` — Added error handling for adAccounts query in handleStatus

## 2026-03-04 — Always-visible ad account switcher

### Overview
The AccountSwitcher component in the sidebar was only visible with 2+ activated ad accounts. Now renders whenever `currentAccount` exists, always showing which account is active.

### Changed
- **AccountSwitcher always visible** — Removed `isMultiAccount` render gate; appears whenever Meta is connected.
- **Dropdown list always includes current account** — Handles single-account and synthetic-default scenarios.
- **Dashboard/MetaAds subtitles** — Always show the active account name.

### Files Modified
- `src/components/AccountSwitcher.tsx` — Removed `isMultiAccount` gate, built `dropdownAccounts` list with fallback
- `src/pages/Dashboard.tsx` — Removed `isMultiAccount` guard on account name display
- `src/pages/MetaAds.tsx` — Removed `isMultiAccount` guard on account name display

## 2026-03-04 — Add re-authorize permissions and refresh available data for multi-account

### Overview
Addresses issues where users couldn't grant access to additional Facebook Pages or ad accounts after the initial OAuth connection. Adds a re-authorization flow, a lightweight refresh endpoint, and Graph API pagination to handle large Business Manager accounts.

### Added
- **"Update Permissions" button** on Integrations page — triggers OAuth re-flow with `auth_type=rerequest`, forcing the Facebook consent screen so users can re-select which pages and ad accounts the app can access.
- **"Refresh" button** in the ad account configure panel — re-fetches available pages and ad accounts from the Meta Graph API using the stored token (no re-OAuth needed). Syncs account metadata (name, currency, status) for activated accounts.
- **`refresh-available` backend route** (`api/meta.ts`) — paginated fetch of `me/adaccounts` and `me/accounts`, updates `organization_credentials.metadata`, and reconciles stale selections (clears ad_account_id/page_id/pixel_id if no longer in scope).
- **`refreshAvailableData()` frontend service** (`src/services/metaApi.ts`) — calls the new endpoint with JWT auth.
- **Empty state hint** in page dropdown — guides users to Refresh or Update Permissions when no pages are available.

### Fixed
- **Graph API pagination** in OAuth callback (`api/auth/meta/callback.ts`) — added `fetchAllPages<T>()` cursor-based pagination helper. Large Business Manager accounts with many ad accounts/pages now return complete lists instead of only the first page.
- **Migration upsert clarified** (`api/meta.ts`) — `ignoreDuplicates: true` (INSERT ON CONFLICT DO NOTHING) preserved intentionally: never overwrites user-configured page_id/pixel_id and never re-activates intentionally deactivated accounts.

### Files Modified
- `api/auth/meta/connect.ts` — Added `reauth` query param, sets `auth_type=rerequest`
- `api/auth/meta/callback.ts` — Added paginated `fetchAllPages()`, applied to ad accounts and pages fetch
- `api/meta.ts` — New `refresh-available` route with pagination, selection reconciliation, and account metadata sync; clarified migration upsert comments
- `src/pages/Integrations.tsx` — "Update Permissions" button, "Refresh" button, empty state hint, `handleReauthorize()` and `handleRefreshAvailable()` handlers
- `src/pages/Integrations.css` — Styles for reauthorize button, config refresh button, config empty hint, responsive support
- `src/services/metaApi.ts` — Added `refreshAvailableData()` function

## 2026-03-04 — Fix multi-ad-account switcher, data scoping, and UI cleanup

### Overview
Fixed three critical issues with the multi-ad-account feature: the account switcher dropdown was missing the original ad account, Dashboard/MetaAds pages didn't re-fetch data when switching accounts, and the switcher displayed raw account IDs.

### Fixed
- **Missing first account in switcher** — The primary ad account (from `organization_credentials`) wasn't always present in `organization_ad_accounts`, so it didn't appear in the dropdown. Backend status endpoint now auto-ensures it exists via upsert before querying.
- **Dashboard data bleeding between accounts** — `useEffect` dependency array was missing `currentAccount`, so switching accounts didn't trigger a data re-fetch. Fixed in both `Dashboard.tsx` and `MetaAds.tsx`.
- **Account ID visible in switcher** — Removed `act_XXXX` from the trigger button and dropdown items. Trigger now shows just account name; dropdown shows name + currency.

### Files Modified
- `api/meta.ts` — Auto-ensure primary credential's ad account exists in `organization_ad_accounts` on status fetch
- `src/pages/Dashboard.tsx` — Added `currentAccount?.ad_account_id` to data-loading useEffect dependency
- `src/pages/MetaAds.tsx` — Same useEffect dependency fix
- `src/components/AccountSwitcher.tsx` — Removed account ID display, cleaned up `truncateId` usage
- `src/components/AccountSwitcher.css` — Removed unused `.account-trigger-id` styles

## 2026-03-04 — Dashboard export & scheduled email reports

### Overview
Adds dashboard data export (CSV/PDF) and automated scheduled email reports. Agency owners and admins can now export their customized dashboard metrics on demand or configure recurring email reports at daily/weekly/monthly frequency — replacing the need for a VA to manually check every ad account. Includes cross-account breakdown reports for multi-account agencies. Addresses two rounds of Codex review findings (16 issues total).

### Added
- **ExportMenu component** — Dropdown on dashboard header with "Export CSV" and "Export PDF" options. Respects visible metrics, date range, and account selection. PDF uses html2canvas + jspdf (dynamically imported) with branded Convertra header.
- **Report Settings page** (`/reports`) — Full schedule management UI with create/edit form, frequency radio pills, day-of-week/month pickers, delivery time (user's timezone), metric selector (grouped by category, funnel-only metrics excluded), recipient email chips (max 10), comparison toggle, active/paused toggle, send test email, and report history table. Admin-only (hidden for member/viewer roles).
- **Backend report handlers** (`api/_lib/report-handlers.ts`) — 5 route handlers dispatched from `api/meta.ts`: schedule CRUD, server-side CSV export, manual/test email send, hourly cron, and history retrieval. All admin-gated with JWT auth.
- **Shared metrics module** (`api/_lib/metrics.ts`) — Server-side metric computation mirroring Dashboard.tsx, with paginated Meta API fetching (`paging.next`), date range helpers, CSV generation, and format utilities.
- **Database migration** (`supabase/migrations/010_report_schedules.sql`) — `report_schedules` and `report_history` tables with RLS policies, check constraints, unique constraint on (user_id, ad_account_id, frequency), and indexes for cron queries.
- **Hourly cron** — `vercel.json` entry for `/api/meta/report-cron` running every hour. Uses atomic `send_lock_until` lease for idempotency.
- **Branded HTML email template** — Inline-CSS email with Convertra header, metrics table with optional change column (green/red deltas), per-account breakdown for cross-account reports, and `List-Unsubscribe` header.
- **DST-safe timezone handling** — Stores `delivery_hour` in user's local timezone + IANA `timezone` string; computes `next_run_at` (UTC) using Intl API after each send.
- **Sidebar nav item** — "Reports" link with FileText icon, visible only to owner/admin roles.
- **Frontend types and API service** (`src/types/reports.ts`, `src/services/reportApi.ts`) — TypeScript interfaces and fetchJson-based API calls with JWT auth.

### Fixed (Codex review findings)
- **Request key mismatch** — Frontend now sends `id` for PUT/DELETE and `schedule_id` for test send, matching backend expectations
- **PUT recompute crash** — Schedule ownership query now selects all fields needed for `next_run_at` recomputation (frequency, delivery_hour, timezone, day_of_week, day_of_month)
- **Cross-account metric corruption** — Aggregation now uses raw `RawMetaData` fields instead of derived stats (was adding `cpc` rate to `totalClicks` count)
- **`last_3d` preset gap** — Added full support in `buildDateParamsForPreset`, `getPresetLabel`, and `getPreviousPeriodDates`
- **Unguarded GET endpoints** — Added `requireAdmin` check on GET schedule and GET history routes
- **Inaccurate history dates** — History records now store actual date range from preset via new `getPresetDateRange()` helper instead of today's date

### New Dependencies
- `html2canvas` — Client-side DOM-to-canvas for PDF export
- `jspdf` — PDF generation
- `resend` — Email delivery for scheduled reports (requires `RESEND_API_KEY` env var)

### Files Created
- `src/components/ExportMenu.tsx` + `ExportMenu.css`
- `src/pages/ReportSettings.tsx` + `ReportSettings.css`
- `src/types/reports.ts`
- `src/services/reportApi.ts`
- `api/_lib/metrics.ts`
- `api/_lib/report-handlers.ts`
- `supabase/migrations/010_report_schedules.sql`

### Files Modified
- `src/pages/Dashboard.tsx` — Added ExportMenu to header
- `src/App.tsx` — Added `/reports` route
- `src/components/Sidebar.tsx` — Added Reports nav item (admin-only)
- `api/meta.ts` — Added 5 report route dispatches
- `vercel.json` — Added hourly report-cron entry
- `package.json` — Added html2canvas, jspdf, resend dependencies

## 2026-03-04 — Fix unlimited ad account seats for Enterprise/VP tiers

### Overview
The `-1` sentinel value for unlimited ad account seats was broken across the entire multi-account feature. Enterprise and Velocity Partner tiers could not activate additional accounts, saw broken seat counts in the UI, and the multi-account card was hidden on the Integrations page.

### Fixed
- **Integrations multi-account gating** — `maxAdAccounts > 1` excluded `-1` (unlimited); now checks `> 1 || === -1`
- **Seat remaining calculation** — `seats - seatsUsed` produced negative values for `-1`; now returns `Infinity` for unlimited
- **Seat badge display** — Showed "2 of -1 seats"; now shows "2 seats · Unlimited"
- **Backend activation blocker** — `count >= seatLimit` was always true when `seatLimit = -1`; now skips check entirely for unlimited
- **Backend count query skip** — Unlimited tiers no longer run the unnecessary `SELECT COUNT(*)` query on every activation
- **Webhook seat values** — Enterprise was `10`, VP was `999`; both now `-1` to match frontend convention
- **Billing seat math** — `extraSeatsPaid` and `seatProgressPercent` calculations now guard against `seats === -1`
- **Migration 008 backfill** — Changed enterprise from `10` to `-1` and velocity_partner from `999` to `-1`

### Added
- **Migration 009** — One-time fix to set `ad_account_seats = -1` for existing enterprise/velocity_partner orgs stuck at legacy values

### Files Modified
- `src/pages/Integrations.tsx` — Multi-account gating, seat remaining calc, seat badge display
- `src/pages/Billing.tsx` — Extra seat and progress percent calculations
- `api/meta.ts` — Activation seat limit check with query skip for unlimited
- `api/billing/webhook.ts` — Consistent `-1` for unlimited tiers
- `supabase/migrations/008_agency_multi_account.sql` — Backfill values corrected
- `supabase/migrations/009_fix_unlimited_seats.sql` — New migration for existing orgs

## 2026-03-04 — Agency billing tier UI

### Overview
Adds the Agency plan to the Billing page with a 3-column pricing layout, ad account info on all plan cards, and a seat management card for agency+ tiers. Addresses two rounds of Codex review findings.

### Added
- **Agency standalone card** — New card between Small Business and Enterprise in the pricing grid with "For Agencies" holographic badge, Briefcase icon, and $249/mo pricing
- **3-column pricing grid** — Billing page now shows Small Business | Agency | Enterprise side-by-side on desktop
- **Ad account feature line** — All plan cards now show ad account allowance (e.g., "1 ad account", "3 ad accounts included (+$59/mo each)", "Unlimited ad accounts") sourced from `PLAN_LIMITS`
- **Seat management card** — Progress bar showing seats used/total, included vs extra seat breakdown with per-seat cost, "Manage Accounts" and "Manage in Stripe" buttons
- **`extraSeatPrice`** — New optional field on `PricingPlan` type; set on Pro ($49), Agency ($59), Enterprise ($99)
- **Responsive tablet layout** — At 1100px breakpoint, CSS `order` puts Small Business + Enterprise on row 1 and Agency centered on row 2 (avoids empty grid cell)

### Fixed
- **Free-tier badge fallback** — Added explicit `free` case to `getTierIcon()` and `getTierBadgeClass()` so free users don't inherit starter styling
- **`transition: all` violations** — Replaced all 6 instances in Billing.css with targeted property transitions to prevent browser crashes with base64 images
- **Extra seat cost calculation** — Uses paid seats (`ad_account_seats`) not active seats (`ad_account_seats_used`) for billing math
- **Unlimited tier seat card** — Checks `PLAN_LIMITS[tier].maxAdAccounts === -1` to correctly hide seat management for VP/Enterprise (backend uses 999, not -1)

### Files Modified
- `src/types/billing.ts` — Added `extraSeatPrice` to `PricingPlan`
- `src/services/stripeApi.ts` — Added `extraSeatPrice` to Pro, Agency, Enterprise plans
- `src/pages/Billing.tsx` — 3-column layout, Agency card, seat management, ad account features, free-tier fix
- `src/pages/Billing.css` — Agency styles, seat management styles, responsive breakpoints, transition fixes

## 2026-03-03 — Agency multi-ad-account support

### Overview
Adds full multi-ad-account support for agencies managing multiple client ad accounts under a single Meta Business Manager. One OAuth token powers all accounts; each account gets its own page/pixel config, isolated localStorage data, and seamless switching UX. Includes a new Agency billing tier ($249/mo base, 3 included accounts, $59/mo per extra seat, max 25 accounts).

### Added
- **`organization_ad_accounts` table** — Per-account page_id, pixel_id, status, and currency with RLS policies (`supabase/migrations/008_agency_multi_account.sql`)
- **Ad account seat tracking** — `ad_account_seats` and `ad_account_seats_used` columns on organizations, with plan-tier-based backfill in migration
- **Backend ad-accounts routes** — GET/POST `ad-accounts` in `api/meta.ts` for listing, activating, deactivating, and configuring accounts with seat limit enforcement
- **`AdAccountContext`** — React context (`src/contexts/AdAccountContext.tsx`) tracking current account, switch function, multi-account flag; subscribes to async meta load events via pub/sub
- **`scopedStorage`** — localStorage helper (`src/lib/scopedStorage.ts`) that appends ad account ID to keys for per-account data isolation, with lazy migration for single-to-multi upgrade
- **`AccountSwitcher`** — Sidebar dropdown (`src/components/AccountSwitcher.tsx`) between logo and nav for switching accounts; hidden for single-account orgs; supports collapsed/expanded sidebar modes
- **Switching overlay** — Semi-transparent overlay on main content during account switch with branded loading message
- **Multi-account Integrations UI** — Ad account activation/deactivation table, inline page/pixel configuration, seat badge, upgrade prompt when at capacity
- **Agency billing tier** — $249/mo (3 included accounts), added to `stripeApi.ts`, `billing.ts` types, `checkout.ts` price IDs, `webhook.ts` seat assignment, and `subscription.ts` limits
- **Account context indicators** — Dashboard and MetaAds page subtitles show current account name when multi-account is active
- **Meta credential change notifications** — `onOrgMetaChange` pub/sub in `metaApi.ts` so AdAccountContext reacts to async meta load completion

### Fixed
- **Conditional hook violation** — Moved early return in AccountSwitcher below useEffect to comply with Rules of Hooks
- **Frontend/backend contract mismatch** — Flattened `seats` response from nested object to flat `seats`/`seatsUsed`/`maxAccounts` fields
- **Organization type errors** — Made `ad_account_seats`/`ad_account_seats_used` optional on Organization interface to avoid breaking existing mock objects
- **Account switch data staleness** — Keyed `<Outlet>` by current account ID to force child route remount and data re-fetch on switch
- **Invalid ad account fallback** — `loadCredentials()` now throws when a requested ad account is not found/active instead of silently falling back
- **Deactivated accounts in list** — Backend filters ad accounts by `is_active = true`
- **Activation without validation** — Backend rejects activation of ad accounts not found in OAuth-provided available_accounts
- **Agency checkout blocked** — Added `agency` to plan tier validation whitelist in checkout.ts
- **Agency subscription limits** — Added `agency` to PLAN_LIMITS and tier typing in subscription.ts
- **Stale AdAccountContext** — Context now subscribes to meta credential load events instead of only reading synchronously on org ID change
- **Seat backfill gap** — Migration backfills `ad_account_seats` based on existing plan_tier so paid orgs aren't capped at 1

### Files Added
- `supabase/migrations/008_agency_multi_account.sql`
- `src/contexts/AdAccountContext.tsx`
- `src/lib/scopedStorage.ts`
- `src/components/AccountSwitcher.tsx`
- `src/components/AccountSwitcher.css`

### Files Modified
- `api/meta.ts` — ad-accounts routes, loadCredentials multi-account lookup, validation guards
- `api/billing/checkout.ts` — agency price IDs and tier whitelist
- `api/billing/webhook.ts` — seat count assignment by plan tier
- `api/billing/subscription.ts` — agency plan limits and tier type
- `src/App.tsx` — AdAccountProvider wrapping
- `src/components/MainLayout.tsx` — switching overlay, Outlet keyed by account
- `src/components/MainLayout.css` — overlay styles
- `src/components/Sidebar.tsx` — AccountSwitcher integration
- `src/pages/Integrations.tsx` — multi-account management UI
- `src/pages/Integrations.css` — ad account row, configure panel, upgrade prompt styles
- `src/pages/Dashboard.tsx` — account context indicator in subtitle
- `src/pages/MetaAds.tsx` — account context indicator in subtitle
- `src/pages/AdGenerator.tsx` — scoped localStorage
- `src/pages/AdPublisher.tsx` — scoped localStorage
- `src/pages/Insights.tsx` — scoped localStorage
- `src/pages/Products.tsx` — scoped localStorage
- `src/pages/SeoIQ.tsx` — scoped localStorage
- `src/services/metaApi.ts` — ad account CRUD functions, meta change notifications
- `src/services/imageCache.ts` — scoped localStorage
- `src/services/stripeApi.ts` — agency plan, tier ordering
- `src/types/organization.ts` — agency plan limits, OrganizationAdAccount type, optional seat fields
- `src/types/billing.ts` — agency PlanTier

---

## 2026-03-03 — Audience-aware copy generation with Schwartz awareness model

### Overview
Overhauled the ad copy generation system so Prospecting, Retargeting, and Retention audiences produce genuinely distinct copy. Previously, the three audience types shared only 3 short phrases each (`focus`, `tone`, `messaging`), causing retargeting copy to read nearly identical to prospecting copy. Now each audience type carries a rich prompt context based on Eugene Schwartz's levels of awareness model — with distinct hook strategies, body copy arcs, CTA approaches, anti-patterns, and concept-type modifiers.

### Added
- **Schwartz awareness level mapping** — Each audience maps to specific awareness stages: Prospecting (Levels 1-2: Unaware/Problem-Aware), Retargeting (Levels 3-4: Solution/Product-Aware), Retention (Level 5: Most Aware)
- **Rich `AUDIENCE_ANGLES` config** — Expanded from 3 fields to 13 fields per audience: `awarenessLevel`, `awarenessDescription`, `hookStrategy` (with example hooks), `bodyStructure` (step-by-step narrative arc for long-form), `bodyStructureShort` (condensed guidance for short-form), `ctaApproach`, `readerKnows[]`, `readerDoesNotKnow[]`, `antiPatterns[]`, `conceptShifts`
- **`CONCEPT_AUDIENCE_MODIFIERS` matrix** — 8 concept types x 3 audience types = 24 entries telling the model how to adapt each psychological angle (social proof, fear elimination, urgency, authority, etc.) per audience stage
- **Short-form body structure** — Separate `bodyStructureShort` field prevents conflicting instructions when generating max-125-char copy (the full 5-step narrative arc is only injected for long-form)
- **Audience-aware image generation** — Gemini and DALL-E prompts now include visual implication per audience (curiosity-driven imagery for prospecting, credibility-driven for retargeting, premium/exclusive for retention)
- **Audience-aware video generation** — Storyboard and Veo prompts include opening strategy per audience (lead with problem for cold, lead with product for warm, lead with VIP framing for customers)

### Fixed
- **Bracket placeholder leakage** — Replaced all `[product]`, `[Product Name]`, `[Y]`, `[reward]`, `[expert]`, `[Brand]` placeholders with natural language + "Use the actual product name from the product context" instructions to prevent literal bracket tokens from appearing in generated copy

### Files Modified
- `src/services/openaiApi.ts` — Expanded `AUDIENCE_ANGLES`, added `CONCEPT_AUDIENCE_MODIFIERS`, updated all 7 prompt injection sites (generateCopyOptions, regenerateSingleCopy, generateAudienceAdCopy, generateAdImageWithGemini, generateAdImageWithDallE, generateVideoStoryboard, generateAdVideoWithVeo)

---

## 2026-03-03 — Copy generation quality overhaul: anti-AI patterns, brand voice, and specificity

### Overview
Comprehensive overhaul of the AI copy generation prompts and post-processing to eliminate AI-sounding output, enforce brand voice matching from the user's ad account, and improve copy specificity. Changes span all three copy generation paths (generateCopyOptions, regenerateSingleCopyItem, generateAudienceAdCopy).

### Added
- **Banned AI phrase system** — Single source of truth (`BANNED_PHRASES`, `BANNED_PHRASES_PROMPT`, `BANNED_PHRASE_PATTERNS`) for 25+ cliche phrases that signal AI-written copy (e.g., "You're not broken", "Here's the thing", "Game-changer", "Plot twist:", "Your future self will thank you"). Used in both prompt instructions and post-processing sanitizer
- **`sanitizeCopyText()` function** — Shared post-processing sanitizer that strips em dashes, removes banned phrases, and validates output isn't degenerate (falls back to original text if cleaning strips too much)
- **Brand voice extraction** — New `brandVoice` field on `ChannelAnalysisResult` capturing tonality, sentence style, point of view, vocabulary level, rhythm/cadence, and distinctive traits from winning ads
- **Brand voice injection** — Full voice profile injected into copy generation context as "BRAND VOICE PROFILE (MATCH THIS VOICE)" with instruction to replicate the winning voice, not a generic ad copywriter tone
- **Winning body text preservation** — `topAds` now includes full `bodyText` from original ad data (attached during analysis post-processing alongside imageUrl). Copy generation prompt shows the complete body copy of top performers
- **Specificity rule** — Every headline and body text must include at least one concrete element (number, timeframe, named outcome, or mechanism)
- **Body copy structural framework** — Long-form follows a 5-step desire arc (hook, amplify, solution, proof, close); short-form leads with single strongest trigger
- **CTA specificity guidance** — Product name required in at least 2 CTAs; dead-zone CTAs like "Learn More" explicitly banned
- **Headline hook diversity** — Each of 6 headlines must use a different hook approach (questions, bold claims, numbers, metaphors, identity, before/after, pattern interrupts, direct benefits)
- **Exclamation mark limits** — Max 1 per body text, zero in headlines

### Fixed
- **Enforcement gap** — Prompt banned phrases and post-processing regex now use the same shared source of truth (previously the regex missed several phrases from the prompt list)
- **Degenerate output guard** — `sanitizeCopyText()` validates cleaned text has >= 3 chars and contains letters; falls back to original if sanitization would produce empty/broken output
- **`generateAudienceAdCopy` missing quality rules** — This actively-used function had zero banned phrase filtering, no brand voice, no post-processing. Now has full parity
- **Stale JSDoc comment** — Removed orphaned `/** Generate new ad copy based on winning elements */` left after function deletion

### Removed
- **`generateAdCopy()` function** — Dead code (exported but never imported anywhere in the repo). Had none of the quality rules and was a risk for accidental future use

### Files Modified
- `src/services/openaiApi.ts` — All changes in this single file: shared constants, sanitizer, type additions, prompt rewrites, post-processing consolidation, dead code removal

---

## 2026-03-02 — Add "Regenerate All Images" to CreativeIQ ad generator

### Overview
Added a bulk image regeneration feature that lets users regenerate the entire image set for an ad package without re-running copy generation. Two entry points: a "Regenerate All" button in the images section header, and a "Retry All Images" button in the error banner when all images fail.

### Added
- **`regenerateAllImages()` function** in `openaiApi.ts` — extracted from `generateAdPackage()` as a reusable export. Handles reference pre-computation, batched generation (MAX_CONCURRENT=2), memory cleanup, and error categorization
- **`onRegenerateAllImages` prop** on `GeneratedAdCard` — triggers bulk regeneration with loading overlay and button guards
- **"Regenerate All" button** in images section header, next to the Show/Hide Images toggle
- **"Retry All Images" button** inside error banner when image count is zero (full failure scenario)
- **Loading overlay** — dims the image grid and shows a centered spinner during bulk regeneration
- **`.spinning` CSS keyframes** — fixes pre-existing bug where `<Loader className="spinning">` had no animation
- **`variationCount` field** on `GeneratedAdPackage` — persists the original requested count so retries use the correct number
- **`indexedResults` return field** — position-preserving `(GeneratedImageResult | null)[]` array for per-slot merging on partial failures

### Fixed
- **Partial failures no longer shrink the image array** — failed slots are filled with existing images instead of being dropped
- **Retry count is deterministic** — uses `variationCount` from the original generation, not the UI slider or current image count
- **Silent failures now surface in UI** — catch block explicitly sets `imageError` on the ad state before rethrowing, ensuring the error banner always appears

### Files Modified
- `src/services/openaiApi.ts` — `regenerateAllImages()` extraction, `generateAdPackage()` refactored to call it, `variationCount` added to `GeneratedAdPackage` interface and both return paths
- `src/pages/AdGenerator.tsx` — `handleRegenerateAllImages` callback, wired `onRegenerateAllImages` prop
- `src/components/GeneratedAdCard.tsx` — new prop, state, handler, button placements, overlay, guards
- `src/components/GeneratedAdCard.css` — `.images-section-actions`, `.regenerate-all-btn`, `.images-grid-wrapper`, `.regenerating-all-overlay`, `.images-grid-dimmed`, `.retry-all-btn`, `.spinning` keyframes, responsive styles

---

## 2026-03-02 — Add Gemini model fallback and improve image generation resilience

### Overview
Image generation was failing due to `gemini-3-pro-image-preview` experiencing high API failure rates (~45% during peak hours). Added automatic model fallback, separated text analysis from image models, and improved error classification to prevent unnecessary retries on safety-blocked prompts.

### Added
- **Fallback image model** (`gemini-3.1-flash-image-preview`) — automatically tried when the primary model fails with transient errors (429, 500, 503)
- **`SafetyBlockError` class** — non-retryable error type for safety/policy blocks that fail fast without attempting fallback models
- **Explicit safety finish reason classification** — `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `IMAGE_SAFETY` fail fast; other unexpected finish reasons (e.g. `OTHER`, `LANGUAGE`) are treated as retryable
- **Serialization error handling** in `analyzeReferenceImages` — catches `RangeError` from large base64 payloads and gracefully falls back to default analysis
- **Diagnostic logging** — failure counts, per-image error messages, and model names logged for troubleshooting

### Changed
- **`analyzeReferenceImages`** now uses `gemini-2.5-flash` (text model) instead of the image model, with automatic fallback to `gemini-3-pro-image-preview` if the text model is unavailable
- **`generateAdImageWithGemini`** rewritten with dual-model fallback loop (5 retries per model with exponential backoff up to 15s)
- **Error messages in `generateAdPackage`** now categorize failures (overloaded, safety-blocked, quota, permissions, memory) with specific user-facing guidance

### Files Modified
- `src/services/openaiApi.ts` — Model constants, `SafetyBlockError` class, `analyzeReferenceImages` model fallback + serialization guard, `generateAdImageWithGemini` dual-model cascade, `generateAdPackage` error diagnostics

---

## 2026-03-02 — Fix copy regeneration returning identical text

### Overview
Fixed a critical bug where the copy regeneration feature returned identical text instead of new content. The root cause was GPT-5.2's high reasoning effort mode being too deterministic — given the same prompt context, the model converged on the same output every time.

### Fixed
- **Identical output on regeneration** — Forced `reasoning_effort: 'low'` for all regeneration calls (high effort caused deterministic convergence). Added random creative direction hints (12 different angles) injected into each prompt to break model determinism. Added dedup-with-retry loop (up to 3 attempts) that detects duplicate output and retries with stronger differentiation instructions.
- **Silent duplicate acceptance** — Final retry attempt now hard-fails with a user-visible error if all attempts return duplicate text, instead of silently returning the same copy.
- **Misleading API contract** — Removed unused `reasoningEffort` parameter from `regenerateSingleCopy()` config type since it's always forced to `'low'`. Added doc comment explaining the design decision.

### Files Modified
- `src/services/openaiApi.ts` — Rewrote `regenerateSingleCopy()` with low reasoning effort, random creative directions, and dedup retry loop

---

## 2026-03-02 — Add individual copy regeneration to CreativeIQ

### Overview
Added the ability to regenerate individual headlines, body texts, and CTAs in the copy selection step (Step 2) without regenerating the entire batch. Users can now iterate on specific copy items they don't like while keeping the ones they love, then mass-publish the full set to their Meta ad account.

### Added
- **`regenerateSingleCopy()` function** in `openaiApi.ts` — generates a single replacement copy item using the same prompt context (audience, concept, analysis data, variation level, product context, inspirations) with a "DO NOT DUPLICATE" list of existing items
- **Regenerate button** (RefreshCw icon) on each headline, body copy, and CTA option in the CopySelectionPanel
- **Loading overlay** with spinner on the specific item being regenerated
- **Selection preservation** — if the regenerated item was selected, the new replacement stays selected
- **Navigation blocking** — Back and Continue buttons disabled during regeneration to prevent stale async overwrites

### Changed
- `CopySelectionPanel.tsx` — added 4 new optional props (`onRegenerateHeadline`, `onRegenerateBodyText`, `onRegenerateCTA`, `regeneratingCopyId`), wrapped each option in a flex container with the regenerate button
- `CopySelectionPanel.css` — added styles for `.copy-option-wrapper`, `.cta-option-wrapper`, `.copy-regenerate-btn`, `.copy-regenerating-overlay`, `.copy-regen-spinner`
- `AdGenerator.tsx` — added `regeneratingCopyId` state, `handleRegenerateCopy` handler with stable callback wrappers, conditional prop passing (only for `copySource === 'generate'`)

### Fixed
- **Duplicate output bug** — Regeneration was passing all existing items (including the one being replaced) to the AI's "do not duplicate" list, over-constraining the prompt and causing it to return the same text. Fixed by filtering out the item being replaced and passing its text explicitly as context with instructions to use a completely different angle.
- **Stale error banner** — Error messages from failed regeneration attempts now clear at the start of each new attempt instead of persisting after a subsequent success.


### Design Decisions
- Regenerate buttons hidden in import and manual copy modes (only shown for AI-generated copy)
- All regenerate buttons disabled while any item is regenerating (prevents concurrent API calls)
- Uses `maxTokens: 500` (vs 3500 for full batch) since only one item is generated
- Collision-proof IDs use `{prefix}{n}_{timestamp}` pattern (e.g., `h7_1709398765432`)
- Old item's text passed as `itemToReplace` with strong instructions to generate a different angle/hook

### Files Modified
- `src/services/openaiApi.ts` — Added `regenerateSingleCopy()` export with `itemToReplace` context
- `src/components/CopySelectionPanel.tsx` — Added regenerate buttons, loading overlay, new props
- `src/components/CopySelectionPanel.css` — Added wrapper, button, overlay, and spinner styles
- `src/pages/AdGenerator.tsx` — Added state, handler, callbacks, prop wiring, navigation guards, error clearing

---

## 2026-03-02 — Hide cost estimates and model/provider names from UI

### Overview
Removed all user-visible estimated generation costs, model names (GPT, Gemini, Veo, DALL-E, OpenAI), and per-second pricing from the CreativeIQ ad generator and generated ad cards. Users should not see backend implementation details or cost information.

### Removed
- **Estimated cost display** (💰 section) before the generate button in AdGenerator
- **Video cost estimate display** (🎬 per-second pricing) in video configuration
- **Per-model cost/sec** line from video quality selector buttons
- **Video model badge** ("Veo Fast" / "Veo Standard") and **estimated cost badge** from generated video cards
- **`calculateCost` function** and `costEstimate` state variable (now unused)
- **Dead CSS** for `.cost-estimate`, `.cost-icon`, `.cost-text`, `.cost-note`, `.video-cost-estimate` and their responsive overrides

### Changed
- **Video ad type button** text from "Generate with Veo 3.1" → "Generate AI video"
- **Video quality option name** from "Veo 3.1" → "Standard"
- **Progress message** from "generating video with Veo Standard..." → "generating video..."
- **Video `whyItWorks` text** removed "with Veo 3.1 (standard)" mention
- **17 error messages** in `openaiApi.ts` sanitized to remove model/provider names (e.g., "Gemini API error" → "Image generation error", "OpenAI API key not configured" → "AI API not configured")
- **Startup console logs** that print model names now wrapped in `import.meta.env.DEV` guard so they only appear in local development, not in production

### Files Modified
- `src/pages/AdGenerator.tsx` — Removed cost UI, unused import, model name references in progress text
- `src/pages/AdGenerator.css` — Removed dead CSS for cost estimate components
- `src/components/GeneratedAdCard.tsx` — Removed video model and cost badges
- `src/services/openaiApi.ts` — Sanitized all error messages, renamed model option, dev-gated startup logs, updated whyItWorks text

---

## 2026-03-02 — Add retry logic for transient image generation API errors

### Overview
Image generation was failing immediately on transient 503 (Service Unavailable) errors with no retry. Unlike the Meta API which already had exponential backoff retry logic, a single temporary outage would surface as a hard failure to the user.

### Fixed
- **Retry with exponential backoff** for transient errors (429, 500, 503) — up to 3 retries with 2s, 4s, 8s delays before failing
- **Friendlier error message** for 503/500 errors — users now see "Image generation service is temporarily unavailable. Please try again in a few minutes." instead of the raw API status code

### Files Modified
- `src/services/openaiApi.ts` — Added retry loop in image generation and 503/500 error case in `generateAdPackage()` error handler

---

## 2026-03-02 — Add Copy Variation Level slider to CreativeIQ ad generator

### Overview
When generating ad copy, the output was consistently similar because the prompt heavily pushes the AI to replicate winning patterns from channel analysis. Users who want to test genuinely different copy angles had no way to control this. A new "Copy Variation Level" slider (matching the existing image "Creative Variation Level" slider) gives users control over how closely the AI follows existing winning patterns vs. explores new creative territory.

### Added
- **Copy Variation Level slider** in Step 1 of the ad generator (below Body Copy Length), visible when copy source is "Generate New"
- **5-tier prompt instruction system** in `openaiApi.ts` that maps the 0-100 slider value to specific prompt blocks controlling AI copy behavior
- **Context-aware labels**: With channel analysis data, tiers are "Pattern Match → Fresh Wording → Balanced Mix → New Angles → Bold & Different". Without analysis, tiers shift to "Conservative → Slightly Creative → Balanced → Creative → Experimental"
- **Summary card** in Step 3 showing the selected copy variation tier and percentage
- **Modulated task instructions**: The headline, body copy, and CTA generation instructions in the user prompt adapt based on variation level (low = mirror patterns, mid = blend with experiments, high = explore new territory)

### Files Modified
- `src/pages/AdGenerator.tsx` — Added `copyVariationValue` state, slider UI, API parameter passthrough, Step 3 summary card
- `src/services/openaiApi.ts` — Added `copyVariationLevel` config parameter, `getCopyVariationInstructions()` function (10 prompt tiers: 5 with analysis × 5 without), injected into system prompt and modulated task section

---

## 2026-03-02 — Fix unreplaced template variables leaking into outreach emails

### Overview
Follow-up emails sent via Instantly (and direct SMTP) were rendering raw template placeholders like `{different_angle}` as literal text to recipients. The `_build_followup_body()` function only replaced `{first_name}` and `{sender_first_name}`, so any other `{variable}` tokens in the template passed through to the final email.

### Fixed
- **Instantly push path** (`instantly.py`): Added `_clean_email_body()` safety net that strips any unreplaced `{variable}` placeholders and cleans up resulting whitespace before pushing email bodies to Instantly campaigns. Applied to both the initial email body and the follow-up body.
- **SMTP send path** (`mailer.py`): Same placeholder stripping applied to the direct Gmail SMTP sender so no template variables leak regardless of send method.
- The regex is careful to only match `{single_brace}` patterns (template variables) and not `{{double_brace}}` patterns (Instantly's own custom variables).

### Files Modified
- `ops/convertra-leads/modules/instantly.py` — Added `_strip_unreplaced_placeholders()`, `_clean_email_body()`, applied to `_build_followup_body()` and `push_leads()`
- `ops/convertra-leads/modules/mailer.py` — Added placeholder stripping to `send_email()`

---

## 2026-02-28 — Add Support links in sidebar and profile dropdown

### Overview
The feedback widget is now more discoverable. "Support" and "Support & Feedback" links in the sidebar footer and user profile dropdown open the floating feedback widget when clicked, using a custom DOM event (`open-feedback-widget`) for cross-component communication.

### Added
- **Sidebar "Support" button**: Secondary/utility nav item in the sidebar footer (above collapse toggle). Uses muted styling to differentiate from primary navigation. Shows chat bubble icon + "Support" label (icon-only when collapsed).
- **User dropdown "Support & Feedback" item**: Added between "Billing Details" and "Sign Out" in the profile dropdown menu.
- **Custom event listener** in `FeedbackWidget.tsx`: Listens for `open-feedback-widget` custom event to allow external triggering.

### Fixed
- **CSS `transition: all` violation** in `Sidebar.css`: Replaced `transition: all 0.2s ease` on `.collapse-toggle` with specific properties (`background-color`, `color`) to prevent browser crashes when base64 images render.

### Files Modified
- `src/components/FeedbackWidget.tsx` — Added custom event listener for external triggering
- `src/components/Sidebar.tsx` — Added Support button in footer
- `src/components/Sidebar.css` — Added `.sidebar-support-btn` styles, fixed `transition: all`
- `src/components/UserProfileDropdown.tsx` — Added "Support & Feedback" menu item

---

## 2026-02-28 — Add user feedback pipeline with auto plan generation

### Overview
Users can now submit feature requests and bug reports via a floating widget in the app. Submissions are stored in Supabase and can be automatically processed by a cron script that invokes Claude Code CLI to generate implementation plans for each item. This creates a feedback-to-plan pipeline where users submit overnight and plans are ready for review in the morning.

### Added
- **Floating feedback widget** (`FeedbackWidget.tsx`): Bottom-right chat-style button on all protected pages. Opens a panel with "Feature Request" and "Bug Report" tabs, title/description inputs, and submit button. Responsive, accessible, on-brand styling.
- **Backend API routes** in `api/seoiq.ts`: 5 new handlers — `feedback-submit` (JWT auth), `feedback-list` (admin-only), `feedback-update` (admin-only), `feedback-pending` (shared secret), `feedback-script-update` (shared secret). Fail-closed auth on script endpoints.
- **Frontend API service** (`feedbackApi.ts`): Submit, list, and update functions with Supabase auth header injection.
- **Supabase migration** (`007_user_feedback.sql`): `user_feedback` table with status workflow (`pending` → `planning` → `planned` → `approved`/`rejected` → `built`), indexes, and RLS policies.
- **Cron script** (`scripts/process-feedback.sh`): Fetches pending feedback, invokes `claude -p` for each item to generate implementation plans as markdown files in `feedback/plans/`. Includes launchd plist template for macOS scheduling.
- **Vercel rewrite**: `/api/feedback/*` → `api/seoiq.ts` catch-all (stays within 12-function limit).
- **TypeScript types** (`feedback.ts`): `UserFeedback`, `SubmitFeedbackRequest`, `FeedbackType`, `FeedbackStatus`.

### Security
- Script endpoints (`feedback-pending`, `feedback-script-update`) fail closed — return 500 if `FEEDBACK_SCRIPT_SECRET` is not configured
- Request body type validation on title/description fields
- Curl responses logged on failure instead of silently swallowed

### Files Created
- `src/components/FeedbackWidget.tsx` — Floating widget component
- `src/components/FeedbackWidget.css` — Widget styles
- `src/services/feedbackApi.ts` — Frontend API service
- `src/types/feedback.ts` — TypeScript types
- `scripts/process-feedback.sh` — Cron script for auto plan generation
- `supabase/migrations/007_user_feedback.sql` — Database migration
- `feedback/plans/.gitkeep` — Plan output directory

### Files Modified
- `api/seoiq.ts` — Added 5 feedback route handlers (~200 lines)
- `vercel.json` — Added `/api/feedback/:path` rewrite
- `src/components/MainLayout.tsx` — Mounted FeedbackWidget
- `.gitignore` — Added `feedback/plans/*.md`

---

## 2026-02-28 — Add 24 Facebook Ads metrics to customizable dashboard

### Overview
Users requested lead gen metrics (leads, cost per lead) and other standard Facebook Ads metrics on their dashboard. Previously the dashboard only showed ecommerce-focused metrics. This adds 24 new optional metric cards covering leads, clicks, awareness, engagement, funnel events, and video — all hidden by default, enabled via the dashboard customizer.

### Added
- **Lead metrics**: Leads, Cost Per Lead, Lead Rate
- **Click metrics**: Link Clicks, CPC (All Clicks), Cost Per Link Click, Unique Link Clicks, Cost Per Unique Link Click, Link CTR, Unique Link CTR
- **Awareness metrics**: Impressions, Reach, CPM, Frequency
- **Engagement metrics**: Post Engagements, CPE (Cost Per Engagement)
- **Funnel metrics**: Landing Page Views, Cost Per LPV, Add to Cart, Cost Per Add to Cart, Initiate Checkout, Cost Per Checkout
- **Video metrics**: Video Views (3-sec), Cost Per Video View
- **Account-level insights fetch** (`fetchAccountLevelInsights`): Reach and unique link clicks are fetched at account level to avoid double-counting users across campaigns
- **Precise currency formatter** (`formatCurrencyPrecise`): Cost-per metrics use 2 decimal places so sub-dollar values (e.g. $0.43 CPC) display correctly

### Fixed
- **Reach/unique link click double-counting**: These unique-user metrics are now fetched at account level instead of summing campaign-level values
- **Video views label accuracy**: Changed from "ThruPlay" to "3-sec" to match the actual `video_view` action type

### Files Modified
- `src/services/metaApi.ts` — Extended CampaignSummary interface, added action extraction helpers, added `fetchAccountLevelInsights()`
- `src/pages/Dashboard.tsx` — 24 new metrics in all config maps, account-level fetch, precise currency formatter

---

## 2026-02-28 — Fix billing webhook crash & subscription gate blocking new subscribers

### Overview
A `RangeError: Invalid time value` in the Stripe billing webhook (`customer.subscription.created` handler) was crashing the entire webhook when `current_period_start`/`current_period_end` were missing or non-numeric on the subscription object. This prevented period dates from being written to the organization record, which caused the frontend `SubscriptionGate` to treat newly subscribed users as "trial expired" — blocking app access and forcing them to re-authorize their Meta account.

### Fixed
- **Safe Stripe timestamp parsing** (`webhook.ts`): Added `safeTimestampToISO()` helper that validates timestamps are finite numbers before calling `Date.toISOString()`, returning `null` instead of throwing `RangeError`.
- **Period date extraction with trial fallback** (`webhook.ts`): Added `extractPeriodDates()` helper that extracts `current_period_start`/`end` with a fallback to `trial_start`/`trial_end` for trialing subscriptions only.
- **Applied safe parsing to all 3 webhook handlers** (`webhook.ts`): `checkout.session.completed`, `customer.subscription.created`, and `customer.subscription.updated` now use the safe helpers instead of raw `new Date((sub as any).current_period_start * 1000).toISOString()`.
- **Conditional period date updates** (`webhook.ts`): Period dates use conditional spread (`...(periods.start ? { ... } : {})`) so null dates don't overwrite existing valid values.
- **Bounded grace period for new trials** (`OrganizationContext.tsx`): If a subscription is `trialing` but `current_period_end` is missing (webhook sync delay), grant access for up to 10 minutes after `updated_at`, then fail closed.

### Files Modified
- `api/billing/webhook.ts` — Safe timestamp helpers, applied to all subscription event handlers
- `src/contexts/OrganizationContext.tsx` — 10-minute grace window for trialing subscriptions without period dates

---

## 2026-02-27 — Remove temperature from OpenAI calls (reasoning_effort compatibility)

### Overview
GPT-5.2 with `reasoning_effort` only supports `temperature=1` (the default). Now that `reasoning_effort: "high"` is sent in every request (PR #254), custom temperature values at call sites caused API errors. This removes `temperature` from the `callOpenAI`/`callOpenAIWithVision` function signatures and all 8 call sites. The Gemini API call in `analyzeReferenceImages()` retains its own temperature since it's a separate API.

### Fixed
- **Removed `temperature` from function signatures** (`openaiApi.ts`): Eliminated from both `callOpenAI()` and `callOpenAIWithVision()` option types to prevent silent no-op configuration.
- **Removed `temperature` from all call sites** (`openaiApi.ts`): 8 callers were passing values between 0.3–0.85 that were silently ignored or caused API errors.

### Files Modified
- `src/services/openaiApi.ts` — Removed temperature from signatures and all OpenAI call sites

---

## 2026-02-27 — Remove IQ selector, wire reasoning_effort into OpenAI API

### Overview
The ConversionIQ Level selector (IQ Standard / IQ Deep / IQ Maximum) was never actually sending the `reasoning_effort` parameter to the OpenAI API — all three levels produced identical results. This removes the selector UI entirely and hardcodes `reasoning_effort: "high"` so users get better output quality by default.

### Changed
- **Wired `reasoning_effort` into API calls** (`openaiApi.ts`): Both `callOpenAI()` and `callOpenAIWithVision()` now send `reasoning_effort: "high"` in the Chat Completions request body. Previously the parameter was accepted but silently discarded.
- **Default reasoning level upgraded** (`openaiApi.ts`): Changed `DEFAULT_REASONING_EFFORT` from `'medium'` to `'high'` for deeper creative analysis.

### Removed
- **IQ Selector component** (`IQSelector.tsx`, `IQSelector.css`): Deleted the 3-option selector UI and all associated CSS (280 lines).
- **IQ Selector from AdGenerator** (`AdGenerator.tsx`): Removed from Step 1 config section.
- **IQ Selector from Insights** (`Insights.tsx`): Removed from above the "Run Analysis" button.
- **IQ Selector from AdAnalysisPanel** (`AdAnalysisPanel.tsx`): Removed from the analysis start section; simplified loading text.
- **Exported constants** (`openaiApi.ts`): Deleted `IQ_LEVELS`, `USER_IQ_LEVELS`, and unexported `ReasoningEffort` type — no longer needed externally.

### Files Modified
- `src/services/openaiApi.ts` — Wired `reasoning_effort`, removed IQ level config (~65 lines deleted)
- `src/pages/AdGenerator.tsx` — Removed IQ selector and `iqLevel` state
- `src/pages/Insights.tsx` — Removed IQ selector, simplified loading message
- `src/components/AdAnalysisPanel.tsx` — Removed IQ selector, simplified loading text
- `src/components/IQSelector.tsx` — Deleted
- `src/components/IQSelector.css` — Deleted

---

## 2026-02-27 — Fix Veo params: remove personGeneration, add negativePrompt

### Overview
The `personGeneration: 'allow_adult'` parameter was being rejected by the Gemini API with a 400 error. This parameter is documented in the **Vertex AI** docs but is **not supported** by the Gemini API (`generativelanguage.googleapis.com`) that this codebase uses. This is the 4th time this parameter has been toggled (PRs #250-#252) due to confusion between the two APIs.

### Fixed
- **Removed `personGeneration: 'allow_adult'`** (`openaiApi.ts`): Gemini API rejects this with "allow_adult for personGeneration is currently not supported." Only the Vertex AI endpoint accepts it.
- **Added `negativePrompt`** (`openaiApi.ts`): Replaced with a supported parameter for basic quality control (`'blurry, low quality, distorted, watermark'`). Does not include "text overlay" since the positive prompt requests text overlays.
- **Added Gemini vs Vertex AI documentation** (`openaiApi.ts`): Clear comment explaining that Vertex AI docs list params (`personGeneration`, `enhancePrompt`, `generateAudio`, `sampleCount`, `seed`) that the Gemini API rejects.

### Veo 3.1 Gemini API — Confirmed Working Parameters (Updated)
```json
{
  "instances": [{ "prompt": "..." }],
  "parameters": {
    "aspectRatio": "9:16",
    "durationSeconds": 8,
    "resolution": "720p",
    "negativePrompt": "blurry, low quality, distorted, watermark"
  }
}
```

### Confirmed Rejected by Gemini API (Vertex AI only)
`personGeneration`, `enhancePrompt`, `generateAudio`, `sampleCount`, `seed`, `numberOfVideos`, `inlineData`

### Files Modified
- `src/services/openaiApi.ts` — Veo request parameters, documentation comments

---

## 2026-02-27 — Fix Veo 3.1 video generation: correct API parameters from SDK source

### Overview
Comprehensive fix for Veo 3.1 video generation. The official Gemini API docs are inconsistent with what the API actually accepts — parameter names, types, and supported values documented on the website differ from the runtime behavior. All parameter names and types were sourced directly from Google's official SDK function [`_GenerateVideosConfig_to_mldev`](https://github.com/googleapis/python-genai/blob/main/google/genai/models.py) which maps Python config to the actual Gemini REST API request body.

### Fixed
- **Removed unsupported `inlineData` image passing** (`openaiApi.ts`): Veo 3.1 rejects base64 image data. First-frame image generation step also removed (saves an API call).
- **`durationSeconds` as number** (`openaiApi.ts`): API rejects strings — must be a number (`8` not `"8"`).
- **`personGeneration: 'allow_adult'`** (`openaiApi.ts`): Correct enum value from SDK (not `'allow_all'`).
- **Removed `numberOfVideos`** — REST param name is `sampleCount` (SDK maps `number_of_videos` → `sampleCount`), and it's rejected by `veo-3.1-generate-preview` for text-to-video.
- **Removed `enhancePrompt`** — rejected by `veo-3.1-generate-preview` despite being in SDK.
- **Consolidated to single Veo model** (`openaiApi.ts`): `veo-3.1-fast-generate-preview` is not in official docs. Both fast/standard now use `veo-3.1-generate-preview`. UI shows single "Veo 3.1" option with $0.40/sec.
- **Enforced 1080p → 8s duration** (`openaiApi.ts`): API requires 8s for 1080p/4k. Auto-coerced consistently across request, prompt, metadata, and cost.
- **Unified duration/cost across all code paths** (`openaiApi.ts`, `AdGenerator.tsx`).

### Veo 3.1 Gemini API — Confirmed Working Parameters (Superseded)
> **Note**: `personGeneration` was later found to be rejected by the Gemini API. See entry above for the corrected parameter list.

### Confirmed Rejected by veo-3.1-generate-preview
`inlineData`, `numberOfVideos`, `enhancePrompt`, `generateAudio`, `seed`, `personGeneration`

### Files Modified
- `src/services/openaiApi.ts` — Veo request parameters, model constants, duration enforcement, cost calculation
- `src/pages/AdGenerator.tsx` — Single-model cost, duration enforcement, `videoResolution` param

---

## 2026-02-27 — Fix Veo 3.1 inlineData rejection for image-to-video

### Fixed
- **Removed unsupported `inlineData` image passing from Veo API request** (`openaiApi.ts`): Veo 3.1 on the Gemini API rejects base64 image data with `"inlineData isn't supported by this model"`. The code was generating a first-frame image with Gemini and passing it via `instance.image.inlineData`, which caused a `400 INVALID_ARGUMENT` error on every video generation attempt. Text-to-video is now used instead.
- **Removed unnecessary first-frame image generation step** (`openaiApi.ts`): The `generateAdImage()` call that produced a first-frame image for image-to-video is no longer executed, saving an API call and reducing generation time.
- **Fixed inflated video cost estimate** (`AdGenerator.tsx`): Removed the `$0.01 firstFrameCost` from `calculateCost()` since first-frame image generation is no longer performed. Video cost is now `costPerSec × duration × variationCount` without the extra charge.
- **Updated stale comments** referencing "auto first-frame" and image-to-video capabilities that no longer apply.

### Files Modified
- `src/services/openaiApi.ts` — Removed `inlineData` image passing, first-frame generation, `firstFrameImage`/`referenceImages` params from `generateAdVideoWithVeo()`, and related GC cleanup
- `src/pages/AdGenerator.tsx` — Removed `firstFrameCost` from video cost calculation

---

## 2026-02-27 — Fix Chrome crash in AdPublisher from transition: all with base64 images

### Fixed
- **Replaced 11 `transition: all` declarations in AdPublisher.css** — When base64 images (1-5MB each) load into the DOM, `transition: all` forces Chrome to recalculate every CSS property on every frame, causing paint storms, UI freezes, and browser crashes. Each instance now targets only the specific properties that change on hover (e.g., `background-color`, `border-color`, `box-shadow`). Same root cause as PRs #181 and #182.
- **Added CSS containment to `.ads-grid`** — `contain: layout style` isolates paint context so layout recalculations from base64 image rendering don't propagate to surrounding elements.
- **Added blob URL cleanup on unmount in GeneratedAdCard** — Video blob URLs created by `URL.createObjectURL()` are now revoked when the component unmounts, preventing memory leaks across navigation.
- **Added blob URL cleanup before video regeneration** — Old video blob URLs are revoked before generating a replacement, preventing accumulation during regenerate cycles.

### Files Modified
- `src/pages/AdPublisher.css` — 11x `transition: all` replaced, `.ads-grid` containment added
- `src/components/GeneratedAdCard.tsx` — Blob URL cleanup on unmount + before regenerate

---

## 2026-02-27 — Fix Veo 3.1 referenceImages API error

### Fixed
- **Removed unsupported `referenceImages` parameter from Veo API request** (`openaiApi.ts`): Veo 3.1 models (`veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`) do not support the `referenceImages` parameter, causing a `400 INVALID_ARGUMENT` error on every video generation attempt. Product context is already conveyed via the text prompt, so visual guidance still reaches the model without structured image references.

### Files Modified
- `src/services/openaiApi.ts` — Removed `parameters.referenceImages` assignment in `generateAdVideoWithVeo()`

---

## 2026-02-27 — Veo 3.1 video ad generation + Meta video publishing

### Overview
Full video ad generation pipeline using Google Veo 3.1, from creative generation through Meta publishing. Users can now generate video ads alongside image ads in CreativeIQ, preview multi-variation results, and publish mixed image+video ad sets to Meta in a single batch.

### Added
- **Veo 3.1 video engine** (`openaiApi.ts`): Rewrote `generateAdVideoWithVeo()` with hook-first prompt engineering, product context injection, channel analysis deep integration, image-to-video support, ad library inspirations, UGC audio cues, and configurable model/duration/aspect/resolution
- **Video config types** (`openaiApi.ts`): `VideoAspectRatio`, `VideoDuration`, `VideoResolution`, `VideoModel`, `VideoConfig` with option arrays and defaults
- **Multi-variation video generation** (`openaiApi.ts`): `generateAdPackage()` video branch supports up to 3 serial variations with auto first-frame image generation and memory cleanup
- **Video config UI** (`AdGenerator.tsx`): Format (16:9/9:16), duration (5-8s), quality (fast $0.15/s vs standard $0.40/s) selectors with per-video cost display
- **Multi-video display** (`GeneratedAdCard.tsx`): Loop rendering with resolution/model/cost badges, expired blob URL detection with "regenerate to view" fallback, per-video download and regeneration
- **Meta video upload** (`api/meta.ts`): `video-upload` route through existing catch-all — fetches from Veo with server-side key, chunked upload to Meta (2MB chunks for Vercel 4.5MB limit), polls for processing completion
- **Video publish pipeline** (`metaApi.ts`): `uploadVideoToMeta()`, `createAdWithVideoCreative()` with `video_data` spec, per-ad media type dispatch in `publishAds()`
- **Per-ad media type** (`AdPublisher.tsx`): Mixed image+video selections with media type badges, `loadMediaDataForPublish()` supporting both types
- **CSS** for video badges, cost estimates, media type indicators

### Security
- **API key in header** (`openaiApi.ts`): All Veo API calls use `x-goog-api-key` header instead of `?key=` URL parameter — key never stored in video URLs
- **SSRF protection** (`api/meta.ts`): `video-upload` rejects full URLs from clients; strict regex validation (`files/[a-zA-Z0-9_-]+` only) with hardcoded `generativelanguage.googleapis.com` base
- **Null guards** (`metaApi.ts`): Explicit checks for `veoFileRef` (video) and `imageBase64` (image) with clear "regenerate before publishing" error messages
- **Video readiness enforcement** (`metaApi.ts`): Client rejects `status !== 'ready'` responses — prevents flaky ad creation from in-progress video processing

### Files Modified
- `src/services/openaiApi.ts` — Video types, config, generation engine, package builder
- `src/pages/AdGenerator.tsx` — Video config UI, cost calculation, regeneration handler
- `src/pages/AdGenerator.css` — Video cost estimate styles
- `src/components/GeneratedAdCard.tsx` — Multi-video display, badges, regeneration
- `src/components/GeneratedAdCard.css` — Video card, badge, expired state styles
- `api/meta.ts` — Video upload route (chunked upload proxy)
- `src/services/metaApi.ts` — Video upload, video creative creation, per-ad publish dispatch
- `src/pages/AdPublisher.tsx` — Media-aware metadata extraction, publish data loading
- `src/pages/AdPublisher.css` — Media type badge styles

---

## 2026-02-27 — Meta App Review approved, go-live documentation (#243)

### Overview
All 5 Meta App Review permissions (ads_management, ads_read, pages_read_engagement, business_management, pages_show_list) approved with Advanced Access. App verified live with external (non-tester) users completing full OAuth flow. Documentation updated with go-live checklist and beta tester provisioning process.

### Changed
- **`CLAUDE.md` — Submission History**: Marked resubmission as approved, added go-live verification entry
- **`CLAUDE.md` — Go-Live Checklist**: Added complete 9-step pipeline from development to live Meta Tech Partner status
- **`CLAUDE.md` — Beta Tester Provisioning**: Documented how to grant beta testers full access via Supabase `organizations` table without requiring Stripe (set `plan_tier`, `subscription_status`, `current_period_end`)

---

## 2026-02-26 — Push refined copy to Instantly campaign

### Overview
Pushed all 10 prospects with updated Meta-anchored email copy to the "Convertra Cold v1 — Pain Point" Instantly campaign. Old leads with stale copy were deleted first (Instantly doesn't overwrite existing leads on re-push), then re-pushed with the refined Conversion Intelligence CTA and Meta-specific openings.

### Changed
- **`pipeline.json`**: 10 prospects advanced from `ready_to_send` → `email_1_sent` with follow-up 1 scheduled for 2026-03-01
- Old `pushed_to_instantly` interactions replaced with fresh push timestamps

### Campaign Details
- **Campaign**: Convertra Cold v1 — Pain Point (`8b466981-54d8-4487-ade3-b27ddab16a4e`)
- **Sending account**: todd@convertraiq.com
- **Schedule**: Weekdays 9am-5pm AEST
- **Sequence**: 2-step (opener + follow-up at day 3)

---

## 2026-02-26 — Meta ads copy refinement: Conversion Intelligence CTA, explicit ad anchoring

### Overview
Refined all cold email copy to explicitly reference Meta/Facebook ads throughout. Previous emails were vague about what we do (referencing blogs, newsletters, content marketing). Every email now makes it abundantly clear we're talking about their paid Meta ad creatives.

### Changed
- **Email CTA (SaaS/DTC)**: "I mocked up 2 fresh ad variations based on what's already winning in your account" → "Using my Conversion Intelligence technology I mocked up 3 fresh ad variations for you to test based on what's already proven to work on Meta right now"
- **Email bridge**: "fresh variations flowing into testing" → "fresh ad creatives flowing into Meta testing"
- **Follow-up 1**: "The ad variations are ready" → "The 3 Meta ad variations are ready"
- **GPT system prompt**: Opening observation now MUST reference Meta/Facebook ads specifically. Blogs, newsletters, content marketing explicitly banned from openings
- **Fallback hooks**: All generic template fallbacks now reference Meta ads (e.g., "running ads on Meta" instead of "investing in paid social")
- **`instantly.py`**: Follow-up body fallback updated to match new copy
- **`pipeline.json`**: All 10 prospects re-drafted via GPT-5.2 with Meta-anchored openings and Conversion Intelligence CTA

### Files Modified
- `ops/convertra-leads/modules/drafter.py` — GPT prompt, CTA, bridge, fallback hooks
- `ops/convertra-leads/modules/instantly.py` — Follow-up body fallback
- `ops/convertra-leads/data/templates.json` — All body templates + follow-up
- `ops/convertra-leads/data/pipeline.json` — 10 re-drafted emails

---

## 2026-02-25 — Instantly API integration for cold email sending

### Overview
Full integration with Instantly.ai API v2 for automated cold email sending. Replaces Gmail SMTP with Instantly's infrastructure (warmup, rotation, deliverability tracking). Connected `todd@convertraiq.com` via Google Workspace as the sending account.

### Added
- **`modules/instantly.py`** — Complete Instantly API v2 integration: campaign creation with two-touch sequence, lead pushing with per-lead custom variables (`{{subject_line}}`, `{{email_body}}`, `{{followup_1_body}}`), account management, campaign activation/pause, analytics
- **`cli.py`** — 8 new CLI commands under `instantly` subcommand: `status`, `accounts`, `campaigns`, `create-campaign`, `push-leads`, `activate`, `pause`, `analytics`

### Changed
- **`data/config.json`** — Removed "Reply STOP to opt out" signature (cold emails are personal, not marketing blasts)
- **`data/pipeline.json`** — 10 prospects re-drafted with GPT-5.2 using new v5 email formula (tier 1 pain-point subject lines, 4-part body structure, value-first CTA), pushed to Instantly campaign

### Technical Notes
- Instantly API v2 uses `campaign` field (not `campaign_id`) when creating leads to associate them with a campaign
- Account mapping uses `PATCH /campaigns/{id}` with `email_list` array
- Schedule timezone must use `Australia/Brisbane` (Instantly doesn't accept `Australia/Sydney`)
- Leads are added one at a time (no bulk endpoint in v2)
- Campaign settings: text-only, no link tracking, open tracking enabled, stop on reply, 50/day limit, weekdays 9am-5pm AEST

---

## 2026-02-25 — Subject line formulas, value-first CTA, two-touch follow-up sequence

### Overview
Complete overhaul of cold email subject lines, body copy formula, and follow-up sequence based on comprehensive research across 5 sources (tested on 15K+ prospects, 500K+ emails/month senders). Introduces tiered subject line split testing, value-first CTA (tangible deliverable instead of video pitch), and two-touch follow-up rule.

### Subject Lines
- **11 Tier 1 (pain-point) variants** active for split testing: "Ad fatigue?", "{first_name}, creative bottleneck?", "Waiting on designers?", "Not enough ad creative to test?", "{company}'s ad fatigue", "3 days per creative?", "One winning ad left?", "Creative Velocity", "Fatiguing meta ads?", "Running out of ads to test?", "Can't test ads quick enough?"
- **Tiers 2-6 documented** for future rounds: trigger events (6), growth signals (5), stat/outcome (3), neutral/ambiguous (4), angle-based (3)
- Subject lines picked randomly from active pool per prospect with placeholder filling ({first_name}, {company}, {ad_count}, {role})

### Email Body (v5 Formula — 4-part structure)
- **SaaS/DTC**: Greeting → Opening+Bridge ("At that volume, the biggest challenge is usually keeping enough fresh variations flowing into testing") → Value Offer ("I mocked up 2 fresh ad variations based on what's already winning in your account. Want me to send them over?") → Sign-off. No product name in email.
- **Agency**: Same structure but bridge adds "for each client" and CTA names Convertra with video offer (agencies evaluate tooling)
- Bridge reframed: never criticize their team, position as universal challenge that comes with scale

### Two-Touch Follow-up Rule
- Reduced from 4 emails (opener + followup_1 + followup_2 + breakup) to 2 (opener + 1 follow-up on day 3)
- Follow-up is a short bump: "Just floating this back up. The ad variations are ready whenever you want them."
- Non-responders marked `sequence_complete` for recycle into new campaign with different subject line and angle
- Based on 2026 data: follow-up 1 boosts replies 49%, follow-up 4+ drops response rates 55%

### Changed
- **`data/templates.json`** — Complete restructure: added `subject_lines` section with 6 tiers (32 total variants), updated saas_founder and agency_owner body templates to v5 formula, simplified followup_1 template, removed followup_2 and breakup templates
- **`modules/drafter.py`** — Added `_load_subject_lines()` and `_pick_subject_line()` for tiered subject line pool; rewrote `_build_prompt()` with 4-part structure, separate SaaS vs Agency instructions, anti-criticism rules; updated `_fallback_template()` with new body copy and agency variant; reduced max word count from 100 to 80
- **`modules/followup.py`** — Removed followup_2 and breakup from SEQUENCE_STEPS; added `mark_sequence_complete()` for recycling; simplified `resume_sequence()` to only handle followup_1; updated module docstring with two-touch research citations
- **`modules/pipeline.py`** — Updated STAGE_TRANSITIONS: followup_1_sent now goes to mark_complete (was followup_2), removed followup_2_sent and breakup_sent stages
- **`modules/reporter.py`** — Removed followup_2 and breakup email counting; updated in_sequence stage list
- **`modules/notifier.py`** — Updated in_sequence stage list (removed followup_2_sent)
- **`orchestrator.py`** — Simplified follow-up loop to only process followup_1; rewrote `_fill_followup_template()` to match new short bump format; updated active_stages list
- **`config.py`** — Removed followup_2_days and breakup_days from default config
- **`data/config.json`** — Removed followup_2_days and breakup_days from sequence_timing
- **`OPERATIONS-GUIDE.md`** — Updated email copy formula to v5, updated follow-up sequence documentation
- **`ops/openclaw-skills/cold-outreach/SKILL.md`** — Updated email rules, templates, and follow-up phase
- **`ops/openclaw-skills/daily-ops/SKILL.md`** — Updated drafting rules, templates, and sequence timing
- **`ops/openclaw-skills/follow-up-sequences/SKILL.md`** — Updated to two-touch sequence
- **`ops/openclaw-skills/pipeline-tracker/SKILL.md`** — Updated prospect stages (removed followup_2_sent, breakup_sent)

---

## 2026-02-25 — Refine cold email copy: personal tone, structured prompt, no marketing language

### Changed
- **`modules/drafter.py`** — Rewrote system prompt with explicit 3-part structure (opening → pitch → CTA); removed all unsubscribe/STOP language (personal email, not marketing blast); removed tech stack jargon from openings (no Shopify/Klaviyo/HubSpot/Meta Pixel mentions); updated USP framing to "Convertra automates all of this"; expanded bottleneck to "without waiting on designers, copywriters, or even in-house staff"; updated CTA to "I shot a quick 2-min video for you showing exactly how this could work for {company}"; removed "Reply STOP" from fallback template
- **`data/pipeline.json`** — All 10 emails re-drafted with refined copy

---

## 2026-02-25 — Lead pipeline v3: GPT-5.2 drafting, personalization hooks, Meta-only copy

### Changed
- **`modules/drafter.py`** — Switched AI model from `gpt-4o` to `gpt-5.2`; fixed `max_tokens` → `max_completion_tokens` for GPT-5.2 compatibility; complete system prompt rewrite: Meta/Facebook-only positioning, ConversionIQ™ USP (analyzes proven patterns → auto-generates creatives → increases creative velocity), low-friction video CTA ("I shot a quick 2-min video…"), 100-word body limit, anti-repetition rules
- **`modules/research.py`** — Added `_generate_hooks()` function to synthesize personalization hooks and pain signals from extracted company intel (hiring signals, Meta Pixel, ad count, creative fatigue, tech stack, ecommerce, funding, team size); removed all Google Ads references; hooks now capped at 4, pains at 3
- **`data/pipeline.json`** — 66 new prospects discovered across supplements/skincare/ecommerce niches; 10 prospects enriched with emails and AI-drafted personalized cold emails via GPT-5.2

### Results
- **Prospects discovered**: 66 across 3 niches (6 hot, 37 warm, 23 cold)
- **Emails found**: 19 via Hunter.io (12 credits used)
- **Emails drafted**: 10/10 via GPT-5.2 with personalized hooks and Meta-only positioning
- **Copy quality**: All emails under 100 words, personalized opening lines, low-friction video CTA

---

## 2026-02-25 — Harden lead pipeline data quality: name validation, noise filtering, company cleaning

### Problem
The lead pipeline was producing garbage data: DDG page titles as company names ("7 TOP SUPPLEMENT MARKETING AGENCIES"), section headings as contact names ("Final Thoughts", "Business Development Manager", "Measuring Scoop"), noise URLs from job boards, freelancer platforms, and article pages. Hunter.io was skipping 100% of prospects due to missing names, and most prospects scored as "skip" (4 points).

### Solution
Six changes across five files to fix data quality at every pipeline stage:

### Changed
- **`modules/research.py`** — Extract contact names from HTML (headings near role keywords, JSON-LD, meta tags, text patterns); clean company names from `og:site_name`, JSON-LD Organization, `<title>` tag, domain fallback; require extracted names to also have a role (eliminates false positives like "Measuring Scoop"); validate company names to reject DDG titles (>5 words, emoji, URLs, "#1 Rated...", "List of...", etc.); expanded `NON_NAME_WORDS` with ~100 common English words, job title words, section heading phrases, and company suffixes
- **`modules/discovery.py`** — Expanded `SKIP_DOMAINS` from ~60 to ~75 entries (added trabajo.org, jooble.org, sproutsocial.com, starterstory.com, behance.net, dribbble.com, and more job boards, SaaS tools, design sites)
- **`modules/enrichment.py`** — Added Hunter.io Domain Search fallback when prospect has no name (searches company domain for contacts sorted by seniority); added `max_credits` budget parameter to `batch_enrich()` to prevent overspending on free plan
- **`modules/scorer.py`** — Added 4 new scoring rules: `hiring_volume` (+2 for 3+ creative roles), `dtc_ecommerce` (+1 for Shopify+Klaviyo), `has_contact` (+1 for named contact), `established_company` (+1 for 20+ employees)
- **`orchestrator.py`** — Both `batch_enrich()` calls now pass `max_credits=25` to cap Hunter.io credit usage per campaign run

### Results (before → after)
- **Emails found per campaign**: 0 → 5 (3 Hunter verified + 2 pattern guess)
- **Hunter efficiency**: 0 credits → 4 credits for 4 verified emails
- **False positive names**: rampant → eliminated by role-gating
- **Garbage company names**: ~80% → rejected by validation

---

## 2026-02-24 — Fix Meta OAuth: switch to Facebook Login for Business config_id flow

### Problem
External users were blocked at the Meta OAuth dialog with "access denied — user needs at least one permission." The app uses **Facebook Login for Business** (FLB) as its login product, which requires a `config_id` parameter instead of the standard `scope` parameter. The scope-based flow (reverted to in #228) is incompatible with FLB — permissions must be defined in a Configuration object in the Meta App Dashboard and referenced by `config_id`.

### Solution
Switched from `scope`-based OAuth URL to `config_id`-based flow. The FLB configuration in the Meta App Dashboard defines the permissions (`ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_show_list`) and token type, and `config_id` references it in the OAuth dialog URL.

### Changed
- **`api/auth/meta/connect.ts`** — Replaced `scope` parameter with `config_id` from `META_CONFIG_ID` env var; added `override_default_response_type=true` for server-side code flow; updated config validation to require `META_CONFIG_ID`
- **`CLAUDE.md`** — Added `META_CONFIG_ID` to backend env vars; added "Facebook Login for Business" documentation section with configuration setup steps

### New Environment Variables (Vercel)
- `META_CONFIG_ID` — Facebook Login for Business configuration ID (created in Meta Developer Dashboard → Facebook Login for Business → Configurations)

### Dashboard Setup Required
Before deploying, create/verify the FLB configuration: App Dashboard → Facebook Login for Business → Configurations → Create with "General" login variation, "User access token" type, and all 5 permissions selected.

---

## 2026-02-24 — Add Transaction Fees and Net Profit dashboard metric cards

### Added
- **Transaction Fees card** — Displays Stripe fees as a dollar figure (6.2% of total revenue) with a credit card icon
- **Net Profit card** — Calculated as Total Revenue minus Ad Spend minus Transaction Fees, with a wallet icon
- Both cards are visible by default, respond to the date range picker, and can be reordered/hidden via the dashboard customizer
- Fee rate defined as a `TRANSACTION_FEE_RATE` constant for easy adjustment

### Changed
- **`src/pages/Dashboard.tsx`** — Added `transactionFees` and `netProfit` to `DashboardStats` interface, default metric config, icons, labels, formatting, and calculation logic

---

## 2026-02-24 — Fix Meta OAuth for external users: revert to scope-based flow

### Problem
External users were still blocked at the Facebook authorization dialog ("Feature unavailable") after switching to `config_id` (Facebook Login for Business) in PR #226. The `config_id` approach introduced an opaque dependency on an FLB dashboard configuration that could silently block external users — even with all 5 permissions approved via App Review. Investigation also revealed `public_profile` (automatically included in every OAuth flow) was stuck at "Ready for testing" instead of Advanced Access.

### Solution
Reverted from `config_id` to explicit `scope` parameter listing all 5 approved permissions. The standard scope-based OAuth flow works directly with Advanced Access permissions without requiring an intermediary FLB configuration. Also identified and escalated the `public_profile` access level issue on the Meta Developer Dashboard.

### Changed
- **`api/auth/meta/connect.ts`** — Replaced `config_id` + `override_default_response_type` with explicit `scope` parameter (`ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_show_list`); removed `META_CONFIG_ID` env var dependency; simplified config validation to only require `META_APP_ID`

### Removed Environment Variables
- `META_CONFIG_ID` — No longer needed; permissions are specified directly via `scope` parameter

---

## 2026-02-24 — Fix funnel purchase counting inconsistency between overview and detail views

### Problem
After separating order bump metrics into their own display row, the funnel overview table (`handleDiscover`) and single funnel detail view (`handleMetrics`) used different logic to count purchases. The overview counted `order_bump_purchase`, `upsell_accept`, and `downsell_accept` as purchase sessions, while the detail view only counted `purchase` events. This caused the overview to show inflated purchase counts and conversion rates that didn't match the detail view.

### Fixed
- **`api/funnel/metrics.ts`** — Aligned `handleDiscover` purchase counting with `handleMetrics`:
  - Order bump events now count toward revenue but are excluded from `purchaseSessions` (consistent with the separated order bump row in the detail view)
  - Only `purchase` event types add to `purchaseSessions` (upsells/downsells are additional revenue on the same session, not new customers)
  - Revenue from all purchase types (purchase, upsell_accept, downsell_accept, order_bump_purchase) is still correctly summed

---

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
