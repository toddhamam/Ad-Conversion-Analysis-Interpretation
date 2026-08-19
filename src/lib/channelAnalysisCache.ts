// Shared channel analysis cache helpers.
// Consolidates getCachedAnalysis / setCachedAnalysis from Insights.tsx and AdGenerator.tsx
// and adds cross-account import functionality.

import { getScopedItem, setScopedItem, removeScopedItem } from './scopedStorage';
import type { ChannelAnalysisResult } from '../services/openaiApi';
import type { AdAccountInfo } from '../services/metaApi';

export type Channel = 'meta' | 'google' | 'tiktok' | 'email';

const CACHE_KEY = 'channel_analysis_cache';

/**
 * Per-channel key for the manual seed's own slot.
 *
 * The seed is stored SEPARATELY from the analysis it seeds. They used to share one slot, which
 * meant the first successful observed run overwrote the seed and its constraints were gone for
 * good. Keeping the seed in its own slot is what makes `hybrid` possible and what lets a cold
 * account re-run from seed indefinitely.
 */
const seedKeyFor = (channel: Channel) => `_seed_${channel}`;

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


/**
 * Persist a manually-supplied (cold-start) analysis to the current account's cache, tagged with
 * `source: 'manual'` provenance so the UI shows a seed banner. Mirrors importAnalysis' write+verify
 * pattern. Returns true on a verified write, false otherwise.
 *
 * Writes TWO slots: the displayable analysis (so the seed renders immediately) and the durable
 * `_seed_{channel}` slot. The durable copy is what `Run Channel Analysis` later reads to produce a
 * seeded or hybrid run, and it is never overwritten by an observed run.
 */
export function setManualAnalysis(
  channel: Channel,
  analysis: ChannelAnalysisResult,
  businessType: string,
): boolean {
  const wrote = writeAnalysisWithProvenance(channel, analysis, businessType, {
    adAccountId: '',
    adAccountName: 'Manual seed',
    importedAt: new Date().toISOString(),
    sourceBusinessType: businessType,
    source: 'manual',
  });
  if (!wrote) return false;
  return saveManualSeed(channel, analysis);
}

/**
 * Write the durable seed slot, preserving everything else in the cache object.
 */
function saveManualSeed(channel: Channel, seed: ChannelAnalysisResult): boolean {
  try {
    const raw = getScopedItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[seedKeyFor(channel)] = seed;
    const serialized = JSON.stringify(parsed);
    setScopedItem(CACHE_KEY, serialized);
    return getScopedItem(CACHE_KEY) === serialized;
  } catch {
    return false;
  }
}

/**
 * Read the durable manual seed for a channel, if one exists.
 *
 * Applies the same businessType gate as `getCachedAnalysis` — a seed authored for a lead-gen
 * account should not silently drive creative for an e-commerce one.
 *
 * Includes a lazy migration for seeds written before the durable slot existed: if the cached
 * analysis carries `source: 'manual'` provenance and no seed slot is present, that analysis IS the
 * seed, so adopt it. Without this, accounts seeded by the previous release would report "no seed"
 * and fall straight back into the old error.
 */
export function getManualSeed(channel: Channel, businessType: string): ChannelAnalysisResult | null {
  try {
    const raw = getScopedItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed._businessType && parsed._businessType !== businessType) return null;

    const stored = parsed[seedKeyFor(channel)] as ChannelAnalysisResult | undefined;
    if (stored) return stored;

    const provenance = parsed[`_importedFrom_${channel}`] as ImportMetadata | undefined;
    const legacy = parsed[channel] as ChannelAnalysisResult | undefined;
    if (provenance?.source === 'manual' && legacy) {
      saveManualSeed(channel, legacy); // adopt, so the next read is a plain hit
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/** Whether a manual seed exists for this channel — the branch that decides seeded vs. error. */
export function hasManualSeed(channel: Channel, businessType: string): boolean {
  return getManualSeed(channel, businessType) !== null;
}

/**
 * Remove the durable seed for a channel. Only ever user-initiated.
 *
 * Also drops the manual provenance: leaving it behind would let the legacy-adoption path in
 * `getManualSeed` resurrect the seed from the analysis slot on the very next read.
 */
export function clearManualSeed(channel: Channel): void {
  try {
    const raw = getScopedItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    delete parsed[seedKeyFor(channel)];
    const provenance = parsed[`_importedFrom_${channel}`] as ImportMetadata | undefined;
    if (provenance?.source === 'manual') delete parsed[`_importedFrom_${channel}`];
    setScopedItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore cache errors
  }
}

/** Drop the stored analysis for a channel, leaving other channels and the seed slot alone. */
export function clearChannelAnalysis(channel: Channel): void {
  try {
    const raw = getScopedItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    delete parsed[channel];
    setScopedItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore cache errors
  }
}
