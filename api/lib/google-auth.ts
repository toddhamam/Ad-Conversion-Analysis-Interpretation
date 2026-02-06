import { decrypt } from './encryption';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Get a valid Google access token for a site, refreshing if expired.
 * Google access tokens expire after 1 hour, so this transparently
 * refreshes using the stored refresh token when needed.
 */
export async function getGoogleAccessToken(siteId: string): Promise<string | null> {
  // Fetch encrypted tokens from the site
  const { data: site, error } = await supabase
    .from('seo_sites')
    .select('google_access_token_encrypted, google_refresh_token_encrypted, google_token_expires_at, google_status')
    .eq('id', siteId)
    .single();

  if (error || !site) {
    console.error('Failed to fetch site credentials:', error?.message);
    return null;
  }

  if (site.google_status !== 'active' || !site.google_access_token_encrypted) {
    return null;
  }

  // Check if token is still valid (with 60s buffer)
  const expiresAt = new Date(site.google_token_expires_at).getTime();
  const now = Date.now();

  if (expiresAt > now + 60000) {
    // Token is still valid
    return decrypt(site.google_access_token_encrypted);
  }

  // Token expired — refresh it
  if (!site.google_refresh_token_encrypted) {
    // No refresh token available, mark as expired
    await supabase
      .from('seo_sites')
      .update({ google_status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', siteId);
    return null;
  }

  const refreshToken = decrypt(site.google_refresh_token_encrypted);
  const newTokens = await refreshGoogleToken(refreshToken);

  if (!newTokens) {
    // Refresh failed, mark as expired
    await supabase
      .from('seo_sites')
      .update({ google_status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', siteId);
    return null;
  }

  // Store the refreshed token
  const { encrypt: enc } = await import('./encryption');
  const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

  await supabase
    .from('seo_sites')
    .update({
      google_access_token_encrypted: enc(newTokens.access_token),
      google_token_expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', siteId);

  return newTokens.access_token;
}

/**
 * Refresh a Google access token using the refresh token.
 */
async function refreshGoogleToken(refreshToken: string): Promise<TokenRefreshResponse | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google token refresh failed:', response.status, errorText);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('Google token refresh error:', err);
    return null;
  }
}

/**
 * Decrypt and return both Google tokens for a site (for initial setup/debugging).
 */
export async function getGoogleTokens(siteId: string): Promise<GoogleTokens | null> {
  const { data: site, error } = await supabase
    .from('seo_sites')
    .select('google_access_token_encrypted, google_refresh_token_encrypted, google_token_expires_at')
    .eq('id', siteId)
    .single();

  if (error || !site || !site.google_access_token_encrypted) {
    return null;
  }

  return {
    access_token: decrypt(site.google_access_token_encrypted),
    refresh_token: site.google_refresh_token_encrypted ? decrypt(site.google_refresh_token_encrypted) : '',
    expires_at: site.google_token_expires_at,
  };
}
