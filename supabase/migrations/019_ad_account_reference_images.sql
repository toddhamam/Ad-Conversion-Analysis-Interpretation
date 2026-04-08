-- Add reference_image_metadata JSONB column to organization_ad_accounts.
-- Stores lightweight image metadata (adId, conversionRate, conversions,
-- qualityScore, dimensions) per ad account for cross-account import.
-- Actual base64 image data remains in client-side localStorage.

ALTER TABLE organization_ad_accounts
  ADD COLUMN IF NOT EXISTS reference_image_metadata JSONB DEFAULT NULL;

-- Force PostgREST to see the new column
NOTIFY pgrst, 'reload schema';
