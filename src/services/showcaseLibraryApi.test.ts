// Request chunking for the Showcase Library.
//
// A showcase row can carry two image payloads, so chunking by ROW count — what the Inspiration
// Library does — would put up to twice the intended bytes on the wire. At showcase resolution
// (1600px) that is the difference between a request that fits Vercel's ~4.5MB body limit and
// one that fails at the platform level with an opaque error before the handler runs.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/authToken', () => ({ getAuthToken: async () => 'test-session-token' }));

import { chunkByImageCount, imageCostOf } from './showcaseLibraryApi';

// `before_image_data` is spelled out on both so the literals satisfy the parameter's weak
// type — an object with only optional properties needs at least one of them present.
const pair = (id: string) => ({ id, before_image_data: 'BEFORE' as string | undefined });
const hero = (id: string) => ({ id, before_image_data: undefined as string | undefined });

describe('imageCostOf', () => {
  it('charges a before/after row for two images and a hero-only row for one', () => {
    expect(imageCostOf(pair('a'))).toBe(2);
    expect(imageCostOf(hero('a'))).toBe(1);
    expect(imageCostOf({ before_image_data: undefined })).toBe(1);
  });
});

describe('chunkByImageCount', () => {
  it('splits on the image budget, not the row count', () => {
    // 3 pairs = 6 images. By rows this is one request; by images it is two.
    const chunks = chunkByImageCount([pair('a'), pair('b'), pair('c')], 4);

    expect(chunks.map(c => c.map(i => i.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('fits twice as many hero-only rows in the same budget', () => {
    const chunks = chunkByImageCount([hero('a'), hero('b'), hero('c'), hero('d')], 4);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(4);
  });

  it('packs a mixed batch by cost', () => {
    // hero(1) + pair(2) + hero(1) = exactly 4.
    const chunks = chunkByImageCount([hero('a'), pair('b'), hero('c')], 4);
    expect(chunks).toHaveLength(1);

    // Same items, budget of 3: the last hero rolls into a second request.
    expect(chunkByImageCount([hero('a'), pair('b'), hero('c')], 3).map(c => c.map(i => i.id)))
      .toEqual([['a', 'b'], ['c']]);
  });

  it('gives an oversized row its own chunk instead of dropping it or looping', () => {
    // A pair costs 2 against a budget of 1. It must still be sent — the server applies the
    // same forward-progress rule — rather than silently vanishing.
    const chunks = chunkByImageCount([pair('a'), pair('b')], 1);

    expect(chunks.map(c => c.map(i => i.id))).toEqual([['a'], ['b']]);
  });

  it('never emits an empty chunk', () => {
    for (const budget of [1, 2, 3, 4, 10]) {
      const chunks = chunkByImageCount([hero('a'), pair('b'), hero('c'), pair('d')], budget);
      expect(chunks.every(c => c.length > 0), `budget ${budget}`).toBe(true);
    }
  });

  it('preserves every item and their order', () => {
    const items = [hero('a'), pair('b'), hero('c'), pair('d'), hero('e')];
    const flat = chunkByImageCount(items, 3).flat().map(i => i.id);

    expect(flat).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is empty for an empty batch', () => {
    expect(chunkByImageCount([], 4)).toEqual([]);
  });
});
