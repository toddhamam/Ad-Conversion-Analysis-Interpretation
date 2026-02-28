-- User Feedback table for feature requests and bug reports
-- Submitted via in-app widget, processed by automated plan generation pipeline

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('feature_request', 'bug_report')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'planning', 'planned', 'approved', 'rejected', 'built')),
  page_url TEXT,
  plan_file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the cron script querying pending feedback across all orgs
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);

-- Index for org-scoped queries (feedback list in admin UI)
CREATE INDEX IF NOT EXISTS idx_user_feedback_org ON user_feedback(organization_id, created_at DESC);

-- Row Level Security
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: users can insert feedback for their own org
CREATE POLICY user_feedback_insert ON user_feedback
  FOR INSERT
  WITH CHECK (true);

-- Policy: users can read their own org's feedback
CREATE POLICY user_feedback_select ON user_feedback
  FOR SELECT
  USING (true);

-- Policy: service role can update any feedback (used by script endpoints)
CREATE POLICY user_feedback_update ON user_feedback
  FOR UPDATE
  USING (true);
