import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  isOpenAIConfigured,
  isGeminiConfigured,
  generateAdPackage,
  generateCopyOptions,
  generateAdImage,
  CONCEPT_ANGLES,
  IMAGE_SIZE_OPTIONS,
  DEFAULT_IMAGE_SIZE,
  COPY_LENGTH_OPTIONS,
  DEFAULT_COPY_LENGTH,
  type AdType,
  type AudienceType,
  type ConceptType,
  type ChannelAnalysisResult,
  type GeneratedAdPackage,
  type CopyOption,
  type ReasoningEffort,
  type ImageSize,
  type CopyLength,
  type ProductContext,
} from '../services/openaiApi';
import { getCacheStats as getImageCacheStats, uploadBrandImages, clearImageCache } from '../services/imageCache';
import { fetchAdCreatives, type DatePreset } from '../services/metaApi';
import GeneratedAdCard from '../components/GeneratedAdCard';
import CopySelectionPanel from '../components/CopySelectionPanel';
import IQSelector from '../components/IQSelector';
import SEO from '../components/SEO';
import './AdGenerator.css';

const CACHE_KEY = 'channel_analysis_cache';
const GENERATED_ADS_STORAGE_KEY = 'conversion_intelligence_generated_ads';
const PRODUCTS_STORAGE_KEY = 'convertra_products';

// Pagination settings - reduced to prevent Chrome crashes with large base64 images
const ADS_PER_PAGE = 3;
const MAX_STORED_ADS = 10; // Keep total ads low to prevent memory issues
const MAX_ADS_WITH_IMAGES = 5; // Only keep images for the most recent N ads
const MAX_DATA_SIZE_MB = 3; // Maximum localStorage data size before warning

// Debug logging for crash investigation
const DEBUG_MODE = false;
const debugLog = (...args: unknown[]) => {
  if (DEBUG_MODE) console.log('[AdGenerator]', ...args);
};

// Helper to schedule work during browser idle time (prevents Chrome crashes)
// Uses requestIdleCallback when available, falls back to setTimeout
const scheduleIdleWork = (callback: () => void, timeout = 2000): number => {
  const win = window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number;
  };
  if (win.requestIdleCallback) {
    return win.requestIdleCallback(callback, { timeout });
  }
  return setTimeout(callback, 50) as unknown as number;
};

const cancelIdleWork = (id: number): void => {
  const win = window as typeof window & {
    cancelIdleCallback?: (id: number) => void;
  };
  if (win.cancelIdleCallback) {
    win.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
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

function getCachedAnalysis(): ChannelAnalysisResult | null {
  try {
    const cache = localStorage.getItem(CACHE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      const analysis = parsed['meta'] || null;
      if (analysis) {
        console.log('📊 Loaded cached analysis data:');
        console.log('  - Channel:', analysis.channelName);
        console.log('  - Analyzed at:', analysis.analyzedAt);
        console.log('  - Health score:', analysis.overallHealthScore);
        console.log('  - Total ads analyzed:', analysis.performanceBreakdown?.totalAdsAnalyzed);
        console.log('  - Top ads count:', analysis.topAds?.length || 0);
        console.log('  - Winning patterns:', analysis.winningPatterns ? 'Yes' : 'No');
        console.log('  - Executive summary:', analysis.executiveSummary?.substring(0, 100) + '...');
      } else {
        console.log('⚠️ No Meta analysis found in cache');
      }
      return analysis;
    }
    console.log('⚠️ No analysis cache found in localStorage');
  } catch (error) {
    console.error('❌ Error loading cached analysis:', error);
  }
  return null;
}

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

function calculateCost(adType: AdType, variationCount: number, includeCopyGeneration: boolean): { min: number; max: number; note: string } {
  const copyGenCost = includeCopyGeneration ? 0.02 : 0; // GPT-4o for copy generation
  const usingGemini = isGeminiConfigured();

  if (adType === 'image') {
    if (usingGemini) {
      // Gemini has generous free tier, minimal cost after
      return {
        min: copyGenCost,
        max: copyGenCost + 0.01,
        note: 'Gemini Nano Banana Pro (free tier)',
      };
    } else {
      // DALL-E 3 HD quality: $0.08 per image
      const imageCost = variationCount * 0.08;
      return {
        min: imageCost + copyGenCost,
        max: imageCost + copyGenCost + 0.02,
        note: 'DALL-E 3 HD',
      };
    }
  } else {
    // Video storyboard is just text generation
    return {
      min: copyGenCost + 0.01,
      max: copyGenCost + 0.04,
      note: 'GPT-4o text generation',
    };
  }
}

type WorkflowStep = 'config' | 'copy-selection' | 'final-config';
type CopySource = 'generate' | 'import' | 'manual';

const IMPORT_DATE_OPTIONS: { id: DatePreset; label: string }[] = [
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'maximum', label: 'All Time' },
];

const AdGenerator = () => {
  const navigate = useNavigate();

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
  const [analysisData, setAnalysisData] = useState<ChannelAnalysisResult | null>(null);
  const [iqLevel, setIqLevel] = useState<ReasoningEffort>('medium');
  const [imageSize, setImageSize] = useState<ImageSize>(DEFAULT_IMAGE_SIZE);
  const [copyLength, setCopyLength] = useState<CopyLength>(DEFAULT_COPY_LENGTH);

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
  const [generationProgress, setGenerationProgress] = useState('');
  const [generatedAds, setGeneratedAds] = useState<GeneratedAdPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAds, setIsLoadingAds] = useState(true);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Pagination state
  const [visibleAdsCount, setVisibleAdsCount] = useState(ADS_PER_PAGE);

  // Image cache status for brand-informed generation
  const [imageCacheCount, setImageCacheCount] = useState(0);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Creative variation control (0 = identical to references, 100 = completely different)
  const [similarityValue, setSimilarityValue] = useState(30); // Default: 30% variation (70% similar)

  // Handle brand image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImages(true);
    try {
      const uploaded = await uploadBrandImages(files);
      const stats = getImageCacheStats();
      setImageCacheCount(stats.count);
      console.log(`✅ Uploaded ${uploaded.length} images, cache now has ${stats.count} images`);
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
    setImageCacheCount(0);
  };

  // Load products from localStorage on mount
  useEffect(() => {
    try {
      const storedProducts = localStorage.getItem(PRODUCTS_STORAGE_KEY);
      if (storedProducts) {
        const parsed: ProductContext[] = JSON.parse(storedProducts);
        setProducts(parsed);
        setSelectedProductId(prev => {
          if (!prev && parsed.length === 1) return parsed[0].id;
          return prev;
        });
      }
    } catch {
      console.warn('Failed to load products from localStorage');
    }
  }, []);

  // Load cached analysis and check image cache on mount
  useEffect(() => {
    debugLog('Mount effect starting');

    const cached = getCachedAnalysis();
    setAnalysisData(cached);

    // Check image cache status
    const imageStats = getImageCacheStats();
    setImageCacheCount(imageStats.count);
    debugLog(`Image cache: ${imageStats.count} reference images available`);

    // Load previously generated ads from localStorage using idle callback
    // This prevents blocking the main thread and causing Chrome crashes
    const idleCallbackId = scheduleIdleWork(() => {
      debugLog('Starting ads load (idle callback)');
      try {
        const storedAds = localStorage.getItem(GENERATED_ADS_STORAGE_KEY);
        if (!storedAds) {
          debugLog('No stored ads found');
          setIsLoadingAds(false);
          return;
        }

        // Check storage size BEFORE parsing to prevent memory issues
        const sizeInMB = storedAds.length / (1024 * 1024);
        debugLog(`localStorage size: ${sizeInMB.toFixed(2)}MB`);

        // If data is too large, warn and consider clearing
        if (sizeInMB > MAX_DATA_SIZE_MB) {
          console.warn(`[AdGenerator] Large localStorage data detected: ${sizeInMB.toFixed(2)}MB`);
          setStorageWarning(`Storage is ${sizeInMB.toFixed(1)}MB. Consider clearing old ads to improve performance.`);

          // For very large data (> 5MB), skip loading to prevent crash
          if (sizeInMB > 5) {
            console.error('[AdGenerator] Data too large, skipping load to prevent crash');
            setStorageWarning('Storage too large. Please clear old ads to continue.');
            setIsLoadingAds(false);
            return;
          }
        }

        // Parse in a try-catch to handle corrupted data
        let parsed: GeneratedAdPackage[];
        try {
          parsed = JSON.parse(storedAds);
        } catch (parseErr) {
          console.error('[AdGenerator] JSON parse error:', parseErr);
          setStorageWarning('Stored ads data is corrupted. Consider clearing.');
          setIsLoadingAds(false);
          return;
        }

        if (!Array.isArray(parsed)) {
          debugLog('Parsed data is not an array');
          setIsLoadingAds(false);
          return;
        }

        // Strictly limit the number of ads to prevent memory issues
        const limited = parsed.slice(0, MAX_STORED_ADS);
        debugLog(`Loaded ${limited.length} ads (limited from ${parsed.length})`);

        setGeneratedAds(limited);
      } catch (e) {
        console.error('[AdGenerator] Failed to load stored ads:', e);
        setStorageWarning('Failed to load saved ads. Storage may be corrupted.');
      } finally {
        setIsLoadingAds(false);
      }
    }, 3000); // 3 second timeout for idle callback

    return () => cancelIdleWork(idleCallbackId);
  }, []);

  // Save generated ads to localStorage whenever they change
  // Use requestIdleCallback to prevent blocking the main thread
  // Strip image data from older ads to keep storage manageable
  useEffect(() => {
    if (generatedAds.length === 0 || isLoadingAds) return;

    const idleCallbackId = scheduleIdleWork(() => {
      try {
        // Strictly limit to MAX_STORED_ADS before saving
        const limited = generatedAds.slice(0, MAX_STORED_ADS);

        // Strip base64 image data from older ads to prevent localStorage bloat
        // Keep images only for the most recent N ads
        const toSave = limited.map((ad, index) => {
          if (index >= MAX_ADS_WITH_IMAGES && ad.images) {
            return {
              ...ad,
              images: ad.images.map(img => ({
                ...img,
                imageUrl: '', // Strip large base64 data from old ads
              })),
            };
          }
          return ad;
        });

        const json = JSON.stringify(toSave);
        const sizeInMB = json.length / (1024 * 1024);
        debugLog(`Saving ${toSave.length} ads (${sizeInMB.toFixed(2)}MB)`);

        // Warn if approaching problematic size
        if (sizeInMB > MAX_DATA_SIZE_MB) {
          setStorageWarning(`Storage is ${sizeInMB.toFixed(1)}MB. Delete old ads to prevent issues.`);
        }

        // Refuse to save if too large (prevent future crash)
        if (sizeInMB > 5) {
          console.error('[AdGenerator] Refusing to save - data too large');
          setStorageWarning('Too many ads with images. Please delete some to continue.');
          return;
        }

        localStorage.setItem(GENERATED_ADS_STORAGE_KEY, json);
        debugLog(`Saved ${toSave.length} ads to storage`);
      } catch (e: unknown) {
        console.error('[AdGenerator] Failed to save ads:', e);
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          setStorageWarning('Storage full! Please delete some ads to continue saving.');
        }
      }
    }, 1000);

    return () => cancelIdleWork(idleCallbackId);
  }, [generatedAds, isLoadingAds]);

  // Synchronous flush of ads to localStorage (used before navigation)
  const flushAdsToStorage = useCallback(() => {
    if (generatedAds.length === 0) return;
    try {
      const limited = generatedAds.slice(0, MAX_STORED_ADS);
      const toSave = limited.map((ad, index) => {
        if (index >= MAX_ADS_WITH_IMAGES && ad.images) {
          return {
            ...ad,
            images: ad.images.map(img => ({ ...img, imageUrl: '' })),
          };
        }
        return ad;
      });
      const json = JSON.stringify(toSave);
      const sizeInMB = json.length / (1024 * 1024);
      if (sizeInMB <= 5) {
        localStorage.setItem(GENERATED_ADS_STORAGE_KEY, json);
      }
    } catch (e: unknown) {
      console.error('[AdGenerator] Failed to flush ads to storage:', e);
    }
  }, [generatedAds]);

  // Clear all generated ads
  const handleClearAllAds = useCallback(() => {
    if (window.confirm('Are you sure you want to delete all generated ads? This cannot be undone.')) {
      setGeneratedAds([]);
      localStorage.removeItem(GENERATED_ADS_STORAGE_KEY);
      setStorageWarning(null);
      setVisibleAdsCount(ADS_PER_PAGE);
    }
  }, []);

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

  // Generate copy options
  const handleGenerateCopyOptions = async () => {
    const hasTextApi = isOpenAIConfigured();
    if (!hasTextApi) {
      setError('OpenAI API key required for copy generation. Please add VITE_OPENAI_API_KEY to your .env file.');
      return;
    }

    setIsGeneratingCopy(true);
    setError(null);
    setGenerationProgress('ConversionIQ™ generating headline and body copy options...');

    try {
      const result = await generateCopyOptions({
        audienceType,
        conceptType,
        analysisData,
        reasoningEffort: iqLevel,
        copyLength,
        productContext: selectedProduct || undefined,
      });

      setCopyOptions(result);
      setSelectedHeadlines([]);
      setSelectedBodyTexts([]);
      setSelectedCTAs([]);
      setCurrentStep('copy-selection');
      setGenerationProgress('');
    } catch (err: any) {
      console.error('Copy generation failed:', err);
      setError(err.message || 'Failed to generate copy options. Please try again.');
    } finally {
      setIsGeneratingCopy(false);
      setGenerationProgress('');
    }
  };

  // Generate final creatives
  const handleGenerateCreatives = async () => {
    const hasImageApi = isGeminiConfigured() || isOpenAIConfigured();
    const hasTextApi = isOpenAIConfigured();

    if (!hasImageApi && !hasTextApi) {
      setError('No API keys configured. Please add VITE_GEMINI_API_KEY and/or VITE_OPENAI_API_KEY to your .env file.');
      return;
    }

    // Only require OpenAI for AI-generated copy; import/manual copy doesn't need it
    if (!hasTextApi && copySource === 'generate') {
      setError('OpenAI API key required for copy generation. Please add VITE_OPENAI_API_KEY to your .env file.');
      return;
    }

    // Get selected text content
    const selectedHeadlineTexts = copyOptions?.headlines
      .filter(h => selectedHeadlines.includes(h.id))
      .map(h => h.text) || [];
    const selectedBodyTextTexts = copyOptions?.bodyTexts
      .filter(b => selectedBodyTexts.includes(b.id))
      .map(b => b.text) || [];
    const selectedCTATexts = copyOptions?.callToActions
      .filter(c => selectedCTAs.includes(c.id))
      .map(c => c.text) || [];

    setIsGeneratingCreatives(true);
    setError(null);
    setGenerationProgress(adType === 'image' ? 'ConversionIQ™ generating images and finalizing copy...' : 'ConversionIQ™ creating video storyboard...');

    try {
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
        reasoningEffort: iqLevel,
        imageSize, // Selected image dimensions/aspect ratio
        productContext: selectedProduct || undefined,
      });

      setGeneratedAds(prev => [result, ...prev]);
      setGenerationProgress('');
      // Reset for next generation
      setCurrentStep('config');
      setCopyOptions(null);
      setSelectedHeadlines([]);
      setSelectedBodyTexts([]);
      setSelectedCTAs([]);
    } catch (err: any) {
      console.error('Generation failed:', err);
      setError(err.message || 'Failed to generate ad. Please try again.');
    } finally {
      setIsGeneratingCreatives(false);
      setGenerationProgress('');
    }
  };

  // Navigate back
  const handleBackToConfig = () => {
    setCurrentStep('config');
  };

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
      const newImage = await generateAdImage({
        audienceType: adToUpdate.audienceType,
        analysisData,
        variationIndex: imageIndex,
        totalVariations: adToUpdate.images.length,
        similarityLevel: similarityValue,
        imageSize,
        productContext: selectedProduct || undefined,
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

      // Update localStorage asynchronously to avoid blocking the main thread
      scheduleIdleWork(() => {
        try {
          const toSave = updatedAds.slice(0, MAX_STORED_ADS);
          localStorage.setItem(GENERATED_ADS_STORAGE_KEY, JSON.stringify(toSave));
          console.log('✅ Image regenerated and saved successfully');
        } catch (storageError) {
          console.warn('Failed to save to localStorage:', storageError);
        }
      });
    } catch (err: any) {
      console.error('❌ Failed to regenerate image:', err);
      throw new Error(err.message || 'Failed to regenerate image');
    }
  }, [generatedAds, analysisData, similarityValue, imageSize, selectedProduct]);

  const costEstimate = calculateCost(adType, variationCount, currentStep === 'config');
  const hasAnalysisData = !!analysisData;
  const isGenerating = isGeneratingCopy || isGeneratingCreatives;

  // Validation for proceeding
  const canProceedToCopySelection = audienceType && conceptType;
  // CTAs are optional when using import/manual copy (user sets CTA button type in publisher)
  const ctaOk = copySource === 'generate' ? selectedCTAs.length >= 1 : true;
  const canProceedToFinalConfig = selectedHeadlines.length >= 1 && selectedBodyTexts.length >= 1 && ctaOk;
  const canGenerateCreatives = selectedHeadlines.length >= 1 && selectedBodyTexts.length >= 1 && ctaOk;
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
              Analysis data loaded (analyzed {formatDate(analysisData!.analyzedAt)})
            </span>
          </>
        ) : (
          <>
            <span className="status-icon">!</span>
            <span className="status-text">
              No analysis data found.{' '}
              <Link to="/insights" className="status-link">
                Run channel analysis
              </Link>{' '}
              for better results.
            </span>
          </>
        )}
      </div>

      {/* Image Reference Status - Critical for brand-informed generation */}
      <div className={`analysis-status ${imageCacheCount > 0 ? 'has-data' : 'no-data'}`} style={{ marginTop: '8px' }}>
        {imageCacheCount > 0 ? (
          <>
            <span className="status-icon">✓</span>
            <span className="status-text">
              {imageCacheCount} reference image{imageCacheCount !== 1 ? 's' : ''} cached for brand-informed generation
            </span>
            <button
              className="status-action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImages}
              style={{ marginLeft: '12px' }}
            >
              + Add More
            </button>
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
              No reference images.{' '}
              <button
                className="status-link-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImages}
              >
                {isUploadingImages ? 'Uploading...' : 'Upload your top-performing ad images'}
              </button>{' '}
              for brand-consistent generation.
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

      {/* Step Indicator */}
      <div className="step-indicator">
        <div className={`step ${currentStep === 'config' ? 'active' : 'completed'}`}>
          <span className="step-number">1</span>
          <span className="step-label">{copySource === 'generate' ? 'Audience & Concept' : 'Audience & Copy'}</span>
        </div>
        <div className="step-connector"></div>
        <div className={`step ${currentStep === 'copy-selection' ? 'active' : currentStep === 'final-config' ? 'completed' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">{copySource === 'manual' ? 'Copy Entered' : 'Select Copy'}</span>
        </div>
        <div className="step-connector"></div>
        <div className={`step ${currentStep === 'final-config' ? 'active' : ''}`}>
          <span className="step-number">3</span>
          <span className="step-label">Generate Creatives</span>
        </div>
      </div>

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

          {/* Copy Source Selection */}
          <div className="config-section">
            <label className="config-label">Copy Source</label>
            <p className="config-hint">Generate new copy with AI, import winning copy from your ad account, or enter your own</p>
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
            </div>
          </div>

          {/* Product Selection */}
          <div className="config-section">
            <label className="config-label">Product</label>
            <p className="config-hint">Select the product this ad is for — ensures accurate copy and image references</p>
            {products.length === 0 ? (
              <div className="product-selector-empty">
                <span>No products defined yet.</span>
                <Link to="/products" className="product-selector-link">Add a product →</Link>
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

          {/* Concept Selection — AI generation only */}
          {copySource === 'generate' && (
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

          {/* ConversionIQ Level Selection — AI generation only */}
          {copySource === 'generate' && (
            <div className="config-section">
              <IQSelector
                value={iqLevel}
                onChange={setIqLevel}
                disabled={isGeneratingCopy}
              />
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

          {/* Generate Copy Options Button — AI generation only */}
          {copySource === 'generate' && (
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
        </section>
      )}

      {/* Step 2: Copy Selection */}
      {currentStep === 'copy-selection' && copyOptions && (
        <section className="config-panel copy-selection-step">
          <div className="step-header">
            <button className="back-btn" onClick={handleBackToConfig}>
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
                <span className="summary-label">Source:</span> Imported from Ads
              </span>
            )}
          </div>

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
            disabled={!canProceedToFinalConfig}
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
                </>
              ) : (
                <div className="summary-card">
                  <span className="summary-card-label">Copy Source</span>
                  <span className="summary-card-value">{copySource === 'import' ? 'Imported from Ads' : 'Manually Entered'}</span>
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
                <span className="ad-type-desc">Generate storyboard</span>
              </button>
            </div>
          </div>

          {/* Image Size Selection - only shown for image ads */}
          {adType === 'image' && (
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

          {/* Variation Count */}
          <div className="config-section">
            <label className="config-label">
              Number of Variations {adType === 'video' && '(storyboard only)'}
            </label>
            <div className="variation-options">
              {[1, 2, 3, 4, 5].map(count => (
                <button
                  key={count}
                  className={`variation-btn ${variationCount === count ? 'active' : ''}`}
                  onClick={() => setVariationCount(count)}
                  disabled={adType === 'video' && count > 1}
                >
                  {count}
                </button>
              ))}
            </div>
            {adType === 'video' && variationCount > 1 && (
              <p className="variation-note">Video storyboards generate one concept at a time</p>
            )}
          </div>

          {/* Creative Similarity Slider */}
          {imageCacheCount > 0 && adType === 'image' && (
            <div className="config-section similarity-section">
              <label className="config-label">
                Creative Variation Level
              </label>
              <p className="config-hint">
                Control how similar/different the new images should be compared to your reference images
              </p>
              <div className="similarity-slider-container">
                <div className="similarity-labels">
                  <span className="similarity-label-left">Very Similar</span>
                  <span className="similarity-label-right">More Creative</span>
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
                  {similarityValue <= 20 ? '🎯 Near Identical' :
                   similarityValue <= 40 ? '✨ Subtle Variations' :
                   similarityValue <= 60 ? '🔄 Balanced Mix' :
                   similarityValue <= 80 ? '🎨 More Creative' :
                   '🚀 Bold & Different'}
                  <span className="similarity-percent">{similarityValue}% variation</span>
                </div>
              </div>
            </div>
          )}

          {/* Cost Estimate */}
          <div className="cost-estimate">
            <span className="cost-icon">💰</span>
            <span className="cost-text">
              Estimated Cost: ${costEstimate.min.toFixed(2)} - ${costEstimate.max.toFixed(2)}
              <span className="cost-note"> ({costEstimate.note})</span>
            </span>
          </div>

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
            <h3 className="section-title">Generated Creatives ({generatedAds.length})</h3>
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
                Publish to Meta
              </button>
            </div>
          </div>
          <div className="generated-ads-list">
            {generatedAds.slice(0, visibleAdsCount).map(ad => (
              <GeneratedAdCard
                key={ad.id}
                ad={ad}
                onRegenerateImage={ad.adType === 'image' ? handleRegenerateImage : undefined}
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
    </div>
  );
};

export default AdGenerator;
