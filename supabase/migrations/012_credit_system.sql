-- 012_credit_system.sql
-- Credit-based pricing system: usage tracking, bonus credits, audit ledger

-- ─── Create usage_tracking table if it doesn't exist ────────────────────────
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Legacy usage counts (reset each billing period)
  creatives_generated INTEGER DEFAULT 0,
  analyses_run INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One record per organization per billing period
  UNIQUE(organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_organization ON usage_tracking(organization_id);

-- ─── Add credit columns to usage_tracking ───────────────────────────────────
ALTER TABLE usage_tracking
  ADD COLUMN IF NOT EXISTS credits_used NUMERIC(10,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_ads_generated INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_ads_generated INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS text_ads_generated INTEGER DEFAULT 0;

-- ─── Alter organizations table ────────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bonus_credits NUMERIC(10,1) DEFAULT 0;

-- ─── Create credit_transactions audit ledger ──────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  credits NUMERIC(10,1) NOT NULL,  -- positive = consumed/reserved, negative = refund
  action_type TEXT NOT NULL CHECK (action_type IN (
    'image_ad', 'video_ad', 'text_ad', 'channel_analysis',
    'credit_pack_purchase', 'period_reset', 'refund'
  )),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('reserved', 'confirmed', 'refunded')),
  description TEXT,
  quantity INTEGER DEFAULT 1,  -- number of items (e.g., 3 images)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_credit_transactions_org
  ON credit_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created
  ON credit_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_status
  ON credit_transactions (organization_id, status)
  WHERE status = 'reserved';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
