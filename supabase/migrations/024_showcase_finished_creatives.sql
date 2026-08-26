-- 024_showcase_finished_creatives.sql
-- A finished creative is a SHOWCASE ASSET, not a fourth library.
--
-- "Finished creative" is not a place images come from — it is a STATE they are in: these pixels
-- ARE the ad, so nothing should generate, composite or emulate them. The app already reached
-- that state three ways (a Swipe Library image used as-is, a showcase composite, and — wrongly —
-- a manual upload that became AI style direction), each through its own half-implementation.
--
-- WHY THIS TABLE. The repo separates library tables by EVIDENCE CLASS, not by feature:
-- swipe_library_items is own + measured, inspiration_library_items is external + unmeasured,
-- showcase_assets is own + unmeasured. An operator-uploaded finished ad is own + unmeasured —
-- the same class — so it belongs here. A fourth table would split one evidence class in two and
-- give the picker two places to look.

ALTER TABLE showcase_assets
  ADD COLUMN IF NOT EXISTS asset_kind TEXT NOT NULL DEFAULT 'source'
    CHECK (asset_kind IN ('source', 'finished'));

COMMENT ON COLUMN showcase_assets.asset_kind IS
  'source = raw screenshot the compositor frames. finished = an already-designed creative that publishes untouched.';

-- `client_name` was NOT NULL because every asset was client work. A finished creative for the
-- agency's OWN offer has no client, and forcing a value there would be fiction — the column
-- would fill with placeholders and stop meaning anything.
--
-- Existing rows are unaffected: they are all `source`, and all already carry a name.
ALTER TABLE showcase_assets ALTER COLUMN client_name DROP NOT NULL;

-- A source asset still needs its client named — that is what the results wall labels cells with,
-- and an unnamed one would render a blank band. Only finished creatives may omit it.
ALTER TABLE showcase_assets
  DROP CONSTRAINT IF EXISTS showcase_assets_source_needs_client;
ALTER TABLE showcase_assets
  ADD CONSTRAINT showcase_assets_source_needs_client
    CHECK (asset_kind <> 'source' OR (client_name IS NOT NULL AND length(btrim(client_name)) > 0));

-- A finished creative is whole by definition. A "before" half would have nothing to pair with:
-- the templates that consume a before all composite, and a finished creative is never composited.
ALTER TABLE showcase_assets
  DROP CONSTRAINT IF EXISTS showcase_assets_finished_has_no_before;
ALTER TABLE showcase_assets
  ADD CONSTRAINT showcase_assets_finished_has_no_before
    CHECK (asset_kind <> 'finished' OR before_image_data IS NULL);

CREATE INDEX IF NOT EXISTS idx_showcase_kind
  ON showcase_assets(organization_id, ad_account_id, asset_kind);

-- Force PostgREST schema cache refresh. Without this, queries fail with
-- "Could not find the table in the schema cache".
NOTIFY pgrst, 'reload schema';
