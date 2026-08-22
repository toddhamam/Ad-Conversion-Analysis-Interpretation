import { describe, it, expect } from 'vitest';
import {
  scoreNearDuplicates,
  formatSimilarity,
  NEAR_DUPLICATE_THRESHOLD,
  type DuplicateReference,
} from './nearDuplicate';

// cosineSimilarity is a plain dot product that assumes pre-normalized vectors, so these
// fixtures are unit vectors.
const A = [1, 0, 0];
const B = [0, 1, 0];
/** ~0.94 with A — above the 0.92 threshold. */
const NEAR_A = [0.94, Math.sqrt(1 - 0.94 * 0.94), 0];
/** ~0.80 with A — below it. */
const FAR_A = [0.8, 0.6, 0];

function ref(id: string, vector: number[], extra: Partial<DuplicateReference> = {}): DuplicateReference {
  return { id, vector, ...extra };
}

describe('scoreNearDuplicates', () => {
  it('flags an identical creative', () => {
    const { flags } = scoreNearDuplicates([{ index: 0, vector: A }], [ref('r1', A)]);

    expect(flags).toHaveLength(1);
    expect(flags[0].index).toBe(0);
    expect(flags[0].referenceId).toBe('r1');
    expect(flags[0].similarity).toBeCloseTo(1);
  });

  it('does not flag an unrelated creative', () => {
    expect(scoreNearDuplicates([{ index: 0, vector: A }], [ref('r1', B)]).flags).toEqual([]);
  });

  it('flags above the threshold and not below it', () => {
    expect(scoreNearDuplicates([{ index: 0, vector: NEAR_A }], [ref('r1', A)]).flags).toHaveLength(1);
    expect(scoreNearDuplicates([{ index: 0, vector: FAR_A }], [ref('r1', A)]).flags).toEqual([]);
  });

  it('treats the threshold as inclusive', () => {
    // Documented explicitly so a later ">" vs ">=" change is a deliberate one.
    const exact = [NEAR_DUPLICATE_THRESHOLD, Math.sqrt(1 - NEAR_DUPLICATE_THRESHOLD ** 2), 0];
    expect(scoreNearDuplicates([{ index: 0, vector: exact }], [ref('r1', A)]).flags).toHaveLength(1);
  });

  it('reports the closest reference when several match', () => {
    const { flags } = scoreNearDuplicates(
      [{ index: 0, vector: A }],
      [ref('far', NEAR_A), ref('exact', A)]
    );

    expect(flags).toHaveLength(1);
    expect(flags[0].referenceId).toBe('exact');
  });

  it('orders flags with the closest match first', () => {
    const { flags } = scoreNearDuplicates(
      [{ index: 0, vector: NEAR_A }, { index: 1, vector: A }],
      [ref('r1', A)]
    );

    expect(flags.map(f => f.index)).toEqual([1, 0]);
  });

  it('carries the advertiser and thumbnail through for the notice', () => {
    const { flags } = scoreNearDuplicates(
      [{ index: 0, vector: A }],
      [ref('r1', A, { advertiser: 'Acme Supplements', thumbnail: 'AAAA' })]
    );

    expect(flags[0].advertiser).toBe('Acme Supplements');
    expect(flags[0].referenceThumbnail).toBe('AAAA');
  });
});

// ---------------------------------------------------------------------------
// Calibration data — the reason the scan returns more than a boolean
// ---------------------------------------------------------------------------

describe('maxSimilarityByIndex', () => {
  it('records the best score for every candidate, flagged or not', () => {
    // The threshold is an estimate. Logging unflagged scores is the only way to calibrate it
    // against what real generations actually produce.
    const { maxSimilarityByIndex } = scoreNearDuplicates(
      [{ index: 0, vector: A }, { index: 1, vector: FAR_A }],
      [ref('r1', A)]
    );

    expect(maxSimilarityByIndex[0]).toBeCloseTo(1);
    expect(maxSimilarityByIndex[1]).toBeCloseTo(0.8);
  });
});

// ---------------------------------------------------------------------------
// Degradation — a safety heuristic must never break the publish path
// ---------------------------------------------------------------------------

describe('degradation', () => {
  it('returns no flags for an empty reference set', () => {
    const result = scoreNearDuplicates([{ index: 0, vector: A }], []);
    expect(result.flags).toEqual([]);
    expect(result.maxSimilarityByIndex).toEqual({});
  });

  it('returns no flags for an empty candidate set', () => {
    expect(scoreNearDuplicates([], [ref('r1', A)]).flags).toEqual([]);
  });

  it('skips mismatched vector lengths instead of producing NaN', () => {
    // Different lengths mean different embedding models. Comparing them yields a meaningless
    // number, and a confident wrong answer is worse than no answer.
    const result = scoreNearDuplicates([{ index: 0, vector: [1, 0, 0, 0] }], [ref('r1', A)]);

    expect(result.flags).toEqual([]);
    expect(result.maxSimilarityByIndex[0]).toBeUndefined();
  });

  it('skips empty and malformed vectors without throwing', () => {
    expect(() => scoreNearDuplicates(
      [{ index: 0, vector: [] }, { index: 1, vector: null as unknown as number[] }],
      [ref('r1', A), ref('r2', undefined as unknown as number[])]
    )).not.toThrow();
  });
});

describe('formatSimilarity', () => {
  it('renders a whole percentage', () => {
    expect(formatSimilarity(0.9234)).toBe('92%');
    expect(formatSimilarity(1)).toBe('100%');
  });
});
