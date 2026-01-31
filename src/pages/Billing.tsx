import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../components/Loading';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  fetchBillingData,
  redirectToCheckout,
  redirectToPortal,
  PRICING_PLANS,
  formatPrice,
  isStripeConfigured,
  getTierOrder,
} from '../services/stripeApi';
import type { BillingData, PricingPlan, PlanTier, BillingInterval } from '../types/billing';
import {
  CreditCard,
  Sparkles,
  BarChart3,
  Users,
  Zap,
  Check,
  X,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Crown,
  Building2,
} from 'lucide-react';
import './Billing.css';

const Billing = () => {
  const [searchParams] = useSearchParams();
  const { organization } = useOrganization();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [upgrading, setUpgrading] = useState<PlanTier | null>(null);

  // Check for success/cancel from Stripe checkout
  const checkoutSuccess = searchParams.get('success') === 'true';
  const checkoutCanceled = searchParams.get('canceled') === 'true';

  useEffect(() => {
    loadBillingData();
  }, [organization?.id]);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      const data = await fetchBillingData(organization?.id);
      setBillingData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load billing data';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planTier: PlanTier) => {
    if (!isStripeConfigured()) {
      setError('Stripe is not configured. Please contact support.');
      return;
    }

    if (!organization?.id) {
      setError('Organization not found. Please refresh the page.');
      return;
    }

    try {
      setUpgrading(planTier);
      setError(null);
      await redirectToCheckout(planTier, billingInterval, organization.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      setError(message);
      setUpgrading(null);
    }
  };

  const handleManagePayment = async () => {
    if (!isStripeConfigured()) {
      setError('Stripe is not configured. Please contact support.');
      return;
    }

    try {
      setError(null);
      await redirectToPortal(organization?.id, organization?.stripe_customer_id || undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open payment portal';
      setError(message);
    }
  };

  // Use organization plan tier if available, fallback to billing data
  const currentPlanTier: PlanTier = organization?.plan_tier || billingData?.subscription?.planTier || 'free';

  const getTierIcon = (tier: PlanTier) => {
    switch (tier) {
      case 'free':
        return <Zap size={20} strokeWidth={1.5} />;
      case 'pro':
        return <Crown size={20} strokeWidth={1.5} />;
      case 'enterprise':
        return <Building2 size={20} strokeWidth={1.5} />;
    }
  };

  const getTierBadgeClass = (tier: PlanTier) => {
    switch (tier) {
      case 'free':
        return 'tier-badge-free';
      case 'pro':
        return 'tier-badge-pro';
      case 'enterprise':
        return 'tier-badge-enterprise';
    }
  };

  if (loading) {
    return <Loading size="large" message="ConversionIQ™ syncing billing..." />;
  }

  return (
    <div className="billing-page">
      <div className="billing-header">
        <h1 className="billing-title">Billing</h1>
        <p className="billing-subtitle">Manage your subscription and usage</p>
      </div>

      {/* Success/Error Messages */}
      {checkoutSuccess && (
        <div className="billing-alert billing-alert-success">
          <CheckCircle size={20} strokeWidth={1.5} />
          <span>Your subscription has been updated successfully!</span>
        </div>
      )}

      {checkoutCanceled && (
        <div className="billing-alert billing-alert-warning">
          <AlertCircle size={20} strokeWidth={1.5} />
          <span>Checkout was canceled. No changes were made.</span>
        </div>
      )}

      {error && (
        <div className="billing-alert billing-alert-error">
          <AlertCircle size={20} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="current-plan-card glass">
        <div className="current-plan-header">
          <div className="current-plan-info">
            <div className={`tier-badge ${getTierBadgeClass(currentPlanTier)}`}>
              {getTierIcon(currentPlanTier)}
              <span>{currentPlanTier.charAt(0).toUpperCase() + currentPlanTier.slice(1)}</span>
            </div>
            <h2 className="current-plan-name">
              {PRICING_PLANS.find((p) => p.id === currentPlanTier)?.name} Plan
            </h2>
            {billingData?.subscription && (
              <p className="current-plan-period">
                {billingData.subscription.billingInterval === 'yearly' ? 'Annual' : 'Monthly'}{' '}
                billing
                {billingData.subscription.cancelAtPeriodEnd && ' (Cancels at period end)'}
              </p>
            )}
          </div>
          {billingData?.subscription && (
            <button className="manage-payment-btn" onClick={handleManagePayment}>
              <CreditCard size={18} strokeWidth={1.5} />
              Manage Payment
              <ExternalLink size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {billingData?.paymentMethodLast4 && (
          <div className="payment-method-info">
            <CreditCard size={16} strokeWidth={1.5} />
            <span>
              {billingData.paymentMethodBrand?.toUpperCase()} ending in{' '}
              {billingData.paymentMethodLast4}
            </span>
          </div>
        )}
      </div>

      {/* Usage Section */}
      <div className="usage-section">
        <h3 className="section-title">Current Usage</h3>
        <div className="usage-grid">
          <div className="usage-card glass">
            <div className="usage-header">
              <Sparkles size={20} strokeWidth={1.5} />
              <span>Creatives Generated</span>
            </div>
            <div className="usage-progress">
              <div className="usage-values">
                <span className="usage-current">{billingData?.usage.creativesGenerated || 0}</span>
                <span className="usage-limit">
                  /{' '}
                  {billingData?.usage.creativesLimit === -1
                    ? 'Unlimited'
                    : billingData?.usage.creativesLimit}
                </span>
              </div>
              {billingData?.usage.creativesLimit !== -1 && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        ((billingData?.usage.creativesGenerated || 0) /
                          (billingData?.usage.creativesLimit || 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="usage-card glass">
            <div className="usage-header">
              <BarChart3 size={20} strokeWidth={1.5} />
              <span>Analyses Run</span>
            </div>
            <div className="usage-progress">
              <div className="usage-values">
                <span className="usage-current">{billingData?.usage.analysesRun || 0}</span>
                <span className="usage-limit">
                  /{' '}
                  {billingData?.usage.analysesLimit === -1
                    ? 'Unlimited'
                    : billingData?.usage.analysesLimit}
                </span>
              </div>
              {billingData?.usage.analysesLimit !== -1 && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        ((billingData?.usage.analysesRun || 0) /
                          (billingData?.usage.analysesLimit || 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Plans */}
      <div className="pricing-section">
        <div className="pricing-header">
          <h3 className="section-title">Plans</h3>
          <div className="billing-toggle">
            <button
              className={`toggle-btn ${billingInterval === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingInterval('monthly')}
            >
              Monthly
            </button>
            <button
              className={`toggle-btn ${billingInterval === 'yearly' ? 'active' : ''}`}
              onClick={() => setBillingInterval('yearly')}
            >
              Yearly
              <span className="save-badge">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="pricing-grid">
          {PRICING_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billingInterval={billingInterval}
              isCurrentPlan={currentPlanTier === plan.id}
              onUpgrade={() => handleUpgrade(plan.id)}
              upgrading={upgrading === plan.id}
              currentTier={currentPlanTier}
            />
          ))}
        </div>
      </div>

      {/* Billing History */}
      {billingData?.invoices && billingData.invoices.length > 0 && (
        <div className="invoices-section">
          <h3 className="section-title">Billing History</h3>
          <div className="invoices-table glass">
            <div className="invoice-header">
              <span>Date</span>
              <span>Description</span>
              <span>Amount</span>
              <span>Status</span>
              <span></span>
            </div>
            {billingData.invoices.map((invoice) => (
              <div key={invoice.id} className="invoice-row">
                <span>{new Date(invoice.date).toLocaleDateString()}</span>
                <span>{invoice.description}</span>
                <span>{formatPrice(invoice.amount)}</span>
                <span className={`invoice-status invoice-status-${invoice.status}`}>
                  {invoice.status}
                </span>
                <span>
                  {invoice.invoiceUrl && (
                    <a
                      href={invoice.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="invoice-link"
                    >
                      View <ExternalLink size={14} strokeWidth={1.5} />
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Plan Card Component
interface PlanCardProps {
  plan: PricingPlan;
  billingInterval: BillingInterval;
  isCurrentPlan: boolean;
  onUpgrade: () => void;
  upgrading: boolean;
  currentTier: PlanTier;
}

const PlanCard = ({
  plan,
  billingInterval,
  isCurrentPlan,
  onUpgrade,
  upgrading,
  currentTier,
}: PlanCardProps) => {
  const price = billingInterval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const isDowngrade = getTierOrder(plan.id) < getTierOrder(currentTier);

  return (
    <div
      className={`plan-card glass ${plan.popular ? 'plan-popular' : ''} ${isCurrentPlan ? 'plan-current' : ''}`}
    >
      {plan.popular && <div className="popular-badge">Most Popular</div>}

      <div className="plan-header">
        <h4 className="plan-name">{plan.name}</h4>
        <p className="plan-description">{plan.description}</p>
      </div>

      <div className="plan-price">
        <span className="price-amount">${price}</span>
        {plan.monthlyPrice > 0 && <span className="price-interval">/ mo</span>}
      </div>

      <ul className="plan-features">
        <li>
          <Sparkles size={16} strokeWidth={1.5} />
          <span>
            {plan.features.creativesPerMonth === -1
              ? 'Unlimited'
              : plan.features.creativesPerMonth}{' '}
            creatives/month
          </span>
        </li>
        <li>
          <BarChart3 size={16} strokeWidth={1.5} />
          <span>
            {plan.features.analysesPerMonth === -1 ? 'Unlimited' : plan.features.analysesPerMonth}{' '}
            analyses/month
          </span>
        </li>
        <li>
          <Users size={16} strokeWidth={1.5} />
          <span>
            {plan.features.teamMembers === -1 ? 'Unlimited' : plan.features.teamMembers} team
            members
          </span>
        </li>
        <li className={plan.features.prioritySupport ? '' : 'feature-unavailable'}>
          {plan.features.prioritySupport ? (
            <Check size={16} strokeWidth={1.5} />
          ) : (
            <X size={16} strokeWidth={1.5} />
          )}
          <span>Priority support</span>
        </li>
        <li className={plan.features.apiAccess ? '' : 'feature-unavailable'}>
          {plan.features.apiAccess ? (
            <Check size={16} strokeWidth={1.5} />
          ) : (
            <X size={16} strokeWidth={1.5} />
          )}
          <span>API access</span>
        </li>
      </ul>

      <button
        className={`plan-cta ${isCurrentPlan ? 'plan-cta-current' : ''}`}
        onClick={onUpgrade}
        disabled={isCurrentPlan || upgrading || plan.id === 'free'}
      >
        {upgrading ? (
          <span className="spinner-small" />
        ) : isCurrentPlan ? (
          'Current Plan'
        ) : plan.id === 'free' ? (
          'Free Forever'
        ) : isDowngrade ? (
          'Downgrade'
        ) : (
          'Upgrade'
        )}
      </button>
    </div>
  );
};

export default Billing;
