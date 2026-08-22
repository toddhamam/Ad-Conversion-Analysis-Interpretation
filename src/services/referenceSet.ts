// Resolves the style references a single image-generation request will use.
//
// Extracted from openaiApi.ts, where this logic existed in THREE near-identical copies — one
// per engine plus one in the batch path — and had already drifted: only the batch copy did
// embedding-based selection, so a single-image reroll silently pulled a different reference
// set than the siblings it was meant to match. One implementation, one drift surface.
//
// Selection only. The Gemini vision call that describes the chosen set (analyzeReferenceImages)
// stays in openaiApi.ts: pulling it in here would make this module import the thing that
// imports it.

import {
  getTopHighQualityCachedImages,
  getSemanticallySimilarImages,
  computeMissingEmbeddings as computeMissingImageEmbeddings,
  getAverageCVR,
  type CachedImage,
} from './imageCache';
import { isEmbeddingAvailable, embedText } from './embeddingService';
import { referenceSourceOf, type StyleReference } from '../lib/referenceProvenance';
import type { StyleDescriptor } from '../lib/styleDescriptor';
import type { ProductContext, AudienceType } from './openaiApi';

/** Images below this score are too low-resolution to steer a generation usefully. */
export const MIN_REFERENCE_QUALITY = 60;

/**
 * Ceilings on inline reference images per request. These are memory limits, not taste ones:
 * reference payloads run 25–50MB and generation is already 2-concurrent, and out-of-memory
 * crashes on this path are a documented production failure.
 *
 * `MAX_OWN_REFERENCES` is 3 because that is what every engine used before this module existed.
 * Raising it would silently increase the payload for every current account, so it stays pinned
 * and external references fill only the slots own winners did not take — which is exactly the
 * cold-start case they exist for. They never stack on top of a full own set beyond the total.
 */
export const MAX_OWN_REFERENCES = 3;
export const MAX_EXTERNAL_REFERENCES = 2;
export const MAX_STYLE_REFERENCES = MAX_OWN_REFERENCES + MAX_EXTERNAL_REFERENCES;
const MAX_PRODUCT_MOCKUPS = 3;

/** How the own-account half of the set was chosen — surfaced for logging and diagnostics. */
export type SelectionStrategy = 'semantic' | 'cvr' | 'external_only' | 'none';

export interface ResolvedReferenceSet {
  /** Ordered own_winner → own_upload → external. Request order matters; see the engines. */
  styleRefs: StyleReference[];
  /**
   * Cached per-item style descriptors, position-aligned with `styleRefs`. `null` where none is
   * stored. Only external references carry these today — own-account images have no row to
   * cache one against.
   */
  cachedDescriptors: Array<StyleDescriptor | null>;
  productImages: Array<{ data: string; mimeType: string }>;
  selection: SelectionStrategy;
  ownCount: number;
  externalCount: number;
}

export interface ResolveReferenceSetInput {
  productContext?: ProductContext;
  audienceType: AudienceType;
  /**
   * Cached descriptors keyed by reference id, supplied by the caller (which is the only layer
   * that knows how to load them) and already validated at that boundary. Used only when the
   * descriptor-cache flag is on.
   */
  descriptorsById?: Record<string, StyleDescriptor>;
  /** External inspiration references, already loaded. Supplied by the caller so this module
   *  stays free of storage concerns and remains synchronously testable. */
  externalRefs?: StyleReference[];
  maxTotal?: number;
  maxExternal?: number;
  minQualityScore?: number;
  /**
   * Whether to compute embeddings that are missing before ranking.
   *
   * Pass `false` on reroll paths. Embedding computation is n sequential network calls spaced
   * 200ms apart; a reroll can read whatever the batch run already wrote to IndexedDB and get
   * the same ranking without paying for it again.
   */
  computeMissingEmbeddings?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * The product-mockup projection, which existed in four places in openaiApi.ts.
 * Mockups are identity references, NOT style sources — they are kept separate all the way
 * through so the engines can label each image with its role.
 */
export function projectProductImages(
  productContext?: ProductContext
): Array<{ data: string; mimeType: string }> {
  return (productContext?.productImages ?? []).slice(0, MAX_PRODUCT_MOCKUPS).map(img => ({
    data: img.base64Data,
    mimeType: img.mimeType,
  }));
}

/** Cache entry → style reference, carrying provenance forward instead of flattening it. */
function toStyleReference(cached: CachedImage): StyleReference {
  const source = referenceSourceOf(cached);
  return {
    id: cached.adId,
    source,
    data: cached.base64Data,
    mimeType: cached.mimeType,
    qualityScore: cached.qualityScore,
    // Only own_winner entries may carry performance figures onward. An upload that somehow
    // acquired a conversionRate must not be able to launder it into the prompt.
    conversions: source === 'own_winner' ? cached.conversions : undefined,
    conversionRate: source === 'own_winner' ? cached.conversionRate : undefined,
  };
}

/**
 * Pick the own-account references, embedding-ranked when possible and CVR-ranked otherwise.
 * Mirrors the behaviour that previously existed only on the batch path.
 */
async function selectOwnReferences(
  input: ResolveReferenceSetInput,
  limit: number
): Promise<{ cached: CachedImage[]; selection: SelectionStrategy }> {
  if (limit <= 0) return { cached: [], selection: 'none' };

  const minQuality = input.minQualityScore ?? MIN_REFERENCE_QUALITY;

  if (isEmbeddingAvailable()) {
    try {
      if (input.computeMissingEmbeddings !== false) {
        await computeMissingImageEmbeddings();
      }

      const queryParts: string[] = [];
      if (input.productContext?.name) queryParts.push(`Product: ${input.productContext.name}`);
      if (input.productContext?.author) queryParts.push(`by ${input.productContext.author}`);
      if (input.productContext?.description) queryParts.push(input.productContext.description.slice(0, 200));
      queryParts.push(`Audience: ${input.audienceType}`);

      const queryEmbedding = await embedText(queryParts.join('. '), 'SEMANTIC_SIMILARITY');
      if (queryEmbedding) {
        const semantic = await getSemanticallySimilarImages(
          queryEmbedding,
          limit,
          minQuality,
          getAverageCVR()
        );
        // Below two matches the ranking is noise, so fall through to CVR rather than
        // pretending a single semantic hit is a considered choice.
        if (semantic.length >= 2) {
          console.log(`🧬 Semantic reference selection: ${semantic.length} images (similarity-ranked)`);
          return { cached: semantic, selection: 'semantic' };
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn('🧬 Semantic reference selection failed, falling back to CVR-based:', msg);
    }
  }

  const cached = getTopHighQualityCachedImages(limit, minQuality);
  return { cached, selection: cached.length > 0 ? 'cvr' : 'none' };
}

/**
 * Resolve the full reference set for one generation request.
 *
 * Never throws: a request with no references at all is a legitimate state (a brand-new account
 * with nothing ingested yet), and the engines already handle an empty style set.
 */
export async function resolveReferenceSet(
  input: ResolveReferenceSetInput
): Promise<ResolvedReferenceSet> {
  const maxTotal = input.maxTotal ?? MAX_STYLE_REFERENCES;
  const maxExternal = Math.min(input.maxExternal ?? MAX_EXTERNAL_REFERENCES, maxTotal);
  const externalPool = input.externalRefs ?? [];

  // Own references are capped independently at the historical 3 so an account with no
  // external material sends exactly the payload it sent before this module existed.
  const ownLimit = Math.min(MAX_OWN_REFERENCES, maxTotal);
  const { cached, selection } = await selectOwnReferences(input, ownLimit);
  const ownRefs = cached.map(toStyleReference);

  // External takes its own allowance plus anything the own side left unclaimed — a cold-start
  // account with zero own winners is the whole point, and it should not be limited to two
  // references just because a hypothetical own set would have been.
  const externalLimit = Math.min(
    externalPool.length,
    Math.max(maxExternal, maxTotal - ownRefs.length)
  );
  const externalRefs = externalPool.slice(0, Math.max(0, externalLimit));

  // Order is load-bearing: the engines label images positionally and the measured references
  // must be presented before the unproven ones.
  const measured = ownRefs.filter(r => r.source === 'own_winner');
  const uploads = ownRefs.filter(r => r.source !== 'own_winner');
  const styleRefs = [...measured, ...uploads, ...externalRefs];

  const resolvedSelection: SelectionStrategy =
    ownRefs.length === 0 && externalRefs.length > 0 ? 'external_only' : selection;

  if (styleRefs.length === 0) {
    console.log('⚠️ No reference images available. Sync Meta Ads, upload brand assets, or add inspiration references.');
  } else {
    console.log(
      `📸 Reference set: ${measured.length} measured + ${uploads.length} uploaded + ${externalRefs.length} external (${resolvedSelection})`
    );
  }

  return {
    styleRefs,
    // Position-aligned with styleRefs so a partial cache is obvious to the consumer: any null
    // means the fast path cannot be taken for this set.
    cachedDescriptors: styleRefs.map(ref => input.descriptorsById?.[ref.id] ?? null),
    productImages: projectProductImages(input.productContext),
    selection: resolvedSelection,
    ownCount: ownRefs.length,
    externalCount: externalRefs.length,
  };
}
