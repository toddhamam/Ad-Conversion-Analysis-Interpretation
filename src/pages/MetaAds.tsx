import { useState, useEffect, useCallback } from 'react';
import { creatives as mockCreatives } from '../data/mockData';
import {
  fetchAdCreatives,
  fetchCampaignSummaries,
  aggregateByType,
  type AdCreative,
  type DatePreset,
  type DateRangeOptions,
  type CampaignTypeMetrics
} from '../services/metaApi';
import { type AdCreativeData } from '../services/openaiApi';
import Badge from '../components/Badge';
import DateRangePicker from '../components/DateRangePicker';
import CampaignTypeDashboard from '../components/CampaignTypeDashboard';
import AdAnalysisPanel from '../components/AdAnalysisPanel';
import {
  captureImage,
  getCacheStats,
  getCachedImage,
  getAllCachedImages,
  getTopHighQualityCachedImages,
  storeImageFromUrl,
  clearLegacyCache
} from '../services/imageCache';
import './MetaAds.css';

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
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignTypeMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const [analyzingAd, setAnalyzingAd] = useState<AdCreativeData | null>(null);

  // Reference image tracking
  const [cachedImageIds, setCachedImageIds] = useState<Set<string>>(new Set());
  const [fetchingImageId, setFetchingImageId] = useState<string | null>(null);
  const [autoFetchingRefs, setAutoFetchingRefs] = useState(false);

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
        creative.conversionRate
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

  // Auto-fetch top performing ad images until we have 3 HIGH-QUALITY references
  // This ensures we always have enough quality references for ad generation
  const autoFetchTopImages = useCallback(async (creativesData: AdCreative[]) => {
    if (autoFetchingRefs) return;

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

    setAutoFetchingRefs(true);
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
        MIN_QUALITY_SCORE // Pass the minimum quality threshold
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
    setAutoFetchingRefs(false);
  }, [autoFetchingRefs, refreshCachedIds]);

  // Date range state - default to last 30 days
  const defaultPreset: DatePreset = 'last_30d';
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

  // Sort creatives by conversion rate (best performers first)
  const sortedCreatives = [...creatives].sort((a, b) => b.conversionRate - a.conversionRate);

  const loadMetaData = useCallback(async (dateOptions?: DateRangeOptions) => {
    console.log('🚀 Starting Meta data load...', dateOptions);

    try {
      setLoading(true);
      setError(null);

      // Fetch real data from Meta API directly (no connection test - let it fail gracefully)
      console.log('Fetching creatives and campaign summary data from Meta API...');
      const [creativesData, campaignSummaries] = await Promise.all([
        fetchAdCreatives(dateOptions),
        fetchCampaignSummaries(dateOptions)
      ]);

      console.log('✅ Creatives loaded:', creativesData.length);
      console.log('✅ Campaign summaries loaded:', campaignSummaries.length);

      // Aggregate campaign data by type
      const aggregatedMetrics = aggregateByType(campaignSummaries);
      console.log('✅ Aggregated metrics by type:', aggregatedMetrics);

      setCreatives(creativesData);
      setCampaignMetrics(aggregatedMetrics);
      setUsingMockData(false);

      // Auto-fetch top performing images as references
      autoFetchTopImages(creativesData);
    } catch (err: any) {
      console.error('❌ Failed to load Meta data:', err);
      console.error('❌ Full error object:', err);
      setError(`Could not load Meta data: ${err.message}. Displaying sample data.`);

      // Fallback to mock data
      setCreatives(mockCreatives as any);
      setCampaignMetrics([]);
      setUsingMockData(true);
    } finally {
      setLoading(false);
    }
  }, [autoFetchTopImages]);

  // Initialize cache IDs on mount
  useEffect(() => {
    refreshCachedIds();
  }, [refreshCachedIds]);

  // Load data on mount and when date range changes
  useEffect(() => {
    const dateOptions: DateRangeOptions = dateRange.preset
      ? { datePreset: dateRange.preset }
      : {
          timeRange: {
            since: formatDateForApi(dateRange.startDate),
            until: formatDateForApi(dateRange.endDate),
          },
        };
    loadMetaData(dateOptions);
  }, [dateRange, loadMetaData]);

  const handleDateRangeChange = (newDateRange: { preset?: DatePreset; startDate: Date; endDate: Date }) => {
    setDateRange(newDateRange);
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Meta-Logo.png"
              alt="Meta"
              className="meta-logo"
            />
            Meta Ads
          </h1>
          <p className="page-subtitle">Loading your Meta ad data...</p>
        </div>
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
          <div className="loading-spinner">⏳ Connecting to Meta API...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Meta-Logo.png"
              alt="Meta"
              className="meta-logo"
            />
            Meta Ads
          </h1>
          <p className="page-subtitle">
            {usingMockData ? '⚠️ Sample data (Meta API unavailable)' : '✓ Live data from your Meta account'}
          </p>
        </div>
        <div className="page-header-right">
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
          />
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

      {/* Campaign Type Dashboard */}
      {!usingMockData && campaignMetrics.length > 0 && (
        <CampaignTypeDashboard metrics={campaignMetrics} loading={loading} />
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
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Conversion Rate</div>
                  <div style={{
                    fontSize: '20px',
                    fontWeight: '700',
                    color: creative.conversionRate > 5 ? '#10b981' : creative.conversionRate > 2 ? '#f59e0b' : '#ef4444'
                  }}>
                    {creative.conversionRate}%
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Cost/Conv</div>
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
            {creative.imageUrl ? (
              <div style={{
                width: '100%',
                aspectRatio: '1 / 1',  // Square format for 1080x1080 images
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
                    objectFit: 'cover',  // Crop to fit if needed
                    display: 'block'
                  }}
                  onError={(e) => {
                    console.error(`❌ Image failed to load for ad ${creative.id}:`, creative.imageUrl);
                    // Show placeholder instead of hiding
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML = `
                        <div style="
                          width: 100%;
                          height: 100%;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          background: var(--surface-secondary);
                          border-radius: 8px;
                        ">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        </div>
                      `;
                    }
                  }}
                  onLoad={(e) => {
                    console.log(`✅ Image loaded successfully for ad ${creative.id}`);
                    // Capture the image for use in ad generation
                    const imgElement = e.currentTarget as HTMLImageElement;
                    const captured = captureImage(imgElement, creative.id, creative.conversionRate);
                    if (captured) {
                      const stats = getCacheStats();
                      console.log(`📸 Image cache now has ${stats.count} images (top: ${stats.topConversionRate.toFixed(1)}% conv rate)`);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="creative-image-placeholder" style={{
                aspectRatio: '1 / 1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-secondary)',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
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
    </div>
  );
};

export default MetaAds;
