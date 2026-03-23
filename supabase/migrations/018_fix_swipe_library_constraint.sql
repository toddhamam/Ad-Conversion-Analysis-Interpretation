-- 018_fix_swipe_library_constraint.sql
-- Fix: Drop the original 4-column unique constraint that migration 017 failed to remove.
--
-- Migration 017 attempted:
--   DROP CONSTRAINT IF EXISTS swipe_library_items_organization_id_ad_account_id_element_ty_key;
-- But PostgreSQL auto-truncates long constraint names, so the actual name didn't match.
-- The old 4-column constraint (org, account, type, hash) remained, blocking any upsert
-- that targets the new 5-column constraint (org, account, type, hash, group_id) when the
-- same content_hash already exists — causing every save attempt to return 500.

-- Step 1: Find and drop ALL unique constraints on swipe_library_items EXCEPT the one we want.
-- The desired constraint is: (organization_id, ad_account_id, element_type, content_hash, group_id)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'swipe_library_items'
      AND con.contype = 'u'  -- unique constraints only
      AND con.conname != 'swipe_library_items_org_account_type_hash_group_key'
  LOOP
    EXECUTE format('ALTER TABLE swipe_library_items DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped stale unique constraint: %', r.conname;
  END LOOP;
END
$$;

-- Step 2: Ensure the correct 5-column constraint exists
-- (idempotent — silently succeeds if already present from migration 017)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'swipe_library_items_org_account_type_hash_group_key'
  ) THEN
    ALTER TABLE swipe_library_items
      ADD CONSTRAINT swipe_library_items_org_account_type_hash_group_key
      UNIQUE (organization_id, ad_account_id, element_type, content_hash, group_id);
    RAISE NOTICE 'Created 5-column unique constraint';
  END IF;
END
$$;

-- Step 3: Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';
