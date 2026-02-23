import { useState, useEffect, useCallback } from 'react';
import Loading from '../components/Loading';
import type { DashboardMetrics, FunnelStep, ABTestMetrics, FunnelVersionSummary, FunnelConfig } from '../types/funnel';
import { getAuthToken } from '../lib/authToken';
import './Funnels.css';

// View modes
type ViewMode = 'overview' | 'single' | 'compare';

// Date range options
const DATE_RANGES = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
  { label: 'All Time', days: 365 * 10 },
];

// Funnel step configurations
const FUNNEL_CONFIGS: Record<string, FunnelConfig> = {
  main: {
    id: 'main',
    label: 'Main Funnel',
    steps: ['landing', 'checkout', 'upsell-1', 'downsell-1', 'upsell-2', 'thank-you'],
    stepNames: {
      'landing': 'Landing',
      'checkout': 'Checkout',
      'upsell-1': 'Upsell 1',
      'downsell-1': 'Downsell 1',
      'upsell-2': 'Upsell 2',
      'thank-you': 'Thank You',
    },
    entryStep: 'landing',
    checkoutStep: 'checkout',
    noMetricsSteps: ['landing', 'thank-you'],
  },
  free: {
    id: 'free',
    label: 'Free Lead Magnet',
    steps: ['free-optin', 'free-offer', 'free-checkout', 'free-upsell-1', 'free-downsell-1', 'free-upsell-2', 'free-thank-you'],
    stepNames: {
      'free-optin': 'Opt-In',
      'free-offer': 'Offer',
      'free-checkout': 'Checkout',
      'free-upsell-1': 'Upsell 1',
      'free-downsell-1': 'Downsell 1',
      'free-upsell-2': 'Upsell 2',
      'free-thank-you': 'Thank You',
    },
    entryStep: 'free-optin',
    checkoutStep: 'free-checkout',
    noMetricsSteps: ['free-optin', 'free-thank-you'],
  },
};

/** Derive funnel type from funnel_id (e.g. 'main-v2' → 'main') */
function getFunnelType(funnelId: string): string {
  const match = funnelId.match(/^(.+?)-v\d+$/);
  return match ? match[1] : funnelId;
}

/** Get config for a funnel type, falling back to main */
function getConfig(funnelType: string): FunnelConfig {
  return FUNNEL_CONFIGS[funnelType] || FUNNEL_CONFIGS.main;
}

/** Get display name for a step */
function getStepName(step: FunnelStep, config: FunnelConfig): string {
  return config.stepNames[step] || step;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Calculate delta between two values as percentage change */
function calcDelta(a: number, b: number): number | null {
  if (b === 0) return a > 0 ? 100 : null;
  return ((a - b) / b) * 100;
}

export default function Funnels() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [funnels, setFunnels] = useState<FunnelVersionSummary[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [compareMetricsA, setCompareMetricsA] = useState<DashboardMetrics | null>(null);
  const [compareMetricsB, setCompareMetricsB] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState(30);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [compareFunnelA, setCompareFunnelA] = useState<string | null>(null);
  const [compareFunnelB, setCompareFunnelB] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<FunnelStep | null>(null);
  const [activeSessions, setActiveSessions] = useState(0);
  const [adSpend, setAdSpend] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('funnel_dashboard_ad_spend');
      return saved ? parseFloat(saved) : 0;
    }
    return 0;
  });

  // Build date range
  const getDateRange = useCallback(() => {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - selectedRange * 24 * 60 * 60 * 1000).toISOString();
    return { startDate, endDate };
  }, [selectedRange]);

  // Fetch API helper
  const fetchApi = useCallback(async (params: string): Promise<Response> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`/api/funnel/metrics?${params}`, { headers });
  }, []);

  // Poll for active sessions every 10 seconds
  useEffect(() => {
    async function fetchActiveSessions() {
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch('/api/funnel/active-sessions', { headers });
        const data = await response.json();
        setActiveSessions(data.count || 0);
      } catch {
        // Silently fail - not critical
      }
    }

    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  // Discover funnel versions when date range changes
  useEffect(() => {
    async function discoverFunnels() {
      setIsLoading(true);
      setError(null);

      try {
        const { startDate, endDate } = getDateRange();
        const response = await fetchApi(`discover=true&startDate=${startDate}&endDate=${endDate}`);

        if (!response.ok) throw new Error('Failed to discover funnels');

        const data = await response.json();
        setFunnels(data.funnels || []);

        // Auto-select first funnel if none selected
        if (!selectedFunnelId && data.funnels?.length > 0) {
          setSelectedFunnelId(data.funnels[0].funnelId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    discoverFunnels();
  }, [selectedRange, getDateRange, fetchApi]);

  // Fetch single funnel metrics when selected funnel changes
  useEffect(() => {
    if (viewMode !== 'single' || !selectedFunnelId) return;

    async function fetchMetrics() {
      setIsMetricsLoading(true);
      try {
        const { startDate, endDate } = getDateRange();
        const response = await fetchApi(`funnelId=${selectedFunnelId}&startDate=${startDate}&endDate=${endDate}`);

        if (!response.ok) throw new Error('Failed to fetch metrics');
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setIsMetricsLoading(false);
      }
    }

    fetchMetrics();
  }, [viewMode, selectedFunnelId, selectedRange, getDateRange, fetchApi]);

  // Fetch compare metrics when compare funnels change
  useEffect(() => {
    if (viewMode !== 'compare' || !compareFunnelA || !compareFunnelB) return;

    async function fetchCompare() {
      setIsMetricsLoading(true);
      try {
        const { startDate, endDate } = getDateRange();
        const [respA, respB] = await Promise.all([
          fetchApi(`funnelId=${compareFunnelA}&startDate=${startDate}&endDate=${endDate}`),
          fetchApi(`funnelId=${compareFunnelB}&startDate=${startDate}&endDate=${endDate}`),
        ]);

        if (!respA.ok || !respB.ok) throw new Error('Failed to fetch comparison data');

        const [dataA, dataB] = await Promise.all([respA.json(), respB.json()]);
        setCompareMetricsA(dataA);
        setCompareMetricsB(dataB);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comparison');
      } finally {
        setIsMetricsLoading(false);
      }
    }

    fetchCompare();
  }, [viewMode, compareFunnelA, compareFunnelB, selectedRange, getDateRange, fetchApi]);

  // Save ad spend to localStorage
  const handleAdSpendChange = (value: number) => {
    setAdSpend(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('funnel_dashboard_ad_spend', value.toString());
    }
  };

  // Navigate to single view for a funnel
  const viewFunnel = (funnelId: string) => {
    setSelectedFunnelId(funnelId);
    setViewMode('single');
    setSelectedStep(null);
  };

  // Set up comparison between two funnels
  const startCompare = (funnelIdA: string, funnelIdB: string) => {
    setCompareFunnelA(funnelIdA);
    setCompareFunnelB(funnelIdB);
    setViewMode('compare');
  };

  // Calculate ROAS and CAC for single view
  const roas = adSpend > 0 && metrics ? metrics.summary.totalRevenue / adSpend : 0;
  const cac = metrics?.summary.uniqueCustomers && adSpend > 0
    ? adSpend / metrics.summary.uniqueCustomers
    : 0;

  // Get config for selected funnel
  const selectedConfig = selectedFunnelId ? getConfig(getFunnelType(selectedFunnelId)) : FUNNEL_CONFIGS.main;

  // Get A/B test data for selected step
  const stepABTests = selectedStep
    ? metrics?.abTests.filter((ab) => ab.step === selectedStep) || []
    : [];

  if (isLoading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Funnels</h1>
          <p className="page-subtitle">Loading funnel analytics...</p>
        </div>
        <Loading size="large" message="ConversionIQ™ extracting insights..." />
      </div>
    );
  }

  return (
    <div className="page funnels-page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Funnels</h1>
          <p className="page-subtitle">Real-time funnel performance analytics</p>
        </div>
        <div className="page-header-right">
          <select
            value={selectedRange}
            onChange={(e) => setSelectedRange(Number(e.target.value))}
            className="date-range-select"
          >
            {DATE_RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live Sessions Indicator */}
      <div className="live-sessions-bar">
        <div className={`live-sessions-card ${activeSessions > 0 ? 'active' : ''}`}>
          <span className="live-dot-wrapper">
            <span className="live-dot-ping"></span>
            <span className="live-dot"></span>
          </span>
          <span className="live-sessions-text">
            <span className="live-sessions-count">{activeSessions}</span>
            <span className="live-sessions-label">{activeSessions === 1 ? 'visitor' : 'visitors'} online</span>
          </span>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="view-tabs">
        <button
          className={`view-tab ${viewMode === 'overview' ? 'active' : ''}`}
          onClick={() => setViewMode('overview')}
        >
          Overview
        </button>
        <button
          className={`view-tab ${viewMode === 'single' ? 'active' : ''}`}
          onClick={() => setViewMode('single')}
        >
          Single Funnel
        </button>
        <button
          className={`view-tab ${viewMode === 'compare' ? 'active' : ''}`}
          onClick={() => setViewMode('compare')}
          disabled={funnels.length < 2}
        >
          Compare
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="funnels-error">
          <span className="error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      {/* Overview Mode */}
      {viewMode === 'overview' && !error && (
        <OverviewView
          funnels={funnels}
          onViewFunnel={viewFunnel}
          onCompare={startCompare}
        />
      )}

      {/* Single Funnel Mode */}
      {viewMode === 'single' && !error && (
        <SingleView
          funnels={funnels}
          selectedFunnelId={selectedFunnelId}
          onSelectFunnel={viewFunnel}
          metrics={metrics}
          isLoading={isMetricsLoading}
          config={selectedConfig}
          adSpend={adSpend}
          roas={roas}
          cac={cac}
          onAdSpendChange={handleAdSpendChange}
          selectedStep={selectedStep}
          onSelectStep={setSelectedStep}
          stepABTests={stepABTests}
        />
      )}

      {/* Compare Mode */}
      {viewMode === 'compare' && !error && (
        <CompareView
          funnels={funnels}
          compareFunnelA={compareFunnelA}
          compareFunnelB={compareFunnelB}
          onSelectA={setCompareFunnelA}
          onSelectB={setCompareFunnelB}
          metricsA={compareMetricsA}
          metricsB={compareMetricsB}
          isLoading={isMetricsLoading}
        />
      )}
    </div>
  );
}

// ─── Overview View ───────────────────────────────────────────────

function OverviewView({
  funnels,
  onViewFunnel,
  onCompare,
}: {
  funnels: FunnelVersionSummary[];
  onViewFunnel: (id: string) => void;
  onCompare: (a: string, b: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (funnelId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(funnelId)) {
        next.delete(funnelId);
      } else if (next.size < 2) {
        next.add(funnelId);
      }
      return next;
    });
  };

  if (funnels.length === 0) {
    return (
      <div className="funnels-empty">
        <div className="empty-icon-wrapper">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="empty-title">No funnel data yet</p>
        <p className="empty-subtitle">Events will appear here as visitors move through your funnels.</p>
      </div>
    );
  }

  const selectedArr = Array.from(selected);

  return (
    <>
      {selected.size === 2 && (
        <div className="compare-prompt">
          <span>2 funnels selected</span>
          <button
            className="compare-prompt-btn"
            onClick={() => onCompare(selectedArr[0], selectedArr[1])}
          >
            Compare
          </button>
        </div>
      )}

      <div className="funnel-table-card">
        <div className="funnel-table-header">
          <h2 className="funnel-table-title">All Funnel Versions</h2>
          {funnels.length >= 2 && selected.size < 2 && (
            <span className="funnel-table-hint">Select 2 to compare</span>
          )}
        </div>

        <div className="funnel-table-wrapper">
          <table className="funnel-table">
            <thead>
              <tr>
                {funnels.length >= 2 && <th className="th-center th-narrow"></th>}
                <th className="th-left">Funnel</th>
                <th className="th-left">Type</th>
                <th className="th-right">Sessions</th>
                <th className="th-right">Purchases</th>
                <th className="th-right">Conv %</th>
                <th className="th-right">Revenue</th>
                <th className="th-right">Last Event</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((f) => (
                <tr
                  key={f.funnelId}
                  className={`row-clickable ${selected.has(f.funnelId) ? 'row-selected' : ''}`}
                  onClick={() => onViewFunnel(f.funnelId)}
                >
                  {funnels.length >= 2 && (
                    <td className="td-center td-narrow" onClick={(e) => { e.stopPropagation(); toggleSelect(f.funnelId); }}>
                      <input
                        type="checkbox"
                        checked={selected.has(f.funnelId)}
                        onChange={() => {}}
                        className="funnel-checkbox"
                      />
                    </td>
                  )}
                  <td className="td-step">{f.funnelId}</td>
                  <td>
                    <span className={`funnel-type-badge badge-${f.funnelType}`}>
                      {FUNNEL_CONFIGS[f.funnelType]?.label || f.funnelType}
                    </span>
                  </td>
                  <td className="td-number">{f.totalSessions.toLocaleString()}</td>
                  <td className="td-number">{f.totalPurchases.toLocaleString()}</td>
                  <td className="td-number">
                    <span className={f.conversionRate >= 5 ? 'text-success' : ''}>{formatPercent(f.conversionRate)}</span>
                  </td>
                  <td className="td-number td-revenue">{formatCurrency(f.totalRevenue)}</td>
                  <td className="td-number td-muted">{formatDate(f.lastEventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Single Funnel View ──────────────────────────────────────────

function SingleView({
  funnels,
  selectedFunnelId,
  onSelectFunnel,
  metrics,
  isLoading,
  config,
  adSpend,
  roas,
  cac,
  onAdSpendChange,
  selectedStep,
  onSelectStep,
  stepABTests,
}: {
  funnels: FunnelVersionSummary[];
  selectedFunnelId: string | null;
  onSelectFunnel: (id: string) => void;
  metrics: DashboardMetrics | null;
  isLoading: boolean;
  config: FunnelConfig;
  adSpend: number;
  roas: number;
  cac: number;
  onAdSpendChange: (v: number) => void;
  selectedStep: FunnelStep | null;
  onSelectStep: (step: FunnelStep | null) => void;
  stepABTests: ABTestMetrics[];
}) {
  if (isLoading) {
    return <Loading size="medium" message="ConversionIQ™ analyzing..." />;
  }

  if (!metrics || !selectedFunnelId) {
    return (
      <div className="funnels-empty">
        <p className="empty-title">Select a funnel to view</p>
        <p className="empty-subtitle">Choose a funnel version from the dropdown above.</p>
      </div>
    );
  }

  // Calculate funnel totals from entry step
  const entryMetrics = metrics.stepMetrics.find((s) => s.step === config.entryStep);
  const funnelTotals = {
    sessions: entryMetrics?.sessions || 0,
    purchases: metrics.summary.purchases,
    conversionRate: metrics.summary.conversionRate,
    revenue: metrics.summary.totalRevenue,
  };

  return (
    <>
      {/* Funnel Selector */}
      <div className="funnel-selector-bar">
        <select
          value={selectedFunnelId}
          onChange={(e) => onSelectFunnel(e.target.value)}
          className="funnel-selector"
        >
          {funnels.map((f) => (
            <option key={f.funnelId} value={f.funnelId}>
              {f.funnelId} — {formatCurrency(f.totalRevenue)} ({f.totalSessions} sessions)
            </option>
          ))}
        </select>
      </div>

      {/* Hero Metrics Grid */}
      <div className="metrics-grid">
        {/* Revenue Card */}
        <div className="metric-card metric-card-revenue">
          <p className="metric-label">Total Revenue</p>
          <div className="metric-value-row">
            <p className="metric-value">{formatCurrency(metrics.summary.totalRevenue)}</p>
            {metrics.summary.purchases > 0 && (
              <span className="metric-badge metric-badge-success">
                <svg className="metric-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17l9.2-9.2M17 17V7H7" />
                </svg>
                {metrics.summary.purchases} sales
              </span>
            )}
          </div>
        </div>

        {/* Ad Spend + ROAS Card */}
        <div className="metric-card metric-card-violet">
          <div className="metric-split">
            <div className="metric-split-left">
              <p className="metric-label">Ad Spend</p>
              <div className="metric-input-wrapper">
                <span className="metric-input-prefix">$</span>
                <input
                  type="number"
                  value={adSpend || ''}
                  onChange={(e) => onAdSpendChange(Number(e.target.value))}
                  placeholder="0"
                  className="metric-input"
                />
              </div>
            </div>
            <div className="metric-split-right">
              <p className="metric-label">ROAS</p>
              <p className={`metric-value-small ${roas >= 2 ? 'text-success' : roas > 0 ? 'text-warning' : 'text-muted'}`}>
                {roas > 0 ? `${roas.toFixed(2)}x` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* CAC + Customers Card */}
        <div className="metric-card">
          <div className="metric-split">
            <div className="metric-split-left">
              <p className="metric-label">CAC</p>
              <p className="metric-value-small">{cac > 0 ? formatCurrency(cac) : '—'}</p>
            </div>
            <div className="metric-split-right">
              <p className="metric-label">Customers</p>
              <p className="metric-value-small text-violet">{metrics.summary.uniqueCustomers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Funnel Breakdown Table */}
      <div className="funnel-table-card">
        <div className="funnel-table-header">
          <h2 className="funnel-table-title">Funnel Breakdown</h2>
          <span className="funnel-aov">
            AOV: <span className="aov-value">{formatCurrency(metrics.summary.aovPerCustomer)}</span>
          </span>
        </div>

        <div className="funnel-table-wrapper">
          <table className="funnel-table">
            <thead>
              <tr>
                <th className="th-left">Step</th>
                <th className="th-right">Sessions</th>
                <th className="th-right">Purchases</th>
                <th className="th-right">Conv %</th>
                <th className="th-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {metrics.stepMetrics.map((step) => {
                const hasABTest = metrics.abTests.some((ab) => ab.step === step.step);
                const isSelected = selectedStep === step.step;
                const isNoMetrics = config.noMetricsSteps.includes(step.step);
                const isCheckout = step.step === config.checkoutStep;

                return (
                  <>
                    <tr
                      key={step.step}
                      className={`${isSelected ? 'row-selected' : ''} ${hasABTest ? 'row-clickable' : ''}`}
                      onClick={() => hasABTest && onSelectStep(step.step === selectedStep ? null : step.step)}
                    >
                      <td className="td-step">
                        {getStepName(step.step, config)}
                        {hasABTest && <span className="ab-badge">A/B</span>}
                      </td>
                      <td className="td-number">{step.sessions.toLocaleString()}</td>
                      <td className="td-number">
                        {isNoMetrics
                          ? <span className="text-muted">—</span>
                          : step.purchases.toLocaleString()}
                      </td>
                      <td className="td-number">
                        {isNoMetrics
                          ? <span className="text-muted">—</span>
                          : <span className={step.conversionRate >= 5 ? 'text-success' : ''}>{formatPercent(step.conversionRate)}</span>}
                      </td>
                      <td className="td-number td-revenue">
                        {isNoMetrics
                          ? <span className="text-muted">—</span>
                          : formatCurrency(step.revenue)}
                      </td>
                    </tr>
                    {/* Order bump sub-row */}
                    {isCheckout && metrics.orderBump && (
                      <tr key={`${step.step}-orderbump`} className="order-bump-row">
                        <td className="td-step td-indent">
                          <span className="order-bump-label">Order Bump</span>
                        </td>
                        <td className="td-number text-muted">—</td>
                        <td className="td-number">{metrics.orderBump.purchases.toLocaleString()}</td>
                        <td className="td-number">
                          <span className={metrics.orderBump.takeRate >= 10 ? 'text-success' : ''}>
                            {formatPercent(metrics.orderBump.takeRate)}
                          </span>
                        </td>
                        <td className="td-number td-revenue">{formatCurrency(metrics.orderBump.revenue)}</td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="row-total">
                <td className="td-step">Total</td>
                <td className="td-number">{funnelTotals.sessions.toLocaleString()}</td>
                <td className="td-number">{funnelTotals.purchases.toLocaleString()}</td>
                <td className="td-number text-success">{formatPercent(funnelTotals.conversionRate)}</td>
                <td className="td-number td-revenue">{formatCurrency(funnelTotals.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* A/B Test Comparison */}
      {selectedStep && stepABTests.length > 0 && (
        <div className="ab-test-card">
          <div className="ab-test-header">
            <h2 className="ab-test-title">A/B Test: {getStepName(selectedStep, config)}</h2>
            <button onClick={() => onSelectStep(null)} className="ab-test-close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="ab-test-content">
            {stepABTests.length >= 2 && <ABTestWinner variants={stepABTests} />}

            <div className="ab-table-wrapper">
              <table className="funnel-table">
                <thead>
                  <tr>
                    <th className="th-left">Variant</th>
                    <th className="th-right">Sessions</th>
                    <th className="th-right">Purchases</th>
                    <th className="th-right">Conv %</th>
                    <th className="th-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {stepABTests.map((variant) => (
                    <tr key={variant.variant}>
                      <td className="td-step td-capitalize">{variant.variant}</td>
                      <td className="td-number">{variant.sessions.toLocaleString()}</td>
                      <td className="td-number">{variant.purchases.toLocaleString()}</td>
                      <td className="td-number">{formatPercent(variant.conversionRate)}</td>
                      <td className="td-number td-revenue">{formatCurrency(variant.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* A/B Tests Available */}
      {metrics.abTests.length > 0 && !selectedStep && (
        <div className="ab-available-card">
          <h2 className="ab-available-title">A/B Tests Available</h2>
          <div className="ab-available-buttons">
            {metrics.stepMetrics
              .filter((step) => metrics.abTests.some((ab) => ab.step === step.step))
              .map((step) => (
                <button
                  key={step.step}
                  onClick={() => onSelectStep(step.step)}
                  className="ab-available-btn"
                >
                  {getStepName(step.step, config)}
                  <span className="ab-badge">A/B</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {metrics.summary.sessions === 0 && (
        <div className="funnels-empty">
          <div className="empty-icon-wrapper">
            <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="empty-title">No data for this funnel</p>
          <p className="empty-subtitle">Events will appear here as visitors move through this funnel version.</p>
        </div>
      )}
    </>
  );
}

// ─── Compare View ────────────────────────────────────────────────

function CompareView({
  funnels,
  compareFunnelA,
  compareFunnelB,
  onSelectA,
  onSelectB,
  metricsA,
  metricsB,
  isLoading,
}: {
  funnels: FunnelVersionSummary[];
  compareFunnelA: string | null;
  compareFunnelB: string | null;
  onSelectA: (id: string) => void;
  onSelectB: (id: string) => void;
  metricsA: DashboardMetrics | null;
  metricsB: DashboardMetrics | null;
  isLoading: boolean;
}) {
  // Auto-select first two funnels if not set
  useEffect(() => {
    if (!compareFunnelA && funnels.length >= 1) onSelectA(funnels[0].funnelId);
    if (!compareFunnelB && funnels.length >= 2) onSelectB(funnels[1].funnelId);
  }, [funnels, compareFunnelA, compareFunnelB, onSelectA, onSelectB]);

  if (funnels.length < 2) {
    return (
      <div className="funnels-empty">
        <p className="empty-title">Need at least 2 funnels to compare</p>
        <p className="empty-subtitle">Create and test multiple funnel versions to use this feature.</p>
      </div>
    );
  }

  return (
    <>
      {/* Funnel Selectors */}
      <div className="compare-selectors">
        <div className="compare-selector-group">
          <label className="compare-selector-label">Funnel A</label>
          <select
            value={compareFunnelA || ''}
            onChange={(e) => onSelectA(e.target.value)}
            className="funnel-selector"
          >
            {funnels.map((f) => (
              <option key={f.funnelId} value={f.funnelId}>{f.funnelId}</option>
            ))}
          </select>
        </div>
        <div className="compare-vs">vs</div>
        <div className="compare-selector-group">
          <label className="compare-selector-label">Funnel B</label>
          <select
            value={compareFunnelB || ''}
            onChange={(e) => onSelectB(e.target.value)}
            className="funnel-selector"
          >
            {funnels.map((f) => (
              <option key={f.funnelId} value={f.funnelId}>{f.funnelId}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <Loading size="medium" message="ConversionIQ™ comparing..." />}

      {!isLoading && metricsA && metricsB && (
        <>
          {/* Summary Comparison */}
          <div className="compare-summary-grid">
            <CompareCard
              label="Revenue"
              valueA={formatCurrency(metricsA.summary.totalRevenue)}
              valueB={formatCurrency(metricsB.summary.totalRevenue)}
              delta={calcDelta(metricsA.summary.totalRevenue, metricsB.summary.totalRevenue)}
              higherIsBetter
            />
            <CompareCard
              label="Conversion Rate"
              valueA={formatPercent(metricsA.summary.conversionRate)}
              valueB={formatPercent(metricsB.summary.conversionRate)}
              delta={calcDelta(metricsA.summary.conversionRate, metricsB.summary.conversionRate)}
              higherIsBetter
            />
            <CompareCard
              label="Purchases"
              valueA={metricsA.summary.purchases.toLocaleString()}
              valueB={metricsB.summary.purchases.toLocaleString()}
              delta={calcDelta(metricsA.summary.purchases, metricsB.summary.purchases)}
              higherIsBetter
            />
            <CompareCard
              label="AOV"
              valueA={formatCurrency(metricsA.summary.aovPerCustomer)}
              valueB={formatCurrency(metricsB.summary.aovPerCustomer)}
              delta={calcDelta(metricsA.summary.aovPerCustomer, metricsB.summary.aovPerCustomer)}
              higherIsBetter
            />
          </div>

          {/* Winner Indicator */}
          <CompareWinner
            funnelA={compareFunnelA!}
            funnelB={compareFunnelB!}
            metricsA={metricsA}
            metricsB={metricsB}
          />

          {/* Step-by-Step Comparison Table */}
          <div className="funnel-table-card">
            <div className="funnel-table-header">
              <h2 className="funnel-table-title">Step Comparison</h2>
            </div>
            <div className="funnel-table-wrapper">
              <table className="funnel-table compare-table">
                <thead>
                  <tr>
                    <th className="th-left">Step</th>
                    <th className="th-right">A Sessions</th>
                    <th className="th-right">B Sessions</th>
                    <th className="th-right">A Conv %</th>
                    <th className="th-right">B Conv %</th>
                    <th className="th-right">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {buildCompareSteps(metricsA, metricsB, compareFunnelA!, compareFunnelB!).map((row) => (
                    <tr key={row.step}>
                      <td className="td-step">{row.displayName}</td>
                      <td className="td-number">{row.sessionsA.toLocaleString()}</td>
                      <td className="td-number">{row.sessionsB.toLocaleString()}</td>
                      <td className="td-number">
                        {row.isNoMetrics ? <span className="text-muted">—</span> : formatPercent(row.convRateA)}
                      </td>
                      <td className="td-number">
                        {row.isNoMetrics ? <span className="text-muted">—</span> : formatPercent(row.convRateB)}
                      </td>
                      <td className="td-number">
                        {row.isNoMetrics ? <span className="text-muted">—</span> : (
                          <DeltaChip delta={row.delta} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Shared Components ───────────────────────────────────────────

function CompareCard({
  label,
  valueA,
  valueB,
  delta,
  higherIsBetter,
}: {
  label: string;
  valueA: string;
  valueB: string;
  delta: number | null;
  higherIsBetter: boolean;
}) {
  return (
    <div className="compare-card">
      <p className="compare-card-label">{label}</p>
      <div className="compare-card-values">
        <div className="compare-card-col">
          <span className="compare-card-tag">A</span>
          <span className="compare-card-value">{valueA}</span>
        </div>
        <div className="compare-card-col">
          <span className="compare-card-tag">B</span>
          <span className="compare-card-value">{valueB}</span>
        </div>
      </div>
      {delta !== null && (
        <div className="compare-card-delta">
          <DeltaChip delta={delta} invert={!higherIsBetter} />
        </div>
      )}
    </div>
  );
}

function DeltaChip({ delta, invert }: { delta: number | null; invert?: boolean }) {
  if (delta === null) return <span className="text-muted">—</span>;

  const isPositive = invert ? delta < 0 : delta > 0;
  const cls = delta === 0 ? 'delta-neutral' : isPositive ? 'delta-positive' : 'delta-negative';

  return (
    <span className={`delta-chip ${cls}`}>
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
    </span>
  );
}

function CompareWinner({
  funnelA,
  funnelB,
  metricsA,
  metricsB,
}: {
  funnelA: string;
  funnelB: string;
  metricsA: DashboardMetrics;
  metricsB: DashboardMetrics;
}) {
  const crA = metricsA.summary.conversionRate;
  const crB = metricsB.summary.conversionRate;
  const totalSessions = metricsA.summary.sessions + metricsB.summary.sessions;

  if (totalSessions < 100) {
    return (
      <div className="ab-winner-card ab-winner-warning">
        <div className="ab-winner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="ab-winner-text">Need more sessions for reliable comparison ({totalSessions} total).</p>
      </div>
    );
  }

  const winner = crA >= crB ? funnelA : funnelB;
  const loserCr = crA >= crB ? crB : crA;
  const winnerCr = crA >= crB ? crA : crB;
  const lift = loserCr > 0 ? ((winnerCr - loserCr) / loserCr) * 100 : 0;
  const confidence = totalSessions > 500 ? 95 : totalSessions > 200 ? 85 : 70;

  return (
    <div className="ab-winner-card ab-winner-success">
      <div className="ab-winner-left">
        <div className="ab-winner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="ab-winner-info">
          <span className="ab-winner-name">{winner} winning</span>
          <p className="ab-winner-lift">+{lift.toFixed(1)}% lift in conversion rate</p>
        </div>
      </div>
      <div className="ab-winner-right">
        <span className="ab-confidence-badge">{confidence}% confidence</span>
      </div>
    </div>
  );
}

function ABTestWinner({ variants }: { variants: ABTestMetrics[] }) {
  if (variants.length < 2) return null;

  const sorted = [...variants].sort((a, b) => b.conversionRate - a.conversionRate);
  const winner = sorted[0];
  const loser = sorted[1];

  if (winner.sessions < 100 || loser.sessions < 100) {
    return (
      <div className="ab-winner-card ab-winner-warning">
        <div className="ab-winner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="ab-winner-text">Need at least 100 sessions per variant for statistical significance.</p>
      </div>
    );
  }

  const lift = loser.conversionRate > 0
    ? ((winner.conversionRate - loser.conversionRate) / loser.conversionRate) * 100
    : 0;

  const totalSessions = winner.sessions + loser.sessions;
  const confidence = totalSessions > 500 ? 95 : totalSessions > 200 ? 85 : 70;

  return (
    <div className="ab-winner-card ab-winner-success">
      <div className="ab-winner-left">
        <div className="ab-winner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="ab-winner-info">
          <span className="ab-winner-name">{winner.variant} Winning</span>
          <p className="ab-winner-lift">+{lift.toFixed(1)}% lift</p>
        </div>
      </div>
      <div className="ab-winner-right">
        <span className="ab-confidence-badge">{confidence}% confidence</span>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

interface CompareStepRow {
  step: string;
  displayName: string;
  sessionsA: number;
  sessionsB: number;
  convRateA: number;
  convRateB: number;
  delta: number | null;
  isNoMetrics: boolean;
}

function buildCompareSteps(
  metricsA: DashboardMetrics,
  metricsB: DashboardMetrics,
  funnelIdA: string,
  _funnelIdB: string,
): CompareStepRow[] {
  const fType = getFunnelType(funnelIdA);
  const config = getConfig(fType);

  // Build maps for quick lookup
  const mapA = new Map(metricsA.stepMetrics.map((s) => [s.step, s]));
  const mapB = new Map(metricsB.stepMetrics.map((s) => [s.step, s]));

  // Use all steps from both metrics sets
  const allSteps = new Set([...mapA.keys(), ...mapB.keys()]);

  // Order: config steps first, then any extras
  const ordered = [...config.steps.filter((s) => allSteps.has(s))];
  for (const s of allSteps) {
    if (!ordered.includes(s)) ordered.push(s);
  }

  return ordered.map((step) => {
    const a = mapA.get(step);
    const b = mapB.get(step);
    const isNoMetrics = config.noMetricsSteps.includes(step);

    return {
      step,
      displayName: getStepName(step, config),
      sessionsA: a?.sessions || 0,
      sessionsB: b?.sessions || 0,
      convRateA: a?.conversionRate || 0,
      convRateB: b?.conversionRate || 0,
      delta: isNoMetrics ? null : calcDelta(a?.conversionRate || 0, b?.conversionRate || 0),
      isNoMetrics,
    };
  });
}
