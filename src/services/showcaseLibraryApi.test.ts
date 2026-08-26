// Request chunking for the Showcase Library.
//
// A showcase row can carry two image payloads, so chunking by ROW count — what the Inspiration
// Library does — would put up to twice the intended bytes on the wire. At showcase resolution
// (1600px) that is the difference between a request that fits Vercel's ~4.5MB body limit and
// one that fails at the platform level with an opaque error before the handler runs.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/authToken', () => ({ getAuthToken: async () => 'test-session-token' }));

import { chunkByImageCount, imageCostOf, showcaseConfigFrom, type ShowcaseSources } from './showcaseLibraryApi';
import { emptyShowcaseDraft, type ShowcaseDraft } from '../lib/showcaseLayout';

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

// ---------------------------------------------------------------------------
// Config assembly — the sync half of the render pipeline, and what the live preview calls on
// every keystroke.
// ---------------------------------------------------------------------------

const sources = (over: Partial<ShowcaseSources> = {}): ShowcaseSources => ({
  template: 'client_grid',
  images: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
  captions: ['Acme Dental', 'Bell Roofing'],
  urlText: 'acmedental.com',
  device: 'laptop',
  clientName: 'Acme Dental',
  ...over,
});

const draft = (over: Partial<ShowcaseDraft> = {}): ShowcaseDraft => ({
  ...emptyShowcaseDraft('clean-orange'),
  ...over,
});

describe('showcaseConfigFrom', () => {
  it('labels cells only for a results wall', () => {
    // Handing captions to any other template would put a client's name on a panel that has no
    // band to draw it in.
    expect(showcaseConfigFrom(sources({ template: 'client_grid' }), draft()).labels?.captions)
      .toEqual(['Acme Dental', 'Bell Roofing']);

    for (const template of ['before_after_split', 'hero_browser', 'device_frame', 'as_is'] as const) {
      expect(showcaseConfigFrom(sources({ template }), draft()).labels?.captions, template)
        .toBeUndefined();
    }
  });

  it('takes the arrangement from the DRAFT and the pixels from the SOURCES', () => {
    // The split that lets the preview re-render without refetching: nothing in the draft can
    // change the images, and nothing in the sources can change the arrangement.
    const config = showcaseConfigFrom(
      sources({ template: 'hero_browser' }),
      draft({ size: '9:16', styleId: 'navy-gold', caption: 'Rebuilt in 3 weeks', chrome: 'none' }),
    );

    expect(config.size).toBe('9:16');
    expect(config.styleId).toBe('navy-gold');
    expect(config.caption).toBe('Rebuilt in 3 weeks');
    expect(config.chrome).toBe('none');
    expect(config.images).toHaveLength(2);
    expect(config.template).toBe('hero_browser');
  });

  it('carries the asset-derived facts through untouched', () => {
    // URL and device come from the LIBRARY, not the draft, so neither can go stale when the
    // operator edits an asset after making an ad from it.
    const config = showcaseConfigFrom(sources({ urlText: 'bell.co', device: 'phone' }), draft());

    expect(config.urlText).toBe('bell.co');
    expect(config.device).toBe('phone');
  });

  it('omits an empty caption rather than passing a blank string', () => {
    // An empty band would still occupy height and shrink the panels — planShowcase keys on
    // undefined, not on emptiness.
    expect(showcaseConfigFrom(sources(), draft({ caption: '' })).caption).toBeUndefined();
  });

  it('omits blank before/after labels so the template falls back to its defaults', () => {
    const config = showcaseConfigFrom(sources({ template: 'before_after_split' }), draft());
    expect(config.labels?.before).toBeUndefined();
    expect(config.labels?.after).toBeUndefined();
  });

  it('passes operator-supplied labels through', () => {
    const config = showcaseConfigFrom(
      sources({ template: 'before_after_split' }),
      draft({ beforeLabel: 'Their old site', afterLabel: 'What we built' }),
    );
    expect(config.labels?.before).toBe('Their old site');
    expect(config.labels?.after).toBe('What we built');
  });
});
