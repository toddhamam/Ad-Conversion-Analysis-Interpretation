---
title: Ad Publishing
type: concept
sources: [raw/claude-md.md]
related: [[meta-api-proxy]], [[developer-policy-guard]], [[ad-publisher-standards]], [[creative-generation-flow]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Ad Publishing

Critical parameters for Meta ad creation discovered through extensive trial-and-error (PRs #87-95). Missing any one causes opaque Meta API errors [source: raw/claude-md.md].

## Campaign Level

- `bid_strategy: 'LOWEST_COST_WITHOUT_CAP'` — **required**, maps to "Highest Volume"
- `special_ad_categories: []` — **required** even when empty
- `status: 'PAUSED'` — always create in draft mode
- Budget in cents (multiply by 100)
- Default objective: Sales (`OUTCOME_SALES`) with `promoted_object` for pixel tracking

## Ad Set Level

- `destination_type: 'WEBSITE'` — **required** in v24.0 for OUTCOME_SALES/TRAFFIC
- `billing_event: 'IMPRESSIONS'`
- **Must use form-encoded body** (`URLSearchParams`), NOT JSON
- Nested objects (`targeting`, `promoted_object`) must be `JSON.stringify()`'d
- **Campaign propagation delay**: Wait 3 seconds + verification read before creating ad set

## Ad Level

- **Inline creative spec** — pass full `object_story_spec` in the `creative` param. Do NOT create creative separately
- `tracking_specs` required for OUTCOME_SALES: `[{"action.type": ["offsite_conversion"], "fb_pixel": ["<pixel_id>"]}]`
- `link_data` must include `description` field (not just `name`/headline)
- UTM tracking via `url_tags` field — never bake into `link_data.link`

## Encoding Rules

| Endpoint | Content Type |
|----------|-------------|
| Campaigns | JSON body |
| Ad Sets | Form-encoded (`URLSearchParams`) |
| Ads | Form-encoded (`URLSearchParams`) |
| Image uploads | `FormData` |

## Image Upload Flow

1. Convert image URL to base64 → 2. Upload via `adimages` endpoint with `FormData` → 3. Get `image_hash` → 4. Use in `object_story_spec` → `link_data`

## Related

- [[meta-api-proxy]] — How publish calls reach Meta
- [[developer-policy-guard]] — Rate limits during publishing
- [[ad-publisher-standards]] — UI flow and safety rules
