import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Get the current Supabase session access token.
 * Returns null if Supabase is not configured (dev/localStorage fallback mode).
 */
export async function getAuthToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}
