import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardMetrics } from '../types/funnel';
import Loading from '../components/Loading';
import DashboardCustomizer from '../components/DashboardCustomizer';
import type { MetricConfig } from '../components/DashboardCustomizer';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DollarSign,
  TrendingUp,
  Target,
  ShoppingCart,
  Banknote,
  BarChart3,
  Smartphone,
  Search,
  Music,
  Sparkles,
  LineChart,
  Crosshair,
  Users,
  Activity,
  Calculator,
} from 'lucide-react';
import './Dashboard.css';

interface DashboardStats {
  totalRevenue: number;
  totalPurchases: number;
  conversionRate: number;
  aov: number;
  uniqueCustomers: number;
  sessions: number;
  adSpend: number;
  roas: number;
  cac: number;
}

// Default metric configuration
const DEFAULT_METRICS: MetricConfig[] = [
  { id: 'totalRevenue', label: 'Total Revenue', visible: true },
  { id: 'totalPurchases', label: 'Total Conversions', visible: true },
  { id: 'conversionRate', label: 'Conversion Rate', visible: true },
  { id: 'aov', label: 'Avg. Order Value', visible: true },
  { id: 'uniqueCustomers', label: 'Unique Customers', visible: true },
  { id: 'sessions', label: 'Sessions', visible: false },
  { id: 'adSpend', label: 'Ad Spend', visible: true },
  { id: 'roas', label: 'ROAS', visible: true },
  { id: 'cac', label: 'CAC', visible: false },
];

const METRIC_ICONS: Record<string, ReactNode> = {
  totalRevenue: <TrendingUp size={24} strokeWidth={1.5} />,
  totalPurchases: <ShoppingCart size={24} strokeWidth={1.5} />,
  conversionRate: <BarChart3 size={24} strokeWidth={1.5} />,
  aov: <Banknote size={24} strokeWidth={1.5} />,
  uniqueCustomers: <Users size={24} strokeWidth={1.5} />,
  sessions: <Activity size={24} strokeWidth={1.5} />,
  adSpend: <DollarSign size={24} strokeWidth={1.5} />,
  roas: <Target size={24} strokeWidth={1.5} />,
  cac: <Calculator size={24} strokeWidth={1.5} />,
};

const METRIC_LABELS: Record<string, string> = {
  totalRevenue: 'Total Revenue',
  totalPurchases: 'Total Conversions',
  conversionRate: 'Conversion Rate',
  aov: 'Avg. Order Value',
  uniqueCustomers: 'Unique Customers',
  sessions: 'Sessions',
  adSpend: 'Ad Spend',
  roas: 'ROAS',
  cac: 'CAC',
};

const METRIC_PERIODS: Record<string, string> = {
  totalRevenue: 'Last 30 days',
  totalPurchases: 'Purchases',
  conversionRate: 'Sessions to purchase',
  aov: 'Per customer',
  uniqueCustomers: 'Last 30 days',
  sessions: 'Unique visitors',
  adSpend: 'Enter your ad spend',
  roas: 'Return on ad spend',
  cac: 'Cost per customer',
};

// Load metrics config from localStorage
function loadMetricsConfig(): MetricConfig[] {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('dashboard_metrics_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure any new metrics are included
        const existingIds = new Set(parsed.map((m: MetricConfig) => m.id));
        const merged = [...parsed];
        for (const defaultMetric of DEFAULT_METRICS) {
          if (!existingIds.has(defaultMetric.id)) {
            merged.push(defaultMetric);
          }
        }
        return merged;
      }
    } catch {
      // Fall through to default
    }
  }
  return DEFAULT_METRICS;
}

// Save metrics config to localStorage
function saveMetricsConfig(metrics: MetricConfig[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('dashboard_metrics_config', JSON.stringify(metrics));
  }
}

interface SortableStatCardProps {
  id: string;
  stats: DashboardStats;
  adSpend: number;
  onAdSpendChange: (value: number) => void;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
}

function SortableStatCard({
  id,
  stats,
  adSpend,
  onAdSpendChange,
  formatCurrency,
  formatNumber,
}: SortableStatCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  // Format value based on metric type
  const formatValue = () => {
    switch (id) {
      case 'totalRevenue':
        return formatCurrency(stats.totalRevenue);
      case 'totalPurchases':
        return formatNumber(stats.totalPurchases);
      case 'conversionRate':
        return `${stats.conversionRate.toFixed(2)}%`;
      case 'aov':
        return formatCurrency(stats.aov);
      case 'uniqueCustomers':
        return formatNumber(stats.uniqueCustomers);
      case 'sessions':
        return formatNumber(stats.sessions);
      case 'roas':
        return stats.roas > 0 ? `${stats.roas.toFixed(2)}x` : '—';
      case 'cac':
        return stats.cac > 0 ? formatCurrency(stats.cac) : '—';
      default:
        return '—';
    }
  };

  // Special handling for editable ad spend
  if (id === 'adSpend') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="stat-card stat-card-editable stat-card-sortable"
        {...attributes}
        {...listeners}
      >
        <div className="stat-icon">{METRIC_ICONS[id]}</div>
        <div className="stat-content">
          <div className="stat-label">{METRIC_LABELS[id]}</div>
          <div className="stat-input-wrapper">
            <span className="stat-input-prefix">$</span>
            <input
              type="number"
              value={adSpend || ''}
              onChange={(e) => {
                e.stopPropagation();
                onAdSpendChange(Number(e.target.value));
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="0"
              className="stat-input"
            />
          </div>
          <div className="stat-period">{METRIC_PERIODS[id]}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="stat-card stat-card-sortable"
      {...attributes}
      {...listeners}
    >
      <div className="stat-icon">{METRIC_ICONS[id]}</div>
      <div className="stat-content">
        <div className="stat-label">{METRIC_LABELS[id]}</div>
        <div className="stat-value">{formatValue()}</div>
        <div className="stat-period">{METRIC_PERIODS[id]}</div>
      </div>
    </div>
  );
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adSpend, setAdSpend] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dashboard_ad_spend');
      return saved ? parseFloat(saved) : 0;
    }
    return 0;
  });
  const [metricsConfig, setMetricsConfig] = useState<MetricConfig[]>(loadMetricsConfig);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const endDate = new Date().toISOString();
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const response = await fetch(`/api/funnel/metrics?startDate=${startDate}&endDate=${endDate}`);
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Handle ad spend change with localStorage persistence
  const handleAdSpendChange = (value: number) => {
    setAdSpend(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard_ad_spend', value.toString());
    }
  };

  // Handle metrics config change
  const handleMetricsConfigChange = (newConfig: MetricConfig[]) => {
    setMetricsConfig(newConfig);
    saveMetricsConfig(newConfig);
  };

  // Handle drag end for stat cards
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const visibleMetrics = metricsConfig.filter((m) => m.visible);
      const oldIndex = visibleMetrics.findIndex((m) => m.id === active.id);
      const newIndex = visibleMetrics.findIndex((m) => m.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder only visible metrics
        const reorderedVisible = arrayMove(visibleMetrics, oldIndex, newIndex);

        // Rebuild full config with hidden metrics at end
        const hiddenMetrics = metricsConfig.filter((m) => !m.visible);
        const newConfig = [...reorderedVisible, ...hiddenMetrics];
        setMetricsConfig(newConfig);
        saveMetricsConfig(newConfig);
      }
    }
  };

  // Calculate stats from funnel metrics
  const stats: DashboardStats = {
    totalRevenue: metrics?.summary.totalRevenue || 0,
    totalPurchases: metrics?.summary.purchases || 0,
    conversionRate: metrics?.summary.conversionRate || 0,
    aov: metrics?.summary.aovPerCustomer || 0,
    uniqueCustomers: metrics?.summary.uniqueCustomers || 0,
    sessions: metrics?.summary.sessions || 0,
    adSpend: adSpend,
    roas: adSpend > 0 && metrics ? metrics.summary.totalRevenue / adSpend : 0,
    cac: metrics?.summary.uniqueCustomers && adSpend > 0 ? adSpend / metrics.summary.uniqueCustomers : 0,
  };

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

  // Get visible metrics for rendering
  const visibleMetrics = metricsConfig.filter((m) => m.visible);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">Your ad performance at a glance</p>
        </div>
        <div className="dashboard-header-right">
          <DashboardCustomizer
            metrics={metricsConfig}
            onMetricsChange={handleMetricsConfigChange}
          />
        </div>
      </div>

      {error && (
        <div className="dashboard-error">
          <span className="error-icon">⚠</span>
          {error}
        </div>
      )}

      {loading ? (
        <Loading size="large" message="ConversionIQ™ extracting insights..." />
      ) : (
        <>
          {/* Stats Grid - Sortable */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleMetrics.map((m) => m.id)}
              strategy={rectSortingStrategy}
            >
              <div className="stats-grid">
                {visibleMetrics.map((metric) => (
                  <SortableStatCard
                    key={metric.id}
                    id={metric.id}
                    stats={stats}
                    adSpend={adSpend}
                    onAdSpendChange={handleAdSpendChange}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Channel Breakdown */}
          <div className="section-header">
            <h2 className="section-title">Channels</h2>
            <p className="section-subtitle">Performance by acquisition channel</p>
          </div>

          <div className="channel-breakdown">
            <Link to="/channels/meta-ads" className="channel-card-dashboard active">
              <div className="channel-card-header-dashboard">
                <div className="channel-info">
                  <span className="channel-icon-dashboard">
                    <Smartphone size={24} strokeWidth={1.5} />
                  </span>
                  <div>
                    <h3 className="channel-name-dashboard">Meta Ads</h3>
                    <span className="channel-status connected">Connected</span>
                  </div>
                </div>
                <span className="channel-arrow-dashboard">›</span>
              </div>
              <div className="channel-metrics">
                <div className="channel-metric">
                  <span className="channel-metric-value">{formatCurrency(stats.totalRevenue)}</span>
                  <span className="channel-metric-label">Revenue</span>
                </div>
                <div className="channel-metric">
                  <span className="channel-metric-value">{formatNumber(stats.totalPurchases)}</span>
                  <span className="channel-metric-label">Conversions</span>
                </div>
                <div className="channel-metric">
                  <span className="channel-metric-value">{stats.roas > 0 ? `${stats.roas.toFixed(2)}x` : '—'}</span>
                  <span className="channel-metric-label">ROAS</span>
                </div>
              </div>
            </Link>

            <div className="channel-card-dashboard disabled">
              <div className="channel-card-header-dashboard">
                <div className="channel-info">
                  <span className="channel-icon-dashboard">
                    <Search size={24} strokeWidth={1.5} />
                  </span>
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
                  <span className="channel-icon-dashboard">
                    <Music size={24} strokeWidth={1.5} />
                  </span>
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
              <span className="quick-action-icon">
                <Sparkles size={24} strokeWidth={1.5} />
              </span>
              <div className="quick-action-content">
                <h3 className="quick-action-title">Generate New Ads</h3>
                <p className="quick-action-description">Create AI-powered ad creatives from your top performers</p>
              </div>
              <span className="quick-action-arrow">›</span>
            </Link>

            <Link to="/insights" className="quick-action-card">
              <span className="quick-action-icon">
                <LineChart size={24} strokeWidth={1.5} />
              </span>
              <div className="quick-action-content">
                <h3 className="quick-action-title">View Insights</h3>
                <p className="quick-action-description">AI analysis of your creative performance patterns</p>
              </div>
              <span className="quick-action-arrow">›</span>
            </Link>

            <Link to="/channels/meta-ads" className="quick-action-card">
              <span className="quick-action-icon">
                <Crosshair size={24} strokeWidth={1.5} />
              </span>
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
