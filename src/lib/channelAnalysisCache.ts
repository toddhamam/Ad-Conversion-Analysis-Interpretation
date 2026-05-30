// Shared channel analysis cache helpers.
// Consolidates getCachedAnalysis / setCachedAnalysis from Insights.tsx and AdGenerator.tsx
// and adds cross-account import functionality.

import { getScopedItem, setScopedItem, removeScopedItem } from './scopedStorage';
import type { ChannelAnalysisResult } from '../services/openaiApi';
import type { AdAccountInfo } from '../services/metaApi';

export type Channel = 'meta' | 'google' | 'tiktok' | 'email';

const CACHE_KEY = 'channel_analysis_cache';

export interface ImportMetadata {
  adAccountId: string;
  adAccountName: string;
  importedAt: string;
  sourceBusinessType: string;
  source?: 'account' | 'manual'; // 'account' = imported from another account; 'manual' = cold-start seed
}

export interface AvailableImport {
  account: AdAccountInfo;
  analysis: ChannelAnalysisResult;
  businessType: string;
}

// ---------------------------------------------------------------------------
// Core cache read/write (replaces duplicated functions in Insights + AdGenerator)
// ---------------------------------------------------------------------------

export function getCachedAnalysis(channel: Channel, businessType: string): ChannelAnalysisResult | null {
  try {
    const cache = getScopedItem(CACHE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      if (parsed._businessType && parsed._businessType !== businessType) {
        return null;
      }
      return parsed[channel] || null;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

export function setCachedAnalysis(channel: Channel, analysis: ChannelAnalysisResult, businessType: string): void {
  try {
    const cache = getScopedItem(CACHE_KEY);
    const parsed = cache ? JSON.parse(cache) : {};
    parsed[channel] = analysis;
    parsed._businessType = businessType;
    setScopedItem(CACHE_KEY, JSON.stringify(parsed));
    // Invalidate reference image fetch marker so AdGenerator re-fetches on next visit
    removeScopedItem('ci_ref_fetch_marker');
  } catch {
    // Ignore cache errors
  }
}

// ---------------------------------------------------------------------------
// Import provenance — per-channel metadata
// ---------------------------------------------------------------------------

export function getImportMetadata(channel: Channel): ImportMetadata | null {
  try {
    const cache = getScopedItem(CACHE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      return parsed[`_importedFrom_${channel}`] || null;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

export function clearImportMetadata(channel: Channel): void {
  try {
    const cache = getScopedItem(CACHE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      delete parsed[`_importedFrom_${channel}`];
      setScopedItem(CACHE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Ignore cache errors
  }
}

// ---------------------------------------------------------------------------
// Cross-account import
// ---------------------------------------------------------------------------

/**
 * Scan other activated accounts' localStorage for available channel analyses.
 * Only works for accounts whose analysis was generated in this browser.
 */
export function getAvailableImports(
  accounts: AdAccountInfo[],
  currentAccountId: string | null,
  channel: Channel,
): AvailableImport[] {
  const results: AvailableImport[] = [];

  for (const account of accounts) {
    if (account.ad_account_id === currentAccountId) continue;

    // Read directly from the other account's scoped localStorage key
    const key = `${CACHE_KEY}_${account.ad_account_id}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const analysis = parsed[channel] as ChannelAnalysisResult | undefined;
      if (!analysis) continue;
      results.push({
        account,
        analysis,
        businessType: parsed._businessType || 'ecommerce',
      });
    } catch {
      // Skip corrupted entries
    }
  }

  // Note: we intentionally skip the unscoped `channel_analysis_cache` key.
  // That key is legacy single-account data. migrateToScoped() already copies it
  // to the first activated account's scoped key. Attributing unscoped data to
  // an arbitrary account would produce phantom imports with wrong provenance.

  return results;
}

/**
 * Write an analysis into the current account's cache with per-channel import provenance, preserving
 * other channels. Shared by importAnalysis (cross-account) and setManualAnalysis (cold-start seed) —
 * the only thing that differs between them is the provenance they pass. Returns true on a verified write.
 */
function writeAnalysisWithProvenance(
  channel: Channel,
  analysis: ChannelAnalysisResult,
  businessType: string,
  provenance: ImportMetadata,
): boolean {
  try {
    // Read current account's cache (preserve other channels)
    const currentRaw = getScopedItem(CACHE_KEY);
    const currentParsed = currentRaw ? JSON.parse(currentRaw) : {};

    currentParsed[channel] = analysis;
    currentParsed._businessType = businessType;
    currentParsed[`_importedFrom_${channel}`] = provenance;

    // setScopedItem handles quota retry internally; verify the write landed
    const serialized = JSON.stringify(currentParsed);
    setScopedItem(CACHE_KEY, serialized);
    return getScopedItem(CACHE_KEY) === serialized;
  } catch {
    return false;
  }
}

/**
 * Import a channel analysis from another account into the current account's cache.
 * Writes the target's businessType so the analysis isn't invalidated.
 * Returns true on success, false if source data not found or write fails.
 */
export function importAnalysis(
  channel: Channel,
  sourceAccountId: string,
  accounts: AdAccountInfo[],
  targetBusinessType: string,
): boolean {
  try {
    // Read source account's scoped analysis only (no unscoped fallback —
    // legacy data is migrated to scoped keys by AdAccountContext)
    const sourceKey = `${CACHE_KEY}_${sourceAccountId}`;
    const sourceRaw = localStorage.getItem(sourceKey);
    if (!sourceRaw) return false;

    const sourceParsed = JSON.parse(sourceRaw);
    const analysis = sourceParsed[channel] as ChannelAnalysisResult | undefined;
    if (!analysis) return false;

    const sourceBusinessType = sourceParsed._businessType || 'ecommerce';
    const sourceAccount = accounts.find(a => a.ad_account_id === sourceAccountId);

    return writeAnalysisWithProvenance(channel, analysis, targetBusinessType, {
      adAccountId: sourceAccountId,
      adAccountName: sourceAccount?.ad_account_name || sourceAccountId,
      importedAt: new Date().toISOString(),
      sourceBusinessType,
      source: 'account',
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Manual analysis (cold-start seed)
// ---------------------------------------------------------------------------

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
 * Coerce a loosely-shaped object into a fully-valid ChannelAnalysisResult. The input may come from
 * `distillManualAnalysis` (our own distill of a brand brief) OR from a ConversionIQ analysis the user
 * generated in another repo using MANUAL_ANALYSIS_PROMPT_TEMPLATE and pasted in — so shapes vary.
 *
 * Every required field is defaulted so downstream readers (buildAnalysisContextString,
 * ChannelInsightsPanel) can never hit `undefined`. Measured-only fields (axisInsights, creativeFatigue,
 * visualClusters, bottomAds, headlineImageAnalysis) are left empty — a manual seed has no live ad data.
 * This function never throws on missing/oddly-typed input.
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

  const result: ChannelAnalysisResult = {
    channelName: asString(r.channelName, 'Meta'),
    analyzedAt: asString(r.analyzedAt, new Date().toISOString()),

    executiveSummary: asString(r.executiveSummary),
    overallHealthScore: asNumber(r.overallHealthScore, 5),

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
 * Persist a manually-supplied (cold-start) analysis to the current account's cache, tagged with
 * `source: 'manual'` provenance so the UI shows a seed banner and native analysis cleanly replaces it
 * later (see clearImportMetadata on a native run). Mirrors importAnalysis' write+verify pattern.
 * Returns true on a verified write, false otherwise.
 */
export function setManualAnalysis(
  channel: Channel,
  analysis: ChannelAnalysisResult,
  businessType: string,
): boolean {
  return writeAnalysisWithProvenance(channel, analysis, businessType, {
    adAccountId: '',
    adAccountName: 'Manual seed',
    importedAt: new Date().toISOString(),
    sourceBusinessType: businessType,
    source: 'manual',
  });
}
