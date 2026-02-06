-- Content Calendar: individual scheduled article runs
-- Run this migration in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS autopilot_scheduled_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES seo_sites(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'keyword_picked', 'generating', 'completed', 'failed', 'skipped')),
  keyword_id uuid DEFAULT NULL,
  article_id uuid DEFAULT NULL,
  keyword_text text DEFAULT NULL,
  article_title text DEFAULT NULL,
  published_url text DEFAULT NULL,
  error text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_runs_site_date ON autopilot_scheduled_runs(site_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_status ON autopilot_scheduled_runs(status, scheduled_date);
