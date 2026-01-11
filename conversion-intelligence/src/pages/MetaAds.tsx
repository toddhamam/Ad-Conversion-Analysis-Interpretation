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

  async function loadMetaData() {
    console.log('🚀 Starting Meta data load...');

    try {
      setLoading(true);
      setError(null);

      // Test connection first
      const { testMetaConnection } = await import('../services/metaApi');
      const connectionTest = await testMetaConnection();

      console.log('Connection test result:', connectionTest);

      if (!connectionTest.success) {
        throw new Error(`API Connection Failed: ${connectionTest.message}`);
      }

      // Fetch real data from Meta API
      console.log('Fetching creatives and traffic data...');
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
        {creatives.map((creative) => (
          <div key={creative.id} className="creative-card">
            <div className="creative-badges">
              <Badge variant={creative.status.toLowerCase() as 'winning' | 'testing' | 'fatigued'}>
                {creative.status}
              </Badge>
              <Badge variant={creative.confidence.toLowerCase() as 'high' | 'medium' | 'low'}>
                {creative.confidence}
              </Badge>
            </div>

            <div className="creative-image-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>

            <div className="creative-content">
              <h3 className="creative-headline">{creative.headline}</h3>
              <p className="creative-body">{creative.bodySnippet}</p>
            </div>

            <div className="creative-footer">
              <div className="creative-conversions">
                <strong>{creative.conversions.toLocaleString()}</strong> conversions
              </div>
              <div className="creative-concept">{creative.concept}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MetaAds;
