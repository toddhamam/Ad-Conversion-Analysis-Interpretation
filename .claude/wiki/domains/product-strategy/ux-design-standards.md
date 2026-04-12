---
title: UX Design Standards
type: concept
sources: [raw/rules-md.md]
related: [[product-philosophy]], [[branding-guidelines]], [[dashboard-metrics-philosophy]], [[ai-feature-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# UX Design Standards

Concrete UI patterns and interaction standards that implement the [[product-philosophy]]. These govern how every surface of Convertra looks and behaves.

## Navigation Patterns

- Sales landing nav includes "Log in" as a subtle lime green outline button next to "Schedule Demo"
- Dropdowns collapsed by default on page load
- **Avoid dropdowns for single destinations** — if a nav section leads to one page, use a direct link
- **Action-oriented labels** — "ConversionIQ™" links directly to `/insights`, not through an expandable section
- Sidebar supports collapsible sections for Channels
- **Pill style UI** — Rounded corners and spacing away from screen edges for a "floating" aesthetic

## Light Theme Enforcement

- **Never use** dark backgrounds, dark text on dark backgrounds, cyan (#00d4ff), or dark-mode colors
- **Always use CSS variables** — `var(--bg-card)`, `var(--border-primary)`, `var(--text-primary)` for consistency
- **Readability over decoration** — Clear text readability is paramount; use contrasting colors
- **Remove visual clutter** — Stray decorative graphics that obscure content must be removed
- Apply `font-family: inherit` to form elements for consistent typography

## Form Design

Registration forms include: Company Name, Full Name, Email, Password, Confirm Password, Company Role (with placeholder examples), Terms checkbox.

Use a single `formData` object with `useState` for multi-field forms:
```tsx
const [formData, setFormData] = useState({ companyName: '', fullName: '', email: '' });
const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
```

## Error & Data Visibility

- **Refresh buttons** — Always provide manual refresh for data from external APIs
- **Clear error messages** — Show what went wrong and how to fix it, not just empty states
- **Token awareness** — Proactively inform users about access token expiration
- **Graceful degradation** — Log warnings for non-critical failures; reserve hard failures for blocking issues
- **No silent failures** — If a feature requires a connection (e.g., GSC), show an inline prompt

## Loading States

All loading indicators use [[branding-guidelines]] messaging:
- "ConversionIQ™ analyzing..." (never "Loading...")
- "ConversionIQ™ extracting insights..." (never "Please wait...")
- Display selected reasoning level during AI processing
- Real-time step messages for multi-step operations

## Performance & Stability

- **Never use `transition: all`** in CSS — causes browser crashes with base64 images
- **Proactive storage warnings** — Warn about large localStorage usage before it causes issues
- **"Clear data" options** — Easy ways to clear stored data (e.g., "Clear All Ads" button)
- **Media display control** — Don't auto-load many images on mount; use "Show Images" button

## Sensible Defaults

| Setting | Default | Rationale |
|---------|---------|-----------|
| Similarity threshold | 30% | Balanced match sensitivity |
| Image aspect ratio | 1:1 | Universal ad format |
| Reasoning level | IQ Standard | Favors speed for first-time users |

## Related

- [[product-philosophy]] — Design philosophy these standards implement
- [[branding-guidelines]] — Brand-consistent loading messages and visual identity
- [[dashboard-metrics-philosophy]] — How metrics should be displayed
- [[ai-feature-standards]] — AI-specific UX patterns
