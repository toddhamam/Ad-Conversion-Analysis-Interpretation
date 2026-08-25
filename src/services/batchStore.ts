/**
 * IndexedDB Batch Store
 *
 * Persists the current CreativeIQ ad batch (generated packages + the generation
 * context that produced them) in IndexedDB instead of localStorage.
 *
 * Why IndexedDB: localStorage is a hard ~5MB per origin, shared across every key
 * in the app. A full Blitz grid (up to 24 base64 creatives, ~20-30MB) can't fit,
 * which forced the old code to strip images off all but the 5 most-recent ads and
 * wipe the batch on publish. IndexedDB's quota is a share of free disk (hundreds of
 * MB to GBs on every browser), so the entire batch — every image — persists intact
 * across hard refreshes, surviving publish-to-Meta, until a new batch replaces it.
 *
 * Single slot per ad account: the record is keyed by ad-account ID, so each account
 * keeps exactly one current batch. Saving a new batch overwrites the old one (put),
 * which gives "persist until I generate a new batch, then it's gone" for free.
 *
 * The generation context (selected product, similarity, image size, model, copy
 * options + selections) is snapshotted alongside the packages so per-image
 * regeneration stays on-brand and every workflow stage rehydrates after a refresh.
 *
 * Mirrors the conventions in embeddingStore.ts (promise-wrapped IDB, graceful
 * degradation — every op catches and returns a safe default rather than throwing).
 */

import type { ShowcaseDraft } from '../lib/showcaseLayout';
import type {
  GeneratedAdPackage, CopyOption, GridCell, GeneratedImageResult,
  AudienceType, ConceptType, AdType, ImageSize, ImageModel, BlitzImageStrategy,
} from './openaiApi';
import type { FormatType, GridShape, GridAngle, HookType } from '../lib/axisTags';
import type { CampaignIntent } from '../types/organization';
import type { CustomDirectionMode } from '../lib/customDirection';

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * A snapshot of the configuration that produced a batch. Restored on load so the
 * workflow stages rehydrate and image regeneration re-runs with the same context
 * (product identity, variation strength, size, model) that generated the originals.
 *
 * Fields carry their real union types so the generator can save and restore them
 * without casting.
 */
export interface BatchSessionContext {
  // Step 1 — audience & concept
  audienceType?: AudienceType;
  conceptType?: ConceptType;
  campaignIntent?: CampaignIntent;
  copySource?: 'generate' | 'import' | 'manual' | 'swipe';
  adType?: AdType;
  // Which workflow stage the user was on, so a refresh lands them back where they were.
  currentStep?: 'config' | 'copy-selection' | 'final-config' | 'grid-review' | 'grid-images';
  // Generation knobs — required for on-brand regeneration after a refresh
  selectedProductId?: string | null;
  similarityValue?: number;
  copyVariationValue?: number;
  imageSize?: ImageSize;
  imageModel?: ImageModel;
  variationCount?: number;
  // Operator creative brief for image generation. Persisted for the same reason the other
  // generation knobs are: per-image regeneration days later must re-run against the brief that
  // produced the batch, not against a default it never used. See lib/customDirection.ts.
  customDirectionText?: string;
  customDirectionMode?: CustomDirectionMode;
  // Showcase composite arrangement. Same reason as the knobs above: a refresh mid-flow must
  // rebuild the arrangement the operator chose, not silently fall back to a default.
  //
  // Stored as the DRAFT OBJECT, not seven flat fields. Flattening it would mean seven lines to
  // snapshot and seven to restore, and a field added to ShowcaseDraft would silently stop
  // surviving a refresh until someone remembered to widen this too.
  showcase?: ShowcaseDraft;
  /** Kept separate because the LIBRARY, not the session, is the source of truth for these. */
  showcaseAssetIds?: string[];
  // Step 2 — copy options + the user's selections
  copyOptions?: {
    headlines: CopyOption[];
    bodyTexts: CopyOption[];
    callToActions: CopyOption[];
  } | null;
  selectedHeadlines?: string[];
  selectedBodyTexts?: string[];
  selectedCTAs?: string[];
  // Blitz grid
  generationMode?: 'single' | 'grid';
  gridFormat?: FormatType;
  // Grid CONFIG, not just its output. Without these a refresh mid-Blitz restores the cells but
  // loses the shape that produced them, so a reroll would silently rebuild a different grid —
  // a callout matrix would come back as an angle x hook grid with no visible cause.
  gridShape?: GridShape;
  gridAngles?: GridAngle[];
  gridHooks?: HookType[];
  gridCallouts?: string[];
  blitzImageStrategy?: BlitzImageStrategy;
  // The generated Angle × Hook copy matrix + which cells are kept, so the Blitz copy stage
  // survives a refresh (keptCellIds is the Set serialized to an array for storage).
  gridCells?: GridCell[] | null;
  keptCellIds?: string[];
  // Partial-failure warning for the Blitz image pool (e.g. "2 of 4 images failed"), if any.
  blitzImageError?: string;
  // The Core Promise the batch lives inside (stored for reference; the Core Promise
  // library has its own persistence, so this is not re-applied on restore).
  corePromise?: string;
}

/** One persisted batch — the current working set for a single ad account. */
export interface StoredBatch {
  accountId: string;                  // keyPath — one record per account
  packages: GeneratedAdPackage[];     // generated ad packages, full images intact
  blitzImages?: (GeneratedImageResult | null)[]; // Blitz rendered image pool (slot-aligned; null = a failed slot)
  session: BatchSessionContext;       // the config that produced them
  publishedAt: number | null;         // set when the batch is published to Meta (drives the badge)
}

// ─── Configuration ──────────────────────────────────────────────────────────────

const DB_NAME = 'convertra_batches';
const DB_VERSION = 1;
const STORE_NAME = 'batches';

// IndexedDB keyPath can't be null, so single-account orgs (no scope) use this constant.
const UNSCOPED_KEY = '__unscoped__';

const resolveAccountKey = (accountId: string | null | undefined): string =>
  accountId && accountId.length > 0 ? accountId : UNSCOPED_KEY;

// ─── Database Management ────────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

/**
 * Open (or create) the IndexedDB database. Cached for subsequent calls.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'accountId' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      // Handle connection loss (e.g. browser clears storage)
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.warn('Failed to open batch store:', request.error?.message);
      reject(request.error);
    };
  });
}

// ─── Persistent storage (eviction protection) ───────────────────────────────────

let _persistRequested = false;

/**
 * Ask the browser to mark this origin's storage "persistent" so the batch can't be
 * evicted under disk pressure. Best-effort, runs once, never throws. (25MB never
 * needs a permission prompt; this only upgrades the eviction policy.)
 */
async function ensurePersistentStorage(): Promise<void> {
  if (_persistRequested) return;
  _persistRequested = true;
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted?.();
      if (!already) await navigator.storage.persist();
    }
  } catch {
    // Non-critical — storage still works, just without eviction protection.
  }
}

// ─── CRUD Operations ────────────────────────────────────────────────────────────

/**
 * Load the current batch for an ad account. Returns null if none stored or on error.
 */
export async function getBatch(accountId: string | null | undefined): Promise<StoredBatch | null> {
  const key = resolveAccountKey(accountId);
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve((request.result as StoredBatch | undefined) || null);
      request.onerror = () => {
        console.warn('Failed to read batch:', request.error?.message);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Save (overwrite) the current batch for an ad account. The single-slot put() means
 * a new batch replaces the previous one.
 */
export async function saveBatch(
  accountId: string | null | undefined,
  data: {
    packages: GeneratedAdPackage[];
    blitzImages?: (GeneratedImageResult | null)[];
    session: BatchSessionContext;
    publishedAt?: number | null;
  },
): Promise<void> {
  const key = resolveAccountKey(accountId);
  ensurePersistentStorage();
  try {
    const db = await openDB();
    const entry: StoredBatch = {
      accountId: key,
      packages: data.packages,
      blitzImages: data.blitzImages ?? [],
      session: data.session,
      publishedAt: data.publishedAt ?? null,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to save batch:', request.error?.message);
        reject(request.error);
      };
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Failed to save batch:', msg);
  }
}

/**
 * Mark the current batch as published to Meta (sets publishedAt). No-op if no batch
 * exists. Called after a successful publish so the batch stays visible with a
 * "Published" badge instead of being wiped.
 */
export async function markBatchPublished(accountId: string | null | undefined): Promise<void> {
  const key = resolveAccountKey(accountId);
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const existing = getReq.result as StoredBatch | undefined;
        if (!existing) {
          resolve();
          return;
        }
        existing.publishedAt = Date.now();
        const putReq = store.put(existing);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => resolve();
      };
      getReq.onerror = () => resolve();
    });
  } catch {
    // Silently fail — marking published is non-critical.
  }
}

/**
 * Delete the current batch for an ad account (the "Clear All" action).
 */
export async function clearBatch(accountId: string | null | undefined): Promise<void> {
  const key = resolveAccountKey(accountId);
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail.
  }
}
