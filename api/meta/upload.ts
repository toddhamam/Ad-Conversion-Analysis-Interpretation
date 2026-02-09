import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../_lib/encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GRAPH_API_VERSION = 'v24.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Authentication ──────────────────────────────────────────────────────────

async function authenticateRequest(req: VercelRequest): Promise<{ organizationId: string } | null> {
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
  return { organizationId: profile.organization_id };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Load credentials
  const { data: cred } = await supabase
    .from('organization_credentials')
    .select('access_token_encrypted, ad_account_id, status, token_expires_at')
    .eq('organization_id', auth.organizationId)
    .eq('provider', 'meta')
    .eq('status', 'active')
    .single();

  if (!cred) {
    return res.status(404).json({ error: 'Meta credentials not found' });
  }

  if (cred.token_expires_at && new Date(cred.token_expires_at) < new Date()) {
    return res.status(401).json({ error: 'Token expired' });
  }

  if (!cred.ad_account_id) {
    return res.status(400).json({ error: 'No ad account configured' });
  }

  const accessToken = decrypt(cred.access_token_encrypted);

  // Expect base64 image data in the request body
  const { imageBase64, filename } = req.body || {};

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  try {
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Build multipart form data manually for the Meta API
    const boundary = `----MetaUpload${Date.now()}`;
    const parts: Buffer[] = [];

    // Add access_token field
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${accessToken}\r\n`
    ));

    // Add image file
    const imageName = filename || 'ad_image.jpg';
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${imageName}"\r\nContent-Type: image/jpeg\r\n\r\n`
    ));
    parts.push(imageBuffer);
    parts.push(Buffer.from('\r\n'));

    // End boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const multipartBody = Buffer.concat(parts);

    const uploadUrl = `${GRAPH_API_BASE}/${cred.ad_account_id}/adimages`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(multipartBody.length),
      },
      body: multipartBody,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta image upload error:', data);
      return res.status(response.status).json({
        error: 'Image upload failed',
        message: data.error?.message || 'Unknown error',
      });
    }

    return res.status(200).json(data);
  } catch (err: unknown) {
    console.error('Meta upload proxy error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Upload failed',
    });
  }
}
