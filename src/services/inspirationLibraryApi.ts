// Inspiration Library API — externally-sourced creative used as CreativeIQ style references.
//
// Structural mirror of swipeLibraryApi.ts (same auth-header helper, one typed function per
// route). Deliberately a separate service and a separate table: swipe items are the account's
// OWN proven winners, these are unproven outside material. Nothing here reports a conversion
// rate, because nothing here has one.

import { supabase } from '../lib/supabase';
import { fetchImageViaBackend } from './swipeLibraryApi';
import { describeReferenceImage } from './openaiApi';
import { normalizeForUpload, normalizeBase64, type NormalizedImage } from '../lib/imageNormalize';
import type { IngestLane, StyleReference } from '../lib/referenceProvenance';

const API_BASE = '/api/meta';

/** Mirrors MAX_INSPIRATION_ITEMS in api/_lib/inspiration-handlers.ts (enforced server-side). */
export const MAX_INSPIRATION_ITEMS = 50;

/**
 * Recorded alongside a cached descriptor so a model change can invalidate the cache later.
 * Descriptors are produced by analyzeReferenceImages, which runs on Gemini.
 */
const DESCRIPTOR_MODEL = 'gemini-vision';

/** Mirrors MAX_ITEMS_PER_SAVE — larger batches are chunked by saveInspirationItems. */
const MAX_ITEMS_PER_SAVE = 10;

// ─── Types ──────────────────────────────────────────────────────────────────

/** The Gemini style descriptor cached at ingest. Shape matches analyzeReferenceImages. */
export interface StyleDescriptor {
  visualStyle: string;
  colorPalette: string;
  composition: string;
  keyElements: string[];
  mood: string;
  lighting: string;
  textOverlays: string;
  productPresentation: string;
}

/** A library row as returned by list queries — no full base64. */
export interface InspirationItem {
  id: string;
  organization_id: string;
  ad_account_id: string;
  ingest_lane: IngestLane;
  image_thumbnail: string | null;
  image_mime_type: string;
  image_width: number | null;
  image_height: number | null;
  quality_score: number | null;
  advertiser_name: string | null;
  advertiser_page_id: string | null;
  source_url: string | null;
  source_snapshot_url: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  days_running: number | null;
  is_still_running: boolean | null;
  captured_at: string;
  ad_copy_snippet: string | null;
  style_descriptor: StyleDescriptor | null;
  style_descriptor_model: string | null;
  style_descriptor_at: string | null;
  content_hash: string;
  tags: string[];
  notes: string | null;
  is_pinned: boolean;
  saved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspirationSavePayload {
  ingest_lane: IngestLane;
  image_data: string;
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
  content_hash: string;
  tags?: string[];
  notes?: string;
}

export interface InspirationListFilters {
  lane?: IngestLane;
  search?: string;
  sort?: 'newest' | 'oldest' | 'longevity';
  limit?: number;
  offset?: number;
}

export interface SaveResult {
  saved: number;
  duplicates: number;
  /** Items dropped because the account hit MAX_INSPIRATION_ITEMS. */
  skippedForSpace: number;
  items: InspirationItem[];
}

/** Thrown when the account is at its item cap, so the UI can offer a specific remedy. */
export class LibraryFullError extends Error {
  readonly limit: number;
  readonly current: number;
  constructor(limit: number, current: number) {
    super(`Inspiration library is full (${current}/${limit}). Delete some items to add more.`);
    this.name = 'LibraryFullError';
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
      throw new LibraryFullError(body.limit ?? MAX_INSPIRATION_ITEMS, body.current ?? 0);
    }
    throw new Error(body.error || body.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * SHA-256 of the FULL normalized base64.
 *
 * Deliberately not the swipe library's `.slice(0, 1000)` shortcut: for JPEGs from the same
 * encoder at the same dimensions those leading bytes are the SOI marker, APPn segments and
 * quantization tables, which are identical across genuinely different images.
 */
export async function computeImageHash(base64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── API functions ──────────────────────────────────────────────────────────

export async function fetchInspirationLibrary(
  adAccountId: string,
  filters?: InspirationListFilters
): Promise<{ items: InspirationItem[]; total: number; limit: number }> {
  const params = new URLSearchParams({ ad_account_id: adAccountId });
  if (filters?.lane) params.set('lane', filters.lane);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.sort) params.set('sort', filters.sort);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  return fetchJson(`${API_BASE}/inspiration-list?${params.toString()}`);
}

/**
 * Save items, chunked to the server's per-request cap. Chunks are sent sequentially so the
 * cap check on the server sees each previous chunk's rows.
 */
export async function saveInspirationItems(
  adAccountId: string,
  items: InspirationSavePayload[]
): Promise<SaveResult> {
  const totals: SaveResult = { saved: 0, duplicates: 0, skippedForSpace: 0, items: [] };

  for (let i = 0; i < items.length; i += MAX_ITEMS_PER_SAVE) {
    const chunk = items.slice(i, i + MAX_ITEMS_PER_SAVE);
    const result = await fetchJson<SaveResult>(`${API_BASE}/inspiration-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_account_id: adAccountId, items: chunk }),
    });
    totals.saved += result.saved;
    totals.duplicates += result.duplicates;
    totals.skippedForSpace += result.skippedForSpace ?? 0;
    totals.items.push(...(result.items || []));

    // The account filled up mid-batch; no later chunk can fit either.
    if (result.skippedForSpace > 0) {
      totals.skippedForSpace += items.length - (i + chunk.length);
      break;
    }
  }

  return totals;
}

export async function updateInspirationItem(
  id: string,
  updates: {
    tags?: string[];
    notes?: string;
    is_pinned?: boolean;
    style_descriptor?: StyleDescriptor;
    style_descriptor_model?: string;
  }
): Promise<InspirationItem> {
  return fetchJson(`${API_BASE}/inspiration-update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
}

export async function deleteInspirationItems(ids: string[]): Promise<{ deleted: number }> {
  return fetchJson(`${API_BASE}/inspiration-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/** Remove every inspiration item for an ad account. Hard delete — see the takedown note in 022. */
export async function purgeInspirationLibrary(adAccountId: string): Promise<{ deleted: number }> {
  return fetchJson(`${API_BASE}/inspiration-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purge_ad_account_id: adAccountId }),
  });
}

export async function fetchInspirationImage(
  id: string
): Promise<{ image_data: string; image_mime_type: string }> {
  return fetchJson(`${API_BASE}/inspiration-image?id=${encodeURIComponent(id)}`);
}

export async function checkInspirationHashes(
  adAccountId: string,
  hashes: string[]
): Promise<Set<string>> {
  const result = await fetchJson<{ saved: string[] }>(`${API_BASE}/inspiration-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_account_id: adAccountId, content_hashes: hashes }),
  });
  return new Set(result.saved);
}

// ─── Ingest helpers ─────────────────────────────────────────────────────────

/** Provenance a lane can supply alongside the pixels. All of it optional and all of it honest. */
export interface IngestProvenance {
  advertiser_name?: string;
  advertiser_page_id?: string;
  source_url?: string;
  source_snapshot_url?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  days_running?: number;
  is_still_running?: boolean;
  ad_copy_snippet?: string;
  tags?: string[];
  notes?: string;
}

function toPayload(
  lane: IngestLane,
  normalized: NormalizedImage,
  hash: string,
  provenance: IngestProvenance
): InspirationSavePayload {
  return {
    ingest_lane: lane,
    image_data: normalized.base64,
    image_thumbnail: normalized.thumbnail,
    image_mime_type: normalized.mimeType,
    image_width: normalized.width,
    image_height: normalized.height,
    quality_score: normalized.qualityScore,
    content_hash: hash,
    ...provenance,
  };
}

/**
 * Normalize a batch of files into save payloads.
 *
 * Per-file failures are dropped, never thrown — a corrupt screenshot in a 20-file deck upload
 * must not lose the other nineteen. The caller reports the shortfall.
 */
export async function buildPayloadsFromFiles(
  files: File[],
  lane: IngestLane,
  provenance: IngestProvenance = {},
  onProgress?: (done: number, total: number) => void
): Promise<{ payloads: InspirationSavePayload[]; failed: number }> {
  const payloads: InspirationSavePayload[] = [];
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    // Sequential, not Promise.all: each file holds a full-resolution bitmap plus two canvases
    // while it is being processed, and 20 at once is a memory spike for no wall-clock gain.
    const normalized = await normalizeForUpload(files[i]);
    if (!normalized) {
      failed++;
    } else {
      payloads.push(toPayload(lane, normalized, await computeImageHash(normalized.base64), provenance));
    }
    onProgress?.(i + 1, files.length);
  }

  return { payloads, failed };
}

/** Normalize a single base64 image (the Ad Library capture lane) into a save payload. */
export async function buildPayloadFromBase64(
  base64Data: string,
  mimeType: string,
  lane: IngestLane,
  provenance: IngestProvenance = {}
): Promise<InspirationSavePayload | null> {
  const normalized = await normalizeBase64(base64Data, mimeType);
  if (!normalized) return null;
  return toPayload(lane, normalized, await computeImageHash(normalized.base64), provenance);
}

// ─── Bridge into generation ─────────────────────────────────────────────────

/**
 * Load the full-resolution pixels for the chosen items and shape them as style references.
 *
 * `source: 'external'` is set structurally — every row in this table is external by
 * construction, so there is no stored flag to get wrong. No performance fields are set,
 * because none exist to set.
 */
export async function loadExternalStyleReferences(
  items: InspirationItem[]
): Promise<StyleReference[]> {
  const refs: StyleReference[] = [];

  for (const item of items) {
    try {
      const full = await fetchInspirationImage(item.id);
      refs.push({
        id: item.id,
        source: 'external',
        data: full.image_data,
        mimeType: full.image_mime_type,
        qualityScore: item.quality_score ?? undefined,
        advertiser: item.advertiser_name ?? undefined,
        daysRunning: item.days_running ?? undefined,
        firstSeenAt: item.first_seen_at ?? undefined,
        sourceUrl: item.source_url ?? undefined,
        lane: item.ingest_lane,
      });
    } catch (error: unknown) {
      // One unreachable image must not block a generation the user already paid for.
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Could not load inspiration reference ${item.id}:`, msg);
    }
  }

  return refs;
}

// ─── Lane (a): Meta Ad Library capture ──────────────────────────────────────

/**
 * Capture a competitor creative from an Ad Library search result.
 *
 * Reuses the existing `/api/meta/image-fetch` endpoint, whose SSRF allowlist already covers
 * the `scontent.*.fbcdn.net` host the og:image scrape returns — so this lane adds no new
 * outbound-fetch surface.
 *
 * The honest caveat: that og:image is a SOCIAL PREVIEW, often ~600px and sometimes a composite
 * card rather than the raw creative. The real dimensions are stored and scored so a low-res
 * capture is visible as such and excluded from the reference set by the same quality gate
 * generation already applies. This is why the screenshot lane is not redundant.
 */
export async function captureAdLibraryInspiration(
  adAccountId: string,
  input: {
    imageUrl: string;
    advertiserName?: string;
    advertiserPageId?: string;
    snapshotUrl?: string;
    deliveryStartTime?: string;
    deliveryStopTime?: string;
    daysRunning?: number;
    adCopySnippet?: string;
  }
): Promise<{ saved: number; duplicates: number; qualityScore: number | null }> {
  const fetched = await fetchImageViaBackend(input.imageUrl);
  if (!fetched) throw new Error('Could not download that ad creative. Try screenshotting it instead.');

  const payload = await buildPayloadFromBase64(
    fetched.base64Data,
    fetched.mimeType,
    'ad_library',
    {
      advertiser_name: input.advertiserName,
      advertiser_page_id: input.advertiserPageId,
      source_snapshot_url: input.snapshotUrl,
      first_seen_at: input.deliveryStartTime,
      last_seen_at: input.deliveryStopTime,
      days_running: input.daysRunning,
      is_still_running: !input.deliveryStopTime,
      ad_copy_snippet: input.adCopySnippet?.slice(0, 500),
    }
  );
  if (!payload) throw new Error('That ad creative could not be read as an image.');

  const result = await saveInspirationItems(adAccountId, [payload]);
  return {
    saved: result.saved,
    duplicates: result.duplicates,
    qualityScore: payload.quality_score ?? null,
  };
}

// ─── Lane (d): URL import ───────────────────────────────────────────────────

/** Thrown when URL import is disabled server-side, so the UI can point at the alternative. */
export class UrlImportDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlImportDisabledError';
  }
}

/**
 * Import an image from an arbitrary URL.
 *
 * The server does all validation (see api/_lib/url-guard.ts) and returns deliberately generic
 * errors — this lane must not become a blind-SSRF oracle, so the client cannot report anything
 * more specific than the server chose to say.
 */
export async function importInspirationFromUrl(
  adAccountId: string,
  sourceUrl: string,
  provenance: IngestProvenance = {}
): Promise<{ saved: number; duplicates: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(`${API_BASE}/inspiration-import-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: sourceUrl }),
  });

  const body = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    if (response.status === 403) {
      throw new UrlImportDisabledError(body.message || 'URL import is not enabled.');
    }
    throw new Error(body.message || body.error || 'Could not import that URL');
  }

  const payload = await buildPayloadFromBase64(body.base64Data, body.mimeType, 'url_import', {
    ...provenance,
    source_url: sourceUrl,
  });
  if (!payload) throw new Error('That file could not be read as an image.');

  const result = await saveInspirationItems(adAccountId, [payload]);
  return { saved: result.saved, duplicates: result.duplicates };
}

// ─── Style descriptor caching (Phase 7) ─────────────────────────────────────

/**
 * Describe newly-saved references once and store the result on the row.
 *
 * Fire-and-forget by design: ingest must not wait on a vision call, and a failure here costs
 * nothing — generation simply falls back to analysing the set live. Only runs for items that
 * do not already have a descriptor, so re-saving never re-pays for one.
 */
export async function backfillStyleDescriptors(items: InspirationItem[]): Promise<void> {
  const pending = items.filter(item => !item.style_descriptor);
  if (pending.length === 0) return;

  // Sequential: each call holds a full-size base64 image, and the ingest path has just
  // finished holding several of them.
  for (const item of pending) {
    try {
      const full = await fetchInspirationImage(item.id);
      const descriptor = await describeReferenceImage({
        data: full.image_data,
        mimeType: full.image_mime_type,
      });
      if (!descriptor) continue;
      await updateInspirationItem(item.id, {
        style_descriptor: descriptor,
        style_descriptor_model: DESCRIPTOR_MODEL,
      });
    } catch (error: unknown) {
      console.warn(`Could not cache a style descriptor for ${item.id}:`,
        error instanceof Error ? error.message : error);
    }
  }
}
