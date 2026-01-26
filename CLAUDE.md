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
- **APIs**: Meta Marketing API, OpenAI GPT-4o, Google Gemini/Veo
- **Styling**: Enterprise Light theme, subtle depth, CSS variables
- **State**: React hooks + localStorage caching (no Redux/Context)

## Project Structure

```
src/
├── pages/           # Route-level components (Channels, MetaAds, AdGenerator, Insights, SalesLanding)
├── components/      # Reusable UI (DateRangePicker, CampaignTypeDashboard, etc.)
├── services/        # API integrations (metaApi.ts, openaiApi.ts, imageCache.ts)
├── types/           # TypeScript interfaces
└── data/            # Mock data for development

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

## Routes

### Public Routes (no auth required)
```
/               → Sales landing page (Convertra marketing)
/login          → User authentication
/signup         → Company registration
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
6. **Stub authentication** - Uses localStorage flag; ready for real auth provider (Clerk, Auth0, etc.)

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

useEffect(() => {
  const fetchData = async () => {
    try {
      const result = await someApiCall();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, []);
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

```bash
VITE_META_ACCESS_TOKEN=     # Facebook API token
VITE_META_AD_ACCOUNT_ID=    # Format: act_XXXXXXXXX
VITE_OPENAI_API_KEY=        # GPT-4o access
VITE_GEMINI_API_KEY=        # Image generation (optional)
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

---

## AI Integration Details

### GPT-4o Usage
- Vision: Analyze ad images for creative elements
- Text: Generate copy variations, analyze performance
- Structured output: JSON responses for UI rendering

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
2. GPT-4o analyzes creative patterns
3. Gemini generates new images
4. Veo generates video variants
5. User reviews and exports to Meta

---

## Performance Metrics Glossary

| Metric | Calculation |
|--------|-------------|
| CVR | conversions / clicks |
| CPA | spend / conversions |
| ROAS | revenue / spend |
| CTR | clicks / impressions |
| Health Score | AI-generated 0-100 based on trends |

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
