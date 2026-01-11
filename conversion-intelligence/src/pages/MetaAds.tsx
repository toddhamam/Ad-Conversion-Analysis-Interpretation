import { useState } from 'react';
import { trafficTypes, creatives } from '../data/mockData';
import Badge from '../components/Badge';
import './MetaAds.css';

const MetaAds = () => {
  // Meta Ads page with logo
  const [selectedTraffic, setSelectedTraffic] = useState('all');

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
        <p className="page-subtitle">Explore converting creatives across traffic types</p>
      </div>

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
