import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CachedImage } from './imageCache';
import type { StyleReference } from '../lib/referenceProvenance';

// Selection is what's under test, not storage or embeddings — stub both boundaries.
const cacheState: { top: CachedImage[]; semantic: CachedImage[] } = { top: [], semantic: [] };
const embeddingState = { available: false };

vi.mock('./imageCache', () => ({
  getTopHighQualityCachedImages: (count: number) => cacheState.top.slice(0, count),
  getSemanticallySimilarImages: async (_v: number[], count: number) => cacheState.semantic.slice(0, count),
  computeMissingEmbeddings: async () => {},
  getAverageCVR: () => 2,
}));

vi.mock('./embeddingService', () => ({
  isEmbeddingAvailable: () => embeddingState.available,
  embedText: async () => [0.1, 0.2, 0.3],
}));

const {
  resolveReferenceSet,
  projectProductImages,
  MAX_OWN_REFERENCES,
  MAX_EXTERNAL_REFERENCES,
  MAX_STYLE_REFERENCES,
} = await import('./referenceSet');

function cached(adId: string, overrides: Partial<CachedImage> = {}): CachedImage {
  return {
    adId,
    base64Data: 'AAAA',
    mimeType: 'image/jpeg',
    capturedAt: 1,
    conversionRate: 5,
    conversions: 10,
    qualityScore: 100,
    ...overrides,
  };
}

function external(id: string): StyleReference {
  return { id, source: 'external', data: 'AAAA', mimeType: 'image/jpeg', advertiser: 'Acme', daysRunning: 100 };
}

const BASE = { audienceType: 'prospecting' as const };

beforeEach(() => {
  cacheState.top = [];
  cacheState.semantic = [];
  embeddingState.available = false;
});

// ---------------------------------------------------------------------------
// 1. Caps — these are memory limits, and the OOM they guard is a real production failure
// ---------------------------------------------------------------------------

describe('reference caps', () => {
  it('never sends more own references than the engines historically used', async () => {
    // Pinned at 3. Raising it silently increases the payload for every existing account.
    cacheState.top = Array.from({ length: 10 }, (_, i) => cached(`ad_${i}`));

    const set = await resolveReferenceSet(BASE);

    expect(MAX_OWN_REFERENCES).toBe(3);
    expect(set.ownCount).toBe(3);
    expect(set.styleRefs).toHaveLength(3);
  });

  it('never exceeds the total cap when both sources are full', async () => {
    cacheState.top = Array.from({ length: 10 }, (_, i) => cached(`ad_${i}`));
    const externalRefs = Array.from({ length: 10 }, (_, i) => external(`x_${i}`));

    const set = await resolveReferenceSet({ ...BASE, externalRefs });

    expect(set.styleRefs.length).toBeLessThanOrEqual(MAX_STYLE_REFERENCES);
    expect(set.ownCount).toBe(MAX_OWN_REFERENCES);
    expect(set.externalCount).toBe(MAX_EXTERNAL_REFERENCES);
  });

  it('lets external references claim the slots own winners left empty', async () => {
    // The cold-start case: no own material at all. Limiting external to its own small
    // allowance here would starve exactly the account this feature exists for.
    const externalRefs = Array.from({ length: 10 }, (_, i) => external(`x_${i}`));

    const set = await resolveReferenceSet({ ...BASE, externalRefs });

    expect(set.ownCount).toBe(0);
    expect(set.externalCount).toBe(MAX_STYLE_REFERENCES);
  });

  it('honours an explicit maxTotal below the defaults', async () => {
    cacheState.top = Array.from({ length: 10 }, (_, i) => cached(`ad_${i}`));

    const set = await resolveReferenceSet({ ...BASE, maxTotal: 2 });

    expect(set.styleRefs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Ordering — the engines label images positionally
// ---------------------------------------------------------------------------

describe('ordering', () => {
  it('presents measured references before uploads before external', async () => {
    cacheState.top = [
      cached('upload_1', { source: 'own_upload', conversionRate: undefined, conversions: undefined }),
      cached('ad_1'),
    ];

    const set = await resolveReferenceSet({ ...BASE, externalRefs: [external('x_1')] });

    expect(set.styleRefs.map(r => r.source)).toEqual(['own_winner', 'own_upload', 'external']);
  });
});

// ---------------------------------------------------------------------------
// 3. Provenance must survive the trip out of the cache
// ---------------------------------------------------------------------------

describe('provenance mapping', () => {
  it('defaults a cache entry with no source to own_winner', async () => {
    cacheState.top = [cached('ad_1')];

    const set = await resolveReferenceSet(BASE);

    expect(set.styleRefs[0].source).toBe('own_winner');
    expect(set.styleRefs[0].conversions).toBe(10);
  });

  it('strips performance figures off a non-winner even if the cache carries them', async () => {
    // Defence in depth: uploads used to be stamped with a fabricated 10% CVR. A stale entry
    // must not be able to launder that number into the prompt.
    cacheState.top = [cached('upload_1', { source: 'own_upload', conversionRate: 10, conversions: 99 })];

    const set = await resolveReferenceSet(BASE);

    expect(set.styleRefs[0].source).toBe('own_upload');
    expect(set.styleRefs[0].conversionRate).toBeUndefined();
    expect(set.styleRefs[0].conversions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Selection strategy
// ---------------------------------------------------------------------------

describe('selection strategy', () => {
  it('falls back to CVR ranking when embeddings are unavailable', async () => {
    cacheState.top = [cached('ad_1'), cached('ad_2')];

    expect((await resolveReferenceSet(BASE)).selection).toBe('cvr');
  });

  it('uses semantic ranking when it returns enough matches', async () => {
    embeddingState.available = true;
    cacheState.semantic = [cached('ad_1'), cached('ad_2')];
    cacheState.top = [cached('ad_9')];

    const set = await resolveReferenceSet(BASE);

    expect(set.selection).toBe('semantic');
    expect(set.styleRefs.map(r => r.id)).toEqual(['ad_1', 'ad_2']);
  });

  it('ignores a single semantic match rather than treating it as a considered choice', async () => {
    embeddingState.available = true;
    cacheState.semantic = [cached('ad_1')];
    cacheState.top = [cached('ad_9')];

    const set = await resolveReferenceSet(BASE);

    expect(set.selection).toBe('cvr');
    expect(set.styleRefs.map(r => r.id)).toEqual(['ad_9']);
  });

  it('reports external_only when nothing own was available', async () => {
    expect((await resolveReferenceSet({ ...BASE, externalRefs: [external('x_1')] })).selection).toBe('external_only');
  });

  it('reports none — and does not throw — for an account with nothing at all', async () => {
    const set = await resolveReferenceSet(BASE);

    expect(set.selection).toBe('none');
    expect(set.styleRefs).toEqual([]);
    expect(set.productImages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Product mockups — the projection that existed in four places
// ---------------------------------------------------------------------------

describe('projectProductImages', () => {
  const productImages = Array.from({ length: 6 }, (_, i) => ({
    base64Data: `img${i}`,
    mimeType: 'image/png',
    fileName: `${i}.png`,
  }));

  it('caps mockups at three', () => {
    expect(projectProductImages({ productImages } as never)).toHaveLength(3);
  });

  it('returns an empty list rather than throwing for a missing product context', () => {
    expect(projectProductImages(undefined)).toEqual([]);
    expect(projectProductImages({} as never)).toEqual([]);
  });

  it('keeps mockups out of the style set entirely', async () => {
    // Mockups are identity references, not style sources. Blending them into styleRefs is
    // what previously pushed the model to restyle the product instead of reproducing it.
    cacheState.top = [cached('ad_1')];

    const set = await resolveReferenceSet({ ...BASE, productContext: { productImages } as never });

    expect(set.styleRefs.every(r => r.source !== undefined)).toBe(true);
    expect(set.styleRefs).toHaveLength(1);
    expect(set.productImages).toHaveLength(3);
  });
});
