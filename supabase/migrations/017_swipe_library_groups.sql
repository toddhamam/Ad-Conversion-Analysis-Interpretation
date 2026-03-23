-- Swipe Library Groups: Add group_id and campaign_type columns
-- Groups ad elements (headline, body_copy, image) from the same Meta ad together

-- Add columns
ALTER TABLE swipe_library_items ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE swipe_library_items ADD COLUMN IF NOT EXISTS campaign_type TEXT;
CREATE INDEX IF NOT EXISTS idx_swipe_library_group_id ON swipe_library_items(group_id);
CREATE INDEX IF NOT EXISTS idx_swipe_library_campaign_type ON swipe_library_items(campaign_type);

-- Backfill group_id from meta_ad_id (elements from same ad share a group)
UPDATE swipe_library_items SET group_id = meta_ad_id WHERE meta_ad_id IS NOT NULL AND group_id IS NULL;
UPDATE swipe_library_items SET group_id = gen_random_uuid()::text WHERE group_id IS NULL;
ALTER TABLE swipe_library_items ALTER COLUMN group_id SET NOT NULL;

-- Backfill campaign_type from meta_campaign_name using same detection logic as frontend
UPDATE swipe_library_items SET campaign_type = CASE
  WHEN LOWER(meta_campaign_name) LIKE '%prospecting%' OR LOWER(meta_campaign_name) LIKE '%prospect%' OR LOWER(meta_campaign_name) LIKE '%cold%' OR LOWER(meta_campaign_name) LIKE '%acquisition%' THEN 'Prospecting'
  WHEN LOWER(meta_campaign_name) LIKE '%retargeting%' OR LOWER(meta_campaign_name) LIKE '%retarget%' OR LOWER(meta_campaign_name) LIKE '%remarketing%' OR LOWER(meta_campaign_name) LIKE '%warm%' THEN 'Retargeting'
  WHEN LOWER(meta_campaign_name) LIKE '%retention%' OR LOWER(meta_campaign_name) LIKE '%existing%' OR LOWER(meta_campaign_name) LIKE '%customer%' OR LOWER(meta_campaign_name) LIKE '%loyalty%' THEN 'Retention'
  ELSE 'Other'
END
WHERE meta_campaign_name IS NOT NULL AND campaign_type IS NULL;

-- Update unique constraint to include group_id
-- Allows the same content to exist in different ad groups (e.g. two ads sharing a headline)
ALTER TABLE swipe_library_items
  DROP CONSTRAINT IF EXISTS swipe_library_items_organization_id_ad_account_id_element_ty_key;
ALTER TABLE swipe_library_items
  ADD CONSTRAINT swipe_library_items_org_account_type_hash_group_key
  UNIQUE (organization_id, ad_account_id, element_type, content_hash, group_id);

NOTIFY pgrst, 'reload schema';
