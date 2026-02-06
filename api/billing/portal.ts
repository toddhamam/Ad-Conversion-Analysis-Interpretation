import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// Initialize Stripe (handle missing key gracefully)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

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
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'No customer ID provided' });
    }

    // Create a billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/billing`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('[Billing Portal API] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create portal session';
    return res.status(500).json({ error: message });
  }
}
