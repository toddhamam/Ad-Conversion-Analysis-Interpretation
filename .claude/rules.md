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
