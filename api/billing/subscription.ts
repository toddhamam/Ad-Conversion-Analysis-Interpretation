import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// Initialize Stripe (handle missing key gracefully for dev)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

// Plan limits by tier
const PLAN_LIMITS: Record<string, { creativesLimit: number; analysesLimit: number }> = {
  free: { creativesLimit: 10, analysesLimit: 5 },
  starter: { creativesLimit: 100, analysesLimit: 50 },
  pro: { creativesLimit: 250, analysesLimit: 100 },
  enterprise: { creativesLimit: -1, analysesLimit: -1 },
  velocity_partner: { creativesLimit: -1, analysesLimit: -1 },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const customerId = req.query.customerId as string | undefined;

    // Return free tier defaults if no customer ID or no Stripe
    if (!customerId || !stripe) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      return res.status(200).json({
        subscription: null,
        usage: {
          creativesGenerated: 0,
          creativesLimit: PLAN_LIMITS.free.creativesLimit,
          analysesRun: 0,
          analysesLimit: PLAN_LIMITS.free.analysesLimit,
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: periodEnd.toISOString(),
        },
        invoices: [],
      });
    }

    // Fetch active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
      expand: ['data.default_payment_method'],
    });

    const subscription = subscriptions.data[0];

    // Fetch recent invoices
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });

    // Fetch default payment method
    let paymentMethodLast4: string | undefined;
    let paymentMethodBrand: string | undefined;

    if (subscription?.default_payment_method) {
      const pm = subscription.default_payment_method as Stripe.PaymentMethod;
      paymentMethodLast4 = pm.card?.last4;
      paymentMethodBrand = pm.card?.brand;
    } else {
      // Try to get from customer default
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      });
      const defaultPm = paymentMethods.data[0];
      paymentMethodLast4 = defaultPm?.card?.last4;
      paymentMethodBrand = defaultPm?.card?.brand;
    }

    // Determine plan tier from subscription metadata or price
    const planTier = (subscription?.metadata?.planTier || 'starter') as 'free' | 'starter' | 'pro' | 'enterprise' | 'velocity_partner';
    const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.starter;

    // Determine billing interval
    const billingInterval = subscription?.items.data[0]?.price.recurring?.interval === 'year'
      ? 'yearly'
      : 'monthly';

    return res.status(200).json({
      subscription: subscription
        ? {
            id: subscription.id,
            customerId: subscription.customer as string,
            status: subscription.status,
            planTier,
            billingInterval,
            currentPeriodStart: new Date((subscription as any).current_period_start * 1000).toISOString(),
            currentPeriodEnd: new Date((subscription as any).current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            trialEnd: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : undefined,
          }
        : null,
      usage: {
        creativesGenerated: 0, // TODO: Track from database
        creativesLimit: limits.creativesLimit,
        analysesRun: 0, // TODO: Track from database
        analysesLimit: limits.analysesLimit,
        currentPeriodStart: subscription
          ? new Date((subscription as any).current_period_start * 1000).toISOString()
          : new Date().toISOString(),
        currentPeriodEnd: subscription
          ? new Date((subscription as any).current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        date: new Date(inv.created * 1000).toISOString(),
        amount: inv.amount_paid,
        status: inv.status,
        invoiceUrl: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
        description:
          inv.description || `Invoice for ${inv.lines.data[0]?.description || 'subscription'}`,
      })),
      paymentMethodLast4,
      paymentMethodBrand,
    });
  } catch (error) {
    console.error('[Billing Subscription API] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription data' });
  }
}
