import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Loading from '../components/Loading';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  fetchBillingData,
  redirectToCheckout,
  redirectToPortal,
  purchaseCreditPack,
  PRICING_PLANS,
  formatPrice,
  isStripeConfigured,
  getTierOrder,
  creditsToShortReadable,
} from '../services/stripeApi';
import { PLAN_LIMITS, CREDIT_COSTS } from '../types/organization';
import type { BillingData, PricingPlan, PlanTier, BillingInterval } from '../types/billing';
import {
  CreditCard,
  Sparkles,
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
  Briefcase,
  Monitor,
  Settings,
  Wallet,
  ImageIcon,
  Video,
  FileText,
  ScanSearch,
  ShoppingBag,
} from 'lucide-react';
import './Billing.css';

const Billing = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { organization, isTrialing, isSubscriptionValid, trialDaysRemaining } = useOrganization();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [upgrading, setUpgrading] = useState<PlanTier | null>(null);
  const [smallBizTab, setSmallBizTab] = useState<'starter' | 'pro'>('starter');
  const [agencyTab, setAgencyTab] = useState<'agency' | 'agency_pro'>('agency');
  const [enterpriseTab, setEnterpriseTab] = useState<'enterprise' | 'velocity_partner'>('enterprise');
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

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
      await redirectToCheckout(planTier, billingInterval, organization.id, true);
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
      case 'free':
        return <Sparkles size={20} strokeWidth={1.5} />;
      case 'starter':
        return <Sparkles size={20} strokeWidth={1.5} />;
      case 'pro':
        return <Crown size={20} strokeWidth={1.5} />;
      case 'agency':
      case 'agency_pro':
        return <Briefcase size={20} strokeWidth={1.5} />;
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
      case 'free':
        return 'tier-badge-free';
      case 'starter':
        return 'tier-badge-starter';
      case 'pro':
        return 'tier-badge-pro';
      case 'agency':
      case 'agency_pro':
        return 'tier-badge-agency';
      case 'enterprise':
        return 'tier-badge-enterprise';
      case 'velocity_partner':
        return 'tier-badge-velocity-partner';
      default:
        return 'tier-badge-free';
    }
  };

  // Seat management data
  const seats = organization?.ad_account_seats ?? 0;
  const seatsUsed = organization?.ad_account_seats_used ?? 0;
  const currentPlanData = PRICING_PLANS.find((p) => p.id === currentPlanTier);
  const currentPlanLimits = PLAN_LIMITS[currentPlanTier];
  const includedSeats = currentPlanLimits?.adAccountsIncluded ?? 0;
  const isUnlimitedTier = currentPlanLimits?.maxAdAccounts === -1;
  // Hide seat management for: unlimited tiers (VP/Enterprise with -1), single-seat orgs, undefined seats
  // Backend uses 999 for velocity_partner, so also check PLAN_LIMITS for the true unlimited flag
  const showSeatManagement = seats > 1 && !isUnlimitedTier;
  // Extra seat cost is based on paid seats (ad_account_seats), not active seats (ad_account_seats_used)
  // If you pay for 5 seats but only activate 3, you're still charged for 5
  const extraSeatsPaid = (includedSeats === -1 || seats === -1) ? 0 : Math.max(0, seats - includedSeats);
  const seatProgressPercent = (seats <= 0 || seats === -1) ? 0 : Math.min(100, (seatsUsed / seats) * 100);

  if (loading) {
    return <Loading size="large" message="ConversionIQ™ syncing billing..." />;
  }

  return (
    <div className="billing-page">
      <div className="billing-header">
        <h1 className="billing-title">Billing and Plans</h1>
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

      {/* Credits Usage Section */}
      <div className="usage-section">
        <h3 className="section-title">Credit Usage</h3>
        {(() => {
          const creditsUsed = billingData?.usage.creditsUsed ?? 0;
          const creditsLimit = billingData?.usage.creditsLimit ?? 0;
          const bonusCredits = billingData?.usage.bonusCredits ?? 0;
          const creditsRemaining = billingData?.usage.creditsRemaining ?? 0;
          const isUnlimited = creditsLimit === -1;
          const totalAvailable = isUnlimited ? -1 : creditsLimit + bonusCredits;
          const percentUsed = isUnlimited || totalAvailable <= 0 ? 0 : Math.min(100, (creditsUsed / totalAvailable) * 100);
          const colorClass = isUnlimited ? 'green' : percentUsed < 50 ? 'green' : percentUsed < 90 ? 'amber' : 'red';

          return (
            <div className="credit-overview-card glass">
              <div className="credit-overview-main">
                <div className="credit-overview-header">
                  <Wallet size={20} strokeWidth={1.5} />
                  <span>Credits Used</span>
                </div>
                <div className="credit-overview-values">
                  <span className="credit-overview-current">{creditsUsed}</span>
                  <span className="credit-overview-limit">
                    / {isUnlimited ? 'Unlimited' : totalAvailable}
                  </span>
                </div>
                {!isUnlimited && totalAvailable > 0 && (
                  <div className="credit-overview-bar">
                    <div
                      className={`credit-overview-fill ${colorClass}`}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                )}
                <div className="credit-overview-remaining">
                  <span className={`credit-remaining-value ${colorClass}`}>
                    {isUnlimited ? 'Unlimited' : `${creditsRemaining} credits remaining`}
                  </span>
                  {bonusCredits > 0 && (
                    <span className="credit-bonus-badge">+{bonusCredits} bonus</span>
                  )}
                </div>
                {!isUnlimited && creditsLimit > 0 && (
                  <p className="credit-overview-equiv">{creditsToShortReadable(creditsRemaining)}</p>
                )}
              </div>

              {/* Breakdown */}
              <div className="credit-breakdown">
                <div className="credit-breakdown-item">
                  <ImageIcon size={14} strokeWidth={1.5} />
                  <span>{billingData?.usage.imageAdsGenerated ?? 0} image ads</span>
                  <span className="credit-breakdown-cost">{CREDIT_COSTS.image_ad} cr each</span>
                </div>
                <div className="credit-breakdown-item">
                  <Video size={14} strokeWidth={1.5} />
                  <span>{billingData?.usage.videoAdsGenerated ?? 0} video ads</span>
                  <span className="credit-breakdown-cost">{CREDIT_COSTS.video_ad} cr each</span>
                </div>
                <div className="credit-breakdown-item">
                  <FileText size={14} strokeWidth={1.5} />
                  <span>{billingData?.usage.textAdsGenerated ?? 0} text ads</span>
                  <span className="credit-breakdown-cost">{CREDIT_COSTS.text_ad} cr each</span>
                </div>
                <div className="credit-breakdown-item">
                  <ScanSearch size={14} strokeWidth={1.5} />
                  <span>{billingData?.usage.analysesRun ?? 0} analyses</span>
                  <span className="credit-breakdown-cost">{CREDIT_COSTS.channel_analysis} cr each</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Credit Packs */}
      {currentPlanTier !== 'free' && currentPlanTier !== 'velocity_partner' && (
        <div className="credit-packs-section">
          <h3 className="section-title">Need More Credits?</h3>
          <p className="credit-packs-subtitle">Purchase additional credits that never expire</p>
          <div className="credit-packs-grid">
            {([
              { id: '50' as const, credits: 50, price: 29 },
              { id: '100' as const, credits: 100, price: 49 },
              { id: '250' as const, credits: 250, price: 99 },
            ]).map((pack) => (
              <div key={pack.id} className="credit-pack-card glass">
                <div className="credit-pack-amount">{pack.credits} credits</div>
                <div className="credit-pack-price">${pack.price}</div>
                <p className="credit-pack-equiv">{creditsToShortReadable(pack.credits)}</p>
                <button
                  className="credit-pack-buy-btn"
                  disabled={buyingPack === pack.id}
                  onClick={async () => {
                    try {
                      setBuyingPack(pack.id);
                      await purchaseCreditPack(pack.id);
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Failed to start checkout';
                      setError(msg);
                      setBuyingPack(null);
                    }
                  }}
                >
                  {buyingPack === pack.id ? <span className="spinner-small" /> : (
                    <>
                      <ShoppingBag size={14} strokeWidth={1.5} />
                      Buy
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

          {/* Agency Card with Tabs */}
          {(() => {
            const agencyPlan = PRICING_PLANS.find((p) => p.id === agencyTab);
            if (!agencyPlan) return null;
            const isCurrentAgency = currentPlanTier === agencyTab && organization?.subscription_status === 'active';
            return (
              <div className={`agency-standalone-card glass ${isCurrentAgency ? 'plan-current' : ''}`}>
                <div className="agency-label">For Agencies</div>
                <div className="tabbed-card-tabs">
                  <button
                    className={`tabbed-card-tab ${agencyTab === 'agency' ? 'active' : ''}`}
                    onClick={() => setAgencyTab('agency')}
                  >
                    <Briefcase size={16} strokeWidth={1.5} />
                    Agency
                  </button>
                  <button
                    className={`tabbed-card-tab ${agencyTab === 'agency_pro' ? 'active' : ''}`}
                    onClick={() => setAgencyTab('agency_pro')}
                  >
                    <Crown size={16} strokeWidth={1.5} />
                    Agency Pro
                  </button>
                </div>
                <PlanCard
                  plan={agencyPlan}
                  billingInterval={billingInterval}
                  isCurrentPlan={isCurrentAgency}
                  onUpgrade={() => handleUpgrade(agencyTab)}
                  upgrading={upgrading === agencyTab}
                  currentTier={currentPlanTier}
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

      {/* Seat Management Card */}
      {showSeatManagement && (
        <div className="seat-management-section">
          <h3 className="section-title">Ad Account Seats</h3>
          <div className="seat-management-card glass">
            <div className="seat-progress">
              <div className="seat-progress-header">
                <span className="seat-progress-label">
                  <strong>{seatsUsed}</strong> of <strong>{seats}</strong> seats used
                </span>
                {seatsUsed > seats && (
                  <span className="seat-over-limit">Over limit</span>
                )}
              </div>
              <div className="seat-progress-bar">
                <div
                  className={`seat-progress-fill ${seatsUsed > seats ? 'seat-progress-over' : ''}`}
                  style={{ width: `${seatProgressPercent}%` }}
                />
              </div>
            </div>

            <div className="seat-details">
              <p className="seat-detail-line">
                {includedSeats === -1
                  ? 'Unlimited seats'
                  : `${includedSeats} included with ${currentPlanData?.name || 'your'} plan`}
              </p>
              {extraSeatsPaid > 0 && currentPlanData?.extraSeatPrice != null && (
                <p className="seat-detail-line seat-detail-extra">
                  {extraSeatsPaid} additional {extraSeatsPaid === 1 ? 'seat' : 'seats'} &times; ${currentPlanData.extraSeatPrice}/mo = ${extraSeatsPaid * currentPlanData.extraSeatPrice}/mo
                </p>
              )}
            </div>

            <div className="seat-actions">
              <button
                className="seat-action-btn seat-action-manage"
                onClick={() => navigate('/integrations')}
              >
                <Settings size={16} strokeWidth={1.5} />
                Manage Accounts
              </button>
              {billingData?.subscription && (
                <button
                  className="seat-action-btn seat-action-stripe"
                  onClick={handleManagePayment}
                >
                  <ExternalLink size={14} strokeWidth={1.5} />
                  Manage in Stripe
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
  const planLimits = PLAN_LIMITS[plan.id];

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
          <Wallet size={16} strokeWidth={1.5} />
          <span>
            {(() => {
              const credits = billingInterval === 'yearly' ? plan.creditsPerMonthYearly : plan.creditsPerMonth;
              if (!credits || credits === -1) return 'Unlimited credits/month';
              return `${credits} credits/month`;
            })()}
          </span>
        </li>
        {(() => {
          const credits = billingInterval === 'yearly' ? plan.creditsPerMonthYearly : plan.creditsPerMonth;
          if (!credits || credits === -1) return null;
          return (
            <li className="plan-feature-sub">
              <span className="plan-credit-equiv">{creditsToShortReadable(credits)}</span>
            </li>
          );
        })()}
        <li>
          <Users size={16} strokeWidth={1.5} />
          <span>
            {plan.features.teamMembers === -1 ? 'Unlimited' : plan.features.teamMembers} team
            members
          </span>
        </li>
        <li>
          <Monitor size={16} strokeWidth={1.5} />
          <span>
            {planLimits.adAccountsIncluded === -1
              ? 'Unlimited ad accounts'
              : planLimits.adAccountsIncluded === 1
              ? '1 ad account'
              : `${planLimits.adAccountsIncluded} ad accounts included`}
            {plan.extraSeatPrice != null && ` (+$${plan.extraSeatPrice}/mo each)`}
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
