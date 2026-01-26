import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' })
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
        console.log('[Billing Webhook] Checkout completed:', {
          sessionId: session.id,
          customerId: session.customer,
          subscriptionId: session.subscription,
          planTier: session.metadata?.planTier,
        });
        // TODO: Update user record with Stripe customer ID and subscription status
        // This would typically update a database record
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Billing Webhook] Subscription created:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          planTier: subscription.metadata?.planTier,
        });
        // TODO: Sync subscription to database
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Billing Webhook] Subscription updated:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
        // TODO: Sync subscription changes to database
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Billing Webhook] Subscription canceled:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
        });
        // TODO: Mark subscription as canceled in database, revert to free tier
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('[Billing Webhook] Invoice paid:', {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          amountPaid: invoice.amount_paid,
        });
        // TODO: Record payment in database
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('[Billing Webhook] Payment failed:', {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          attemptCount: invoice.attempt_count,
        });
        // TODO: Handle failed payment (send notification, mark subscription as past_due)
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
