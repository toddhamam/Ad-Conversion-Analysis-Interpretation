import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { getOrgMetaIds } from '../services/metaApi';
import './OnboardingChecklist.css';

export default function OnboardingChecklist() {
  const { organization } = useOrganization();
  const [dismissed, setDismissed] = useState(false);

  const orgId = organization?.id;
  const storageKey = orgId ? `ci_onboarding_dismissed_${orgId}` : null;

  useEffect(() => {
    if (storageKey) {
      setDismissed(localStorage.getItem(storageKey) === 'true');
    }
  }, [storageKey]);

  if (dismissed || !organization) return null;

  // If setup is marked complete and this wasn't a fresh org, hide
  if (organization.setup_completed) return null;

  const metaIds = getOrgMetaIds();
  const metaConnected = metaIds?.connected === true;

  const steps = [
    { label: 'Account created', done: true, link: null },
    { label: 'Meta Ads connected', done: metaConnected, link: '/channels/meta-ads' },
    { label: 'Explore your dashboard', done: false, link: '/dashboard' },
    { label: 'Analyze your creatives', done: false, link: '/channels/meta-ads' },
    { label: 'Generate new ads with CreativeIQ', done: false, link: '/creatives' },
  ];

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
  };

  return (
    <div className="onboarding-checklist">
      <div className="onboarding-header">
        <div>
          <h2 className="onboarding-title">Welcome to Convertra</h2>
          <p className="onboarding-subtitle">Get started with these steps to unlock your full ad intelligence.</p>
        </div>
        <button onClick={handleDismiss} className="onboarding-dismiss" aria-label="Dismiss checklist">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

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
    </div>
  );
}
