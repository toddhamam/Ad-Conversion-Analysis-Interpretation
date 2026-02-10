import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { redirectToCheckout, PRICING_PLANS } from '../services/stripeApi';
import type { PlanTier, BillingInterval } from '../types/billing';
import Loading from '../components/Loading';
import SEO from '../components/SEO';
import { Check } from 'lucide-react';
import './ChoosePlan.css';

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5175';

const TRIAL_PLANS = PRICING_PLANS.filter(p => p.id === 'starter' || p.id === 'pro');

const FEATURE_LABELS: Record<string, string> = {
  creativesPerMonth: 'Creatives / month',
  analysesPerMonth: 'Analyses / month',
  channels: 'Connected channels',
  teamMembers: 'Team members',
  prioritySupport: 'Priority support',
  apiAccess: 'API access',
};

function ChoosePlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization, refresh } = useOrganization();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [upgrading, setUpgrading] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkoutSuccess = searchParams.get('success') === 'true';
  const checkoutCanceled = searchParams.get('canceled') === 'true';

  // Redirect if user already has an active/trialing subscription
  useEffect(() => {
    if (!organization) return;
    const status = organization.subscription_status;
    if (status === 'active' || status === 'trialing' || status === 'past_due') {
      navigate('/dashboard', { replace: true });
    }
  }, [organization, navigate]);

  // Poll for subscription activation after checkout success
  useEffect(() => {
    if (!checkoutSuccess || !organization) return;
    if (organization.subscription_status !== 'incomplete') {
      navigate('/dashboard', { replace: true });
      return;
    }

    pollRef.current = setInterval(async () => {
      await refresh();
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkoutSuccess, organization, refresh, navigate]);

  const handleSelectPlan = async (planTier: PlanTier) => {
    if (!organization?.id) return;

    try {
      setUpgrading(planTier);
      setError(null);
      await redirectToCheckout(planTier, billingInterval, organization.id, false, {
        trialDays: 7,
        successUrl: `${APP_URL}/choose-plan?success=true`,
        cancelUrl: `${APP_URL}/choose-plan?canceled=true`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      setError(message);
      setUpgrading(null);
    }
  };

  // Show loading while waiting for webhook after checkout
  if (checkoutSuccess) {
    return (
      <div className="choose-plan-page">
        <Loading size="large" message="ConversionIQ™ activating your trial..." />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="choose-plan-page">
        <Loading size="large" message="ConversionIQ™ initializing..." />
      </div>
    );
  }

  return (
    <div className="choose-plan-page">
      <SEO
        title="Choose Your Plan | Convertra"
        description="Start your 7-day free trial of Convertra. Choose between Starter and Pro plans."
        canonical="/choose-plan"
        noindex={true}
      />
      <div className="choose-plan-container">
        <div className="choose-plan-header">
          <Link to="/" className="choose-plan-logo">
            <img src="/convertra-logo.png" alt="Convertra" />
          </Link>
          <h1 className="choose-plan-title">Choose your plan</h1>
          <p className="choose-plan-subtitle">Start your 7-day free trial. No charge until your trial ends.</p>
        </div>

        {(error || checkoutCanceled) && (
          <div className="choose-plan-alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error || 'Checkout was canceled. Choose a plan to start your free trial.'}
          </div>
        )}

        <div className="choose-plan-toggle">
          <button
            className={`toggle-option ${billingInterval === 'monthly' ? 'active' : ''}`}
            onClick={() => setBillingInterval('monthly')}
          >
            Monthly
          </button>
          <button
            className={`toggle-option ${billingInterval === 'yearly' ? 'active' : ''}`}
            onClick={() => setBillingInterval('yearly')}
          >
            Yearly
            <span className="toggle-badge">Save 20%</span>
          </button>
        </div>

        <div className="choose-plan-grid">
          {TRIAL_PLANS.map(plan => {
            const price = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const isPopular = plan.id === 'pro';
            const isLoading = upgrading === plan.id;

            return (
              <div key={plan.id} className={`choose-plan-card ${isPopular ? 'popular' : ''}`}>
                {isPopular && <div className="popular-badge">Most Popular</div>}
                <div className="plan-card-header">
                  <h2 className="plan-card-name">{plan.name}</h2>
                  <p className="plan-card-desc">{plan.description}</p>
                </div>
                <div className="plan-card-price">
                  <span className="price-amount">${price}</span>
                  <span className="price-period">/{billingInterval === 'monthly' ? 'mo' : 'mo, billed yearly'}</span>
                </div>
                <button
                  className={`plan-card-cta ${isPopular ? 'cta-popular' : ''}`}
                  onClick={() => handleSelectPlan(plan.id as PlanTier)}
                  disabled={upgrading !== null}
                >
                  {isLoading ? (
                    <>
                      <span className="cta-spinner" />
                      Redirecting...
                    </>
                  ) : (
                    'Start 7-Day Free Trial'
                  )}
                </button>
                <ul className="plan-card-features">
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                    const value = plan.features[key as keyof typeof plan.features];
                    if (value === false) return null;
                    const display = typeof value === 'number'
                      ? value === -1 ? 'Unlimited' : `${value} ${label.toLowerCase()}`
                      : label;
                    return (
                      <li key={key} className="feature-item">
                        <Check size={16} className="feature-check" />
                        <span>{typeof value === 'number' ? display : label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="choose-plan-enterprise">
          <p>
            Need enterprise-grade?{' '}
            <a
              href="https://lunacal.ai/todd-hamam/convertra-live-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="enterprise-link"
            >
              Schedule a Demo
            </a>
          </p>
        </div>

        <p className="choose-plan-trust">
          7-day free trial on all plans. Cancel anytime. No charge until trial ends.
        </p>

        <p className="choose-plan-tagline">
          Powered by <span className="brand-highlight">ConversionIQ™</span>
        </p>
      </div>
    </div>
  );
}

export default ChoosePlan;
