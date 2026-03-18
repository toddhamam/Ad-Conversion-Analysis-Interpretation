import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { initSentry, captureError, flushSentry } from '../_lib/sentry.js';

initSentry();

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

// Initialize Supabase
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ─── Credit System Constants ──────────────────────────────────────────────────

type CreditActionType = 'image_ad' | 'video_ad' | 'text_ad' | 'channel_analysis';

const CREDIT_COSTS: Record<CreditActionType, number> = {
  image_ad: 1,
  video_ad: 5,
  text_ad: 0.5,
  channel_analysis: 1,
};

// Credits per plan tier (monthly and yearly)
const PLAN_CREDITS: Record<string, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  trial: { monthly: 21, yearly: 21 },
  starter: { monthly: 100, yearly: 100 },
  pro: { monthly: 300, yearly: 300 },
  agency: { monthly: 750, yearly: 600 },
  agency_pro: { monthly: 1500, yearly: 1200 },
  enterprise: { monthly: 5000, yearly: 4000 },
  velocity_partner: { monthly: -1, yearly: -1 }, // Unlimited
};

// Legacy plan limits (kept for backwards compat on status route)
const PLAN_LIMITS: Record<string, { creativesLimit: number; analysesLimit: number }> = {
  free: { creativesLimit: 10, analysesLimit: 5 },
  starter: { creativesLimit: 100, analysesLimit: 50 },
  pro: { creativesLimit: 250, analysesLimit: 100 },
  agency: { creativesLimit: 500, analysesLimit: 200 },
  agency_pro: { creativesLimit: 1000, analysesLimit: 400 },
  enterprise: { creativesLimit: -1, analysesLimit: -1 },
  velocity_partner: { creativesLimit: -1, analysesLimit: -1 },
};

// Credit pack definitions
const CREDIT_PACKS: Record<string, { credits: number; priceInCents: number }> = {
  '50': { credits: 50, priceInCents: 2900 },
  '100': { credits: 100, priceInCents: 4900 },
  '250': { credits: 250, priceInCents: 9900 },
};

// ─── Authentication ───────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCreditsLimit(planTier: string, billingInterval: string, subscriptionStatus: string): number {
  // Trial users always get 21 credits regardless of plan_tier
  if (subscriptionStatus === 'trialing') {
    return PLAN_CREDITS.trial.monthly;
  }
  const plan = PLAN_CREDITS[planTier] || PLAN_CREDITS.starter;
  return billingInterval === 'yearly' ? plan.yearly : plan.monthly;
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET /api/billing/subscription (default status route)
 * Enhanced existing handler — fetches real credit usage from DB
 */
async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  const customerId = req.query.customerId as string | undefined;

  // Return free tier defaults if no customer ID, no auth, or no Stripe
  if ((!customerId && !auth) || !stripe) {
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
    });
  }

  // Fetch real usage from DB if authenticated
  let creditsUsed = 0;
  let bonusCredits = 0;
  let imageAdsGenerated = 0;
  let videoAdsGenerated = 0;
  let textAdsGenerated = 0;
  let analysesRun = 0;
  let creativesGenerated = 0;

  if (supabase && auth) {
    // Get org for bonus_credits
    const { data: org } = await supabase
      .from('organizations')
      .select('bonus_credits, subscription_status, billing_interval, plan_tier')
      .eq('id', auth.organizationId)
      .single();

    bonusCredits = org?.bonus_credits || 0;

    // Get current period usage
    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('credits_used, image_ads_generated, video_ads_generated, text_ads_generated, creatives_generated, analyses_run')
      .eq('organization_id', auth.organizationId)
      .lte('period_start', today)
      .gte('period_end', today)
      .order('period_start', { ascending: false })
      .limit(1)
      .single();

    if (usage) {
      creditsUsed = usage.credits_used || 0;
      imageAdsGenerated = usage.image_ads_generated || 0;
      videoAdsGenerated = usage.video_ads_generated || 0;
      textAdsGenerated = usage.text_ads_generated || 0;
      analysesRun = usage.analyses_run || 0;
      creativesGenerated = usage.creatives_generated || 0;
    }
  }

  // Fetch Stripe subscription (existing logic)
  if (!customerId) {
    // No Stripe customer, return org data only
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let planTier = 'free';
    let billingInterval = 'monthly';
    let subscriptionStatus = 'active';

    if (supabase && auth) {
      const { data: org } = await supabase
        .from('organizations')
        .select('plan_tier, billing_interval, subscription_status, current_period_start, current_period_end')
        .eq('id', auth.organizationId)
        .single();

      if (org) {
        planTier = org.plan_tier || 'free';
        billingInterval = org.billing_interval || 'monthly';
        subscriptionStatus = org.subscription_status || 'active';
      }
    }

    const creditsLimit = getCreditsLimit(planTier, billingInterval, subscriptionStatus);
    const totalAvailable = creditsLimit === -1 ? -1 : creditsLimit + bonusCredits;
    const creditsRemaining = creditsLimit === -1 ? -1 : Math.max(0, totalAvailable - creditsUsed);

    return res.status(200).json({
      subscription: null,
      usage: {
        creativesGenerated,
        creativesLimit: (PLAN_LIMITS[planTier] || PLAN_LIMITS.starter).creativesLimit,
        analysesRun,
        analysesLimit: (PLAN_LIMITS[planTier] || PLAN_LIMITS.starter).analysesLimit,
        creditsUsed,
        creditsLimit,
        bonusCredits,
        creditsRemaining,
        imageAdsGenerated,
        videoAdsGenerated,
        textAdsGenerated,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
      },
      invoices: [],
    });
  }

  // Fetch active subscriptions from Stripe (limit: 10 to account for add-ons)
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 10,
    expand: ['data.default_payment_method'],
  });

  // Find the base plan subscription (not an account_block add-on)
  const subscription = subscriptions.data.find(
    sub => sub.metadata?.type !== 'account_block',
  );

  // Also check for trialing subscriptions
  let trialingSub: Stripe.Subscription | undefined;
  if (!subscription) {
    const trialSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'trialing',
      limit: 10,
      expand: ['data.default_payment_method'],
    });
    trialingSub = trialSubs.data.find(
      sub => sub.metadata?.type !== 'account_block',
    );
  }

  const activeSub = subscription || trialingSub;

  // Fetch recent invoices
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 10,
  });

  // Fetch payment method
  let paymentMethodLast4: string | undefined;
  let paymentMethodBrand: string | undefined;

  if (activeSub?.default_payment_method) {
    const pm = activeSub.default_payment_method as Stripe.PaymentMethod;
    paymentMethodLast4 = pm.card?.last4;
    paymentMethodBrand = pm.card?.brand;
  } else {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });
    const defaultPm = paymentMethods.data[0];
    paymentMethodLast4 = defaultPm?.card?.last4;
    paymentMethodBrand = defaultPm?.card?.brand;
  }

  // Determine plan tier and billing interval
  const planTier = (activeSub?.metadata?.planTier || 'starter') as string;
  const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.starter;
  const billingInterval = activeSub?.items.data[0]?.price.recurring?.interval === 'year'
    ? 'yearly'
    : 'monthly';
  const subscriptionStatus = activeSub?.status || 'active';

  const creditsLimit = getCreditsLimit(planTier, billingInterval, subscriptionStatus);
  const totalAvailable = creditsLimit === -1 ? -1 : creditsLimit + bonusCredits;
  const creditsRemaining = creditsLimit === -1 ? -1 : Math.max(0, totalAvailable - creditsUsed);

  return res.status(200).json({
    subscription: activeSub
      ? {
          id: activeSub.id,
          customerId: activeSub.customer as string,
          status: activeSub.status,
          planTier,
          billingInterval,
          currentPeriodStart: new Date((activeSub as any).current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date((activeSub as any).current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: activeSub.cancel_at_period_end,
          trialEnd: activeSub.trial_end
            ? new Date(activeSub.trial_end * 1000).toISOString()
            : undefined,
        }
      : null,
    usage: {
      creativesGenerated,
      creativesLimit: limits.creativesLimit,
      analysesRun,
      analysesLimit: limits.analysesLimit,
      creditsUsed,
      creditsLimit,
      bonusCredits,
      creditsRemaining,
      imageAdsGenerated,
      videoAdsGenerated,
      textAdsGenerated,
      currentPeriodStart: activeSub
        ? new Date((activeSub as any).current_period_start * 1000).toISOString()
        : new Date().toISOString(),
      currentPeriodEnd: activeSub
        ? new Date((activeSub as any).current_period_end * 1000).toISOString()
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
}

/**
 * POST /api/billing/usage/check-credits
 * Display-only pre-flight check (NOT an authoritative gate)
 */
async function handleCheckCredits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth || !supabase) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { actionType, quantity = 1 } = req.body;
  if (!actionType || !CREDIT_COSTS[actionType as CreditActionType]) {
    return res.status(400).json({ error: 'Invalid actionType' });
  }

  const creditsRequired = CREDIT_COSTS[actionType as CreditActionType] * quantity;

  // Get org data
  const { data: org } = await supabase
    .from('organizations')
    .select('plan_tier, billing_interval, subscription_status, bonus_credits')
    .eq('id', auth.organizationId)
    .single();

  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  const creditsLimit = getCreditsLimit(org.plan_tier, org.billing_interval, org.subscription_status);

  // Unlimited plan
  if (creditsLimit === -1) {
    return res.status(200).json({
      allowed: true,
      creditsRemaining: -1,
      creditsRequired,
      unlimited: true,
    });
  }

  // Get current usage
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('usage_tracking')
    .select('credits_used')
    .eq('organization_id', auth.organizationId)
    .lte('period_start', today)
    .gte('period_end', today)
    .order('period_start', { ascending: false })
    .limit(1)
    .single();

  const creditsUsed = usage?.credits_used || 0;
  const totalAvailable = creditsLimit + (org.bonus_credits || 0);
  const creditsRemaining = Math.max(0, totalAvailable - creditsUsed);
  const allowed = creditsRemaining >= creditsRequired;

  return res.status(200).json({
    allowed,
    creditsRemaining,
    creditsRequired,
    unlimited: false,
  });
}

/**
 * POST /api/billing/usage/reserve-credits
 * Authoritative gate — atomically reserves credits BEFORE generation
 */
async function handleReserveCredits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth || !supabase) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { actionType, quantity = 1 } = req.body;
  if (!actionType || !CREDIT_COSTS[actionType as CreditActionType]) {
    return res.status(400).json({ error: 'Invalid actionType' });
  }

  const creditsRequired = CREDIT_COSTS[actionType as CreditActionType] * quantity;

  // Get org data
  const { data: org } = await supabase
    .from('organizations')
    .select('plan_tier, billing_interval, subscription_status, bonus_credits, current_period_start, current_period_end')
    .eq('id', auth.organizationId)
    .single();

  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  const creditsLimit = getCreditsLimit(org.plan_tier, org.billing_interval, org.subscription_status);

  // Unlimited plan — always allow, still track usage
  if (creditsLimit === -1) {
    // Create transaction record
    const { data: tx } = await supabase
      .from('credit_transactions')
      .insert({
        organization_id: auth.organizationId,
        credits: creditsRequired,
        action_type: actionType,
        status: 'reserved',
        description: `Reserved ${quantity} ${actionType}(s)`,
        quantity,
      })
      .select('id')
      .single();

    return res.status(200).json({
      transactionId: tx?.id,
      creditsReserved: creditsRequired,
      creditsRemaining: -1,
      unlimited: true,
    });
  }

  // Determine current billing period
  const periodStart = org.current_period_start
    ? new Date(org.current_period_start).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const periodEnd = org.current_period_end
    ? new Date(org.current_period_end).toISOString().split('T')[0]
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Read current usage, then insert or increment
  const { data: existingUsage } = await supabase
    .from('usage_tracking')
    .select('credits_used')
    .eq('organization_id', auth.organizationId)
    .eq('period_start', periodStart)
    .single();

  const totalAvailable = creditsLimit + (org.bonus_credits || 0);

  if (existingUsage) {
    // Row exists — check budget and increment
    const currentCreditsUsed = existingUsage.credits_used || 0;
    const newCreditsUsed = currentCreditsUsed + creditsRequired;

    if (newCreditsUsed > totalAvailable) {
      return res.status(403).json({
        error: 'Insufficient credits',
        creditsRemaining: Math.max(0, totalAvailable - currentCreditsUsed),
        creditsRequired,
      });
    }

    await supabase
      .from('usage_tracking')
      .update({ credits_used: newCreditsUsed })
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart);
  } else {
    // No row yet — check budget and insert
    if (creditsRequired > totalAvailable) {
      return res.status(403).json({
        error: 'Insufficient credits',
        creditsRemaining: totalAvailable,
        creditsRequired,
      });
    }

    await supabase
      .from('usage_tracking')
      .insert({
        organization_id: auth.organizationId,
        period_start: periodStart,
        period_end: periodEnd,
        credits_used: creditsRequired,
      });
  }

  // Also increment the specific ad type counter
  const adTypeColumn = actionType === 'image_ad' ? 'image_ads_generated'
    : actionType === 'video_ad' ? 'video_ads_generated'
    : actionType === 'text_ad' ? 'text_ads_generated'
    : null;

  if (adTypeColumn) {
    // Increment the type-specific counter
    const { data: currentRow } = await supabase
      .from('usage_tracking')
      .select(adTypeColumn)
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart)
      .single();

    const currentCount = (currentRow as Record<string, number>)?.[adTypeColumn] || 0;
    await supabase
      .from('usage_tracking')
      .update({ [adTypeColumn]: currentCount + quantity })
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart);
  }

  if (actionType === 'channel_analysis') {
    const { data: currentRow } = await supabase
      .from('usage_tracking')
      .select('analyses_run')
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart)
      .single();

    await supabase
      .from('usage_tracking')
      .update({ analyses_run: (currentRow?.analyses_run || 0) + quantity })
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart);
  }

  // Also increment creatives_generated for ad types (backwards compat)
  if (['image_ad', 'video_ad', 'text_ad'].includes(actionType)) {
    const { data: currentRow } = await supabase
      .from('usage_tracking')
      .select('creatives_generated')
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart)
      .single();

    await supabase
      .from('usage_tracking')
      .update({ creatives_generated: (currentRow?.creatives_generated || 0) + quantity })
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart);
  }

  // Create transaction record
  const { data: tx } = await supabase
    .from('credit_transactions')
    .insert({
      organization_id: auth.organizationId,
      credits: creditsRequired,
      action_type: actionType,
      status: 'reserved',
      description: `Reserved ${quantity} ${actionType}(s)`,
      quantity,
    })
    .select('id')
    .single();

  // Calculate remaining
  const { data: finalUsage } = await supabase
    .from('usage_tracking')
    .select('credits_used')
    .eq('organization_id', auth.organizationId)
    .eq('period_start', periodStart)
    .single();

  const finalCreditsUsed = finalUsage?.credits_used || 0;
  const totalAvailable = creditsLimit + (org.bonus_credits || 0);
  const creditsRemaining = Math.max(0, totalAvailable - finalCreditsUsed);

  return res.status(200).json({
    transactionId: tx?.id,
    creditsReserved: creditsRequired,
    creditsRemaining,
    unlimited: false,
  });
}

/**
 * POST /api/billing/usage/confirm-credits
 * Called after successful generation — marks reserved transaction as confirmed
 */
async function handleConfirmCredits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth || !supabase) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'Missing transactionId' });
  }

  // Update transaction status to confirmed
  const { error } = await supabase
    .from('credit_transactions')
    .update({ status: 'confirmed' })
    .eq('id', transactionId)
    .eq('organization_id', auth.organizationId)
    .eq('status', 'reserved');

  if (error) {
    return res.status(400).json({ error: 'Failed to confirm transaction' });
  }

  return res.status(200).json({ confirmed: true });
}

/**
 * POST /api/billing/usage/refund-credits
 * Called on generation failure — refunds credits back to usage_tracking
 */
async function handleRefundCredits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth || !supabase) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { transactionId, quantity: refundQuantity } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'Missing transactionId' });
  }

  // Get the original transaction
  const { data: tx } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('organization_id', auth.organizationId)
    .eq('status', 'reserved')
    .single();

  if (!tx) {
    return res.status(404).json({ error: 'Transaction not found or already processed' });
  }

  // Calculate refund amount
  const originalQuantity = tx.quantity || 1;
  const creditCost = CREDIT_COSTS[tx.action_type as CreditActionType] || 1;
  const qtyToRefund = refundQuantity !== undefined ? Math.min(refundQuantity, originalQuantity) : originalQuantity;
  const creditsToRefund = creditCost * qtyToRefund;

  // Reduce credits_used in usage_tracking
  const { data: org } = await supabase
    .from('organizations')
    .select('current_period_start')
    .eq('id', auth.organizationId)
    .single();

  const periodStart = org?.current_period_start
    ? new Date(org.current_period_start).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const { data: currentUsage } = await supabase
    .from('usage_tracking')
    .select('credits_used')
    .eq('organization_id', auth.organizationId)
    .eq('period_start', periodStart)
    .single();

  if (currentUsage) {
    const newCreditsUsed = Math.max(0, (currentUsage.credits_used || 0) - creditsToRefund);
    await supabase
      .from('usage_tracking')
      .update({ credits_used: newCreditsUsed })
      .eq('organization_id', auth.organizationId)
      .eq('period_start', periodStart);
  }

  // Update transaction status
  if (qtyToRefund >= originalQuantity) {
    // Full refund
    await supabase
      .from('credit_transactions')
      .update({ status: 'refunded' })
      .eq('id', transactionId);
  } else {
    // Partial refund — mark original as confirmed for the kept portion
    await supabase
      .from('credit_transactions')
      .update({
        status: 'confirmed',
        quantity: originalQuantity - qtyToRefund,
        credits: creditCost * (originalQuantity - qtyToRefund),
      })
      .eq('id', transactionId);
  }

  // Insert refund transaction record
  await supabase
    .from('credit_transactions')
    .insert({
      organization_id: auth.organizationId,
      credits: -creditsToRefund,
      action_type: 'refund',
      status: 'confirmed',
      description: `Refunded ${qtyToRefund} ${tx.action_type}(s) from ${transactionId}`,
      quantity: qtyToRefund,
    });

  return res.status(200).json({
    refunded: true,
    creditsRefunded: creditsToRefund,
  });
}

/**
 * POST /api/billing/usage/credit-pack-checkout
 * Creates a Stripe one-time payment Checkout session for credit pack purchase
 */
async function handleCreditPackCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const auth = await authenticateRequest(req);
  if (!auth || !supabase) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { packId } = req.body;
  if (!packId || !CREDIT_PACKS[packId]) {
    return res.status(400).json({ error: 'Invalid pack ID. Valid: 50, 100, 250' });
  }

  const pack = CREDIT_PACKS[packId];

  // Get org's Stripe customer ID
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', auth.organizationId)
    .single();

  const APP_URL = process.env.VITE_APP_URL || 'http://localhost:5175';

  // Look up price ID from env var
  const priceId = process.env[`STRIPE_PRICE_CREDIT_PACK_${packId}`];

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    success_url: `${APP_URL}/billing?credits=success`,
    cancel_url: `${APP_URL}/billing?credits=canceled`,
    metadata: {
      packId,
      credits: pack.credits.toString(),
      organizationId: auth.organizationId,
      type: 'credit_pack',
    },
    ...(org?.stripe_customer_id ? { customer: org.stripe_customer_id } : {}),
  };

  if (priceId) {
    sessionParams.line_items = [{ price: priceId, quantity: 1 }];
  } else {
    // Fallback: use inline price_data
    sessionParams.line_items = [{
      price_data: {
        currency: 'usd',
        unit_amount: pack.priceInCents,
        product_data: {
          name: `${pack.credits} Credit Pack`,
          description: `${pack.credits} credits for Convertra (= ${pack.credits} image ads or ${Math.floor(pack.credits / 5)} video ads)`,
        },
      },
      quantity: 1,
    }];
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return res.status(200).json({ url: session.url, sessionId: session.id });
}

// ─── Account Block Definitions ────────────────────────────────────────────────

const ACCOUNT_BLOCKS: Record<string, { seats: number; monthlyPriceCents: number }> = {
  '5': { seats: 5, monthlyPriceCents: 2000 },
  '10': { seats: 10, monthlyPriceCents: 4000 },
  '25': { seats: 25, monthlyPriceCents: 7500 },
};

/**
 * Creates a Stripe recurring subscription for additional ad account seats
 */
async function handleAccountBlockCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!stripe || !supabase) {
    return res.status(500).json({ error: 'Service not configured' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { blockSize } = req.body;
  if (!blockSize || !ACCOUNT_BLOCKS[blockSize]) {
    return res.status(400).json({ error: 'Invalid block size. Valid: 5, 10, 25' });
  }

  const block = ACCOUNT_BLOCKS[blockSize];

  // Get org's Stripe customer ID
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', auth.organizationId)
    .single();

  // Build price ID from env or use inline price_data
  const priceEnvKey = `STRIPE_PRICE_ACCOUNT_BLOCK_${blockSize}`;
  const priceId = process.env[priceEnvKey];

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          product_data: {
            name: `+${block.seats} Ad Account Seats`,
            description: `Additional ${block.seats} ad account seats`,
          },
          unit_amount: block.monthlyPriceCents,
        },
        quantity: 1,
      };

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [lineItem],
    success_url: `${process.env.VITE_APP_URL || 'https://www.convertraiq.com'}/integrations?seats_added=true`,
    cancel_url: `${process.env.VITE_APP_URL || 'https://www.convertraiq.com'}/integrations?canceled=true`,
    metadata: {
      type: 'account_block',
      organizationId: auth.organizationId,
      blockSize,
      seats: block.seats.toString(),
    },
    subscription_data: {
      metadata: {
        type: 'account_block',
        organizationId: auth.organizationId,
        seats: block.seats.toString(),
      },
    },
    ...(org?.stripe_customer_id ? { customer: org.stripe_customer_id } : {}),
  };

  const session = await stripe.checkout.sessions.create(sessionParams);
  return res.status(200).json({ url: session.url, sessionId: session.id });
}

// ─── Main Handler (catch-all dispatcher) ──────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = (req.query.route as string) || '';

  try {
    switch (route) {
      case 'check-credits':
        return await handleCheckCredits(req, res);
      case 'reserve-credits':
        return await handleReserveCredits(req, res);
      case 'confirm-credits':
        return await handleConfirmCredits(req, res);
      case 'refund-credits':
        return await handleRefundCredits(req, res);
      case 'credit-pack-checkout':
        return await handleCreditPackCheckout(req, res);
      case 'account-block-checkout':
        return await handleAccountBlockCheckout(req, res);
      default:
        // Default: existing subscription status handler
        return await handleStatus(req, res);
    }
  } catch (error) {
    console.error(`[Billing Subscription API] Error (route: ${route}):`, error);
    captureError(error, { route: `billing/subscription/${route || 'status'}` });
    await flushSentry();
    return res.status(500).json({ error: 'Internal server error' });
  }
}
