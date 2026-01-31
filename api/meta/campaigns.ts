import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../lib/encryption';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { organizationId, fields, limit, status } = req.query;

  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  try {
    // Fetch organization credentials
    const { data: credential, error: credError } = await supabase
      .from('organization_credentials')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', 'meta')
      .eq('status', 'active')
      .single();

    if (credError || !credential) {
      return res.status(404).json({
        error: 'Meta credentials not found',
        message: 'Please connect your Meta Ads account first',
      });
    }

    if (!credential.ad_account_id) {
      return res.status(400).json({
        error: 'No ad account configured',
        message: 'Please select an ad account in your Meta connection settings',
      });
    }

    // Check token expiration
    if (credential.token_expires_at && new Date(credential.token_expires_at) < new Date()) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Meta access token has expired. Please reconnect your account.',
      });
    }

    // Decrypt the access token
    const accessToken = decrypt(credential.access_token_encrypted);

    // Build API URL
    const apiUrl = new URL(`${GRAPH_API_BASE}/${credential.ad_account_id}/campaigns`);
    apiUrl.searchParams.set('access_token', accessToken);

    if (fields) {
      apiUrl.searchParams.set('fields', String(fields));
    } else {
      apiUrl.searchParams.set(
        'fields',
        'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time,effective_status,insights{spend,impressions,clicks,conversions,ctr,cpc}'
      );
    }

    if (limit) {
      apiUrl.searchParams.set('limit', String(limit));
    }

    // Filter by status if provided
    if (status && typeof status === 'string') {
      const statusFilter = status.split(',').map((s) => `'${s.toUpperCase()}'`).join(',');
      apiUrl.searchParams.set('filtering', JSON.stringify([{ field: 'effective_status', operator: 'IN', value: statusFilter }]));
    }

    const response = await fetch(apiUrl.toString());
    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', data);
      return res.status(response.status).json({
        error: 'Meta API error',
        message: data.error?.message || 'Unknown error',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Meta campaigns proxy error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Failed to fetch campaigns',
    });
  }
}
