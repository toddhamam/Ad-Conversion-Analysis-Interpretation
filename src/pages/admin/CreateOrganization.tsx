import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getAuthToken } from '../../lib/authToken';
import type { PlanTier } from '../../types/organization';

interface FormData {
  name: string;
  slug: string;
  planTier: PlanTier;
  ownerEmail: string;
  ownerName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
}

type Step = 'company' | 'owner' | 'branding' | 'review';

const STEPS: { key: Step; label: string; description: string }[] = [
  { key: 'company', label: 'Company', description: 'Basic information' },
  { key: 'owner', label: 'Owner', description: 'Primary contact' },
  { key: 'branding', label: 'Branding', description: 'Customize look' },
  { key: 'review', label: 'Review', description: 'Confirm & create' },
];

function CreateOrganization() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('company');
  const [formData, setFormData] = useState<FormData>({
    name: '',
    slug: '',
    planTier: 'enterprise',
    ownerEmail: '',
    ownerName: '',
    logoUrl: '',
    primaryColor: '#d4e157',
    secondaryColor: '#a855f7',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [slugManuallySet, setSlugManuallySet] = useState(false);
  const [createdOrg, setCreatedOrg] = useState<{ id: string; inviteLink: string } | null>(null);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: slugManuallySet ? prev.slug : generateSlug(name),
    }));
  };

  const handleSlugChange = (slug: string) => {
    setSlugManuallySet(true);
    setFormData((prev) => ({
      ...prev,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    }));
  };

  const validateStep = (step: Step): string | null => {
    switch (step) {
      case 'company':
        if (!formData.name.trim()) return 'Company name is required';
        if (!formData.slug.trim()) return 'Subdomain is required';
        if (formData.slug.length < 3) return 'Subdomain must be at least 3 characters';
        return null;
      case 'owner':
        if (!formData.ownerName.trim()) return 'Owner name is required';
        if (!formData.ownerEmail.trim()) return 'Owner email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.ownerEmail)) return 'Invalid email format';
        return null;
      case 'branding':
        return null; // All optional
      case 'review':
        return null;
    }
  };

  const goToNextStep = () => {
    const validationError = validateStep(currentStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].key);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].key);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);

    const invitationToken = crypto.randomUUID();
    const inviteLink = `${window.location.origin}/invite/${invitationToken}`;

    if (!isSupabaseConfigured()) {
      // Mock success for development
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log('Would create organization:', formData);
      console.log('Invitation link:', inviteLink);
      setCreatedOrg({ id: 'mock-org-id', inviteLink });
      setIsLoading(false);
      return;
    }

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/credentials/create-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          planTier: formData.planTier,
          ownerEmail: formData.ownerEmail,
          ownerName: formData.ownerName,
          logoUrl: formData.logoUrl,
          primaryColor: formData.primaryColor,
          secondaryColor: formData.secondaryColor,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create organization. Please try again.');
      }

      setCreatedOrg({
        id: data.organization.id,
        inviteLink: data.inviteLink || inviteLink,
      });
    } catch (err) {
      console.error('Failed to create organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to create organization. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Success state after creation
  if (createdOrg) {
    return (
      <div className="admin-create-org">
        <div className="admin-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Organization Created
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
            {formData.name} is now set up and ready for the owner to access.
          </p>

          {/* Organization summary */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '32px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Portal URL
                </div>
                <a
                  href={`https://${formData.slug}.convertra.io`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-violet)', fontWeight: 600 }}
                >
                  {formData.slug}.convertra.io
                </a>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Owner
                </div>
                <div style={{ fontWeight: 500 }}>{formData.ownerName}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{formData.ownerEmail}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Plan
                </div>
                <span className={`admin-badge-pill ${formData.planTier}`}>
                  {formData.planTier.charAt(0).toUpperCase() + formData.planTier.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Invitation link */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(212, 225, 87, 0.1))',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Invitation Link
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Send this link to {formData.ownerName} to complete their account setup. Expires in 7 days.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                background: 'var(--bg-card)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <input
                type="text"
                value={createdOrg.inviteLink}
                readOnly
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdOrg.inviteLink);
                  alert('Copied to clipboard!');
                }}
                className="admin-btn admin-btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Next steps */}
          <div style={{ textAlign: 'left', marginBottom: '32px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Next Steps
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
                <input type="checkbox" style={{ width: '18px', height: '18px' }} />
                <span>Send invitation link to {formData.ownerEmail}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
                <input type="checkbox" style={{ width: '18px', height: '18px' }} />
                <span>Connect their Meta Ads Manager</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
                <input type="checkbox" style={{ width: '18px', height: '18px' }} />
                <span>Set up billing in Stripe</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate(`/admin/organizations/${createdOrg.id}`)}
              className="admin-btn admin-btn-primary"
            >
              Manage Organization
            </button>
            <button onClick={() => navigate('/admin/organizations')} className="admin-btn admin-btn-secondary">
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-create-org">
      {/* Breadcrumb Navigation */}
      <nav className="admin-breadcrumb" style={{ marginBottom: '20px' }}>
        <Link to="/admin" className="admin-breadcrumb-link">Dashboard</Link>
        <span className="admin-breadcrumb-separator">/</span>
        <Link to="/admin/organizations" className="admin-breadcrumb-link">Organizations</Link>
        <span className="admin-breadcrumb-separator">/</span>
        <span className="admin-breadcrumb-current">Create</span>
      </nav>

      <div className="admin-page-header">
        <h1 className="admin-page-title">Create Organization</h1>
        <p className="admin-page-subtitle">White-glove onboarding for a new client</p>
      </div>

      {/* Stepper */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '32px',
          gap: '8px',
        }}
      >
        {STEPS.map((step, index) => {
          const isActive = step.key === currentStep;
          const isCompleted = index < currentStepIndex;
          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <button
                onClick={() => index < currentStepIndex && setCurrentStep(step.key)}
                disabled={index > currentStepIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '100px',
                  border: 'none',
                  cursor: index <= currentStepIndex ? 'pointer' : 'default',
                  background: isActive
                    ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-violet))'
                    : isCompleted
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'var(--bg-secondary)',
                  color: isActive ? '#1e293b' : isCompleted ? '#22c55e' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
              >
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isActive ? 'rgba(255,255,255,0.3)' : isCompleted ? '#22c55e' : 'var(--bg-card)',
                    color: isCompleted ? 'white' : 'inherit',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {isCompleted ? '✓' : index + 1}
                </span>
                <span style={{ display: 'none', '@media (min-width: 600px)': { display: 'inline' } } as React.CSSProperties}>
                  {step.label}
                </span>
              </button>
              {index < STEPS.length - 1 && (
                <div
                  style={{
                    width: '24px',
                    height: '2px',
                    background: isCompleted ? '#22c55e' : 'var(--border-primary)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="admin-card">
        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              color: '#dc2626',
              marginBottom: '24px',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        {/* Step 1: Company */}
        {currentStep === 'company' && (
          <div className="admin-form">
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Company Details
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Enter the client's company information and choose their plan.
            </p>

            <div className="admin-form-group">
              <label className="admin-form-label">Company Name *</label>
              <input
                type="text"
                className="admin-form-input"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Subdomain *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  className="admin-form-input"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="acme-corp"
                  style={{ flex: 1 }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '14px', whiteSpace: 'nowrap' }}>.convertra.io</span>
              </div>
              <span className="admin-form-help">This will be their unique portal URL</span>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Plan *</label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {(['enterprise', 'pro', 'free'] as PlanTier[]).map((tier) => (
                  <label
                    key={tier}
                    style={{
                      flex: '1 1 140px',
                      padding: '16px',
                      borderRadius: '12px',
                      border: `2px solid ${formData.planTier === tier ? 'var(--accent-violet)' : 'var(--border-primary)'}`,
                      background: formData.planTier === tier ? 'rgba(168, 85, 247, 0.05)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={tier}
                      checked={formData.planTier === tier}
                      onChange={() => setFormData((prev) => ({ ...prev, planTier: tier }))}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontWeight: 600, marginBottom: '4px', textTransform: 'capitalize' }}>{tier}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {tier === 'enterprise' ? '$499/mo' : tier === 'pro' ? '$99/mo' : 'Free'}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Owner */}
        {currentStep === 'owner' && (
          <div className="admin-form">
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Owner Details
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              The owner will receive an invitation to access their portal.
            </p>

            <div className="admin-form-group">
              <label className="admin-form-label">Full Name *</label>
              <input
                type="text"
                className="admin-form-input"
                value={formData.ownerName}
                onChange={(e) => setFormData((prev) => ({ ...prev, ownerName: e.target.value }))}
                placeholder="Jane Smith"
                autoFocus
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Email Address *</label>
              <input
                type="email"
                className="admin-form-input"
                value={formData.ownerEmail}
                onChange={(e) => setFormData((prev) => ({ ...prev, ownerEmail: e.target.value }))}
                placeholder="jane@acme.com"
              />
              <span className="admin-form-help">They'll use this to log in to their portal</span>
            </div>
          </div>
        )}

        {/* Step 3: Branding */}
        {currentStep === 'branding' && (
          <div className="admin-form">
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Branding
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Customize the portal with the client's brand. All fields are optional.
            </p>

            <div className="admin-form-group">
              <label className="admin-form-label">Logo URL</label>
              <input
                type="url"
                className="admin-form-input"
                value={formData.logoUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, logoUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
              <span className="admin-form-help">Direct link to PNG or SVG logo file</span>
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Primary Color</label>
                <div className="admin-color-picker">
                  <input
                    type="color"
                    className="admin-color-swatch"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="admin-form-input admin-color-input"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  />
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Secondary Color</label>
                <div className="admin-color-picker">
                  <input
                    type="color"
                    className="admin-color-swatch"
                    value={formData.secondaryColor}
                    onChange={(e) => setFormData((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="admin-form-input admin-color-input"
                    value={formData.secondaryColor}
                    onChange={(e) => setFormData((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div
              style={{
                marginTop: '24px',
                padding: '20px',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>
                Preview
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Logo"
                    style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
                    onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                  />
                ) : (
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: 'var(--bg-card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {formData.name.charAt(0) || '?'}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: formData.primaryColor }} />
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: formData.secondaryColor }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 'review' && (
          <div className="admin-form">
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Review & Create
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Please review the details before creating the organization.
            </p>

            <div style={{ display: 'grid', gap: '24px' }}>
              {/* Company */}
              <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Company</span>
                  <button
                    onClick={() => setCurrentStep('company')}
                    style={{ fontSize: '13px', color: 'var(--accent-violet)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>{formData.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                  {formData.slug}.convertra.io
                </div>
                <span className={`admin-badge-pill ${formData.planTier}`}>
                  {formData.planTier.charAt(0).toUpperCase() + formData.planTier.slice(1)}
                </span>
              </div>

              {/* Owner */}
              <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Owner</span>
                  <button
                    onClick={() => setCurrentStep('owner')}
                    style={{ fontSize: '13px', color: 'var(--accent-violet)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>{formData.ownerName}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{formData.ownerEmail}</div>
              </div>

              {/* Branding */}
              <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Branding</span>
                  <button
                    onClick={() => setCurrentStep('branding')}
                    style={{ fontSize: '13px', color: 'var(--accent-violet)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {formData.logoUrl ? (
                    <img src={formData.logoUrl} alt="Logo" style={{ height: '32px', width: 'auto' }} />
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No logo</span>
                  )}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: formData.primaryColor }} />
                    <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: formData.secondaryColor }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="admin-actions" style={{ marginTop: '32px' }}>
          {currentStep !== 'company' && (
            <button type="button" onClick={goToPrevStep} className="admin-btn admin-btn-secondary" disabled={isLoading}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {currentStep !== 'review' ? (
            <button type="button" onClick={goToNextStep} className="admin-btn admin-btn-primary">
              Continue
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} className="admin-btn admin-btn-primary" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid currentColor',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  Creating...
                </>
              ) : (
                'Create Organization'
              )}
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default CreateOrganization;
