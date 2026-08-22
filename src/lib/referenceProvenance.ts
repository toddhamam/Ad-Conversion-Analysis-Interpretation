// Provenance model for VISUAL style references — the sibling of `analysisMode.ts`, which does
// the same job for copy claims.
//
// THE ONE PERSISTED FACT IS `ReferenceSource`: where the pixels came from. Evidence level,
// prompt framing, UI badge, and whether performance numbers may be printed at all are DERIVED
// from it at the point of use. Do not add a parallel "evidence" field to any stored record —
// that would be two sources of truth for one fact, which is the exact mistake ADR #19 forbids.
//
// WHY THIS IS NOT A DUPLICATE OF `analysisMode`: the two describe different artefacts.
// `analysisMode` says how much authority a channel analysis's *copy findings* carry.
// `ReferenceSource` says how much authority a single *image* carries as a style exemplar.
// An account can have a fully observed channel analysis and still be generating against
// borrowed competitor visuals. Merging them would collapse two independent facts into one and
// make both wrong. They deliberately SHARE `EvidenceLevel` so there is one vocabulary, not two.

import type { EvidenceLevel } from './analysisMode';

/**
 * Where a style reference's pixels came from.
 *
 * - `own_winner`  — this account's own ad, with measured delivery data behind it.
 * - `own_upload`  — an operator-supplied brand asset. Real, but never delivered, so no metrics.
 * - `external`    — competitor / outside market material. Unproven for this account, always.
 */
export type ReferenceSource = 'own_winner' | 'own_upload' | 'external';

/**
 * How an external reference entered the library. DESCRIPTIVE PROVENANCE, NOT AN EVIDENCE AXIS —
 * it is displayed and audited, and it must never fork prompt wording. A screenshot of a
 * competitor ad and an Ad Library capture of the same ad carry identical epistemic weight;
 * only the longevity data attached to them differs.
 */
export type IngestLane = 'ad_library' | 'screenshot' | 'deck_upload' | 'url_import';

export const LANE_LABEL: Record<IngestLane, string> = {
  ad_library: 'Meta Ad Library',
  screenshot: 'screenshot',
  deck_upload: 'bulk upload',
  url_import: 'URL import',
};

/**
 * One image on its way into an image-generation request, with everything needed to describe it
 * honestly. The measured fields and the external fields are mutually exclusive in practice;
 * the prompt table is what enforces that only the applicable ones are ever printed.
 */
export interface StyleReference {
  id: string;
  source: ReferenceSource;
  data: string;              // base64, no `data:` prefix
  mimeType: string;
  qualityScore?: number;

  // own_winner only — MEASURED
  conversions?: number;
  conversionRate?: number;

  // external only — longevity is the sole proof signal available
  advertiser?: string;
  daysRunning?: number;
  firstSeenAt?: string;
  sourceUrl?: string;
  lane?: IngestLane;
}

/** Derived, never stored. */
export function evidenceOf(source: ReferenceSource): EvidenceLevel {
  switch (source) {
    case 'own_winner':
      return 'MEASURED';
    case 'own_upload':
      return 'VALIDATED';
    case 'external':
      return 'HYPOTHESIS';
  }
}

/**
 * Legacy default. Cache entries written before `source` existed are all account ads, so
 * `own_winner` is the honest fallback — same idiom as `analysisModeOf`'s "records written
 * before modes existed are observed".
 */
export function referenceSourceOf(record: { source?: string } | null | undefined): ReferenceSource {
  const s = record?.source;
  return s === 'own_upload' || s === 'external' ? s : 'own_winner';
}

/** Only `own_winner` may have performance numbers printed about it. */
export function isMeasured(source: ReferenceSource): boolean {
  return source === 'own_winner';
}

// ---------------------------------------------------------------------------
// Prompt vocabulary
// ---------------------------------------------------------------------------

/** Flags computed once across the whole set, so the leader labels are stable. */
export interface ReferenceRankFlags {
  highestConv: boolean;
  highestCVR: boolean;
}

export interface ReferencePrompt {
  evidence: EvidenceLevel;
  /**
   * Block header for this source's context section. `null` for `own_winner`: the image
   * engines already own that header (and they word it differently from each other), and
   * leaving it alone is what keeps the observed path byte-identical.
   */
  blockHeader: string | null;
  /** Framing paragraph stating what this class of reference does and does not prove. */
  blockPreamble: string[];
  /** One line per reference inside the block. */
  line(ref: StyleReference, index: number, flags: ReferenceRankFlags): string;
  /** Text part written immediately before the inline image in the request. */
  inlineLabel(index: number, total: number, ref: StyleReference): string;
}

const OWN_WINNER_PROMPT: ReferencePrompt = {
  evidence: 'MEASURED',
  blockHeader: null,
  blockPreamble: [],
  // BYTE-IDENTICAL to the pre-provenance implementation. Changing a character here changes
  // every existing customer's prompt; referenceProvenance.test.ts asserts these exactly.
  line(ref, index, flags) {
    const conv = ref.conversions ?? 0;
    const cvr = ref.conversionRate ?? 0;
    const labels: string[] = [];
    if (flags.highestConv) labels.push('HIGHEST CONVERTING');
    if (flags.highestCVR) labels.push('HIGHEST CVR');
    const label = labels.length > 0 ? ` — ${labels.join(', ')}` : '';
    return `STYLE REFERENCE ${index + 1}: ${conv} conversion${conv !== 1 ? 's' : ''} (${cvr.toFixed(1)}% CVR)${label}`;
  },
  inlineLabel(index, total) {
    return `[STYLE REFERENCE ${index + 1} of ${total}] A high-converting ad. Emulate its visual style for the scene only. Do NOT copy its product, text, or subject.`;
  },
};

const OWN_UPLOAD_PROMPT: ReferencePrompt = {
  evidence: 'VALIDATED',
  blockHeader: 'BRAND REFERENCE ASSETS (operator-supplied, no delivery data):',
  blockPreamble: [
    'These are brand assets the operator supplied directly. They are authoritative for what the',
    'brand looks like, but they have never run as ads — they prove nothing about what converts.',
  ],
  line(_ref, index) {
    return `BRAND REFERENCE ${index + 1}: uploaded brand asset — no conversion data`;
  },
  inlineLabel(index, total) {
    return `[BRAND REFERENCE ${index + 1} of ${total}] An operator-supplied brand asset. Emulate its visual style for the scene. It has no performance data — do not treat it as a proven winner.`;
  },
};

const EXTERNAL_PROMPT: ReferencePrompt = {
  evidence: 'HYPOTHESIS',
  blockHeader: 'EXTERNAL INSPIRATION REFERENCES — NOT PROVEN FOR THIS ACCOUNT:',
  blockPreamble: [
    'These are outside/competitor creatives. There is NO conversion data for them.',
    'The only proof signal available is longevity: an ad running a long time is likely profitable for',
    'its advertiser — not necessarily for us. Emulate the CONSTRUCTION (layout, crop, subject framing,',
    'type treatment, contrast, how the product is staged). Do NOT assume the angle, claim or offer works',
    'for us, and do NOT reproduce their product, brand marks, logos, faces or text.',
  ],
  line(ref, index) {
    const who = ref.advertiser || 'Unknown advertiser';
    // A missing duration must be stated, not omitted. Silence reads as "no longevity signal
    // was relevant"; the truth is "the one available proof signal is absent".
    const longevity =
      typeof ref.daysRunning === 'number'
        ? `running ${ref.daysRunning} days`
        : 'no longevity data available';
    const seen = ref.firstSeenAt ? ` (first seen ${ref.firstSeenAt.slice(0, 10)})` : '';
    const via = ref.lane ? `, captured via ${LANE_LABEL[ref.lane]}` : '';
    return `INSPIRATION ${index + 1}: ${who} — ${longevity}${seen}${via}`;
  },
  inlineLabel(index, total) {
    return `[INSPIRATION REFERENCE ${index + 1} of ${total}] An external ad with NO conversion data for this account. Longevity is the only proof signal. Emulate its CONSTRUCTION only — do NOT copy its product, text, subject, brand marks, or assume its angle works for us.`;
  },
};

export const REFERENCE_PROMPT: Record<ReferenceSource, ReferencePrompt> = {
  own_winner: OWN_WINNER_PROMPT,
  own_upload: OWN_UPLOAD_PROMPT,
  external: EXTERNAL_PROMPT,
};

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

const NO_FLAGS: ReferenceRankFlags = { highestConv: false, highestCVR: false };

/**
 * Rank flags for a set of own-account winners. Scans for the highest absolute conversion count
 * and the highest CVR independently, and never labels a zero — a "HIGHEST CONVERTING" tag on an
 * ad with 0 conversions would be a claim about nothing.
 *
 * Matches the pre-provenance scan in `buildRefConversionContext` exactly, including that the
 * HIGHEST CVR label is suppressed when it lands on the same reference as HIGHEST CONVERTING.
 */
export function rankFlagsFor(refs: StyleReference[]): ReferenceRankFlags[] {
  if (refs.length === 0) return [];

  let highestConvIdx = 0;
  let highestCVRIdx = 0;
  for (let i = 1; i < refs.length; i++) {
    if ((refs[i].conversions ?? 0) > (refs[highestConvIdx].conversions ?? 0)) highestConvIdx = i;
    if ((refs[i].conversionRate ?? 0) > (refs[highestCVRIdx].conversionRate ?? 0)) highestCVRIdx = i;
  }

  return refs.map((ref, i) => ({
    highestConv: i === highestConvIdx && (ref.conversions ?? 0) > 0,
    highestCVR:
      i === highestCVRIdx && (ref.conversionRate ?? 0) > 0 && highestCVRIdx !== highestConvIdx,
  }));
}

/**
 * The context block for one source class. Returns `[]` when there is nothing to say, so callers
 * can splat it unconditionally.
 *
 * `own_winner` returns bare lines with no header — the image engines print their own
 * "CONVERSION PERFORMANCE DATA" heading and word it differently per engine.
 */
export function buildReferenceBlock(source: ReferenceSource, refs: StyleReference[]): string[] {
  if (refs.length === 0) return [];

  const copy = REFERENCE_PROMPT[source];
  const flags = source === 'own_winner' ? rankFlagsFor(refs) : refs.map(() => NO_FLAGS);
  const lines = refs.map((ref, i) => copy.line(ref, i, flags[i]));

  if (!copy.blockHeader) return lines;
  return [copy.blockHeader, ...copy.blockPreamble, ...lines];
}

/**
 * Whether the request contains any reference the model may be told has PROVEN CONVERSIONS.
 *
 * The image engines used to gate that claim on total style-image count, which meant a
 * cold-start account generating purely from competitor screenshots was told its references
 * were proven winners. Gate on this instead.
 */
export function hasMeasuredReference(refs: StyleReference[]): boolean {
  return refs.some(r => isMeasured(r.source));
}

/** Split a mixed set into the order the request must present them: own → external. */
export function partitionBySource(refs: StyleReference[]): Record<ReferenceSource, StyleReference[]> {
  return {
    own_winner: refs.filter(r => r.source === 'own_winner'),
    own_upload: refs.filter(r => r.source === 'own_upload'),
    external: refs.filter(r => r.source === 'external'),
  };
}
