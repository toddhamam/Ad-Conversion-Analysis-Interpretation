import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  isOpenAIConfigured,
  isGeminiConfigured,
  generateAdPackage,
  generateCopyOptions,
  generateTextAdCopy,
  regenerateSingleCopy,
  generateAdImage,
  regenerateAllImages,
  generateAdVideoWithVeo,
  generateGridCopy,
  buildGridPackages,
  planBlitzImageSlots,
  blitzStrategyImageCounts,
  CONCEPT_ANGLES,
  IMAGE_SIZE_OPTIONS,
  DEFAULT_IMAGE_SIZE,
  COPY_LENGTH_OPTIONS,
  DEFAULT_COPY_LENGTH,
  VIDEO_ASPECT_RATIO_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  DEFAULT_VIDEO_CONFIG,
  type AdType,
  type AudienceType,
  type ConceptType,
  type ChannelAnalysisResult,
  type GeneratedAdPackage,
  type GeneratedImageResult,
  type BlitzImageStrategy,
  type GridCell,
  type CopyOption,
  type ImageSize,
  type CopyLength,
  type ProductContext,
  type VideoAspectRatio,
  type VideoDuration,
  type VideoModel,
  type TextAdCopyResult,
  type ImageModel,
  DEFAULT_IMAGE_MODEL_PROVIDER,
} from '../services/openaiApi';
import { TEXT_AD_STYLES, getDefaultStyleId, generateTextAdImage, getStyleById, registerCustomBrandStyle, CUSTOM_BRAND_ID } from '../services/textAdCanvas';
import type { TextAdStyle } from '../services/textAdCanvas';
import { getCacheStats as getImageCacheStats, getDetailedCacheStats, uploadBrandImages, clearImageCache, autoFetchConvertingAdImages, extractImageMetadata } from '../services/imageCache';
import { fetchAdCreatives, saveReferenceImageMetadata, type DatePreset } from '../services/metaApi';
import GeneratedAdCard from '../components/GeneratedAdCard';
import CopySelectionPanel from '../components/CopySelectionPanel';
import GridReviewPanel from '../components/GridReviewPanel';
import BlitzImageReviewPanel from '../components/BlitzImageReviewPanel';
import BlitzImageStrategySelector from '../components/BlitzImageStrategySelector';
import ImageModelSelector from '../components/ImageModelSelector';
import AdLibraryBrowser from '../components/AdLibraryBrowser';
import InspirationSelector from '../components/InspirationSelector';
import SEO from '../components/SEO';
import { setPublishData } from '../services/publishStore';
import type { AdLibraryInspiration } from '../types';
import { getScopedItem, setScopedItem, removeScopedItem, getScopedAccountId } from '../lib/scopedStorage';
import { getBatch, saveBatch, clearBatch, type BatchSessionContext } from '../services/batchStore';
import { DEFAULT_GRID_ANGLES, DEFAULT_GRID_HOOKS, HOOK_LABELS, FORMAT_LABELS, isValidAngle, isValidHook, type GridAngle, type HookType, type FormatType } from '../lib/axisTags';
import { useAdAccount } from '../contexts/AdAccountContext';
import { getCachedAnalysis, getImportMetadata, type ImportMetadata } from '../lib/channelAnalysisCache';
import { loadBrandVoiceProfile } from '../lib/brandVoiceProfile';
import type { BrandVoiceProfile } from '../services/openaiApi';
import ImportImagesModal, { getAvailableImageImports, importImages, getSyncCreatives } from '../components/ImportImagesModal';
import SwipeLibraryPicker from '../components/SwipeLibraryPicker';
import { fetchSwipeImage, type SwipeLibraryItem, type SwipeElementType } from '../services/swipeLibraryApi';
import { reserveCredits, confirmCredits, refundCredits, InsufficientCreditsError, checkCredits } from '../services/stripeApi';
import type { CreditActionType, CampaignIntent } from '../types/organization';
import CreditExhaustionModal from '../components/CreditExhaustionModal';
import './AdGenerator.css';

const GENERATED_ADS_STORAGE_KEY = 'conversion_intelligence_generated_ads';
const PRODUCTS_STORAGE_KEY = 'convertra_products';
const INSPIRATIONS_STORAGE_KEY = 'ci_ad_library_inspirations';
const REF_FETCH_MARKER_KEY = 'ci_ref_fetch_marker';
const MAX_SAVED_INSPIRATIONS = 20;
const MAX_ACTIVE_INSPIRATIONS = 5;
// Core Promise library — persistent across batches, scoped per ad account (mirrors Products)
const CORE_PROMISES_STORAGE_KEY = 'convertra_core_promises';
const SELECTED_CORE_PROMISE_KEY = 'convertra_selected_core_promise';
const MAX_CORE_PROMISES = 12;

// A saved Core Promise — the single idea a batch of creatives lives inside.
interface SavedCorePromise {
  id: string;
  text: string;
  createdAt: string;
}

// Pagination settings - render a few cards at a time to avoid paint storms with large base64 images
const ADS_PER_PAGE = 3;
// Batch cap — fits a full Blitz grid (GRID_CELL_CAP = 24) plus a few iterations. The
// batch lives in IndexedDB (batchStore), which holds the full set of images, so there's
// no per-ad image stripping or size guard anymore (those were localStorage band-aids).
const MAX_STORED_ADS = 30;

// Debug logging for crash investigation
const DEBUG_MODE = false;
const debugLog = (...args: unknown[]) => {
  if (DEBUG_MODE) console.log('[AdGenerator]', ...args);
};

// Schedule deferred work using setTimeout (short delay to avoid blocking UI)
// NOTE: requestIdleCallback was removed because its cleanup function cancels
// pending callbacks on component unmount, causing data loss before navigation.
const scheduleDeferredWork = (callback: () => void, delayMs = 100): ReturnType<typeof setTimeout> => {
  return setTimeout(callback, delayMs);
};

interface AudienceOption {
  id: AudienceType;
  name: string;
  description: string;
  icon: string;
}

const AUDIENCE_OPTIONS: AudienceOption[] = [
  {
    id: 'prospecting',
    name: 'Prospecting',
    description: 'Cold audiences - awareness & curiosity',
    icon: '👋',
  },
  {
    id: 'retargeting',
    name: 'Retargeting',
    description: 'Warm audiences - consideration & conversion',
    icon: '🔄',
  },
  {
    id: 'retention',
    name: 'Retention',
    description: 'Existing customers - loyalty & upsell',
    icon: '⭐',
  },
];

const CONCEPT_OPTIONS = Object.entries(CONCEPT_ANGLES).map(([id, config]) => ({
  id: id as ConceptType,
  ...config,
}));

// Grid mode option lists (BlitzScale Angle × Hook matrix)
const GRID_ANGLE_OPTIONS = CONCEPT_OPTIONS
  .filter(o => o.id !== 'auto')
  .map(o => ({ ...o, id: o.id as GridAngle }));
const GRID_HOOK_OPTIONS = (Object.keys(HOOK_LABELS) as HookType[]).map(id => ({ id, name: HOOK_LABELS[id] }));
const GRID_FORMAT_OPTIONS = (Object.keys(FORMAT_LABELS) as FormatType[]).map(id => ({
  id,
  name: FORMAT_LABELS[id],
  description: id === 'static_screenshot' ? 'Authentic screenshot — often out-converts designed graphics' : 'Designed graphic',
}));
const GRID_CELL_CAP = 24;

// getCachedAnalysis is now imported from ../lib/channelAnalysisCache

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type WorkflowStep = 'config' | 'copy-selection' | 'final-config' | 'grid-review' | 'grid-images';
type CopySource = 'generate' | 'import' | 'manual' | 'swipe';

const IMPORT_DATE_OPTIONS: { id: DatePreset; label: string }[] = [
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'maximum', label: 'All Time' },
];

const AdGenerator = () => {
  const navigate = useNavigate();
  const { currentAccount, accounts, accountBusinessType: businessType, isMultiAccount } = useAdAccount();

  // Campaign intent — controls AI prompts + publisher defaults.
  // Default based on business type; user can override (e.g. quiz funnel).
  const [campaignIntent, setCampaignIntent] = useState<CampaignIntent>(
    businessType === 'leadgen' ? 'lead' : 'purchase'
  );
  const userChangedIntentRef = useRef(false);
  const effectiveIntent: CampaignIntent = campaignIntent;

  // Sync default intent when businessType resolves asynchronously (e.g. leadgen
  // loads after initial ecommerce fallback), but only if the user hasn't manually
  // changed it yet.
  const prevBusinessTypeRef = useRef(businessType);
  useEffect(() => {
    if (businessType !== prevBusinessTypeRef.current) {
      prevBusinessTypeRef.current = businessType;
      if (!userChangedIntentRef.current) {
        setCampaignIntent(businessType === 'leadgen' ? 'lead' : 'purchase');
      }
    }
  }, [businessType]);

  // Render tracking for debugging Chrome crashes
  const renderCountRef = useRef(0);
  const instanceIdRef = useRef(Math.random().toString(36).substring(2, 9));
  renderCountRef.current += 1;
  debugLog(`Render #${renderCountRef.current} (instance: ${instanceIdRef.current})`);

  // Core configuration
  const [adType, setAdType] = useState<AdType>('image');
  const [audienceType, setAudienceType] = useState<AudienceType>('prospecting');
  const [conceptType, setConceptType] = useState<ConceptType>('auto');
  const [variationCount, setVariationCount] = useState(2);
  // Core Promise — a persistent library of saved promises + the chosen one.
  // The selection sticks across batches (and reloads) until manually changed,
  // mirroring how Product selection works. `promiseDraft` holds an unsaved,
  // in-progress promise. The active `corePromise` (derived below) is the
  // selected saved promise's text, or the draft when nothing is selected.
  const [savedPromises, setSavedPromises] = useState<SavedCorePromise[]>([]);
  const [selectedPromiseId, setSelectedPromiseId] = useState<string | null>(null);
  const [promiseDraft, setPromiseDraft] = useState('');
  // BlitzScale grid mode
  const [generationMode, setGenerationMode] = useState<'single' | 'grid'>('single');
  const [gridAngles, setGridAngles] = useState<GridAngle[]>(() => [...DEFAULT_GRID_ANGLES]);
  const [gridHooks, setGridHooks] = useState<HookType[]>(() => [...DEFAULT_GRID_HOOKS]);
  const [gridFormat, setGridFormat] = useState<FormatType>('static_graphic');
  const [gridCells, setGridCells] = useState<GridCell[] | null>(null);
  const [keptCellIds, setKeptCellIds] = useState<Set<string>>(new Set());
  const [isGeneratingGrid, setIsGeneratingGrid] = useState(false);
  const [regeneratingCellId, setRegeneratingCellId] = useState<string | null>(null);
  // Blitz image pool — the strategy that maps a small image pool across the Angle × Hook grid (how
  // images are isolated for testing), the reviewed pool itself (slot-aligned: one entry per rendered
  // slot, null where a render failed), a per-image reroll indicator, and any partial-failure warning.
  // Default 'single': one image shared across every ad — isolates angle/hook/copy as the variable.
  // The per-cell image assignment (blitzPlan) is DERIVED from (keptCells, strategy), not stored.
  const [blitzImageStrategy, setBlitzImageStrategy] = useState<BlitzImageStrategy>('single');
  const [blitzImages, setBlitzImages] = useState<(GeneratedImageResult | null)[]>([]);
  const [blitzImageError, setBlitzImageError] = useState<string | undefined>(undefined);
  const [regeneratingBlitzIndex, setRegeneratingBlitzIndex] = useState<number | null>(null);
  const [analysisData, setAnalysisData] = useState<ChannelAnalysisResult | null>(null);
  const [analysisImportMeta, setAnalysisImportMeta] = useState<ImportMetadata | null>(null);
  // Per-account authored Brand Voice profile — injected into every copy generation call below.
  const [brandProfile, setBrandProfile] = useState<BrandVoiceProfile | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>(DEFAULT_IMAGE_SIZE);
  const [copyLength, setCopyLength] = useState<CopyLength>(DEFAULT_COPY_LENGTH);
  const [imageModel, setImageModel] = useState<ImageModel>(() => {
    try {
      const saved = localStorage.getItem('ci_image_model');
      if (saved === 'gemini' || saved === 'openai') return saved;
    } catch { /* ignore */ }
    return DEFAULT_IMAGE_MODEL_PROVIDER;
  });

  const handleImageModelChange = (model: ImageModel) => {
    setImageModel(model);
    try { localStorage.setItem('ci_image_model', model); } catch { /* ignore */ }
  };

  // Video configuration
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>(DEFAULT_VIDEO_CONFIG.aspectRatio);
  const [videoDuration, setVideoDuration] = useState<VideoDuration>(DEFAULT_VIDEO_CONFIG.duration);
  const [videoModel, setVideoModel] = useState<VideoModel>(DEFAULT_VIDEO_CONFIG.model);

  // Text ad configuration
  const [textAdPrimaryText, setTextAdPrimaryText] = useState('');
  const [textAdHighlightText, setTextAdHighlightText] = useState('');
  const [textAdAnchorText, setTextAdAnchorText] = useState('');
  const [selectedTextStyles, setSelectedTextStyles] = useState<string[]>([getDefaultStyleId()]);
  const [textAdCopySuggestions, setTextAdCopySuggestions] = useState<TextAdCopyResult | null>(null);
  const [isGeneratingTextAdCopy, setIsGeneratingTextAdCopy] = useState(false);

  // Custom brand style for text ads
  const [customBrandStyle, setCustomBrandStyle] = useState<TextAdStyle>(() => {
    try {
      const saved = localStorage.getItem('ci_custom_brand_style');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {
      id: CUSTOM_BRAND_ID,
      name: 'My Brand',
      backgroundType: 'solid' as const,
      backgroundColors: ['#1a1a1a'],
      textColor: '#ffffff',
      accentColor: '#f0e0cc',
      bannerBgColor: '#d4a843',
      bannerTextColor: '#1a1a1a',
      bannerAccentColor: '#f0e0cc',
      previewCSS: 'linear-gradient(135deg, #1a1a1a 60%, #f0e0cc 60%)',
    };
  });
  const [showBrandColorPicker, setShowBrandColorPicker] = useState(false);

  // Register custom brand style so getStyleById resolves it
  useEffect(() => {
    registerCustomBrandStyle(customBrandStyle);
  }, [customBrandStyle]);

  const updateCustomBrandColor = useCallback((field: string, value: string) => {
    setCustomBrandStyle(prev => {
      const updated = { ...prev };
      if (field === 'backgroundColors') {
        updated.backgroundColors = [value];
      } else {
        (updated as Record<string, unknown>)[field] = value;
      }
      // Sync bannerAccentColor with accentColor
      if (field === 'accentColor') {
        updated.bannerAccentColor = value;
      }
      // Regenerate preview swatch
      updated.previewCSS = `linear-gradient(135deg, ${updated.backgroundColors[0]} 60%, ${updated.accentColor} 60%)`;
      try {
        localStorage.setItem('ci_custom_brand_style', JSON.stringify(updated));
      } catch { /* ignore quota errors */ }
      return updated;
    });
  }, []);

  // Copy source mode
  const [copySource, setCopySource] = useState<CopySource>('generate');
  const [manualHeadlines, setManualHeadlines] = useState<string[]>(['']);
  const [manualBodyTexts, setManualBodyTexts] = useState<string[]>(['']);
  const [manualCTAs, setManualCTAs] = useState<string[]>(['']);
  const [isImportingCopy, setIsImportingCopy] = useState(false);
  const [importDatePreset, setImportDatePreset] = useState<DatePreset>('last_30d');

  // Product context
  const [products, setProducts] = useState<ProductContext[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const selectedProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  // The chosen Core Promise (a saved one if selected, otherwise the live draft).
  // This is the single string every downstream generation/validation reads, so
  // the rest of the component is unchanged by the move to a persistent library.
  const selectedPromise = useMemo(
    () => savedPromises.find(p => p.id === selectedPromiseId) || null,
    [savedPromises, selectedPromiseId]
  );
  const corePromise = selectedPromise ? selectedPromise.text : promiseDraft;

  // Multi-step workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('config');

  // Copy options from generation
  const [copyOptions, setCopyOptions] = useState<{
    headlines: CopyOption[];
    bodyTexts: CopyOption[];
    callToActions: CopyOption[];
  } | null>(null);

  // User selections
  const [selectedHeadlines, setSelectedHeadlines] = useState<string[]>([]);
  const [selectedBodyTexts, setSelectedBodyTexts] = useState<string[]>([]);
  const [selectedCTAs, setSelectedCTAs] = useState<string[]>([]);

  // Loading and error states
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isGeneratingCreatives, setIsGeneratingCreatives] = useState(false);
  const [regeneratingCopyId, setRegeneratingCopyId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState('');
  const [generatedAds, setGeneratedAds] = useState<GeneratedAdPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAds, setIsLoadingAds] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  // When the current batch was published to Meta (ms). Set on return from the
  // publisher; drives the "Published" badge. Reset to null on a new generation.
  const [batchPublishedAt, setBatchPublishedAt] = useState<number | null>(null);

  // Pagination state
  const [visibleAdsCount, setVisibleAdsCount] = useState(ADS_PER_PAGE);

  // Swipe Library picker state
  const [showSwipePicker, setShowSwipePicker] = useState(false);
  const [swipePickerTypes, setSwipePickerTypes] = useState<SwipeElementType[]>(['headline', 'body_copy']);
  const [swipePickerContext, setSwipePickerContext] = useState<'step1' | 'step2' | 'step3'>('step1');
  const [libraryImages, setLibraryImages] = useState<SwipeLibraryItem[]>([]);

  // Image cache status for brand-informed generation
  const [imageCacheCount, setImageCacheCount] = useState(0);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isAutoFetchingRefs, setIsAutoFetchingRefs] = useState(false);
  const [autoFetchProgress, setAutoFetchProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [refTopConversions, setRefTopConversions] = useState(0);
  const [refTopCVR, setRefTopCVR] = useState(0);
  const autoFetchTriggeredRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImageImportModal, setShowImageImportModal] = useState(false);

  // Creative variation control (0 = identical to references, 100 = completely different)
  const [similarityValue, setSimilarityValue] = useState(30); // Default: 30% variation (70% similar)

  // Copy variation control (0 = replicate winners exactly, 100 = radically different angles)
  const [copyVariationValue, setCopyVariationValue] = useState(30);

  // Headline in image control
  type HeadlineInImageMode = 'none' | 'from-copy' | 'custom';
  const [headlineInImageMode, setHeadlineInImageMode] = useState<HeadlineInImageMode>('none');
  const [customImageHeadline, setCustomImageHeadline] = useState('');

  // Ad Library inspiration
  const [savedInspirations, setSavedInspirations] = useState<AdLibraryInspiration[]>([]);
  const [activeInspirationIds, setActiveInspirationIds] = useState<string[]>([]);

  // True when any generated output stage exists worth persisting/scrapping. Single source for
  // the persist gate and the "Start over" button so the two can't drift apart.
  const hasStageContent =
    generatedAds.length > 0 || blitzImages.length > 0 || !!copyOptions || (gridCells?.length ?? 0) > 0;

  // Reset every generated-output stage to a blank slate. One definition shared by the
  // "no batch for this account" restore path and "Start over", so the blank-state field list
  // lives in exactly one place (the snapshot and the restore below are its two inverses).
  const resetStageState = useCallback(() => {
    setCopyOptions(null);
    setSelectedHeadlines([]);
    setSelectedBodyTexts([]);
    setSelectedCTAs([]);
    setGridCells(null);
    setKeptCellIds(new Set());
    setBlitzImages([]);
    setBlitzImageError(undefined);
    setGeneratedAds([]);
    setBatchPublishedAt(null);
    setCurrentStep('config');
  }, []);

  // Live snapshot of the generation context, persisted alongside the batch so that
  // (a) every workflow stage rehydrates after a refresh and (b) per-image
  // regeneration re-runs with the same product/size/variation that made the originals.
  // Kept in a ref (updated by the effect below) so the debounced save effect can read
  // current values without re-running on every keystroke.
  const sessionRef = useRef<BatchSessionContext>({});
  useEffect(() => {
    // Snapshot every output stage — config, copy + selections, the Blitz grid, and the
    // current step — into one session object used for both the synchronous publisher
    // handoff (sessionRef) and IndexedDB persistence.
    const session: BatchSessionContext = {
      audienceType,
      conceptType,
      campaignIntent: effectiveIntent,
      copySource,
      adType,
      selectedProductId,
      similarityValue,
      copyVariationValue,
      imageSize,
      imageModel,
      variationCount,
      copyOptions,
      selectedHeadlines,
      selectedBodyTexts,
      selectedCTAs,
      generationMode,
      gridFormat,
      corePromise,
      gridCells,
      keptCellIds: Array.from(keptCellIds),
      currentStep,
      blitzImageError,
    };
    sessionRef.current = session;

    // Persist the whole session to IndexedDB whenever any stage changes (debounced). This is
    // what makes locked-in COPY survive a refresh even before any image exists, so an
    // image-generation error never forces the user to regenerate copy from scratch. Only
    // write once there's a generated output worth keeping, and skip while the initial restore
    // is still running.
    if (isLoadingAds || !hasStageContent) return;

    const accountId = getScopedAccountId();
    const saveTimerId = scheduleDeferredWork(() => {
      debugLog(`Persisting session to IndexedDB (${generatedAds.length} ads, ${blitzImages.length} blitz images, step ${currentStep})`);
      saveBatch(accountId, {
        packages: generatedAds.slice(0, MAX_STORED_ADS),
        blitzImages,
        session,
        publishedAt: batchPublishedAt,
      }).catch(e => console.warn('[AdGenerator] Failed to persist batch:', e));
    }, 200);
    return () => clearTimeout(saveTimerId);
  }, [
    audienceType, conceptType, effectiveIntent, copySource, adType, selectedProductId,
    similarityValue, copyVariationValue, imageSize, imageModel, variationCount,
    copyOptions, selectedHeadlines, selectedBodyTexts, selectedCTAs,
    generationMode, gridFormat, corePromise, gridCells, keptCellIds, currentStep,
    blitzImages, blitzImageError, generatedAds, isLoadingAds, batchPublishedAt, hasStageContent,
  ]);

  // Handle brand image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImages(true);
    try {
      const uploaded = await uploadBrandImages(files);
      const stats = getDetailedCacheStats();
      setImageCacheCount(stats.count);
      setRefTopConversions(stats.topConversions);
      setRefTopCVR(stats.topConversionRate);
      console.log(`✅ Uploaded ${uploaded.length} images, cache now has ${stats.count} images`);
      // Persist metadata to Supabase for cross-account import
      const accountId = currentAccount?.ad_account_id;
      if (accountId && uploaded.length > 0) {
        saveReferenceImageMetadata(accountId, extractImageMetadata());
      }
    } catch (err) {
      console.error('Failed to upload images:', err);
    } finally {
      setIsUploadingImages(false);
      // Reset input so same files can be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle clear image cache
  const handleClearImageCache = () => {
    clearImageCache();
    removeScopedItem(REF_FETCH_MARKER_KEY);
    setImageCacheCount(0);
    setRefTopConversions(0);
    setRefTopCVR(0);
  };

  // Handle import of reference images from another account.
  // Three sources: 'local' (instant copy), 'supabase' (metadata only), 'sync' (fetch from URLs).
  const handleImageImport = useCallback(async (
    sourceAccountId: string,
    source: 'local' | 'supabase' | 'sync',
    onProgress?: (msg: string) => void,
  ): Promise<number> => {
    const accountId = currentAccount?.ad_account_id;
    const currentCacheKey = accountId
      ? `conversion_intelligence_image_cache_${accountId}`
      : 'conversion_intelligence_image_cache';

    if (source === 'local') {
      // Fast path: copy pre-cached base64 images directly
      const count = importImages(sourceAccountId, currentCacheKey);
      if (count > 0) {
        const stats = getDetailedCacheStats();
        setImageCacheCount(stats.count);
        setRefTopConversions(stats.topConversions);
        setRefTopCVR(stats.topConversionRate);
      }
      return count;
    }

    if (source === 'sync') {
      // Fetch images from the source account's sync cache creatives
      const creatives = getSyncCreatives(sourceAccountId);
      if (creatives.length === 0) return -1;

      onProgress?.(`Found ${creatives.length} converting ads. Fetching images...`);

      const result = await autoFetchConvertingAdImages(creatives, {
        maxImages: 20,
        minQuality: 60,
        onProgress: (loaded, total) => {
          onProgress?.(`Fetching image ${loaded} of ${total}...`);
        },
      });

      console.log(`[ImageImport] sync fetch result: loaded=${result.loaded}, alreadyCached=${result.alreadyCached}, failed=${result.failed}`);

      if (result.loaded > 0) {
        onProgress?.(`Imported ${result.loaded} images. Saving...`);
        const stats = getDetailedCacheStats();
        setImageCacheCount(stats.count);
        setRefTopConversions(stats.topConversions);
        setRefTopCVR(stats.topConversionRate);
        // Persist metadata to Supabase for future cross-account imports
        if (accountId) {
          saveReferenceImageMetadata(accountId, extractImageMetadata());
        }
      }
      // Only count genuinely new images, not already-cached ones
      return result.loaded > 0 ? result.loaded : (result.alreadyCached > 0 ? 0 : -1);
    }

    // source === 'supabase': metadata-only, no image data to import
    return -1;
  }, [currentAccount?.ad_account_id]);

  // Load products from scoped localStorage, falling back to Supabase metadata
  // from currentAccount.products when localStorage is empty or corrupt.
  // Depends on currentAccount?.products so the effect re-runs when the
  // authoritative fetch replaces stale cached data on the same account.
  useEffect(() => {
    // 1. Primary: scoped localStorage (full data with images)
    try {
      const storedProducts = getScopedItem(PRODUCTS_STORAGE_KEY);
      if (storedProducts) {
        const parsed: ProductContext[] = JSON.parse(storedProducts);
        if (parsed.length > 0) {
          setProducts(parsed);
          setSelectedProductId(prev => {
            if (!prev && parsed.length === 1) return parsed[0].id;
            return prev;
          });
          return;
        }
      }
    } catch {
      // localStorage missing or corrupt — fall through to Supabase metadata
    }

    // 2. Fallback: Supabase metadata via currentAccount (no images)
    if (currentAccount?.products?.length) {
      const fromMeta: ProductContext[] = currentAccount.products.map(meta => ({
        ...meta,
        productImages: [],
      }));
      setProducts(fromMeta);
      setSelectedProductId(prev => {
        if (!prev && fromMeta.length === 1) return fromMeta[0].id;
        return prev;
      });
      return;
    }

    // 3. No products from either source — clear state
    setProducts([]);
    setSelectedProductId(null);
  }, [currentAccount?.products, currentAccount?.ad_account_id]);

  // Load saved Ad Library inspirations from localStorage
  useEffect(() => {
    try {
      const stored = getScopedItem(INSPIRATIONS_STORAGE_KEY);
      if (stored) {
        const parsed: AdLibraryInspiration[] = JSON.parse(stored);
        setSavedInspirations(parsed.slice(0, MAX_SAVED_INSPIRATIONS));
      }
    } catch {
      console.warn('Failed to load ad library inspirations');
    }
  }, []);

  // Load the saved Core Promise library + the chosen one from scoped localStorage.
  // Re-runs on ad-account switch so each account sees its own promises (like Products).
  useEffect(() => {
    try {
      const stored = getScopedItem(CORE_PROMISES_STORAGE_KEY);
      const parsed: SavedCorePromise[] = stored ? JSON.parse(stored) : [];
      const list = parsed.slice(0, MAX_CORE_PROMISES);
      setSavedPromises(list);
      const savedSelection = getScopedItem(SELECTED_CORE_PROMISE_KEY);
      // Restore the prior selection if it still exists; auto-select when only one saved.
      setSelectedPromiseId(
        savedSelection && list.some(p => p.id === savedSelection)
          ? savedSelection
          : (list.length === 1 ? list[0].id : null)
      );
    } catch {
      setSavedPromises([]);
      setSelectedPromiseId(null);
    }
    setPromiseDraft('');
  }, [currentAccount?.ad_account_id]);

  // Ad Library inspiration handlers
  const handleSaveInspiration = useCallback((inspiration: AdLibraryInspiration) => {
    setSavedInspirations(prev => {
      if (prev.some(i => i.id === inspiration.id)) return prev;
      const updated = [inspiration, ...prev].slice(0, MAX_SAVED_INSPIRATIONS);
      setScopedItem(INSPIRATIONS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleRemoveInspiration = useCallback((id: string) => {
    setSavedInspirations(prev => {
      const updated = prev.filter(i => i.id !== id);
      setScopedItem(INSPIRATIONS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setActiveInspirationIds(prev => prev.filter(aid => aid !== id));
  }, []);

  const handleToggleActiveInspiration = useCallback((id: string) => {
    setActiveInspirationIds(prev => {
      if (prev.includes(id)) return prev.filter(aid => aid !== id);
      if (prev.length >= MAX_ACTIVE_INSPIRATIONS) return prev;
      return [...prev, id];
    });
  }, []);

  // ─── Core Promise library handlers ─────────────────────────────────────
  // Save the current draft to the library and select it. De-dupes by text so
  // saving the same promise twice just re-selects the existing entry.
  const handleSaveCorePromise = useCallback(() => {
    const text = promiseDraft.trim();
    if (!text) return;
    const existing = savedPromises.find(p => p.text.toLowerCase() === text.toLowerCase());
    if (existing) {
      setSelectedPromiseId(existing.id);
      setScopedItem(SELECTED_CORE_PROMISE_KEY, existing.id);
      setPromiseDraft('');
      return;
    }
    const entry: SavedCorePromise = {
      id: `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...savedPromises].slice(0, MAX_CORE_PROMISES);
    setSavedPromises(updated);
    setScopedItem(CORE_PROMISES_STORAGE_KEY, JSON.stringify(updated));
    setSelectedPromiseId(entry.id);
    setScopedItem(SELECTED_CORE_PROMISE_KEY, entry.id);
    setPromiseDraft('');
  }, [promiseDraft, savedPromises]);

  // Choose a saved promise (toggles off if it's already the active one). The
  // selection persists until changed, so a batch generation never clears it.
  const handleSelectCorePromise = useCallback((id: string) => {
    const next = selectedPromiseId === id ? null : id;
    setSelectedPromiseId(next);
    if (next) setScopedItem(SELECTED_CORE_PROMISE_KEY, next);
    else removeScopedItem(SELECTED_CORE_PROMISE_KEY);
    setPromiseDraft('');
  }, [selectedPromiseId]);

  const handleDeleteCorePromise = useCallback((id: string) => {
    const updated = savedPromises.filter(p => p.id !== id);
    setSavedPromises(updated);
    setScopedItem(CORE_PROMISES_STORAGE_KEY, JSON.stringify(updated));
    if (selectedPromiseId === id) {
      setSelectedPromiseId(null);
      removeScopedItem(SELECTED_CORE_PROMISE_KEY);
    }
  }, [savedPromises, selectedPromiseId]);

  // Typing a new promise deselects the active saved one — you're authoring a new
  // draft, which becomes the live Core Promise until you save or pick one.
  const handleCorePromiseDraftChange = useCallback((value: string) => {
    setPromiseDraft(value);
    if (selectedPromiseId) {
      setSelectedPromiseId(null);
      removeScopedItem(SELECTED_CORE_PROMISE_KEY);
    }
  }, [selectedPromiseId]);

  // Reload cached analysis when businessType changes (e.g. authoritative fetch resolves)
  useEffect(() => {
    const cached = getCachedAnalysis('meta', businessType);
    setAnalysisData(cached);
    setAnalysisImportMeta(getImportMetadata('meta'));
  }, [businessType]);

  // Load the per-account Brand Voice profile (scoped localStorage). Reloads on account switch
  // so the active account's authored voice is always the one threaded into generation.
  useEffect(() => {
    setBrandProfile(loadBrandVoiceProfile());
  }, [currentAccount?.ad_account_id]);

  // Reference image cache stats (mount-only). Account-switch refreshes are handled by
  // the auto-fetch effect below; keeping this separate keeps the batch loader focused.
  useEffect(() => {
    const imageStats = getImageCacheStats();
    setImageCacheCount(imageStats.count);
    const detailedStats = getDetailedCacheStats();
    setRefTopConversions(detailedStats.topConversions);
    setRefTopCVR(detailedStats.topConversionRate);
  }, []);

  // Load the persisted batch (from IndexedDB) on mount and whenever the ad account
  // changes. The batch — packages + the generation context that produced them — lives
  // in IndexedDB (see batchStore), which has room for the full set of images. Restoring
  // the session context rehydrates every workflow stage and lets per-image regeneration
  // re-run on-brand.
  useEffect(() => {
    debugLog('Batch load effect starting');

    let cancelled = false;
    // Scope to the same account id the scoped-localStorage helpers use, so the
    // legacy migration and the IndexedDB record stay aligned.
    const accountId = getScopedAccountId();
    setIsLoadingAds(true);

    (async () => {
      try {
        let batch = await getBatch(accountId);

        // One-time migration: if nothing in IndexedDB yet but the old localStorage
        // key holds a batch, adopt it, then remove the localStorage copy.
        if (!batch) {
          const legacy = getScopedItem(GENERATED_ADS_STORAGE_KEY);
          if (legacy) {
            try {
              const parsed = JSON.parse(legacy);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const packages = parsed.slice(0, MAX_STORED_ADS) as GeneratedAdPackage[];
                batch = {
                  accountId: accountId || '__unscoped__',
                  packages,
                  session: {},
                  publishedAt: null,
                };
                await saveBatch(accountId, { packages, session: {} });
              }
            } catch {
              /* corrupt legacy data — ignore */
            }
            removeScopedItem(GENERATED_ADS_STORAGE_KEY);
          }
        }

        if (cancelled) return;

        if (!batch) {
          // No batch for this account — blank every stage so a different/fresh account doesn't
          // show the previously-viewed account's persisted work.
          resetStageState();
          return;
        }

        // Rehydrate the generation context FIRST, so the copy stages restore even when no
        // images exist yet — locked-in copy survives a refresh with nothing to regenerate.
        // BatchSessionContext carries the real union types, so no casts are needed.
        const s = batch.session || {};
        if (s.audienceType) setAudienceType(s.audienceType);
        if (s.conceptType) setConceptType(s.conceptType);
        if (s.copySource) setCopySource(s.copySource);
        if (s.adType) setAdType(s.adType);
        if (s.selectedProductId !== undefined) setSelectedProductId(s.selectedProductId);
        if (typeof s.similarityValue === 'number') setSimilarityValue(s.similarityValue);
        if (typeof s.copyVariationValue === 'number') setCopyVariationValue(s.copyVariationValue);
        if (s.imageSize) setImageSize(s.imageSize);
        if (s.imageModel) setImageModel(s.imageModel);
        if (typeof s.variationCount === 'number') setVariationCount(s.variationCount);
        if (s.copyOptions !== undefined) setCopyOptions(s.copyOptions);
        if (Array.isArray(s.selectedHeadlines)) setSelectedHeadlines(s.selectedHeadlines);
        if (Array.isArray(s.selectedBodyTexts)) setSelectedBodyTexts(s.selectedBodyTexts);
        if (Array.isArray(s.selectedCTAs)) setSelectedCTAs(s.selectedCTAs);
        if (s.generationMode) setGenerationMode(s.generationMode);
        if (s.gridFormat) setGridFormat(s.gridFormat);
        // Content fields are set authoritatively (with empty defaults) so they never leak from a
        // previously-viewed account when this account's batch lacks them.
        setGridCells(Array.isArray(s.gridCells) ? s.gridCells : null);
        setKeptCellIds(new Set(Array.isArray(s.keptCellIds) ? s.keptCellIds : []));
        setBlitzImages(Array.isArray(batch.blitzImages) ? batch.blitzImages : []);
        setBlitzImageError(s.blitzImageError);
        if (s.campaignIntent) {
          userChangedIntentRef.current = true;
          setCampaignIntent(s.campaignIntent);
        }
        // Restore the saved stage. 'grid-images' falls back to 'grid-review' when the pool is
        // empty (e.g. an old record saved before pools persisted); a missing step → 'config'.
        const hasPool = Array.isArray(batch.blitzImages) && batch.blitzImages.some(img => img != null);
        const savedStep = s.currentStep ?? 'config';
        setCurrentStep(savedStep === 'grid-images' && !hasPool ? 'grid-review' : savedStep);

        // Restore the generated image batch if this account has one.
        if (Array.isArray(batch.packages) && batch.packages.length > 0) {
          setGeneratedAds(batch.packages.slice(0, MAX_STORED_ADS));
          setBatchPublishedAt(batch.publishedAt ?? null);
        } else {
          setGeneratedAds([]);
          setBatchPublishedAt(null);
        }
        setStorageWarning(null);
      } catch (e) {
        console.error('[AdGenerator] Failed to load batch:', e);
        if (!cancelled) setGeneratedAds([]);
      } finally {
        if (!cancelled) setIsLoadingAds(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentAccount?.ad_account_id, resetStageState]);

  // Auto-fetch converting ad images when account resolves or changes
  const lastFetchedAccountRef = useRef<string | null>(null);
  const pendingAccountRef = useRef<string | null>(null);

  const runAutoFetch = useCallback((accountId: string) => {
    // Refresh cache stats for the (possibly new) account
    const imageStats = getImageCacheStats();
    setImageCacheCount(imageStats.count);
    const detailedStats = getDetailedCacheStats();
    setRefTopConversions(detailedStats.topConversions);
    setRefTopCVR(detailedStats.topConversionRate);

    const syncKey = `ci_meta_ads_sync_${accountId}`;
    try {
      const syncDataRaw = localStorage.getItem(syncKey);
      if (!syncDataRaw) return;
      const syncData = JSON.parse(syncDataRaw);
      const syncedAt = syncData.syncedAt as number | undefined;
      const convertingCreatives = (syncData.creatives || []).filter(
        (c: { conversions?: number; imageUrl?: string }) => (c.conversions ?? 0) > 0 && c.imageUrl
      );
      if (convertingCreatives.length === 0) return;

      // Check if reference images are already cached from this exact sync data.
      // Skip re-fetch if: same account, same sync version, and cache has images.
      const markerRaw = getScopedItem(REF_FETCH_MARKER_KEY);
      if (markerRaw && imageStats.count > 0) {
        try {
          const marker = JSON.parse(markerRaw);
          if (marker.accountId === accountId && marker.syncedAt === syncedAt) {
            lastFetchedAccountRef.current = accountId;
            return;
          }
        } catch { /* invalid marker, proceed with fetch */ }
      }

      lastFetchedAccountRef.current = accountId;
      autoFetchTriggeredRef.current = true;
      setIsAutoFetchingRefs(true);
      setAutoFetchProgress({ loaded: 0, total: Math.min(convertingCreatives.length, 20) });

      autoFetchConvertingAdImages(convertingCreatives, {
        onProgress: (loaded, total) => {
          setAutoFetchProgress({ loaded, total });
          const stats = getDetailedCacheStats();
          setImageCacheCount(stats.count);
          setRefTopConversions(stats.topConversions);
          setRefTopCVR(stats.topConversionRate);
        },
      }).then(() => {
        const finalStats = getDetailedCacheStats();
        setImageCacheCount(finalStats.count);
        setRefTopConversions(finalStats.topConversions);
        setRefTopCVR(finalStats.topConversionRate);
        // Mark that reference images are cached for this sync version
        setScopedItem(REF_FETCH_MARKER_KEY, JSON.stringify({ accountId, syncedAt }));
        // Persist metadata to Supabase so other accounts can see it for import
        const metadata = extractImageMetadata();
        if (metadata.length > 0) {
          saveReferenceImageMetadata(accountId, metadata);
        }
      }).finally(() => {
        setIsAutoFetchingRefs(false);
        setAutoFetchProgress(null);
        autoFetchTriggeredRef.current = false;
        // If account changed while we were fetching, re-trigger for the new account
        if (pendingAccountRef.current && pendingAccountRef.current !== accountId) {
          const next = pendingAccountRef.current;
          pendingAccountRef.current = null;
          runAutoFetch(next);
        }
      });
    } catch {
      // Non-critical — sync cache may not exist yet
    }
  }, []);

  useEffect(() => {
    const accountId = currentAccount?.ad_account_id || 'default';

    // Skip if we already fetched for this account
    if (lastFetchedAccountRef.current === accountId) return;

    // If a fetch is in progress for a different account, queue this one
    if (autoFetchTriggeredRef.current) {
      pendingAccountRef.current = accountId;
      return;
    }

    runAutoFetch(accountId);
  }, [currentAccount?.ad_account_id, runAutoFetch]);

  // Hand the batch to the publisher and persist it before navigating. The in-memory
  // publishStore is the PRIMARY, synchronous handoff (no size limit), so navigation
  // never waits on storage. The IndexedDB write is the backup that survives a hard
  // refresh on the publisher — fire-and-forget, since it lands in a few ms.
  const flushAdsToStorage = useCallback(() => {
    if (generatedAds.length === 0) return;

    // PRIMARY: in-memory store (always works, no size limits)
    setPublishData(generatedAds, effectiveIntent);

    // BACKUP: IndexedDB, full images intact (no stripping, no quota dance)
    saveBatch(getScopedAccountId(), {
      packages: generatedAds.slice(0, MAX_STORED_ADS),
      session: sessionRef.current,
      publishedAt: batchPublishedAt,
    }).catch(e => console.warn('[AdGenerator] Failed to persist batch on flush:', e));
  }, [generatedAds, effectiveIntent, batchPublishedAt]);

  // "Clear All" — remove the generated IMAGES only. The copy stages (options, selections,
  // Blitz grid) stay in memory and the persistence effect re-saves them image-free, so the
  // user can regenerate images without losing locked-in copy. Use "Start over" to scrap copy.
  const handleClearAllAds = useCallback(() => {
    if (!window.confirm('Delete all generated creatives? Your copy is kept so you can regenerate images — use "Start over / New brief" to clear the copy too.')) return;
    setGeneratedAds([]);
    setBlitzImages([]);        // the Blitz image pool is generated imagery too
    setBlitzImageError(undefined);
    setBatchPublishedAt(null);
    clearImageCache(); // Also clear reference image cache to free storage space
    setStorageWarning(null);
    setVisibleAdsCount(ADS_PER_PAGE);
    // The persistence effect re-saves the copy-only session automatically when copy exists.
    // If there's no copy to keep, remove the record now (the effect won't clean it up).
    const session = sessionRef.current;
    const keepsCopy = !!session.copyOptions || (session.gridCells?.length ?? 0) > 0;
    if (!keepsCopy) clearBatch(getScopedAccountId()).catch(() => { /* non-critical */ });
  }, []);

  // "Start over / New brief" — scrap EVERY output stage (copy, selections, Blitz grid, and
  // generated creatives) and return to a blank config. Unlike "Clear All" (images only, copy
  // kept), this wipes the copy too so nothing rehydrates on refresh.
  const handleStartOver = useCallback(() => {
    if (!window.confirm('Start a new brief? This scraps the generated copy, Blitz grid, selections, and creatives for this account so you begin from a blank slate. This cannot be undone.')) return;
    resetStageState();          // copy, selections, Blitz grid + pool, creatives → back to config
    setVisibleAdsCount(ADS_PER_PAGE);
    setStorageWarning(null);
    setError(null);
    // Wipe the persisted record so nothing rehydrates on refresh.
    clearBatch(getScopedAccountId()).catch(() => { /* non-critical */ });
  }, [resetStageState]);

  // Load more ads
  const handleLoadMore = useCallback(() => {
    setVisibleAdsCount(prev => prev + ADS_PER_PAGE);
  }, []);

  // Toggle handlers for selections — memoized to prevent CopySelectionPanel re-renders
  const handleHeadlineToggle = useCallback((id: string) => {
    setSelectedHeadlines(prev =>
      prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]
    );
  }, []);

  const handleBodyTextToggle = useCallback((id: string) => {
    setSelectedBodyTexts(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  }, []);

  const handleCTAToggle = useCallback((id: string) => {
    setSelectedCTAs(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }, []);

  // Regenerate a single copy item (headline, body text, or CTA)
  const handleRegenerateCopy = useCallback(async (
    copyType: 'headline' | 'bodyText' | 'callToAction',
    copyId: string
  ) => {
    if (!copyOptions || regeneratingCopyId !== null) return;

    setError(null);

    // Filter out the item being regenerated — the AI should only avoid the items that will REMAIN
    const existingItems = copyType === 'headline'
      ? copyOptions.headlines.filter(item => item.id !== copyId)
      : copyType === 'bodyText'
      ? copyOptions.bodyTexts.filter(item => item.id !== copyId)
      : copyOptions.callToActions.filter(item => item.id !== copyId);

    // Find the text of the item being replaced so the AI knows what to avoid
    const allItems = copyType === 'headline'
      ? copyOptions.headlines
      : copyType === 'bodyText'
      ? copyOptions.bodyTexts
      : copyOptions.callToActions;
    const itemToReplace = allItems.find(item => item.id === copyId)?.text;

    const wasSelected = copyType === 'headline'
      ? selectedHeadlines.includes(copyId)
      : copyType === 'bodyText'
      ? selectedBodyTexts.includes(copyId)
      : selectedCTAs.includes(copyId);

    setRegeneratingCopyId(copyId);

    try {
      const activeInspirations = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const newItem = await regenerateSingleCopy({
        copyType,
        existingItems,
        itemToReplace,
        audienceType,
        conceptType,
        analysisData,
        brandProfile: brandProfile || undefined,
        copyLength,
        copyVariationLevel: copyVariationValue,
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirations.length > 0 ? activeInspirations : undefined,
        businessType,
        campaignIntent: effectiveIntent,
        corePromise: corePromise.trim() || undefined,
      });

      // Replace the old item with the new one
      setCopyOptions(prev => {
        if (!prev) return prev;
        const key = copyType === 'headline' ? 'headlines'
          : copyType === 'bodyText' ? 'bodyTexts'
          : 'callToActions';
        return {
          ...prev,
          [key]: prev[key].map(item => item.id === copyId ? newItem : item),
        };
      });

      // Preserve selection state
      if (wasSelected) {
        if (copyType === 'headline') {
          setSelectedHeadlines(prev => prev.map(id => id === copyId ? newItem.id : id));
        } else if (copyType === 'bodyText') {
          setSelectedBodyTexts(prev => prev.map(id => id === copyId ? newItem.id : id));
        } else {
          setSelectedCTAs(prev => prev.map(id => id === copyId ? newItem.id : id));
        }
      }
    } catch (err: unknown) {
      console.error(`Failed to regenerate ${copyType}:`, err);
      setError(err instanceof Error ? err.message : `Failed to regenerate. Please try again.`);
    } finally {
      setRegeneratingCopyId(null);
    }
  }, [
    copyOptions, regeneratingCopyId, selectedHeadlines, selectedBodyTexts, selectedCTAs,
    savedInspirations, activeInspirationIds, audienceType, conceptType, analysisData,
    copyLength, copyVariationValue, selectedProduct, corePromise,
  ]);

  // Stable callback wrappers for CopySelectionPanel memo
  const handleRegenerateHeadline = useCallback(
    (id: string) => handleRegenerateCopy('headline', id),
    [handleRegenerateCopy]
  );

  const handleRegenerateBodyText = useCallback(
    (id: string) => handleRegenerateCopy('bodyText', id),
    [handleRegenerateCopy]
  );

  const handleRegenerateCTA = useCallback(
    (id: string) => handleRegenerateCopy('callToAction', id),
    [handleRegenerateCopy]
  );

  // ─── BlitzScale grid handlers ──────────────────────────────────────────
  const gridCellCount = Math.min(gridAngles.length * gridHooks.length, GRID_CELL_CAP);
  const gridOverCap = gridAngles.length * gridHooks.length > GRID_CELL_CAP;
  // First unmet requirement for the grid — surfaced under the disabled Generate button so it
  // never sits dead with no explanation (Core Promise is required in grid mode, easy to miss).
  const gridBlockReason =
    gridAngles.length === 0 ? 'Select at least one angle'
    : gridHooks.length === 0 ? 'Select at least one hook'
    : !corePromise.trim() ? (savedPromises.length > 0 ? 'Pick or add a Core Promise to continue' : 'Add a Core Promise to continue')
    : gridOverCap ? `Reduce to ${GRID_CELL_CAP} or fewer creatives to generate`
    : null;

  const toggleGridAngle = useCallback((id: GridAngle) => {
    setGridAngles(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  }, []);
  const toggleGridHook = useCallback((id: HookType) => {
    setGridHooks(prev => prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]);
  }, []);

  // Enter grid mode, pre-selecting any prior winning angle/hook (compounding loop).
  const enterGridMode = useCallback(() => {
    setGenerationMode('grid');
    const ai = analysisData?.axisInsights;
    if (!ai) return;
    if (isValidAngle(ai.winningAngle)) {
      setGridAngles(prev => prev.includes(ai.winningAngle as GridAngle) ? prev : [ai.winningAngle as GridAngle, ...prev]);
    }
    if (isValidHook(ai.winningHook)) {
      setGridHooks(prev => prev.includes(ai.winningHook as HookType) ? prev : [ai.winningHook as HookType, ...prev]);
    }
  }, [analysisData]);
  const handleToggleKeepCell = useCallback((id: string) => {
    setKeptCellIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleGenerateGrid = async () => {
    if (!isOpenAIConfigured()) { setError('OpenAI API is not configured. Please contact your administrator.'); return; }
    if (!corePromise.trim()) { setError('Blitz Testing needs a Core Promise — the one idea every creative anchors to.'); return; }
    if (gridAngles.length === 0 || gridHooks.length === 0) { setError('Select at least one angle and one hook.'); return; }
    if (gridAngles.length * gridHooks.length > GRID_CELL_CAP) {
      setError(`That's ${gridAngles.length * gridHooks.length} creatives — reduce angles or hooks to stay at or under ${GRID_CELL_CAP}.`);
      return;
    }
    setIsGeneratingGrid(true);
    setError(null);
    setGenerationProgress('ConversionIQ™ generating the copy matrix...');
    try {
      const activeInspirations = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const cells = await generateGridCopy({
        corePromise: corePromise.trim(),
        angles: gridAngles,
        hooks: gridHooks,
        format: gridFormat,
        audienceType,
        analysisData,
        brandProfile: brandProfile || undefined,
        copyLength,
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirations.length > 0 ? activeInspirations : undefined,
        businessType,
        campaignIntent: effectiveIntent,
      });
      if (cells.length === 0) { setError('The grid came back empty — please try again.'); return; }
      setGridCells(cells);
      setKeptCellIds(new Set(cells.map(c => c.id)));
      setBlitzImages([]); // fresh copy matrix — drop any prior image pool
      setBlitzImageError(undefined);
      setCurrentStep('grid-review');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate the grid. Please try again.');
    } finally {
      setIsGeneratingGrid(false);
      setGenerationProgress('');
    }
  };

  const handleRerollGridCell = async (cellId: string) => {
    if (!gridCells) return;
    const cell = gridCells.find(c => c.id === cellId);
    if (!cell) return;
    setRegeneratingCellId(cellId);
    setError(null);
    try {
      const activeInspirations = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const fresh = await generateGridCopy({
        corePromise: corePromise.trim(),
        angles: [cell.angle],
        hooks: [cell.hook],
        format: gridFormat,
        audienceType,
        analysisData,
        brandProfile: brandProfile || undefined,
        copyLength,
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirations.length > 0 ? activeInspirations : undefined,
        businessType,
        campaignIntent: effectiveIntent,
      });
      if (fresh.length > 0) {
        const replacement: GridCell = { ...fresh[0], id: cell.id };
        setGridCells(prev => prev ? prev.map(c => c.id === cellId ? replacement : c) : prev);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reroll this cell.');
    } finally {
      setRegeneratingCellId(null);
    }
  };

  // Kept cells — the single derived source for the strategy preview, the plan, and the handlers
  // (dedupes the gridCells.filter(keptCellIds) that previously ran in three places).
  const keptCells = useMemo(
    () => (gridCells ? gridCells.filter(c => keptCellIds.has(c.id)) : []),
    [gridCells, keptCellIds],
  );
  const keptCellCount = keptCells.length;
  // The concrete image plan: how many images, which cell uses which slot, and a label per slot.
  // Derived (not stored) — keptCells + strategy are frozen between generation and publish, so this
  // always matches the plan the rendered pool was built from.
  const blitzPlan = useMemo(
    () => planBlitzImageSlots(keptCells, blitzImageStrategy),
    [keptCells, blitzImageStrategy],
  );
  // Render count per strategy for the selector preview — planned axes on the config step (no copy
  // yet), the kept set's distinct angles/hooks afterward.
  const blitzStrategyCounts = useMemo<Record<BlitzImageStrategy, number>>(() => {
    if (currentStep === 'config') {
      const angles = gridAngles.length, hooks = gridHooks.length;
      return blitzStrategyImageCounts({ angles, hooks, cells: Math.min(angles * hooks, GRID_CELL_CAP) });
    }
    return blitzStrategyImageCounts({
      angles: new Set(keptCells.map(c => c.angle)).size,
      hooks: new Set(keptCells.map(c => c.hook)).size,
      cells: keptCells.length,
    });
  }, [currentStep, gridAngles.length, gridHooks.length, keptCells]);

  // Step 1 of the Blitz image flow: render the small image pool the strategy calls for (far fewer
  // than one-per-cell) and land on the review step. Credits are charged for images actually rendered.
  const handleGenerateBlitzImages = async () => {
    if (keptCells.length === 0) { setError('Keep at least one creative to generate.'); return; }
    const imageCount = blitzPlan.slotCount;

    setIsGeneratingCreatives(true);
    setError(null);
    setGenerationProgress('ConversionIQ™ preparing the batch...');

    let transactionId: string | undefined;
    try {
      const reservation = await reserveCredits('image_ad', imageCount);
      transactionId = reservation.transactionId;
    } catch (err: unknown) {
      setIsGeneratingCreatives(false);
      setGenerationProgress('');
      if (err instanceof InsufficientCreditsError) {
        setCreditModalData({ remaining: err.creditsRemaining, required: err.creditsRequired });
        setShowCreditModal(true);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to reserve credits.');
      return;
    }

    try {
      const activeInspirations = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const result = await regenerateAllImages({
        audienceType,
        analysisData,
        variationCount: imageCount,
        similarityLevel: similarityValue,
        imageSize,
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirations.length > 0 ? activeInspirations : undefined,
        businessType,
        campaignIntent: effectiveIntent,
        imageModel,
        formatHint: gridFormat,
        onProgress: setGenerationProgress,
      });
      if (result.images.length === 0) {
        if (transactionId) refundCredits(transactionId);
        setGenerationProgress('');
        setError(result.imageError || 'Image generation failed. Please try again.');
        return;
      }
      if (transactionId) confirmCredits(transactionId);
      setBlitzImages(result.indexedResults);   // slot-aligned (null = a slot whose render failed)
      setBlitzImageError(result.imageError);
      setGenerationProgress('');
      setCurrentStep('grid-images');
    } catch (err: unknown) {
      if (transactionId) refundCredits(transactionId);
      setGenerationProgress('');
      setError(err instanceof Error ? err.message : 'Failed to generate images for the Blitz Test. Please try again.');
    } finally {
      setIsGeneratingCreatives(false);
    }
  };

  // Reroll a single image in the reviewed pool (free, mirrors the single-ad per-image regen).
  const handleRegenerateBlitzImage = async (index: number) => {
    if (regeneratingBlitzIndex !== null) return;
    setRegeneratingBlitzIndex(index);
    setError(null);
    try {
      const activeInspirations = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const newImage = await generateAdImage({
        audienceType,
        analysisData,
        variationIndex: index,
        totalVariations: blitzImages.length,
        similarityLevel: similarityValue,
        imageSize,
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirations.length > 0 ? activeInspirations : undefined,
        businessType,
        campaignIntent: effectiveIntent,
        imageModel,
        formatHint: gridFormat,
      });
      setBlitzImages(prev => prev.map((img, i) => (i === index ? newImage : img)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate this image.');
    } finally {
      setRegeneratingBlitzIndex(null);
    }
  };

  // Step 2: assign each kept cell the pooled image its strategy plan points at (one package per
  // cell), then hand off to the publisher — matching the single flow's publish handoff.
  const handlePublishBlitz = () => {
    if (keptCells.length === 0) { setError('Keep at least one creative to publish.'); return; }
    if (blitzImages.length === 0) { setError('Generate at least one image first.'); return; }

    const packages = buildGridPackages({
      cells: keptCells,
      images: blitzImages,
      slotForCell: blitzPlan.slotForCell,
      audienceType,
      campaignIntent: effectiveIntent,
      format: gridFormat,
      corePromise: corePromise.trim(),
      imageError: blitzImageError,
    });
    setBatchPublishedAt(null); // new batch — not yet published
    setGeneratedAds(prev => [...packages, ...prev]);
    // Hand the batch to the publisher (in-memory store) and navigate — matches the single flow.
    setPublishData([...packages], effectiveIntent);
    navigate('/publish');
  };

  // Generate copy options
  const handleGenerateCopyOptions = async () => {
    const hasTextApi = isOpenAIConfigured();
    if (!hasTextApi) {
      setError('OpenAI API is not configured. Please contact your administrator.');
      return;
    }

    setIsGeneratingCopy(true);
    setError(null);
    setGenerationProgress('ConversionIQ™ generating headline and body copy options...');

    try {
      const activeInspirations = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const result = await generateCopyOptions({
        audienceType,
        conceptType,
        analysisData,
        brandProfile: brandProfile || undefined,
        copyLength,
        copyVariationLevel: copyVariationValue,
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirations.length > 0 ? activeInspirations : undefined,
        businessType,
        campaignIntent: effectiveIntent,
        corePromise: corePromise.trim() || undefined,
      });

      setCopyOptions(result);
      setSelectedHeadlines([]);
      setSelectedBodyTexts([]);
      setSelectedCTAs([]);
      setCurrentStep('copy-selection');
      setGenerationProgress('');
    } catch (err: unknown) {
      console.error('Copy generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate copy options. Please try again.');
    } finally {
      setIsGeneratingCopy(false);
      setGenerationProgress('');
    }
  };

  // Credit exhaustion modal state
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditModalData, setCreditModalData] = useState({ remaining: 0, required: 0 });

  // Generate final creatives
  const handleGenerateCreatives = async () => {
    // --- Library images path: skip AI generation & credits entirely ---
    if (libraryImages.length > 0 && adType === 'image') {
      setIsGeneratingCreatives(true);
      setError(null);
      setGenerationProgress('Loading library images...');

      try {
        // Get selected copy
        const selectedHeadlineTexts = copyOptions?.headlines
          .filter(h => selectedHeadlines.includes(h.id))
          .map(h => h.text) || [];
        const selectedHeadlineHooks = copyOptions?.headlines
          .filter(h => selectedHeadlines.includes(h.id))
          .map(h => h.hook ?? null) || [];
        const selectedBodyTextTexts = copyOptions?.bodyTexts
          .filter(b => selectedBodyTexts.includes(b.id))
          .map(b => b.text) || [];
        const selectedCTATexts = copyOptions?.callToActions
          .filter(c => selectedCTAs.includes(c.id))
          .map(c => c.text) || [];

        // Fetch full-res images for each library item
        const images: { imageUrl: string; revisedPrompt: string }[] = [];
        for (const img of libraryImages) {
          const fullImg = (img as SwipeLibraryItem & { _fullImageData?: string; _fullImageMime?: string });
          if (fullImg._fullImageData && fullImg._fullImageMime) {
            images.push({
              imageUrl: `data:${fullImg._fullImageMime};base64,${fullImg._fullImageData}`,
              revisedPrompt: 'From Swipe Library',
            });
          } else {
            // Fetch on demand if not already loaded
            const data = await fetchSwipeImage(img.id);
            images.push({
              imageUrl: `data:${data.image_mime_type};base64,${data.image_data}`,
              revisedPrompt: 'From Swipe Library',
            });
          }
        }

        const result: GeneratedAdPackage = {
          id: `lib_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          generatedAt: new Date().toISOString(),
          adType: 'image',
          audienceType,
          conceptType,
          images,
          headlineHooks: selectedHeadlineHooks,
          copy: {
            headlines: selectedHeadlineTexts,
            bodyTexts: selectedBodyTextTexts,
            callToActions: selectedCTATexts,
            rationale: 'Using saved winning creatives from Swipe Library',
          },
          whyItWorks: 'Using saved winning creatives from Swipe Library',
          campaignIntent: effectiveIntent,
        };

        setBatchPublishedAt(null); // new batch — not yet published
        setGeneratedAds(prev => [result, ...prev]);
        setLibraryImages([]); // Clear after use
      } catch (err: unknown) {
        console.error('Library image generation failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load library images.');
      } finally {
        setIsGeneratingCreatives(false);
        setGenerationProgress('');
      }
      return;
    }

    // Text ads use Canvas rendering — no API keys needed for image generation
    if (adType !== 'text') {
      const hasImageApi = isGeminiConfigured() || isOpenAIConfigured();
      const hasTextApi = isOpenAIConfigured();

      if (!hasImageApi && !hasTextApi) {
        setError('No AI API keys configured. Please contact your administrator.');
        return;
      }

      // Only require OpenAI for AI-generated copy; import/manual copy doesn't need it
      if (!hasTextApi && copySource === 'generate') {
        setError('OpenAI API is not configured. Please contact your administrator.');
        return;
      }
    }

    // Validate text ad has primary text
    if (adType === 'text' && !textAdPrimaryText.trim()) {
      setError('Primary text is required for text ad generation.');
      return;
    }

    // Show loading immediately for instant feedback
    setIsGeneratingCreatives(true);
    setError(null);
    setGenerationProgress('ConversionIQ™ preparing generation...');

    // Determine credit action type and reserve credits
    const creditActionType: CreditActionType = adType === 'video' ? 'video_ad'
      : adType === 'text' ? 'text_ad'
      : 'image_ad';

    let transactionId: string | undefined;
    try {
      const reservation = await reserveCredits(creditActionType, variationCount);
      transactionId = reservation.transactionId;
    } catch (err: unknown) {
      if (err instanceof InsufficientCreditsError) {
        setIsGeneratingCreatives(false);
        setGenerationProgress('');
        setCreditModalData({ remaining: err.creditsRemaining, required: err.creditsRequired });
        setShowCreditModal(true);
        return;
      }
      // Non-credit error — let generation proceed (credits may not be configured yet)
      console.warn('Credit reservation failed, proceeding:', err);
    }

    // Get selected text content
    const selectedHeadlineTexts = copyOptions?.headlines
      .filter(h => selectedHeadlines.includes(h.id))
      .map(h => h.text) || [];
    const selectedHeadlineHooks = copyOptions?.headlines
      .filter(h => selectedHeadlines.includes(h.id))
      .map(h => h.hook ?? null) || [];
    const selectedBodyTextTexts = copyOptions?.bodyTexts
      .filter(b => selectedBodyTexts.includes(b.id))
      .map(b => b.text) || [];
    const selectedCTATexts = copyOptions?.callToActions
      .filter(c => selectedCTAs.includes(c.id))
      .map(c => c.text) || [];

    // Resolve image headlines based on mode
    let imageHeadlines: string[] | undefined;
    if (adType === 'image' && headlineInImageMode !== 'none') {
      if (headlineInImageMode === 'custom' && customImageHeadline.trim()) {
        imageHeadlines = [customImageHeadline.trim()];
      } else if (headlineInImageMode === 'from-copy' && selectedHeadlineTexts.length > 0) {
        imageHeadlines = selectedHeadlineTexts;
      }
    }

    setGenerationProgress(adType === 'text'
      ? 'ConversionIQ™ rendering text creatives...'
      : adType === 'image'
        ? 'ConversionIQ™ generating images and finalizing copy...'
        : isGeminiConfigured()
          ? 'ConversionIQ™ generating video...'
          : 'ConversionIQ™ creating video storyboard...');

    try {
      const activeInspirationsForCreative = savedInspirations.filter(i => activeInspirationIds.includes(i.id));
      const result = await generateAdPackage({
        adType,
        audienceType,
        conceptType,
        variationCount,
        analysisData,
        selectedCopy: {
          headlines: selectedHeadlineTexts,
          bodyTexts: selectedBodyTextTexts,
          callToActions: selectedCTATexts,
        },
        similarityLevel: similarityValue, // 0 = identical to references, 100 = completely different
        imageSize, // Selected image dimensions/aspect ratio
        productContext: selectedProduct || undefined,
        adLibraryInspirations: activeInspirationsForCreative.length > 0 ? activeInspirationsForCreative : undefined,
        imageHeadlines,
        videoConfig: adType === 'video' ? {
          aspectRatio: videoAspectRatio,
          duration: videoDuration,
          resolution: '720p' as const,
          model: videoModel,
        } : undefined,
        textAdConfig: adType === 'text' ? {
          primaryText: textAdPrimaryText,
          highlightText: textAdHighlightText || undefined,
          anchorText: textAdAnchorText || undefined,
          styleIds: selectedTextStyles,
        } : undefined,
        onProgress: setGenerationProgress,
        businessType,
        campaignIntent: effectiveIntent,
        imageModel,
      });

      // Confirm credit consumption on success
      if (transactionId) {
        confirmCredits(transactionId);
      }

      result.headlineHooks = selectedHeadlineHooks;
      setBatchPublishedAt(null); // new batch — not yet published
      setGeneratedAds(prev => [result, ...prev]);
      setGenerationProgress('');
      // Stay on final-config so user can regenerate with same copy selections
      // Copy options and selections are preserved intentionally
    } catch (err: unknown) {
      // Refund credits on failure
      if (transactionId) {
        refundCredits(transactionId);
      }
      console.error('Generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate ad. Please try again.');
    } finally {
      setIsGeneratingCreatives(false);
      setGenerationProgress('');
    }
  };

  // Navigate back
  const handleBackToConfig = () => {
    setCurrentStep('config');
  };

  // Jump to any workflow stage from the clickable stepper. Stages 2 and 3 are only
  // reachable once copy options exist, so a persisted batch can be reviewed at every
  // stage (and regenerated) without re-running from scratch.
  const goToStep = useCallback((step: WorkflowStep) => {
    if (step === 'config') { setCurrentStep('config'); return; }
    if (!copyOptions) return; // no copy yet — stages 2/3 unavailable
    if (step === 'copy-selection' || step === 'final-config') setCurrentStep(step);
  }, [copyOptions]);

  // Keyboard activation (Enter/Space) for the clickable stepper chips. goToStep already
  // guards reachability, so this stays uniform across all three chips.
  const onStepKeyDown = useCallback(
    (step: WorkflowStep) => (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToStep(step); }
    },
    [goToStep]
  );

  const handleProceedToFinalConfig = () => {
    setCurrentStep('final-config');
  };

  const handleBackFromFinalConfig = () => {
    if (copySource === 'manual') {
      setCurrentStep('config');
    } else {
      setCurrentStep('copy-selection');
    }
  };

  // Copy source change handler — reset copy state to avoid stale data
  const handleCopySourceChange = (source: CopySource) => {
    setCopySource(source);
    setCopyOptions(null);
    setSelectedHeadlines([]);
    setSelectedBodyTexts([]);
    setSelectedCTAs([]);
    setError(null);
    if (source === 'manual') {
      setManualHeadlines(['']);
      setManualBodyTexts(['']);
      setManualCTAs(['']);
    }
    if (source === 'swipe') {
      openSwipePicker('step1', ['headline', 'body_copy']);
    }
  };

  // Import top-performing copy from Meta ad account
  const handleImportCopy = async () => {
    setIsImportingCopy(true);
    setError(null);

    try {
      const creatives = await fetchAdCreatives({ datePreset: importDatePreset });

      const sorted = [...creatives]
        .filter(c => c.conversions > 0)
        .sort((a, b) => b.conversionRate - a.conversionRate);

      if (sorted.length === 0) {
        setError('No converting ads found in the selected date range. Try a wider range or generate new copy instead.');
        return;
      }

      const seenHeadlines = new Set<string>();
      const seenBodies = new Set<string>();
      const headlines: CopyOption[] = [];
      const bodyTexts: CopyOption[] = [];

      for (const ad of sorted) {
        if (ad.headline && !seenHeadlines.has(ad.headline) && headlines.length < 8) {
          seenHeadlines.add(ad.headline);
          headlines.push({
            id: `imported_h_${headlines.length}`,
            text: ad.headline,
            rationale: `${ad.conversionRate.toFixed(1)}% CVR | $${ad.costPerConversion.toFixed(2)} CPA | ${ad.conversions} conv`,
          });
        }

        const body = ad.bodySnippet;
        if (body && body !== 'No ad copy available' && !seenBodies.has(body) && bodyTexts.length < 6) {
          seenBodies.add(body);
          bodyTexts.push({
            id: `imported_b_${bodyTexts.length}`,
            text: body,
            rationale: `From: "${ad.headline}" | ${ad.conversionRate.toFixed(1)}% CVR | $${ad.costPerConversion.toFixed(2)} CPA`,
          });
        }
      }

      if (headlines.length === 0) {
        setError('Could not extract usable copy from your ads. Try generating new copy instead.');
        return;
      }

      // No CTAs — user sets CTA button type in the Ad Publisher
      setCopyOptions({ headlines, bodyTexts, callToActions: [] });
      setSelectedHeadlines([]);
      setSelectedBodyTexts([]);
      setSelectedCTAs([]);
      setCurrentStep('copy-selection');
    } catch (err: unknown) {
      console.error('Import copy failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to import copy from ad account.');
    } finally {
      setIsImportingCopy(false);
    }
  };

  // Submit manually entered copy — skip Step 2, go to final-config
  const handleManualCopySubmit = () => {
    const headlines: CopyOption[] = manualHeadlines
      .filter(h => h.trim())
      .map((h, i) => ({ id: `manual_h_${i}`, text: h.trim(), rationale: 'Manually entered' }));
    const bodyTexts: CopyOption[] = manualBodyTexts
      .filter(b => b.trim())
      .map((b, i) => ({ id: `manual_b_${i}`, text: b.trim(), rationale: 'Manually entered' }));
    const callToActions: CopyOption[] = manualCTAs
      .filter(c => c.trim())
      .map((c, i) => ({ id: `manual_cta_${i}`, text: c.trim(), rationale: 'Manually entered' }));

    setCopyOptions({ headlines, bodyTexts, callToActions });
    // Auto-select all manual entries
    setSelectedHeadlines(headlines.map(h => h.id));
    setSelectedBodyTexts(bodyTexts.map(b => b.id));
    setSelectedCTAs(callToActions.map(c => c.id));
    // Skip Step 2 — go directly to final-config
    setCurrentStep('final-config');
  };

  // Build CopyOption[] from swipe library items (shared helper)
  const buildSwipeCopyOptions = (items: SwipeLibraryItem[]) => {
    const newHeadlines: CopyOption[] = items
      .filter(i => i.element_type === 'headline')
      .map(i => ({
        id: `swipe_h_${i.id}`,
        text: i.text_content || '',
        rationale: `Saved${i.performance_snapshot.cvr ? ` • ${i.performance_snapshot.cvr.toFixed(1)}% CVR` : ''}${i.performance_snapshot.cpa ? ` • $${i.performance_snapshot.cpa.toFixed(2)} CPA` : ''}`,
      }));
    const newBodyTexts: CopyOption[] = items
      .filter(i => i.element_type === 'body_copy')
      .map(i => ({
        id: `swipe_b_${i.id}`,
        text: i.text_content || '',
        rationale: `Saved${i.performance_snapshot.cvr ? ` • ${i.performance_snapshot.cvr.toFixed(1)}% CVR` : ''}${i.performance_snapshot.cpa ? ` • $${i.performance_snapshot.cpa.toFixed(2)} CPA` : ''}`,
      }));
    return { newHeadlines, newBodyTexts };
  };

  // Handle Swipe Library picker selection
  const handleSwipeLibrarySelect = (items: SwipeLibraryItem[]) => {
    setShowSwipePicker(false);

    if (swipePickerContext === 'step1' && copySource === 'manual') {
      // In manual mode, populate the manual entry fields
      const headlines = items.filter(i => i.element_type === 'headline').map(i => i.text_content || '');
      const bodies = items.filter(i => i.element_type === 'body_copy').map(i => i.text_content || '');
      if (headlines.length > 0) setManualHeadlines(headlines);
      if (bodies.length > 0) setManualBodyTexts(bodies);
    } else if (swipePickerContext === 'step1' && copySource === 'swipe') {
      // Swipe mode primary flow — merge with existing, auto-select within limits, advance
      const { newHeadlines, newBodyTexts } = buildSwipeCopyOptions(items);

      // Merge with any previously picked swipe items (supports incremental selection across retries)
      const existingHeadlines = copyOptions?.headlines || [];
      const existingBodyTexts = copyOptions?.bodyTexts || [];
      const existingHeadlineIds = new Set(existingHeadlines.map(h => h.id));
      const existingBodyTextIds = new Set(existingBodyTexts.map(b => b.id));
      const mergedHeadlines = [...existingHeadlines, ...newHeadlines.filter(h => !existingHeadlineIds.has(h.id))];
      const mergedBodyTexts = [...existingBodyTexts, ...newBodyTexts.filter(b => !existingBodyTextIds.has(b.id))];

      // Require at least 1 headline AND 1 body text before advancing
      if (mergedHeadlines.length > 0 && mergedBodyTexts.length > 0) {
        setCopyOptions({ headlines: mergedHeadlines, bodyTexts: mergedBodyTexts, callToActions: [] });
        // Auto-select up to Step 2 limits (max 4 headlines, max 3 body texts)
        setSelectedHeadlines(mergedHeadlines.slice(0, 4).map(h => h.id));
        setSelectedBodyTexts(mergedBodyTexts.slice(0, 3).map(b => b.id));
        setSelectedCTAs([]);
        setCurrentStep('copy-selection');
      } else {
        // Partial selection — stay on Step 1, merge what we have so user sees feedback
        if (mergedHeadlines.length > 0 || mergedBodyTexts.length > 0) {
          setCopyOptions({ headlines: mergedHeadlines, bodyTexts: mergedBodyTexts, callToActions: [] });
          setError(
            mergedHeadlines.length === 0
              ? 'Please also select at least one headline from the Swipe Library to continue.'
              : 'Please also select at least one body copy from the Swipe Library to continue.'
          );
        }
      }
    } else if (swipePickerContext === 'step1' || swipePickerContext === 'step2') {
      // Append to existing copyOptions (supplement for generate/import modes, or add-more in Step 2)
      const { newHeadlines, newBodyTexts } = buildSwipeCopyOptions(items);

      // Deduplicate: filter out items whose IDs already exist in copyOptions
      const existingHeadlineIds = new Set(copyOptions?.headlines.map(h => h.id) || []);
      const existingBodyTextIds = new Set(copyOptions?.bodyTexts.map(b => b.id) || []);
      const dedupedHeadlines = newHeadlines.filter(h => !existingHeadlineIds.has(h.id));
      const dedupedBodyTexts = newBodyTexts.filter(b => !existingBodyTextIds.has(b.id));

      if (copyOptions) {
        setCopyOptions({
          ...copyOptions,
          headlines: [...copyOptions.headlines, ...dedupedHeadlines],
          bodyTexts: [...copyOptions.bodyTexts, ...dedupedBodyTexts],
        });
      } else {
        setCopyOptions({
          headlines: dedupedHeadlines,
          bodyTexts: dedupedBodyTexts,
          callToActions: [],
        });
      }
    } else if (swipePickerContext === 'step3') {
      // Image selection for Step 3
      setLibraryImages(items.filter(i => i.element_type === 'image'));
    }
  };

  const openSwipePicker = (context: 'step1' | 'step2' | 'step3', types: SwipeElementType[]) => {
    setSwipePickerContext(context);
    setSwipePickerTypes(types);
    setShowSwipePicker(true);
  };

  // Regenerate a single image within an ad package
  const handleRegenerateImage = useCallback(async (adId: string, imageIndex: number) => {
    // Find the ad to regenerate
    const adToUpdate = generatedAds.find(ad => ad.id === adId);
    if (!adToUpdate || !adToUpdate.images || adToUpdate.images.length <= imageIndex) {
      console.error('Cannot regenerate: ad or image not found');
      return;
    }

    console.log(`🔄 Regenerating image ${imageIndex + 1} for ad ${adId}`);

    try {
      // Generate a new image with the same parameters
      const headlineText = adToUpdate.imageHeadlines?.length
        ? adToUpdate.imageHeadlines[imageIndex % adToUpdate.imageHeadlines.length]
        : undefined;
      const newImage = await generateAdImage({
        audienceType: adToUpdate.audienceType,
        analysisData,
        variationIndex: imageIndex,
        totalVariations: adToUpdate.images.length,
        similarityLevel: similarityValue,
        imageSize,
        productContext: selectedProduct || undefined,
        headlineText,
        businessType,
        campaignIntent: adToUpdate.campaignIntent || effectiveIntent,
        imageModel,
      });

      // Update the ad with the new image
      const updatedAds = generatedAds.map(ad => {
        if (ad.id === adId && ad.images) {
          const updatedImages = [...ad.images];
          updatedImages[imageIndex] = newImage;
          return { ...ad, images: updatedImages };
        }
        return ad;
      });

      setGeneratedAds(updatedAds);

      // Note: localStorage save is handled by the useEffect that watches generatedAds changes
      console.log('✅ Image regenerated successfully');
    } catch (err: unknown) {
      console.error('❌ Failed to regenerate image:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to regenerate image');
    }
  }, [generatedAds, analysisData, similarityValue, imageSize, selectedProduct, imageModel]);

  // Regenerate ALL images for an ad package (keeps copy intact)
  const handleRegenerateAllImages = useCallback(async (adId: string) => {
    const adToUpdate = generatedAds.find(ad => ad.id === adId);
    if (!adToUpdate) {
      console.error('Cannot regenerate: ad not found');
      return;
    }

    // Use the original variation count from generation, fall back to current image count or UI state
    const count = adToUpdate.variationCount || adToUpdate.images?.length || variationCount;
    console.log(`🔄 Regenerating all ${count} images for ad ${adId}`);

    try {
      const result = await regenerateAllImages({
        audienceType: adToUpdate.audienceType,
        analysisData,
        variationCount: count,
        similarityLevel: similarityValue,
        imageSize,
        productContext: selectedProduct || undefined,
        imageHeadlines: adToUpdate.imageHeadlines,
        imageModel,
      });

      // Use indexedResults for per-slot merging: keep existing image where new generation failed
      const existingImages = adToUpdate.images || [];
      const mergedImages: typeof existingImages = [];
      for (let i = 0; i < result.indexedResults.length; i++) {
        const newImg = result.indexedResults[i];
        if (newImg) {
          mergedImages.push(newImg);
        } else if (existingImages[i]) {
          mergedImages.push(existingImages[i]);
        }
      }

      const updatedAds = generatedAds.map(ad => {
        if (ad.id === adId) {
          return {
            ...ad,
            images: mergedImages.length > 0 ? mergedImages : ad.images,
            imageError: result.imageError,
          };
        }
        return ad;
      });

      setGeneratedAds(updatedAds);
      console.log(`✅ Regenerated ${result.images.length}/${count} images`);

      if (result.images.length === 0) {
        throw new Error(result.imageError || 'All images failed to generate');
      }
    } catch (err: unknown) {
      // Ensure imageError is set on the ad even on total failure
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate images';
      setGeneratedAds(prev => prev.map(ad => {
        if (ad.id === adId) {
          return { ...ad, imageError: errorMessage };
        }
        return ad;
      }));
      console.error('❌ Failed to regenerate all images:', err);
      throw new Error(errorMessage);
    }
  }, [generatedAds, analysisData, similarityValue, imageSize, selectedProduct, variationCount, imageModel]);

  // Regenerate a single video within an ad package
  const handleRegenerateVideo = useCallback(async (adId: string, videoIndex: number) => {
    const adToUpdate = generatedAds.find(ad => ad.id === adId);
    const videos = adToUpdate?.videos || (adToUpdate?.video ? [adToUpdate.video] : []);
    if (!adToUpdate || videos.length <= videoIndex) {
      console.error('Cannot regenerate: ad or video not found');
      return;
    }

    console.log(`🔄 Regenerating video ${videoIndex + 1} for ad ${adId}`);

    try {
      const newVideo = await generateAdVideoWithVeo({
        audienceType: adToUpdate.audienceType,
        conceptType: adToUpdate.conceptType,
        analysisData,
        selectedCopy: {
          headlines: adToUpdate.copy.headlines,
          bodyTexts: adToUpdate.copy.bodyTexts,
        },
        videoConfig: adToUpdate.videoConfig || {
          aspectRatio: videoAspectRatio,
          duration: videoDuration,
          resolution: '720p',
          model: videoModel,
        },
        productContext: selectedProduct || undefined,
        variationIndex: videoIndex,
        totalVariations: videos.length,
        businessType,
        campaignIntent: adToUpdate.campaignIntent || effectiveIntent,
      });

      const updatedAds = generatedAds.map(ad => {
        if (ad.id === adId) {
          const updatedVideos = [...videos];
          updatedVideos[videoIndex] = newVideo;
          return { ...ad, video: updatedVideos[0], videos: updatedVideos };
        }
        return ad;
      });

      setGeneratedAds(updatedAds);
      console.log('✅ Video regenerated successfully');
    } catch (err: unknown) {
      console.error('❌ Failed to regenerate video:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to regenerate video');
    }
  }, [generatedAds, analysisData, videoAspectRatio, videoDuration, videoModel, selectedProduct]);

  // Regenerate a single text ad image with a different style
  const handleRegenerateTextImage = useCallback(async (adId: string, imageIndex: number) => {
    const adToUpdate = generatedAds.find(ad => ad.id === adId);
    if (!adToUpdate?.images || adToUpdate.images.length <= imageIndex || !adToUpdate.textAdConfig) {
      console.error('Cannot regenerate: text ad or image not found');
      return;
    }

    const config = adToUpdate.textAdConfig;
    // Pick a different style — cycle through selected styles offset by index
    const resolvedStyles = config.styleIds
      .map(id => getStyleById(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);
    if (resolvedStyles.length === 0) resolvedStyles.push(TEXT_AD_STYLES[0]);

    // Offset by +1 from original index to get a different style
    const style = resolvedStyles[(imageIndex + 1) % resolvedStyles.length];

    const newImage = generateTextAdImage({
      primaryText: config.primaryText,
      highlightText: config.highlightText,
      anchorText: config.anchorText,
      style,
      imageSize: imageSize,
    });

    const updatedAds = generatedAds.map(ad => {
      if (ad.id === adId && ad.images) {
        const updatedImages = [...ad.images];
        updatedImages[imageIndex] = newImage;
        return { ...ad, images: updatedImages };
      }
      return ad;
    });

    setGeneratedAds(updatedAds);
  }, [generatedAds, imageSize]);

  // Remove a single image from an ad package
  const handleRemoveImage = useCallback((adId: string, imageIndex: number) => {
    const updatedAds = generatedAds.map(ad => {
      if (ad.id === adId && ad.images && ad.images.length > 1) {
        const updatedImages = ad.images.filter((_, i) => i !== imageIndex);
        return { ...ad, images: updatedImages };
      }
      return ad;
    });
    setGeneratedAds(updatedAds);
  }, [generatedAds]);

  const hasAnalysisData = !!analysisData;
  const isGenerating = isGeneratingCopy || isGeneratingCreatives;

  // Validation for proceeding
  const canProceedToCopySelection = audienceType && conceptType;
  // CTAs are optional when using import/manual copy (user sets CTA button type in publisher)
  const ctaOk = copySource === 'generate' ? selectedCTAs.length >= 1 : true;
  const canProceedToFinalConfig = selectedHeadlines.length >= 1 && selectedBodyTexts.length >= 1 && ctaOk;
  const canGenerateCreatives = selectedHeadlines.length >= 1 && selectedBodyTexts.length >= 1 && ctaOk
    && (adType !== 'text' || textAdPrimaryText.trim().length > 0);
  const canSubmitManualCopy = manualHeadlines.some(h => h.trim().length > 0) && manualBodyTexts.some(b => b.trim().length > 0);

  return (
    <div className="page ad-generator-page">
      <SEO
        title="CreativeIQ™ Ad Generator"
        description="Generate high-converting ad creatives automatically using AI-powered ConversionIQ™ technology."
        canonical="/creatives"
        noindex={true}
      />
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Ad Generator</h1>
          <p className="page-subtitle">Generate new ad creatives based on winning patterns</p>
        </div>
      </div>

      {/* Analysis Status */}
      <div className={`analysis-status ${hasAnalysisData ? 'has-data' : 'no-data'}`}>
        {hasAnalysisData ? (
          <>
            <span className="status-icon">✓</span>
            <span className="status-text">
              {analysisImportMeta ? (
                <>Analysis data loaded from <strong>{analysisImportMeta.adAccountName}</strong> (analyzed {formatDate(analysisData!.analyzedAt)})</>
              ) : (
                <>Analysis data loaded (analyzed {formatDate(analysisData!.analyzedAt)})</>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="status-icon">!</span>
            <span className="status-text">
              No analysis data found.{' '}
              <Link to="/insights" className="status-link">
                Run channel analysis
              </Link>
              {isMultiAccount && (
                <>
                  {' '}or{' '}
                  <Link to="/insights" className="status-link">
                    import from another account
                  </Link>
                </>
              )}{' '}
              for better results.
            </span>
          </>
        )}
      </div>

      {/* Image Reference Status - Auto-loaded from converting ads */}
      <div className={`analysis-status ${imageCacheCount > 0 ? 'has-data' : isAutoFetchingRefs ? 'loading-data' : 'no-data'}`} style={{ marginTop: '8px' }}>
        {isAutoFetchingRefs ? (
          <>
            <span className="status-icon" style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
            <span className="status-text">
              ConversionIQ™ loading reference images from your converting ads...
              {autoFetchProgress && ` (${autoFetchProgress.loaded} of ${autoFetchProgress.total})`}
            </span>
          </>
        ) : imageCacheCount > 0 ? (
          <>
            <span className="status-icon">✓</span>
            <span className="status-text">
              {imageCacheCount} reference image{imageCacheCount !== 1 ? 's' : ''} from converting ads
              {refTopConversions > 0 && (
                <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Best: {refTopConversions} conversion{refTopConversions !== 1 ? 's' : ''}
                  {refTopCVR > 0 && ` · Highest CVR: ${refTopCVR.toFixed(1)}%`}
                </span>
              )}
            </span>
            <button
              className="status-action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImages}
              style={{ marginLeft: '12px' }}
            >
              + Add More
            </button>
            {isMultiAccount && accounts.length > 1 && (
              <button
                className="status-action-btn"
                onClick={() => setShowImageImportModal(true)}
                style={{ marginLeft: '8px' }}
              >
                Import from Account
              </button>
            )}
            <button
              className="status-action-btn clear-btn"
              onClick={handleClearImageCache}
              style={{ marginLeft: '8px' }}
            >
              Clear
            </button>
          </>
        ) : (
          <>
            <span className="status-icon">!</span>
            <span className="status-text">
              No converting ad images found.{' '}
              <Link to="/channels/meta-ads" className="status-link">Sync your Meta Ads</Link>
              {' '}to auto-load references, or{' '}
              <button
                className="status-link-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImages}
              >
                {isUploadingImages ? 'Uploading...' : 'upload images manually'}
              </button>.
              {isMultiAccount && accounts.length > 1 && (
                <>
                  {' '}Or{' '}
                  <button
                    className="status-link-btn"
                    onClick={() => setShowImageImportModal(true)}
                  >
                    import from another account
                  </button>.
                </>
              )}
            </span>
          </>
        )}
      </div>

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        style={{ display: 'none' }}
      />

      {/* Ad Library Inspiration Status */}
      {activeInspirationIds.length > 0 && (
        <div className="analysis-status has-data" style={{ marginTop: '-16px' }}>
          <span className="status-icon">✓</span>
          <span className="status-text">
            {activeInspirationIds.length} Ad Library inspiration{activeInspirationIds.length !== 1 ? 's' : ''} active for generation
          </span>
        </div>
      )}

      {/* Step Indicator — chips are clickable to revisit any stage that has data,
          so a persisted batch can be reviewed/regenerated at every stage. */}
      <div className="step-indicator">
        <div
          className={`step ${currentStep === 'config' ? 'active' : 'completed'} step-clickable`}
          role="button"
          tabIndex={0}
          onClick={() => goToStep('config')}
          onKeyDown={onStepKeyDown('config')}
        >
          <span className="step-number">1</span>
          <span className="step-label">{copySource === 'generate' ? 'Audience & Concept' : 'Audience & Copy'}</span>
        </div>
        <div className="step-connector"></div>
        <div
          className={`step ${currentStep === 'copy-selection' ? 'active' : currentStep === 'final-config' ? 'completed' : ''} ${copyOptions ? 'step-clickable' : ''}`}
          role={copyOptions ? 'button' : undefined}
          tabIndex={copyOptions ? 0 : undefined}
          onClick={() => goToStep('copy-selection')}
          onKeyDown={onStepKeyDown('copy-selection')}
        >
          <span className="step-number">2</span>
          <span className="step-label">{copySource === 'manual' ? 'Copy Entered' : 'Select Copy'}</span>
        </div>
        <div className="step-connector"></div>
        <div
          className={`step ${currentStep === 'final-config' ? 'active' : ''} ${copyOptions ? 'step-clickable' : ''}`}
          role={copyOptions ? 'button' : undefined}
          tabIndex={copyOptions ? 0 : undefined}
          onClick={() => goToStep('final-config')}
          onKeyDown={onStepKeyDown('final-config')}
        >
          <span className="step-number">3</span>
          <span className="step-label">Generate Creatives</span>
        </div>
      </div>

      {/* Start over / New brief — scraps the copy stages too. "Clear All" (in the generated
          section) only removes images and keeps the copy. Shown whenever there's something
          to scrap, so it's reachable from any stage. */}
      {hasStageContent && (
        <div className="start-over-row">
          <button type="button" className="start-over-btn" onClick={handleStartOver}>
            ↺ Start over / New brief
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="generator-error">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Step 1: Configuration */}
      {currentStep === 'config' && (
        <section className="config-panel">
          <h3 className="config-title">Step 1: {copySource === 'generate' ? 'Audience & Concept' : 'Audience & Copy'}</h3>

          {/* Campaign Goal — always interactive so any account can select quiz funnel */}
          <div className="config-section">
            <label className="config-label">Campaign Goal</label>
            <p className="config-hint">What is this campaign optimizing for?</p>
            <div className="campaign-intent-options" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {([
                { id: 'purchase' as CampaignIntent, label: 'Sell a Product', desc: 'Optimize for purchases & ROAS', icon: '🛒' },
                { id: 'lead' as CampaignIntent, label: 'Generate Leads', desc: 'Optimize for leads, calls & opt-ins', icon: '📞' },
                { id: 'quiz' as CampaignIntent, label: 'Quiz / Assessment', desc: 'Drive quiz completions that lead to sales', icon: '🧠' },
              ] as const).map(option => (
                <button
                  key={option.id}
                  className={`copy-source-btn ${campaignIntent === option.id ? 'active' : ''}`}
                  onClick={() => { userChangedIntentRef.current = true; setCampaignIntent(option.id); }}
                  style={{ flex: 1, minWidth: '140px' }}
                >
                  <span className="copy-source-name">{option.icon} {option.label}</span>
                  <span className="copy-source-desc">{option.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Copy Source Selection */}
          <div className="config-section">
            <label className="config-label">Copy Source</label>
            <p className="config-hint">Generate new copy with AI, import from ads, enter your own, or use your Swipe Library</p>
            <div className="copy-source-options">
              <button
                className={`copy-source-btn ${copySource === 'generate' ? 'active' : ''}`}
                onClick={() => handleCopySourceChange('generate')}
              >
                <span className="copy-source-name">Generate New</span>
                <span className="copy-source-desc">AI-generated copy options</span>
              </button>
              <button
                className={`copy-source-btn ${copySource === 'import' ? 'active' : ''}`}
                onClick={() => handleCopySourceChange('import')}
              >
                <span className="copy-source-name">Import from Ads</span>
                <span className="copy-source-desc">Reuse top-performing copy</span>
              </button>
              <button
                className={`copy-source-btn ${copySource === 'manual' ? 'active' : ''}`}
                onClick={() => handleCopySourceChange('manual')}
              >
                <span className="copy-source-name">Enter Manually</span>
                <span className="copy-source-desc">Paste your own copy</span>
              </button>
              <button
                className={`copy-source-btn ${copySource === 'swipe' ? 'active' : ''}`}
                onClick={() => handleCopySourceChange('swipe')}
                disabled={!currentAccount?.ad_account_id}
                title={!currentAccount?.ad_account_id ? 'Connect a Meta ad account to use Swipe Library' : undefined}
              >
                <span className="copy-source-name">From Swipe Library</span>
                <span className="copy-source-desc">Reuse saved winning copy</span>
              </button>
            </div>

            {/* Swipe Library Button — available for non-swipe copy source modes */}
            {currentAccount?.ad_account_id && copySource !== 'swipe' && (
              <button
                type="button"
                className="swipe-library-inline-btn"
                onClick={() => openSwipePicker('step1', ['headline', 'body_copy'])}
                style={{
                  marginTop: '12px',
                  padding: '10px 16px',
                  background: 'rgba(212, 225, 87, 0.08)',
                  border: '1px solid rgba(212, 225, 87, 0.2)',
                  borderRadius: 'var(--radius-md, 8px)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                🔖 Browse Swipe Library
              </button>
            )}
          </div>

          {/* Product Selection */}
          <div className="config-section">
            <label className="config-label">Product</label>
            <p className="config-hint">Select the product this ad is for — ensures accurate copy and image references</p>
            {products.length === 0 ? (
              <div className="product-selector-empty">
                <span>No products defined yet.</span>
                <Link to="/integrations" className="product-selector-link">Add a product →</Link>
              </div>
            ) : (
              <div className="product-selector-options">
                {products.map(product => (
                  <button
                    key={product.id}
                    className={`product-selector-btn ${selectedProductId === product.id ? 'active' : ''}`}
                    onClick={() => setSelectedProductId(selectedProductId === product.id ? null : product.id)}
                  >
                    <span className="product-selector-name">{product.name}</span>
                    <span className="product-selector-author">by {product.author}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Core Promise — a persistent library you pick from (sticks across batches,
              like Product). Optional in single mode, REQUIRED in grid mode (anchors the whole batch). */}
          {copySource === 'generate' && (
            <div className="config-section">
              <label className="config-label">
                Core Promise{' '}
                {generationMode === 'grid'
                  ? <span className="config-required">Required</span>
                  : <span className="manual-entry-optional">(optional)</span>}
              </label>
              <p className="config-hint">
                {generationMode === 'grid'
                  ? 'Required — the one idea every creative in the grid anchors to. Save promises here and pick one; your choice sticks across batches until you change it.'
                  : 'Optional — the one idea this batch lives inside. Save promises here and pick one; your choice sticks across batches until you change it.'}
              </p>

              {savedPromises.length > 0 && (
                <div className="core-promise-options">
                  {savedPromises.map(promise => (
                    <div
                      key={promise.id}
                      className={`core-promise-chip ${selectedPromiseId === promise.id ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="core-promise-select"
                        onClick={() => handleSelectCorePromise(promise.id)}
                        title={promise.text}
                      >
                        {promise.text}
                      </button>
                      <button
                        type="button"
                        className="core-promise-delete"
                        onClick={() => handleDeleteCorePromise(promise.id)}
                        aria-label="Delete this Core Promise"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="core-promise-add">
                <input
                  type="text"
                  className="manual-entry-input"
                  value={promiseDraft}
                  onChange={(e) => handleCorePromiseDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleSaveCorePromise(); }
                  }}
                  placeholder={savedPromises.length > 0
                    ? 'Add another Core Promise…'
                    : 'e.g. Scale past the closer bottleneck without hiring more people'}
                  maxLength={200}
                />
                <button
                  type="button"
                  className="core-promise-save-btn"
                  onClick={handleSaveCorePromise}
                  disabled={!promiseDraft.trim()}
                  title="Save this Core Promise to your library"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Ad Library Inspiration (optional) */}
          <div className="config-section">
            <label className="config-label">
              Ad Library Inspiration <span className="manual-entry-optional">(optional)</span>
              <button
                type="button"
                className="ad-library-info-btn"
                onClick={e => {
                  e.preventDefault();
                  const panel = (e.currentTarget.parentElement as HTMLElement)?.nextElementSibling;
                  if (panel?.classList.contains('ad-library-info-panel')) {
                    panel.classList.toggle('visible');
                  }
                }}
                aria-label="What is Ad Library Inspiration?"
              >
                &#9432;
              </button>
            </label>
            <div className="ad-library-info-panel">
              Browse ads currently running on Meta from other brands and competitors.
              Save the ones you like as inspiration — CreativeIQ will study their copy
              patterns, hooks, and angles to inform your own original ad generation.
              Long-running ads are highlighted as a quality signal.
            </div>
            <AdLibraryBrowser
              savedInspirations={savedInspirations}
              onSaveInspiration={handleSaveInspiration}
              onRemoveInspiration={handleRemoveInspiration}
            />
            {savedInspirations.length > 0 && (
              <InspirationSelector
                inspirations={savedInspirations}
                activeIds={activeInspirationIds}
                onToggle={handleToggleActiveInspiration}
                onRemove={handleRemoveInspiration}
                maxActive={MAX_ACTIVE_INSPIRATIONS}
              />
            )}
          </div>

          {/* Audience Type Selection */}
          <div className="config-section">
            <label className="config-label">Target Audience</label>
            <div className="audience-options">
              {AUDIENCE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  className={`audience-btn ${audienceType === option.id ? 'active' : ''}`}
                  onClick={() => setAudienceType(option.id)}
                >
                  <span className="audience-icon">{option.icon}</span>
                  <span className="audience-name">{option.name}</span>
                  <span className="audience-desc">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generation Mode — single concept vs grid matrix (AI generation only) */}
          {copySource === 'generate' && (
            <div className="config-section">
              <label className="config-label">Generation Mode</label>
              <p className="config-hint">One concept you curate, or Blitz Testing: a grid that tests many angles × hooks in one batch</p>
              <div className="copy-source-options">
                <button
                  type="button"
                  className={`copy-source-btn ${generationMode === 'single' ? 'active' : ''}`}
                  onClick={() => setGenerationMode('single')}
                >
                  <span className="copy-source-name">Single Concept</span>
                  <span className="copy-source-desc">One angle, pick from copy options</span>
                </button>
                <button
                  type="button"
                  className={`copy-source-btn ${generationMode === 'grid' ? 'active' : ''}`}
                  onClick={enterGridMode}
                >
                  <span className="copy-source-name">Blitz Testing (Angle × Hook)</span>
                  <span className="copy-source-desc">Test a full grid in one batch</span>
                </button>
              </div>
            </div>
          )}

          {/* Concept Selection — single mode only */}
          {copySource === 'generate' && generationMode === 'single' && (
            <div className="config-section">
              <label className="config-label">Core Concept</label>
              <p className="config-hint">Select the psychological angle for your creative</p>
              <div className="concept-options">
                {CONCEPT_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`concept-btn ${conceptType === option.id ? 'active' : ''} ${option.id === 'auto' ? 'auto-concept' : ''}`}
                    onClick={() => setConceptType(option.id)}
                  >
                    <div className="concept-header">
                      <span className="concept-icon">{option.icon}</span>
                      <span className="concept-name">{option.name}</span>
                    </div>
                    <span className="concept-desc">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid Config — grid mode only */}
          {copySource === 'generate' && generationMode === 'grid' && (
            <>
              <div className="config-section">
                <label className="config-label">Angles</label>
                <p className="config-hint">The strategic frame — each becomes a row. {gridAngles.length} selected.</p>
                <div className="concept-options">
                  {GRID_ANGLE_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      className={`concept-btn ${gridAngles.includes(option.id) ? 'active' : ''}`}
                      onClick={() => toggleGridAngle(option.id)}
                    >
                      <div className="concept-header">
                        <span className="concept-icon">{option.icon}</span>
                        <span className="concept-name">{option.name}</span>
                      </div>
                      <span className="concept-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-section">
                <label className="config-label">Hooks</label>
                <p className="config-hint">The first 3 seconds — each becomes a column. {gridHooks.length} selected.</p>
                <div className="grid-hook-options">
                  {GRID_HOOK_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      className={`grid-hook-btn ${gridHooks.includes(option.id) ? 'active' : ''}`}
                      onClick={() => toggleGridHook(option.id)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-section">
                <label className="config-label">Format</label>
                <p className="config-hint">Image style applied across the whole batch</p>
                <div className="copy-length-options">
                  {GRID_FORMAT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      className={`copy-length-btn ${gridFormat === option.id ? 'active' : ''}`}
                      onClick={() => setGridFormat(option.id)}
                    >
                      <span className="copy-length-name">{option.name}</span>
                      <span className="copy-length-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`grid-cell-counter ${gridOverCap ? 'over-cap' : ''}`}>
                {gridAngles.length} angles × {gridHooks.length} hooks = <strong>{gridAngles.length * gridHooks.length}</strong> creatives
                {gridOverCap && <span className="grid-cap-warning"> — reduce to {GRID_CELL_CAP} or fewer to generate</span>}
              </div>

              <BlitzImageStrategySelector
                value={blitzImageStrategy}
                counts={blitzStrategyCounts}
                onChange={setBlitzImageStrategy}
              />
              <ImageModelSelector value={imageModel} onChange={handleImageModelChange} />
            </>
          )}

          {/* Copy Length Selection — AI generation only */}
          {copySource === 'generate' && (
            <div className="config-section">
              <label className="config-label">Body Copy Length</label>
              <p className="config-hint">Choose short-form for quick impact or long-form for full storytelling</p>
              <div className="copy-length-options">
                {COPY_LENGTH_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`copy-length-btn ${copyLength === option.id ? 'active' : ''}`}
                    onClick={() => setCopyLength(option.id)}
                  >
                    <span className="copy-length-icon">{option.icon}</span>
                    <span className="copy-length-name">{option.name}</span>
                    <span className="copy-length-desc">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Copy Variation Level — AI generation only */}
          {copySource === 'generate' && (
            <div className="config-section similarity-section">
              <label className="config-label">
                Copy Variation Level
              </label>
              <p className="config-hint">
                {analysisData
                  ? 'Control how closely the generated copy follows your winning ad patterns'
                  : 'Control how creative vs. conventional the generated copy will be'}
              </p>
              <div className="similarity-slider-container">
                <div className="similarity-labels">
                  <span className="similarity-label-left">
                    {analysisData ? 'Follow Winners' : 'Conservative'}
                  </span>
                  <span className="similarity-label-right">
                    {analysisData ? 'New Angles' : 'Experimental'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={copyVariationValue}
                  onChange={(e) => setCopyVariationValue(parseInt(e.target.value))}
                  className="similarity-slider"
                />
                <div className="similarity-value">
                  {analysisData
                    ? (copyVariationValue <= 20 ? '🎯 Pattern Match' :
                       copyVariationValue <= 40 ? '✨ Fresh Wording' :
                       copyVariationValue <= 60 ? '🔄 Balanced Mix' :
                       copyVariationValue <= 80 ? '🎨 New Angles' :
                       '🚀 Bold & Different')
                    : (copyVariationValue <= 20 ? '🎯 Conservative' :
                       copyVariationValue <= 40 ? '✨ Slightly Creative' :
                       copyVariationValue <= 60 ? '🔄 Balanced' :
                       copyVariationValue <= 80 ? '🎨 Creative' :
                       '🚀 Experimental')}
                  <span className="similarity-percent">{copyVariationValue}% variation</span>
                </div>
              </div>
            </div>
          )}

          {/* Import from Ads: Date range + import button */}
          {copySource === 'import' && (
            <>
              <div className="config-section">
                <label className="config-label">Date Range</label>
                <p className="config-hint">Select the date range to find your top-performing ad copy</p>
                <div className="import-date-options">
                  {IMPORT_DATE_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      className={`import-date-btn ${importDatePreset === option.id ? 'active' : ''}`}
                      onClick={() => setImportDatePreset(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="generate-btn step-btn"
                onClick={handleImportCopy}
                disabled={isImportingCopy}
              >
                {isImportingCopy ? (
                  <>
                    <span className="spinner"></span>
                    ConversionIQ™ fetching top creatives...
                  </>
                ) : (
                  <>
                    <span className="generate-icon">📥</span>
                    Import Top-Performing Copy
                  </>
                )}
              </button>
            </>
          )}

          {/* Manual Copy Entry */}
          {copySource === 'manual' && (
            <>
              <div className="config-section">
                <label className="config-label">Headlines</label>
                <p className="config-hint">Enter 1–4 headline variations</p>
                <div className="manual-copy-entries">
                  {manualHeadlines.map((text, idx) => (
                    <div key={idx} className="manual-entry-row">
                      <input
                        type="text"
                        className="manual-entry-input"
                        value={text}
                        onChange={(e) => {
                          const updated = [...manualHeadlines];
                          updated[idx] = e.target.value;
                          setManualHeadlines(updated);
                        }}
                        placeholder={`Headline ${idx + 1}`}
                        maxLength={150}
                      />
                      {manualHeadlines.length > 1 && (
                        <button
                          className="manual-entry-remove"
                          onClick={() => setManualHeadlines(manualHeadlines.filter((_, i) => i !== idx))}
                          aria-label="Remove headline"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {manualHeadlines.length < 4 && (
                    <button className="manual-entry-add" onClick={() => setManualHeadlines([...manualHeadlines, ''])}>
                      + Add Headline
                    </button>
                  )}
                </div>
              </div>

              <div className="config-section">
                <label className="config-label">Body Copy</label>
                <p className="config-hint">Enter 1–3 body copy variations</p>
                <div className="manual-copy-entries">
                  {manualBodyTexts.map((text, idx) => (
                    <div key={idx} className="manual-entry-row">
                      <textarea
                        className="manual-entry-textarea"
                        value={text}
                        onChange={(e) => {
                          const updated = [...manualBodyTexts];
                          updated[idx] = e.target.value;
                          setManualBodyTexts(updated);
                        }}
                        placeholder={`Body copy ${idx + 1}`}
                        rows={3}
                      />
                      {manualBodyTexts.length > 1 && (
                        <button
                          className="manual-entry-remove"
                          onClick={() => setManualBodyTexts(manualBodyTexts.filter((_, i) => i !== idx))}
                          aria-label="Remove body copy"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {manualBodyTexts.length < 3 && (
                    <button className="manual-entry-add" onClick={() => setManualBodyTexts([...manualBodyTexts, ''])}>
                      + Add Body Copy
                    </button>
                  )}
                </div>
              </div>

              <div className="config-section">
                <label className="config-label">Call-to-Actions <span className="manual-entry-optional">(optional)</span></label>
                <p className="config-hint">Enter CTA text variations, or skip — you can set the CTA button type when publishing</p>
                <div className="manual-copy-entries">
                  {manualCTAs.map((text, idx) => (
                    <div key={idx} className="manual-entry-row">
                      <input
                        type="text"
                        className="manual-entry-input"
                        value={text}
                        onChange={(e) => {
                          const updated = [...manualCTAs];
                          updated[idx] = e.target.value;
                          setManualCTAs(updated);
                        }}
                        placeholder={`CTA ${idx + 1}`}
                        maxLength={50}
                      />
                      {manualCTAs.length > 1 && (
                        <button
                          className="manual-entry-remove"
                          onClick={() => setManualCTAs(manualCTAs.filter((_, i) => i !== idx))}
                          aria-label="Remove CTA"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {manualCTAs.length < 2 && (
                    <button className="manual-entry-add" onClick={() => setManualCTAs([...manualCTAs, ''])}>
                      + Add CTA
                    </button>
                  )}
                </div>
              </div>

              <button
                className="generate-btn step-btn"
                onClick={handleManualCopySubmit}
                disabled={!canSubmitManualCopy}
              >
                <span className="generate-icon">→</span>
                Continue to Generate Creatives
              </button>
            </>
          )}

          {/* Swipe Library: Primary action area */}
          {copySource === 'swipe' && (
            <div className="config-section" style={{ textAlign: 'center', padding: '24px 16px' }}>
              {copyOptions && (copyOptions.headlines.length > 0 || copyOptions.bodyTexts.length > 0) ? (
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
                  {copyOptions.headlines.length} headline{copyOptions.headlines.length !== 1 ? 's' : ''} and {copyOptions.bodyTexts.length} body cop{copyOptions.bodyTexts.length !== 1 ? 'ies' : 'y'} selected.
                  {(copyOptions.headlines.length === 0 || copyOptions.bodyTexts.length === 0) && (
                    <span style={{ display: 'block', color: '#f59e0b', marginTop: '8px', fontWeight: 500 }}>
                      {copyOptions.headlines.length === 0
                        ? 'Select at least one headline to continue.'
                        : 'Select at least one body copy to continue.'}
                    </span>
                  )}
                </p>
              ) : (
                <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '14px' }}>
                  Select headlines and body copy from your saved winning ads
                </p>
              )}
              <button
                type="button"
                className="generate-btn step-btn"
                onClick={() => openSwipePicker('step1', ['headline', 'body_copy'])}
                disabled={!currentAccount?.ad_account_id}
              >
                <span className="generate-icon">🔖</span>
                {copyOptions && (copyOptions.headlines.length > 0 || copyOptions.bodyTexts.length > 0)
                  ? 'Re-select from Swipe Library'
                  : 'Select from Swipe Library'}
              </button>
            </div>
          )}

          {/* Generate Copy Options Button — single mode */}
          {copySource === 'generate' && generationMode === 'single' && (
            <button
              className="generate-btn step-btn"
              onClick={handleGenerateCopyOptions}
              disabled={isGeneratingCopy || !canProceedToCopySelection}
            >
              {isGeneratingCopy ? (
                <>
                  <span className="spinner"></span>
                  {generationProgress}
                </>
              ) : (
                <>
                  <span className="generate-icon">📝</span>
                  Generate Copy Options
                </>
              )}
            </button>
          )}

          {/* Generate Grid Button — grid mode */}
          {copySource === 'generate' && generationMode === 'grid' && (
            <>
              <button
                className="generate-btn step-btn"
                onClick={handleGenerateGrid}
                disabled={isGeneratingGrid || gridOverCap || !corePromise.trim() || gridAngles.length === 0 || gridHooks.length === 0}
              >
                {isGeneratingGrid ? (
                  <>
                    <span className="spinner"></span>
                    {generationProgress}
                  </>
                ) : (
                  <>
                    <span className="generate-icon">▦</span>
                    Generate Blitz Test ({gridCellCount} creative{gridCellCount === 1 ? '' : 's'})
                  </>
                )}
              </button>
              {!isGeneratingGrid && gridBlockReason && (
                <p className="grid-block-reason">{gridBlockReason}</p>
              )}
            </>
          )}
        </section>
      )}

      {/* Grid Review — prune + reroll the Angle × Hook matrix, then choose how many images */}
      {currentStep === 'grid-review' && gridCells && (
        <GridReviewPanel
          cells={gridCells}
          keptCellIds={keptCellIds}
          regeneratingCellId={regeneratingCellId}
          isGenerating={isGeneratingCreatives}
          generationProgress={generationProgress}
          imageStrategy={blitzImageStrategy}
          strategyCounts={blitzStrategyCounts}
          onStrategyChange={setBlitzImageStrategy}
          imageModel={imageModel}
          onImageModelChange={handleImageModelChange}
          onToggleKeep={handleToggleKeepCell}
          onReroll={handleRerollGridCell}
          onBack={() => setCurrentStep('config')}
          onGenerate={handleGenerateBlitzImages}
        />
      )}

      {/* Blitz Image Review — review + reroll the image pool before pairing it across the copy */}
      {currentStep === 'grid-images' && (
        <BlitzImageReviewPanel
          images={blitzImages}
          slotLabels={blitzPlan.slotLabels}
          adCount={keptCellCount}
          regeneratingIndex={regeneratingBlitzIndex}
          imageError={blitzImageError}
          onRegenerate={handleRegenerateBlitzImage}
          onBack={() => setCurrentStep('grid-review')}
          onPublish={handlePublishBlitz}
        />
      )}

      {/* Step 2: Copy Selection */}
      {currentStep === 'copy-selection' && copyOptions && (
        <section className="config-panel copy-selection-step">
          <div className="step-header">
            <button className="back-btn" onClick={handleBackToConfig} disabled={regeneratingCopyId !== null}>
              ← Back
            </button>
            <h3 className="config-title">Step 2: Select Copy</h3>
          </div>

          <div className="selection-summary">
            {selectedProduct && (
              <>
                <span className="summary-item">
                  <span className="summary-label">Product:</span> {selectedProduct.name}
                </span>
                <span className="summary-divider">|</span>
              </>
            )}
            <span className="summary-item">
              <span className="summary-label">Audience:</span> {AUDIENCE_OPTIONS.find(a => a.id === audienceType)?.name}
            </span>
            <span className="summary-divider">|</span>
            {copySource === 'generate' && corePromise.trim() && (
              <>
                <span className="summary-item">
                  <span className="summary-label">Promise:</span>{' '}
                  <span title={corePromise.trim()}>
                    {corePromise.trim().length > 48 ? `${corePromise.trim().slice(0, 48)}…` : corePromise.trim()}
                  </span>
                </span>
                <span className="summary-divider">|</span>
              </>
            )}
            {copySource === 'generate' ? (
              <>
                <span className="summary-item">
                  <span className="summary-label">Concept:</span> {CONCEPT_ANGLES[conceptType].name}
                </span>
                <span className="summary-divider">|</span>
                <span className="summary-item">
                  <span className="summary-label">Copy:</span> {COPY_LENGTH_OPTIONS.find(c => c.id === copyLength)?.name}
                </span>
              </>
            ) : (
              <span className="summary-item">
                <span className="summary-label">Source:</span> {copySource === 'swipe' ? 'Swipe Library' : copySource === 'import' ? 'Imported from Ads' : 'Manually Entered'}
              </span>
            )}
          </div>

          {/* Add from Swipe Library — Step 2 */}
          {currentAccount?.ad_account_id && (
            <button
              type="button"
              className="swipe-library-inline-btn"
              onClick={() => openSwipePicker('step2', ['headline', 'body_copy'])}
              style={{
                marginBottom: '16px',
                padding: '10px 16px',
                background: 'rgba(212, 225, 87, 0.08)',
                border: '1px solid rgba(212, 225, 87, 0.2)',
                borderRadius: 'var(--radius-md, 8px)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              🔖 Add from Swipe Library
            </button>
          )}

          <CopySelectionPanel
            headlines={copyOptions.headlines}
            bodyTexts={copyOptions.bodyTexts}
            callToActions={copyOptions.callToActions}
            selectedHeadlines={selectedHeadlines}
            selectedBodyTexts={selectedBodyTexts}
            selectedCTAs={selectedCTAs}
            onHeadlineToggle={handleHeadlineToggle}
            onBodyTextToggle={handleBodyTextToggle}
            onCTAToggle={handleCTAToggle}
            onRegenerateHeadline={copySource === 'generate' ? handleRegenerateHeadline : undefined}
            onRegenerateBodyText={copySource === 'generate' ? handleRegenerateBodyText : undefined}
            onRegenerateCTA={copySource === 'generate' ? handleRegenerateCTA : undefined}
            regeneratingCopyId={regeneratingCopyId}
            minHeadlines={1}
            maxHeadlines={4}
            minBodyTexts={1}
            maxBodyTexts={3}
            minCTAs={copySource === 'generate' ? 1 : 0}
            maxCTAs={2}
          />

          <button
            className="generate-btn step-btn"
            onClick={handleProceedToFinalConfig}
            disabled={!canProceedToFinalConfig || regeneratingCopyId !== null}
          >
            <span className="generate-icon">→</span>
            Continue to Final Configuration
          </button>
        </section>
      )}

      {/* Step 3: Final Configuration */}
      {currentStep === 'final-config' && (
        <section className="config-panel">
          <div className="step-header">
            <button className="back-btn" onClick={handleBackFromFinalConfig}>
              ← Back
            </button>
            <h3 className="config-title">Step 3: Generate Creatives</h3>
          </div>

          {/* Summary of selections */}
          <div className="final-summary">
            <h4 className="summary-title">Your Selections</h4>
            <div className="summary-grid">
              {selectedProduct && (
                <div className="summary-card">
                  <span className="summary-card-label">Product</span>
                  <span className="summary-card-value">{selectedProduct.name}</span>
                </div>
              )}
              <div className="summary-card">
                <span className="summary-card-label">Audience</span>
                <span className="summary-card-value">{AUDIENCE_OPTIONS.find(a => a.id === audienceType)?.name}</span>
              </div>
              {copySource === 'generate' ? (
                <>
                  <div className="summary-card">
                    <span className="summary-card-label">Concept</span>
                    <span className="summary-card-value">{CONCEPT_ANGLES[conceptType].name}</span>
                  </div>
                  <div className="summary-card">
                    <span className="summary-card-label">Copy Length</span>
                    <span className="summary-card-value">{COPY_LENGTH_OPTIONS.find(c => c.id === copyLength)?.name}</span>
                  </div>
                  <div className="summary-card">
                    <span className="summary-card-label">Copy Variation</span>
                    <span className="summary-card-value">
                      {analysisData
                        ? (copyVariationValue <= 20 ? 'Pattern Match' :
                           copyVariationValue <= 40 ? 'Fresh Wording' :
                           copyVariationValue <= 60 ? 'Balanced Mix' :
                           copyVariationValue <= 80 ? 'New Angles' :
                           'Bold & Different')
                        : (copyVariationValue <= 20 ? 'Conservative' :
                           copyVariationValue <= 40 ? 'Slightly Creative' :
                           copyVariationValue <= 60 ? 'Balanced' :
                           copyVariationValue <= 80 ? 'Creative' :
                           'Experimental')} ({copyVariationValue}%)
                    </span>
                  </div>
                </>
              ) : (
                <div className="summary-card">
                  <span className="summary-card-label">Copy Source</span>
                  <span className="summary-card-value">{copySource === 'swipe' ? 'Swipe Library' : copySource === 'import' ? 'Imported from Ads' : 'Manually Entered'}</span>
                </div>
              )}
              <div className="summary-card">
                <span className="summary-card-label">Headlines</span>
                <span className="summary-card-value">{selectedHeadlines.length} selected</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">Body Copy</span>
                <span className="summary-card-value">{selectedBodyTexts.length} selected</span>
              </div>
              {selectedCTAs.length > 0 && (
                <div className="summary-card">
                  <span className="summary-card-label">CTAs</span>
                  <span className="summary-card-value">{selectedCTAs.length} selected</span>
                </div>
              )}
            </div>
          </div>

          {/* Ad Type Selection */}
          <div className="config-section">
            <label className="config-label">Ad Type</label>
            <div className="ad-type-options">
              <button
                className={`ad-type-btn ${adType === 'image' ? 'active' : ''}`}
                onClick={() => setAdType('image')}
              >
                <span className="ad-type-icon">🖼️</span>
                <span className="ad-type-name">Image Ad</span>
                <span className="ad-type-desc">Generate AI images</span>
              </button>
              <button
                className={`ad-type-btn ${adType === 'video' ? 'active' : ''}`}
                onClick={() => setAdType('video')}
              >
                <span className="ad-type-icon">🎬</span>
                <span className="ad-type-name">Video Ad</span>
                <span className="ad-type-desc">{isGeminiConfigured() ? 'Generate AI video' : 'Generate storyboard'}</span>
              </button>
              <button
                className={`ad-type-btn ${adType === 'text' ? 'active' : ''}`}
                onClick={() => setAdType('text')}
              >
                <span className="ad-type-icon">Aa</span>
                <span className="ad-type-name">Text Ad</span>
                <span className="ad-type-desc">Bold text on background</span>
              </button>
            </div>
          </div>

          {/* Library Images — use saved images instead of AI generation */}
          {adType === 'image' && currentAccount?.ad_account_id && (
            <div className="config-section">
              <label className="config-label">
                Use Saved Images <span className="manual-entry-optional">(optional)</span>
              </label>
              <p className="config-hint">Select images from your Swipe Library instead of generating with AI. No credits will be used.</p>
              <button
                type="button"
                className="swipe-library-inline-btn"
                onClick={() => openSwipePicker('step3', ['image'])}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(212, 225, 87, 0.08)',
                  border: '1px solid rgba(212, 225, 87, 0.2)',
                  borderRadius: 'var(--radius-md, 8px)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                🖼️ Browse Library Images
              </button>
              {libraryImages.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {libraryImages.map(img => (
                      <div key={img.id} style={{
                        width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid var(--accent-primary)',
                      }}>
                        {img.image_thumbnail && (
                          <img
                            src={`data:${img.image_mime_type || 'image/jpeg'};base64,${img.image_thumbnail}`}
                            alt="Library"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setLibraryImages([])}
                      style={{
                        padding: '4px 10px', fontSize: '12px', background: 'transparent',
                        border: '1px solid var(--border-primary)', borderRadius: '6px',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: '#10b981', marginTop: '8px', fontWeight: 500 }}>
                    {libraryImages.length} image{libraryImages.length !== 1 ? 's' : ''} selected — no credits will be used
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Text Ad Configuration */}
          {adType === 'text' && (
            <div className="config-section text-ad-config">
              <label className="config-label">Text Ad Content</label>
              <p className="config-hint">Enter the text to display on your ad image. Each section appears in a different zone of the image.</p>

              {/* Generate Suggestions Button */}
              {isOpenAIConfigured() && (
                <button
                  className="generate-suggestions-btn"
                  onClick={async () => {
                    setIsGeneratingTextAdCopy(true);
                    try {
                      const result = await generateTextAdCopy({
                        audienceType,
                        conceptType,
                        analysisData,
                        productContext: selectedProduct || undefined,
                        businessType,
                        campaignIntent: effectiveIntent,
                      });
                      setTextAdCopySuggestions(result);
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : 'Failed to generate suggestions');
                    } finally {
                      setIsGeneratingTextAdCopy(false);
                    }
                  }}
                  disabled={isGeneratingTextAdCopy}
                >
                  {isGeneratingTextAdCopy ? 'Generating...' : 'Generate Suggestions with AI'}
                </button>
              )}

              {/* Primary Text */}
              <div className="text-ad-field">
                <label className="text-ad-field-label">
                  Primary Text <span className="required">*</span>
                </label>
                <p className="text-ad-field-hint">The bold main hook at the top of the image</p>
                {textAdCopySuggestions && textAdCopySuggestions.primaryTexts.length > 0 && (
                  <div className="text-ad-suggestions">
                    {textAdCopySuggestions.primaryTexts.map(s => (
                      <button
                        key={s.id}
                        className={`text-ad-suggestion-btn ${textAdPrimaryText === s.text ? 'active' : ''}`}
                        onClick={() => setTextAdPrimaryText(s.text)}
                        title={s.rationale}
                      >
                        {s.text}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  className="text-ad-textarea"
                  placeholder="e.g., We Will Run Your Ads"
                  value={textAdPrimaryText}
                  onChange={e => setTextAdPrimaryText(e.target.value)}
                  maxLength={80}
                  rows={2}
                />
              </div>

              {/* Highlight Banner Text */}
              <div className="text-ad-field">
                <label className="text-ad-field-label">Highlight Banner Text</label>
                <p className="text-ad-field-hint">Key offer on a contrasting dark banner (optional)</p>
                {textAdCopySuggestions && textAdCopySuggestions.highlightTexts.length > 0 && (
                  <div className="text-ad-suggestions">
                    {textAdCopySuggestions.highlightTexts.map(s => (
                      <button
                        key={s.id}
                        className={`text-ad-suggestion-btn ${textAdHighlightText === s.text ? 'active' : ''}`}
                        onClick={() => setTextAdHighlightText(s.text)}
                        title={s.rationale}
                      >
                        {s.text}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  className="text-ad-textarea"
                  placeholder="e.g., Get 10-20 Booked Calls Every 30 Days"
                  value={textAdHighlightText}
                  onChange={e => setTextAdHighlightText(e.target.value)}
                  maxLength={120}
                  rows={2}
                />
              </div>

              {/* Anchor Text */}
              <div className="text-ad-field">
                <label className="text-ad-field-label">Anchor Text</label>
                <p className="text-ad-field-hint">Trust anchor word at the bottom (optional)</p>
                {textAdCopySuggestions && textAdCopySuggestions.anchorTexts.length > 0 && (
                  <div className="text-ad-suggestions">
                    {textAdCopySuggestions.anchorTexts.map(s => (
                      <button
                        key={s.id}
                        className={`text-ad-suggestion-btn ${textAdAnchorText === s.text ? 'active' : ''}`}
                        onClick={() => setTextAdAnchorText(s.text)}
                        title={s.rationale}
                      >
                        {s.text}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  className="text-ad-input"
                  placeholder="e.g., Guaranteed"
                  value={textAdAnchorText}
                  onChange={e => setTextAdAnchorText(e.target.value)}
                  maxLength={40}
                />
              </div>

              {/* Style Preset Selector */}
              <div className="text-ad-field">
                <label className="text-ad-field-label">Background Style</label>
                <p className="text-ad-field-hint">Select one or more. Multiple styles = different style per variation.</p>
                <div className="text-style-grid">
                  {/* Custom Brand Style — first position */}
                  <button
                    className={`text-style-btn custom-brand-btn ${selectedTextStyles.includes(CUSTOM_BRAND_ID) ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTextStyles(prev => {
                        if (prev.includes(CUSTOM_BRAND_ID)) {
                          if (prev.length <= 1) return prev;
                          setShowBrandColorPicker(false);
                          return prev.filter(id => id !== CUSTOM_BRAND_ID);
                        }
                        setShowBrandColorPicker(true);
                        return [...prev, CUSTOM_BRAND_ID];
                      });
                    }}
                  >
                    <div
                      className="text-style-preview custom-brand-preview"
                      style={{ background: customBrandStyle.previewCSS }}
                    />
                    <span className="text-style-name">My Brand</span>
                  </button>

                  {TEXT_AD_STYLES.map(style => (
                    <button
                      key={style.id}
                      className={`text-style-btn ${selectedTextStyles.includes(style.id) ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTextStyles(prev => {
                          if (prev.includes(style.id)) {
                            // Don't allow deselecting the last one
                            if (prev.length <= 1) return prev;
                            return prev.filter(id => id !== style.id);
                          }
                          return [...prev, style.id];
                        });
                      }}
                    >
                      <div
                        className="text-style-preview"
                        style={{ background: style.previewCSS }}
                      />
                      <span className="text-style-name">{style.name}</span>
                    </button>
                  ))}
                </div>

                {/* Brand Color Picker Panel */}
                {showBrandColorPicker && selectedTextStyles.includes(CUSTOM_BRAND_ID) && (
                  <div className="brand-color-picker-panel">
                    <div className="brand-color-picker-header">
                      <span className="brand-color-picker-title">Customize Brand Colors</span>
                      <button
                        className="brand-color-picker-toggle"
                        onClick={() => setShowBrandColorPicker(false)}
                        aria-label="Collapse color picker"
                      >
                        Collapse
                      </button>
                    </div>
                    <div className="brand-color-picker-grid">
                      <label className="brand-color-field">
                        <span className="brand-color-label">Background</span>
                        <input
                          type="color"
                          value={customBrandStyle.backgroundColors[0]}
                          onChange={e => updateCustomBrandColor('backgroundColors', e.target.value)}
                        />
                      </label>
                      <label className="brand-color-field">
                        <span className="brand-color-label">Accent Color</span>
                        <input
                          type="color"
                          value={customBrandStyle.accentColor}
                          onChange={e => updateCustomBrandColor('accentColor', e.target.value)}
                        />
                      </label>
                      <label className="brand-color-field">
                        <span className="brand-color-label">Text Color</span>
                        <input
                          type="color"
                          value={customBrandStyle.textColor}
                          onChange={e => updateCustomBrandColor('textColor', e.target.value)}
                        />
                      </label>
                      <label className="brand-color-field">
                        <span className="brand-color-label">Banner BG</span>
                        <input
                          type="color"
                          value={customBrandStyle.bannerBgColor}
                          onChange={e => updateCustomBrandColor('bannerBgColor', e.target.value)}
                        />
                      </label>
                      <label className="brand-color-field">
                        <span className="brand-color-label">Banner Text</span>
                        <input
                          type="color"
                          value={customBrandStyle.bannerTextColor}
                          onChange={e => updateCustomBrandColor('bannerTextColor', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Image Model Selection - shown for image ads only (not text or video) */}
          {adType === 'image' && (
            <ImageModelSelector value={imageModel} onChange={handleImageModelChange} />
          )}

          {/* Image Size Selection - shown for image and text ads */}
          {(adType === 'image' || adType === 'text') && (
            <div className="config-section">
              <label className="config-label">Image Size</label>
              <p className="config-hint">Select the aspect ratio for your ad images</p>
              <div className="image-size-options">
                {IMAGE_SIZE_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`image-size-btn ${imageSize === option.id ? 'active' : ''}`}
                    onClick={() => setImageSize(option.id)}
                  >
                    <span className="image-size-icon">{option.icon}</span>
                    <span className="image-size-name">{option.name}</span>
                    <span className="image-size-dimensions">{option.dimensions}</span>
                    <span className="image-size-desc">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Video Configuration - only shown for video ads with Gemini */}
          {adType === 'video' && isGeminiConfigured() && (
            <div className="config-section">
              <label className="config-label">Video Format</label>
              <p className="config-hint">Select the aspect ratio for your video ad</p>
              <div className="image-size-options">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`image-size-btn ${videoAspectRatio === option.id ? 'active' : ''}`}
                    onClick={() => setVideoAspectRatio(option.id)}
                  >
                    <span className="image-size-icon">{option.icon}</span>
                    <span className="image-size-name">{option.name}</span>
                    <span className="image-size-dimensions">{option.dimensions}</span>
                    <span className="image-size-desc">{option.description}</span>
                  </button>
                ))}
              </div>

              <label className="config-label" style={{ marginTop: '16px' }}>Duration</label>
              <div className="variation-options">
                {VIDEO_DURATION_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`variation-btn ${videoDuration === option.id ? 'active' : ''}`}
                    onClick={() => setVideoDuration(option.id)}
                    title={option.description}
                  >
                    {option.name}
                  </button>
                ))}
              </div>

              <label className="config-label" style={{ marginTop: '16px' }}>Generation Quality</label>
              <div className="ad-type-options">
                {VIDEO_MODEL_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`ad-type-btn ${videoModel === option.id ? 'active' : ''}`}
                    onClick={() => setVideoModel(option.id)}
                  >
                    <span className="ad-type-name">{option.name}</span>
                    <span className="ad-type-desc">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Headline in Image - only shown for image ads */}
          {adType === 'image' && (
            <div className="config-section">
              <label className="config-label">Headline in Image</label>
              <p className="config-hint">Optionally render a headline directly into the generated image for scroll-stopping impact</p>
              <div className="headline-image-options">
                <button
                  className={`headline-image-btn ${headlineInImageMode === 'none' ? 'active' : ''}`}
                  onClick={() => setHeadlineInImageMode('none')}
                >
                  <span className="headline-image-name">None</span>
                  <span className="headline-image-desc">Image only, no text</span>
                </button>
                <button
                  className={`headline-image-btn ${headlineInImageMode === 'from-copy' ? 'active' : ''}`}
                  onClick={() => setHeadlineInImageMode('from-copy')}
                  disabled={selectedHeadlines.length === 0}
                >
                  <span className="headline-image-name">From Copy</span>
                  <span className="headline-image-desc">Use selected headline{selectedHeadlines.length > 1 ? 's' : ''}</span>
                </button>
                <button
                  className={`headline-image-btn ${headlineInImageMode === 'custom' ? 'active' : ''}`}
                  onClick={() => setHeadlineInImageMode('custom')}
                >
                  <span className="headline-image-name">Custom</span>
                  <span className="headline-image-desc">Type your own</span>
                </button>
              </div>

              {/* From Copy: show which headline(s) will be used */}
              {headlineInImageMode === 'from-copy' && selectedHeadlines.length > 0 && copyOptions?.headlines && (
                <div className="headline-preview">
                  {selectedHeadlines.length === 1 ? (
                    <p className="headline-preview-text">
                      &ldquo;{copyOptions.headlines.find(h => h.id === selectedHeadlines[0])?.text}&rdquo;
                    </p>
                  ) : (
                    <>
                      <p className="headline-preview-text">
                        {selectedHeadlines.length} headlines will rotate across {variationCount} variation{variationCount > 1 ? 's' : ''}:
                      </p>
                      {copyOptions.headlines
                        .filter(h => selectedHeadlines.includes(h.id))
                        .map((h, i) => (
                          <p key={h.id} className="headline-preview-item">{i + 1}. {h.text}</p>
                        ))
                      }
                    </>
                  )}
                </div>
              )}

              {/* Custom: text input */}
              {headlineInImageMode === 'custom' && (
                <input
                  type="text"
                  className="headline-custom-input"
                  placeholder="Enter headline for the image..."
                  value={customImageHeadline}
                  onChange={(e) => setCustomImageHeadline(e.target.value)}
                  maxLength={80}
                />
              )}
            </div>
          )}

          {/* Variation Count */}
          <div className="config-section">
            <label className="config-label">
              Number of Variations {adType === 'video' && !isGeminiConfigured() && '(storyboard only)'}
            </label>
            <div className="variation-options">
              {(adType === 'video' ? [1, 2, 3] : [1, 2, 3, 4, 5]).map(count => (
                <button
                  key={count}
                  className={`variation-btn ${variationCount === count ? 'active' : ''}`}
                  onClick={() => setVariationCount(count)}
                  disabled={adType === 'video' && !isGeminiConfigured() && count > 1}
                >
                  {count}
                </button>
              ))}
            </div>
            {adType === 'video' && !isGeminiConfigured() && variationCount > 1 && (
              <p className="variation-note">Video storyboards generate one concept at a time</p>
            )}
            {adType === 'video' && isGeminiConfigured() && variationCount > 1 && (
              <p className="variation-note">Videos are generated sequentially (2-5 min each)</p>
            )}
          </div>

          {/* Creative Similarity Slider */}
          {adType === 'image' && (
            <div className="config-section similarity-section">
              <label className="config-label">
                Creative Variation Level
              </label>
              <p className="config-hint">
                {imageCacheCount > 0 || analysisData
                  ? 'Control how closely the new visuals match the creative style already converting in your ad account'
                  : 'Control how conventional vs. experimental the generated visuals will be'}
              </p>
              <div className="similarity-slider-container">
                <div className="similarity-labels">
                  <span className="similarity-label-left">
                    {imageCacheCount > 0 || analysisData ? 'Match Winners' : 'Conservative'}
                  </span>
                  <span className="similarity-label-right">
                    {imageCacheCount > 0 || analysisData ? 'Bold & New' : 'Experimental'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={similarityValue}
                  onChange={(e) => setSimilarityValue(parseInt(e.target.value))}
                  className="similarity-slider"
                />
                <div className="similarity-value">
                  {imageCacheCount > 0 || analysisData
                    ? (similarityValue <= 20 ? '🎯 Near Identical' :
                       similarityValue <= 40 ? '✨ Subtle Variations' :
                       similarityValue <= 60 ? '🔄 Balanced Mix' :
                       similarityValue <= 80 ? '🎨 Fresh Visuals' :
                       '🚀 Bold & Different')
                    : (similarityValue <= 20 ? '🎯 Conservative' :
                       similarityValue <= 40 ? '✨ Slightly Creative' :
                       similarityValue <= 60 ? '🔄 Balanced' :
                       similarityValue <= 80 ? '🎨 Creative' :
                       '🚀 Experimental')}
                  <span className="similarity-percent">{similarityValue}% variation</span>
                </div>
              </div>
            </div>
          )}

          {/* Credit Cost Hint */}
          <CreditCostHint adType={adType} variationCount={variationCount} />

          {/* Generate Button */}
          <button
            className="generate-btn"
            onClick={handleGenerateCreatives}
            disabled={isGeneratingCreatives || !canGenerateCreatives}
          >
            {isGeneratingCreatives ? (
              <>
                <span className="spinner"></span>
                {generationProgress}
              </>
            ) : (
              <>
                <span className="generate-icon">✨</span>
                Generate Ad Creatives
              </>
            )}
          </button>
        </section>
      )}

      {/* Storage Warning */}
      {storageWarning && (
        <div className="storage-warning">
          <span className="warning-icon">⚠️</span>
          <span className="warning-text">{storageWarning}</span>
          <button className="warning-action-btn" onClick={handleClearAllAds}>
            Clear All Ads
          </button>
        </div>
      )}

      {/* Generated Ads */}
      {isLoadingAds ? (
        <div className="generated-section loading-section">
          <div className="loading-indicator">
            <span className="spinner"></span>
            <span>Loading saved ads...</span>
          </div>
        </div>
      ) : generatedAds.length > 0 && (
        <section className="generated-section">
          <div className="generated-section-header">
            <div className="generated-section-heading">
              <h3 className="section-title">Generated Creatives ({generatedAds.length})</h3>
              {batchPublishedAt ? (
                <span
                  className="batch-published-badge"
                  title="This batch was published to Meta in PAUSED mode. It stays here so you can review or regenerate any creative and re-publish."
                >
                  ✓ Published to Meta · {formatDate(new Date(batchPublishedAt).toISOString())}
                </span>
              ) : (
                <span className="batch-persist-hint">
                  Saved here until you generate a new batch — publishing won't clear it.
                </span>
              )}
            </div>
            <div className="section-actions">
              <button
                className="clear-ads-btn"
                onClick={handleClearAllAds}
              >
                🗑️ Clear All
              </button>
              <button
                className="publish-ads-btn"
                onClick={() => { flushAdsToStorage(); navigate('/publish'); }}
              >
                <span className="publish-icon">🚀</span>
                {batchPublishedAt ? 'Re-publish to Meta' : 'Publish to Meta'}
              </button>
            </div>
          </div>
          <div className="generated-ads-list">
            {generatedAds.slice(0, visibleAdsCount).map(ad => (
              <GeneratedAdCard
                key={ad.id}
                ad={ad}
                onRegenerateImage={ad.adType === 'image' ? handleRegenerateImage : ad.adType === 'text' ? handleRegenerateTextImage : undefined}
                onRegenerateAllImages={ad.adType === 'image' ? handleRegenerateAllImages : undefined}
                onRegenerateVideo={ad.adType === 'video' ? handleRegenerateVideo : undefined}
                onRemoveImage={handleRemoveImage}
              />
            ))}
          </div>
          {visibleAdsCount < generatedAds.length && (
            <div className="load-more-container">
              <button className="load-more-btn" onClick={handleLoadMore}>
                Load More ({generatedAds.length - visibleAdsCount} remaining)
              </button>
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {generatedAds.length === 0 && !isGenerating && !isLoadingAds && currentStep === 'config' && (
        <div className="empty-state">
          <div className="empty-icon">🎨</div>
          <h3>No Creatives Yet</h3>
          <p>Select your audience and concept above, then generate copy options to get started.</p>
        </div>
      )}
      {/* Swipe Library Picker Modal */}
      {showSwipePicker && currentAccount?.ad_account_id && (
        <SwipeLibraryPicker
          adAccountId={currentAccount.ad_account_id}
          elementTypes={swipePickerTypes}
          onSelect={handleSwipeLibrarySelect}
          onClose={() => setShowSwipePicker(false)}
        />
      )}
      {/* Credit Exhaustion Modal */}
      {showCreditModal && (
        <CreditExhaustionModal
          creditsRemaining={creditModalData.remaining}
          creditsRequired={creditModalData.required}
          onClose={() => setShowCreditModal(false)}
        />
      )}

      {/* Import Reference Images Modal */}
      {showImageImportModal && (
        <ImportImagesModal
          availableImports={getAvailableImageImports(accounts, currentAccount?.ad_account_id || null)}
          currentImageCount={imageCacheCount}
          onImport={handleImageImport}
          onClose={() => setShowImageImportModal(false)}
        />
      )}
    </div>
  );
};

/** Inline credit cost hint shown above the Generate button */
function CreditCostHint({ adType, variationCount }: { adType: string; variationCount: number }) {
  const [creditInfo, setCreditInfo] = useState<{ remaining: number; cost: number } | null>(null);

  useEffect(() => {
    const actionType = adType === 'video' ? 'video_ad' : adType === 'text' ? 'text_ad' : 'image_ad';
    checkCredits(actionType as CreditActionType, variationCount)
      .then(result => {
        if (!result.unlimited) {
          setCreditInfo({ remaining: result.creditsRemaining, cost: result.creditsRequired });
        } else {
          setCreditInfo(null);
        }
      })
      .catch(() => setCreditInfo(null));
  }, [adType, variationCount]);

  if (!creditInfo) return null;

  const color = creditInfo.remaining < creditInfo.cost ? '#ef4444'
    : creditInfo.remaining < creditInfo.cost * 3 ? '#f59e0b'
    : 'var(--text-muted)';

  return (
    <p style={{ fontSize: '13px', color, textAlign: 'center', margin: '0 0 8px' }}>
      This will use <strong>{creditInfo.cost} credits</strong>. You have <strong>{creditInfo.remaining}</strong> remaining.
    </p>
  );
}

export default AdGenerator;
