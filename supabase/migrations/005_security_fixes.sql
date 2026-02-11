-- Migration 005: Security fixes from Supabase database linter
--
-- Fixes:
--   ERROR  rls_disabled_in_public        - funnel_events has no RLS
--   ERROR  sensitive_columns_exposed      - funnel_events session_id exposed without RLS
--   WARN   function_search_path_mutable   - update_updated_at_column() and update_updated_at()
--   WARN   rls_policy_always_true         - Unrestricted INSERT policies on organizations and users
--

-- ============================================================================
-- 1. Enable RLS on funnel_events
-- ============================================================================
-- All reads are via service role key in api/funnel/metrics.ts and
-- api/funnel/active-sessions.ts. All writes are from the external funnel site
-- via service role key. No anon/authenticated access is needed.
-- Enabling RLS with no policies blocks PostgREST client access while service
-- role key continues to bypass RLS.
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Fix mutable search_path on trigger functions
-- ============================================================================
-- Without an explicit search_path, a malicious role could shadow the 'public'
-- schema with a schema of the same name earlier in the path.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- The linter also flagged update_updated_at (without _column suffix).
-- Recreate it with a fixed search_path if it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.update_updated_at()
      RETURNS TRIGGER AS $body$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql SET search_path = '';
    $func$;
  END IF;
END;
$$;

-- ============================================================================
-- 3. Drop overly permissive INSERT policies on organizations
-- ============================================================================
-- Organization creation is handled exclusively by service role key in
-- handleProvisionOrg() (api/seoiq.ts). These policies allowed any anonymous
-- or authenticated user to insert arbitrary rows via PostgREST.
DROP POLICY IF EXISTS "Allow signup inserts for organizations" ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

-- ============================================================================
-- 4. Drop overly permissive INSERT policy on users
-- ============================================================================
-- User profile creation is handled exclusively by service role key in
-- handleProvisionOrg() (api/seoiq.ts). This policy allowed any anonymous
-- user to insert arbitrary rows via PostgREST.
DROP POLICY IF EXISTS "Allow signup inserts for users" ON public.users;
