# User Preferences & Workflow Rules

## URL Structure

The user prefers a standard SaaS URL structure:
- Root domain (`/`) → Sales/marketing landing page (Convertra branding)
- `/login` → User authentication
- `/signup` → Company registration
- Protected app routes behind auth (`/dashboard`, `/channels`, etc.)

## Navigation UI Preferences

- Sales landing navigation should include a "Log in" button styled as a secondary link
- Place "Log in" next to the primary CTA ("Schedule Demo")
- Log in button styling: subtle lime green outline, becoming more prominent on hover
- Navigation dropdowns should be collapsed by default on page load
- Sidebar supports collapsible sections for Channels and Insights

## Design & Branding Preferences

- **Visual polish**: User prefers "professional" and "nicer" looks for UI elements; focus on aesthetic quality
- **"White glove" enterprise feel**: The portal should feel personalized with company branding, high-quality UI, and attention to detail
- **ConversionIQ™ branding**: Integrate throughout the UI, especially for loading states and data processing
- **CreativeIQ™ branding**: The "hero action" for AI creative generation; should be visually distinct and prominent
- **Hero action prominence**: The Creative Generator (CreativeIQ™) should be styled as a prominent CTA button, not a regular nav item
- **Iterative design approach**: Make small, focused changes and gather feedback for refinement
- **Clean navigation**: Remove redundant navigation items if they create confusion or duplicate workflows
- Use meaningful `title` attributes on navigation items and buttons for accessibility and discoverability
- **Pill style UI**: Rounded corners and spacing away from screen edges for a "floating" aesthetic (especially for mobile navigation and headers)
- **CSS-only solutions**: Prefer CSS for layout and responsiveness whenever possible; minimize JavaScript state changes for these aspects

## Dashboard & Metrics Preferences

- **Visual clarity**: User wants metrics that are "very nice, very nice" - clear, well-presented data
- **Customization**: Strong preference for ability to "build their own custom dashboard" by choosing metrics
- **Data accuracy**: Dashboard metrics must be accurate - verify API endpoints and data sources
- **Prioritization**: Fix existing issues first, then build new features (e.g., fix metrics before adding customization)

## SEO/GEO Optimization Preferences

- **"Fully and completely optimize"**: Desire for comprehensive, end-to-end solutions for SEO and GEO
- **"Hit the ground running with optimized SEO"**: Emphasis on getting started quickly with a strong foundation
- **"Prioritize AI recommendations"**: Focus on GEO (Generative Engine Optimization) alongside traditional SEO, acknowledging AI's impact on search
- **No Performance/UI Impact**: SEO implementations should be invisible to end-users and not degrade website performance
- **Clear, benefit-oriented explanations**: When explaining technical concepts, prefer simple, benefit-driven language ("What this actually means for you")
- **Actionable next steps**: Provide clear, prioritized action items and ask for confirmation before proceeding
- **Invisible optimizations**: Meta tags, schema, and config files achieve SEO without altering user-facing UI

## User Profile & Company Branding

- **User profile prominence**: The user profile area in the top right is a key branding and navigation element
- **Company branding display**: Show company logo or gradient-colored initials as a placeholder when logo isn't available
- **User profile dropdown actions**: Must include "Sign out", "Account details", and "Reset password"
- **Mobile accessibility**: User profile dropdown must be accessible on mobile devices (include in mobile header)
- **Progressive enhancement**: Features like user profile dropdown should work across all breakpoints (desktop, tablet, mobile)

## Code Quality Principles (Karpathy-inspired)

The user prefers code adhering to these principles:
- **Simplicity**: Keep implementations straightforward; avoid unnecessary complexity
- **Consistency**: Follow established patterns across the codebase
- **Clarity**: Code should be self-explanatory; favor readability
- **Incremental changes**: Make small, focused changes rather than large refactors
- **Avoid over-engineering**: Build only what's needed now, not hypothetical future needs
- **Minimal abstraction**: Don't abstract prematurely; concrete code is often clearer
- **Thoroughness**: When fixing issues, perform a thorough check across all similar functionality in the codebase—don't just fix the one instance that triggered the error

## Form Design Requirements

### Registration Form Fields
- Company Name
- Full Name
- Email
- Password
- Confirm Password
- Company Role (with placeholder examples like "CMO", "Media Buyer", "Marketing Director")
- Terms agreement checkbox

### Form State Pattern
Use a single `formData` object with `useState` for forms with multiple fields:
```tsx
const [formData, setFormData] = useState({
  companyName: '',
  fullName: '',
  email: '',
  // ...
});

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
};
```

## API Data & Error Visibility Preferences

- **Refresh buttons**: Always provide a "Refresh" button for data fetched from external APIs (custom audiences, targeting suggestions, etc.) so users can manually retry if initial loads fail or data becomes stale
- **Clear error messages**: Users need to see clear error messages when API calls fail, not just a lack of results. Show what went wrong and how to fix it.
- **Token awareness**: Proactively inform users about access token expiration. Short-lived tokens (Graph API Explorer) expire in 1-2 hours; recommend long-lived or System User tokens for sustained use.

## Ad Publisher Preferences

- **Default campaign objective**: Sales (`OUTCOME_SALES`), not Traffic
- **Default budget mode**: CBO (Campaign Budget Optimization)
- **Targeting presets**: User wants to save and load targeting configurations (countries, interests, audiences) as reusable presets
- **Real-time targeting search**: Search Meta's targeting suggestions API live, not manual ID entry
- **Custom audiences via API**: Fetch custom audiences from the ad account automatically, not manual ID input
- **Multi-step UX**: Clear step indicators, collapsible sections for complex forms, predictable behavior (e.g., click-outside to close dropdowns)
- **"Ultra smooth and user friendly"**: The ad publisher flow must feel polished and intuitive

## AI Feature Preferences

### User Control over AI Depth
- User strongly prefers having control over AI reasoning levels via a dedicated UI element (IQ Selector)
- Offer three levels: **IQ Standard** (fast), **IQ Deep** (balanced), **IQ Maximum** (comprehensive)
- Display the selector **before** each major AI process (ad analysis, channel analysis, ad generation)
- This allows fine-grained control over token usage and processing time

### AI UI/UX Requirements
- **Clear descriptions**: Each reasoning level should have a clear, non-technical description
- **Visual cues**: Include icons, estimated timing, and token usage indicators
- **Intuitive design**: UI elements should be aesthetically pleasing and easy for non-technical users
- **Accurate timing**: Provide realistic time estimates for different processing levels
- **Branding consistency**: Use branded names ("ConversionIQ™", "IQ Standard") to align with product identity

### Loading States for AI Operations
- Always show branded loading messages ("ConversionIQ™ analyzing...")
- Display the selected reasoning level during processing
- Provide progress feedback for longer operations
- Never show generic "Loading..." or "Please wait..."

### Media Display Control
- Give users control over when large media elements load (e.g., "Show Images" button)
- Don't auto-load many images on page mount - let users trigger loading
- This improves page responsiveness and prevents crashes on media-heavy pages

## Git Workflow

- Commit changes before creating Pull Requests
- Provide PR URL after creation
- PR numbers increment sequentially
- **Separate PRs for distinct fixes**: When iterating on a solution, create separate PRs for each distinct fix rather than bundling unrelated changes
- Use clear commit messages and PR titles that accurately reflect the changes
- **Complete PR workflow**: User expects the full process through to completion—commit changes, create PR, provide PR URL

## Communication Preferences

- **Simplify technical jargon**: User struggled with terms like "cloning the repo"—break down technical issues into simple, direct terms with clear examples of what is wrong and what is correct
- **Table format for multi-file fixes**: When presenting fixes across multiple files, use a table format clearly outlining: file, issue, and fix
- **Clear step-by-step solutions**: Present fixes in ordered, actionable steps rather than long prose explanations

## Theme & Visual Clarity

### Light Theme Enforcement
- **Strong preference for light UI**: All components must adhere to the light theme
- **Never use**: Dark backgrounds, dark text on dark backgrounds, cyan (#00d4ff), or any dark-mode-style colors
- **Color conflicts**: Text and backgrounds must have proper contrast; hard-to-see text is unacceptable
- **Use CSS variables**: Always use theme variables (`var(--bg-card)`, `var(--border-primary)`, `var(--text-primary)`) for consistency
- **Readability over decoration**: Prioritize clear text readability over complex visual elements; use contrasting colors for text and backgrounds

### UI Cleanliness
- **Remove visual clutter**: Stray decorative graphics that obscure content should be removed
- **Readability first**: Visual clarity and readability are paramount
- **Minimal decorative elements**: Only include decorations that enhance rather than obstruct the UI

### Form Element Consistency
- Apply `font-family: inherit` to form inputs, selects, textareas, and buttons for consistent typography
- Use CSS classes instead of inline styles for form styling

## Application Stability

### Demo & Production Readiness
- **Stability is critical**: Crashes and glitches during demos are unacceptable and need immediate resolution
- **Thorough testing**: Test across different states, data sizes, and user flows before considering a feature complete
- **Progressive degradation**: Implement graceful fallbacks when errors occur rather than crashing

### Debugging Support
- **Console logging**: Add meaningful console logs for debugging critical operations
- **Feature flags**: Implement debug flags to isolate issues (e.g., `SKIP_LOCALSTORAGE`, `DEBUG_MODE`)
- **Clear error messages**: Surface specific, actionable error information to help with troubleshooting

### Performance & Crash Debugging
When encountering performance issues or crashes (especially in Chrome), investigate:
- Large `localStorage` parsing blocking the main thread
- Synchronous operations that don't yield to the browser
- Rendering too many DOM elements without virtualization or pagination
- Duplicate component mounts (potentially due to React StrictMode in development)
- Memory pressure from handling large data (images, API responses)

### Storage Management UX
- **Proactive warnings**: Warn users about large `localStorage` usage before it causes issues
- **Clear data options**: Provide easy ways to clear stored data (e.g., "Clear All Ads" button)
- **Storage indicators**: Show users how much data is stored and approaching limits

### Default Values
- Provide sensible defaults for user-configurable settings:
  - Similarity threshold: 30%
  - Image aspect ratio: 1:1
  - Reasoning level: IQ Standard (fast)
- Defaults should favor speed/efficiency for first-time users while allowing customization
