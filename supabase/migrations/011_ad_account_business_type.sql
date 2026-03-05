-- Add per-ad-account business type override
-- NULL means "inherit from organization default"
-- Valid values: 'ecommerce', 'leadgen'

ALTER TABLE organization_ad_accounts
ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT NULL;

-- Refresh PostgREST schema cache so the new column is immediately queryable
NOTIFY pgrst, 'reload schema';
