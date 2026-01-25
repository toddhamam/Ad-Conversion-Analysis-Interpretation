import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchCampaignSummaries } from '../services/metaApi';
import type { CampaignSummary } from '../services/metaApi';
import './Dashboard.css';

interface AggregatedStats {
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  overallRoas: number;
  averageCpa: number;
  averageCvr: number;
}

const Dashboard = () => {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await fetchCampaignSummaries({ datePreset: 'last_30d' });
        setCampaigns(data);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Calculate aggregated stats
  const stats: AggregatedStats = campaigns.reduce(
    (acc, campaign) => {
      acc.totalSpend += campaign.spend;
      acc.totalRevenue += campaign.purchaseValue;
      acc.totalPurchases += campaign.purchases;
      return acc;
    },
    { totalSpend: 0, totalRevenue: 0, totalPurchases: 0, overallRoas: 0, averageCpa: 0, averageCvr: 0 }
  );

  // Calculate derived metrics
  stats.overallRoas = stats.totalSpend > 0 ? stats.totalRevenue / stats.totalSpend : 0;
  stats.averageCpa = stats.totalPurchases > 0 ? stats.totalSpend / stats.totalPurchases : 0;

  // Calculate CVR from total clicks
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
  stats.averageCvr = totalClicks > 0 ? (stats.totalPurchases / totalClicks) * 100 : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">Your ad performance at a glance</p>
      </div>

      {error && (
        <div className="dashboard-error">
          <span className="error-icon">⚠</span>
          {error}
        </div>
      )}

      {loading ? (
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading performance data...</p>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Spend</div>
            <div className="stat-value">{formatCurrency(stats.totalSpend)}</div>
            <div className="stat-period">Last 30 days</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value revenue">{formatCurrency(stats.totalRevenue)}</div>
            <div className="stat-period">Last 30 days</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Overall ROAS</div>
            <div className="stat-value roas">{stats.overallRoas.toFixed(2)}x</div>
            <div className="stat-period">Return on ad spend</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Conversions</div>
            <div className="stat-value">{formatNumber(stats.totalPurchases)}</div>
            <div className="stat-period">Purchases</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Avg. CPA</div>
            <div className="stat-value">{formatCurrency(stats.averageCpa)}</div>
            <div className="stat-period">Cost per acquisition</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Avg. CVR</div>
            <div className="stat-value">{stats.averageCvr.toFixed(2)}%</div>
            <div className="stat-period">Conversion rate</div>
          </div>
          </div>

          {/* Channel Breakdown */}
          <div className="section-header">
            <h2 className="section-title">Channels</h2>
            <p className="section-subtitle">Performance by acquisition channel</p>
          </div>

          <div className="channel-breakdown">
            <Link to="/channels/meta-ads" className="channel-card-dashboard active">
              <div className="channel-card-header-dashboard">
                <div className="channel-info">
                  <span className="channel-icon-dashboard">📱</span>
                  <div>
                    <h3 className="channel-name-dashboard">Meta Ads</h3>
                    <span className="channel-status connected">Connected</span>
                  </div>
                </div>
                <span className="channel-arrow-dashboard">›</span>
              </div>
              <div className="channel-metrics">
                <div className="channel-metric">
                  <span className="channel-metric-value">{formatCurrency(stats.totalSpend)}</span>
                  <span className="channel-metric-label">Spend</span>
                </div>
                <div className="channel-metric">
                  <span className="channel-metric-value">{formatNumber(stats.totalPurchases)}</span>
                  <span className="channel-metric-label">Conversions</span>
                </div>
                <div className="channel-metric">
                  <span className="channel-metric-value roas">{stats.overallRoas.toFixed(2)}x</span>
                  <span className="channel-metric-label">ROAS</span>
                </div>
              </div>
            </Link>

            <div className="channel-card-dashboard disabled">
              <div className="channel-card-header-dashboard">
                <div className="channel-info">
                  <span className="channel-icon-dashboard">🔍</span>
                  <div>
                    <h3 className="channel-name-dashboard">Google Ads</h3>
                    <span className="channel-status coming-soon">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="channel-card-dashboard disabled">
              <div className="channel-card-header-dashboard">
                <div className="channel-info">
                  <span className="channel-icon-dashboard">🎵</span>
                  <div>
                    <h3 className="channel-name-dashboard">TikTok Ads</h3>
                    <span className="channel-status coming-soon">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="section-header">
            <h2 className="section-title">Quick Actions</h2>
            <p className="section-subtitle">Common tasks and workflows</p>
          </div>

          <div className="quick-actions">
            <Link to="/creatives" className="quick-action-card">
              <span className="quick-action-icon">✨</span>
              <div className="quick-action-content">
                <h3 className="quick-action-title">Generate New Ads</h3>
                <p className="quick-action-description">Create AI-powered ad creatives from your top performers</p>
              </div>
              <span className="quick-action-arrow">›</span>
            </Link>

            <Link to="/insights" className="quick-action-card">
              <span className="quick-action-icon">📈</span>
              <div className="quick-action-content">
                <h3 className="quick-action-title">View Insights</h3>
                <p className="quick-action-description">AI analysis of your creative performance patterns</p>
              </div>
              <span className="quick-action-arrow">›</span>
            </Link>

            <Link to="/channels/meta-ads" className="quick-action-card">
              <span className="quick-action-icon">🎯</span>
              <div className="quick-action-content">
                <h3 className="quick-action-title">Analyze Creatives</h3>
                <p className="quick-action-description">Deep dive into individual ad performance</p>
              </div>
              <span className="quick-action-arrow">›</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
