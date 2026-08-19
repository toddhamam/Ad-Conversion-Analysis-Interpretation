// Analysis mode model for ConversionIQ™ channel analysis.
//
// A channel analysis can be produced three ways, and downstream generation needs to know which:
//
//   observed — live ad data, no manual seed. The original behaviour.
//   seeded   — no ad history, a manual seed is present. Interpretation runs on the seed alone.
//   hybrid   — both. Observed data is authoritative for anything about what PERFORMS; the seed
//              stays authoritative for voice, banned vocabulary and claim guardrails. Those answer
//              different questions, so neither has to lose.
//
// `analysisMode` is the ONE fact persisted on the record. Everything a consumer needs — section
// titles, evidence labelling, whether a health score applies — is derived from it at the point of
// use (see MODE_PROMPT in services/analysisContext.ts and MODE_COPY in ChannelInsightsPanel).
// Storing derived evidence alongside it would be two sources of truth for one fact.
//
// Everything here is a PURE function over ChannelAnalysisResult — no storage, no network, no React.
// Persistence lives in channelAnalysisCache.ts, orchestration in pages/Insights.tsx.

import type { ChannelAnalysisResult } from '../services/openaiApi';

export type AnalysisMode = 'observed' | 'seeded' | 'hybrid';

/**
 * How much weight a claim carries. Surfaced to generation as literal text in the prompt (see
 * MODE_PROMPT) so the model can tell a proven pattern from an untested assumption.
 *   MEASURED   — computed from this account's own delivery data.
 *   VALIDATED  — asserted by the operator in the seed (brand voice, compliance guardrails).
 *   HYPOTHESIS — a reasoned guess with no delivery data behind it. Never present as a winner.
 */
export type EvidenceLevel = 'MEASURED' | 'VALIDATED' | 'HYPOTHESIS';

/** Voice block shape, reused from the analysis result so the two can never drift. */
export type BrandVoiceBlock = NonNullable<ChannelAnalysisResult['brandVoice']>;

/**
 * The parts of a manual seed that stay authoritative even once real ad data exists.
 * These are constraints on HOW to say things, not claims about what performs — which is exactly
 * why a hybrid run can keep them without contradicting the observed data.
 */
export interface SeedConstraints {
  /** Operator-asserted voice. In hybrid this outranks the voice extracted from winners. */
  brandVoice?: BrandVoiceBlock;
  /** Words/phrasings the seed says never to use. */
  bannedVocabulary: string[];
  /** Claims the seed forbids, qualifies, or requires care with (compliance). */
  claimGuardrails: string[];
  /** Headline shapes the seed says fall flat for this audience. */
  avoidHeadlinePatterns: string[];
  /** The seed's angle bank — forward-looking, untested. Never rendered as "what's working". */
  hypothesisedAngles: string[];
  /** When the seed was authored/ingested. */
  seededAt: string;
}

/** What a run should do, once we know whether ads and a seed exist. */
export type AnalysisRunPlan =
  | { mode: 'observed' }
  | { mode: 'seeded'; seed: ChannelAnalysisResult }
  | { mode: 'hybrid'; seed: ChannelAnalysisResult }
  /** Neither ad data nor a seed — the only state where "no ads found" is accurate. */
  | { mode: 'none' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arr(v: string[] | undefined | null): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim().length > 0) : [];
}

/** Union two string lists, first-wins, case-insensitive dedupe, order preserved. */
function unionLists(first: string[] | undefined, second: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...arr(first), ...arr(second)]) {
    const key = item.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Decide what a run should produce. Carrying the seed in the plan means callers get it already
 * narrowed — no re-checking `seed` alongside the mode to satisfy the type system.
 */
export function planAnalysisRun(input: {
  hasAds: boolean;
  seed: ChannelAnalysisResult | null;
}): AnalysisRunPlan {
  const { hasAds, seed } = input;
  if (hasAds) return seed ? { mode: 'hybrid', seed } : { mode: 'observed' };
  return seed ? { mode: 'seeded', seed } : { mode: 'none' };
}

/** Mode of an already-persisted record. Records written before modes existed are observed. */
export function analysisModeOf(analysis: ChannelAnalysisResult | null | undefined): AnalysisMode {
  return analysis?.analysisMode ?? 'observed';
}

/** True when this record has no delivery data behind its numbers. */
export function isSeeded(analysis: ChannelAnalysisResult | null | undefined): boolean {
  return analysisModeOf(analysis) === 'seeded';
}

// ---------------------------------------------------------------------------
// Seed constraints
// ---------------------------------------------------------------------------

/**
 * Pull the durable constraints out of a seed. A seed that explicitly carries `seedConstraints`
 * (pasted from a richer ConversionIQ profile) wins; otherwise we derive them from the fields the
 * seed template does produce, so an older seed still contributes its guardrails.
 */
export function extractSeedConstraints(seed: ChannelAnalysisResult): SeedConstraints {
  const explicit = seed.seedConstraints;
  return {
    brandVoice: explicit?.brandVoice ?? seed.brandVoice,
    bannedVocabulary: unionLists(explicit?.bannedVocabulary, seed.losingPatterns?.copyElements),
    claimGuardrails: unionLists(
      explicit?.claimGuardrails,
      unionLists(seed.losingPatterns?.issues, seed.audienceInsights?.whatDoesntWork),
    ),
    avoidHeadlinePatterns: unionLists(explicit?.avoidHeadlinePatterns, seed.losingPatterns?.headlines),
    hypothesisedAngles: unionLists(
      explicit?.hypothesisedAngles,
      unionLists(seed.winningPatterns?.headlines, seed.recommendations?.creativeDirection),
    ),
    seededAt: explicit?.seededAt || seed.analyzedAt || '',
  };
}

// ---------------------------------------------------------------------------
// Mode builders — every one returns a full ChannelAnalysisResult
// ---------------------------------------------------------------------------

/**
 * Tag a freshly-computed observed analysis. Purely additive: every pre-existing field is passed
 * through untouched, so observed output is unchanged apart from the mode marker.
 */
export function buildObservedAnalysis(observed: ChannelAnalysisResult): ChannelAnalysisResult {
  return { ...observed, analysisMode: 'observed' };
}

/**
 * Materialize a seed into a seeded-mode analysis.
 *
 * Emits the SAME object shape as an observed run — every field a consumer reads is present. Where
 * a field would hold observed performance, it holds an empty collection, never `undefined`, so no
 * downstream consumer needs a null check it doesn't already have.
 *
 * No health score: scoring an account with zero delivery data measures the absence of data, not
 * the quality of anything, and would steer generation toward "repair your account" when the right
 * move is "ship the first campaign".
 */
export function buildSeededAnalysis(
  seed: ChannelAnalysisResult,
  opts?: { now?: string; channelName?: string },
): ChannelAnalysisResult {
  return {
    ...seed,
    channelName: opts?.channelName || seed.channelName || 'Meta',
    analyzedAt: opts?.now || new Date().toISOString(),
    analysisMode: 'seeded',

    // No delivery data yet — explicitly not applicable rather than a fabricated middling score.
    overallHealthScore: null,

    performanceBreakdown: {
      totalAdsAnalyzed: 0,
      highPerformers: 0,
      midPerformers: 0,
      lowPerformers: 0,
      avgConversionRate: 0,
      avgCostPerConversion: 0,
      totalSpend: 0,
      totalConversions: 0,
    },

    // Measured-only collections stay empty rather than absent.
    headlineImageAnalysis: [],
    bottomAds: [],
    axisInsights: undefined,
    creativeFatigue: undefined,
    visualClusters: undefined,

    seedConstraints: extractSeedConstraints(seed),
  };
}

/**
 * Strip a seed's contribution back out of an analysis, for when the operator removes the seed.
 *
 * Returns `null` when the record has nothing left without the seed (a seeded analysis IS the seed),
 * signalling the caller to drop it entirely. For a hybrid record the measured half is kept and the
 * seed's half is reversed: the voice extracted from winners is restored to the authoritative slot
 * and the constraints are dropped, so generation stops applying them immediately rather than at the
 * next run.
 *
 * One residue is deliberately accepted: the seed's entries in the unioned "avoid" lists stay, since
 * the pre-merge observed lists aren't retained. They are additive guardrails rather than claims
 * about what performs, so leaving them is safe, and the next observed run clears them.
 */
export function unapplySeed(analysis: ChannelAnalysisResult): ChannelAnalysisResult | null {
  if (analysisModeOf(analysis) === 'seeded') return null;
  if (analysisModeOf(analysis) === 'observed') return analysis;
  return {
    ...analysis,
    analysisMode: 'observed',
    brandVoice: analysis.observedBrandVoice ?? analysis.brandVoice,
    observedBrandVoice: undefined,
    seedConstraints: undefined,
  };
}

/**
 * Merge a fresh observed analysis with an existing seed.
 *
 * Split of authority:
 *   observed → anything about what PERFORMS (performance breakdown, winning patterns, top ads,
 *              visual analysis, health score, axis/fatigue/cluster attribution)
 *   seed     → how the brand SOUNDS and what it may not say (voice, banned vocabulary, claim
 *              guardrails, headline shapes to avoid)
 *
 * The seed's voice becomes the authoritative `brandVoice`; the voice extracted from winners is
 * preserved under `observedBrandVoice` as supporting evidence rather than being discarded.
 * "Avoid" lists are unioned — a constraint the seed asserts is never dropped because the observed
 * run didn't independently rediscover it.
 */
export function mergeHybridAnalysis(
  observed: ChannelAnalysisResult,
  seed: ChannelAnalysisResult,
): ChannelAnalysisResult {
  const constraints = extractSeedConstraints(seed);
  const seedVoice = constraints.brandVoice;

  return {
    ...observed,
    analysisMode: 'hybrid',

    // Seed voice outranks the extracted one; the extracted one survives as reference.
    brandVoice: seedVoice ?? observed.brandVoice,
    observedBrandVoice: seedVoice ? observed.brandVoice : undefined,

    losingPatterns: {
      headlines: unionLists(observed.losingPatterns?.headlines, constraints.avoidHeadlinePatterns),
      copyElements: unionLists(observed.losingPatterns?.copyElements, constraints.bannedVocabulary),
      issues: unionLists(observed.losingPatterns?.issues, constraints.claimGuardrails),
      visualIssues: unionLists(observed.losingPatterns?.visualIssues, seed.losingPatterns?.visualIssues),
    },

    audienceInsights: {
      ...observed.audienceInsights,
      whatDoesntWork: unionLists(
        observed.audienceInsights?.whatDoesntWork,
        seed.audienceInsights?.whatDoesntWork,
      ),
    },

    seedConstraints: constraints,
  };
}
