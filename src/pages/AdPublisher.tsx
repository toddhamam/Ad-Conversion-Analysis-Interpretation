import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  publishAds,
  fetchCampaignsForPublish,
  fetchAdSetsForPublish,
  searchTargetingSuggestions,
  fetchCustomAudiences,
  fetchAdPixels,
  type PublishConfig,
  type PublishResult,
  type CampaignForPublish,
  type AdSetForPublish,
  type CallToActionType,
  type CampaignObjective,
  type BudgetMode,
  type ConversionEvent,
  type GenderTarget,
  type DetailedTargetingItem,
  type AudienceRef,
  type PixelRef,
  type PublisherPlatform,
  type FacebookPosition,
  type InstagramPosition,
  type PlacementConfig,
  type FullTargetingSpec,
  type PublishPreset,
} from '../services/metaApi';
import './AdPublisher.css';

// Debug flag - set to true to enable verbose logging
const DEBUG_MODE = false;
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) console.log('[AdPublisher]', ...args);
};

// TEMPORARY: Set to true to skip localStorage loading for debugging
const SKIP_LOCALSTORAGE = false;

// Storage key for generated ads (shared with AdGenerator)
const GENERATED_ADS_STORAGE_KEY = 'conversion_intelligence_generated_ads';
const PRESETS_STORAGE_KEY = 'ci_publish_presets';
const PIXEL_ID_STORAGE_KEY = 'ci_publish_pixel_id';

// Publishing mode options
type PublishMode = 'new_campaign' | 'new_adset' | 'existing_adset';

interface PublishModeOption {
  id: PublishMode;
  name: string;
  description: string;
  icon: string;
}

const PUBLISH_MODE_OPTIONS: PublishModeOption[] = [
  {
    id: 'new_campaign',
    name: 'New Campaign',
    description: 'Create a brand new campaign with ad set and ads',
    icon: '🚀',
  },
  {
    id: 'new_adset',
    name: 'New Ad Set in Existing Campaign',
    description: 'Add ads to a new ad set within an existing campaign',
    icon: '📁',
  },
  {
    id: 'existing_adset',
    name: 'Existing Ad Set',
    description: 'Add ads directly to an existing ad set',
    icon: '📎',
  },
];

// CTA button options for dropdown
const CTA_BUTTON_OPTIONS: { id: CallToActionType; name: string }[] = [
  { id: 'SHOP_NOW', name: 'Shop Now' },
  { id: 'LEARN_MORE', name: 'Learn More' },
  { id: 'SIGN_UP', name: 'Sign Up' },
  { id: 'SUBSCRIBE', name: 'Subscribe' },
  { id: 'GET_OFFER', name: 'Get Offer' },
  { id: 'BOOK_NOW', name: 'Book Now' },
  { id: 'CONTACT_US', name: 'Contact Us' },
  { id: 'DOWNLOAD', name: 'Download' },
  { id: 'APPLY_NOW', name: 'Apply Now' },
  { id: 'BUY_NOW', name: 'Buy Now' },
  { id: 'ORDER_NOW', name: 'Order Now' },
  { id: 'LISTEN_NOW', name: 'Listen Now' },
  { id: 'GET_SHOWTIMES', name: 'Get Showtimes' },
  { id: 'REQUEST_TIME', name: 'Request Time' },
  { id: 'SEE_MENU', name: 'See Menu' },
  { id: 'PLAY_GAME', name: 'Play Game' },
];

// Campaign objective options - Sales is default/recommended
const OBJECTIVE_OPTIONS: { id: CampaignObjective; name: string }[] = [
  { id: 'OUTCOME_SALES', name: 'Sales (Recommended)' },
  { id: 'OUTCOME_TRAFFIC', name: 'Traffic' },
  { id: 'OUTCOME_AWARENESS', name: 'Awareness' },
  { id: 'OUTCOME_ENGAGEMENT', name: 'Engagement' },
  { id: 'OUTCOME_LEADS', name: 'Leads' },
];

// Conversion event options
const CONVERSION_EVENT_OPTIONS: { id: ConversionEvent; name: string }[] = [
  { id: 'PURCHASE', name: 'Purchase' },
  { id: 'ADD_TO_CART', name: 'Add to Cart' },
  { id: 'LEAD', name: 'Lead' },
  { id: 'COMPLETE_REGISTRATION', name: 'Complete Registration' },
  { id: 'INITIATE_CHECKOUT', name: 'Initiate Checkout' },
  { id: 'ADD_PAYMENT_INFO', name: 'Add Payment Info' },
  { id: 'SEARCH', name: 'Search' },
  { id: 'VIEW_CONTENT', name: 'View Content' },
];

// Placement options
const PUBLISHER_PLATFORM_OPTIONS: { id: PublisherPlatform; name: string }[] = [
  { id: 'facebook', name: 'Facebook' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'audience_network', name: 'Audience Network' },
  { id: 'messenger', name: 'Messenger' },
];

const FACEBOOK_POSITION_OPTIONS: { id: FacebookPosition; name: string }[] = [
  { id: 'feed', name: 'Feed' },
  { id: 'story', name: 'Stories' },
  { id: 'reels', name: 'Reels' },
  { id: 'video_feeds', name: 'Video Feeds' },
  { id: 'marketplace', name: 'Marketplace' },
  { id: 'search', name: 'Search Results' },
  { id: 'right_hand_column', name: 'Right Column' },
  { id: 'instream_video', name: 'In-Stream Video' },
];

const INSTAGRAM_POSITION_OPTIONS: { id: InstagramPosition; name: string }[] = [
  { id: 'stream', name: 'Feed' },
  { id: 'story', name: 'Stories' },
  { id: 'reels', name: 'Reels' },
  { id: 'explore', name: 'Explore' },
  { id: 'explore_home', name: 'Explore Home' },
  { id: 'profile_feed', name: 'Profile Feed' },
];

// Common country codes
const COMMON_COUNTRIES = [
  'US', 'AU', 'GB', 'CA', 'NZ', 'DE', 'FR', 'ES', 'IT', 'NL',
  'BR', 'MX', 'IN', 'JP', 'KR', 'SG', 'AE', 'ZA', 'PH', 'IE',
];

// Lightweight ad metadata - NO IMAGE DATA stored in state
interface AdMetadata {
  id: string;
  packageIndex: number;
  imageIndex: number;
  headline: string;
  bodyText: string;
  cta: string;
  audienceType: string;
  conceptType: string;
  generatedAt: string;
}

function formatDate(isoString: string): string {
  try {
    if (!isoString) return 'Unknown';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

function formatAudienceSize(size?: number): string {
  if (!size) return '';
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1_000) return `${(size / 1_000).toFixed(0)}K`;
  return size.toString();
}

// ASYNC metadata extraction - non-blocking to prevent Chrome crashes
async function extractMetadataAsync(): Promise<AdMetadata[]> {
  return new Promise((resolve) => {
    const scheduleWork = (callback: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(callback, { timeout: 2000 });
      } else {
        setTimeout(callback, 50);
      }
    };

    scheduleWork(() => {
      try {
        const stored = localStorage.getItem(GENERATED_ADS_STORAGE_KEY);
        if (!stored) {
          resolve([]);
          return;
        }

        const sizeInMB = (stored.length / (1024 * 1024)).toFixed(2);
        console.log(`[AdPublisher] localStorage data size: ${sizeInMB}MB`);

        if (stored.length > 3 * 1024 * 1024) {
          console.warn('[AdPublisher] Large localStorage detected, parsing may be slow');
        }

        let packages: any[];
        try {
          packages = JSON.parse(stored);
        } catch (parseErr) {
          console.error('[AdPublisher] JSON parse error:', parseErr);
          resolve([]);
          return;
        }

        if (!Array.isArray(packages)) {
          resolve([]);
          return;
        }

        const items: AdMetadata[] = [];

        for (let pkgIndex = 0; pkgIndex < packages.length; pkgIndex++) {
          const pkg = packages[pkgIndex];
          if (!pkg) continue;

          const images = pkg.images || [];
          if (!Array.isArray(images) || images.length === 0) continue;

          const copy = pkg.copy || {};
          const headlines = Array.isArray(copy.headlines) ? copy.headlines : ['Ad Creative'];
          const bodyTexts = Array.isArray(copy.bodyTexts) ? copy.bodyTexts : [''];
          const ctas = Array.isArray(copy.callToActions) ? copy.callToActions : ['Learn More'];

          for (let imgIndex = 0; imgIndex < images.length; imgIndex++) {
            items.push({
              id: `${pkg.id || pkgIndex}_${imgIndex}`,
              packageIndex: pkgIndex,
              imageIndex: imgIndex,
              headline: headlines[imgIndex % headlines.length] || 'Ad Creative',
              bodyText: bodyTexts[imgIndex % bodyTexts.length] || '',
              cta: ctas[imgIndex % ctas.length] || 'Learn More',
              audienceType: pkg.audienceType || 'prospecting',
              conceptType: pkg.conceptType || 'auto',
              generatedAt: pkg.generatedAt || new Date().toISOString(),
            });
          }
        }

        resolve(items);
      } catch (err) {
        console.error('[AdPublisher] Error extracting metadata:', err);
        resolve([]);
      }
    });
  });
}

async function loadImageDataForPublish(metadata: AdMetadata[]): Promise<{ imageUrl: string; headline: string; bodyText: string; cta: string }[]> {
  return new Promise((resolve) => {
    try {
      const stored = localStorage.getItem(GENERATED_ADS_STORAGE_KEY);
      if (!stored) {
        resolve([]);
        return;
      }

      let packages: any[];
      try {
        packages = JSON.parse(stored);
      } catch {
        resolve([]);
        return;
      }

      if (!Array.isArray(packages)) {
        resolve([]);
        return;
      }

      const results = metadata.map(meta => {
        const pkg = packages[meta.packageIndex];
        if (!pkg) return null;

        const images = pkg.images || [];
        const img = images[meta.imageIndex];
        if (!img) return null;

        const imageUrl = img.imageUrl || img.url || img;
        return {
          imageUrl,
          headline: meta.headline,
          bodyText: meta.bodyText,
          cta: meta.cta,
        };
      }).filter(Boolean) as { imageUrl: string; headline: string; bodyText: string; cta: string }[];

      resolve(results);
    } catch (err) {
      console.error('[AdPublisher] Error loading image data for publish:', err);
      resolve([]);
    }
  });
}

const MAX_VISIBLE_ADS = 20;
const MAX_TOTAL_ADS = 50;

type PublishStep = 'select' | 'destination' | 'configure' | 'review';

const AdPublisher = () => {
  const navigate = useNavigate();

  const renderCountRef = useRef(0);
  const mountedRef = useRef(false);
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9));
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetingDropdownRef = useRef<HTMLDivElement>(null);

  renderCountRef.current += 1;
  debugLog(`Render #${renderCountRef.current} (instance: ${instanceIdRef.current})`);

  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [adMetadata, setAdMetadata] = useState<AdMetadata[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState<PublishStep>('select');
  const [publishMode, setPublishMode] = useState<PublishMode>('new_campaign');
  const [campaigns, setCampaigns] = useState<CampaignForPublish[]>([]);
  const [adSets, setAdSets] = useState<AdSetForPublish[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedAdSetId, setSelectedAdSetId] = useState('');
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [isLoadingAdSets, setIsLoadingAdSets] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleAdsCount, setVisibleAdsCount] = useState(MAX_VISIBLE_ADS);

  // Campaign settings
  const [campaignName, setCampaignName] = useState('');
  const [adsetName, setAdsetName] = useState('');
  const [campaignObjective, setCampaignObjective] = useState<CampaignObjective>('OUTCOME_SALES');
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('CBO');
  const [dailyBudget, setDailyBudget] = useState(50);

  // Conversion tracking
  const [conversionEvent, setConversionEvent] = useState<ConversionEvent>('PURCHASE');
  const [availablePixels, setAvailablePixels] = useState<PixelRef[]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [pixelId, setPixelId] = useState(() => {
    const saved = localStorage.getItem(PIXEL_ID_STORAGE_KEY);
    return saved || import.meta.env.VITE_META_PIXEL_ID || '';
  });

  // Targeting
  const [targetCountries, setTargetCountries] = useState<string[]>(['US', 'AU', 'GB', 'CA']);
  const [countryInput, setCountryInput] = useState('');
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [genders, setGenders] = useState<GenderTarget[]>([0]);
  const [detailedTargeting, setDetailedTargeting] = useState<DetailedTargetingItem[]>([]);
  const [targetingSearchQuery, setTargetingSearchQuery] = useState('');
  const [targetingSearchResults, setTargetingSearchResults] = useState<DetailedTargetingItem[]>([]);
  const [isSearchingTargeting, setIsSearchingTargeting] = useState(false);
  const [targetingSearchError, setTargetingSearchError] = useState<string | null>(null);
  const [customAudiences, setCustomAudiences] = useState<AudienceRef[]>([]);
  const [excludedAudiences, setExcludedAudiences] = useState<AudienceRef[]>([]);
  const [availableAudiences, setAvailableAudiences] = useState<AudienceRef[]>([]);
  const [isLoadingAudiences, setIsLoadingAudiences] = useState(false);
  const [audiencesLoaded, setAudiencesLoaded] = useState(false);
  const [audiencesError, setAudiencesError] = useState<string | null>(null);
  const [selectedAudienceId, setSelectedAudienceId] = useState('');
  const [selectedExcludeAudienceId, setSelectedExcludeAudienceId] = useState('');

  // Placements
  const [placementAutomatic, setPlacementAutomatic] = useState(true);
  const [publisherPlatforms, setPublisherPlatforms] = useState<PublisherPlatform[]>(['facebook', 'instagram']);
  const [facebookPositions, setFacebookPositions] = useState<FacebookPosition[]>(['feed', 'story', 'reels']);
  const [instagramPositions, setInstagramPositions] = useState<InstagramPosition[]>(['stream', 'story', 'reels']);

  // Ad setup
  const [landingPageUrl, setLandingPageUrl] = useState('https://example.com/offer');
  const [ctaButtonType, setCtaButtonType] = useState<CallToActionType>('SHOP_NOW');
  const [urlParameters, setUrlParameters] = useState('');

  // Presets
  const [presets, setPresets] = useState<PublishPreset[]>(() => {
    try {
      const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Derive the effective campaign objective based on mode
  // For new_adset: inherit from the selected existing campaign
  // For new_campaign: use the local campaignObjective state
  const effectiveCampaignObjective = useMemo((): CampaignObjective => {
    if (publishMode === 'new_adset' && selectedCampaignId) {
      const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
      if (selectedCampaign?.objective) {
        return selectedCampaign.objective as CampaignObjective;
      }
    }
    return campaignObjective;
  }, [publishMode, selectedCampaignId, campaigns, campaignObjective]);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['campaign', 'conversion', 'targeting', 'ad-setup'])
  );

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  // Load metadata on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    debugLog(`Component mounted (instance: ${instanceIdRef.current})`);
    let isCancelled = false;

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    setCampaignName(`CI Campaign - ${dateStr}`);
    setAdsetName(`CI Ad Set - ${dateStr}`);

    const loadMetadata = async () => {
      if (SKIP_LOCALSTORAGE) {
        if (!isCancelled) { setAdMetadata([]); setIsLoading(false); }
        return;
      }

      try {
        const metadata = await extractMetadataAsync();
        if (!isCancelled) {
          setAdMetadata(metadata.slice(0, MAX_TOTAL_ADS));
        }
      } catch (err) {
        console.error('[AdPublisher] Load error:', err);
      }
      if (!isCancelled) setIsLoading(false);
    };

    const timeoutId = setTimeout(loadMetadata, 100);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // Debounced targeting search
  useEffect(() => {
    if (!targetingSearchQuery.trim()) {
      setTargetingSearchResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      setIsSearchingTargeting(true);
      setTargetingSearchError(null);
      try {
        const results = await searchTargetingSuggestions(targetingSearchQuery);
        // Filter out already-selected items
        const selectedIds = new Set(detailedTargeting.map(t => t.id));
        setTargetingSearchResults(results.filter(r => !selectedIds.has(r.id)));
      } catch (err) {
        setTargetingSearchResults([]);
        setTargetingSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setIsSearchingTargeting(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [targetingSearchQuery, detailedTargeting]);

  // Close targeting dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (targetingDropdownRef.current && !targetingDropdownRef.current.contains(e.target as Node)) {
        setTargetingSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selection handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(adMetadata.map(a => a.id)));
  }, [adMetadata]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedMetadata = useMemo(() => {
    return adMetadata.filter(a => selectedIds.has(a.id));
  }, [adMetadata, selectedIds]);

  // Country tag handlers
  const addCountry = useCallback((code: string) => {
    const upper = code.toUpperCase().trim();
    if (upper.length === 2 && !targetCountries.includes(upper)) {
      setTargetCountries(prev => [...prev, upper]);
    }
    setCountryInput('');
  }, [targetCountries]);

  const removeCountry = useCallback((code: string) => {
    setTargetCountries(prev => prev.filter(c => c !== code));
  }, []);

  // Targeting handlers
  const addTargetingItem = useCallback((item: DetailedTargetingItem) => {
    setDetailedTargeting(prev => [...prev, item]);
    setTargetingSearchQuery('');
    setTargetingSearchResults([]);
  }, []);

  const removeTargetingItem = useCallback((id: string) => {
    setDetailedTargeting(prev => prev.filter(t => t.id !== id));
  }, []);

  // Audience handlers
  const loadAvailableAudiences = useCallback(async () => {
    setIsLoadingAudiences(true);
    setAudiencesError(null);
    try {
      const audiences = await fetchCustomAudiences();
      setAvailableAudiences(audiences);
      setAudiencesLoaded(true);
    } catch (err) {
      setAvailableAudiences([]);
      setAudiencesLoaded(true);
      setAudiencesError(err instanceof Error ? err.message : 'Failed to load audiences');
    } finally {
      setIsLoadingAudiences(false);
    }
  }, []);

  // Pixel fetch
  const loadAvailablePixels = useCallback(async () => {
    setPixelsLoading(true);
    try {
      const pixels = await fetchAdPixels();
      setAvailablePixels(pixels);
      // Auto-select first pixel if none saved
      if (!pixelId && pixels.length > 0) {
        setPixelId(pixels[0].id);
        localStorage.setItem(PIXEL_ID_STORAGE_KEY, pixels[0].id);
      }
    } catch (err) {
      console.warn('Could not fetch pixels:', err);
      setAvailablePixels([]);
    } finally {
      setPixelsLoading(false);
    }
  }, [pixelId]);

  // Load pixels when conversion section is expanded
  useEffect(() => {
    if (expandedSections.has('conversion') && availablePixels.length === 0 && !pixelsLoading) {
      loadAvailablePixels();
    }
  }, [expandedSections, availablePixels.length, pixelsLoading, loadAvailablePixels]);

  const addCustomAudience = useCallback(() => {
    const audience = availableAudiences.find(a => a.id === selectedAudienceId);
    if (audience && !customAudiences.some(a => a.id === audience.id)) {
      setCustomAudiences(prev => [...prev, audience]);
    }
    setSelectedAudienceId('');
  }, [selectedAudienceId, availableAudiences, customAudiences]);

  const addExcludedAudience = useCallback(() => {
    const audience = availableAudiences.find(a => a.id === selectedExcludeAudienceId);
    if (audience && !excludedAudiences.some(a => a.id === audience.id)) {
      setExcludedAudiences(prev => [...prev, audience]);
    }
    setSelectedExcludeAudienceId('');
  }, [selectedExcludeAudienceId, availableAudiences, excludedAudiences]);

  // Placement toggle helpers
  const togglePlatform = useCallback((platform: PublisherPlatform) => {
    setPublisherPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  }, []);

  const toggleFbPosition = useCallback((pos: FacebookPosition) => {
    setFacebookPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  }, []);

  const toggleIgPosition = useCallback((pos: InstagramPosition) => {
    setInstagramPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  }, []);

  // Preset handlers
  const savePreset = useCallback(() => {
    if (!presetName.trim()) return;

    const newPreset: PublishPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      createdAt: new Date().toISOString(),
      config: {
        campaignObjective,
        budgetMode,
        dailyBudget,
        conversionEvent: campaignObjective === 'OUTCOME_SALES' ? conversionEvent : undefined,
        pixelId: campaignObjective === 'OUTCOME_SALES' ? pixelId : undefined,
        targeting: {
          geoLocations: { countries: targetCountries },
          ageMin,
          ageMax,
          genders,
          flexibleSpec: detailedTargeting.length > 0 ? [detailedTargeting] : undefined,
          customAudiences: customAudiences.length > 0 ? customAudiences : undefined,
          excludedCustomAudiences: excludedAudiences.length > 0 ? excludedAudiences : undefined,
        },
        placements: {
          automatic: placementAutomatic,
          publisherPlatforms: !placementAutomatic ? publisherPlatforms : undefined,
          facebookPositions: !placementAutomatic ? facebookPositions : undefined,
          instagramPositions: !placementAutomatic ? instagramPositions : undefined,
        },
        landingPageUrl,
        ctaButtonType,
        urlParameters: urlParameters || undefined,
      },
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
    setSelectedPresetId(newPreset.id);
    setPresetName('');
    setShowSavePreset(false);
  }, [presetName, campaignObjective, budgetMode, dailyBudget, conversionEvent, pixelId,
      targetCountries, ageMin, ageMax, genders, detailedTargeting, customAudiences,
      excludedAudiences, placementAutomatic, publisherPlatforms, facebookPositions,
      instagramPositions, landingPageUrl, ctaButtonType, urlParameters, presets]);

  const loadPreset = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    const c = preset.config;
    setCampaignObjective(c.campaignObjective);
    setBudgetMode(c.budgetMode);
    setDailyBudget(c.dailyBudget);
    if (c.conversionEvent) setConversionEvent(c.conversionEvent);
    if (c.pixelId) setPixelId(c.pixelId);
    setTargetCountries(c.targeting.geoLocations.countries);
    setAgeMin(c.targeting.ageMin);
    setAgeMax(c.targeting.ageMax);
    setGenders(c.targeting.genders);
    setDetailedTargeting(c.targeting.flexibleSpec?.[0] || []);
    setCustomAudiences(c.targeting.customAudiences || []);
    setExcludedAudiences(c.targeting.excludedCustomAudiences || []);
    setPlacementAutomatic(c.placements.automatic);
    if (c.placements.publisherPlatforms) setPublisherPlatforms(c.placements.publisherPlatforms);
    if (c.placements.facebookPositions) setFacebookPositions(c.placements.facebookPositions);
    if (c.placements.instagramPositions) setInstagramPositions(c.placements.instagramPositions);
    setLandingPageUrl(c.landingPageUrl);
    if (c.ctaButtonType) setCtaButtonType(c.ctaButtonType);
    setUrlParameters(c.urlParameters || '');
    setSelectedPresetId(presetId);
  }, [presets]);

  const deletePreset = useCallback((presetId: string) => {
    const updated = presets.filter(p => p.id !== presetId);
    setPresets(updated);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updated));
    if (selectedPresetId === presetId) setSelectedPresetId('');
  }, [presets, selectedPresetId]);

  // API calls
  const loadCampaigns = async () => {
    setIsLoadingCampaigns(true);
    setError(null);
    try {
      const result = await fetchCampaignsForPublish();
      setCampaigns(result || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load campaigns');
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const loadAdSets = async (campaignId: string) => {
    if (!campaignId) return;
    setIsLoadingAdSets(true);
    setError(null);
    try {
      const result = await fetchAdSetsForPublish(campaignId);
      setAdSets(result || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load ad sets');
    } finally {
      setIsLoadingAdSets(false);
    }
  };

  const handleModeChange = (mode: PublishMode) => {
    setPublishMode(mode);
    setSelectedCampaignId('');
    setSelectedAdSetId('');
    setAdSets([]);
    // Fetch campaigns when switching to a mode that needs them
    if (mode !== 'new_campaign' && campaigns.length === 0) {
      loadCampaigns();
    }
  };

  const handleCampaignSelect = (id: string) => {
    setSelectedCampaignId(id);
    setSelectedAdSetId('');
    if (publishMode === 'existing_adset' && id) {
      loadAdSets(id);
    }
  };

  const goToStep = (step: PublishStep) => {
    // Pre-load campaigns when entering the destination step so they're ready
    // if the user switches to new_adset or existing_adset mode
    if (step === 'destination' && campaigns.length === 0) {
      loadCampaigns();
    }
    if (step === 'configure' && !audiencesLoaded) {
      loadAvailableAudiences();
    }
    setCurrentStep(step);
    // Scroll to top of page on step change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Validation
  const canProceedToDestination = selectedIds.size > 0;
  const canProceedToConfigure = publishMode === 'new_campaign' ||
    (publishMode === 'new_adset' && !!selectedCampaignId) ||
    (publishMode === 'existing_adset' && !!selectedCampaignId && !!selectedAdSetId);

  const canProceedToReview = useMemo(() => {
    if (!landingPageUrl) return false;
    if (publishMode === 'existing_adset') return true;
    // For new_campaign: require campaignName, adsetName, and budget
    // For new_adset: only require adsetName and budget (campaign already exists)
    if (publishMode === 'new_campaign' && !campaignName) return false;
    if (!adsetName || dailyBudget <= 0) return false;
    if (effectiveCampaignObjective === 'OUTCOME_SALES' && !pixelId) return false;
    if (targetCountries.length === 0) return false;
    if (!placementAutomatic && publisherPlatforms.length === 0) return false;
    return true;
  }, [landingPageUrl, publishMode, campaignName, adsetName, dailyBudget,
      effectiveCampaignObjective, pixelId, targetCountries, placementAutomatic, publisherPlatforms]);

  // Build targeting and placements for review/publish
  const buildTargeting = useCallback((): FullTargetingSpec => ({
    geoLocations: { countries: targetCountries },
    ageMin,
    ageMax,
    genders,
    flexibleSpec: detailedTargeting.length > 0 ? [detailedTargeting] : undefined,
    customAudiences: customAudiences.length > 0 ? customAudiences : undefined,
    excludedCustomAudiences: excludedAudiences.length > 0 ? excludedAudiences : undefined,
  }), [targetCountries, ageMin, ageMax, genders, detailedTargeting, customAudiences, excludedAudiences]);

  const buildPlacements = useCallback((): PlacementConfig => ({
    automatic: placementAutomatic,
    publisherPlatforms: !placementAutomatic ? publisherPlatforms : undefined,
    facebookPositions: !placementAutomatic ? facebookPositions : undefined,
    instagramPositions: !placementAutomatic ? instagramPositions : undefined,
  }), [placementAutomatic, publisherPlatforms, facebookPositions, instagramPositions]);

  // Handle publish
  const handlePublish = async () => {
    setIsPublishing(true);
    setError(null);
    setPublishResult(null);

    try {
      const adsWithImages = await loadImageDataForPublish(selectedMetadata);

      if (adsWithImages.length === 0) {
        throw new Error('No ads to publish');
      }

      // Build the final landing page URL with tracking parameters
      const finalLandingPageUrl = urlParameters.trim()
        ? `${landingPageUrl}${landingPageUrl.includes('?') ? '&' : '?'}${urlParameters.trim()}`
        : landingPageUrl;

      const config: PublishConfig = {
        mode: publishMode,
        ads: adsWithImages.map(ad => ({
          imageBase64: ad.imageUrl,
          headline: ad.headline,
          bodyText: `${ad.bodyText}\n\n${finalLandingPageUrl}`,
          callToAction: ctaButtonType,
        })),
        settings: {
          campaignName: publishMode === 'new_campaign' ? campaignName : undefined,
          campaignObjective: publishMode !== 'existing_adset' ? effectiveCampaignObjective : undefined,
          budgetMode: publishMode === 'new_campaign' ? budgetMode : publishMode === 'new_adset' ? 'ABO' as BudgetMode : undefined,
          adsetName: publishMode !== 'existing_adset' ? adsetName : undefined,
          dailyBudget: publishMode !== 'existing_adset' ? dailyBudget : undefined,
          landingPageUrl: finalLandingPageUrl,
          conversionEvent: effectiveCampaignObjective === 'OUTCOME_SALES' ? conversionEvent : undefined,
          pixelId: effectiveCampaignObjective === 'OUTCOME_SALES' ? pixelId : undefined,
          targeting: publishMode !== 'existing_adset' ? buildTargeting() : undefined,
          placements: publishMode !== 'existing_adset' ? buildPlacements() : undefined,
        },
        existingCampaignId: publishMode !== 'new_campaign' ? selectedCampaignId : undefined,
        existingAdSetId: publishMode === 'existing_adset' ? selectedAdSetId : undefined,
      };

      const result = await publishAds(config);
      setPublishResult(result);
      if (!result?.success) {
        setError(result?.error || 'Failed to publish');
      }
    } catch (err: any) {
      setError(err?.message || 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  };

  // Step ordering for completed state
  const STEP_ORDER: PublishStep[] = ['select', 'destination', 'configure', 'review'];
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const isStepCompleted = (step: PublishStep) => STEP_ORDER.indexOf(step) < currentStepIndex;

  // Loading state
  if (isLoading) {
    return (
      <div className="page ad-publisher-page">
        <div className="page-header">
          <h1 className="page-title">Ad Publisher</h1>
          <p className="page-subtitle">Preparing your ads...</p>
        </div>
        <div className="publisher-loading">
          <div className="loading-spinner"></div>
          <p>ConversionIQ™ loading your generated ads...</p>
          <p className="loading-hint">This may take a moment for large ad libraries</p>
        </div>
      </div>
    );
  }

  // Targeting summary for review
  const targetingSummary = `${targetCountries.join(', ')} | Ages ${ageMin}-${ageMax} | ${genders.includes(0) ? 'All Genders' : genders.map(g => g === 1 ? 'Male' : 'Female').join(', ')}`;

  return (
    <div className="page ad-publisher-page" data-instance={instanceIdRef.current}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Ad Publisher</h1>
          <p className="page-subtitle">Publish your generated ads to Meta</p>
        </div>
        <button className="back-to-generator-btn" onClick={() => navigate('/creatives')}>
          ← Back to Generator
        </button>
      </div>

      <div className="publisher-draft-warning">
        <span className="warning-icon">⚠️</span>
        <span className="warning-text">
          All ads will be created in <strong>DRAFT/PAUSED</strong> mode.
        </span>
      </div>

      {/* Step Indicator */}
      <div className="publisher-steps">
        {STEP_ORDER.map((step, i) => {
          const labels = ['Select', 'Destination', 'Configure', 'Review'];
          const isActive = currentStep === step;
          const isDone = isStepCompleted(step);
          return (
            <span key={step} className="publisher-step-group">
              {i > 0 && <div className={`publisher-step-connector ${isDone ? 'completed' : ''}`} />}
              <div className={`publisher-step ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}>
                <span className="publisher-step-num">{isDone ? '✓' : i + 1}</span>
                <span className="publisher-step-label">{labels[i]}</span>
              </div>
            </span>
          );
        })}
      </div>

      {error && (
        <div className="publisher-error" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>
          <span className="error-icon">❌</span>
          {error}
        </div>
      )}

      {/* STEP 1: SELECT ADS */}
      {currentStep === 'select' && (
        <section className="publisher-panel">
          <h3 className="panel-title">Step 1: Select Ads to Publish</h3>

          {adMetadata.length === 0 ? (
            <div className="publisher-empty-state">
              <div className="empty-icon">📭</div>
              <h4>No Generated Ads Found</h4>
              <p>Generate some ads first, then come back to publish them.</p>
              <button className="primary-btn" onClick={() => navigate('/creatives')}>
                Go to Ad Generator
              </button>
            </div>
          ) : (
            <>
              <div className="selection-controls">
                <button className="selection-btn" onClick={selectAll}>
                  Select All ({adMetadata.length})
                </button>
                <button className="selection-btn" onClick={deselectAll}>
                  Deselect All
                </button>
                <span className="selection-count">
                  {selectedIds.size} of {adMetadata.length} selected
                </span>
              </div>

              <div className="ads-list-text">
                {adMetadata.slice(0, visibleAdsCount).map(item => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`ad-list-item ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName === 'INPUT') return;
                        toggleSelection(item.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(item.id)}
                      />
                      <div className="ad-list-content">
                        <div className="ad-list-headline">{item.headline}</div>
                        <div className="ad-list-meta">
                          {formatDate(item.generatedAt)} • {item.audienceType} • {item.conceptType}
                        </div>
                      </div>
                      <div className="ad-list-cta">{item.cta}</div>
                    </div>
                  );
                })}
              </div>

              {visibleAdsCount < adMetadata.length && (
                <button
                  className="show-more-btn"
                  onClick={() => setVisibleAdsCount(prev => prev + MAX_VISIBLE_ADS)}
                >
                  Load More ({adMetadata.length - visibleAdsCount} remaining)
                </button>
              )}

              <button
                className="primary-btn continue-btn"
                onClick={() => goToStep('destination')}
                disabled={!canProceedToDestination}
              >
                Continue with {selectedIds.size} Ad{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </>
          )}
        </section>
      )}

      {/* STEP 2: DESTINATION */}
      {currentStep === 'destination' && (
        <section className="publisher-panel">
          <div className="panel-header">
            <button className="back-btn" onClick={() => goToStep('select')}>← Back</button>
            <h3 className="panel-title">Step 2: Choose Destination</h3>
          </div>

          <div className="mode-options">
            {PUBLISH_MODE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                className={`mode-btn ${publishMode === opt.id ? 'active' : ''}`}
                onClick={() => handleModeChange(opt.id)}
              >
                <span className="mode-icon">{opt.icon}</span>
                <span className="mode-name">{opt.name}</span>
                <span className="mode-desc">{opt.description}</span>
              </button>
            ))}
          </div>

          {publishMode !== 'new_campaign' && (
            <div className="destination-selectors">
              <div className="selector-group">
                <label className="selector-label">Select Campaign</label>
                {isLoadingCampaigns ? (
                  <div className="loading-indicator">Loading campaigns...</div>
                ) : campaigns.length === 0 ? (
                  <div className="no-data-message">No campaigns found</div>
                ) : (
                  <select
                    value={selectedCampaignId}
                    onChange={e => handleCampaignSelect(e.target.value)}
                    className="selector-dropdown"
                  >
                    <option value="">-- Select a campaign --</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.status === 'PAUSED' ? '⏸ ' : c.status === 'DRAFT' ? '📝 ' : ''}{c.name} — {c.objective?.replace('OUTCOME_', '')} ({c.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {publishMode === 'existing_adset' && selectedCampaignId && (
                <div className="selector-group">
                  <label className="selector-label">Select Ad Set</label>
                  {isLoadingAdSets ? (
                    <div className="loading-indicator">Loading ad sets...</div>
                  ) : adSets.length === 0 ? (
                    <div className="no-data-message">No ad sets found</div>
                  ) : (
                    <select
                      value={selectedAdSetId}
                      onChange={e => setSelectedAdSetId(e.target.value)}
                      className="selector-dropdown"
                    >
                      <option value="">-- Select an ad set --</option>
                      {adSets.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.status === 'PAUSED' ? '⏸ ' : a.status === 'DRAFT' ? '📝 ' : ''}{a.name}{a.dailyBudget ? ` — $${a.dailyBudget}/day` : ''} ({a.status})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            className="primary-btn continue-btn"
            onClick={() => goToStep('configure')}
            disabled={!canProceedToConfigure}
          >
            Continue to Configuration
          </button>
        </section>
      )}

      {/* STEP 3: CONFIGURE */}
      {currentStep === 'configure' && (
        <section className="publisher-panel">
          <div className="panel-header">
            <button className="back-btn" onClick={() => goToStep('destination')}>← Back</button>
            <h3 className="panel-title">Step 3: Configure Settings</h3>
          </div>

          {/* Preset Bar */}
          <div className="preset-bar">
            <span className="preset-bar-label">Preset:</span>
            <select
              value={selectedPresetId}
              onChange={e => {
                setSelectedPresetId(e.target.value);
                if (e.target.value) loadPreset(e.target.value);
              }}
            >
              <option value="">-- None --</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedPresetId && (
              <button className="preset-btn preset-btn-delete" onClick={() => deletePreset(selectedPresetId)}>
                Delete
              </button>
            )}
            {!showSavePreset ? (
              <button className="preset-btn preset-btn-save" onClick={() => setShowSavePreset(true)}>
                Save As Preset
              </button>
            ) : (
              <div className="preset-save-inline">
                <input
                  type="text"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  placeholder="Preset name..."
                  onKeyDown={e => e.key === 'Enter' && savePreset()}
                />
                <button className="preset-btn preset-btn-save" onClick={savePreset}>Save</button>
                <button className="preset-btn preset-btn-delete" onClick={() => { setShowSavePreset(false); setPresetName(''); }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {publishMode === 'new_adset' && selectedCampaignId && (
            <div className="inherited-campaign-info">
              <span className="info-icon">ℹ️</span>
              <span>
                Creating ad set in campaign: <strong>{campaigns.find(c => c.id === selectedCampaignId)?.name}</strong>
                {' '}— Objective: <strong>
                  {OBJECTIVE_OPTIONS.find(o => o.id === effectiveCampaignObjective)?.name || effectiveCampaignObjective}
                </strong>
              </span>
            </div>
          )}

          <div className="config-form">

            {/* CAMPAIGN SETTINGS */}
            {publishMode === 'new_campaign' && (
              <div className="config-section">
                <button
                  className={`config-section-header ${expandedSections.has('campaign') ? 'expanded' : ''}`}
                  onClick={() => toggleSection('campaign')}
                >
                  <span className="section-title">Campaign Settings</span>
                  <span className="section-arrow">▼</span>
                </button>
                {expandedSections.has('campaign') && (
                  <div className="config-section-body">
                    <div className="form-group">
                      <label className="form-label">Campaign Name</label>
                      <input
                        type="text"
                        value={campaignName}
                        onChange={e => setCampaignName(e.target.value)}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Campaign Objective</label>
                      <select
                        value={campaignObjective}
                        onChange={e => setCampaignObjective(e.target.value as CampaignObjective)}
                        className="form-select"
                      >
                        {OBJECTIVE_OPTIONS.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Budget Optimization</label>
                      <div className="toggle-group">
                        <button
                          className={`toggle-option ${budgetMode === 'CBO' ? 'active' : ''}`}
                          onClick={() => setBudgetMode('CBO')}
                        >
                          CBO (Campaign Budget)
                        </button>
                        <button
                          className={`toggle-option ${budgetMode === 'ABO' ? 'active' : ''}`}
                          onClick={() => setBudgetMode('ABO')}
                        >
                          ABO (Ad Set Budget)
                        </button>
                      </div>
                      <span className="form-sublabel">
                        {budgetMode === 'CBO'
                          ? 'Meta distributes budget across ad sets automatically'
                          : 'Each ad set manages its own budget independently'}
                      </span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Daily Budget ($)</label>
                      <input
                        type="number"
                        value={dailyBudget}
                        onChange={e => setDailyBudget(Number(e.target.value))}
                        className="form-input"
                        min={1}
                      />
                      <span className="form-sublabel">
                        Budget applies at {budgetMode === 'CBO' ? 'campaign' : 'ad set'} level
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CONVERSION TRACKING (only for OUTCOME_SALES) */}
            {publishMode !== 'existing_adset' && effectiveCampaignObjective === 'OUTCOME_SALES' && (
              <div className="config-section">
                <button
                  className={`config-section-header ${expandedSections.has('conversion') ? 'expanded' : ''}`}
                  onClick={() => toggleSection('conversion')}
                >
                  <span className="section-title">Conversion Tracking</span>
                  <span className="section-arrow">▼</span>
                </button>
                {expandedSections.has('conversion') && (
                  <div className="config-section-body">
                    <div className="form-group">
                      <label className="form-label">Meta Pixel / Dataset</label>
                      {pixelsLoading ? (
                        <div className="form-sublabel">Loading pixels...</div>
                      ) : availablePixels.length > 0 ? (
                        <select
                          value={pixelId}
                          onChange={e => {
                            const val = e.target.value;
                            setPixelId(val);
                            localStorage.setItem(PIXEL_ID_STORAGE_KEY, val);
                          }}
                          className="form-select"
                        >
                          <option value="">Select a pixel...</option>
                          {availablePixels.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={pixelId}
                          onChange={e => {
                            const val = e.target.value;
                            setPixelId(val);
                            localStorage.setItem(PIXEL_ID_STORAGE_KEY, val);
                          }}
                          className="form-input"
                          placeholder="Enter your Pixel ID"
                        />
                      )}
                      <span className="form-sublabel">
                        Required for Sales objective. Pulled from your ad account.
                      </span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Conversion Event</label>
                      <select
                        value={conversionEvent}
                        onChange={e => setConversionEvent(e.target.value as ConversionEvent)}
                        className="form-select"
                      >
                        {CONVERSION_EVENT_OPTIONS.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TARGETING */}
            {publishMode !== 'existing_adset' && (
              <div className="config-section">
                <button
                  className={`config-section-header ${expandedSections.has('targeting') ? 'expanded' : ''}`}
                  onClick={() => toggleSection('targeting')}
                >
                  <span className="section-title">Targeting</span>
                  <span className="section-arrow">▼</span>
                </button>
                {expandedSections.has('targeting') && (
                  <div className="config-section-body">
                    {/* Countries */}
                    <div className="form-group">
                      <label className="form-label">Countries</label>
                      <div className="tag-input-container">
                        {targetCountries.map(code => (
                          <span key={code} className="tag-item">
                            {code}
                            <span className="tag-remove" onClick={() => removeCountry(code)}>×</span>
                          </span>
                        ))}
                        <input
                          type="text"
                          className="tag-input"
                          value={countryInput}
                          onChange={e => setCountryInput(e.target.value.toUpperCase())}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              addCountry(countryInput);
                            }
                            if (e.key === 'Backspace' && !countryInput && targetCountries.length > 0) {
                              removeCountry(targetCountries[targetCountries.length - 1]);
                            }
                          }}
                          placeholder="Type country code (e.g. US)..."
                          maxLength={2}
                        />
                      </div>
                      <span className="form-sublabel">
                        Common: {COMMON_COUNTRIES.filter(c => !targetCountries.includes(c)).slice(0, 8).map(c => (
                          <span
                            key={c}
                            className="country-quick-add"
                            onClick={() => addCountry(c)}
                          >
                            {c}
                          </span>
                        ))}
                      </span>
                    </div>

                    {/* Age Range */}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Min Age</label>
                        <input
                          type="number"
                          value={ageMin}
                          onChange={e => setAgeMin(Math.max(18, Math.min(65, Number(e.target.value))))}
                          className="form-input"
                          min={18}
                          max={65}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Max Age</label>
                        <select
                          value={ageMax}
                          onChange={e => setAgeMax(Number(e.target.value))}
                          className="form-select"
                        >
                          {Array.from({ length: 48 }, (_, i) => i + 18).map(age => (
                            <option key={age} value={age}>
                              {age === 65 ? '65+' : age}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Gender */}
                    <div className="form-group">
                      <label className="form-label">Gender</label>
                      <div className="gender-radio-group">
                        <label className="gender-radio-item">
                          <input
                            type="radio"
                            name="gender"
                            checked={genders.includes(0)}
                            onChange={() => setGenders([0])}
                          />
                          All
                        </label>
                        <label className="gender-radio-item">
                          <input
                            type="radio"
                            name="gender"
                            checked={genders.length === 1 && genders[0] === 1}
                            onChange={() => setGenders([1])}
                          />
                          Male
                        </label>
                        <label className="gender-radio-item">
                          <input
                            type="radio"
                            name="gender"
                            checked={genders.length === 1 && genders[0] === 2}
                            onChange={() => setGenders([2])}
                          />
                          Female
                        </label>
                      </div>
                    </div>

                    {/* Detailed Targeting Suggestions */}
                    <div className="form-group">
                      <label className="form-label">Detailed Targeting (Interests & Behaviors)</label>
                      <div className="targeting-search-container" ref={targetingDropdownRef}>
                        <input
                          type="text"
                          className="targeting-search-input"
                          value={targetingSearchQuery}
                          onChange={e => setTargetingSearchQuery(e.target.value)}
                          placeholder="Search interests, behaviors, demographics..."
                        />
                        {(targetingSearchResults.length > 0 || isSearchingTargeting || targetingSearchError) && targetingSearchQuery && (
                          <div className="targeting-search-dropdown">
                            {isSearchingTargeting ? (
                              <div className="targeting-search-loading">Searching...</div>
                            ) : targetingSearchError ? (
                              <div className="targeting-search-empty" style={{ color: '#ef4444' }}>
                                API error: {targetingSearchError}
                              </div>
                            ) : targetingSearchResults.length === 0 ? (
                              <div className="targeting-search-empty">No results found</div>
                            ) : (
                              targetingSearchResults.slice(0, 10).map(item => (
                                <button
                                  key={item.id}
                                  className="targeting-search-item"
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    addTargetingItem(item);
                                  }}
                                >
                                  <div>
                                    <span className="targeting-item-name">{item.name}</span>
                                    <span className="targeting-item-type"> · {item.type}</span>
                                  </div>
                                  {item.audienceSize && (
                                    <span className="targeting-item-size">{formatAudienceSize(item.audienceSize)}</span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {detailedTargeting.length > 0 && (
                        <div className="targeting-selected-tags">
                          {detailedTargeting.map(item => (
                            <span key={item.id} className="tag-item">
                              {item.name}
                              <span className="tag-remove" onClick={() => removeTargetingItem(item.id)}>×</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Custom Audiences */}
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Custom Audiences
                        {!isLoadingAudiences && (
                          <button
                            type="button"
                            onClick={() => { setAudiencesLoaded(false); loadAvailableAudiences(); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', padding: 0 }}
                            title="Refresh audiences from Meta"
                          >
                            ↻ Refresh
                          </button>
                        )}
                      </label>
                      {audiencesError && (
                        <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>
                          API error: {audiencesError}
                        </div>
                      )}
                      <div className="audience-select-container">
                        <div className="audience-select-row">
                          <select
                            value={selectedAudienceId}
                            onChange={e => setSelectedAudienceId(e.target.value)}
                            disabled={isLoadingAudiences}
                          >
                            <option value="">
                              {isLoadingAudiences ? 'Loading audiences...' : availableAudiences.length === 0 && audiencesLoaded ? 'No audiences found' : '-- Select audience --'}
                            </option>
                            {availableAudiences
                              .filter(a => !customAudiences.some(ca => ca.id === a.id))
                              .map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.name} {a.subtype ? `(${a.subtype})` : ''} {a.approximateCount ? `· ${formatAudienceSize(a.approximateCount)}` : ''}
                                </option>
                              ))}
                          </select>
                          <button
                            className="audience-add-btn"
                            onClick={addCustomAudience}
                            disabled={!selectedAudienceId}
                          >
                            Add
                          </button>
                        </div>
                        {customAudiences.length > 0 && (
                          <div className="targeting-selected-tags">
                            {customAudiences.map(a => (
                              <span key={a.id} className="tag-item">
                                {a.name}
                                <span className="tag-remove" onClick={() => setCustomAudiences(prev => prev.filter(x => x.id !== a.id))}>×</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Excluded Audiences */}
                    <div className="form-group">
                      <label className="form-label">Excluded Audiences</label>
                      <div className="audience-select-container">
                        <div className="audience-select-row">
                          <select
                            value={selectedExcludeAudienceId}
                            onChange={e => setSelectedExcludeAudienceId(e.target.value)}
                            disabled={isLoadingAudiences}
                          >
                            <option value="">
                              {isLoadingAudiences ? 'Loading...' : '-- Select audience to exclude --'}
                            </option>
                            {availableAudiences
                              .filter(a => !excludedAudiences.some(ea => ea.id === a.id))
                              .map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.name} {a.subtype ? `(${a.subtype})` : ''}
                                </option>
                              ))}
                          </select>
                          <button
                            className="audience-add-btn"
                            onClick={addExcludedAudience}
                            disabled={!selectedExcludeAudienceId}
                          >
                            Exclude
                          </button>
                        </div>
                        {excludedAudiences.length > 0 && (
                          <div className="targeting-selected-tags">
                            {excludedAudiences.map(a => (
                              <span key={a.id} className="tag-item">
                                {a.name}
                                <span className="tag-remove" onClick={() => setExcludedAudiences(prev => prev.filter(x => x.id !== a.id))}>×</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PLACEMENTS */}
            {publishMode !== 'existing_adset' && (
              <div className="config-section">
                <button
                  className={`config-section-header ${expandedSections.has('placements') ? 'expanded' : ''}`}
                  onClick={() => toggleSection('placements')}
                >
                  <span className="section-title">Placements</span>
                  <span className="section-arrow">▼</span>
                </button>
                {expandedSections.has('placements') && (
                  <div className="config-section-body">
                    <div className="form-group">
                      <div className="toggle-group">
                        <button
                          className={`toggle-option ${placementAutomatic ? 'active' : ''}`}
                          onClick={() => setPlacementAutomatic(true)}
                        >
                          Advantage+ (Automatic)
                        </button>
                        <button
                          className={`toggle-option ${!placementAutomatic ? 'active' : ''}`}
                          onClick={() => setPlacementAutomatic(false)}
                        >
                          Manual Placements
                        </button>
                      </div>
                      <span className="form-sublabel">
                        {placementAutomatic
                          ? 'Meta optimizes placement across all platforms automatically'
                          : 'Choose specific platforms and positions'}
                      </span>
                    </div>

                    {!placementAutomatic && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Platforms</label>
                          <div className="checkbox-grid">
                            {PUBLISHER_PLATFORM_OPTIONS.map(p => (
                              <label key={p.id} className={`checkbox-item ${publisherPlatforms.includes(p.id) ? 'checked' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={publisherPlatforms.includes(p.id)}
                                  onChange={() => togglePlatform(p.id)}
                                />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        </div>

                        {publisherPlatforms.includes('facebook') && (
                          <div className="form-group">
                            <label className="form-label">Facebook Positions</label>
                            <div className="checkbox-grid">
                              {FACEBOOK_POSITION_OPTIONS.map(p => (
                                <label key={p.id} className={`checkbox-item ${facebookPositions.includes(p.id) ? 'checked' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={facebookPositions.includes(p.id)}
                                    onChange={() => toggleFbPosition(p.id)}
                                  />
                                  {p.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {publisherPlatforms.includes('instagram') && (
                          <div className="form-group">
                            <label className="form-label">Instagram Positions</label>
                            <div className="checkbox-grid">
                              {INSTAGRAM_POSITION_OPTIONS.map(p => (
                                <label key={p.id} className={`checkbox-item ${instagramPositions.includes(p.id) ? 'checked' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={instagramPositions.includes(p.id)}
                                    onChange={() => toggleIgPosition(p.id)}
                                  />
                                  {p.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* AD SETUP */}
            <div className="config-section">
              <button
                className={`config-section-header ${expandedSections.has('ad-setup') ? 'expanded' : ''}`}
                onClick={() => toggleSection('ad-setup')}
              >
                <span className="section-title">Ad Setup</span>
                <span className="section-arrow">▼</span>
              </button>
              {expandedSections.has('ad-setup') && (
                <div className="config-section-body">
                  {publishMode !== 'existing_adset' && publishMode === 'new_adset' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Ad Set Name</label>
                        <input
                          type="text"
                          value={adsetName}
                          onChange={e => setAdsetName(e.target.value)}
                          className="form-input"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Daily Budget ($)</label>
                        <input
                          type="number"
                          value={dailyBudget}
                          onChange={e => setDailyBudget(Number(e.target.value))}
                          className="form-input"
                          min={1}
                        />
                      </div>
                    </>
                  )}
                  {publishMode === 'new_campaign' && (
                    <div className="form-group">
                      <label className="form-label">Ad Set Name</label>
                      <input
                        type="text"
                        value={adsetName}
                        onChange={e => setAdsetName(e.target.value)}
                        className="form-input"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Landing Page URL</label>
                    <input
                      type="url"
                      value={landingPageUrl}
                      onChange={e => setLandingPageUrl(e.target.value)}
                      className="form-input"
                      placeholder="https://example.com/offer"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL Parameters</label>
                    <input
                      type="text"
                      value={urlParameters}
                      onChange={e => setUrlParameters(e.target.value)}
                      className="form-input"
                      placeholder="utm_source=meta&utm_medium=paid&utm_campaign=ci"
                    />
                    <span className="form-hint">Tracking parameters appended to the landing page URL</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">CTA Button</label>
                    <select
                      value={ctaButtonType}
                      onChange={e => setCtaButtonType(e.target.value as CallToActionType)}
                      className="form-input"
                    >
                      {CTA_BUTTON_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            className="primary-btn continue-btn"
            onClick={() => goToStep('review')}
            disabled={!canProceedToReview}
          >
            Review & Publish
          </button>
        </section>
      )}

      {/* STEP 4: REVIEW */}
      {currentStep === 'review' && (
        <section className="publisher-panel">
          <div className="panel-header">
            <button className="back-btn" onClick={() => goToStep('configure')}>← Back</button>
            <h3 className="panel-title">Step 4: Review & Publish</h3>
          </div>

          {publishResult?.success ? (
            <div className="publish-success">
              <div className="success-icon">✅</div>
              <h4>Successfully Published!</h4>
              <p>Your ads have been created in Meta Ads Manager in DRAFT mode.</p>
              <div className="success-details">
                {publishResult.campaignId && (
                  <div className="detail-item">
                    <span className="detail-label">Campaign ID:</span>
                    <span className="detail-value">{publishResult.campaignId}</span>
                  </div>
                )}
                {publishResult.adsetId && (
                  <div className="detail-item">
                    <span className="detail-label">Ad Set ID:</span>
                    <span className="detail-value">{publishResult.adsetId}</span>
                  </div>
                )}
                {publishResult.adIds && (
                  <div className="detail-item">
                    <span className="detail-label">Ads Created:</span>
                    <span className="detail-value">{publishResult.adIds.length} ads</span>
                  </div>
                )}
              </div>
              <div className="success-actions">
                <a
                  href={(() => {
                    const accountId = import.meta.env.VITE_META_AD_ACCOUNT_ID;
                    const numericId = accountId ? accountId.replace('act_', '') : '';
                    let url = 'https://business.facebook.com/adsmanager/manage/campaigns';
                    if (numericId) url += `?act=${numericId}`;
                    if (numericId && publishResult.campaignId) url += `&campaign_id=${publishResult.campaignId}`;
                    return url;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-btn"
                >
                  Open Ads Manager
                </a>
                <button className="secondary-btn" onClick={() => navigate('/creatives')}>
                  Generate More Ads
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="review-summary">
                <h4 className="summary-title">Publish Summary</h4>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Total Ads</span>
                    <span className="summary-value">{selectedMetadata.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Mode</span>
                    <span className="summary-value">
                      {PUBLISH_MODE_OPTIONS.find(m => m.id === publishMode)?.name}
                    </span>
                  </div>
                  {publishMode !== 'new_campaign' && selectedCampaignId && (
                    <div className="summary-item full-width">
                      <span className="summary-label">Campaign</span>
                      <span className="summary-value">
                        {campaigns.find(c => c.id === selectedCampaignId)?.name || selectedCampaignId}
                      </span>
                    </div>
                  )}
                  {publishMode === 'existing_adset' && selectedAdSetId && (
                    <div className="summary-item full-width">
                      <span className="summary-label">Ad Set</span>
                      <span className="summary-value">
                        {adSets.find(a => a.id === selectedAdSetId)?.name || selectedAdSetId}
                      </span>
                    </div>
                  )}
                  {publishMode !== 'existing_adset' && (
                    <>
                      <div className="summary-item">
                        <span className="summary-label">Objective</span>
                        <span className="summary-value">
                          {OBJECTIVE_OPTIONS.find(o => o.id === effectiveCampaignObjective)?.name}
                        </span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">Budget</span>
                        <span className="summary-value">${dailyBudget}/day ({publishMode === 'new_adset' ? 'Ad Set' : budgetMode})</span>
                      </div>
                      {effectiveCampaignObjective === 'OUTCOME_SALES' && (
                        <div className="summary-item">
                          <span className="summary-label">Conversion Event</span>
                          <span className="summary-value">
                            {CONVERSION_EVENT_OPTIONS.find(o => o.id === conversionEvent)?.name}
                          </span>
                        </div>
                      )}
                      <div className="summary-item full-width">
                        <span className="summary-label">Targeting</span>
                        <span className="summary-value">{targetingSummary}</span>
                      </div>
                      {detailedTargeting.length > 0 && (
                        <div className="summary-item full-width">
                          <span className="summary-label">Interests & Behaviors</span>
                          <span className="summary-value">{detailedTargeting.map(t => t.name).join(', ')}</span>
                        </div>
                      )}
                      {customAudiences.length > 0 && (
                        <div className="summary-item full-width">
                          <span className="summary-label">Custom Audiences</span>
                          <span className="summary-value">{customAudiences.map(a => a.name).join(', ')}</span>
                        </div>
                      )}
                      {excludedAudiences.length > 0 && (
                        <div className="summary-item full-width">
                          <span className="summary-label">Excluded Audiences</span>
                          <span className="summary-value">{excludedAudiences.map(a => a.name).join(', ')}</span>
                        </div>
                      )}
                      <div className="summary-item">
                        <span className="summary-label">Placements</span>
                        <span className="summary-value">
                          {placementAutomatic ? 'Advantage+ (Automatic)' : publisherPlatforms.join(', ')}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="summary-item full-width">
                    <span className="summary-label">Landing Page</span>
                    <span className="summary-value url-value">
                      {urlParameters.trim()
                        ? `${landingPageUrl}${landingPageUrl.includes('?') ? '&' : '?'}${urlParameters.trim()}`
                        : landingPageUrl}
                    </span>
                  </div>
                  {urlParameters.trim() && (
                    <div className="summary-item full-width">
                      <span className="summary-label">URL Parameters</span>
                      <span className="summary-value">{urlParameters.trim()}</span>
                    </div>
                  )}
                  <div className="summary-item">
                    <span className="summary-label">CTA Button</span>
                    <span className="summary-value">
                      {CTA_BUTTON_OPTIONS.find(o => o.id === ctaButtonType)?.name || ctaButtonType}
                    </span>
                  </div>
                </div>
                <div className="draft-reminder">
                  <span className="reminder-icon">🔒</span>
                  <span className="reminder-text">
                    All ads will be created in <strong>PAUSED</strong> status.
                  </span>
                </div>
              </div>

              <div className="preview-section">
                <h4 className="preview-title">Ads to Publish ({selectedMetadata.length})</h4>
                <div className="ads-list-text">
                  {selectedMetadata.slice(0, 20).map(item => (
                    <div key={item.id} className="ad-list-item preview">
                      <div className="ad-list-content">
                        <div className="ad-list-headline">{item.headline}</div>
                        <div className="ad-list-meta">{item.cta}</div>
                      </div>
                    </div>
                  ))}
                  {selectedMetadata.length > 20 && (
                    <div className="ad-list-item preview">
                      <div className="ad-list-content">
                        <div className="ad-list-meta">
                          ... and {selectedMetadata.length - 20} more ads
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                className="publish-btn"
                onClick={handlePublish}
                disabled={isPublishing}
              >
                {isPublishing ? (
                  <>
                    <span className="spinner" />
                    Publishing to Meta...
                  </>
                ) : (
                  <>
                    <span className="publish-icon">🚀</span>
                    Publish to Meta (Draft Mode)
                  </>
                )}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default AdPublisher;
