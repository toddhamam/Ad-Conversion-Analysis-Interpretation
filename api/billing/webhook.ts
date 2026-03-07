import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { initSentry, captureError, flushSentry } from '../_lib/sentry.js';

initSentry();

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

// Initialize Supabase for organization updates
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Safely convert a Stripe Unix timestamp to ISO string.
 * Returns null if the value is missing, not a number, or produces an invalid date.
 */
function safeTimestampToISO(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  try {
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  }
}

/**
 * Extract period dates from a Stripe subscription object.
 * Falls back to trial_start/trial_end for trialing subscriptions
 * if current_period fields are missing.
 */
function extractPeriodDates(sub: Record<string, unknown>): { start: string | null; end: string | null } {
  let start = safeTimestampToISO(sub.current_period_start);
  let end = safeTimestampToISO(sub.current_period_end);

  // Fallback: use trial dates only for trialing subscriptions
  if (sub.status === 'trialing') {
    if (!start && sub.trial_start) {
      start = safeTimestampToISO(sub.trial_start);
    }
    if (!end && sub.trial_end) {
      end = safeTimestampToISO(sub.trial_end);
    }
  }

  return { start, end };
}

// Disable body parsing to get raw body for webhook verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body from request
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!stripe || !webhookSecret) {
    console.error('[Billing Webhook] Stripe or webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Billing Webhook] Signature verification failed:', message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    // Handle specific event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organizationId;
        const planTier = session.metadata?.planTier;
        const billingInterval = session.metadata?.billingInterval;

        console.log('[Billing Webhook] Checkout completed:', {
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          organizationId,
          planTier,
        });

        // Handle credit pack purchases (one-time payments)
        if (supabase && session.metadata?.type === 'credit_pack') {
          const packOrgId = session.metadata.organizationId;
          const packCredits = parseFloat(session.metadata.credits || '0');

          if (packOrgId && packCredits > 0) {
            // Add bonus credits to organization
            const { data: packOrg } = await supabase
              .from('organizations')
              .select('bonus_credits')
              .eq('id', packOrgId)
              .single();

            const currentBonus = packOrg?.bonus_credits || 0;
            await supabase
              .from('organizations')
              .update({
                bonus_credits: currentBonus + packCredits,
                updated_at: new Date().toISOString(),
              })
              .eq('id', packOrgId);

            // Insert credit_pack_purchase transaction
            await supabase
              .from('credit_transactions')
              .insert({
                organization_id: packOrgId,
                credits: -packCredits, // Negative = credits added (opposite of consumption)
                action_type: 'credit_pack_purchase',
                status: 'confirmed',
                description: `Purchased ${packCredits} credit pack (Pack ${session.metadata.packId})`,
                quantity: packCredits,
              });

            console.log('[Billing Webhook] Credit pack fulfilled:', { packOrgId, packCredits });
          }
          break; // Credit pack checkout — don't process as subscription
        }

        // Handle account block purchases (recurring add-on subscriptions)
        if (supabase && session.metadata?.type === 'account_block') {
          const blockOrgId = session.metadata.organizationId;
          const blockSeats = parseInt(session.metadata.seats || '0', 10);

          if (blockOrgId && blockSeats > 0) {
            // Add seats to organization
            const { data: blockOrg } = await supabase
              .from('organizations')
              .select('ad_account_seats')
              .eq('id', blockOrgId)
              .single();

            const currentSeats = blockOrg?.ad_account_seats ?? 1;
            await supabase
              .from('organizations')
              .update({
                ad_account_seats: currentSeats + blockSeats,
                updated_at: new Date().toISOString(),
              })
              .eq('id', blockOrgId);

            console.log('[Billing Webhook] Account block fulfilled:', { blockOrgId, blockSeats, newTotal: currentSeats + blockSeats });
          }
          break; // Account block checkout — don't process as plan subscription
        }

        // Update organization with Stripe customer and subscription info
        if (supabase && organizationId) {
          // Get actual subscription status (may be 'trialing' for trial checkouts)
          let subscriptionStatus: string | null = null;
          let currentPeriodStart: string | null = null;
          let currentPeriodEnd: string | null = null;

          if (session.subscription && typeof session.subscription === 'string') {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription);
              subscriptionStatus = sub.status;
              const periods = extractPeriodDates(sub as unknown as Record<string, unknown>);
              currentPeriodStart = periods.start;
              currentPeriodEnd = periods.end;
            } catch (subErr) {
              // Don't default to 'active' — let customer.subscription.created webhook set correct status
              console.error('[Billing Webhook] Failed to retrieve subscription (will rely on subscription.created event):', subErr);
            }
          }

          // Determine ad account seats based on plan tier
          const seatsByPlan: Record<string, number> = {
            starter: 1, pro: 3, agency: 10, agency_pro: 20,
            enterprise: -1, velocity_partner: -1,
          };
          const adAccountSeats = seatsByPlan[planTier || 'starter'] || 1;

          const { error: updateError } = await supabase
            .from('organizations')
            .update({
              stripe_customer_id: session.customer as string,
              subscription_id: session.subscription as string,
              ...(subscriptionStatus ? { subscription_status: subscriptionStatus } : {}),
              plan_tier: planTier || 'starter',
              billing_interval: billingInterval || 'monthly',
              ad_account_seats: adAccountSeats,
              ...(currentPeriodStart ? { current_period_start: currentPeriodStart } : {}),
              ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', organizationId);

          if (updateError) {
            console.error('[Billing Webhook] Failed to update organization:', updateError);
          } else {
            console.log('[Billing Webhook] Organization updated successfully:', organizationId);
          }
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organizationId;

        console.log('[Billing Webhook] Subscription created:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          organizationId,
        });

        // Sync subscription to organization
        if (supabase && organizationId) {
          const periods = extractPeriodDates(subscription as unknown as Record<string, unknown>);
          await supabase
            .from('organizations')
            .update({
              subscription_id: subscription.id,
              subscription_status: subscription.status,
              ...(periods.start ? { current_period_start: periods.start } : {}),
              ...(periods.end ? { current_period_end: periods.end } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', organizationId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organizationId;

        console.log('[Billing Webhook] Subscription updated:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          organizationId,
        });

        // Sync subscription changes to organization
        if (supabase && organizationId) {
          const periods = extractPeriodDates(subscription as unknown as Record<string, unknown>);

          // Check if period actually advanced (not just a mid-cycle upgrade/proration)
          // Only reset usage when current_period_start changes to a later date
          let shouldResetUsage = false;
          if (periods.start) {
            const { data: currentOrg } = await supabase
              .from('organizations')
              .select('current_period_start')
              .eq('id', organizationId)
              .single();

            if (currentOrg?.current_period_start) {
              const storedStart = new Date(currentOrg.current_period_start).getTime();
              const newStart = new Date(periods.start).getTime();
              shouldResetUsage = newStart > storedStart;
            } else {
              // No stored period — this is the first update
              shouldResetUsage = false;
            }
          }

          await supabase
            .from('organizations')
            .update({
              subscription_status: subscription.cancel_at_period_end ? 'canceling' : subscription.status,
              ...(periods.start ? { current_period_start: periods.start } : {}),
              ...(periods.end ? { current_period_end: periods.end } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', organizationId);

          // Reset usage tracking for new billing period
          if (shouldResetUsage && periods.start && periods.end) {
            const periodStartDate = new Date(periods.start).toISOString().split('T')[0];
            const periodEndDate = new Date(periods.end).toISOString().split('T')[0];

            // Create fresh usage_tracking row for new period
            await supabase
              .from('usage_tracking')
              .upsert({
                organization_id: organizationId,
                period_start: periodStartDate,
                period_end: periodEndDate,
                credits_used: 0,
                creatives_generated: 0,
                analyses_run: 0,
                api_calls: 0,
                image_ads_generated: 0,
                video_ads_generated: 0,
                text_ads_generated: 0,
              }, { onConflict: 'organization_id,period_start' });

            // Insert period_reset audit entry
            await supabase
              .from('credit_transactions')
              .insert({
                organization_id: organizationId,
                credits: 0,
                action_type: 'period_reset',
                status: 'confirmed',
                description: `Billing period reset: ${periodStartDate} to ${periodEndDate}`,
              });

            console.log('[Billing Webhook] Usage reset for new period:', { organizationId, periodStartDate, periodEndDate });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organizationId;

        console.log('[Billing Webhook] Subscription canceled:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          organizationId,
        });

        // Mark subscription as canceled (keep plan_tier so user sees "resubscribe")
        if (supabase && organizationId) {
          await supabase
            .from('organizations')
            .update({
              subscription_status: 'canceled',
              subscription_id: null,
              current_period_start: null,
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', organizationId);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('[Billing Webhook] Invoice paid:', {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          amountPaid: invoice.amount_paid,
        });
        // Payment recorded via subscription events
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string;

        console.log('[Billing Webhook] Payment failed:', {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          attemptCount: invoice.attempt_count,
          subscriptionId,
        });

        // Mark organization subscription as past_due
        if (supabase && subscriptionId) {
          await supabase
            .from('organizations')
            .update({
              subscription_status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('subscription_id', subscriptionId);
        }
        break;
      }

      default:
        console.log(`[Billing Webhook] Unhandled event type: ${event.type}`);
    }

    // Acknowledge receipt of the event
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Billing Webhook] Error:', error);
    captureError(error, { route: 'billing/webhook' });
    await flushSentry();
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
