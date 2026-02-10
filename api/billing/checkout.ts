import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe (handle missing key gracefully)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

// Initialize Supabase for multi-tenant operations
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Price ID mapping (set via environment variables)
const PRICE_IDS: Record<string, string | undefined> = {
  starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  starter_yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
  enterprise_yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  velocity_partner_monthly: process.env.STRIPE_PRICE_VELOCITY_PARTNER_MONTHLY,
  velocity_partner_yearly: process.env.STRIPE_PRICE_VELOCITY_PARTNER_YEARLY,
};

// App URL for redirects
const APP_URL = process.env.VITE_APP_URL || 'http://localhost:5175';

// ─── Authentication ──────────────────────────────────────────────────────────

interface AuthContext {
  userId: string;
  organizationId: string;
}

async function authenticateRequest(req: VercelRequest): Promise<AuthContext | null> {
  if (!supabase) return null;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id')
    .eq('auth_id', user.id)
    .single();

  if (!profile) return null;
  return { userId: profile.id, organizationId: profile.organization_id };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  try {
    const { planTier, billingInterval, usePromoCode, successUrl, cancelUrl, trialDays } = req.body;

    // Validate inputs
    if (!planTier || !billingInterval) {
      return res.status(400).json({ error: 'Missing planTier or billingInterval' });
    }

    if (trialDays !== undefined && (typeof trialDays !== 'number' || trialDays < 1 || trialDays > 30)) {
      return res.status(400).json({ error: 'Invalid trial period' });
    }

    if (planTier === 'free') {
      return res.status(400).json({ error: 'Cannot checkout for free plan' });
    }

    if (!['starter', 'pro', 'enterprise', 'velocity_partner'].includes(planTier)) {
      return res.status(400).json({ error: 'Invalid plan tier' });
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return res.status(400).json({ error: 'Invalid billing interval' });
    }

    // Authenticate and derive organizationId from JWT
    const auth = await authenticateRequest(req);

    // Fall back to client-provided organizationId if JWT auth not available
    const organizationId = auth?.organizationId || req.body.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required. Please sign in and try again.' });
    }

    // Look up organization to get trial status and Stripe customer ID
    // Non-fatal: if lookup fails, proceed with checkout (skip trial coupon, skip stored customer)
    let isOrgTrialing = false;
    let stripeCustomerId: string | null = null;

    if (supabase) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, stripe_customer_id, subscription_status')
        .eq('id', organizationId)
        .single();

      if (orgError || !org) {
        // Log for diagnostics but don't block checkout
        console.error('[Billing Checkout] Org lookup failed (proceeding anyway):', {
          organizationId,
          error: orgError?.message || 'No org returned',
          code: orgError?.code,
          fromJWT: !!auth,
        });
      } else {
        isOrgTrialing = org.subscription_status === 'trialing';
        stripeCustomerId = org.stripe_customer_id;
      }
    }

    // Determine Stripe customer: org's stored customer > client-provided
    const customerId = stripeCustomerId || req.body.customerId || null;

    // Get the price ID
    const priceKey = `${planTier}_${billingInterval}`;
    const priceId = PRICE_IDS[priceKey];

    if (!priceId) {
      return res.status(400).json({
        error: `Price not configured for ${priceKey}. Please set STRIPE_PRICE_${priceKey.toUpperCase()} environment variable.`,
      });
    }

    // Build checkout session parameters
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${APP_URL}/billing?success=true`,
      cancel_url: cancelUrl || `${APP_URL}/billing?canceled=true`,
      metadata: {
        planTier,
        billingInterval,
        organizationId, // Link checkout to organization
      },
      subscription_data: {
        metadata: {
          planTier,
          billingInterval,
          organizationId, // Also store on subscription
        },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
      // Skip card collection for fully-discounted subscriptions (e.g. beta tester 100% off)
      payment_method_collection: 'if_required',
    };

    // Promo code mode: show Stripe's promo code field (mutually exclusive with discounts)
    // Early-bird mode: auto-apply the early-bird coupon for trialing orgs
    const earlyBirdCouponId = process.env.STRIPE_EARLY_BIRD_COUPON_ID;
    if (usePromoCode) {
      sessionParams.allow_promotion_codes = true;
    } else if (isOrgTrialing && planTier === 'starter' && earlyBirdCouponId) {
      sessionParams.discounts = [{ coupon: earlyBirdCouponId }];
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    // Add enterprise/velocity partner setup fee as a separate one-time line item
    const enterpriseSetupPriceId = process.env.STRIPE_PRICE_ENTERPRISE_SETUP;
    if ((planTier === 'enterprise' || planTier === 'velocity_partner') && enterpriseSetupPriceId) {
      sessionParams.line_items!.push({
        price: enterpriseSetupPriceId,
        quantity: 1,
      });
    }

    // Attach to existing Stripe customer if available
    if (customerId) {
      sessionParams.customer = customerId;
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error: unknown) {
    console.error('[Billing Checkout API] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    return res.status(500).json({ error: message });
  }
}
