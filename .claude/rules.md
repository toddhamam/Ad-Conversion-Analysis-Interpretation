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
- **ConversionIQ™ branding**: Integrate throughout the UI, especially for loading states and data processing
- **CreativeIQ™ branding**: The "hero action" for AI creative generation; should be visually distinct and prominent
- **Hero action prominence**: The Creative Generator (CreativeIQ™) should be styled as a prominent CTA button, not a regular nav item
- **Iterative design approach**: Make small, focused changes and gather feedback for refinement
- **Clean navigation**: Remove redundant navigation items if they create confusion or duplicate workflows
- Use meaningful `title` attributes on navigation items and buttons for accessibility and discoverability

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
