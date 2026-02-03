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
├── components/      # Reusable UI (DateRangePicker, CampaignTypeDashboard, etc.)
├── services/        # API integrations (metaApi.ts, openaiApi.ts, imageCache.ts, stripeApi.ts)
├── types/           # TypeScript interfaces
└── data/            # Mock data for development

api/
├── billing/         # Stripe billing API routes (checkout.ts, portal.ts, webhook.ts)
└── [feature]/       # Feature-specific API routes

public/
├── convertra-logo.png  # Convertra brand logo
└── ...
```

## Key Files

| File | Purpose |
|------|---------|
| `src/services/metaApi.ts` | Meta Marketing API - fetches ads, creatives, campaigns |
| `src/services/openaiApi.ts` | AI analysis (GPT-4o) + creative generation (Gemini/Veo) |
| `src/services/imageCache.ts` | Client-side image caching with quality scoring |
| `src/pages/MetaAds.tsx` | Main dashboard - campaign metrics, creative analysis |
| `src/pages/AdGenerator.tsx` | AI-powered ad creative generation workflow |
| `src/pages/Insights.tsx` | Channel-level AI analysis with health scores |
| `src/pages/SalesLanding.tsx` | Convertra sales/marketing landing page |
| `src/pages/SalesLanding.css` | Sales landing page styles with animations |
| `src/components/Loading.tsx` | Branded loading component with animated logo |
| `src/components/Sidebar.tsx` | Collapsible sidebar navigation with expandable sections |
| `src/components/ProtectedRoute.tsx` | Auth guard for protected routes |
| `src/pages/Login.tsx` | Authentication login page |
| `src/pages/Register.tsx` | Company registration/signup page |
| `src/pages/ForgotPassword.tsx` | Request password reset email |
| `src/pages/ResetPassword.tsx` | Set new password after email link |
| `src/contexts/AuthContext.tsx` | Auth state management with Supabase integration |
| `src/lib/supabase.ts` | Supabase client singleton with configuration check |
| `src/components/UserProfileDropdown.tsx` | User profile dropdown with company branding, sign out, account actions |
| `src/components/MainLayout.tsx` | App shell with sidebar, header, and responsive navigation |
| `src/services/stripeApi.ts` | Stripe integration - checkout, portal, subscription management |
| `src/pages/Billing.tsx` | Billing portal page with plan management |
| `src/pages/Dashboard.tsx` | Main dashboard with customizable stat cards, date range picker, fetches from both Meta API and Supabase funnel API |
| `src/pages/Funnels.tsx` | Funnel metrics page with ad spend configuration |
| `src/components/DashboardCustomizer.tsx` | Drag-and-drop dashboard layout customization |
| `src/components/StatCard.tsx` | Reusable stat card component for metrics display |
| `api/billing/checkout.ts` | Vercel serverless function for Stripe Checkout sessions |
| `api/billing/portal.ts` | Vercel serverless function for Stripe Customer Portal |
| `api/funnel/metrics.ts` | Supabase funnel metrics API endpoint |
| `src/components/IQSelector.tsx` | ConversionIQ™ reasoning level selector for AI operations |
| `src/components/SEO.tsx` | Centralized SEO component for meta tags and structured data |
| `public/robots.txt` | Search engine crawl directives (allows AI bots for GEO) |
| `public/sitemap.xml` | XML sitemap for search engine indexing |

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
/concepts       → Concepts management
/products       → Products management
/insights       → Channel AI analysis
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

---

## Stripe Billing Integration

### Architecture
- **Frontend**: `src/services/stripeApi.ts` handles UI-facing billing operations
- **Backend**: `api/billing/*.ts` serverless functions for sensitive Stripe operations
- **Stripe.js**: Loaded lazily on first use to minimize bundle impact

### Stripe Patterns

#### Lazy-loading Stripe.js
```typescript
import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};
```

#### Configuration Check
```typescript
export const isStripeConfigured = (): boolean => {
  return !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
};
```

#### Checkout Flow
1. Frontend calls `POST /api/billing/checkout` with plan info
2. Backend creates Stripe Checkout Session and returns `sessionId`
3. Frontend redirects via `stripe.redirectToCheckout({ sessionId })`

#### Customer Portal
1. Frontend calls `POST /api/billing/portal`
2. Backend creates portal session and returns `url`
3. Frontend redirects to Stripe-hosted portal

### API Route Pattern
```typescript
// api/billing/checkout.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle request...
}
```

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

### Non-Blocking localStorage Loading
```tsx
// Use requestIdleCallback with setTimeout fallback to avoid blocking the main thread
const extractMetadataAsync = () => {
  const run = () => {
    const stored = localStorage.getItem('large_data_key');
    if (stored) {
      // Parse and set state
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run);
  } else {
    setTimeout(run, 0);
  }
};
```

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
STRIPE_PRICE_STARTER=       # Stripe Price ID for Starter plan
STRIPE_PRICE_GROWTH=        # Stripe Price ID for Growth plan
STRIPE_PRICE_ENTERPRISE=    # Stripe Price ID for Enterprise plan
SUPABASE_URL=               # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=  # Supabase service role key (for server-side access)
```

## Deployment (Vercel)

This is a Single Page Application (SPA) deployed on Vercel. The `vercel.json` configuration includes a rewrite rule to ensure client-side routing works correctly:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This is required for `react-router-dom` to handle direct deep links and page refreshes on non-root paths (e.g., `/login`, `/signup`, `/dashboard`).

## Development Commands

```bash
npm run dev    # Start dev server (port 5175)
npm run build  # TypeScript check + Vite build
npm run lint   # ESLint with TypeScript rules
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
- All requests go through `metaApi.ts`
- Graph API version: v21.0
- Creative fetching includes thumbnail URL extraction
- Campaign metrics include ROAS, CPA, CVR, CTR
- **Ad creation safety**: Always create ads with `status: 'PAUSED'` to prevent accidental live publication
- **Pre-publish validation**: Run `validatePageAccess` before publishing to catch permission/config issues early
- **Required scopes for publishing**: `ads_management`, `pages_read_engagement`, `pages_manage_ads`
- **Page ID required**: `VITE_META_PAGE_ID` must be set for ad creatives using `object_story_spec`

### Meta API Ad Publishing Patterns

#### Campaign Objectives & Optimization
- For `OUTCOME_SALES` objective, include `promoted_object` with `pixel_id` and `custom_event_type` for conversion tracking
- `optimization_goal` choices: `OFFSITE_CONVERSIONS` (preferred for sales with pixel), `LANDING_PAGE_VIEWS`, or `LINK_CLICKS` (fallback if no pixel)
- Default campaign objective: **Sales** (`OUTCOME_SALES`)

#### Budget Modes (CBO vs ABO)
- **CBO (default)**: Budget set at campaign level via `createCampaign`
- **ABO**: Budget set at ad set level via `createAdSet`; requires `is_adset_budget_sharing_enabled: false`

#### Targeting
- Interests/behaviors use `flexible_spec` in the targeting object for `createAdSet`
- Fetch targeting suggestions from Meta API in real-time (not manual ID entry)
- Fetch custom audiences from the ad account via API instead of requiring manual IDs

#### Image Upload Flow
1. Convert image URL to base64
2. Upload via `adimages` endpoint using `FormData`
3. Receive `image_hash` from response
4. Use `image_hash` in `object_story_spec` → `link_data` for creative creation

#### Ad Creative Structure
```
object_story_spec → link_data: { image_hash, message (body), name (headline), call_to_action, link }
```

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
1. User selects source ads (top performers)
2. User selects ConversionIQ™ reasoning level
3. GPT-5.2 analyzes creative patterns with selected depth
4. Gemini 3 Pro generates new images
5. Veo generates video variants
6. User reviews and exports to Meta

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

---

## Sales Landing Page Structure

The Convertra sales landing follows this architecture:

| Section | Purpose |
|---------|---------|
| Hero | Headline + slogan. Stop them. State the outcome. |
| Problem Agitation | Make them feel the pain of not knowing why |
| Mechanism Reveal | Introduce ConversionIQ™—Extract, Interpret, Generate, Repeat |
| Bespoke Differentiator | Separate from self-serve tools. Premium positioning. |
| Outcome | The results they get. Life after Convertra. |
| Credibility | Build trust. Enterprise-only positioning. |
| Offer | Tangible deliverables. What's included. |
| Risk Reversal / Urgency | Cost of inaction. Limited availability. |
| Final CTA | Clear next step. No friction. |
| Footer | Brand tagline. Memorable close. |

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

- Respect `prefers-reduced-motion` - disable animations when set
- All interactive elements have hover/focus states
- Color contrast meets WCAG AA standards
- Mobile navigation accessible via hamburger menu
- Use `aria-label` on icon-only buttons (e.g., `aria-label="Open menu"`)
- Use `aria-hidden="true"` on decorative icons and SVGs
- User profile dropdown accessible in both desktop header and mobile navigation
