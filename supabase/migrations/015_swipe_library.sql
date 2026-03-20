-- 015_swipe_library.sql
-- Swipe Library: persistent storage for best-performing ad elements

CREATE TABLE swipe_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  element_type TEXT NOT NULL CHECK (element_type IN ('headline', 'body_copy', 'image')),
  text_content TEXT,                    -- headline/body text
  image_data TEXT,                      -- full base64 for images (excluded from list queries, loaded on demand)
  image_thumbnail TEXT,                 -- compressed ~20KB preview for grid views
  image_mime_type TEXT,
  meta_ad_id TEXT,                      -- source Meta ad ID
  meta_campaign_name TEXT,
  meta_adset_name TEXT,
  performance_snapshot JSONB DEFAULT '{}',  -- { cvr, cpa, ctr, roas, conversions, spend }
  content_hash TEXT NOT NULL,           -- SHA-256 of normalized content for dedup
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  is_pinned BOOLEAN DEFAULT false,
  saved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Tenant-safe dedup: includes organization_id so one org cannot block another
  UNIQUE (organization_id, ad_account_id, element_type, content_hash)
);

CREATE INDEX idx_swipe_org ON swipe_library_items(organization_id);
CREATE INDEX idx_swipe_account_type ON swipe_library_items(ad_account_id, element_type);
CREATE INDEX idx_swipe_created ON swipe_library_items(created_at DESC);

-- RLS
ALTER TABLE swipe_library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org swipe items" ON swipe_library_items
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Members can manage swipe items" ON swipe_library_items
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Service role full access" ON swipe_library_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';
