import { useState, useEffect } from 'react';
import Loading from '../components/Loading';
import type { DashboardMetrics, FunnelStep, ABTestMetrics } from '../types/funnel';
import './Funnels.css';

// Date range options
const DATE_RANGES = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
  { label: 'All Time', days: 365 * 10 },
];

// Funnel step display names
const STEP_NAMES: Record<FunnelStep, string> = {
  'landing': 'Landing',
  'checkout': 'Checkout',
  'upsell-1': 'Upsell 1',
  'downsell-1': 'Downsell 1',
  'upsell-2': 'Upsell 2',
  'thank-you': 'Thank You',
};

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

export default function Funnels() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState(30);
  const [selectedStep, setSelectedStep] = useState<FunnelStep | null>(null);
  const [activeSessions, setActiveSessions] = useState(0);
  const [adSpend, setAdSpend] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('funnel_dashboard_ad_spend');
      return saved ? parseFloat(saved) : 0;
    }
    return 0;
  });

  // Poll for active sessions every 10 seconds
  useEffect(() => {
    async function fetchActiveSessions() {
      try {
        const response = await fetch('/api/funnel/active-sessions');
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

  // Fetch metrics when date range changes
  useEffect(() => {
    async function fetchMetrics() {
      setIsLoading(true);
      setError(null);

      try {
        const endDate = new Date().toISOString();
        const startDate = new Date(Date.now() - selectedRange * 24 * 60 * 60 * 1000).toISOString();

        const response = await fetch(`/api/funnel/metrics?startDate=${startDate}&endDate=${endDate}`);

        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }

        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetrics();
  }, [selectedRange]);

  // Save ad spend to localStorage
  const handleAdSpendChange = (value: number) => {
    setAdSpend(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('funnel_dashboard_ad_spend', value.toString());
    }
  };

  // Calculate ROAS and CAC
  const roas = adSpend > 0 && metrics ? metrics.summary.totalRevenue / adSpend : 0;
  const cac = metrics?.summary.uniqueCustomers && adSpend > 0
    ? adSpend / metrics.summary.uniqueCustomers
    : 0;

  // Get A/B test data for selected step
  const stepABTests = selectedStep
    ? metrics?.abTests.filter((ab) => ab.step === selectedStep) || []
    : [];

  // Calculate funnel totals
  const funnelTotals = metrics
    ? {
        sessions: metrics.stepMetrics.find((s) => s.step === 'landing')?.sessions || 0,
        purchases: metrics.summary.purchases,
        conversionRate: metrics.summary.conversionRate,
        revenue: metrics.summary.totalRevenue,
      }
    : { sessions: 0, purchases: 0, conversionRate: 0, revenue: 0 };

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

      {/* Error State */}
      {error && (
        <div className="funnels-error">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {/* Metrics Content */}
      {!error && metrics && (
        <>
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
                      onChange={(e) => handleAdSpendChange(Number(e.target.value))}
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
                    return (
                      <tr
                        key={step.step}
                        className={`${isSelected ? 'row-selected' : ''} ${hasABTest ? 'row-clickable' : ''}`}
                        onClick={() => hasABTest && setSelectedStep(step.step === selectedStep ? null : step.step)}
                      >
                        <td className="td-step">
                          {STEP_NAMES[step.step]}
                          {hasABTest && <span className="ab-badge">A/B</span>}
                        </td>
                        <td className="td-number">{step.sessions.toLocaleString()}</td>
                        <td className="td-number">
                          {step.step === 'landing' || step.step === 'thank-you'
                            ? <span className="text-muted">—</span>
                            : step.purchases.toLocaleString()}
                        </td>
                        <td className="td-number">
                          {step.step === 'landing' || step.step === 'thank-you'
                            ? <span className="text-muted">—</span>
                            : <span className={step.conversionRate >= 5 ? 'text-success' : ''}>{formatPercent(step.conversionRate)}</span>}
                        </td>
                        <td className="td-number td-revenue">
                          {step.step === 'landing' || step.step === 'thank-you'
                            ? <span className="text-muted">—</span>
                            : formatCurrency(step.revenue)}
                        </td>
                      </tr>
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
                <h2 className="ab-test-title">A/B Test: {STEP_NAMES[selectedStep]}</h2>
                <button onClick={() => setSelectedStep(null)} className="ab-test-close">
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
                      onClick={() => setSelectedStep(step.step)}
                      className="ab-available-btn"
                    >
                      {STEP_NAMES[step.step]}
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
              <p className="empty-title">No funnel data yet</p>
              <p className="empty-subtitle">Events will appear here as visitors move through your funnel.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// A/B Test Winner Component
function ABTestWinner({ variants }: { variants: ABTestMetrics[] }) {
  if (variants.length < 2) return null;

  // Sort by conversion rate to find winner
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

  // Simple confidence calculation
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
