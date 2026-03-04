-- Fix unlimited seat values for enterprise and velocity_partner orgs
-- Migration 008 used 10 (enterprise) and 999 (velocity_partner) instead of -1 (unlimited).
-- This corrects any existing orgs that were set with the old values.

UPDATE organizations
SET ad_account_seats = -1,
    updated_at = NOW()
WHERE plan_tier IN ('enterprise', 'velocity_partner')
  AND ad_account_seats != -1;
