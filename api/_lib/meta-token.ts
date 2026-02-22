import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from './encryption.js';
import { captureError } from './sentry.js';

const GRAPH_API_VERSION = 'v21.0'; // Match callback.ts for token exchange
const REFRESH_BUFFER_DAYS = 7;

interface RefreshResult {
  success: boolean;
  newExpiresAt?: Date;
  error?: string;
}

/**
 * Attempt to refresh a Meta long-lived token by exchanging it for a new one.
 *
 * Meta's long-lived token refresh:
 * - Exchange a still-valid long-lived token for a new one (~60 day expiry)
 * - The current token MUST still be valid (not expired)
 * - Uses the same fb_exchange_token endpoint as initial OAuth
 *
 * Returns { success: true, newExpiresAt } on success.
 * Returns { success: false, error } on failure — caller should NOT block the request.
 */
export async function refreshMetaToken(
  organizationId: string,
  encryptedToken: string,
  supabase: SupabaseClient
): Promise<RefreshResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return { success: false, error: 'META_APP_ID or META_APP_SECRET not configured' };
  }

  let currentToken: string;
  try {
    currentToken = decrypt(encryptedToken);
  } catch (err: unknown) {
    return { success: false, error: `Failed to decrypt token: ${err instanceof Error ? err.message : 'Unknown'}` };
  }

  try {
    const refreshUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
    refreshUrl.searchParams.set('grant_type', 'fb_exchange_token');
    refreshUrl.searchParams.set('client_id', appId);
    refreshUrl.searchParams.set('client_secret', appSecret);
    refreshUrl.searchParams.set('fb_exchange_token', currentToken);

    const response = await fetch(refreshUrl.toString());
    const data = await response.json();

    if (!response.ok || data.error) {
      const errorMsg = data.error?.message || `HTTP ${response.status}`;
      // Update last_error but do NOT change status — token may still be valid
      await supabase
        .from('organization_credentials')
        .update({
          last_error: `Token refresh failed: ${errorMsg}`,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('provider', 'meta');
      return { success: false, error: errorMsg };
    }

    const newToken = data.access_token;
    const expiresIn = data.expires_in || 5184000; // Default 60 days
    const newExpiresAt = new Date();
    newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expiresIn);

    const newEncryptedToken = encrypt(newToken);

    const { error: dbError } = await supabase
      .from('organization_credentials')
      .update({
        access_token_encrypted: newEncryptedToken,
        token_expires_at: newExpiresAt.toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('provider', 'meta');

    if (dbError) {
      return { success: false, error: `DB update failed: ${dbError.message}` };
    }

    return { success: true, newExpiresAt };
  } catch (err: unknown) {
    captureError(err, { route: 'meta/token-refresh', organizationId });
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Check whether a token is within the refresh window (7 days before expiry).
 */
export function isWithinRefreshWindow(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false;
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const refreshThreshold = Date.now() + REFRESH_BUFFER_DAYS * 24 * 60 * 60 * 1000;
  return expiresAt <= refreshThreshold && expiresAt > Date.now();
}

/**
 * Check whether a token is already expired.
 */
export function isTokenExpired(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false;
  return new Date(tokenExpiresAt).getTime() < Date.now();
}
