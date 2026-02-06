-- SEO IQ Tables
-- Connected sites, keyword opportunities, and generated articles
-- for the automated SEO article pipeline.

-- =============================================================================
-- SEO SITES TABLE (Connected sites with encrypted credentials)
-- =============================================================================
CREATE TABLE IF NOT EXISTS seo_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,

  -- Google OAuth (per-site, since one org can have multiple sites)
  google_access_token_encrypted TEXT,
  google_refresh_token_encrypted TEXT,
  google_token_expires_at TIMESTAMPTZ,
  google_scopes TEXT[],
  google_status TEXT DEFAULT 'not_connected' CHECK (google_status IN ('not_connected', 'active', 'expired', 'revoked', 'error')),

  -- Target site's Supabase credentials (encrypted)
  target_supabase_url_encrypted TEXT,
  target_supabase_key_encrypted TEXT,
  target_table_name TEXT DEFAULT 'articles',

  -- Google Search Console config
  gsc_property TEXT, -- e.g. "sc-domain:example.com"

  -- Content config
  slug_prefix TEXT DEFAULT '', -- e.g. "/articles/" or "/blog/"
  voice_guide TEXT, -- Custom voice/style instructions for article generation

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_seo_sites_organization ON seo_sites(organization_id);

-- =============================================================================
-- SEO KEYWORDS TABLE (Keyword opportunities per site)
-- =============================================================================
CREATE TABLE IF NOT EXISTS seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES seo_sites(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,

  -- Search volume data
  search_volume INTEGER DEFAULT 0,
  competition TEXT DEFAULT 'UNKNOWN' CHECK (competition IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  competition_index INTEGER DEFAULT 0,

  -- GSC performance data
  current_position REAL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,

  -- Opportunity scoring
  opportunity_type TEXT CHECK (opportunity_type IN ('quick_win', 'content_gap', 'ctr_optimization', 'cluster_gap', 'long_tail')),
  opportunity_score INTEGER DEFAULT 0 CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
  reasoning TEXT,
  action TEXT,
  suggested_title TEXT,

  -- Topic clustering
  topic_cluster TEXT DEFAULT 'General',

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'dismissed')),
  existing_url TEXT, -- If we're already ranking for this keyword

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(site_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_site ON seo_keywords(site_id);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_score ON seo_keywords(site_id, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_type ON seo_keywords(site_id, opportunity_type);

-- =============================================================================
-- SEO ARTICLES TABLE (Generated and published articles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS seo_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES seo_sites(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES seo_keywords(id) ON DELETE SET NULL,

  -- Content
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  meta_description TEXT,
  content TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  primary_keyword TEXT,
  secondary_keywords TEXT[],
  category TEXT DEFAULT 'General',
  read_time_minutes INTEGER DEFAULT 5,

  -- Thumbnail
  thumbnail_url TEXT,
  thumbnail_prompt TEXT,

  -- Publishing
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'publishing', 'published', 'failed')),
  published_url TEXT,
  published_at TIMESTAMPTZ,
  publish_error TEXT,

  -- Indexing
  indexing_status TEXT DEFAULT 'not_submitted' CHECK (indexing_status IN ('not_submitted', 'submitted', 'indexed', 'failed')),
  indexing_submitted_at TIMESTAMPTZ,

  -- Generation metadata
  generation_model TEXT,
  generation_params JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(site_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_seo_articles_site ON seo_articles(site_id);
CREATE INDEX IF NOT EXISTS idx_seo_articles_status ON seo_articles(site_id, status);
CREATE INDEX IF NOT EXISTS idx_seo_articles_keyword ON seo_articles(keyword_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE seo_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_articles ENABLE ROW LEVEL SECURITY;

-- SEO Sites: users can view sites in their org
CREATE POLICY "Users can view org seo_sites" ON seo_sites
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

-- SEO Sites: admins/owners can manage
CREATE POLICY "Admins can manage seo_sites" ON seo_sites
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- SEO Keywords: users can view keywords for their org's sites
CREATE POLICY "Users can view org seo_keywords" ON seo_keywords
  FOR SELECT USING (
    site_id IN (
      SELECT s.id FROM seo_sites s
      JOIN users u ON u.organization_id = s.organization_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- SEO Keywords: admins/owners can manage
CREATE POLICY "Admins can manage seo_keywords" ON seo_keywords
  FOR ALL USING (
    site_id IN (
      SELECT s.id FROM seo_sites s
      JOIN users u ON u.organization_id = s.organization_id
      WHERE u.auth_id = auth.uid() AND u.role IN ('owner', 'admin')
    )
  );

-- SEO Articles: users can view articles for their org's sites
CREATE POLICY "Users can view org seo_articles" ON seo_articles
  FOR SELECT USING (
    site_id IN (
      SELECT s.id FROM seo_sites s
      JOIN users u ON u.organization_id = s.organization_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- SEO Articles: admins/owners can manage
CREATE POLICY "Admins can manage seo_articles" ON seo_articles
  FOR ALL USING (
    site_id IN (
      SELECT s.id FROM seo_sites s
      JOIN users u ON u.organization_id = s.organization_id
      WHERE u.auth_id = auth.uid() AND u.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_seo_sites_updated_at
  BEFORE UPDATE ON seo_sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_keywords_updated_at
  BEFORE UPDATE ON seo_keywords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_articles_updated_at
  BEFORE UPDATE ON seo_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
