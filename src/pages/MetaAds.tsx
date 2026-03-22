import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAdCreatives,
  fetchCampaignSummaries,
  aggregateByType,
  type AdCreative,
  type DatePreset,
  type DateRangeOptions,
  type CampaignTypeMetrics
} from '../services/metaApi';
import { useAdAccount } from '../contexts/AdAccountContext';
import { type AdCreativeData } from '../services/openaiApi';
import Badge from '../components/Badge';
import DateRangePicker from '../components/DateRangePicker';
import CampaignTypeDashboard from '../components/CampaignTypeDashboard';
import AdAnalysisPanel from '../components/AdAnalysisPanel';
import SEO from '../components/SEO';
import {
  captureImage,
  getCacheStats,
  getCachedImage,
  getAllCachedImages,
  getTopHighQualityCachedImages,
  storeImageFromUrl,
  clearLegacyCache
} from '../services/imageCache';
import Loading from '../components/Loading';
import { Check, Database, Info, RefreshCw } from 'lucide-react';
import { getBusinessTypeConfig } from '../lib/businessTypeConfig';
import {
  saveToSwipeLibrary,
  checkSavedHashes,
  computeContentHash,
  type SwipeLibrarySavePayload,
} from '../services/swipeLibraryApi';
import './MetaAds.css';

// --- Meta Ads persistent sync cache (localStorage) ---
// Manual sync model: data persists indefinitely until user explicitly re-syncs.
// One entry per account (no date range in key, no TTL).

interface MetaAdsSyncData {
  creatives: AdCreative[];
  campaignMetrics: CampaignTypeMetrics[];
  syncedAt: number;
  dateRange: {
    preset?: DatePreset;
    startDate: string; // ISO string for localStorage
    endDate: string;
  };
  businessType: string;
}

function getMetaAdsSyncKey(accountId: string | undefined): string {
  return `ci_meta_ads_sync_${accountId || 'default'}`;
}

function readMetaAdsSync(accountId: string | undefined): MetaAdsSyncData | null {
  try {
    const raw = localStorage.getItem(getMetaAdsSyncKey(accountId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeMetaAdsSync(accountId: string | undefined, data: MetaAdsSyncData): void {
  try {
    localStorage.setItem(getMetaAdsSyncKey(accountId), JSON.stringify(data));
  } catch {
    // QuotaExceeded — non-critical, just skip caching
  }
}

// One-time cleanup of old date-range-keyed cache entries (migration)
function cleanupOldCache(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('ci_meta_ads_cache_')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // Non-critical
  }
}

// Format how long ago data was synced
function formatSyncAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

// Human-readable label for date presets
const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7d: 'Last 7 days',
  last_14d: 'Last 14 days',
  last_28d: 'Last 28 days',
  last_30d: 'Last 30 days',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  maximum: 'Maximum (2yr)',
};

function getPresetLabel(preset?: DatePreset): string {
  return preset ? PRESET_LABELS[preset] || preset : 'Custom range';
}

// Helper to calculate dates from preset
function getPresetDates(preset: DatePreset): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  const startDate = new Date(today);

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1);
      endDate.setDate(endDate.getDate() - 1);
      break;
    case 'last_7d':
      startDate.setDate(startDate.getDate() - 6);
      break;
    case 'last_14d':
      startDate.setDate(startDate.getDate() - 13);
      break;
    case 'last_28d':
      startDate.setDate(startDate.getDate() - 27);
      break;
    case 'last_30d':
      startDate.setDate(startDate.getDate() - 29);
      break;
    case 'this_week':
      startDate.setDate(startDate.getDate() - startDate.getDay());
      break;
    case 'last_week':
      startDate.setDate(startDate.getDate() - startDate.getDay() - 7);
      endDate.setDate(endDate.getDate() - endDate.getDay() - 1);
      break;
    case 'this_month':
      startDate.setDate(1);
      break;
    case 'last_month':
      startDate.setDate(1);
      startDate.setMonth(startDate.getMonth() - 1);
      endDate.setDate(0);
      break;
    case 'maximum':
      startDate.setFullYear(startDate.getFullYear() - 2);
      break;
  }

  return { startDate, endDate };
}

// Format date as YYYY-MM-DD for API
function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Convert AdCreative to AdCreativeData for OpenAI analysis
function convertToAdCreativeData(creative: AdCreative): AdCreativeData {
  return {
    id: creative.id,
    headline: creative.headline || '',
    bodyText: creative.bodySnippet || '',
    imageUrl: creative.imageUrl,
    campaignName: creative.campaignName || '',
    adsetName: creative.adsetName || '',
    spend: creative.spend || 0,
    conversions: creative.conversions || 0,
    conversionRate: creative.conversionRate || 0,
    costPerConversion: creative.costPerConversion || 0,
    clicks: creative.clicks || 0,
    impressions: creative.impressions || 0,
    ctr: creative.clickThroughRate || 0,
    roas: creative.roas,
  };
}

const MetaAds = () => {
  // Meta Ads page with logo
  const { currentAccount, accountBusinessType: businessType } = useAdAccount();
  const btConfig = getBusinessTypeConfig(businessType);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignTypeMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzingAd, setAnalyzingAd] = useState<AdCreativeData | null>(null);

  // Reference image tracking
  const [cachedImageIds, setCachedImageIds] = useState<Set<string>>(new Set());
  const [fetchingImageId, setFetchingImageId] = useState<string | null>(null);
  const autoFetchingRefsRef = useRef(false);

  // Swipe Library tracking — tracks which element types are saved per ad
  const [savedElements, setSavedElements] = useState<Map<string, Set<string>>>(new Map());
  const [savingAdId, setSavingAdId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // Selective save modal
  const [selectSaveCreative, setSelectSaveCreative] = useState<AdCreative | null>(null);
  const [saveSelection, setSaveSelection] = useState({ headline: true, body: true, image: true });

  // Save feedback toast
  const [saveToast, setSaveToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track failed image loads for UI fallback
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());

  // Show toast with auto-dismiss
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
    setSaveToast({ type, message });
    saveToastTimer.current = setTimeout(() => setSaveToast(null), 4000);
  }, []);

  // Update cached image IDs when cache changes
  const refreshCachedIds = useCallback(() => {
    const stats = getCacheStats();
    // Get all cached image IDs
    const allCached = getAllCachedImages();
    setCachedImageIds(new Set(allCached.map(img => img.adId)));
    return stats.count;
  }, []);

  // Handle "Use as Reference" button click
  const handleUseAsReference = async (creative: AdCreative) => {
    if (!creative.imageUrl) return;

    setFetchingImageId(creative.id);
    try {
      const cached = await storeImageFromUrl(
        creative.imageUrl,
        creative.id,
        creative.conversionRate,
        undefined,
        creative.headline,
        creative.bodySnippet
      );
      if (cached) {
        refreshCachedIds();
        console.log(`✅ Added ${creative.id} as reference image`);
      } else {
        setError('Could not fetch image. Try downloading it manually and uploading on the Creatives page.');
      }
    } catch (err) {
      console.error('Failed to cache reference image:', err);
    } finally {
      setFetchingImageId(null);
    }
  };

  // Helper: check if all available elements of an ad are already saved
  const isFullySaved = (creative: AdCreative): boolean => {
    const saved = savedElements.get(creative.id);
    if (!saved) return false;
    if (creative.headline && !saved.has('headline')) return false;
    if (creative.bodySnippet && !saved.has('body_copy')) return false;
    if (creative.imageUrl && !failedImageIds.has(creative.id) && getCachedImage(creative.id) && !saved.has('image')) return false;
    return true;
  };

  // Helper: mark specific element types as saved for an ad
  const markElementsSaved = (adId: string, types: string[]) => {
    setSavedElements(prev => {
      const next = new Map(prev);
      const existing = next.get(adId) || new Set<string>();
      const updated = new Set(existing);
      for (const t of types) updated.add(t);
      next.set(adId, updated);
      return next;
    });
  };

  // Open selective save modal for an ad
  const openSaveModal = (creative: AdCreative) => {
    const saved = savedElements.get(creative.id) || new Set<string>();
    const hasImage = !!(creative.imageUrl && !failedImageIds.has(creative.id) && getCachedImage(creative.id));
    setSaveSelection({
      headline: !!creative.headline && !saved.has('headline'),
      body: !!creative.bodySnippet && !saved.has('body_copy'),
      image: hasImage && !saved.has('image'),
    });
    setSelectSaveCreative(creative);
  };

  // Perform save with selected elements. Returns true on success.
  const performSave = async (creative: AdCreative, selection?: { headline: boolean; body: boolean; image: boolean }): Promise<boolean> => {
    if (!currentAccount?.ad_account_id) {
      showToast('error', 'No ad account configured');
      return false;
    }

    const sel = selection || saveSelection;
    setSavingAdId(creative.id);
    setSelectSaveCreative(null);

    try {
      const items: SwipeLibrarySavePayload[] = [];
      const perf = {
        cvr: creative.conversionRate,
        cpa: creative.costPerConversion,
        ctr: creative.clickThroughRate,
        roas: creative.roas,
        conversions: creative.conversions,
        spend: creative.spend,
      };

      if (sel.headline && creative.headline) {
        items.push({
          element_type: 'headline',
          text_content: creative.headline,
          content_hash: await computeContentHash(creative.headline),
          meta_ad_id: creative.id,
          meta_campaign_name: creative.campaignName,
          meta_adset_name: creative.adsetName,
          performance_snapshot: perf,
        });
      }

      if (sel.body && creative.bodySnippet) {
        items.push({
          element_type: 'body_copy',
          text_content: creative.bodySnippet,
          content_hash: await computeContentHash(creative.bodySnippet),
          meta_ad_id: creative.id,
          meta_campaign_name: creative.campaignName,
          meta_adset_name: creative.adsetName,
          performance_snapshot: perf,
        });
      }

      if (sel.image && creative.imageUrl) {
        const cached = getCachedImage(creative.id);
        if (cached) {
          const img = new Image();
          img.src = `data:${cached.mimeType || 'image/jpeg'};base64,${cached.base64Data}`;
          await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); });
          const canvas = document.createElement('canvas');
          const scale = 200 / (img.naturalWidth || 200);
          canvas.width = 200;
          canvas.height = Math.round((img.naturalHeight || 200) * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);
          const thumbnail = thumbnailDataUrl.split(',')[1];

          items.push({
            element_type: 'image',
            image_data: cached.base64Data,
            image_thumbnail: thumbnail,
            image_mime_type: cached.mimeType || 'image/jpeg',
            content_hash: await computeContentHash(cached.base64Data.slice(0, 1000)),
            meta_ad_id: creative.id,
            meta_campaign_name: creative.campaignName,
            meta_adset_name: creative.adsetName,
            performance_snapshot: perf,
          });
        }
      }

      if (items.length === 0) {
        showToast('error', 'No elements selected to save');
        return false;
      }

      const result = await saveToSwipeLibrary(currentAccount.ad_account_id, items);
      const savedTypes = items.map(i => i.element_type);
      markElementsSaved(creative.id, savedTypes);

      const types = items.map(i => i.element_type === 'body_copy' ? 'body' : i.element_type).join(', ');
      if (result.saved > 0) {
        showToast('success', `Saved ${result.saved} element${result.saved > 1 ? 's' : ''} (${types})`);
      } else if (result.duplicates > 0) {
        showToast('success', 'Already in your library');
        markElementsSaved(creative.id, savedTypes);
      }
      return true;
    } catch (err: unknown) {
      console.error('Failed to save to Swipe Library:', err);
      const msg = err instanceof Error ? err.message : 'Save failed';
      showToast('error', msg.includes('Unauthorized') ? 'Please sign in to save' : `Save failed: ${msg}`);
      return false;
    } finally {
      setSavingAdId(null);
    }
  };

  // Bulk save all winning ads to Swipe Library (saves all elements)
  const handleSaveAllWinning = async () => {
    const winning = creatives.filter(c => c.status === 'Winning' && c.conversions > 0);
    if (winning.length === 0) return;
    setSavingAll(true);
    try {
      let savedCount = 0;
      for (const creative of winning) {
        if (!isFullySaved(creative)) {
          const ok = await performSave(creative, { headline: true, body: true, image: true });
          if (ok) savedCount++;
        }
      }
      if (savedCount > 0) {
        showToast('success', `Saved elements from ${savedCount} winning ad${savedCount > 1 ? 's' : ''}`);
      } else {
        showToast('error', 'No ads were saved — check your connection');
      }
    } catch (err: unknown) {
      console.error('Bulk save error:', err);
      showToast('error', 'Some ads failed to save');
    } finally {
      setSavingAll(false);
    }
  };

  // Check which ad elements are already saved on load
  const checkSavedAds = useCallback(async (creativesData: AdCreative[]) => {
    if (!currentAccount?.ad_account_id) return;
    try {
      const allHashes: string[] = [];
      const hashToAdInfo = new Map<string, { adId: string; elementType: string }>();
      for (const c of creativesData) {
        if (c.headline) {
          const h = await computeContentHash(c.headline);
          allHashes.push(h);
          hashToAdInfo.set(h, { adId: c.id, elementType: 'headline' });
        }
        if (c.bodySnippet) {
          const h = await computeContentHash(c.bodySnippet);
          allHashes.push(h);
          hashToAdInfo.set(h, { adId: c.id, elementType: 'body_copy' });
        }
      }
      if (allHashes.length === 0) return;
      const existing = await checkSavedHashes(currentAccount.ad_account_id, allHashes);
      const elemMap = new Map<string, Set<string>>();
      for (const hash of existing) {
        const info = hashToAdInfo.get(hash);
        if (info) {
          const set = elemMap.get(info.adId) || new Set<string>();
          set.add(info.elementType);
          elemMap.set(info.adId, set);
        }
      }
      setSavedElements(elemMap);
    } catch (err) {
      console.error('Failed to check saved hashes:', err);
    }
  }, [currentAccount?.ad_account_id]);

  // Auto-fetch top performing ad images until we have 3 HIGH-QUALITY references
  // This ensures we always have enough quality references for ad generation
  const autoFetchTopImages = useCallback(async (creativesData: AdCreative[]) => {
    if (autoFetchingRefsRef.current) return;

    const TARGET_HIGH_QUALITY_COUNT = 3;
    const MIN_QUALITY_SCORE = 60; // Same threshold as used in ad generation

    // First, clear any old cached images without quality tracking
    const legacyCleared = clearLegacyCache();
    if (legacyCleared > 0) {
      console.log(`🗑️ Cleared ${legacyCleared} legacy images without quality data`);
    }

    // Check how many high-quality images we already have
    const existingHighQuality = getTopHighQualityCachedImages(TARGET_HIGH_QUALITY_COUNT, MIN_QUALITY_SCORE);
    if (existingHighQuality.length >= TARGET_HIGH_QUALITY_COUNT) {
      console.log(`✅ Already have ${existingHighQuality.length} high-quality reference images`);
      return;
    }

    const needed = TARGET_HIGH_QUALITY_COUNT - existingHighQuality.length;
    console.log(`🔄 Need ${needed} more high-quality reference images (have ${existingHighQuality.length}/${TARGET_HIGH_QUALITY_COUNT})`);

    // Get ALL ads with images, sorted by conversion rate
    const allWithImages = creativesData
      .filter(c => c.imageUrl && c.conversionRate > 0)
      .sort((a, b) => b.conversionRate - a.conversionRate);

    if (allWithImages.length === 0) {
      console.log('⚠️ No ads with images found');
      return;
    }

    autoFetchingRefsRef.current = true;
    console.log(`🔄 Will try up to ${allWithImages.length} ads to find ${needed} high-quality images...`);

    let successCount = 0;
    let attemptCount = 0;

    for (const creative of allWithImages) {
      // Stop if we have enough high-quality images
      if (successCount >= needed) {
        console.log(`✅ Successfully cached ${successCount} high-quality images`);
        break;
      }

      // Skip if already cached (check if it's high quality)
      const existingCached = getCachedImage(creative.id);
      if (existingCached) {
        if ((existingCached.qualityScore ?? 0) >= MIN_QUALITY_SCORE) {
          console.log(`✅ Already have high-quality cache for: ${creative.id}`);
          continue;
        } else {
          console.log(`⏭️ Skipping ${creative.id} - already cached but low quality (${existingCached.qualityScore})`);
          continue;
        }
      }

      attemptCount++;
      console.log(`📥 Attempting ad #${attemptCount}: ${creative.id} (${creative.conversionRate.toFixed(1)}% conv rate)`);

      const cached = await storeImageFromUrl(
        creative.imageUrl!,
        creative.id,
        creative.conversionRate,
        MIN_QUALITY_SCORE, // Pass the minimum quality threshold
        creative.headline,
        creative.bodySnippet
      );

      if (cached && (cached.qualityScore ?? 0) >= MIN_QUALITY_SCORE) {
        successCount++;
        console.log(`✅ Cached HIGH-QUALITY reference #${successCount}: ${creative.id} (${cached.width}x${cached.height}, Q:${cached.qualityScore})`);
      } else if (cached) {
        console.log(`⚠️ Cached but below quality threshold: ${creative.id} (Q:${cached.qualityScore} < ${MIN_QUALITY_SCORE})`);
      } else {
        console.log(`❌ Failed to cache: ${creative.id}`);
      }
    }

    // Final status
    const finalCount = getTopHighQualityCachedImages(TARGET_HIGH_QUALITY_COUNT, MIN_QUALITY_SCORE).length;
    if (finalCount >= TARGET_HIGH_QUALITY_COUNT) {
      console.log(`✅ SUCCESS: Have ${finalCount} high-quality reference images for ad generation`);
    } else {
      console.log(`⚠️ WARNING: Only ${finalCount}/${TARGET_HIGH_QUALITY_COUNT} high-quality images available. Generated ads may not match brand style.`);
    }

    refreshCachedIds();
    autoFetchingRefsRef.current = false;
  }, [refreshCachedIds]);

  // Date range state - default to maximum for first-time users (overridden from cache on mount)
  const defaultPreset: DatePreset = 'maximum';
  const defaultDates = getPresetDates(defaultPreset);
  const [dateRange, setDateRange] = useState<{
    preset?: DatePreset;
    startDate: Date;
    endDate: Date;
  }>({
    preset: defaultPreset,
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
  });

  // Sync metadata — what date range was used for last sync, business type mismatch
  const [syncedDateRange, setSyncedDateRange] = useState<{ preset?: DatePreset; startDate: string; endDate: string } | null>(null);
  const [businessTypeMismatch, setBusinessTypeMismatch] = useState(false);

  // Filter out zero-conversion ads (not useful in the UI — zero-conv ads are
  // still included in backend channel analysis for the full picture)
  // Sort by conversion rate (best performers first)
  const sortedCreatives = [...creatives]
    .filter(c => c.conversions > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate);

  // Track when data was last synced for UI display
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Manual sync: always fetches fresh from Meta API (only called on explicit user action)
  const syncMetaData = useCallback(async (dateOptions: DateRangeOptions, selectedRange: { preset?: DatePreset; startDate: Date; endDate: Date }) => {
    console.log('🚀 Starting Meta data sync...', dateOptions);

    try {
      setLoading(true);
      setError(null);

      console.log('Fetching creatives and campaign summary data from Meta API...');
      const [creativesData, campaignSummaries] = await Promise.all([
        fetchAdCreatives(dateOptions, {
          primaryActionType: btConfig.primaryActionType,
          winningCVRThreshold: btConfig.winningCVRThreshold,
          fatiguedCVRThreshold: btConfig.fatiguedCVRThreshold,
          winningConversionMin: btConfig.winningConversionMin,
          fatiguedSpendMin: btConfig.fatiguedSpendMin,
          ...(businessType === 'hybrid' ? {
            leadWinningCVRThreshold: 15,
            leadFatiguedCVRThreshold: 3,
          } : {}),
        }),
        fetchCampaignSummaries(dateOptions)
      ]);

      console.log('✅ Creatives loaded:', creativesData.length);
      console.log('✅ Campaign summaries loaded:', campaignSummaries.length);

      const aggregatedMetrics = aggregateByType(campaignSummaries, {
        primaryConversionField: businessType === 'leadgen' ? 'leads' : 'purchases',
        includeLeadsInTotal: businessType === 'hybrid',
      });

      setCreatives(creativesData);
      setCampaignMetrics(aggregatedMetrics);

      // Persist sync data (no TTL — persists until next manual sync)
      const now = Date.now();
      const syncDateRange = {
        preset: selectedRange.preset,
        startDate: selectedRange.startDate.toISOString(),
        endDate: selectedRange.endDate.toISOString(),
      };
      writeMetaAdsSync(currentAccount?.ad_account_id, {
        creatives: creativesData,
        campaignMetrics: aggregatedMetrics,
        syncedAt: now,
        dateRange: syncDateRange,
        businessType,
      });
      setLastSyncedAt(now);
      setSyncedDateRange(syncDateRange);
      setBusinessTypeMismatch(false);

      // Auto-fetch top performing images as references
      autoFetchTopImages(creativesData);

      // Check which ads are already saved to Swipe Library
      checkSavedAds(creativesData);
    } catch (err: unknown) {
      console.error('❌ Failed to sync Meta data:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not sync Meta data: ${message}`);
      // On error, preserve any previously cached data (don't overwrite)
    } finally {
      setLoading(false);
    }
  }, [autoFetchTopImages, btConfig, businessType, checkSavedAds, currentAccount?.ad_account_id]);

  // Initialize cache IDs on mount
  useEffect(() => {
    refreshCachedIds();
  }, [refreshCachedIds]);

  // Load persisted sync data on mount / account switch (NO auto-fetch)
  useEffect(() => {
    // One-time migration: clean up old date-range-keyed cache entries
    cleanupOldCache();

    // Reset state before loading new account's cache (prevents flash of previous account data)
    setCreatives([]);
    setCampaignMetrics([]);
    setLastSyncedAt(null);
    setSyncedDateRange(null);
    setBusinessTypeMismatch(false);
    setError(null);

    // Read persisted sync data for this account
    const cached = readMetaAdsSync(currentAccount?.ad_account_id);
    if (cached) {
      setCreatives(cached.creatives);
      setCampaignMetrics(cached.campaignMetrics);
      setLastSyncedAt(cached.syncedAt);
      setSyncedDateRange(cached.dateRange);

      // Restore date range picker to what was last synced (Date objects from ISO strings)
      setDateRange({
        preset: cached.dateRange.preset,
        startDate: new Date(cached.dateRange.startDate),
        endDate: new Date(cached.dateRange.endDate),
      });

      // Detect business type mismatch
      if (cached.businessType !== businessType) {
        setBusinessTypeMismatch(true);
      }

      // Background tasks on cached data
      autoFetchTopImages(cached.creatives);
      checkSavedAds(cached.creatives);
    } else {
      // First visit — default to 'maximum' for the best coverage
      const maxDates = getPresetDates('maximum');
      setDateRange({ preset: 'maximum', startDate: maxDates.startDate, endDate: maxDates.endDate });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.ad_account_id]);

  const buildDateOptions = (): DateRangeOptions => {
    return dateRange.preset
      ? { datePreset: dateRange.preset }
      : {
          timeRange: {
            since: formatDateForApi(dateRange.startDate),
            until: formatDateForApi(dateRange.endDate),
          },
        };
  };

  // DateRangePicker onChange — only updates selected range, does NOT trigger a fetch
  const handleDateRangeChange = (newDateRange: { preset?: DatePreset; startDate: Date; endDate: Date }) => {
    setDateRange(newDateRange);
  };

  // Explicit sync: user clicks Sync / Re-sync button
  const handleSync = () => {
    syncMetaData(buildDateOptions(), dateRange);
  };

  // Determine if this is a first sync (no data yet) for loading UX
  const hasData = creatives.length > 0 || lastSyncedAt !== null;

  // Full-page loading spinner ONLY for first sync (no cached data visible)
  if (loading && !hasData) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Meta Ads</h1>
          <p className="page-subtitle">Syncing your ad data...</p>
        </div>
        <Loading size="large" message="ConversionIQ™ syncing channels..." />
      </div>
    );
  }

  // Empty state — no synced data yet, prompt user to sync
  if (!hasData && !loading) {
    return (
      <div className="page">
        <SEO
          title="Meta Ads"
          description="Analyze Meta (Facebook & Instagram) ad performance with ConversionIQ™ conversion intelligence."
          canonical="/channels/meta-ads"
          noindex={true}
        />
        <div className="page-header">
          <div className="page-header-left">
            <h1 className="page-title">Meta Ads</h1>
            <p className="page-subtitle">Sync your ad data to get started</p>
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{
            padding: '12px 20px',
            marginBottom: '24px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444'
          }}>
            {error}
          </div>
        )}

        <div className="meta-ads-empty">
          <Database size={48} strokeWidth={1} style={{ color: 'var(--accent-violet)', marginBottom: '16px' }} />
          <h2 className="meta-ads-empty-title">No Ad Data Synced</h2>
          <p className="meta-ads-empty-desc">
            Select a date range and sync to load your Meta ad performance data.
          </p>
          <div className="meta-ads-empty-controls">
            <DateRangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
            />
            <button
              className="meta-ads-sync-btn"
              onClick={handleSync}
              disabled={loading}
            >
              <RefreshCw size={16} strokeWidth={1.5} />
              Sync Ad Data
            </button>
          </div>
          <p className="meta-ads-empty-tip">
            Tip: Use "Maximum" to pull up to 2 years of ad data for the fullest picture.
          </p>
        </div>
      </div>
    );
  }

  // Sync status label — shows when and what range
  const syncAgeText = lastSyncedAt ? formatSyncAge(lastSyncedAt) : null;
  const syncRangeText = syncedDateRange ? getPresetLabel(syncedDateRange.preset) : null;
  const isStaleData = lastSyncedAt ? (Date.now() - lastSyncedAt > 7 * 24 * 60 * 60 * 1000) : false;

  return (
    <div className="page">
      <SEO
        title="Meta Ads"
        description="Analyze Meta (Facebook & Instagram) ad performance with ConversionIQ™ conversion intelligence."
        canonical="/channels/meta-ads"
        noindex={true}
      />
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Meta Ads</h1>
          <p className="page-subtitle">
            <Check size={14} strokeWidth={1.5} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Live data{currentAccount?.ad_account_name ? ` · ${currentAccount.ad_account_name}` : ''}
          </p>
        </div>
        <div className="page-header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {syncAgeText && (
            <span style={{
              fontSize: '12px',
              color: isStaleData ? '#f59e0b' : 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}>
              Synced {syncAgeText}{syncRangeText ? ` · ${syncRangeText}` : ''}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={loading}
            title="Re-sync data from Meta"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={14} strokeWidth={1.5} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            {loading ? 'Syncing...' : 'Re-sync'}
          </button>
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
          />
        </div>
      </div>

      {/* Business type mismatch info banner */}
      {businessTypeMismatch && (
        <div style={{
          padding: '12px 20px',
          marginBottom: '16px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Info size={16} strokeWidth={1.5} style={{ color: 'var(--accent-violet)', flexShrink: 0 }} />
          Business type has changed since last sync. Re-sync to update ad classifications.
        </div>
      )}

      {error && (
        <div className="error-banner" style={{
          padding: '12px 20px',
          marginBottom: '24px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444'
        }}>
          {error}
        </div>
      )}

      {/* Campaign Type Dashboard */}
      {campaignMetrics.length > 0 && (
        <CampaignTypeDashboard metrics={campaignMetrics} loading={loading} businessType={businessType} />
      )}

      {creatives.some(c => c.status === 'Winning') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button
            className="save-library-btn"
            onClick={handleSaveAllWinning}
            disabled={savingAll}
            style={{
              padding: '10px 20px',
              background: 'rgba(212, 225, 87, 0.1)',
              border: '1px solid rgba(212, 225, 87, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: savingAll ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: savingAll ? 0.7 : 1,
            }}
          >
            {savingAll ? '⏳ Saving...' : '🔖 Save All Winning Ads'}
          </button>
        </div>
      )}

      <div className="creative-grid">
        {sortedCreatives.map((creative) => (
          <div key={creative.id} className="creative-card">
            <div className="creative-badges">
              <Badge variant={creative.status.toLowerCase() as 'winning' | 'testing' | 'fatigued'}>
                {creative.status}
              </Badge>
              <Badge variant={creative.confidence.toLowerCase() as 'high' | 'medium' | 'low'}>
                {creative.confidence}
              </Badge>
            </div>

            {/* CONVERSION INTELLIGENCE METRICS */}
            <div className="conversion-intelligence" style={{
              padding: '16px',
              background: 'rgba(0, 212, 255, 0.05)',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                fontSize: '13px'
              }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>{btConfig.conversionRateLabel}</div>
                  <div style={{
                    fontSize: '20px',
                    fontWeight: '700',
                    color: creative.conversionRate > 5 ? '#10b981' : creative.conversionRate > 2 ? '#f59e0b' : '#ef4444'
                  }}>
                    {creative.conversionRate}%
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>{btConfig.costPerConversionLabel}</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--accent-primary)' }}>
                    ${(creative.costPerConversion || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>CTR</div>
                  <div style={{ fontSize: '16px', fontWeight: '600' }}>{creative.clickThroughRate}%</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Conversions</div>
                  <div style={{ fontSize: '16px', fontWeight: '600' }}>{creative.conversions}</div>
                </div>
              </div>
            </div>

            {/* AD CREATIVE IMAGE/VIDEO - 1080x1080 format */}
            {creative.imageUrl && !failedImageIds.has(creative.id) ? (
              <div style={{
                width: '100%',
                aspectRatio: '1 / 1',
                overflow: 'hidden',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <img
                  src={creative.imageUrl}
                  alt={creative.headline}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                  onError={() => {
                    setFailedImageIds(prev => new Set(prev).add(creative.id));
                  }}
                  onLoad={(e) => {
                    const imgElement = e.currentTarget as HTMLImageElement;
                    captureImage(imgElement, creative.id, creative.conversionRate, creative.headline, creative.bodySnippet);
                  }}
                />
              </div>
            ) : (
              <div className="creative-image-placeholder" style={{
                aspectRatio: '1 / 1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                marginBottom: '16px',
                color: 'var(--text-muted)',
                fontSize: '12px',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                {failedImageIds.has(creative.id) && <span>Image unavailable</span>}
              </div>
            )}

            <div className="creative-content">
              <h3 className="creative-headline">{creative.headline}</h3>
              <p className="creative-body">{creative.bodySnippet}</p>
              <div style={{
                marginTop: '8px',
                padding: '8px',
                background: 'rgba(168, 85, 247, 0.1)',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}>
                <div><strong>Campaign:</strong> {creative.campaignName}</div>
                <div><strong>Ad Set:</strong> {creative.adsetName}</div>
              </div>
            </div>

            <div className="creative-footer">
              <div className="creative-conversions">
                <strong>${(creative.spend || 0).toFixed(2)}</strong> spent
              </div>
              <div className="creative-concept">
                {(creative.clicks || 0).toLocaleString()} clicks • {(creative.impressions || 0).toLocaleString()} impr
              </div>
            </div>

            {/* Action Buttons */}
            <div className="creative-actions">
              <button
                className="analyze-btn"
                onClick={() => setAnalyzingAd(convertToAdCreativeData(creative))}
              >
                <span className="analyze-icon">🤖</span>
                Analyze Ad
              </button>

              {/* Use as Reference Button */}
              {creative.imageUrl && (
                <button
                  className={`reference-btn ${cachedImageIds.has(creative.id) ? 'is-reference' : ''}`}
                  onClick={() => handleUseAsReference(creative)}
                  disabled={fetchingImageId === creative.id || cachedImageIds.has(creative.id)}
                >
                  {fetchingImageId === creative.id ? (
                    <>
                      <span className="reference-icon">⏳</span>
                      Caching...
                    </>
                  ) : cachedImageIds.has(creative.id) ? (
                    <>
                      <span className="reference-icon">✓</span>
                      Reference Added
                    </>
                  ) : (
                    <>
                      <span className="reference-icon">📌</span>
                      Use as Reference
                    </>
                  )}
                </button>
              )}

              {/* Save to Swipe Library Button */}
              <button
                className={`save-library-btn ${isFullySaved(creative) ? 'is-saved' : savedElements.has(creative.id) ? 'is-partial' : ''}`}
                onClick={() => openSaveModal(creative)}
                disabled={savingAdId === creative.id || isFullySaved(creative)}
              >
                {savingAdId === creative.id ? (
                  <>
                    <span className="save-library-icon">⏳</span>
                    Saving...
                  </>
                ) : isFullySaved(creative) ? (
                  <>
                    <span className="save-library-icon">✓</span>
                    Saved
                  </>
                ) : savedElements.has(creative.id) ? (
                  <>
                    <span className="save-library-icon">🔖</span>
                    Save More
                  </>
                ) : (
                  <>
                    <span className="save-library-icon">🔖</span>
                    Save to Library
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Ad Analysis Panel */}
      {analyzingAd && (
        <AdAnalysisPanel
          ad={analyzingAd}
          onClose={() => setAnalyzingAd(null)}
        />
      )}

      {/* Save to Library Modal — selective element picker */}
      {selectSaveCreative && (() => {
        const alreadySaved = savedElements.get(selectSaveCreative.id) || new Set<string>();
        return (
          <div className="save-modal-overlay" onClick={() => setSelectSaveCreative(null)}>
            <div className="save-modal" onClick={e => e.stopPropagation()}>
              <h3 className="save-modal-title">Save to Swipe Library</h3>
              <p className="save-modal-subtitle">Choose which elements to save</p>

              <div className="save-modal-options">
                {selectSaveCreative.headline && (
                  <label className={`save-modal-option ${alreadySaved.has('headline') ? 'is-saved' : ''}`}>
                    <input
                      type="checkbox"
                      checked={saveSelection.headline}
                      disabled={alreadySaved.has('headline')}
                      onChange={e => setSaveSelection(prev => ({ ...prev, headline: e.target.checked }))}
                    />
                    <div className="save-modal-option-content">
                      <span className="save-modal-option-type">
                        Headline {alreadySaved.has('headline') && <span className="save-modal-saved-badge">Saved</span>}
                      </span>
                      <span className="save-modal-option-preview">{selectSaveCreative.headline}</span>
                    </div>
                  </label>
                )}

                {selectSaveCreative.bodySnippet && (
                  <label className={`save-modal-option ${alreadySaved.has('body_copy') ? 'is-saved' : ''}`}>
                    <input
                      type="checkbox"
                      checked={saveSelection.body}
                      disabled={alreadySaved.has('body_copy')}
                      onChange={e => setSaveSelection(prev => ({ ...prev, body: e.target.checked }))}
                    />
                    <div className="save-modal-option-content">
                      <span className="save-modal-option-type">
                        Body Copy {alreadySaved.has('body_copy') && <span className="save-modal-saved-badge">Saved</span>}
                      </span>
                      <span className="save-modal-option-preview">{selectSaveCreative.bodySnippet}</span>
                    </div>
                  </label>
                )}

                {selectSaveCreative.imageUrl && !failedImageIds.has(selectSaveCreative.id) && (
                  <label className={`save-modal-option ${alreadySaved.has('image') ? 'is-saved' : ''}`}>
                    <input
                      type="checkbox"
                      checked={saveSelection.image}
                      disabled={alreadySaved.has('image')}
                      onChange={e => setSaveSelection(prev => ({ ...prev, image: e.target.checked }))}
                    />
                    <div className="save-modal-option-content">
                      <span className="save-modal-option-type">
                        Image {alreadySaved.has('image') && <span className="save-modal-saved-badge">Saved</span>}
                      </span>
                      {getCachedImage(selectSaveCreative.id) ? (
                        <img
                          src={selectSaveCreative.imageUrl}
                          alt=""
                          className="save-modal-image-preview"
                        />
                      ) : (
                        <span className="save-modal-image-note">
                          Image visible but not cached — will be skipped
                        </span>
                      )}
                    </div>
                  </label>
                )}
              </div>

              <div className="save-modal-metrics">
                CVR {selectSaveCreative.conversionRate}% · CPA ${(selectSaveCreative.costPerConversion || 0).toFixed(2)} · {selectSaveCreative.conversions} conversions
              </div>

              <div className="save-modal-actions">
                <button
                  className="save-modal-cancel"
                  onClick={() => setSelectSaveCreative(null)}
                >
                  Cancel
                </button>
                <button
                  className="save-modal-confirm"
                  disabled={!saveSelection.headline && !saveSelection.body && !saveSelection.image}
                  onClick={() => performSave(selectSaveCreative)}
                >
                  Save Selected
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Save feedback toast */}
      {saveToast && (
        <div className={`save-toast save-toast-${saveToast.type}`}>
          {saveToast.type === 'success' ? '✓' : '⚠'} {saveToast.message}
        </div>
      )}
    </div>
  );
};

export default MetaAds;
