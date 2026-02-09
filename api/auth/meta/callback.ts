import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../../_lib/encryption.js';

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;

function getRedirectUri(req: VercelRequest): string {
  if (process.env.META_REDIRECT_URI) return process.env.META_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.convertraiq.com';
  return `${proto}://${host}/api/auth/meta/callback`;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface AdAccountResponse {
  data: Array<{
    account_id: string;
    id: string;
    name: string;
    account_status: number;
    currency: string;
  }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    return res.redirect(302, `/admin?error=oauth_failed&message=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  if (!state || typeof state !== 'string') {
    return res.status(400).json({ error: 'State parameter is required' });
  }

  // Decode and validate state
  let stateData: { organizationId: string; csrfToken: string; returnUrl: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  // Verify CSRF token from cookie
  const cookies = parseCookies(req.headers.cookie || '');
  const storedCsrf = cookies['meta_oauth_state'];

  if (!storedCsrf || storedCsrf !== stateData.csrfToken) {
    console.error('CSRF mismatch:', { stored: storedCsrf, received: stateData.csrfToken });
    return res.status(400).json({ error: 'Invalid CSRF token' });
  }

  // Clear the CSRF cookie
  res.setHeader(
    'Set-Cookie',
    'meta_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
  );

  try {
    // Exchange code for access token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', META_APP_ID!);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET!);
    tokenUrl.searchParams.set('redirect_uri', getRedirectUri(req));
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      throw new Error('Failed to exchange code for token');
    }

    const tokenData: TokenResponse = await tokenResponse.json();

    // Exchange short-lived token for long-lived token
    const longTokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    longTokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longTokenUrl.searchParams.set('client_id', META_APP_ID!);
    longTokenUrl.searchParams.set('client_secret', META_APP_SECRET!);
    longTokenUrl.searchParams.set('fb_exchange_token', tokenData.access_token);

    const longTokenResponse = await fetch(longTokenUrl.toString());
    const longTokenData: TokenResponse = await longTokenResponse.json();

    const accessToken = longTokenData.access_token || tokenData.access_token;
    const expiresIn = longTokenData.expires_in || tokenData.expires_in || 5184000; // Default 60 days

    // Fetch available ad accounts
    const adAccountsUrl = new URL('https://graph.facebook.com/v21.0/me/adaccounts');
    adAccountsUrl.searchParams.set('access_token', accessToken);
    adAccountsUrl.searchParams.set('fields', 'account_id,id,name,account_status,currency');

    const adAccountsResponse = await fetch(adAccountsUrl.toString());
    const adAccountsData: AdAccountResponse = await adAccountsResponse.json();

    // For white-glove setup, we'll auto-select the first active ad account
    // In a self-service flow, this would present a selection UI
    const activeAccount = adAccountsData.data?.find((acc) => acc.account_status === 1);

    // Calculate token expiration date
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresIn);

    // Encrypt the access token before storing
    let encryptedToken: string;
    try {
      encryptedToken = encrypt(accessToken);
    } catch (encErr) {
      throw new Error(`Encryption failed: ${encErr instanceof Error ? encErr.message : String(encErr)}`);
    }

    // Upsert credentials in database
    const { error: dbError } = await supabase
      .from('organization_credentials')
      .upsert(
        {
          organization_id: stateData.organizationId,
          provider: 'meta',
          access_token_encrypted: encryptedToken,
          ad_account_id: activeAccount?.id || null,
          token_expires_at: tokenExpiresAt.toISOString(),
          status: 'active',
          metadata: {
            available_accounts: adAccountsData.data || [],
            selected_account_name: activeAccount?.name || null,
            connected_at: new Date().toISOString(),
          },
        },
        {
          onConflict: 'organization_id,provider',
        }
      );

    if (dbError) {
      console.error('Failed to store credentials:', dbError);
      throw new Error(`Failed to save Meta credentials: ${dbError.message || dbError.code || JSON.stringify(dbError)}`);
    }

    // Redirect back with success
    const returnUrl = new URL(stateData.returnUrl, req.headers.origin || 'https://www.convertraiq.com');
    returnUrl.searchParams.set('meta_connected', 'true');
    returnUrl.searchParams.set('ad_account', activeAccount?.name || 'connected');

    return res.redirect(302, returnUrl.pathname + returnUrl.search);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const returnUrl = stateData?.returnUrl || '/admin';
    return res.redirect(302, `${returnUrl}?error=meta_connection_failed&message=${encodeURIComponent(err instanceof Error ? err.message : 'Unknown error')}`);
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
