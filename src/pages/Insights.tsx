import { useState, useEffect, useCallback } from 'react';
import { fetchAdCreatives, type AdCreative } from '../services/metaApi';
import {
  analyzeChannelPerformance,
  isOpenAIConfigured,
  IQ_LEVELS,
  type AdCreativeData,
  type ChannelAnalysisResult,
  type ReasoningEffort,
} from '../services/openaiApi';
import ChannelInsightsPanel from '../components/ChannelInsightsPanel';
import IQSelector from '../components/IQSelector';
import {
  Smartphone,
  Search,
  Music,
  Mail,
  ScanSearch,
  AlertTriangle,
  BarChart3,
  Construction
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './Insights.css';

type Channel = 'meta' | 'google' | 'tiktok' | 'email';

interface ChannelConfig {
  id: Channel;
  name: string;
  Icon: LucideIcon;
  available: boolean;
}

const CHANNELS: ChannelConfig[] = [
  { id: 'meta', name: 'Meta', Icon: Smartphone, available: true },
  { id: 'google', name: 'Google Ads', Icon: Search, available: false },
  { id: 'tiktok', name: 'TikTok', Icon: Music, available: false },
  { id: 'email', name: 'Email', Icon: Mail, available: false },
];

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

// Local storage key for caching analysis
const CACHE_KEY = 'channel_analysis_cache';

function getCachedAnalysis(channel: Channel): ChannelAnalysisResult | null {
  try {
    const cache = localStorage.getItem(CACHE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      return parsed[channel] || null;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

function setCachedAnalysis(channel: Channel, analysis: ChannelAnalysisResult): void {
  try {
    const cache = localStorage.getItem(CACHE_KEY);
    const parsed = cache ? JSON.parse(cache) : {};
    parsed[channel] = analysis;
    localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore cache errors
  }
}

const Insights = () => {
  const [selectedChannel, setSelectedChannel] = useState<Channel>('meta');
  const [analysis, setAnalysis] = useState<ChannelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adsCount, setAdsCount] = useState(0);
  const [iqLevel, setIqLevel] = useState<ReasoningEffort>('medium');

  // Load cached analysis when channel changes
  useEffect(() => {
    const cached = getCachedAnalysis(selectedChannel);
    if (cached) {
      setAnalysis(cached);
    } else {
      setAnalysis(null);
    }
    setError(null);
  }, [selectedChannel]);

  const runAnalysis = useCallback(async () => {
    const channelConfig = CHANNELS.find(c => c.id === selectedChannel);
    if (!channelConfig?.available) {
      setError(`${channelConfig?.name || 'This channel'} integration coming soon!`);
      return;
    }

    if (!isOpenAIConfigured()) {
      setError('OpenAI API key not configured. Please add your API key to run analysis.');
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingMessage('Fetching ad data...');

    try {
      // Fetch ads for the channel
      let ads: AdCreativeData[] = [];

      if (selectedChannel === 'meta') {
        setLoadingMessage('Fetching Meta ads...');
        const creatives = await fetchAdCreatives({ datePreset: 'last_30d' });
        ads = creatives.map(convertToAdCreativeData);
        setAdsCount(ads.length);
      }

      if (ads.length === 0) {
        setError('No ads found for analysis. Make sure you have active ads in your account.');
        setLoading(false);
        return;
      }

      setLoadingMessage(`ConversionIQ™ analyzing ${ads.length} ads with ${IQ_LEVELS[iqLevel].name}...`);

      // Run the analysis with selected reasoning effort
      const result = await analyzeChannelPerformance(ads, channelConfig.name, { reasoningEffort: iqLevel });

      // Cache the result
      setCachedAnalysis(selectedChannel, result);

      setAnalysis(result);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [selectedChannel, iqLevel]);

  const selectedChannelConfig = CHANNELS.find(c => c.id === selectedChannel);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">Channel-wide analysis and strategic recommendations</p>
        </div>
      </div>

      {/* Channel Tabs */}
      <div className="channel-tabs">
        {CHANNELS.map(channel => (
          <button
            key={channel.id}
            className={`channel-tab ${selectedChannel === channel.id ? 'active' : ''} ${!channel.available ? 'disabled' : ''}`}
            onClick={() => channel.available && setSelectedChannel(channel.id)}
          >
            <span className="channel-icon"><channel.Icon size={18} strokeWidth={1.5} /></span>
            <span className="channel-name">{channel.name}</span>
            {!channel.available && <span className="coming-soon-badge">Coming Soon</span>}
          </button>
        ))}
      </div>

      {/* ConversionIQ Level Selector */}
      <IQSelector
        value={iqLevel}
        onChange={setIqLevel}
        disabled={loading}
        compact={true}
      />

      {/* Analysis Controls */}
      <div className="analysis-controls">
        <button
          className="run-analysis-btn"
          onClick={runAnalysis}
          disabled={loading || !selectedChannelConfig?.available}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              {loadingMessage}
            </>
          ) : (
            <>
              <span className="btn-icon"><ScanSearch size={18} strokeWidth={1.5} /></span>
              Run Channel Analysis
            </>
          )}
        </button>

        {analysis && (
          <span className="last-analyzed">
            Last analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="insights-error">
          <span className="error-icon"><AlertTriangle size={18} strokeWidth={1.5} /></span>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="insights-loading">
          <div className="loading-spinner-large"></div>
          <h3>Analyzing {selectedChannelConfig?.name} Ads</h3>
          <p>{loadingMessage}</p>
          {adsCount > 0 && <p className="ads-count">Processing {adsCount} ads...</p>}
        </div>
      )}

      {/* Empty State - No analysis yet */}
      {!loading && !analysis && !error && selectedChannelConfig?.available && (
        <div className="insights-empty">
          <div className="empty-icon"><BarChart3 size={48} strokeWidth={1} /></div>
          <h3>No Analysis Yet</h3>
          <p>Click "Run Channel Analysis" to generate AI-powered insights for your {selectedChannelConfig.name} advertising account.</p>
          <p className="empty-note">This will analyze all your ads and identify patterns, winning elements, and strategic recommendations.</p>
        </div>
      )}

      {/* Coming Soon State */}
      {!selectedChannelConfig?.available && (
        <div className="insights-empty coming-soon">
          <div className="empty-icon"><Construction size={48} strokeWidth={1} /></div>
          <h3>{selectedChannelConfig?.name} Integration Coming Soon</h3>
          <p>We're working on integrating {selectedChannelConfig?.name} data. In the meantime, try analyzing your Meta ads!</p>
        </div>
      )}

      {/* Analysis Results */}
      {!loading && analysis && (
        <ChannelInsightsPanel analysis={analysis} />
      )}
    </div>
  );
};

export default Insights;
