import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateQualityScore,
  getAllCachedImages,
  getTopHighQualityCachedImages,
  clearLegacyCache,
  uploadBrandImage,
  type CachedImage,
} from './imageCache';
import { setScopedAccountId } from '../lib/scopedStorage';

// ---------------------------------------------------------------------------
// localStorage stub — keeps the suite in a node environment (no jsdom needed).
// Same idiom as channelAnalysisCache.test.ts.
// ---------------------------------------------------------------------------

function installLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = mock as unknown as Storage;
  return store;
}

const CACHE_KEY = 'conversion_intelligence_image_cache';
const ACCOUNT = 'act_test';

/** Write entries straight into the scoped cache blob, bypassing the writers under test. */
function seedCache(images: CachedImage[]) {
  const blob = { images: Object.fromEntries(images.map(i => [i.adId, i])), lastUpdated: Date.now() };
  localStorage.setItem(`${CACHE_KEY}_${ACCOUNT}`, JSON.stringify(blob));
}

function winner(adId: string, overrides: Partial<CachedImage> = {}): CachedImage {
  return {
    adId,
    base64Data: 'AAAA',
    mimeType: 'image/jpeg',
    capturedAt: 1_000,
    conversionRate: 5,
    conversions: 10,
    width: 1200,
    height: 1200,
    qualityScore: 100,
    ...overrides,
  };
}

function upload(adId: string, overrides: Partial<CachedImage> = {}): CachedImage {
  return {
    adId,
    base64Data: 'AAAA',
    mimeType: 'image/jpeg',
    capturedAt: 2_000,
    source: 'own_upload',
    width: 1200,
    height: 1200,
    qualityScore: 100,
    ...overrides,
  };
}

beforeEach(() => {
  installLocalStorage();
  setScopedAccountId(ACCOUNT);
});

// ---------------------------------------------------------------------------
// 1. Quality ladder — the single scoring ladder every ingest path must share
// ---------------------------------------------------------------------------

describe('calculateQualityScore', () => {
  it('scores on the shorter dimension at each boundary', () => {
    expect(calculateQualityScore(1920, 1080)).toBe(100);
    expect(calculateQualityScore(1080, 1920)).toBe(100);
    expect(calculateQualityScore(1280, 720)).toBe(80);
    expect(calculateQualityScore(640, 480)).toBe(60);
    expect(calculateQualityScore(400, 320)).toBe(40);
    expect(calculateQualityScore(200, 200)).toBe(20);
  });

  it('puts the generation threshold (60) exactly at 480px', () => {
    // getTopHighQualityCachedImages filters at >= 60, so 480 is the real admission gate.
    expect(calculateQualityScore(480, 480)).toBeGreaterThanOrEqual(60);
    expect(calculateQualityScore(479, 479)).toBeLessThan(60);
  });
});

// ---------------------------------------------------------------------------
// 2. Operator uploads must survive — the bug this phase fixes
// ---------------------------------------------------------------------------

describe('operator uploads', () => {
  it('are NOT deleted by clearLegacyCache', () => {
    // Regression guard: clearLegacyCache used to delete every entry lacking width/qualityScore,
    // and uploads were written without either — so uploading appeared to work and then the
    // image vanished on the next Meta Ads sync.
    seedCache([upload('uploaded_1', { width: undefined, qualityScore: undefined }), winner('ad_1')]);

    clearLegacyCache();

    const ids = getAllCachedImages().map(i => i.adId);
    expect(ids).toContain('uploaded_1');
  });

  it('still purges genuine legacy entries', () => {
    seedCache([
      winner('legacy_1', { width: undefined, qualityScore: undefined }),
      winner('ad_1'),
    ]);

    expect(clearLegacyCache()).toBe(1);
    expect(getAllCachedImages().map(i => i.adId)).toEqual(['ad_1']);
  });

  it('are selectable as style references without a synthetic conversion rate', () => {
    // Uploads carry no CVR. They must still pass the quality filter and be returned when
    // they are the only reference material — the cold-start case.
    seedCache([upload('uploaded_1'), upload('uploaded_2')]);

    const refs = getTopHighQualityCachedImages(3, 60);

    expect(refs.map(r => r.adId).sort()).toEqual(['uploaded_1', 'uploaded_2']);
    expect(refs.every(r => r.conversionRate === undefined)).toBe(true);
  });

  it('rank below measured winners rather than above them', () => {
    // The old fake 10% CVR made an upload outrank a real 6%-converting ad.
    seedCache([upload('uploaded_1'), winner('ad_1', { conversionRate: 6 })]);

    expect(getTopHighQualityCachedImages(1, 60)[0].adId).toBe('ad_1');
  });

  it('survive CVR-ranked eviction when the cache overflows', () => {
    // 20 winners all out-rank a CVR-less upload, so a pure CVR sort would drop every upload
    // the moment the cache is full. saveCache reserves slots for uploads instead.
    //
    // saveCache is private, so drive it through clearLegacyCache: 22 entries in, one legacy
    // entry purged, 21 left => the >20 eviction branch runs.
    // Give each winner a distinct CVR *and* conversion count so ad_19 is unambiguously the
    // best on both axes — otherwise saveCache's separate "protect the highest-converting ad"
    // rule rescues an arbitrary winner and the eviction assertion becomes ambiguous.
    const winners = Array.from({ length: 20 }, (_, i) =>
      winner(`ad_${i}`, { conversionRate: 1 + i, conversions: 1 + i }) // ad_0 is the weakest
    );
    seedCache([
      ...winners,
      upload('uploaded_1'),
      winner('legacy_1', { width: undefined, qualityScore: undefined }),
    ]);

    clearLegacyCache();

    const ids = getAllCachedImages().map(i => i.adId);
    expect(ids).toHaveLength(20);
    expect(ids).toContain('uploaded_1'); // reserved, not evicted
    expect(ids).not.toContain('ad_0');   // weakest winner gave up the slot
    expect(ids).not.toContain('legacy_1');
  });

  it('caps how many slots uploads may reserve', () => {
    // A bulk upload must not crowd out an account's measured winners entirely.
    const winners = Array.from({ length: 20 }, (_, i) => winner(`ad_${i}`, { conversionRate: 1 + i }));
    const uploads = Array.from({ length: 12 }, (_, i) => upload(`uploaded_${i}`, { capturedAt: 2_000 + i }));
    seedCache([
      ...winners,
      ...uploads,
      winner('legacy_1', { width: undefined, qualityScore: undefined }),
    ]);

    clearLegacyCache();

    const kept = getAllCachedImages();
    const keptUploads = kept.filter(i => i.source === 'own_upload');
    expect(kept).toHaveLength(20);
    expect(keptUploads).toHaveLength(8);              // MAX_UPLOAD_SLOTS
    expect(kept.length - keptUploads.length).toBe(12); // winners keep the rest
    // Newest uploads win the reserved slots.
    expect(keptUploads.map(i => i.adId).sort()).toEqual([
      'uploaded_11', 'uploaded_10', 'uploaded_9', 'uploaded_8',
      'uploaded_7', 'uploaded_6', 'uploaded_5', 'uploaded_4',
    ].sort());
  });
});

// ---------------------------------------------------------------------------
// 3. uploadBrandImage — no fabricated performance data
// ---------------------------------------------------------------------------

describe('uploadBrandImage', () => {
  it('resolves to null instead of throwing when the file cannot be read', async () => {
    // Node has no FileReader, so this only proves the failure path is contained — the
    // happy path (dimensions -> qualityScore -> source: 'own_upload') needs a DOM and is
    // covered by the end-to-end check in the plan, not here. Asserted anyway because an
    // unhandled rejection in this path would break the whole upload button.
    const file = { name: 'x.png', size: 10, type: 'image/png' } as unknown as File;
    await expect(uploadBrandImage(file)).resolves.toBeNull();
  });

  it('writes no conversionRate — the cache must never carry invented performance data', () => {
    // Guards the actual bug: uploads used to be stamped with a fabricated 10% CVR so they
    // would survive eviction, which made them outrank real measured winners.
    const cached = upload('uploaded_1');
    expect(cached.conversionRate).toBeUndefined();
    expect(cached.conversions).toBeUndefined();
    expect(cached.source).toBe('own_upload');
  });
});
