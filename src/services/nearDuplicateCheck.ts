// Orchestration for the pre-publish near-duplicate check: embedding calls, IndexedDB caching,
// and assembling the inputs the pure scorer in lib/nearDuplicate.ts needs.
//
// DEGRADATION IS THE POINT: every failure path here returns "no flags" rather than throwing.
// A creative-safety heuristic must never become a hard dependency of the revenue path — if
// embeddings are unavailable or a call fails, the publish proceeds unwarned.

import { isEmbeddingAvailable, embedMultimodal } from './embeddingService';
import { getEmbedding, setEmbedding, computeImageHash } from './embeddingStore';
import { fetchInspirationImage, type InspirationItem } from './inspirationLibraryApi';
import {
  scoreNearDuplicates,
  NEAR_DUPLICATE_THRESHOLD,
  type DuplicateReference,
  type DuplicateCandidate,
  type DuplicateScanResult,
} from '../lib/nearDuplicate';

/** Embedding cache key for an inspiration item. Namespaced so it cannot collide with ad ids. */
function referenceKey(itemId: string): string {
  return `insp_${itemId}`;
}

/** Split a data URL into the parts embedMultimodal wants. Returns null for a non-data URL. */
function splitDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

/**
 * Embed the external references that fed this batch, reusing anything already in IndexedDB.
 *
 * References change rarely and the batch is re-checked on every publish, so caching is what
 * keeps this from being a per-publish cost.
 */
async function loadReferenceVectors(items: InspirationItem[]): Promise<DuplicateReference[]> {
  const refs: DuplicateReference[] = [];

  for (const item of items) {
    try {
      const key = referenceKey(item.id);
      const cached = await getEmbedding(key);
      if (cached?.vector?.length) {
        refs.push({
          id: item.id,
          vector: cached.vector,
          advertiser: item.advertiser_name ?? undefined,
          thumbnail: item.image_thumbnail ?? undefined,
        });
        continue;
      }

      const full = await fetchInspirationImage(item.id);
      const vector = await embedMultimodal('', full.image_data, full.image_mime_type, 'SEMANTIC_SIMILARITY');
      if (!vector) continue;

      await setEmbedding(key, vector, item.advertiser_name || '', computeImageHash(full.image_data));
      refs.push({
        id: item.id,
        vector,
        advertiser: item.advertiser_name ?? undefined,
        thumbnail: item.image_thumbnail ?? undefined,
      });
    } catch (error: unknown) {
      // One unreachable reference weakens the check; it must not break it.
      console.warn(`Near-duplicate: could not embed reference ${item.id}:`,
        error instanceof Error ? error.message : error);
    }
  }

  return refs;
}

/** Embed the creatives about to be published. */
async function loadCandidateVectors(
  images: Array<{ index: number; imageUrl: string }>
): Promise<DuplicateCandidate[]> {
  const candidates: DuplicateCandidate[] = [];

  for (const image of images) {
    try {
      const parts = splitDataUrl(image.imageUrl);
      if (!parts) continue;   // remote URL: nothing local to embed

      // Hash-keyed so re-publishing the same batch does not re-embed it.
      const key = `gen_${computeImageHash(parts.base64)}`;
      const cached = await getEmbedding(key);
      if (cached?.vector?.length) {
        candidates.push({ index: image.index, vector: cached.vector });
        continue;
      }

      const vector = await embedMultimodal('', parts.base64, parts.mimeType, 'SEMANTIC_SIMILARITY');
      if (!vector) continue;

      await setEmbedding(key, vector, '', computeImageHash(parts.base64));
      candidates.push({ index: image.index, vector });
    } catch (error: unknown) {
      console.warn(`Near-duplicate: could not embed candidate ${image.index}:`,
        error instanceof Error ? error.message : error);
    }
  }

  return candidates;
}

const EMPTY_RESULT: DuplicateScanResult = { flags: [], maxSimilarityByIndex: {} };

/**
 * Check a batch of about-to-publish creatives against the external references that inspired it.
 *
 * Returns an empty result — never throws — when embeddings are unavailable, when there are no
 * external references, or when any step fails.
 */
export async function checkNearDuplicates(
  images: Array<{ index: number; imageUrl: string }>,
  referenceItems: InspirationItem[]
): Promise<DuplicateScanResult> {
  if (!isEmbeddingAvailable()) return EMPTY_RESULT;
  if (images.length === 0 || referenceItems.length === 0) return EMPTY_RESULT;

  try {
    const [references, candidates] = await Promise.all([
      loadReferenceVectors(referenceItems),
      loadCandidateVectors(images),
    ]);

    const result = scoreNearDuplicates(candidates, references);

    // Log every max similarity, not just the flagged ones. The threshold is an estimate and
    // this is the only way to calibrate it against what real generations actually score.
    const scores = Object.entries(result.maxSimilarityByIndex)
      .map(([index, similarity]) => `${index}:${similarity.toFixed(3)}`)
      .join(' ');
    if (scores) {
      console.log(`🔍 Near-duplicate scan (threshold ${NEAR_DUPLICATE_THRESHOLD}) — max similarity per ad: ${scores}`);
    }

    return result;
  } catch (error: unknown) {
    console.warn('Near-duplicate scan failed, continuing without it:',
      error instanceof Error ? error.message : error);
    return EMPTY_RESULT;
  }
}
