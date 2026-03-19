-- Add products JSONB column to organization_ad_accounts
-- Stores product metadata (name, author, description, URL) per ad account.
-- Product images remain in client-side localStorage.

ALTER TABLE organization_ad_accounts
  ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'::jsonb;

-- Force PostgREST to see the new column
NOTIFY pgrst, 'reload schema';
