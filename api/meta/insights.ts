import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../_lib/encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface OrganizationCredential {
  id: string;
  organization_id: string;
  provider: string;
  access_token_encrypted: string;
  ad_account_id: string | null;
  token_expires_at: string | null;
  status: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow both GET (simple queries) and POST (complex queries)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get organization ID from query or body
  const organizationId =
    req.method === 'GET'
      ? req.query.organizationId
      : req.body?.organizationId || req.query.organizationId;

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

    const cred = credential as OrganizationCredential;

    // Check if token is expired
    if (cred.token_expires_at && new Date(cred.token_expires_at) < new Date()) {
      // Mark credential as expired
      await supabase
        .from('organization_credentials')
        .update({ status: 'expired' })
        .eq('id', cred.id);

      return res.status(401).json({
        error: 'Token expired',
        message: 'Meta access token has expired. Please reconnect your account.',
      });
    }

    // Decrypt the access token
    const accessToken = decrypt(cred.access_token_encrypted);

    // Get request parameters
    const endpoint = req.method === 'GET' ? req.query.endpoint : req.body?.endpoint;
    const fields = req.method === 'GET' ? req.query.fields : req.body?.fields;
    const datePreset = req.method === 'GET' ? req.query.date_preset : req.body?.date_preset;
    const timeRange = req.method === 'GET' ? req.query.time_range : req.body?.time_range;
    const level = req.method === 'GET' ? req.query.level : req.body?.level;
    const limit = req.method === 'GET' ? req.query.limit : req.body?.limit;

    // Build the API URL
    let apiUrl: URL;

    if (endpoint && typeof endpoint === 'string') {
      // Custom endpoint
      apiUrl = new URL(`${GRAPH_API_BASE}/${endpoint}`);
    } else if (cred.ad_account_id) {
      // Default: ad account insights
      apiUrl = new URL(`${GRAPH_API_BASE}/${cred.ad_account_id}/insights`);
    } else {
      return res.status(400).json({
        error: 'No ad account configured',
        message: 'Please select an ad account in your Meta connection settings',
      });
    }

    // Add parameters
    apiUrl.searchParams.set('access_token', accessToken);

    if (fields) {
      apiUrl.searchParams.set('fields', String(fields));
    } else {
      // Default fields for insights
      apiUrl.searchParams.set(
        'fields',
        'spend,impressions,clicks,conversions,cpc,cpm,ctr,cost_per_conversion,actions,action_values'
      );
    }

    if (datePreset) {
      apiUrl.searchParams.set('date_preset', String(datePreset));
    } else if (timeRange) {
      apiUrl.searchParams.set('time_range', String(timeRange));
    } else {
      apiUrl.searchParams.set('date_preset', 'last_30d');
    }

    if (level) {
      apiUrl.searchParams.set('level', String(level));
    }

    if (limit) {
      apiUrl.searchParams.set('limit', String(limit));
    }

    // Make request to Meta Graph API
    const response = await fetch(apiUrl.toString());
    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', data);

      // Handle specific error codes
      if (data.error?.code === 190) {
        // Invalid access token
        await supabase
          .from('organization_credentials')
          .update({ status: 'invalid' })
          .eq('id', cred.id);

        return res.status(401).json({
          error: 'Invalid token',
          message: 'Meta access token is invalid. Please reconnect your account.',
        });
      }

      return res.status(response.status).json({
        error: 'Meta API error',
        message: data.error?.message || 'Unknown error from Meta API',
        code: data.error?.code,
      });
    }

    // Return the data
    return res.status(200).json(data);
  } catch (err) {
    console.error('Meta insights proxy error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Failed to fetch Meta insights',
    });
  }
}
