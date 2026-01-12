import { useState, useEffect } from 'react';
import { trafficTypes as mockTrafficTypes, creatives as mockCreatives } from '../data/mockData';
import { fetchAdCreatives, fetchTrafficTypes, type AdCreative, type TrafficType } from '../services/metaApi';
import Badge from '../components/Badge';
import './MetaAds.css';

const MetaAds = () => {
  // Meta Ads page with logo
  const [selectedTraffic, setSelectedTraffic] = useState('all');
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [trafficTypes, setTrafficTypes] = useState<TrafficType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  useEffect(() => {
    loadMetaData();
  }, []);

  // Sort creatives by conversion rate (best performers first)
  const sortedCreatives = [...creatives].sort((a, b) => b.conversionRate - a.conversionRate);

  async function loadMetaData() {
    console.log('🚀 Starting Meta data load...');

    try {
      setLoading(true);
      setError(null);

      // Fetch real data from Meta API directly (no connection test - let it fail gracefully)
      console.log('Fetching creatives and traffic data from Meta API...');
      const [creativesData, trafficData] = await Promise.all([
        fetchAdCreatives(),
        fetchTrafficTypes()
      ]);

      console.log('✅ Creatives loaded:', creativesData.length);
      console.log('✅ Traffic types loaded:', trafficData.length);

      setCreatives(creativesData);
      setTrafficTypes(trafficData);
      setUsingMockData(false);
    } catch (err: any) {
      console.error('❌ Failed to load Meta data:', err);
      console.error('❌ Full error object:', err);
      setError(`Could not load Meta data: ${err.message}. Displaying sample data.`);

      // Fallback to mock data
      setCreatives(mockCreatives as any);
      setTrafficTypes(mockTrafficTypes as any);
      setUsingMockData(true);
    } finally {
      setLoading(false);
    }
  }

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

      <div className="traffic-filters">
        {trafficTypes.map((traffic) => (
          <button
            key={traffic.id}
            className={`traffic-filter ${selectedTraffic === traffic.id ? 'active' : ''}`}
            onClick={() => setSelectedTraffic(traffic.id)}
          >
            <span className="traffic-name">{traffic.name}</span>
            {traffic.id !== 'all' && (
              <span className="traffic-stats">
                {traffic.conversions} conv • ${traffic.spend.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

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
                    // Fallback if image fails to load
                    e.currentTarget.style.display = 'none';
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default MetaAds;
