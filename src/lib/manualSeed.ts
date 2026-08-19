// Manual seed parsing — loose, untrusted JSON in, a valid seeded ChannelAnalysisResult out.
//
// Input comes from two places and neither is under our control:
//   1. `distillManualAnalysis` — our own distill of a brand brief (LLM output, so shapes vary)
//   2. a ConversionIQ analysis the operator generated elsewhere with MANUAL_ANALYSIS_PROMPT_TEMPLATE
//      and pasted in
//
// This module owns coercion only. Storage lives in channelAnalysisCache.ts and the mode model in
// analysisMode.ts — keeping them apart is what stops the cache module from turning into a
// grab-bag of storage + parsing + provenance.

import type { ChannelAnalysisResult } from '../services/openaiApi';
import type { SeedConstraints } from './analysisMode';
import { buildSeededAnalysis } from './analysisMode';

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Coerce a loosely-shaped object into a fully-valid ChannelAnalysisResult.
 *
 * Every required field is defaulted so downstream readers (buildAnalysisContextString,
 * ChannelInsightsPanel) can never hit `undefined`. Measured-only fields (axisInsights,
 * creativeFatigue, visualClusters, bottomAds, headlineImageAnalysis) are left empty — a manual
 * seed has no live ad data. This function never throws on missing/oddly-typed input.
 */
export function normalizeManualAnalysis(raw: unknown): ChannelAnalysisResult {
  const r = asRecord(raw);
  const perf = asRecord(r.performanceBreakdown);
  const visual = asRecord(r.visualAnalysis);
  const winning = asRecord(r.winningPatterns);
  const losing = asRecord(r.losingPatterns);
  const audience = asRecord(r.audienceInsights);
  const recs = asRecord(r.recommendations);
  const voice = asRecord(r.brandVoice);

  // Durable constraints. Taken from an explicit `constraints` block when the seed supplies one;
  // otherwise extractSeedConstraints derives them from the seed's own "avoid" fields.
  const rawConstraints = asRecord(r.constraints ?? r.seedConstraints);
  const hasConstraints =
    !!rawConstraints.bannedVocabulary || !!rawConstraints.claimGuardrails || !!rawConstraints.avoidHeadlinePatterns;
  const seedConstraints: SeedConstraints | undefined = hasConstraints
    ? {
        bannedVocabulary: asStringArray(rawConstraints.bannedVocabulary),
        claimGuardrails: asStringArray(rawConstraints.claimGuardrails),
        avoidHeadlinePatterns: asStringArray(rawConstraints.avoidHeadlinePatterns),
        hypothesisedAngles: asStringArray(rawConstraints.hypothesisedAngles),
        seededAt: asString(r.analyzedAt, new Date().toISOString()),
      }
    : undefined;

  const result: ChannelAnalysisResult = {
    channelName: asString(r.channelName, 'Meta'),
    analyzedAt: asString(r.analyzedAt, new Date().toISOString()),

    ...(seedConstraints ? { seedConstraints } : {}),

    executiveSummary: asString(r.executiveSummary),
    // No delivery data means no score. A seed that supplies one is honoured only so a pasted
    // profile round-trips; seeded runs null it out regardless (see buildSeededAnalysis).
    overallHealthScore:
      typeof r.overallHealthScore === 'number' && Number.isFinite(r.overallHealthScore)
        ? r.overallHealthScore
        : null,

    performanceBreakdown: {
      totalAdsAnalyzed: asNumber(perf.totalAdsAnalyzed),
      highPerformers: asNumber(perf.highPerformers),
      midPerformers: asNumber(perf.midPerformers),
      lowPerformers: asNumber(perf.lowPerformers),
      avgConversionRate: asNumber(perf.avgConversionRate),
      avgCostPerConversion: asNumber(perf.avgCostPerConversion),
      totalSpend: asNumber(perf.totalSpend),
      totalConversions: asNumber(perf.totalConversions),
    },

    visualAnalysis: {
      winningVisualElements: asStringArray(visual.winningVisualElements),
      losingVisualElements: asStringArray(visual.losingVisualElements),
      colorPsychology: asString(visual.colorPsychology),
      imageryPatterns: asString(visual.imageryPatterns),
      inImageMessaging: asString(visual.inImageMessaging),
      psychologicalTriggers: asStringArray(visual.psychologicalTriggers),
    },

    headlineImageAnalysis: [],

    winningPatterns: {
      headlines: asStringArray(winning.headlines),
      copyElements: asStringArray(winning.copyElements),
      emotionalTriggers: asStringArray(winning.emotionalTriggers),
      callToActions: asStringArray(winning.callToActions),
      visualElements: asStringArray(winning.visualElements),
    },

    losingPatterns: {
      headlines: asStringArray(losing.headlines),
      copyElements: asStringArray(losing.copyElements),
      issues: asStringArray(losing.issues),
      visualIssues: asStringArray(losing.visualIssues),
    },

    audienceInsights: {
      whatResonates: asStringArray(audience.whatResonates),
      whatDoesntWork: asStringArray(audience.whatDoesntWork),
      targetingRecommendations: asStringArray(audience.targetingRecommendations),
      visualPreferences: asStringArray(audience.visualPreferences),
    },

    recommendations: {
      immediate: asStringArray(recs.immediate),
      shortTerm: asStringArray(recs.shortTerm),
      strategic: asStringArray(recs.strategic),
      creativeDirection: asStringArray(recs.creativeDirection),
    },

    topAds: Array.isArray(r.topAds)
      ? r.topAds.slice(0, 10).map((adRaw, i) => {
          const ad = asRecord(adRaw);
          return {
            id: asString(ad.id, `seed_${i + 1}`),
            headline: asString(ad.headline),
            bodyText: asString(ad.bodyText),
            conversionRate: asNumber(ad.conversionRate),
            whyItWorks: asString(ad.whyItWorks),
            imageAnalysis: asString(ad.imageAnalysis),
            psychologicalDrivers: asStringArray(ad.psychologicalDrivers),
          };
        })
      : [],

    bottomAds: [],
  };

  // brandVoice is optional — only attach when the seed provided something usable
  const distinctiveTraits = asStringArray(voice.distinctiveTraits);
  if (
    voice.tonality || voice.sentenceStyle || voice.pointOfView ||
    voice.vocabularyLevel || voice.rhythmAndCadence || distinctiveTraits.length
  ) {
    result.brandVoice = {
      tonality: asString(voice.tonality),
      sentenceStyle: asString(voice.sentenceStyle),
      pointOfView: asString(voice.pointOfView),
      vocabularyLevel: asString(voice.vocabularyLevel),
      rhythmAndCadence: asString(voice.rhythmAndCadence),
      distinctiveTraits,
    };
  }

  return result;
}

/**
 * The whole ingest path in one call: loose input → a seeded-mode analysis ready to persist and
 * render. Callers should not have to know that normalization and seeded-mode construction are two
 * steps.
 */
export function parseManualSeed(raw: unknown, opts?: { channelName?: string }): ChannelAnalysisResult {
  return buildSeededAnalysis(normalizeManualAnalysis(raw), opts);
}
