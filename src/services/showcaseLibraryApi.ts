// Showcase Library API — the agency's own client-work screenshots, used as ad creative.
//
// Structural mirror of inspirationLibraryApi.ts (same auth-header helper, one typed function
// per route). A THIRD library on purpose: swipe items are the account's own ads WITH measured
// delivery data, inspiration items are external material with none, and client work is the
// account's own material with none. See the header of migration 023.
//
// The one structural difference: a showcase row carries TWO image payloads (hero + optional
// before), so every size budget here counts IMAGES rather than rows.

import { supabase } from '../lib/supabase';
import { normalizeForUpload, type NormalizedImage } from '../lib/imageNormalize';
import { computeImageHash } from '../lib/imageHash';

const API_BASE = '/api/meta';

/** Mirrors MAX_SHOWCASE_ASSETS in api/_lib/showcase-handlers.ts (enforced server-side). */
export const MAX_SHOWCASE_ASSETS = 40;

/** Mirrors MAX_IMAGES_PER_SAVE. Larger batches are chunked by saveShowcaseAssets. */
const MAX_IMAGES_PER_SAVE = 4;

export type DeviceHint = 'desktop' | 'mobile' | 'tablet';
export type ShowcaseSort = 'newest' | 'oldest' | 'client';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A library row as returned by list queries — no full base64.
 *
 * `before_image_thumbnail` doubles as the has-a-before flag: a non-null value means this asset
 * can fill a before/after template, so the picker needs no extra round trip to find out.
 */
export interface ShowcaseAsset {
  id: string;
  organization_id: string;
  ad_account_id: string;
  client_name: string;
  project_url: string | null;
  client_consent: boolean;
  image_thumbnail: string | null;
  image_mime_type: string;
  image_width: number | null;
  image_height: number | null;
  before_image_thumbnail: string | null;
  before_image_mime_type: string | null;
  before_image_width: number | null;
  before_image_height: number | null;
  device_hint: DeviceHint;
  captured_at: string;
  content_hash: string;
  tags: string[];
  notes: string | null;
  is_pinned: boolean;
  saved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowcaseSavePayload {
  client_name: string;
  project_url?: string;
  client_consent?: boolean;
  image_data: string;
  image_thumbnail?: string;
  image_mime_type?: string;
  image_width?: number;
  image_height?: number;
  before_image_data?: string;
  before_image_thumbnail?: string;
  before_image_mime_type?: string;
  before_image_width?: number;
  before_image_height?: number;
  device_hint?: DeviceHint;
  content_hash: string;
  tags?: string[];
  notes?: string;
}

export interface ShowcaseSaveResult {
  saved: number;
  duplicates: number;
  skippedForSpace: number;
  skippedForRequestSize: number;
  items: ShowcaseAsset[];
}

export interface ShowcaseListFilters {
  search?: string;
  sort?: ShowcaseSort;
  limit?: number;
  offset?: number;
}

export class ShowcaseLibraryFullError extends Error {
  limit: number;
  current: number;
  constructor(limit: number, current: number) {
    super(`Showcase library is full (${current}/${limit}). Delete some assets to add more.`);
    this.name = 'ShowcaseLibraryFullError';
    this.limit = limit;
    this.current = current;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    if (body?.code === 'LIBRARY_FULL') {
      throw new ShowcaseLibraryFullError(body.limit ?? MAX_SHOWCASE_ASSETS, body.current ?? 0);
    }
    throw new Error(body.error || body.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

/** How many image payloads a row will put on the wire. */
export function imageCostOf(item: Pick<ShowcaseSavePayload, 'before_image_data'>): number {
  return item.before_image_data ? 2 : 1;
}

/**
 * Split a batch into requests that each stay inside the server's IMAGE budget.
 *
 * Chunking by row count — what the Inspiration Library does — would put up to twice the
 * payload on the wire here, because a before/after row is two images. A row whose own cost
 * exceeds the budget still gets a chunk of its own rather than being dropped or looping
 * forever; the server applies the same forward-progress rule.
 *
 * Pure and exported for testing.
 */
export function chunkByImageCount<T extends Pick<ShowcaseSavePayload, 'before_image_data'>>(
  items: T[],
  maxImages: number = MAX_IMAGES_PER_SAVE,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let used = 0;

  for (const item of items) {
    const cost = imageCostOf(item);
    if (current.length > 0 && used + cost > maxImages) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += cost;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

// ─── API functions ──────────────────────────────────────────────────────────

export async function fetchShowcaseAssets(
  adAccountId: string,
  filters?: ShowcaseListFilters
): Promise<{ items: ShowcaseAsset[]; total: number; limit: number }> {
  const params = new URLSearchParams({ ad_account_id: adAccountId });
  if (filters?.search) params.set('search', filters.search);
  if (filters?.sort) params.set('sort', filters.sort);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  return fetchJson(`${API_BASE}/showcase-list?${params.toString()}`);
}

/**
 * Save assets, chunked to the server's per-request IMAGE cap. Chunks go sequentially so the
 * server's row-count check sees each previous chunk.
 */
export async function saveShowcaseAssets(
  adAccountId: string,
  items: ShowcaseSavePayload[]
): Promise<ShowcaseSaveResult> {
  const totals: ShowcaseSaveResult = {
    saved: 0, duplicates: 0, skippedForSpace: 0, skippedForRequestSize: 0, items: [],
  };

  const chunks = chunkByImageCount(items);
  let sent = 0;

  for (const chunk of chunks) {
    const result = await fetchJson<ShowcaseSaveResult>(`${API_BASE}/showcase-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: adAccountId, items: chunk }),
    });
    totals.saved += result.saved;
    totals.duplicates += result.duplicates;
    totals.skippedForRequestSize += result.skippedForRequestSize ?? 0;
    totals.items.push(...(result.items || []));
    sent += chunk.length;

    // The account filled up mid-batch; no later chunk can fit either.
    if ((result.skippedForSpace ?? 0) > 0) {
      totals.skippedForSpace += result.skippedForSpace + (items.length - sent);
      break;
    }
  }

  return totals;
}

export async function updateShowcaseAsset(
  id: string,
  updates: Partial<Pick<ShowcaseAsset, 'client_name' | 'project_url' | 'client_consent' | 'device_hint' | 'tags' | 'notes' | 'is_pinned'>>
    & Partial<Pick<ShowcaseSavePayload, 'before_image_data' | 'before_image_thumbnail' | 'before_image_mime_type' | 'before_image_width' | 'before_image_height'>>
): Promise<ShowcaseAsset> {
  return fetchJson(`${API_BASE}/showcase-update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
}

export async function deleteShowcaseAssets(ids: string[]): Promise<{ deleted: number }> {
  return fetchJson(`${API_BASE}/showcase-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/** POST rather than DELETE — see the handler; DELETE-with-a-body is inconsistently proxied. */
export async function purgeShowcaseLibrary(adAccountId: string): Promise<{ deleted: number }> {
  return fetchJson(`${API_BASE}/showcase-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purge_ad_account_id: adAccountId }),
  });
}

/** One payload per call — the server never returns both halves in one response. */
export async function fetchShowcaseImage(
  id: string,
  which: 'hero' | 'before' = 'hero'
): Promise<{ image_data: string; image_mime_type: string }> {
  return fetchJson(`${API_BASE}/showcase-image?id=${encodeURIComponent(id)}&which=${which}`);
}


// ─── Ingest ─────────────────────────────────────────────────────────────────

/**
 * The `before_image_*` half of a payload. Pure — returns fields to spread, never mutates, so
 * the payload is built in ONE literal rather than constructed and then patched.
 */
function beforeFields(n: NormalizedImage) {
  return {
    before_image_data: n.base64,
    before_image_thumbnail: n.thumbnail,
    before_image_mime_type: n.mimeType,
    before_image_width: n.width,
    before_image_height: n.height,
  };
}

/**
 * Normalize a hero (and optional before) into one save payload.
 *
 * Uses the `showcase` normalize profile, NOT the default: at 800px/q0.82 a website screenshot
 * comes back with mushy UI text, and legible UI text is the entire product here.
 *
 * Returns null rather than throwing for every failure mode, matching the ingest convention.
 * A failed BEFORE is deliberately not fatal: the hero alone is still a usable asset, and the
 * operator can attach the before later through the update route.
 */
export async function buildShowcasePayload(
  hero: File | Blob,
  before: File | Blob | null,
  meta: {
    client_name: string;
    project_url?: string;
    client_consent?: boolean;
    device_hint?: DeviceHint;
    tags?: string[];
    notes?: string;
  }
): Promise<ShowcaseSavePayload | null> {
  const clientName = meta.client_name?.trim();
  if (!clientName) return null;

  const normalizedHero = await normalizeForUpload(hero, 'showcase');
  if (!normalizedHero) return null;

  const normalizedBefore = before ? await normalizeForUpload(before, 'showcase') : null;
  if (before && !normalizedBefore) {
    console.warn(`Showcase: the "before" image for ${clientName} could not be read — saving the hero alone`);
  }

  return {
    client_name: clientName,
    project_url: meta.project_url,
    client_consent: meta.client_consent ?? false,
    device_hint: meta.device_hint ?? 'desktop',
    tags: meta.tags ?? [],
    notes: meta.notes,
    // Hash covers the HERO only, so attaching a before later never changes the row's identity.
    content_hash: await computeImageHash(normalizedHero.base64),
    image_data: normalizedHero.base64,
    image_thumbnail: normalizedHero.thumbnail,
    image_mime_type: normalizedHero.mimeType,
    image_width: normalizedHero.width,
    image_height: normalizedHero.height,
    ...(normalizedBefore ? beforeFields(normalizedBefore) : {}),
  };
}


// ─── The bridge into generation ─────────────────────────────────────────────

export interface LoadedShowcaseImages {
  assetId: string;
  clientName: string;
  heroUrl: string;
  beforeUrl?: string;
}

/**
 * Load full-resolution data URLs for the selected assets, ready for the canvas compositor.
 *
 * Deliberately not state-backed and not cached: a handful of full-size screenshots is tens of
 * MB, and keeping them resident for a whole CreativeIQ session is the memory-exhaustion class
 * of bug this codebase has hit before. Fetch at the moment of composing, then let them go.
 */
export async function loadShowcaseImages(
  assets: ShowcaseAsset[],
  want: 'hero' | 'pair' = 'hero'
): Promise<LoadedShowcaseImages[]> {
  const loaded: LoadedShowcaseImages[] = [];

  for (const asset of assets) {
    try {
      const hero = await fetchShowcaseImage(asset.id, 'hero');
      const entry: LoadedShowcaseImages = {
        assetId: asset.id,
        clientName: asset.client_name,
        heroUrl: `data:${hero.image_mime_type};base64,${hero.image_data}`,
      };

      if (want === 'pair' && asset.before_image_thumbnail) {
        const before = await fetchShowcaseImage(asset.id, 'before');
        entry.beforeUrl = `data:${before.image_mime_type};base64,${before.image_data}`;
      }

      loaded.push(entry);
    } catch (err) {
      // One unreachable asset must not lose the whole composite — same rule as
      // loadExternalStyleReferences.
      console.warn(`Showcase: could not load asset ${asset.id}:`, err);
    }
  }

  return loaded;
}
