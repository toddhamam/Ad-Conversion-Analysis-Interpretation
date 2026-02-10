import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe (handle missing key gracefully)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' as const as any })
  : null;

// Initialize Supabase for auth + org lookup
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

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
    // Authenticate and derive org from JWT
    const auth = await authenticateRequest(req);
    const organizationId = auth?.organizationId || req.body.organizationId;

    // Look up Stripe customer ID from org (preferred) or use client-provided
    let customerId: string | null = null;

    if (supabase && organizationId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', organizationId)
        .single();

      customerId = org?.stripe_customer_id || null;
    }

    // Fall back to client-provided customer ID
    if (!customerId) {
      customerId = req.body.customerId || null;
    }

    if (!customerId) {
      return res.status(400).json({ error: 'No customer ID found. Please upgrade to a paid plan first.' });
    }

    // Create a billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/billing`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error: unknown) {
    console.error('[Billing Portal API] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create portal session';
    return res.status(500).json({ error: message });
  }
}
