-- 013_enable_rls_credit_tables.sql
-- Enable RLS on credit_transactions and ensure usage_tracking RLS is active.
-- Both tables are written by backend serverless functions using the service role key
-- (which bypasses RLS), so policies only need to cover authenticated user reads.

-- ─── Enable RLS ─────────────────────────────────────────────────────────────
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;  -- idempotent, already enabled in 001

-- ─── credit_transactions policies ───────────────────────────────────────────

-- Users can view their own org's credit transactions
CREATE POLICY "Users can view org credit transactions" ON credit_transactions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

-- Service role handles all writes (inserts, updates) — no INSERT/UPDATE policy needed
-- for end users since all mutations go through backend API routes.

-- ─── Ensure usage_tracking SELECT policy exists ─────────────────────────────
-- (Already created in 001, but included here as a safety net via IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'usage_tracking'
      AND policyname = 'Users can view org usage'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can view org usage" ON usage_tracking
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
        )
    $policy$;
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
