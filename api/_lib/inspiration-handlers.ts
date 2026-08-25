/**
 * Inspiration Library handlers — externally-sourced creative used as style references.
 *
 * Dispatched from api/meta.ts. This file lives in api/_lib/ and does NOT count toward
 * Vercel's 12-serverless-function limit (the project sits at 11/12).
 *
 * Every handler authenticates, then scopes every query with BOTH organization_id (from the
 * JWT, never the client) and ad_account_id. Client-supplied organization ids are never
 * trusted — see the tenant isolation rules in CLAUDE.md.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { captureError, flushSentry } from './sentry.js';
import { authenticateRequest } from './auth.js';
import { failRoute as fail } from './route-errors.js';
import {
  isUrlImportEnabled,
  validateExternalUrl,
  isAllowedImageType,
  magicBytesMatch,
  readCapped,
  MAX_IMAGE_BYTES,
  FETCH_TIMEOUT_MS,
  MAX_REDIRECTS,
} from './url-guard.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TABLE = 'inspiration_library_items';

/**
 * Per-ad-account ceiling. Ingest is free, so this is what bounds the cost: 50 items at
 * ~200KB of normalized base64 each is ~10MB of TEXT per account. Enforced server-side —
 * a client-side cap is a suggestion, not a limit.
 */
export const MAX_INSPIRATION_ITEMS = 50;

/** Max items per save request. Keeps the JSON body inside Vercel's ~4.5MB limit. */
const MAX_ITEMS_PER_SAVE = 10;

const LIST_LIMIT = 500;

/** Columns returned by list queries — everything except the full base64 payload. */
const LIST_COLUMNS = [
  'id', 'organization_id', 'ad_account_id', 'ingest_lane',
  'image_thumbnail', 'image_mime_type', 'image_width', 'image_height', 'quality_score',
  'advertiser_name', 'advertiser_page_id', 'source_url', 'source_snapshot_url',
  'first_seen_at', 'last_seen_at', 'days_running', 'is_still_running', 'captured_at',
  'ad_copy_snippet', 'style_descriptor', 'style_descriptor_model', 'style_descriptor_at',
  'content_hash', 'tags', 'notes', 'is_pinned', 'saved_by', 'created_at', 'updated_at',
].join(', ');

const VALID_LANES = new Set(['ad_library', 'screenshot', 'deck_upload', 'url_import']);


// ─── inspiration-list ────────────────────────────────────────────────────────

export async function handleInspirationList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const adAccountId = req.query.ad_account_id as string;
  if (!adAccountId) return res.status(400).json({ error: 'ad_account_id required' });

  const lane = req.query.lane as string | undefined;
  const search = req.query.search as string | undefined;
  const sort = (req.query.sort as string) || 'newest';
  const limit = Math.min(parseInt(req.query.limit as string) || LIST_LIMIT, LIST_LIMIT);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    let query = supabase
      .from(TABLE)
      .select(LIST_COLUMNS, { count: 'exact' })
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId);

    if (lane && VALID_LANES.has(lane)) query = query.eq('ingest_lane', lane);

    if (search) {
      // Wrap ilike values in double quotes so PostgREST reads commas/parens as literal text
      // rather than as its own filter syntax (same escaping as handleSwipeList).
      const escaped = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query = query.or(
        `advertiser_name.ilike."%${escaped}%",ad_copy_snippet.ilike."%${escaped}%",notes.ilike."%${escaped}%"`
      );
    }

    switch (sort) {
      case 'oldest':
        query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: true });
        break;
      case 'longevity':
        // The only ranking signal external material has. nullsFirst:false keeps captures with
        // no duration data at the bottom rather than at the top of a "longest running" list.
        query = query.order('is_pinned', { ascending: false })
          .order('days_running', { ascending: false, nullsFirst: false });
        break;
      case 'newest':
      default:
        query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
        break;
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return res.status(200).json({
      items: data || [],
      total: count || 0,
      limit: MAX_INSPIRATION_ITEMS,
    });
  } catch (err: unknown) {
    return fail(res, err, 'inspiration-list', auth.organizationId);
  }
}

// ─── inspiration-save ────────────────────────────────────────────────────────

interface SaveItem {
  ingest_lane?: string;
  image_data?: string;
  image_thumbnail?: string;
  image_mime_type?: string;
  image_width?: number;
  image_height?: number;
  quality_score?: number;
  advertiser_name?: string;
  advertiser_page_id?: string;
  source_url?: string;
  source_snapshot_url?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  days_running?: number;
  is_still_running?: boolean;
  ad_copy_snippet?: string;
  content_hash?: string;
  tags?: string[];
  notes?: string;
}

export async function handleInspirationSave(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ad_account_id: adAccountId, items } = req.body || {};
  if (!adAccountId) return res.status(400).json({ error: 'ad_account_id required' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }
  if (items.length > MAX_ITEMS_PER_SAVE) {
    return res.status(400).json({ error: `Maximum ${MAX_ITEMS_PER_SAVE} items per request` });
  }

  const invalid = (items as SaveItem[]).find(
    i => !i.image_data || !i.content_hash || !i.ingest_lane || !VALID_LANES.has(i.ingest_lane)
  );
  if (invalid) {
    return res.status(400).json({ error: 'Each item needs image_data, content_hash and a valid ingest_lane' });
  }

  try {
    // Count first. Without this the library grows unbounded, and since ingest is free there
    // is nothing else bounding it. Counting before the upsert means duplicates can still be
    // re-submitted at the cap (they don't add rows) — checked again after the write.
    const { count, error: countError } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId);
    if (countError) throw countError;

    const existing = count || 0;
    if (existing >= MAX_INSPIRATION_ITEMS) {
      return res.status(409).json({
        error: 'Inspiration library is full',
        code: 'LIBRARY_FULL',
        limit: MAX_INSPIRATION_ITEMS,
        current: existing,
      });
    }

    // Trim rather than reject: saving 8 of 10 pasted screenshots is more useful than
    // refusing all ten because two would not fit.
    const room = MAX_INSPIRATION_ITEMS - existing;
    const accepted = (items as SaveItem[]).slice(0, room);
    const skippedForSpace = items.length - accepted.length;

    const rows = accepted.map(item => ({
      organization_id: auth.organizationId,
      ad_account_id: adAccountId,
      ingest_lane: item.ingest_lane,
      image_data: item.image_data,
      image_thumbnail: item.image_thumbnail ?? null,
      image_mime_type: item.image_mime_type || 'image/jpeg',
      image_width: item.image_width ?? null,
      image_height: item.image_height ?? null,
      quality_score: item.quality_score ?? null,
      advertiser_name: item.advertiser_name ?? null,
      advertiser_page_id: item.advertiser_page_id ?? null,
      source_url: item.source_url ?? null,
      source_snapshot_url: item.source_snapshot_url ?? null,
      first_seen_at: item.first_seen_at ?? null,
      last_seen_at: item.last_seen_at ?? null,
      days_running: item.days_running ?? null,
      is_still_running: item.is_still_running ?? null,
      ad_copy_snippet: item.ad_copy_snippet ?? null,
      content_hash: item.content_hash,
      tags: item.tags ?? [],
      notes: item.notes ?? null,
      saved_by: auth.userId,
    }));

    // ignoreDuplicates so re-saving never clobbers user-curated tags/notes/pins.
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(rows, {
        onConflict: 'organization_id,ad_account_id,content_hash',
        ignoreDuplicates: true,
      })
      .select(LIST_COLUMNS);

    if (error) throw error;

    const saved = data?.length || 0;
    return res.status(200).json({
      saved,
      duplicates: accepted.length - saved,
      skippedForSpace,
      items: data || [],
    });
  } catch (err: unknown) {
    return fail(res, err, 'inspiration-save', auth.organizationId);
  }
}

// ─── inspiration-update ──────────────────────────────────────────────────────

export async function handleInspirationUpdate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, tags, notes, is_pinned, style_descriptor, style_descriptor_model } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  // Whitelist. Provenance fields are immutable by design — an operator editing
  // days_running or advertiser_name would be editing the evidence.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tags !== undefined) updates.tags = tags;
  if (notes !== undefined) updates.notes = notes;
  if (is_pinned !== undefined) updates.is_pinned = is_pinned;
  if (style_descriptor !== undefined) {
    updates.style_descriptor = style_descriptor;
    updates.style_descriptor_model = style_descriptor_model ?? null;
    updates.style_descriptor_at = new Date().toISOString();
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select(LIST_COLUMNS)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Item not found' });

    return res.status(200).json(data);
  } catch (err: unknown) {
    return fail(res, err, 'inspiration-update', auth.organizationId);
  }
}

// ─── inspiration-delete ──────────────────────────────────────────────────────

export async function handleInspirationDelete(req: VercelRequest, res: VercelResponse) {
  // POST rather than DELETE: DELETE-with-a-body is inconsistently handled across proxies,
  // and this route also serves the account-level purge.
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ids, purge_ad_account_id: purgeAccount } = req.body || {};

  try {
    let query = supabase.from(TABLE).delete().eq('organization_id', auth.organizationId);

    if (purgeAccount) {
      // Account-level purge. Hard delete, no soft-delete tombstone — a takedown request
      // needs the material actually gone, not flagged.
      query = query.eq('ad_account_id', purgeAccount);
    } else if (Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids);
    } else {
      return res.status(400).json({ error: 'ids array or purge_ad_account_id required' });
    }

    // Report rows actually removed, not the number requested — ids belonging to another org
    // are filtered out by the organization_id scope and must not be counted as deleted.
    const { data, error } = await query.select('id');
    if (error) throw error;

    return res.status(200).json({ deleted: data?.length || 0 });
  } catch (err: unknown) {
    return fail(res, err, 'inspiration-delete', auth.organizationId);
  }
}

// ─── inspiration-image ───────────────────────────────────────────────────────

export async function handleInspirationImage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, image_data, image_mime_type')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Item not found' });

    return res.status(200).json(data);
  } catch (err: unknown) {
    return fail(res, err, 'inspiration-image', auth.organizationId);
  }
}

// ─── inspiration-check ───────────────────────────────────────────────────────

export async function handleInspirationCheck(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ad_account_id: adAccountId, content_hashes: hashes } = req.body || {};
  if (!adAccountId) return res.status(400).json({ error: 'ad_account_id required' });
  if (!Array.isArray(hashes) || hashes.length === 0) {
    return res.status(400).json({ error: 'content_hashes array is required' });
  }
  if (hashes.length > 200) {
    return res.status(400).json({ error: 'Maximum 200 hashes per request' });
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('content_hash')
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId)
      .in('content_hash', hashes);

    if (error) throw error;

    return res.status(200).json({ saved: (data || []).map(r => r.content_hash) });
  } catch (err: unknown) {
    return fail(res, err, 'inspiration-check', auth.organizationId);
  }
}

// ─── inspiration-import-url (lane d) ─────────────────────────────────────────

/**
 * Fetch an image from a user-supplied URL.
 *
 * BEHIND A FLAG (`ENABLE_URL_IMPORT`) and off by default. This is the only endpoint in the app
 * that fetches a host the user chose; every other outbound fetch is pinned to a Meta domain.
 * The screenshot lane covers the same need with none of the risk, so the flag exists to make
 * turning this on a deliberate act.
 *
 * Errors are deliberately generic. Echoing an upstream status, header or body would turn this
 * into a blind-SSRF oracle — the caller could map an internal network by reading the
 * differences between failure messages.
 */
export async function handleInspirationImportUrl(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  if (!isUrlImportEnabled()) {
    return res.status(403).json({
      error: 'URL import is disabled',
      message: 'Paste a direct image, or screenshot the ad instead.',
    });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });

  try {
    let currentUrl = url;

    // Re-validate on EVERY hop. Validating only the first URL and then following redirects is
    // the single most common way this class of endpoint gets bypassed.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const guard = await validateExternalUrl(currentUrl);
      if (!guard.ok) return res.status(400).json({ error: guard.reason || 'That URL is not allowed' });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'image/*' },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return res.status(400).json({ error: 'That URL could not be fetched' });
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) return res.status(400).json({ error: 'That URL could not be fetched' });

      const contentType = response.headers.get('content-type');
      if (!isAllowedImageType(contentType)) {
        return res.status(400).json({
          error: 'That URL is not a direct image link',
          message: 'Paste a direct image URL, or screenshot the ad instead.',
        });
      }

      const bytes = await readCapped(response);
      if (!bytes) {
        return res.status(400).json({ error: `Image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit` });
      }
      if (!magicBytesMatch(bytes, contentType!)) {
        return res.status(400).json({ error: 'That file is not a valid image' });
      }

      return res.status(200).json({
        base64Data: Buffer.from(bytes).toString('base64'),
        mimeType: contentType!.split(';')[0].trim(),
      });
    }

    return res.status(400).json({ error: 'Too many redirects' });
  } catch (err: unknown) {
    // Sentry gets the detail; the caller does not.
    captureError(err, { route: 'meta/inspiration-import-url', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(400).json({ error: 'That URL could not be fetched' });
  }
}
