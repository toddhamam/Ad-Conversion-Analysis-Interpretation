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
const ALWAYS_ALLOWED_PATHS = ['/billing', '/account', '/choose-plan', '/integrations'];

/** Routes that require a subscription (action features) */
const ACTION_PATHS = ['/insights', '/creatives', '/publish'];

export default function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { organization, isSubscriptionValid, isSuperAdmin } = useOrganization();
  const location = useLocation();
  const [upgrading, setUpgrading] = useState(false);

  // Always allow billing and account pages
  if (ALWAYS_ALLOWED_PATHS.some(p => location.pathname.startsWith(p))) {
    return <>{children}</>;
  }

  // Super admins always have full access regardless of subscription status
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Free-plan users can explore data pages but are gated on action features
  if (organization?.plan_tier === 'free') {
    const isActionRoute = ACTION_PATHS.some(p => location.pathname.startsWith(p));
    if (!isActionRoute) {
      return <>{children}</>;
    }
    return <FreePlanGate />;
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

function FreePlanGate() {
  return (
    <div className="subscription-gate">
      <div className="subscription-gate-card">
        <div className="subscription-gate-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 className="subscription-gate-title">Choose a Plan to Begin Your Free Trial</h2>
        <p className="subscription-gate-desc">
          Get full access to ConversionIQ™, CreativeIQ™, and all ad intelligence tools with a 7-day free trial.
        </p>
        <Link to="/choose-plan" className="subscription-gate-cta">
          Choose a Plan
        </Link>
        <Link to="/billing" className="subscription-gate-link">
          View all plans
        </Link>
      </div>
    </div>
  );
}

