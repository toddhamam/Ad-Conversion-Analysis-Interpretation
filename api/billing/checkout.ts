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
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
  enterprise_yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
};

// App URL for redirects
const APP_URL = process.env.VITE_APP_URL || 'http://localhost:5175';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  try {
    const { planTier, billingInterval, customerId, organizationId } = req.body;

    // Validate inputs
    if (!planTier || !billingInterval) {
      return res.status(400).json({ error: 'Missing planTier or billingInterval' });
    }

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing organizationId' });
    }

    if (planTier === 'free') {
      return res.status(400).json({ error: 'Cannot checkout for free plan' });
    }

    if (!['pro', 'enterprise'].includes(planTier)) {
      return res.status(400).json({ error: 'Invalid plan tier' });
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return res.status(400).json({ error: 'Invalid billing interval' });
    }

    // Verify organization exists (if Supabase is configured)
    if (supabase) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, stripe_customer_id')
        .eq('id', organizationId)
        .single();

      if (orgError || !org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Use existing Stripe customer if available
      if (org.stripe_customer_id && !customerId) {
        req.body.customerId = org.stripe_customer_id;
      }
    }

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
      success_url: `${APP_URL}/billing?success=true&organizationId=${organizationId}`,
      cancel_url: `${APP_URL}/billing?canceled=true&organizationId=${organizationId}`,
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
      },
    };

    // Attach to existing customer or create new
    if (customerId || req.body.customerId) {
      sessionParams.customer = customerId || req.body.customerId;
    } else {
      sessionParams.customer_creation = 'always';
    }

    // Create the checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Billing Checkout API] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    return res.status(500).json({ error: message });
  }
}
