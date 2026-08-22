-- 022_inspiration_library.sql
-- Inspiration Library: externally-sourced creative used as STYLE REFERENCES for CreativeIQ
-- image generation.
--
-- Deliberately a SEPARATE table from swipe_library_items. Those are the org's own proven
-- winners, with measured performance behind them. These are unproven outside material whose
-- only proof signal is longevity. Merging the two would make it possible to present a
-- competitor's ad as a measured winner, which is the exact failure the visual provenance
-- model (src/lib/referenceProvenance.ts) exists to prevent.

CREATE TABLE IF NOT EXISTS inspiration_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  ingest_lane TEXT NOT NULL
    CHECK (ingest_lane IN ('ad_library', 'screenshot', 'deck_upload', 'url_import')),

  -- Pixels. image_data is excluded from list queries and loaded on demand.
  image_data TEXT NOT NULL,
  image_thumbnail TEXT,
  image_mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  image_width INT,
  image_height INT,
  quality_score INT,

  -- Provenance.
  -- NOTE: there is deliberately NO cvr / cpa / conversions column here. Adding one would let
  -- competitor material be ranked and described as if it were measured.
  advertiser_name TEXT,
  advertiser_page_id TEXT,
  source_url TEXT,
  source_snapshot_url TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  days_running INT,                 -- longevity: the ONLY proof signal available here
  is_still_running BOOLEAN,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ad_copy_snippet TEXT,

  -- Cached Gemini style descriptor so the vision call isn't re-run on every generation.
  style_descriptor JSONB,
  style_descriptor_model TEXT,
  style_descriptor_at TIMESTAMPTZ,

  content_hash TEXT NOT NULL,       -- SHA-256 of the FULL normalized base64
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  is_pinned BOOLEAN DEFAULT false,
  saved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Explicitly NAMED so PostgreSQL cannot auto-truncate it. Migration 017 created an
  -- unnamed constraint whose generated name was truncated, so 017's own DROP IF EXISTS
  -- silently no-op'd and every save 500'd until 018 cleaned it up — handleSwipeSave still
  -- carries a dual-onConflict fallback because of it. Do not inherit that.
  CONSTRAINT inspiration_library_items_org_acct_hash_key
    UNIQUE (organization_id, ad_account_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_inspiration_org ON inspiration_library_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_org_acct
  ON inspiration_library_items(organization_id, ad_account_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_created
  ON inspiration_library_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspiration_longevity
  ON inspiration_library_items(days_running DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inspiration_tags
  ON inspiration_library_items USING GIN(tags);

-- RLS — structurally identical to swipe_library_items (015). The API uses the service-role
-- client and enforces tenancy manually with .eq('organization_id', ...) on every query;
-- these policies are the second line of defence.
ALTER TABLE inspiration_library_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org inspiration items" ON inspiration_library_items;
CREATE POLICY "Users can view own org inspiration items" ON inspiration_library_items
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Members can manage inspiration items" ON inspiration_library_items;
CREATE POLICY "Members can manage inspiration items" ON inspiration_library_items
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Service role full access" ON inspiration_library_items;
CREATE POLICY "Service role full access" ON inspiration_library_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Force PostgREST schema cache refresh. Without this, queries fail with
-- "Could not find the table in the schema cache".
NOTIFY pgrst, 'reload schema';
