-- Agency Multi-Ad-Account Support
-- Enables organizations to manage multiple Meta ad accounts under one Business Manager.
-- One OAuth token (in organization_credentials) works for all ad accounts;
-- this table stores per-account configuration (page_id, pixel_id, etc.).

-- =============================================================================
-- 1. ORGANIZATION AD ACCOUNTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS organization_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Meta ad account identifiers
  ad_account_id TEXT NOT NULL,           -- e.g., "act_123456789"
  ad_account_name TEXT,                  -- Human-readable name from Meta API

  -- Per-account configuration
  page_id TEXT,                          -- Facebook Page ID for this account
  pixel_id TEXT,                         -- Meta Pixel ID for this account

  -- Status
  is_active BOOLEAN DEFAULT true,        -- Whether this account seat is activated
  account_status INTEGER,                -- Meta account_status (1=ACTIVE, 2=DISABLED, etc.)
  currency TEXT,                         -- Currency from Meta (USD, AUD, etc.)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per ad account per organization
  UNIQUE(organization_id, ad_account_id)
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_org_ad_accounts_org_id
  ON organization_ad_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_ad_accounts_active
  ON organization_ad_accounts(organization_id, is_active)
  WHERE is_active = true;

-- =============================================================================
-- 2. ADD SEAT TRACKING COLUMNS TO ORGANIZATIONS
-- =============================================================================
-- ad_account_seats: how many ad account seats the org has paid for
-- ad_account_seats_used: how many are currently activated (denormalized for fast reads)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ad_account_seats INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ad_account_seats_used INTEGER DEFAULT 0;

-- =============================================================================
-- 3. EXPAND plan_tier CHECK CONSTRAINT TO INCLUDE 'agency'
-- =============================================================================
-- Drop and recreate the CHECK constraint to add the 'agency' tier.
-- Note: Supabase/Postgres requires dropping the old constraint first.

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'agency', 'enterprise', 'velocity_partner'));

-- =============================================================================
-- 4. BACKFILL: Existing orgs with active Meta credentials get an ad account row
-- =============================================================================
-- This ensures existing single-account orgs work seamlessly with the new table.

INSERT INTO organization_ad_accounts (
  organization_id,
  ad_account_id,
  ad_account_name,
  page_id,
  pixel_id,
  is_active,
  currency
)
SELECT
  oc.organization_id,
  oc.ad_account_id,
  (oc.metadata->>'selected_account_name'),
  oc.page_id,
  oc.pixel_id,
  true,
  'USD'  -- Default currency; will be updated on next status fetch
FROM organization_credentials oc
WHERE oc.provider = 'meta'
  AND oc.ad_account_id IS NOT NULL
  AND oc.status = 'active'
ON CONFLICT (organization_id, ad_account_id) DO NOTHING;

-- Backfill ad_account_seats based on existing plan_tier so paid orgs aren't capped at 1
UPDATE organizations
SET ad_account_seats = CASE plan_tier
  WHEN 'free' THEN 1
  WHEN 'starter' THEN 1
  WHEN 'pro' THEN 3
  WHEN 'agency' THEN 3
  WHEN 'enterprise' THEN 10
  WHEN 'velocity_partner' THEN 999
  ELSE 1
END;

-- Update seat counts for backfilled orgs
UPDATE organizations o
SET ad_account_seats_used = (
  SELECT COUNT(*)
  FROM organization_ad_accounts oaa
  WHERE oaa.organization_id = o.id
    AND oaa.is_active = true
);

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE organization_ad_accounts ENABLE ROW LEVEL SECURITY;

-- Users can read/write ad accounts belonging to their own organization
CREATE POLICY "Users can manage their org ad accounts"
  ON organization_ad_accounts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Service role bypasses RLS (for backend API routes)
CREATE POLICY "Service role full access to ad accounts"
  ON organization_ad_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
