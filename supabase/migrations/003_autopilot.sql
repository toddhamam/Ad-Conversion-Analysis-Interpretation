-- SEO IQ Autopilot: Add scheduling and pipeline state columns to seo_sites
-- Run this migration in your Supabase SQL editor

ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_enabled boolean DEFAULT false;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_cadence text DEFAULT 'weekly';
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_iq_level text DEFAULT 'medium';
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_articles_per_run integer DEFAULT 1;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_next_run_at timestamptz DEFAULT null;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_pipeline_step text DEFAULT null;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_pipeline_keyword_id uuid DEFAULT null;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_pipeline_article_id uuid DEFAULT null;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_last_run_at timestamptz DEFAULT null;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS autopilot_last_error text DEFAULT null;
