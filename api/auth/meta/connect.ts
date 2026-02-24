import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { initSentry } from '../../_lib/sentry.js';

initSentry();

const META_APP_ID = process.env.META_APP_ID;
// Facebook Login for Business configuration ID — defines permissions and assets
// requested during the OAuth flow. Created in Meta Developer Dashboard under
// Facebook Login for Business → Configurations.
const META_CONFIG_ID = process.env.META_CONFIG_ID;

function getRedirectUri(req: VercelRequest): string {
  if (process.env.META_REDIRECT_URI) return process.env.META_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.convertraiq.com';
  return `${proto}://${host}/api/auth/meta/callback`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { organizationId, returnUrl } = req.query;
  const fallbackUrl = typeof returnUrl === 'string'
    ? returnUrl
    : (typeof organizationId === 'string' ? `/admin/organizations/${organizationId}` : '/admin');

  if (!META_APP_ID || !META_CONFIG_ID) {
    return res.redirect(
      302,
      `${fallbackUrl}?error=config&message=${encodeURIComponent('Meta OAuth is not configured. Set META_APP_ID, META_APP_SECRET, and META_CONFIG_ID environment variables in Vercel.')}`
    );
  }

  if (!organizationId || typeof organizationId !== 'string') {
    return res.redirect(
      302,
      `${fallbackUrl}?error=config&message=${encodeURIComponent('Organization ID is missing from the request.')}`
    );
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

  // Build Facebook Login for Business OAuth URL
  // Uses config_id instead of scope — the configuration defines permissions and assets
  const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  authUrl.searchParams.set('client_id', META_APP_ID);
  authUrl.searchParams.set('redirect_uri', getRedirectUri(req));
  authUrl.searchParams.set('config_id', META_CONFIG_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('override_default_response_type', 'true');
  authUrl.searchParams.set('state', state);

  // Redirect to Facebook login
  return res.redirect(302, authUrl.toString());
}
