import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { getOrgMetaIds } from '../services/metaApi';
import MetaOnboardingSetup from './MetaOnboardingSetup';
import './OnboardingChecklist.css';

interface OnboardingChecklistProps {
  notification?: { type: 'success' | 'error'; message: string } | null;
  onDismissNotification?: () => void;
}

export default function OnboardingChecklist({ notification, onDismissNotification }: OnboardingChecklistProps) {
  const { organization, loading: orgLoading, error: orgError, refresh } = useOrganization();
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const orgId = organization?.id;
  const storageKey = orgId ? `ci_onboarding_dismissed_${orgId}` : null;
  const collapseKey = orgId ? `ci_onboarding_collapsed_${orgId}` : null;

  useEffect(() => {
    if (storageKey) {
      setDismissed(localStorage.getItem(storageKey) === 'true');
    }
    if (collapseKey) {
      setCollapsed(localStorage.getItem(collapseKey) === 'true');
    }
  }, [storageKey, collapseKey]);

  // If explicitly dismissed (per-org), hide
  if (dismissed && organization) return null;

  // If org is fully set up, hide
  if (organization?.setup_completed === true) return null;

  // Show a loading/error state while org is being provisioned
  if (orgLoading && !organization) {
    return (
      <div className="onboarding-checklist">
        <div className="onboarding-header">
          <div className="onboarding-header-left">
            <div className="onboarding-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <h2 className="onboarding-title">Welcome to Convertra</h2>
              <p className="onboarding-subtitle">Setting up your account...</p>
            </div>
          </div>
        </div>
        <div className="onboarding-progress">
          <div className="onboarding-progress-bar onboarding-progress-indeterminate" />
        </div>
      </div>
    );
  }

  // If org provisioning failed, show error with retry
  if (!organization && orgError) {
    return (
      <div className="onboarding-checklist onboarding-checklist-error">
        <div className="onboarding-header">
          <div className="onboarding-header-left">
            <div className="onboarding-icon onboarding-icon-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h2 className="onboarding-title">Account Setup Issue</h2>
              <p className="onboarding-subtitle">{orgError}</p>
            </div>
          </div>
        </div>
        <button
          className="onboarding-retry-btn"
          onClick={async () => {
            setRetrying(true);
            try { await refresh(); } finally { setRetrying(false); }
          }}
          disabled={retrying}
        >
          {retrying ? 'Retrying...' : 'Retry Setup'}
        </button>
      </div>
    );
  }

  // If org is still null after loading (no error but no org — shouldn't happen, but defensive)
  if (!organization) return null;

  const metaIds = getOrgMetaIds();
  const metaFullyConfigured = metaIds?.connected === true && !!metaIds?.adAccountId && !!metaIds?.pageId;

  const steps = [
    { label: 'Account created', done: true, link: null },
    { label: 'Connect Meta Ads', done: metaFullyConfigured, link: null },
    { label: 'Explore your dashboard', done: false, link: '/dashboard' },
    { label: 'Analyze your creatives', done: false, link: '/channels/meta-ads' },
    { label: 'Generate new ads with CreativeIQ™', done: false, link: '/creatives' },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
  };

  const handleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (collapseKey) {
      localStorage.setItem(collapseKey, String(next));
    }
  };

  const handleMetaConfigured = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="onboarding-checklist">
      <div className="onboarding-header">
        <div className="onboarding-header-left">
          <div className="onboarding-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div>
            <h2 className="onboarding-title">Welcome to Convertra</h2>
            <p className="onboarding-subtitle">
              {completedCount}/{totalCount} steps complete — get set up to unlock your full ad intelligence.
            </p>
          </div>
        </div>
        <div className="onboarding-actions">
          <button onClick={handleCollapse} className="onboarding-collapse" aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button onClick={handleDismiss} className="onboarding-dismiss" aria-label="Dismiss checklist">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="onboarding-progress">
        <div className="onboarding-progress-bar" style={{ width: `${(completedCount / totalCount) * 100}%` }} />
      </div>

      {!collapsed && (
        <>
          <div className="onboarding-steps">
            {steps.map((step, i) => (
              <div key={i} className={`onboarding-step ${step.done ? 'done' : ''}`}>
                <div className="onboarding-check">
                  {step.done ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="onboarding-check-empty" />
                  )}
                </div>
                {step.link && !step.done ? (
                  <Link to={step.link} className="onboarding-step-label onboarding-step-link">
                    {step.label}
                  </Link>
                ) : (
                  <span className="onboarding-step-label">{step.label}</span>
                )}
              </div>
            ))}
          </div>

          {!metaFullyConfigured && (
            <MetaOnboardingSetup
              onConfigured={handleMetaConfigured}
              notification={notification}
              onDismissNotification={onDismissNotification}
            />
          )}
        </>
      )}
    </div>
  );
}
