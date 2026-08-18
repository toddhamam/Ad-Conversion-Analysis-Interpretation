// Shared JWT authentication for API routes.
//
// Organization ID is always derived from the authenticated user's profile — never
// from client input. See "API Authentication & Tenant Isolation" in CLAUDE.md.
//
// This was previously duplicated byte-for-byte in api/meta.ts and
// api/_lib/report-handlers.ts; both now import it from here.

import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AuthContext {
  userId: string;
  organizationId: string;
}

export async function authenticateRequest(req: VercelRequest): Promise<AuthContext | null> {
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
  return { userId: profile.id, organizationId: profile.organization_id };
}
