-- Blog posts table for GEO/SEO content hub
-- Not org-scoped — this is Convertra's own public content, managed by super admins only.

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  title TEXT NOT NULL,
  meta_description TEXT,
  content TEXT NOT NULL,
  excerpt TEXT,
  category TEXT NOT NULL CHECK (category IN ('faq','comparison','guide','listicle','case-study')),
  tags TEXT[] DEFAULT '{}',
  author TEXT DEFAULT 'Convertra Team',
  featured_image TEXT,
  read_time_minutes INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  faq_pairs JSONB DEFAULT '[]',
  schema_type TEXT DEFAULT 'Article' CHECK (schema_type IN ('Article','FAQPage','HowTo'))
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_blog_posts_updated_at();

CREATE INDEX idx_blog_posts_status_published ON blog_posts(status, published_at DESC);
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_category ON blog_posts(category);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can only read published posts with a published_at in the past
CREATE POLICY "Public read published" ON blog_posts
  FOR SELECT USING (status = 'published' AND published_at <= now());

-- No "service role full access" policy needed — service role clients bypass RLS entirely.

NOTIFY pgrst, 'reload schema';
