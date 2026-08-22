// Near-duplicate detection between generated creatives and the external references that
// inspired them.
//
// Pure scoring only — no embedding calls, no storage. That keeps the threshold logic testable
// in the node environment, which matters because the threshold is the part most likely to be
// wrong.
//
// SCOPE, stated plainly: this is a WARNING, not a gate. It never blocks a publish. Its job is
// to put a side-by-side comparison in front of someone before a close derivative of a
// competitor's creative goes live under their brand.

import { cosineSimilarity } from '../services/embeddingService';

/**
 * Cosine similarity above which a generated image is called a near-duplicate of a reference.
 *
 * UNCALIBRATED. 0.92 on normalized 768-dim multimodal vectors is an estimate, not a measured
 * boundary, and it is deliberately in one exported place so it can be moved once production
 * data exists. Category conventions push legitimate similarity high — a white-background
 * product shot with one line of text is *literally* the construct this feature exists to
 * reproduce — so false positives here are structural, not incidental. That is the reason the
 * outcome is a dismissible notice rather than a block.
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.92;

export interface DuplicateReference {
  id: string;
  vector: number[];
  advertiser?: string;
  thumbnail?: string;
}

export interface DuplicateCandidate {
  /** Index in the caller's list, so a flag maps back to the exact ad being published. */
  index: number;
  vector: number[];
}

export interface DuplicateFlag {
  index: number;
  referenceId: string;
  advertiser?: string;
  referenceThumbnail?: string;
  similarity: number;
}

export interface DuplicateScanResult {
  flags: DuplicateFlag[];
  /**
   * Highest similarity observed for every candidate, flagged or not.
   *
   * Logged on every publish so the threshold can be calibrated against real data instead of
   * being guessed at twice.
   */
  maxSimilarityByIndex: Record<number, number>;
}

/**
 * Score each candidate against every reference and flag the closest match when it crosses the
 * threshold.
 *
 * Never throws. A creative-safety heuristic must not be able to break the publish path, so a
 * malformed vector yields no flag rather than an exception or a NaN comparison.
 */
export function scoreNearDuplicates(
  candidates: DuplicateCandidate[],
  references: DuplicateReference[],
  threshold: number = NEAR_DUPLICATE_THRESHOLD
): DuplicateScanResult {
  const flags: DuplicateFlag[] = [];
  const maxSimilarityByIndex: Record<number, number> = {};

  if (candidates.length === 0 || references.length === 0) {
    return { flags, maxSimilarityByIndex };
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate.vector) || candidate.vector.length === 0) continue;

    let best: { ref: DuplicateReference; similarity: number } | null = null;

    for (const ref of references) {
      // Mismatched dimensions mean the two vectors came from different models. Comparing them
      // would produce a meaningless number, so skip rather than emit a confident wrong answer.
      if (!Array.isArray(ref.vector) || ref.vector.length !== candidate.vector.length) continue;

      const similarity = cosineSimilarity(candidate.vector, ref.vector);
      if (!Number.isFinite(similarity)) continue;

      if (!best || similarity > best.similarity) best = { ref, similarity };
    }

    if (!best) continue;
    maxSimilarityByIndex[candidate.index] = best.similarity;

    if (best.similarity >= threshold) {
      flags.push({
        index: candidate.index,
        referenceId: best.ref.id,
        advertiser: best.ref.advertiser,
        referenceThumbnail: best.ref.thumbnail,
        similarity: best.similarity,
      });
    }
  }

  // Closest match first — that is the one worth looking at.
  flags.sort((a, b) => b.similarity - a.similarity);
  return { flags, maxSimilarityByIndex };
}

/** Human-readable percentage for the warning notice. */
export function formatSimilarity(similarity: number): string {
  return `${Math.round(similarity * 100)}%`;
}
