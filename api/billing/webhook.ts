import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' })
  : null;

// Initialize Supabase for organization updates
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

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

        // Update organization with Stripe customer and subscription info
        if (supabase && organizationId) {
          const { error: updateError } = await supabase
            .from('organizations')
            .update({
              stripe_customer_id: session.customer as string,
              subscription_id: session.subscription as string,
              subscription_status: 'active',
              plan_tier: planTier || 'pro',
              billing_interval: billingInterval || 'monthly',
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
          await supabase
            .from('organizations')
            .update({
              subscription_id: subscription.id,
              subscription_status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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
          await supabase
            .from('organizations')
            .update({
              subscription_status: subscription.cancel_at_period_end ? 'canceling' : subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', organizationId);
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

        // Revert organization to free tier
        if (supabase && organizationId) {
          await supabase
            .from('organizations')
            .update({
              subscription_status: 'canceled',
              plan_tier: 'free',
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
        const subscriptionId = invoice.subscription as string;

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
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
