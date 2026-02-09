// Stripe API Service for Convertra Billing
import type {
  PlanTier,
  BillingInterval,
  BillingData,
  PricingPlan,
} from '../types/billing';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Pricing plans configuration (matches Stripe products)
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'pro',
    name: 'Pro',
    description: 'For growing marketing teams',
    monthlyPrice: 99,
    yearlyPrice: 79,
    earlyBirdPrice: 89,
    popular: true,
    features: {
      creativesPerMonth: 100,
      analysesPerMonth: 50,
      channels: 3,
      teamMembers: 5,
      prioritySupport: true,
      customBranding: false,
      apiAccess: true,
      dedicatedAccount: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large-scale operations',
    monthlyPrice: 1500,
    yearlyPrice: 1250,
    setupFee: 2500,
    features: {
      creativesPerMonth: -1,  // Unlimited
      analysesPerMonth: -1,   // Unlimited
      channels: -1,           // Unlimited
      teamMembers: -1,        // Unlimited
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
      dedicatedAccount: true,
    },
  },
];

// Get user's billing data from API
export async function fetchBillingData(organizationId?: string): Promise<BillingData> {
  try {
    // Get customer ID from localStorage user data if available (fallback)
    const userData = localStorage.getItem('convertra_user');
    const customerId = userData ? JSON.parse(userData).stripeCustomerId : null;

    const params = new URLSearchParams();
    if (organizationId) {
      params.set('organizationId', organizationId);
    }
    if (customerId) {
      params.set('customerId', customerId);
    }

    const url = `/api/billing/subscription${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch billing data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching billing data:', error);
    // Return default free tier data
    return getDefaultBillingData();
  }
}

// Default billing data for free tier / unauthenticated
function getDefaultBillingData(): BillingData {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    subscription: null,
    usage: {
      creativesGenerated: 0,
      creativesLimit: 10,
      analysesRun: 0,
      analysesLimit: 5,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    },
    invoices: [],
  };
}

// Create checkout session and redirect to Stripe Checkout
export async function redirectToCheckout(
  planTier: PlanTier,
  billingInterval: BillingInterval,
  organizationId?: string
): Promise<void> {
  // Get customer ID from localStorage if available (fallback)
  const userData = localStorage.getItem('convertra_user');
  const customerId = userData ? JSON.parse(userData).stripeCustomerId : null;

  if (!organizationId) {
    throw new Error('Organization ID is required for checkout');
  }

  const response = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planTier, billingInterval, customerId, organizationId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  const { url } = await response.json();

  if (!url) {
    throw new Error('No checkout URL returned');
  }

  // Redirect to Stripe Checkout page
  window.location.href = url;
}

// Create portal session for managing payment methods
export async function createPortalSession(organizationId?: string, customerId?: string): Promise<string> {
  // Get customer ID from localStorage if not provided (fallback)
  if (!customerId) {
    const userData = localStorage.getItem('convertra_user');
    customerId = userData ? JSON.parse(userData).stripeCustomerId : null;
  }

  if (!customerId) {
    throw new Error('No customer ID found. Please upgrade to a paid plan first.');
  }

  const response = await fetch('/api/billing/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, organizationId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create portal session');
  }

  const { url } = await response.json();
  return url;
}

// Redirect to Stripe Customer Portal
export async function redirectToPortal(organizationId?: string, customerId?: string): Promise<void> {
  const url = await createPortalSession(organizationId, customerId);
  window.location.href = url;
}

// Helper: Get plan by tier
export function getPlanByTier(tier: PlanTier): PricingPlan | undefined {
  return PRICING_PLANS.find(plan => plan.id === tier);
}

// Helper: Format price for display
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Helper: Check if Stripe is configured
export function isStripeConfigured(): boolean {
  return !!STRIPE_PUBLISHABLE_KEY;
}

// Helper: Get tier order for comparison
export function getTierOrder(tier: PlanTier): number {
  const order: Record<PlanTier, number> = { free: 0, pro: 1, enterprise: 2 };
  return order[tier];
}

// Helper: Check if organization is in active trial
export function isInTrial(org: { subscription_status?: string; current_period_end?: string | null } | null): boolean {
  if (!org) return false;
  if (org.subscription_status !== 'trialing') return false;
  if (!org.current_period_end) return false;
  return new Date(org.current_period_end).getTime() > Date.now();
}

// Helper: Get remaining trial days
export function getTrialDaysRemaining(org: { subscription_status?: string; current_period_end?: string | null } | null): number {
  if (!org || org.subscription_status !== 'trialing' || !org.current_period_end) return 0;
  const msRemaining = new Date(org.current_period_end).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
