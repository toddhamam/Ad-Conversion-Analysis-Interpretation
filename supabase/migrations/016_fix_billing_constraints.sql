-- Fix CHECK constraints on organizations table to match app usage
-- plan_tier: add 'starter' and 'velocity_partner' tiers
-- subscription_status: add 'canceling' (Stripe cancel_at_period_end state)

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'enterprise', 'velocity_partner'));

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'canceling', 'trialing', 'incomplete'));
