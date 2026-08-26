// The scaling rule, which decides whether a client's website is legible in the finished ad.
//
// Bounding the LONGEST edge starves the dimension that matters: a 1440x4200 full-page capture
// scaled to fit 1600 comes out 549px WIDE, unreadable at 1080px, and it spends that budget
// preserving height every showcase template then crops away. The showcase profile scales by
// WIDTH and trims the overflow instead. The reference profile must keep its old behaviour
// exactly, because changing it would alter what every existing inspiration item looks like to
// a vision model.
import { describe, it, expect } from 'vitest';
import { planNormalize } from './imageNormalize';

const REFERENCE = { maxWidth: 800, maxHeight: 800, trimOverflow: false };
const SHOWCASE = { maxWidth: 1600, maxHeight: 2600, trimOverflow: true };

/** The rule the reference profile used to implement directly. */
const legacyLongestEdge = (w: number, h: number, cap: number) => {
  const scale = Math.min(1, cap / Math.max(w, h));
  return { w: w * scale, h: h * scale };
};

const SHAPES: Array<[number, number, string]> = [
  [1440, 900, 'hero-section capture'],
  [1440, 2400, 'tall page'],
  [1440, 4200, 'full-page capture'],
  [2560, 1440, 'retina desktop'],
  [1080, 1080, 'square creative'],
  [600, 400, 'already small'],
];

describe('planNormalize — reference profile is byte-identical to the old rule', () => {
  it.each(SHAPES)('matches longest-edge scaling for %sx%s (%s)', (w, h) => {
    const plan = planNormalize({ width: w, height: h }, REFERENCE);
    const legacy = legacyLongestEdge(w, h, 800);

    expect(plan.outWidth).toBeCloseTo(legacy.w, 6);
    expect(plan.outHeight).toBeCloseTo(legacy.h, 6);
    // Never trims: a vision model reading a style reference wants the whole frame.
    expect(plan.srcHeight).toBe(h);
  });

  it('never upscales a small source', () => {
    const plan = planNormalize({ width: 600, height: 400 }, REFERENCE);
    expect(plan.outWidth).toBe(600);
    expect(plan.outHeight).toBe(400);
  });
});

describe('planNormalize — showcase profile preserves width', () => {
  it('keeps a full-page capture at full width instead of starving it', () => {
    // The bug this rule replaces: the old cap produced 549px of width here.
    const plan = planNormalize({ width: 1440, height: 4200 }, SHOWCASE);

    expect(plan.outWidth).toBe(1440);
    expect(legacyLongestEdge(1440, 4200, 1600).w).toBeCloseTo(548.6, 1);
  });

  it('trims the overflow height rather than scaling it away', () => {
    const plan = planNormalize({ width: 1440, height: 4200 }, SHOWCASE);

    expect(plan.outHeight).toBe(2600);
    // Reads only the top of the page — exactly what a top-anchored composite would show.
    expect(plan.srcHeight).toBeCloseTo(2600, 5);
    expect(plan.srcHeight).toBeLessThan(4200);
  });

  it('leaves a short page untrimmed', () => {
    const plan = planNormalize({ width: 1440, height: 900 }, SHOWCASE);

    expect(plan.srcHeight).toBe(900);
    expect(plan.outWidth).toBe(1440);
    expect(plan.outHeight).toBe(900);
  });

  it('scales an oversized width down and keeps the aspect', () => {
    const plan = planNormalize({ width: 3200, height: 2000 }, SHOWCASE);

    expect(plan.outWidth).toBe(1600);
    expect(plan.outHeight).toBeCloseTo(1000, 5);
    expect(plan.srcHeight).toBe(2000);
  });

  it('never upscales', () => {
    const plan = planNormalize({ width: 900, height: 600 }, SHOWCASE);
    expect(plan.outWidth).toBe(900);
    expect(plan.outHeight).toBe(600);
  });

  it('bounds the output for every shape, so payloads stay predictable', () => {
    for (const [w, h, label] of SHAPES) {
      const plan = planNormalize({ width: w, height: h }, SHOWCASE);
      expect(plan.outWidth, label).toBeLessThanOrEqual(1600);
      expect(plan.outHeight, label).toBeLessThanOrEqual(2600);
      expect(Number.isFinite(plan.srcHeight), label).toBe(true);
    }
  });

  it('gives a tall capture more than twice the width the old rule did', () => {
    for (const [w, h] of [[1440, 2400], [1440, 4200]] as const) {
      const now = planNormalize({ width: w, height: h }, SHOWCASE).outWidth;
      const before = legacyLongestEdge(w, h, 1600).w;
      expect(now).toBeGreaterThan(before);
    }
  });
});

describe('planNormalize — degenerate input', () => {
  it('returns zeroes rather than NaN', () => {
    for (const bad of [{ width: 0, height: 0 }, { width: 100, height: 0 }, { width: -5, height: 10 }]) {
      const plan = planNormalize(bad, SHOWCASE);
      expect(plan).toEqual({ srcHeight: 0, outWidth: 0, outHeight: 0 });
    }
  });
});
