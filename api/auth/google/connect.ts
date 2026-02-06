import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://app.convertra.io/api/auth/google/callback';

// Request both GSC read and Indexing API scopes in one consent
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/indexing',
].join(' ');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured' });
  }

  const { siteId, returnUrl } = req.query;

  if (!siteId || typeof siteId !== 'string') {
    return res.status(400).json({ error: 'siteId is required' });
  }

  // Generate CSRF state token
  const csrfToken = crypto.randomBytes(32).toString('hex');

  // Encode state with site ID and return URL
  const state = Buffer.from(
    JSON.stringify({
      siteId,
      csrfToken,
      returnUrl: typeof returnUrl === 'string' ? returnUrl : '/seo-iq',
    })
  ).toString('base64url');

  // Store CSRF token in httpOnly cookie
  res.setHeader(
    'Set-Cookie',
    `google_oauth_state=${csrfToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
  );

  // Build Google OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('access_type', 'offline'); // Gets refresh_token
  authUrl.searchParams.set('prompt', 'consent'); // Forces consent to get refresh_token
  authUrl.searchParams.set('state', state);

  return res.redirect(302, authUrl.toString());
}
