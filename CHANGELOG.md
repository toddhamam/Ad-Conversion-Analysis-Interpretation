# Changelog

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
