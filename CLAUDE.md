# Conversion Intelligence

A SaaS platform for CMOs and media buyers solving ad creative fatigue through automated high-converting ad generation and testing. CI automates the creative testing flywheel that traditionally takes weeks into minutes.

## Quick Context

- **Stack**: React 19 + TypeScript + Vite
- **APIs**: Meta Marketing API, OpenAI GPT-4o, Google Gemini/Veo
- **Styling**: Dark theme, glassmorphism, CSS variables
- **State**: React hooks + localStorage caching (no Redux/Context)

## Project Structure

```
src/
├── pages/           # Route-level components (Channels, MetaAds, AdGenerator, Insights)
├── components/      # Reusable UI (DateRangePicker, CampaignTypeDashboard, etc.)
├── services/        # API integrations (metaApi.ts, openaiApi.ts, imageCache.ts)
├── types/           # TypeScript interfaces
└── data/            # Mock data for development
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

## Routes

```
/channels           → Channel overview
/channels/meta-ads  → Meta Ads dashboard (main view)
/creatives          → AI ad generation
/insights           → Channel AI analysis
```

## Architecture Decisions

1. **No global state** - Components fetch their own data, cache in localStorage
2. **Service layer abstraction** - All API calls go through `src/services/`
3. **Campaign type detection** - Naming conventions: `[P]`/`Prospecting`, `[R]`/`Retargeting`, `[RT]`/`Retention`
4. **Image caching** - Top 20 performing images cached by conversion rate

## Code Patterns

### Data Fetching
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

### Styling Convention
```css
/* Component-scoped CSS file (ComponentName.css) */
.component-container {
  background: linear-gradient(135deg, rgba(15, 13, 30, 0.95), rgba(20, 17, 40, 0.9));
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 16px;
  backdrop-filter: blur(20px);
}
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

## Environment Variables

```bash
VITE_META_ACCESS_TOKEN=     # Facebook API token
VITE_META_AD_ACCOUNT_ID=    # Format: act_XXXXXXXXX
VITE_OPENAI_API_KEY=        # GPT-4o access
VITE_GEMINI_API_KEY=        # Image generation (optional)
```

## Development Commands

```bash
npm run dev    # Start dev server (port 5175)
npm run build  # TypeScript check + Vite build
npm run lint   # ESLint with TypeScript rules
```

## Common Tasks

### Adding a New Page
1. Create `src/pages/NewPage.tsx` and `NewPage.css`
2. Add route in `src/App.tsx`
3. Add nav item in `src/components/Sidebar.tsx`

### Adding API Integration
1. Create service in `src/services/newApi.ts`
2. Define types in `src/types/index.ts`
3. Use in page/component with try/catch + loading state

### Working with Meta API
- All requests go through `metaApi.ts`
- Graph API version: v21.0
- Creative fetching includes thumbnail URL extraction
- Campaign metrics include ROAS, CPA, CVR, CTR

## Design System

| Element | Value |
|---------|-------|
| Primary | `#00d4ff` (cyan) |
| Secondary | `#a855f7` (violet) |
| Background | `#0a0814` → `#0f0d1e` |
| Text Primary | `#ffffff` |
| Text Muted | `#64748b` |
| Border Radius | 12-16px |
| Blur | 20px |

## Things to Avoid

- Don't use Redux/Context - keep state local
- Don't hardcode API tokens - use env vars (fallbacks exist in vite.config.ts for dev)
- Don't create new components for one-off UI - inline or extend existing
- Don't skip TypeScript types - all API responses need interfaces
- Don't use inline styles - create/extend CSS files

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

## Performance Metrics Glossary

| Metric | Calculation |
|--------|-------------|
| CVR | conversions / clicks |
| CPA | spend / conversions |
| ROAS | revenue / spend |
| CTR | clicks / impressions |
| Health Score | AI-generated 0-100 based on trends |

## Testing Notes

- No test framework currently configured
- Manual testing against live Meta API
- Use mock data in `src/data/` for UI development
