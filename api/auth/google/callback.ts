import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../../lib/encryption';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://app.convertra.io/api/auth/google/callback';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: oauthError } = req.query;

  // Handle OAuth errors
  if (oauthError) {
    console.error('Google OAuth error:', oauthError);
    return res.redirect(302, `/seo-iq?error=oauth_failed&message=${encodeURIComponent(String(oauthError))}`);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  if (!state || typeof state !== 'string') {
    return res.status(400).json({ error: 'State parameter is required' });
  }

  // Decode and validate state
  let stateData: { siteId: string; csrfToken: string; returnUrl: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  // Verify CSRF token from cookie
  const cookies = parseCookies(req.headers.cookie || '');
  const storedCsrf = cookies['google_oauth_state'];

  if (!storedCsrf || storedCsrf !== stateData.csrfToken) {
    console.error('CSRF mismatch:', { stored: storedCsrf, received: stateData.csrfToken });
    return res.status(400).json({ error: 'Invalid CSRF token' });
  }

  // Clear the CSRF cookie
  res.setHeader(
    'Set-Cookie',
    'google_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
  );

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Google token exchange failed:', tokenResponse.status, errorData);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    // Calculate token expiration
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokenData.expires_in);

    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;

    // Update the seo_sites row with Google credentials
    const { error: dbError } = await supabase
      .from('seo_sites')
      .update({
        google_access_token_encrypted: encryptedAccessToken,
        google_refresh_token_encrypted: encryptedRefreshToken,
        google_token_expires_at: tokenExpiresAt.toISOString(),
        google_scopes: tokenData.scope.split(' '),
        google_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', stateData.siteId);

    if (dbError) {
      console.error('Failed to store Google credentials:', dbError);
      throw new Error('Failed to save Google credentials');
    }

    // Redirect back with success
    const returnUrl = stateData.returnUrl || '/seo-iq';
    const separator = returnUrl.includes('?') ? '&' : '?';
    return res.redirect(302, `${returnUrl}${separator}google_connected=true&site_id=${stateData.siteId}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    const returnUrl = stateData?.returnUrl || '/seo-iq';
    return res.redirect(302, `${returnUrl}?error=google_connection_failed&message=${encodeURIComponent(err instanceof Error ? err.message : 'Unknown error')}`);
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.split('=');
    if (name) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });
  return cookies;
}
