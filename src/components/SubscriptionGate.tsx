import type { ReactNode } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { redirectToCheckout } from '../services/stripeApi';
import { useState } from 'react';
import './SubscriptionGate.css';

interface SubscriptionGateProps {
  children: ReactNode;
}

/** Routes that are always accessible regardless of subscription status */
const ALWAYS_ALLOWED_PATHS = ['/billing', '/account'];

/** Routes that require a paid subscription (not available during trial) */
const PAID_ONLY_PATHS = ['/seo-iq'];

export default function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { organization, isTrialing, isSubscriptionValid } = useOrganization();
  const location = useLocation();
  const [upgrading, setUpgrading] = useState(false);

  // Always allow billing and account pages
  if (ALWAYS_ALLOWED_PATHS.some(p => location.pathname.startsWith(p))) {
    return <>{children}</>;
  }

  // Block paid-only routes for trial users
  if (PAID_ONLY_PATHS.some(p => location.pathname.startsWith(p)) && isTrialing) {
    return <PaidOnlyGate onUpgrade={handleUpgrade} upgrading={upgrading} />;
  }

  // Block if subscription is not valid (expired trial, canceled, etc.)
  if (organization && !isSubscriptionValid) {
    return <ExpiredTrialGate onUpgrade={handleUpgrade} upgrading={upgrading} />;
  }

  return <>{children}</>;

  async function handleUpgrade() {
    if (!organization?.id) return;
    try {
      setUpgrading(true);
      await redirectToCheckout('pro', 'monthly', organization.id);
    } catch {
      // Redirect to billing page as fallback
      window.location.href = '/billing';
    }
  }
}

function ExpiredTrialGate({ onUpgrade, upgrading }: { onUpgrade: () => void; upgrading: boolean }) {
  return (
    <div className="subscription-gate">
      <div className="subscription-gate-card">
        <div className="subscription-gate-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="subscription-gate-title">Your free trial has ended</h2>
        <p className="subscription-gate-desc">
          Upgrade to Pro to continue using Convertra and unlock all your ad intelligence tools.
        </p>
        <button
          onClick={onUpgrade}
          disabled={upgrading}
          className="subscription-gate-cta"
        >
          {upgrading ? 'Redirecting...' : 'Upgrade to Pro — $99/month'}
        </button>
        <Link to="/billing" className="subscription-gate-link">
          View all plans
        </Link>
      </div>
    </div>
  );
}

function PaidOnlyGate({ onUpgrade, upgrading }: { onUpgrade: () => void; upgrading: boolean }) {
  return (
    <div className="subscription-gate">
      <div className="subscription-gate-card">
        <div className="subscription-gate-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <h2 className="subscription-gate-title">SEO IQ is a paid feature</h2>
        <p className="subscription-gate-desc">
          Upgrade to a paid plan to access SEO IQ and unlock keyword research, content generation, and autopilot publishing.
        </p>
        <button
          onClick={onUpgrade}
          disabled={upgrading}
          className="subscription-gate-cta"
        >
          {upgrading ? 'Redirecting...' : 'Upgrade to Pro — $89/month'}
        </button>
        <Link to="/billing" className="subscription-gate-link">
          View all plans
        </Link>
      </div>
    </div>
  );
}
