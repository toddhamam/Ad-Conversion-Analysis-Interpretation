import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  isOpenAIConfigured,
  isGeminiConfigured,
  generateAdPackage,
  generateCopyOptions,
  CONCEPT_ANGLES,
  type AdType,
  type AudienceType,
  type ConceptType,
  type ChannelAnalysisResult,
  type GeneratedAdPackage,
  type CopyOption,
} from '../services/openaiApi';
import { getCacheStats as getImageCacheStats, uploadBrandImages, clearImageCache } from '../services/imageCache';
import GeneratedAdCard from '../components/GeneratedAdCard';
import CopySelectionPanel from '../components/CopySelectionPanel';
import './AdGenerator.css';

const CACHE_KEY = 'channel_analysis_cache';
const GENERATED_ADS_STORAGE_KEY = 'conversion_intelligence_generated_ads';

// Pagination settings
const ADS_PER_PAGE = 3;
const MAX_STORED_ADS = 20; // Limit stored ads to prevent storage overflow

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

const AdGenerator = () => {
  const navigate = useNavigate();

  // Core configuration
  const [adType, setAdType] = useState<AdType>('image');
  const [audienceType, setAudienceType] = useState<AudienceType>('prospecting');
  const [conceptType, setConceptType] = useState<ConceptType>('auto');
  const [variationCount, setVariationCount] = useState(2);
  const [analysisData, setAnalysisData] = useState<ChannelAnalysisResult | null>(null);

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

  // Load cached analysis and check image cache on mount
  useEffect(() => {
    const cached = getCachedAnalysis();
    setAnalysisData(cached);

    // Check image cache status
    const imageStats = getImageCacheStats();
    setImageCacheCount(imageStats.count);
    console.log(`📸 Image cache: ${imageStats.count} reference images available`);

    // Load previously generated ads from localStorage - DEFERRED to prevent blocking
    const loadAds = () => {
      try {
        const storedAds = localStorage.getItem(GENERATED_ADS_STORAGE_KEY);
        if (storedAds) {
          // Check storage size for warning
          const sizeInMB = (storedAds.length / (1024 * 1024)).toFixed(1);
          console.log(`📦 localStorage size: ${sizeInMB}MB`);

          if (storedAds.length > 4 * 1024 * 1024) { // > 4MB
            setStorageWarning(`Storage is ${sizeInMB}MB. Consider deleting old ads to improve performance.`);
          }

          const parsed = JSON.parse(storedAds);
          // Limit to MAX_STORED_ADS
          const limited = parsed.slice(0, MAX_STORED_ADS);
          setGeneratedAds(limited);
          console.log(`📦 Loaded ${limited.length} previously generated ads`);
        }
      } catch (e) {
        console.warn('Failed to load stored generated ads:', e);
        setStorageWarning('Failed to load saved ads. Storage may be corrupted.');
      } finally {
        setIsLoadingAds(false);
      }
    };

    // Use setTimeout to defer the heavy localStorage parsing
    const timeoutId = setTimeout(loadAds, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  // Save generated ads to localStorage whenever they change
  useEffect(() => {
    if (generatedAds.length > 0 && !isLoadingAds) {
      try {
        // Limit to MAX_STORED_ADS before saving
        const toSave = generatedAds.slice(0, MAX_STORED_ADS);
        const json = JSON.stringify(toSave);

        // Check size before saving
        const sizeInMB = (json.length / (1024 * 1024)).toFixed(1);
        console.log(`💾 Saving ${toSave.length} ads (${sizeInMB}MB)`);

        if (json.length > 4.5 * 1024 * 1024) { // > 4.5MB - approaching 5MB limit
          setStorageWarning(`Storage is ${sizeInMB}MB. Delete old ads to prevent issues.`);
        }

        localStorage.setItem(GENERATED_ADS_STORAGE_KEY, json);
        console.log(`💾 Saved ${toSave.length} generated ads to storage`);
      } catch (e: any) {
        console.warn('Failed to save generated ads:', e);
        if (e.name === 'QuotaExceededError') {
          setStorageWarning('Storage full! Please delete some ads to continue saving.');
        }
      }
    }
  }, [generatedAds, isLoadingAds]);

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

  // Toggle handlers for selections
  const handleHeadlineToggle = (id: string) => {
    setSelectedHeadlines(prev =>
      prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]
    );
  };

  const handleBodyTextToggle = (id: string) => {
    setSelectedBodyTexts(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const handleCTAToggle = (id: string) => {
    setSelectedCTAs(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Generate copy options
  const handleGenerateCopyOptions = async () => {
    const hasTextApi = isOpenAIConfigured();
    if (!hasTextApi) {
      setError('OpenAI API key required for copy generation. Please add VITE_OPENAI_API_KEY to your .env file.');
      return;
    }

    setIsGeneratingCopy(true);
    setError(null);
    setGenerationProgress('Generating headline and body copy options...');

    try {
      const result = await generateCopyOptions({
        audienceType,
        conceptType,
        analysisData,
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

    if (!hasTextApi) {
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
    setGenerationProgress(adType === 'image' ? 'Generating images and finalizing copy...' : 'Creating video storyboard...');

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

  const handleBackToCopySelection = () => {
    setCurrentStep('copy-selection');
  };

  const costEstimate = calculateCost(adType, variationCount, currentStep === 'config');
  const hasAnalysisData = !!analysisData;
  const isGenerating = isGeneratingCopy || isGeneratingCreatives;

  // Validation for proceeding
  const canProceedToCopySelection = audienceType && conceptType;
  const canProceedToFinalConfig = selectedHeadlines.length >= 1 && selectedBodyTexts.length >= 1 && selectedCTAs.length >= 1;
  const canGenerateCreatives = selectedHeadlines.length >= 1 && selectedBodyTexts.length >= 1 && selectedCTAs.length >= 1;

  return (
    <div className="page ad-generator-page">
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
          <span className="step-label">Audience & Concept</span>
        </div>
        <div className="step-connector"></div>
        <div className={`step ${currentStep === 'copy-selection' ? 'active' : currentStep === 'final-config' ? 'completed' : ''}`}>
          <span className="step-number">2</span>
          <span className="step-label">Select Copy</span>
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
          <h3 className="config-title">Step 1: Audience & Concept</h3>

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

          {/* Concept Selection */}
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

          {/* Generate Copy Options Button */}
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
            <span className="summary-item">
              <span className="summary-label">Audience:</span> {AUDIENCE_OPTIONS.find(a => a.id === audienceType)?.name}
            </span>
            <span className="summary-divider">|</span>
            <span className="summary-item">
              <span className="summary-label">Concept:</span> {CONCEPT_ANGLES[conceptType].name}
            </span>
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
            minCTAs={1}
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
            <button className="back-btn" onClick={handleBackToCopySelection}>
              ← Back
            </button>
            <h3 className="config-title">Step 3: Generate Creatives</h3>
          </div>

          {/* Summary of selections */}
          <div className="final-summary">
            <h4 className="summary-title">Your Selections</h4>
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-card-label">Audience</span>
                <span className="summary-card-value">{AUDIENCE_OPTIONS.find(a => a.id === audienceType)?.name}</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">Concept</span>
                <span className="summary-card-value">{CONCEPT_ANGLES[conceptType].name}</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">Headlines</span>
                <span className="summary-card-value">{selectedHeadlines.length} selected</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">Body Copy</span>
                <span className="summary-card-value">{selectedBodyTexts.length} selected</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-label">CTAs</span>
                <span className="summary-card-value">{selectedCTAs.length} selected</span>
              </div>
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
                onClick={() => navigate('/publish')}
              >
                <span className="publish-icon">🚀</span>
                Publish to Meta
              </button>
            </div>
          </div>
          <div className="generated-ads-list">
            {generatedAds.slice(0, visibleAdsCount).map(ad => (
              <GeneratedAdCard key={ad.id} ad={ad} />
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
