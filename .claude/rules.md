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

## Git Workflow

- Commit changes before creating Pull Requests
- Provide PR URL after creation
- PR numbers increment sequentially
