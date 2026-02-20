-- Add niche/topic context and negative keywords to seo_sites for keyword relevance filtering
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS niche TEXT;
ALTER TABLE seo_sites ADD COLUMN IF NOT EXISTS negative_keywords TEXT[];
