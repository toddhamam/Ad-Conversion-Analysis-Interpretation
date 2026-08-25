-- 023_showcase_assets.sql
-- Showcase Assets: the agency's OWN client-work screenshots, composited pixel-exact into ads.
--
-- A THIRD library table, and deliberately so. swipe_library_items (015) holds this org's own
-- ads WITH measured delivery data behind them. inspiration_library_items (022) holds external
-- material with none, whose only proof signal is longevity. Client work is the org's own
-- material with NO delivery data, so it belongs to neither: filing it in 015 would let a
-- never-delivered screenshot be ranked and described beside a measured winner, and filing it
-- in 022 would label the agency's own build as competitor material it must not reproduce.
-- Both existing taxonomies are CHECK constraints (element_type / ingest_lane) on tables whose
-- own headers forbid widening them.
--
-- A BEFORE/AFTER IS ONE ASSET IN TWO STATES, NOT TWO ROWS SHARING A KEY. Modelling it as two
-- columns on one row makes an orphaned "before" unrepresentable, needs no grouping UI, and
-- deletes both halves atomically. The multi-client results grid needs SELECTION (the operator
-- ticks N assets in a picker), not grouping, so it needs no schema support at all.

CREATE TABLE IF NOT EXISTS showcase_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,

  -- Whose work this is. The library is a flat list organised by client — one row per proof shot.
  client_name TEXT NOT NULL,
  project_url TEXT,
  -- Recorded and displayed; gates nothing in v1. The agency is putting a client's website into
  -- a paid ad, so whether permission was given is a fact worth carrying next to the pixels.
  client_consent BOOLEAN NOT NULL DEFAULT false,

  -- The hero / the "after". Always present. Excluded from list queries, loaded on demand.
  -- PNG or JPEG per image, whichever encoded smaller: website UI text is JPEG's pathological
  -- case (ringing around every glyph) but photo-heavy pages compress far better as JPEG.
  -- See the `showcase` profile in src/lib/imageNormalize.ts.
  image_data TEXT NOT NULL,
  image_thumbnail TEXT,
  image_mime_type TEXT NOT NULL DEFAULT 'image/png',
  image_width INT,
  image_height INT,

  -- The "before". NULL for a single-site hero. Same row as its pair, so the two can never be
  -- separated, orphaned, or duplicated. `before_image_thumbnail` doubles as the has-a-before
  -- flag in list queries, so no computed column is needed.
  before_image_data TEXT,
  before_image_thumbnail TEXT,
  before_image_mime_type TEXT,
  before_image_width INT,
  before_image_height INT,

  -- NOTE: there is deliberately NO cvr / cpa / roas / conversions column here, for exactly
  -- migration 022's reason. This material has never been delivered, so there is no measured
  -- figure it could honestly hold. A future `result_note` would be operator-ASSERTED text and
  -- must be labelled as such at every point of use — it is not a metric and must never be
  -- sorted or ranked on.

  device_hint TEXT CHECK (device_hint IN ('desktop', 'mobile', 'tablet')) DEFAULT 'desktop',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SHA-256 of the FULL normalized image_data (the hero only). Deliberately not the swipe
  -- library's `.slice(0, 1000)` shortcut: for images from the same encoder at the same
  -- dimensions those leading bytes are header and quantization tables, identical across
  -- genuinely different pictures.
  content_hash TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  is_pinned BOOLEAN DEFAULT false,
  saved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Explicitly NAMED so PostgreSQL cannot auto-truncate it. Migration 017 created an unnamed
  -- constraint whose generated name was truncated, so 017's own DROP IF EXISTS silently
  -- no-op'd and every save 500'd until 018 cleaned it up. Do not inherit that.
  CONSTRAINT showcase_assets_org_acct_hash_key
    UNIQUE (organization_id, ad_account_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_showcase_org ON showcase_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_showcase_org_acct
  ON showcase_assets(organization_id, ad_account_id);
CREATE INDEX IF NOT EXISTS idx_showcase_created ON showcase_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_showcase_client ON showcase_assets(client_name);
CREATE INDEX IF NOT EXISTS idx_showcase_tags ON showcase_assets USING GIN(tags);

-- RLS — structurally identical to inspiration_library_items (022) and swipe_library_items
-- (015). The API uses the service-role client and enforces tenancy manually with
-- .eq('organization_id', ...) on every query; these policies are the second line of defence.
ALTER TABLE showcase_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org showcase assets" ON showcase_assets;
CREATE POLICY "Users can view own org showcase assets" ON showcase_assets
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Members can manage showcase assets" ON showcase_assets;
CREATE POLICY "Members can manage showcase assets" ON showcase_assets
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "Service role full access" ON showcase_assets;
CREATE POLICY "Service role full access" ON showcase_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Force PostgREST schema cache refresh. Without this, queries fail with
-- "Could not find the table in the schema cache".
NOTIFY pgrst, 'reload schema';
