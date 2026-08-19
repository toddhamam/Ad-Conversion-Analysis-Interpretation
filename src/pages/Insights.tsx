import { useState, useEffect, useCallback } from 'react';
import { fetchAdCreatives, type AdCreative } from '../services/metaApi';
import {
  analyzeChannelPerformance,
  isOpenAIConfigured,
  type AdCreativeData,
  type ChannelAnalysisResult,
} from '../services/openaiApi';
import { aggregateByAxis } from '../services/axisAnalytics';
import { parseAxisTag } from '../lib/axisTags';
import ChannelInsightsPanel from '../components/ChannelInsightsPanel';
import SEO from '../components/SEO';
import {
  Smartphone,
  Search,
  Music,
  Mail,
  ScanSearch,
  AlertTriangle,
  Info,
  BarChart3,
  Construction,
  Download,
  ClipboardPaste,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAdAccount } from '../contexts/AdAccountContext';
import { getBusinessTypeConfig } from '../lib/businessTypeConfig';
import { reserveCredits, confirmCredits, refundCredits, InsufficientCreditsError } from '../services/stripeApi';
import CreditExhaustionModal from '../components/CreditExhaustionModal';
import ImportAnalysisModal from '../components/ImportAnalysisModal';
import ManualAnalysisModal from '../components/ManualAnalysisModal';
import {
  getCachedAnalysis,
  setCachedAnalysis,
  getImportMetadata,
  getAvailableImports,
  importAnalysis,
  setManualAnalysis,
  getManualSeed,
  clearManualSeed,
  clearChannelAnalysis,
  clearImportMetadata,
  type Channel,
  type ImportMetadata,
} from '../lib/channelAnalysisCache';
import {
  planAnalysisRun,
  analysisModeOf,
  isSeeded,
  unapplySeed,
  buildObservedAnalysis,
  buildSeededAnalysis,
  mergeHybridAnalysis,
} from '../lib/analysisMode';
import { parseManualSeed } from '../lib/manualSeed';
import './Insights.css';

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
    detectedConversionType: creative.detectedConversionType,
    purchaseConversions: creative.purchaseConversions,
    leadConversions: creative.leadConversions,
    adName: creative.adName,
    axisTag: parseAxisTag(creative.adName),
  };
}

const Insights = () => {
  const { accountBusinessType: businessType, accounts, currentAccount, isMultiAccount } = useAdAccount();
  const [selectedChannel, setSelectedChannel] = useState<Channel>('meta');
  const [analysis, setAnalysis] = useState<ChannelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Zero ads + a seed present is an informational state, not a failure — it gets its own
  // non-destructive banner rather than the red error treatment.
  const [notice, setNotice] = useState<string | null>(null);
  const [adsCount, setAdsCount] = useState(0);
  const [importMeta, setImportMeta] = useState<ImportMetadata | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // Reload analysis + provenance from cache for the current channel
  const refreshFromCache = useCallback(() => {
    setAnalysis(getCachedAnalysis(selectedChannel, businessType));
    setImportMeta(getImportMetadata(selectedChannel));
  }, [selectedChannel, businessType]);

  // Load cached analysis + import metadata when channel changes
  useEffect(() => {
    refreshFromCache();
    setError(null);
    setNotice(null);
  }, [refreshFromCache]);

  const canImport = isMultiAccount && accounts.length > 1;

  const handleImport = useCallback((sourceAccountId: string): boolean => {
    const success = importAnalysis(selectedChannel, sourceAccountId, accounts, businessType);
    if (success) refreshFromCache();
    return success;
  }, [selectedChannel, accounts, businessType, refreshFromCache]);

  // Cold-start: seed a manual analysis (pasted JSON or distilled brief) for this account.
  // Stored as a seeded-mode analysis so it renders honestly from the moment it lands — no health
  // score against an account with no delivery data, sections labelled as hypotheses.
  const handleManualImport = useCallback((raw: unknown): boolean => {
    const seeded = parseManualSeed(raw, {
      channelName: CHANNELS.find(c => c.id === selectedChannel)?.name,
    });
    const success = setManualAnalysis(selectedChannel, seeded, businessType);
    if (success) {
      refreshFromCache();
      setError(null);
      setNotice(null);
    }
    return success;
  }, [selectedChannel, businessType, refreshFromCache]);

  // A seed now outlives an observed run (that's what makes hybrid possible), so there has to be a
  // way back out of a seed that was pasted by mistake. Removing it un-applies it from the cached
  // analysis straight away: a seeded analysis IS the seed, so it goes; a hybrid one keeps its
  // measured half and hands the voice back to the one extracted from winners. Without this the
  // seed's voice and guardrails would keep steering copy generation with no banner left to say so.
  const handleRemoveSeed = useCallback(() => {
    clearManualSeed(selectedChannel);
    const withoutSeed = analysis ? unapplySeed(analysis) : null;
    if (withoutSeed) {
      setCachedAnalysis(selectedChannel, withoutSeed, businessType);
    } else {
      clearChannelAnalysis(selectedChannel);
    }
    refreshFromCache();
    setNotice(null);
    setError(null);
  }, [selectedChannel, analysis, businessType, refreshFromCache]);

  // Credit exhaustion modal state
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditModalData, setCreditModalData] = useState({ remaining: 0, required: 0 });

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
    setNotice(null);
    setLoadingMessage('ConversionIQ™ preparing analysis...');

    // Reserve credits before analysis
    let transactionId: string | undefined;
    try {
      const reservation = await reserveCredits('channel_analysis', 1);
      transactionId = reservation.transactionId;
    } catch (err: unknown) {
      if (err instanceof InsufficientCreditsError) {
        setLoading(false);
        setLoadingMessage('');
        setCreditModalData({ remaining: err.creditsRemaining, required: err.creditsRequired });
        setShowCreditModal(true);
        return;
      }
      console.warn('Credit reservation failed, proceeding:', err);
    }

    // NOTE: the previous analysis is deliberately NOT cleared here. A run that fails or comes back
    // empty must leave what's already on screen intact, exactly as it leaves the cache intact.
    setLoadingMessage('Fetching ad data...');

    try {
      // Fetch ads for the channel
      let ads: AdCreativeData[] = [];

      if (selectedChannel === 'meta') {
        setLoadingMessage('Fetching Meta ads...');
        const btConfig = getBusinessTypeConfig(businessType);
        const creatives = await fetchAdCreatives({ datePreset: 'last_30d' }, {
          primaryActionType: btConfig.primaryActionType,
          winningCVRThreshold: btConfig.winningCVRThreshold,
          fatiguedCVRThreshold: btConfig.fatiguedCVRThreshold,
          winningConversionMin: btConfig.winningConversionMin,
          fatiguedSpendMin: btConfig.fatiguedSpendMin,
        });
        ads = creatives.map(convertToAdCreativeData);
        setAdsCount(ads.length);
      }

      // A cold account is a supported state, not a failure. What this run produces depends on
      // what's actually available: live ads, a manual seed, both, or neither.
      const plan = planAnalysisRun({
        hasAds: ads.length > 0,
        seed: getManualSeed(selectedChannel, businessType),
      });

      // Neither ads nor a seed — the only state in which the original message is accurate.
      if (plan.mode === 'none') {
        setError('No ads found for analysis. Make sure you have active ads in your account.');
        setLoading(false);
        // Refund credits since no analysis was run
        if (transactionId) refundCredits(transactionId);
        return;
      }

      // Seeded: no ad history, but a seed is present. The seed is already an interpreted profile
      // (distilled at ingest), so materializing it needs no model call — which means no credit.
      if (plan.mode === 'seeded') {
        if (transactionId) refundCredits(transactionId);
        const seededResult = buildSeededAnalysis(plan.seed, { channelName: channelConfig.name });
        setCachedAnalysis(selectedChannel, seededResult, businessType);
        // Provenance stays — this analysis IS the seed, and the banner should keep saying so.
        setAnalysis(seededResult);
        setImportMeta(getImportMetadata(selectedChannel));
        setNotice('No ad history yet. This analysis is built from your manual seed.');
        setLoading(false);
        return;
      }

      setLoadingMessage(`ConversionIQ™ analyzing ${ads.length} ads...`);

      // Run the analysis with selected reasoning effort
      const result = await analyzeChannelPerformance(ads, channelConfig.name, { businessType });

      // Confirm credit consumption on success
      if (transactionId) confirmCredits(transactionId);

      // Axis-level attribution (BlitzScale) — computed in code (not via GPT). Hybrid-aware
      // primary field from business type so lead-CVR is never compared to purchase-CVR.
      const axisPrimaryField = businessType === 'leadgen' ? 'leads' : 'purchases';
      result.axisInsights = aggregateByAxis(ads, axisPrimaryField);

      // Hybrid folds the seed's voice and guardrails back in; observed passes through untouched
      // apart from its mode/evidence markers.
      const observed = buildObservedAnalysis(result);
      const finalResult = plan.mode === 'hybrid' ? mergeHybridAnalysis(observed, plan.seed) : observed;

      setCachedAnalysis(selectedChannel, finalResult, businessType);

      if (plan.mode === 'observed') {
        // Native analysis replaces imported provenance. In hybrid the seed is still contributing,
        // so its provenance is kept and the banner reflects the combined run.
        clearImportMetadata(selectedChannel);
        setImportMeta(null);
      } else {
        setImportMeta(getImportMetadata(selectedChannel));
      }

      setAnalysis(finalResult);
    } catch (err: unknown) {
      // Refund credits on failure
      if (transactionId) refundCredits(transactionId);
      console.error('Analysis failed:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [selectedChannel, businessType]);

  const selectedChannelConfig = CHANNELS.find(c => c.id === selectedChannel);
  // Once a run has landed in seeded mode we know this account has no ad history, so the primary
  // action is honestly "re-run from seed" rather than an invitation to analyze ads that don't exist.
  const isSeededView = isSeeded(analysis);

  return (
    <div className="page">
      <SEO
        title="Insights"
        description="AI-powered channel analysis and strategic recommendations from ConversionIQ™."
        canonical="/insights"
        noindex={true}
      />
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

      {/* Analysis Controls */}
      <div className="analysis-controls">
        <button
          className="run-analysis-btn"
          onClick={runAnalysis}
          disabled={loading || !selectedChannelConfig?.available}
          title={
            isSeededView
              ? 'This account has no ad history yet. This rebuilds the analysis from your manual seed — no credits used.'
              : undefined
          }
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              {loadingMessage}
            </>
          ) : (
            <>
              <span className="btn-icon"><ScanSearch size={18} strokeWidth={1.5} /></span>
              {isSeededView ? 'Re-run from seed' : 'Run Channel Analysis'}
            </>
          )}
        </button>

        {canImport && !loading && (
          <button
            className="import-analysis-btn"
            onClick={() => setShowImportModal(true)}
            disabled={!selectedChannelConfig?.available}
          >
            <span className="btn-icon"><Download size={18} strokeWidth={1.5} /></span>
            Import from Account
          </button>
        )}

        {!loading && (
          <button
            className="import-analysis-btn"
            onClick={() => setShowManualModal(true)}
            disabled={!selectedChannelConfig?.available}
          >
            <span className="btn-icon"><ClipboardPaste size={18} strokeWidth={1.5} /></span>
            Seed Manual Analysis
          </button>
        )}

        {analysis && (
          <span className="last-analyzed">
            Last analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Import Provenance Banner */}
      {!loading && analysis && importMeta && (
        <div className="import-provenance-banner">
          <span className="provenance-icon">
            {importMeta.source === 'manual'
              ? <ClipboardPaste size={16} strokeWidth={1.5} />
              : <Download size={16} strokeWidth={1.5} />}
          </span>
          <span className="provenance-text">
            {importMeta.source === 'manual' ? (
              analysisModeOf(analysis) === 'hybrid' ? (
                <>Your live ad data, with <strong>manual seed</strong> voice and guardrails applied</>
              ) : (
                <>Seeded from a <strong>manual analysis</strong> on {new Date(importMeta.importedAt).toLocaleDateString()}</>
              )
            ) : (
              <>
                Imported from <strong>{importMeta.adAccountName}</strong> on {new Date(importMeta.importedAt).toLocaleDateString()}
                {importMeta.sourceBusinessType !== businessType && (
                  <span className="provenance-type-note"> (originally {importMeta.sourceBusinessType})</span>
                )}
              </>
            )}
          </span>
          <span className="provenance-hint">
            {/* On a cold account the old "run your own analysis to replace" copy invited the exact
                action that used to dead-end in a red error. Say what a re-run will actually do. */}
            {importMeta.source !== 'manual'
              ? 'Run your own analysis to replace'
              : analysisModeOf(analysis) === 'hybrid'
                ? 'Your ad data leads; the seed keeps voice and compliance'
                : 'Re-runs stay seeded until this account has live ads'}
          </span>
          {importMeta.source === 'manual' && (
            <button type="button" className="provenance-remove-btn" onClick={handleRemoveSeed}>
              Remove seed
            </button>
          )}
        </div>
      )}

      {/* Informational State — zero ads with a seed present is expected, not an error */}
      {!loading && notice && (
        <div className="insights-notice">
          <span className="notice-icon"><Info size={18} strokeWidth={1.5} /></span>
          {notice}
        </div>
      )}

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
          {canImport && (
            <button
              className="import-empty-link"
              onClick={() => setShowImportModal(true)}
            >
              Or import analysis from another ad account
            </button>
          )}
          <button
            className="import-empty-link"
            onClick={() => setShowManualModal(true)}
          >
            Or seed a manual analysis to start
          </button>
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

      {/* Credit Exhaustion Modal */}
      {showCreditModal && (
        <CreditExhaustionModal
          creditsRemaining={creditModalData.remaining}
          creditsRequired={creditModalData.required}
          onClose={() => setShowCreditModal(false)}
        />
      )}

      {/* Import Analysis Modal */}
      {showImportModal && (
        <ImportAnalysisModal
          availableImports={getAvailableImports(accounts, currentAccount?.ad_account_id || null, selectedChannel)}
          currentBusinessType={businessType}
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Manual Analysis (cold-start seed) Modal */}
      {showManualModal && (
        <ManualAnalysisModal
          onImport={handleManualImport}
          onClose={() => setShowManualModal(false)}
        />
      )}
    </div>
  );
};

export default Insights;
