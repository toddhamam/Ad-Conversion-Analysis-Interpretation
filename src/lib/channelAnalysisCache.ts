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

    // Read current account's cache (preserve other channels)
    const currentRaw = getScopedItem(CACHE_KEY);
    const currentParsed = currentRaw ? JSON.parse(currentRaw) : {};

    // Write the analysis + target business type + per-channel provenance
    currentParsed[channel] = analysis;
    currentParsed._businessType = targetBusinessType;
    currentParsed[`_importedFrom_${channel}`] = {
      adAccountId: sourceAccountId,
      adAccountName: sourceAccount?.ad_account_name || sourceAccountId,
      importedAt: new Date().toISOString(),
      sourceBusinessType,
    } satisfies ImportMetadata;

    // Attempt write — setScopedItem handles quota retry internally
    const serialized = JSON.stringify(currentParsed);
    setScopedItem(CACHE_KEY, serialized);

    // Verify the write succeeded
    const verify = getScopedItem(CACHE_KEY);
    return verify === serialized;
  } catch {
    return false;
  }
}
