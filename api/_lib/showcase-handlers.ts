/**
 * Showcase Assets handlers — the agency's own client-work screenshots, used as ad creative.
 *
 * Dispatched from api/meta.ts. This file lives in api/_lib/ and does NOT count toward
 * Vercel's 12-serverless-function limit (the project sits at 11/12).
 *
 * Every handler authenticates, then scopes every query with BOTH organization_id (from the
 * JWT, never the client) and ad_account_id. Client-supplied organization ids are never
 * trusted — see the tenant isolation rules in CLAUDE.md.
 *
 * Structural sibling of inspiration-handlers.ts. Two deliberate differences:
 *   1. A row carries TWO image payloads (hero + optional before), so caps count IMAGES, not
 *      rows — see planShowcaseSave.
 *   2. `showcase-image` returns ONE payload per request. Shipping both in a single JSON
 *      response is the response-size mirror of the request-size problem the caps exist for.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from './auth.js';
import { failRoute as fail } from './route-errors.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TABLE = 'showcase_assets';

/**
 * Per-ad-account ceiling. Lower than the Inspiration Library's 50 because a showcase row can
 * carry two payloads at showcase resolution (~400-900KB of base64 each) rather than one at
 * reference resolution (~200KB). Enforced server-side — a client-side cap is a suggestion.
 */
export const MAX_SHOWCASE_ASSETS = 40;

/**
 * Max IMAGES per save request, not rows. A before/after row is two images, so a naive
 * ten-row cap would put 4-18MB against Vercel's ~4.5MB body limit.
 */
export const MAX_IMAGES_PER_SAVE = 4;

const LIST_LIMIT = 500;

/**
 * Columns returned by list queries — everything except the two full base64 payloads.
 *
 * `before_image_thumbnail` is deliberately included: its presence IS the has-a-before flag,
 * so the UI needs no computed column and no extra round trip to know which assets can fill a
 * before/after template.
 */
const LIST_COLUMNS = [
  'id', 'organization_id', 'ad_account_id',
  'client_name', 'project_url', 'client_consent',
  'image_thumbnail', 'image_mime_type', 'image_width', 'image_height',
  'before_image_thumbnail', 'before_image_mime_type', 'before_image_width', 'before_image_height',
  'device_hint', 'captured_at', 'content_hash', 'tags', 'notes', 'is_pinned', 'saved_by',
  'created_at', 'updated_at',
].join(', ');

const VALID_DEVICE_HINTS = new Set(['desktop', 'mobile', 'tablet']);


// ─── save planning (pure, unit-tested) ───────────────────────────────────────

export interface ShowcaseSaveItem {
  client_name?: string;
  project_url?: string;
  client_consent?: boolean;
  image_data?: string;
  image_thumbnail?: string;
  image_mime_type?: string;
  image_width?: number;
  image_height?: number;
  before_image_data?: string;
  before_image_thumbnail?: string;
  before_image_mime_type?: string;
  before_image_width?: number;
  before_image_height?: number;
  device_hint?: string;
  content_hash?: string;
  tags?: string[];
  notes?: string;
}

/**
 * How much of a save actually fits, counting IMAGES rather than rows.
 *
 * Pure and exported so the arithmetic can be asserted without a database — the interesting
 * case is that three before/after rows are six images, which overflows a four-image budget
 * at the second row even though three rows would fit the row cap comfortably.
 *
 * Trims rather than rejecting, following the Inspiration Library's rule: saving two of three
 * uploads is more useful than refusing all three because one would not fit. The first item is
 * always accepted when there is row space, so a single pair can never be deadlocked by a
 * budget smaller than itself.
 */
export function planShowcaseSave(
  existingRows: number,
  items: Pick<ShowcaseSaveItem, 'before_image_data'>[],
  maxRows: number = MAX_SHOWCASE_ASSETS,
  maxImages: number = MAX_IMAGES_PER_SAVE,
): { acceptedCount: number; skippedForSpace: number; skippedForRequestSize: number } {
  const room = Math.max(0, maxRows - existingRows);
  if (room === 0) {
    return { acceptedCount: 0, skippedForSpace: items.length, skippedForRequestSize: 0 };
  }

  let accepted = 0;
  let imagesUsed = 0;
  let stoppedForSize = false;

  for (const item of items) {
    if (accepted >= room) break;
    const cost = item.before_image_data ? 2 : 1;
    // `accepted === 0` guarantees forward progress even if one row exceeds the whole budget.
    if (accepted > 0 && imagesUsed + cost > maxImages) {
      stoppedForSize = true;
      break;
    }
    imagesUsed += cost;
    accepted += 1;
  }

  const remaining = items.length - accepted;
  return {
    acceptedCount: accepted,
    // Whichever limit actually stopped the walk owns the remainder, so the client can say
    // "your library is full" rather than "send fewer at once" when those differ.
    skippedForSpace: stoppedForSize ? 0 : remaining,
    skippedForRequestSize: stoppedForSize ? remaining : 0,
  };
}

// ─── showcase-list ───────────────────────────────────────────────────────────

export async function handleShowcaseList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const adAccountId = req.query.ad_account_id as string;
  if (!adAccountId) return res.status(400).json({ error: 'ad_account_id required' });

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

    if (search) {
      // Wrap ilike values in double quotes so PostgREST reads commas/parens as literal text
      // rather than as its own filter syntax (same escaping as handleInspirationList).
      const escaped = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query = query.or(
        `client_name.ilike."%${escaped}%",project_url.ilike."%${escaped}%",notes.ilike."%${escaped}%"`
      );
    }

    // No longevity sort (there is no longevity signal here) and no performance sort (there
    // are deliberately no metrics columns — see migration 023).
    switch (sort) {
      case 'oldest':
        query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: true });
        break;
      case 'client':
        query = query.order('is_pinned', { ascending: false }).order('client_name', { ascending: true });
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
      limit: MAX_SHOWCASE_ASSETS,
    });
  } catch (err: unknown) {
    return fail(res, err, 'showcase-list', auth.organizationId);
  }
}

// ─── showcase-save ───────────────────────────────────────────────────────────

export async function handleShowcaseSave(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ad_account_id: adAccountId, items } = req.body || {};
  if (!adAccountId) return res.status(400).json({ error: 'ad_account_id required' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  const typed = items as ShowcaseSaveItem[];
  const invalid = typed.find(
    i => !i.image_data || !i.content_hash || !i.client_name?.trim()
      || (i.device_hint && !VALID_DEVICE_HINTS.has(i.device_hint))
  );
  if (invalid) {
    return res.status(400).json({
      error: 'Each item needs image_data, content_hash, client_name and a valid device_hint',
    });
  }

  try {
    const { count, error: countError } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.organizationId)
      .eq('ad_account_id', adAccountId);
    if (countError) throw countError;

    const existing = count || 0;
    if (existing >= MAX_SHOWCASE_ASSETS) {
      return res.status(409).json({
        error: 'Showcase library is full',
        code: 'LIBRARY_FULL',
        limit: MAX_SHOWCASE_ASSETS,
        current: existing,
      });
    }

    const plan = planShowcaseSave(existing, typed);
    const accepted = typed.slice(0, plan.acceptedCount);

    const rows = accepted.map(item => ({
      organization_id: auth.organizationId,
      ad_account_id: adAccountId,
      client_name: item.client_name!.trim(),
      project_url: item.project_url ?? null,
      client_consent: item.client_consent ?? false,
      image_data: item.image_data,
      image_thumbnail: item.image_thumbnail ?? null,
      image_mime_type: item.image_mime_type || 'image/png',
      image_width: item.image_width ?? null,
      image_height: item.image_height ?? null,
      before_image_data: item.before_image_data ?? null,
      before_image_thumbnail: item.before_image_thumbnail ?? null,
      before_image_mime_type: item.before_image_mime_type ?? null,
      before_image_width: item.before_image_width ?? null,
      before_image_height: item.before_image_height ?? null,
      device_hint: item.device_hint || 'desktop',
      content_hash: item.content_hash,
      tags: item.tags ?? [],
      notes: item.notes ?? null,
      saved_by: auth.userId,
    }));

    // ignoreDuplicates so re-saving never clobbers user-curated client_name/notes/consent.
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
      skippedForSpace: plan.skippedForSpace,
      skippedForRequestSize: plan.skippedForRequestSize,
      items: data || [],
    });
  } catch (err: unknown) {
    return fail(res, err, 'showcase-save', auth.organizationId);
  }
}

// ─── showcase-update ─────────────────────────────────────────────────────────

export async function handleShowcaseUpdate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const { id } = body;
  if (!id) return res.status(400).json({ error: 'id required' });

  // Whitelist. `image_data` and `content_hash` are immutable — the hash identifies the row,
  // and replacing the hero silently would break dedup. Attaching or replacing the BEFORE is
  // allowed on purpose: "I found the old screenshot later" is the normal editing path, and it
  // cannot affect the row's identity.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.client_name !== undefined) {
    if (!String(body.client_name).trim()) {
      return res.status(400).json({ error: 'client_name cannot be empty' });
    }
    updates.client_name = String(body.client_name).trim();
  }
  if (body.project_url !== undefined) updates.project_url = body.project_url;
  if (body.client_consent !== undefined) updates.client_consent = body.client_consent;
  if (body.device_hint !== undefined) {
    if (!VALID_DEVICE_HINTS.has(body.device_hint)) {
      return res.status(400).json({ error: 'invalid device_hint' });
    }
    updates.device_hint = body.device_hint;
  }
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
  if (body.before_image_data !== undefined) {
    updates.before_image_data = body.before_image_data;
    updates.before_image_thumbnail = body.before_image_thumbnail ?? null;
    updates.before_image_mime_type = body.before_image_mime_type ?? null;
    updates.before_image_width = body.before_image_width ?? null;
    updates.before_image_height = body.before_image_height ?? null;
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
    if (!data) return res.status(404).json({ error: 'Asset not found' });

    return res.status(200).json(data);
  } catch (err: unknown) {
    return fail(res, err, 'showcase-update', auth.organizationId);
  }
}

// ─── showcase-delete ─────────────────────────────────────────────────────────

export async function handleShowcaseDelete(req: VercelRequest, res: VercelResponse) {
  // POST rather than DELETE: DELETE-with-a-body is inconsistently handled across proxies,
  // and this route also serves the account-level purge.
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { ids, purge_ad_account_id: purgeAccount } = req.body || {};

  try {
    let query = supabase.from(TABLE).delete().eq('organization_id', auth.organizationId);

    if (purgeAccount) {
      // Hard delete, no tombstone. A client withdrawing permission to show their site needs
      // the material actually gone, not flagged.
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
    return fail(res, err, 'showcase-delete', auth.organizationId);
  }
}

// ─── showcase-image ──────────────────────────────────────────────────────────

/**
 * Fetch ONE full payload — the hero or the before, never both.
 *
 * Two ~900KB base64 strings in a single JSON response is the response-size mirror of the
 * request-size problem MAX_IMAGES_PER_SAVE exists to prevent, and a before/after composite
 * needs them at different moments anyway.
 */
export async function handleShowcaseImage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'id required' });

  const which = (req.query.which as string) || 'hero';
  if (which !== 'hero' && which !== 'before') {
    return res.status(400).json({ error: "which must be 'hero' or 'before'" });
  }

  const columns = which === 'before'
    ? 'id, before_image_data, before_image_mime_type'
    : 'id, image_data, image_mime_type';

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(columns)
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .single<Record<string, string | null>>();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Asset not found' });

    const imageData = which === 'before' ? data.before_image_data : data.image_data;
    if (!imageData) {
      return res.status(404).json({ error: `Asset has no ${which} image` });
    }

    // Normalized shape regardless of `which`, so callers don't branch on the column name.
    return res.status(200).json({
      id: data.id,
      image_data: imageData,
      image_mime_type:
        (which === 'before' ? data.before_image_mime_type : data.image_mime_type) || 'image/png',
    });
  } catch (err: unknown) {
    return fail(res, err, 'showcase-image', auth.organizationId);
  }
}

