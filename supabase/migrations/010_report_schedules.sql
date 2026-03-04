-- Dashboard Report Schedules & Email Delivery
-- Enables users to schedule automated email reports of their dashboard metrics.
-- Supports per-account and cross-account (agency) reports.

-- =============================================================================
-- 1. REPORT SCHEDULES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What to report on (NULL = cross-account aggregate for agencies)
  ad_account_id TEXT,
  report_name TEXT NOT NULL DEFAULT 'Dashboard Report',

  -- Schedule timing
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 28),
  delivery_hour INT NOT NULL DEFAULT 8 CHECK (delivery_hour >= 0 AND delivery_hour <= 23),
  timezone TEXT NOT NULL DEFAULT 'UTC',

  -- What metrics to include (array of metric IDs)
  metrics JSONB NOT NULL DEFAULT '["totalRevenue","totalPurchases","adSpend","roas","conversionRate","netProfit"]',

  -- Date range for report data
  date_range_preset TEXT NOT NULL DEFAULT 'last_7d',

  -- Include previous period comparison (green/red deltas)
  include_comparison BOOLEAN NOT NULL DEFAULT true,

  -- Recipients — array of email addresses (max 10 enforced in application)
  recipients JSONB NOT NULL DEFAULT '[]',

  -- Status & scheduling
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  send_lock_until TIMESTAMPTZ,  -- Idempotency lock for cron
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate schedules for same user/account/frequency
  UNIQUE(user_id, ad_account_id, frequency)
);

-- Validate day_of_week is set for weekly schedules
ALTER TABLE report_schedules
  ADD CONSTRAINT chk_weekly_day
  CHECK (frequency != 'weekly' OR day_of_week IS NOT NULL);

-- Validate day_of_month is set for monthly schedules
ALTER TABLE report_schedules
  ADD CONSTRAINT chk_monthly_day
  CHECK (frequency != 'monthly' OR day_of_month IS NOT NULL);

-- Index for cron: find schedules that are due and not locked
CREATE INDEX IF NOT EXISTS idx_report_schedules_due
  ON report_schedules(next_run_at)
  WHERE is_active = true;

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_report_schedules_user
  ON report_schedules(user_id, organization_id);

-- =============================================================================
-- 2. REPORT HISTORY TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  ad_account_id TEXT,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  metrics_included JSONB NOT NULL,
  recipients JSONB,

  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for recent history lookup
CREATE INDEX IF NOT EXISTS idx_report_history_org
  ON report_history(organization_id, created_at DESC);

-- =============================================================================
-- 3. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

-- Users can manage report schedules belonging to their own organization
CREATE POLICY "Users can manage their org report schedules"
  ON report_schedules
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Service role bypasses RLS
CREATE POLICY "Service role full access to report schedules"
  ON report_schedules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read report history belonging to their own organization
CREATE POLICY "Users can read their org report history"
  ON report_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Service role bypasses RLS
CREATE POLICY "Service role full access to report history"
  ON report_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
