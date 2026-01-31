import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const META_APP_ID = process.env.META_APP_ID;
const REDIRECT_URI = process.env.META_REDIRECT_URI || 'https://app.convertra.io/api/auth/meta/callback';

// Required scopes for Meta Marketing API access
const SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  'read_insights',
].join(',');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!META_APP_ID) {
    return res.status(500).json({ error: 'META_APP_ID is not configured' });
  }

  const { organizationId, returnUrl } = req.query;

  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ error: 'organizationId is required' });
  }

  // Generate CSRF state token to prevent attacks
  const csrfToken = crypto.randomBytes(32).toString('hex');

  // Encode state with organization ID and optional return URL
  const state = Buffer.from(
    JSON.stringify({
      organizationId,
      csrfToken,
      returnUrl: typeof returnUrl === 'string' ? returnUrl : '/admin/organizations/' + organizationId,
    })
  ).toString('base64url');

  // Store CSRF token in a secure httpOnly cookie
  res.setHeader(
    'Set-Cookie',
    `meta_oauth_state=${csrfToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  );

  // Build Facebook OAuth URL
  const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  authUrl.searchParams.set('client_id', META_APP_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  // Redirect to Facebook login
  return res.redirect(302, authUrl.toString());
}
