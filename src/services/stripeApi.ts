// Stripe API Service for Convertra Billing
import type {
  PlanTier,
  BillingInterval,
  BillingData,
  PricingPlan,
} from '../types/billing';
import type { CreditActionType } from '../types/organization';
import { getAuthToken } from '../lib/authToken';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Pricing plans configuration (matches Stripe products)
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For solopreneurs getting started',
    monthlyPrice: 99,
    yearlyPrice: 79,
    earlyBirdPrice: 89,
    creditsPerMonth: 100,
    creditsPerMonthYearly: 100,
    adAccountsIncluded: 1,
    features: {
      creativesPerMonth: 100,
      analysesPerMonth: 50,
      channels: 3,
      teamMembers: 3,
      prioritySupport: false,
      customBranding: false,
      apiAccess: false,
      dedicatedAccount: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For growing marketing teams',
    monthlyPrice: 149,
    yearlyPrice: 119,
    creditsPerMonth: 300,
    creditsPerMonthYearly: 300,
    adAccountsIncluded: 3,
    features: {
      creativesPerMonth: 250,
      analysesPerMonth: 100,
      channels: 5,
      teamMembers: 10,
      prioritySupport: true,
      customBranding: false,
      apiAccess: true,
      dedicatedAccount: false,
    },
  },
  {
    id: 'agency',
    name: 'Agency',
    description: 'For agencies managing multiple client accounts',
    monthlyPrice: 249,
    yearlyPrice: 199,
    creditsPerMonth: 750,
    creditsPerMonthYearly: 600,
    adAccountsIncluded: 10,
    features: {
      creativesPerMonth: 500,
      analysesPerMonth: 200,
      channels: -1,
      teamMembers: 25,
      prioritySupport: true,
      customBranding: false,
      apiAccess: true,
      dedicatedAccount: false,
    },
  },
  {
    id: 'agency_pro',
    name: 'Agency Pro',
    description: 'For high-volume agencies',
    monthlyPrice: 449,
    yearlyPrice: 359,
    creditsPerMonth: 1500,
    creditsPerMonthYearly: 1200,
    adAccountsIncluded: 20,
    features: {
      creativesPerMonth: 1000,
      analysesPerMonth: 400,
      channels: -1,
      teamMembers: 50,
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
      dedicatedAccount: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise Self-Service',
    description: 'White-glove setup + ongoing support',
    monthlyPrice: 1500,
    yearlyPrice: 1250,
    setupFee: 2500,
    creditsPerMonth: 5000,
    creditsPerMonthYearly: 4000,
    adAccountsIncluded: 50,
    features: {
      creativesPerMonth: -1,
      analysesPerMonth: -1,
      channels: -1,
      teamMembers: -1,
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
      dedicatedAccount: true,
    },
  },
  {
    id: 'velocity_partner',
    name: 'Enterprise Velocity Partner',
    description: 'Full partnership — we run it for you',
    monthlyPrice: 3500,
    yearlyPrice: 2917,
    setupFee: 2500,
    creditsPerMonth: -1,
    creditsPerMonthYearly: -1,
    adAccountsIncluded: -1,
    features: {
      creativesPerMonth: -1,
      analysesPerMonth: -1,
      channels: -1,
      teamMembers: -1,
      prioritySupport: true,
      customBranding: true,
      apiAccess: true,
      dedicatedAccount: true,
    },
  },
];

// ─── Credit API Functions ─────────────────────────────────────────────────────

export interface CreditCheckResult {
  allowed: boolean;
  creditsRemaining: number;
  creditsRequired: number;
  unlimited: boolean;
}

export interface CreditReserveResult {
  transactionId: string;
  creditsReserved: number;
  creditsRemaining: number;
  unlimited: boolean;
}

export class InsufficientCreditsError extends Error {
  creditsRemaining: number;
  creditsRequired: number;

  constructor(creditsRemaining: number, creditsRequired: number) {
    super(`Insufficient credits: ${creditsRemaining} remaining, ${creditsRequired} required`);
    this.name = 'InsufficientCreditsError';
    this.creditsRemaining = creditsRemaining;
    this.creditsRequired = creditsRequired;
  }
}

async function creditApiCall(route: string, body: Record<string, unknown>): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`/api/billing/usage/${route}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Display-only pre-flight check — NOT an authoritative gate */
export async function checkCredits(actionType: CreditActionType, quantity = 1): Promise<CreditCheckResult> {
  const res = await creditApiCall('check-credits', { actionType, quantity });
  if (!res.ok) {
    throw new Error('Failed to check credits');
  }
  return res.json();
}

/** Authoritative gate — atomically reserves credits BEFORE generation */
export async function reserveCredits(actionType: CreditActionType, quantity = 1): Promise<CreditReserveResult> {
  const res = await creditApiCall('reserve-credits', { actionType, quantity });
  if (res.status === 403) {
    const data = await res.json();
    throw new InsufficientCreditsError(data.creditsRemaining, data.creditsRequired);
  }
  if (!res.ok) {
    throw new Error('Failed to reserve credits');
  }
  return res.json();
}

/** Called after successful generation — marks reservation as confirmed */
export async function confirmCredits(transactionId: string): Promise<void> {
  const res = await creditApiCall('confirm-credits', { transactionId });
  if (!res.ok) {
    console.error('Failed to confirm credits:', await res.text());
  }
}

/** Called on generation failure — refunds credits back */
export async function refundCredits(transactionId: string, quantity?: number): Promise<void> {
  const res = await creditApiCall('refund-credits', { transactionId, quantity });
  if (!res.ok) {
    console.error('Failed to refund credits:', await res.text());
  }
}

/** Creates a Stripe Checkout session for purchasing a credit pack */
export async function purchaseCreditPack(packId: '50' | '100' | '250'): Promise<void> {
  const res = await creditApiCall('credit-pack-checkout', { packId });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create credit pack checkout');
  }
  const { url } = await res.json();
  if (url) {
    window.location.href = url;
  }
}

/** Creates a Stripe Checkout session for purchasing additional ad account seats */
export async function purchaseAccountBlock(blockSize: '5' | '10' | '25'): Promise<void> {
  const res = await creditApiCall('account-block-checkout', { blockSize });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create account block checkout');
  }
  const { url } = await res.json();
  if (url) {
    window.location.href = url;
  }
}

// ─── Credit Display Helpers ───────────────────────────────────────────────────

/** Convert a credit amount to human-readable equivalents */
export function creditsToHumanReadable(credits: number): string {
  if (credits === -1) return 'Unlimited';
  if (credits === 0) return '0 credits';

  const imageAds = credits;
  const videoAds = Math.floor(credits / 5);
  const textAds = credits * 2;
  const analyses = credits;

  const parts: string[] = [];
  if (imageAds >= 1) parts.push(`${imageAds} image ads`);
  if (videoAds >= 1) parts.push(`${videoAds} video ads`);
  if (textAds >= 1) parts.push(`${textAds} text ads`);
  if (analyses >= 1) parts.push(`${analyses} analyses`);

  return parts.join(', or ');
}

/** Short form: "= 100 image ads or 20 video ads" */
export function creditsToShortReadable(credits: number): string {
  if (credits === -1) return 'Unlimited';
  if (credits === 0) return '0 credits';

  const imageAds = credits;
  const videoAds = Math.floor(credits / 5);

  return `= ${imageAds} image ads or ${videoAds} video ads`;
}

// ─── Existing Functions (unchanged) ───────────────────────────────────────────

// Get user's billing data from API
export async function fetchBillingData(organizationId?: string): Promise<BillingData> {
  try {
    const token = await getAuthToken();

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

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error('Failed to fetch billing data');
    }
    return await response.json();
  } catch (error: unknown) {
    console.error('Error fetching billing data:', error);
    return getDefaultBillingData();
  }
}

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
      creditsUsed: 0,
      creditsLimit: 0,
      bonusCredits: 0,
      creditsRemaining: 0,
      imageAdsGenerated: 0,
      videoAdsGenerated: 0,
      textAdsGenerated: 0,
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
  organizationId?: string,
  usePromoCode?: boolean,
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    trialDays?: number;
  }
): Promise<void> {
  const token = await getAuthToken();

  const userData = localStorage.getItem('convertra_user');
  const customerId = userData ? JSON.parse(userData).stripeCustomerId : null;

  if (!organizationId && !token) {
    throw new Error('Organization ID is required for checkout');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      planTier,
      billingInterval,
      customerId,
      organizationId,
      usePromoCode,
      successUrl: options?.successUrl,
      cancelUrl: options?.cancelUrl,
      trialDays: options?.trialDays,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  const { url } = await response.json();

  if (!url) {
    throw new Error('No checkout URL returned');
  }

  window.location.href = url;
}

// Create portal session for managing payment methods
export async function createPortalSession(organizationId?: string, customerId?: string): Promise<string> {
  const token = await getAuthToken();

  if (!customerId) {
    const userData = localStorage.getItem('convertra_user');
    customerId = userData ? JSON.parse(userData).stripeCustomerId : null;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/billing/portal', {
    method: 'POST',
    headers,
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
  const order: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, agency: 3, agency_pro: 4, enterprise: 5, velocity_partner: 6 };
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
