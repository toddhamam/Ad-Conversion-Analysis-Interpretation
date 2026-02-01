import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  publishAds,
  fetchCampaignsForPublish,
  fetchAdSetsForPublish,
  type PublishConfig,
  type PublishResult,
  type CampaignForPublish,
  type AdSetForPublish,
  type CallToActionType,
  type CampaignObjective,
} from '../services/metaApi';
import './AdPublisher.css';

// Debug flag - set to true to enable verbose logging
const DEBUG_MODE = true;
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) console.log('[AdPublisher]', ...args);
};

// TEMPORARY: Set to true to skip localStorage loading for debugging
const SKIP_LOCALSTORAGE = false;

// Storage key for generated ads (shared with AdGenerator)
const GENERATED_ADS_STORAGE_KEY = 'conversion_intelligence_generated_ads';

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

// CTA mapping
const CTA_TEXT_TO_TYPE: Record<string, CallToActionType> = {
  'Learn More': 'LEARN_MORE',
  'Shop Now': 'SHOP_NOW',
  'Sign Up': 'SIGN_UP',
  'Subscribe': 'SUBSCRIBE',
  'Get Offer': 'GET_OFFER',
  'Book Now': 'BOOK_NOW',
  'Contact Us': 'CONTACT_US',
  'Download': 'DOWNLOAD',
  'Apply Now': 'APPLY_NOW',
  'Buy Now': 'BUY_NOW',
};

// Campaign objective options
const OBJECTIVE_OPTIONS: { id: CampaignObjective; name: string }[] = [
  { id: 'OUTCOME_TRAFFIC', name: 'Traffic (Recommended)' },
  { id: 'OUTCOME_AWARENESS', name: 'Awareness' },
  { id: 'OUTCOME_ENGAGEMENT', name: 'Engagement' },
  { id: 'OUTCOME_LEADS', name: 'Leads' },
  { id: 'OUTCOME_SALES', name: 'Sales' },
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

function mapCTAToType(ctaText: string): CallToActionType {
  if (!ctaText) return 'LEARN_MORE';
  if (CTA_TEXT_TO_TYPE[ctaText]) return CTA_TEXT_TO_TYPE[ctaText];
  const normalized = ctaText.toLowerCase();
  for (const [text, type] of Object.entries(CTA_TEXT_TO_TYPE)) {
    if (normalized.includes(text.toLowerCase())) return type;
  }
  return 'LEARN_MORE';
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

// ASYNC metadata extraction - non-blocking to prevent Chrome crashes
async function extractMetadataAsync(): Promise<AdMetadata[]> {
  return new Promise((resolve) => {
    // Use requestIdleCallback for browser cooperation, with setTimeout fallback
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
          console.log('[AdPublisher] No stored ads found');
          resolve([]);
          return;
        }

        const sizeInMB = (stored.length / (1024 * 1024)).toFixed(2);
        console.log(`[AdPublisher] localStorage data size: ${sizeInMB}MB`);

        // For very large data, warn and parse carefully
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
          console.log('[AdPublisher] Data is not an array');
          resolve([]);
          return;
        }

        console.log('[AdPublisher] Found', packages.length, 'packages');

        const items: AdMetadata[] = [];

        for (let pkgIndex = 0; pkgIndex < packages.length; pkgIndex++) {
          const pkg = packages[pkgIndex];
          if (!pkg) continue;

          const images = pkg.images || [];

          // Skip packages with no images
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

        console.log('[AdPublisher] Extracted', items.length, 'ad metadata items');
        resolve(items);
      } catch (err) {
        console.error('[AdPublisher] Error extracting metadata:', err);
        resolve([]);
      }
    });
  });
}

// Load full image data ONLY when publishing (not during selection)
// Returns a promise to handle large data more gracefully
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
        console.error('[AdPublisher] Failed to parse stored data for publish');
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

// Maximum number of ads to show in the selection list at once
const MAX_VISIBLE_ADS = 20;  // Reduced to prevent rendering issues
const MAX_TOTAL_ADS = 50;    // Maximum ads to load from storage

type PublishStep = 'select' | 'destination' | 'configure' | 'review';

const AdPublisher = () => {
  const navigate = useNavigate();

  // Render tracking for debugging
  const renderCountRef = useRef(0);
  const mountedRef = useRef(false);
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9));

  renderCountRef.current += 1;
  debugLog(`Render #${renderCountRef.current} (instance: ${instanceIdRef.current})`);

  // State
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
  const [campaignName, setCampaignName] = useState('');
  const [adsetName, setAdsetName] = useState('');
  const [dailyBudget, setDailyBudget] = useState(50);
  const [landingPageUrl, setLandingPageUrl] = useState('https://example.com/offer');
  const [campaignObjective, setCampaignObjective] = useState<CampaignObjective>('OUTCOME_TRAFFIC');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleAdsCount, setVisibleAdsCount] = useState(MAX_VISIBLE_ADS);

  // Load metadata on mount - async version to prevent blocking
  useEffect(() => {
    // Prevent double-mounting issues in StrictMode
    if (mountedRef.current) {
      debugLog('Skipping duplicate mount effect (StrictMode)');
      return;
    }
    mountedRef.current = true;

    debugLog(`Component mounted (instance: ${instanceIdRef.current})`);
    let isCancelled = false;

    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    setCampaignName(`CI Campaign - ${dateStr}`);
    setAdsetName(`CI Ad Set - ${dateStr}`);

    // Load metadata asynchronously to prevent blocking the main thread
    const loadMetadata = async () => {
      debugLog('Loading metadata asynchronously...');

      // TEMPORARY: Skip localStorage for debugging render issues
      if (SKIP_LOCALSTORAGE) {
        debugLog('SKIP_LOCALSTORAGE is enabled - not loading any ads');
        if (!isCancelled) {
          setAdMetadata([]);
          setIsLoading(false);
        }
        return;
      }

      try {
        const metadata = await extractMetadataAsync();
        if (!isCancelled) {
          // Strictly limit metadata to prevent overwhelming renders
          const limitedMetadata = metadata.slice(0, MAX_TOTAL_ADS);
          debugLog(`Loaded ${metadata.length} total ads, limiting to ${limitedMetadata.length}`);
          setAdMetadata(limitedMetadata);
        }
      } catch (err) {
        console.error('[AdPublisher] Load error:', err);
      }
      if (!isCancelled) {
        setIsLoading(false);
      }
    };

    // Small delay to let the initial render complete
    const timeoutId = setTimeout(loadMetadata, 100);

    return () => {
      debugLog(`Component unmounting (instance: ${instanceIdRef.current})`);
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // Selection handlers - optimized to prevent excessive re-renders
  const toggleSelection = useCallback((id: string) => {
    // Prevent rapid double-clicks from causing issues
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
  };

  const handleCampaignSelect = (id: string) => {
    setSelectedCampaignId(id);
    setSelectedAdSetId('');
    if (publishMode === 'existing_adset' && id) {
      loadAdSets(id);
    }
  };

  const goToStep = (step: PublishStep) => {
    if (step === 'destination' && publishMode !== 'new_campaign') {
      loadCampaigns();
    }
    setCurrentStep(step);
  };

  // Validation
  const canProceedToDestination = selectedIds.size > 0;
  const canProceedToConfigure = publishMode === 'new_campaign' ||
    (publishMode === 'new_adset' && !!selectedCampaignId) ||
    (publishMode === 'existing_adset' && !!selectedCampaignId && !!selectedAdSetId);
  const canProceedToReview = !!landingPageUrl &&
    (publishMode === 'existing_adset' || (!!campaignName && !!adsetName && dailyBudget > 0));

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

      const config: PublishConfig = {
        mode: publishMode,
        ads: adsWithImages.map(ad => ({
          imageBase64: ad.imageUrl,
          headline: ad.headline,
          bodyText: ad.bodyText,
          callToAction: mapCTAToType(ad.cta),
        })),
        settings: {
          campaignName: publishMode === 'new_campaign' ? campaignName : undefined,
          campaignObjective: publishMode === 'new_campaign' ? campaignObjective : undefined,
          adsetName: publishMode !== 'existing_adset' ? adsetName : undefined,
          dailyBudget: publishMode !== 'existing_adset' ? dailyBudget : undefined,
          landingPageUrl,
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

  // Loading state with better messaging
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

  // Main render - simplified structure with unique key for debugging
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
        <div className={`publisher-step ${currentStep === 'select' ? 'active' : ''}`}>
          <span className="publisher-step-num">1</span>
          <span className="publisher-step-label">Select</span>
        </div>
        <div className="publisher-step-connector" />
        <div className={`publisher-step ${currentStep === 'destination' ? 'active' : ''}`}>
          <span className="publisher-step-num">2</span>
          <span className="publisher-step-label">Destination</span>
        </div>
        <div className="publisher-step-connector" />
        <div className={`publisher-step ${currentStep === 'configure' ? 'active' : ''}`}>
          <span className="publisher-step-num">3</span>
          <span className="publisher-step-label">Configure</span>
        </div>
        <div className="publisher-step-connector" />
        <div className={`publisher-step ${currentStep === 'review' ? 'active' : ''}`}>
          <span className="publisher-step-num">4</span>
          <span className="publisher-step-label">Publish</span>
        </div>
      </div>

      {error && (
        <div className="publisher-error">
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
                        // Ignore if clicking on the checkbox itself (checkbox handles its own click)
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
                      <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
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
                        <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
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

          <div className="config-form">
            {publishMode === 'new_campaign' && (
              <>
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
              </>
            )}

            {publishMode !== 'existing_adset' && (
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

            <div className="form-group">
              <label className="form-label">Landing Page URL</label>
              <input
                type="url"
                value={landingPageUrl}
                onChange={e => setLandingPageUrl(e.target.value)}
                className="form-input"
              />
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
                  href="https://business.facebook.com/adsmanager"
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
                  {publishMode !== 'existing_adset' && (
                    <div className="summary-item">
                      <span className="summary-label">Daily Budget</span>
                      <span className="summary-value">${dailyBudget}</span>
                    </div>
                  )}
                  <div className="summary-item full-width">
                    <span className="summary-label">Landing Page</span>
                    <span className="summary-value url-value">{landingPageUrl}</span>
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
