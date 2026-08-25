// Save planning for the Showcase Library.
//
// The non-obvious part is that the request budget counts IMAGES, not rows: a before/after row
// is two payloads, so three of them overflow a four-image budget even though three rows sit
// comfortably inside a forty-row library. Getting this wrong doesn't fail loudly — it sends a
// body over Vercel's ~4.5MB limit, which fails at the platform level before the handler runs.
import { describe, it, expect } from 'vitest';
import { planShowcaseSave, MAX_SHOWCASE_ASSETS, MAX_IMAGES_PER_SAVE } from './showcase-handlers';

/** n items, each carrying a before (so 2 images apiece). */
const pairs = (n: number) => Array.from({ length: n }, () => ({ before_image_data: 'BEFORE' }));
/** n items with a hero only (1 image apiece). */
const heroes = (n: number) => Array.from({ length: n }, () => ({}));

describe('planShowcaseSave — image budget', () => {
  it('counts a before/after row as two images', () => {
    // 3 pairs = 6 images against a 4-image budget. Rows are not the constraint here.
    const plan = planShowcaseSave(0, pairs(3), MAX_SHOWCASE_ASSETS, 4);

    expect(plan.acceptedCount).toBe(2);
    expect(plan.skippedForRequestSize).toBe(1);
    expect(plan.skippedForSpace).toBe(0);
  });

  it('fits twice as many hero-only rows in the same budget', () => {
    const plan = planShowcaseSave(0, heroes(4), MAX_SHOWCASE_ASSETS, 4);

    expect(plan.acceptedCount).toBe(4);
    expect(plan.skippedForRequestSize).toBe(0);
  });

  it('handles a mixed batch by cost, not by position', () => {
    // hero(1) + pair(2) + hero(1) = 4 images exactly.
    const mixed = [{}, { before_image_data: 'B' }, {}];
    expect(planShowcaseSave(0, mixed, MAX_SHOWCASE_ASSETS, 4).acceptedCount).toBe(3);
    // Same three items against a 3-image budget: the third no longer fits.
    expect(planShowcaseSave(0, mixed, MAX_SHOWCASE_ASSETS, 3).acceptedCount).toBe(2);
  });

  it('always accepts one item, so a pair is never deadlocked by a smaller budget', () => {
    // Without the forward-progress guarantee a 1-image budget would accept nothing forever
    // and the operator could never save a before/after at all.
    const plan = planShowcaseSave(0, pairs(2), MAX_SHOWCASE_ASSETS, 1);

    expect(plan.acceptedCount).toBe(1);
    expect(plan.skippedForRequestSize).toBe(1);
  });
});

describe('planShowcaseSave — library capacity', () => {
  it('trims to the remaining room rather than rejecting the batch', () => {
    // The Inspiration Library's rule: saving two of three is more useful than refusing three.
    const plan = planShowcaseSave(MAX_SHOWCASE_ASSETS - 2, heroes(3));

    expect(plan.acceptedCount).toBe(2);
    expect(plan.skippedForSpace).toBe(1);
    expect(plan.skippedForRequestSize).toBe(0);
  });

  it('accepts nothing when the library is already full', () => {
    const plan = planShowcaseSave(MAX_SHOWCASE_ASSETS, heroes(2));

    expect(plan.acceptedCount).toBe(0);
    expect(plan.skippedForSpace).toBe(2);
  });

  it('treats an over-full library as full rather than going negative', () => {
    const plan = planShowcaseSave(MAX_SHOWCASE_ASSETS + 5, heroes(2));

    expect(plan.acceptedCount).toBe(0);
    expect(plan.skippedForSpace).toBe(2);
  });

  it('attributes the remainder to whichever limit actually stopped it', () => {
    // Row space is the binding limit here, not the image budget — the client shows a
    // "library is full" message for one and "send fewer at once" for the other.
    const plan = planShowcaseSave(MAX_SHOWCASE_ASSETS - 1, heroes(3), MAX_SHOWCASE_ASSETS, 99);

    expect(plan.acceptedCount).toBe(1);
    expect(plan.skippedForSpace).toBe(2);
    expect(plan.skippedForRequestSize).toBe(0);
  });
});

describe('planShowcaseSave — edges', () => {
  it('is empty for an empty batch', () => {
    expect(planShowcaseSave(0, [])).toEqual({
      acceptedCount: 0,
      skippedForSpace: 0,
      skippedForRequestSize: 0,
    });
  });

  it('accepts a full default batch of hero-only rows into an empty library', () => {
    const plan = planShowcaseSave(0, heroes(MAX_IMAGES_PER_SAVE));

    expect(plan.acceptedCount).toBe(MAX_IMAGES_PER_SAVE);
    expect(plan.skippedForSpace + plan.skippedForRequestSize).toBe(0);
  });
});
