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
  Check,
  X,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Crown,
  Building2,
  Clock,
  Zap,
} from 'lucide-react';
import './Billing.css';

const Billing = () => {
  const [searchParams] = useSearchParams();
  const { organization, isTrialing, isSubscriptionValid, trialDaysRemaining } = useOrganization();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [upgrading, setUpgrading] = useState<PlanTier | null>(null);
  const [smallBizTab, setSmallBizTab] = useState<'starter' | 'pro'>('starter');
  const [enterpriseTab, setEnterpriseTab] = useState<'enterprise' | 'velocity_partner'>('enterprise');
  const [usePromoCode, setUsePromoCode] = useState(false);

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
      setError('Organization not found. Please sign out and sign back in.');
      return;
    }

    try {
      setUpgrading(planTier);
      setError(null);
      await redirectToCheckout(planTier, billingInterval, organization.id, usePromoCode);
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

  const trialExpired = organization?.subscription_status === 'trialing' && !isSubscriptionValid;

  const getTierIcon = (tier: PlanTier) => {
    switch (tier) {
      case 'starter':
        return <Sparkles size={20} strokeWidth={1.5} />;
      case 'pro':
        return <Crown size={20} strokeWidth={1.5} />;
      case 'enterprise':
        return <Building2 size={20} strokeWidth={1.5} />;
      case 'velocity_partner':
        return <Building2 size={20} strokeWidth={1.5} />;
      default:
        return <Sparkles size={20} strokeWidth={1.5} />;
    }
  };

  const getTierBadgeClass = (tier: PlanTier) => {
    switch (tier) {
      case 'starter':
        return 'tier-badge-starter';
      case 'pro':
        return 'tier-badge-pro';
      case 'enterprise':
        return 'tier-badge-enterprise';
      case 'velocity_partner':
        return 'tier-badge-velocity-partner';
      default:
        return 'tier-badge-starter';
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

      {/* Trial Expired Alert */}
      {trialExpired && (
        <div className="billing-alert billing-alert-error">
          <AlertCircle size={20} strokeWidth={1.5} />
          <span>Your free trial has expired. Upgrade to Pro to continue using Convertra.</span>
        </div>
      )}

      {/* Trial Status Card */}
      {isTrialing && trialDaysRemaining > 0 && (
        <div className="trial-status-card glass">
          <div className="trial-status-info">
            <Clock size={20} strokeWidth={1.5} />
            <div>
              <p className="trial-status-title">
                <strong>{trialDaysRemaining === 1 ? '1 day' : `${trialDaysRemaining} days`}</strong> remaining in your free trial
              </p>
              <p className="trial-status-desc">
                Subscribe now to lock in the early-bird rate of <strong>$89/month</strong> (regular price $99/month)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="current-plan-card glass">
        <div className="current-plan-header">
          <div className="current-plan-info">
            <div className={`tier-badge ${getTierBadgeClass(currentPlanTier)}`}>
              {getTierIcon(currentPlanTier)}
              <span>{PRICING_PLANS.find((p) => p.id === currentPlanTier)?.name || currentPlanTier.charAt(0).toUpperCase() + currentPlanTier.slice(1)}</span>
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

        <div className="promo-code-toggle">
          <label className="promo-toggle-label">
            <input
              type="checkbox"
              checked={usePromoCode}
              onChange={(e) => setUsePromoCode(e.target.checked)}
            />
            <span>I have a promo code</span>
          </label>
          {usePromoCode && (
            <p className="promo-toggle-hint">
              You'll be able to enter your code at checkout
            </p>
          )}
        </div>

        <div className="pricing-grid">
          {/* Small Business Card with Tabs */}
          {(() => {
            const smallBizPlan = PRICING_PLANS.find((p) => p.id === smallBizTab);
            if (!smallBizPlan) return null;
            const isCurrentSmallBiz = currentPlanTier === smallBizTab && organization?.subscription_status === 'active';
            return (
              <div className={`smallbiz-tabbed-card glass ${isCurrentSmallBiz ? 'plan-current' : ''}`}>
                <div className="smallbiz-label">Small Business</div>
                <div className="tabbed-card-tabs">
                  <button
                    className={`tabbed-card-tab ${smallBizTab === 'starter' ? 'active' : ''}`}
                    onClick={() => setSmallBizTab('starter')}
                  >
                    <Sparkles size={16} strokeWidth={1.5} />
                    Starter
                  </button>
                  <button
                    className={`tabbed-card-tab ${smallBizTab === 'pro' ? 'active' : ''}`}
                    onClick={() => setSmallBizTab('pro')}
                  >
                    <Crown size={16} strokeWidth={1.5} />
                    Pro
                  </button>
                </div>

                <PlanCard
                  plan={smallBizPlan}
                  billingInterval={billingInterval}
                  isCurrentPlan={isCurrentSmallBiz}
                  onUpgrade={() => handleUpgrade(smallBizTab)}
                  upgrading={upgrading === smallBizTab}
                  currentTier={currentPlanTier}
                  showEarlyBird={smallBizTab === 'starter' && isTrialing && trialDaysRemaining > 0}
                  embedded
                />
              </div>
            );
          })()}

          {/* Enterprise Card with Tabs */}
          {(() => {
            const enterprisePlan = PRICING_PLANS.find((p) => p.id === enterpriseTab);
            if (!enterprisePlan) return null;
            const isCurrentEnterprise = currentPlanTier === enterpriseTab && organization?.subscription_status === 'active';
            return (
              <div className={`enterprise-tabbed-card glass ${isCurrentEnterprise ? 'plan-current' : ''}`}>
                <div className="enterprise-label">Enterprise Solutions</div>
                <div className="tabbed-card-tabs">
                  <button
                    className={`tabbed-card-tab ${enterpriseTab === 'enterprise' ? 'active' : ''}`}
                    onClick={() => setEnterpriseTab('enterprise')}
                  >
                    <Building2 size={16} strokeWidth={1.5} />
                    Self-Service
                  </button>
                  <button
                    className={`tabbed-card-tab ${enterpriseTab === 'velocity_partner' ? 'active' : ''}`}
                    onClick={() => setEnterpriseTab('velocity_partner')}
                  >
                    <Zap size={16} strokeWidth={1.5} />
                    Velocity Partner
                  </button>
                </div>

                <PlanCard
                  plan={enterprisePlan}
                  billingInterval={billingInterval}
                  isCurrentPlan={isCurrentEnterprise}
                  onUpgrade={() => handleUpgrade(enterpriseTab)}
                  upgrading={upgrading === enterpriseTab}
                  currentTier={currentPlanTier}
                  embedded
                />
              </div>
            );
          })()}
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
  showEarlyBird?: boolean;
  embedded?: boolean;
}

const PlanCard = ({
  plan,
  billingInterval,
  isCurrentPlan,
  onUpgrade,
  upgrading,
  currentTier,
  showEarlyBird,
  embedded,
}: PlanCardProps) => {
  const regularPrice = billingInterval === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const hasEarlyBird = showEarlyBird && plan.earlyBirdPrice && billingInterval === 'monthly';
  const displayPrice = hasEarlyBird ? plan.earlyBirdPrice! : regularPrice;
  const isDowngrade = getTierOrder(plan.id) < getTierOrder(currentTier);

  return (
    <div
      className={`plan-card ${embedded ? 'plan-card-embedded' : 'glass'} ${plan.popular ? 'plan-popular' : ''} ${isCurrentPlan ? 'plan-current' : ''}`}
    >
      {!embedded && hasEarlyBird && <div className="early-bird-badge">Early Bird</div>}
      {!embedded && !hasEarlyBird && plan.popular && <div className="popular-badge">Most Popular</div>}

      <div className="plan-header">
        <h4 className="plan-name">{plan.name}</h4>
        <p className="plan-description">{plan.description}</p>
      </div>

      <div className="plan-price">
        <span className="price-amount">${displayPrice.toLocaleString()}</span>
        <span className="price-interval">/ mo</span>
      </div>
      {hasEarlyBird && (
        <p className="plan-price-note">
          <span className="plan-price-original">${regularPrice}/mo</span> regular price
        </p>
      )}
      {plan.setupFee && (
        <p className="plan-price-note">
          + ${plan.setupFee.toLocaleString()} one-time setup fee
        </p>
      )}

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
        {plan.features.dedicatedAccount && (
          <li>
            <Check size={16} strokeWidth={1.5} />
            <span>Dedicated account manager</span>
          </li>
        )}
        {plan.id === 'velocity_partner' && (
          <>
            <li>
              <Check size={16} strokeWidth={1.5} />
              <span>Managed media buying</span>
            </li>
            <li>
              <Check size={16} strokeWidth={1.5} />
              <span>Weekly creative output quota</span>
            </li>
          </>
        )}
      </ul>

      <button
        className={`plan-cta ${isCurrentPlan ? 'plan-cta-current' : ''}`}
        onClick={onUpgrade}
        disabled={isCurrentPlan || upgrading}
      >
        {upgrading ? (
          <span className="spinner-small" />
        ) : isCurrentPlan ? (
          'Current Plan'
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
