import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from './_lib/encryption.js';

// ── Shared config ──────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'https://www.convertraiq.com/api/auth/google/callback';

// Request both GSC read and Indexing API scopes in one consent
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/indexing',
].join(' ');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query;

  switch (action) {
    case 'connect':
      return handleConnect(req, res);
    case 'callback':
      return handleCallback(req, res);
    default:
      return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}

// ── Connect handler ────────────────────────────────────────────────────────────

async function handleConnect(req: VercelRequest, res: VercelResponse) {
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

// ── Callback handler ───────────────────────────────────────────────────────────

async function handleCallback(req: VercelRequest, res: VercelResponse) {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

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
