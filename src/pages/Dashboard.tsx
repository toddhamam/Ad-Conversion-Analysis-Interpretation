import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardMetrics } from '../types/funnel';
import { fetchCampaignSummaries, type CampaignSummary, type DatePreset } from '../services/metaApi';
import Loading from '../components/Loading';
import DateRangePicker from '../components/DateRangePicker';
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

// Metric periods - some are dynamic based on date range
const STATIC_PERIODS: Record<string, string> = {
  totalPurchases: 'Purchases',
  conversionRate: 'Sessions to purchase',
  aov: 'Per customer',
  sessions: 'Unique visitors',
  roas: 'Return on ad spend',
  cac: 'Cost per customer',
};

// Metrics that should show the date range
const DATE_RANGE_METRICS = ['totalRevenue', 'uniqueCustomers', 'adSpend'];

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
  dateRangeLabel: string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
}

function SortableStatCard({
  id,
  stats,
  dateRangeLabel,
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
      case 'adSpend':
        return stats.adSpend > 0 ? formatCurrency(stats.adSpend) : '—';
      case 'roas':
        return stats.roas > 0 ? `${stats.roas.toFixed(2)}x` : '—';
      case 'cac':
        return stats.cac > 0 ? formatCurrency(stats.cac) : '—';
      default:
        return '—';
    }
  };

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
        <div className="stat-period">
          {DATE_RANGE_METRICS.includes(id) ? dateRangeLabel : STATIC_PERIODS[id]}
        </div>
      </div>
    </div>
  );
}

// Helper to calculate dates from preset
function getPresetDates(preset: DatePreset): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  let startDate = new Date(today);

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

// Format date for API (YYYY-MM-DD)
function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metaData, setMetaData] = useState<{
    totalSpend: number;
    totalPurchases: number;
    totalPurchaseValue: number;
    roas: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsConfig, setMetricsConfig] = useState<MetricConfig[]>(loadMetricsConfig);

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

        // Build date parameters
        const startDateStr = dateRange.startDate.toISOString();
        const endDateStr = dateRange.endDate.toISOString();

        // Build Meta API date options
        const metaDateOptions = dateRange.preset
          ? { datePreset: dateRange.preset }
          : {
              timeRange: {
                since: formatDateForApi(dateRange.startDate),
                until: formatDateForApi(dateRange.endDate),
              },
            };

        // Fetch both funnel metrics and Meta API data in parallel
        const [funnelResponse, campaigns] = await Promise.all([
          fetch(`/api/funnel/metrics?startDate=${startDateStr}&endDate=${endDateStr}`),
          fetchCampaignSummaries(metaDateOptions).catch((err) => {
            console.error('Failed to fetch Meta data:', err);
            return [] as CampaignSummary[];
          }),
        ]);

        // Process funnel data
        if (funnelResponse.ok) {
          const data = await funnelResponse.json();
          setMetrics(data);
        }

        // Aggregate Meta campaign data
        if (campaigns.length > 0) {
          const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
          const totalPurchases = campaigns.reduce((sum, c) => sum + c.purchases, 0);
          const totalPurchaseValue = campaigns.reduce((sum, c) => sum + c.purchaseValue, 0);
          const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

          setMetaData({
            totalSpend,
            totalPurchases,
            totalPurchaseValue,
            roas,
          });
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [dateRange]);

  // Handle date range change
  const handleDateRangeChange = (newDateRange: { preset?: DatePreset; startDate: Date; endDate: Date }) => {
    setDateRange(newDateRange);
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

  // Calculate stats from funnel metrics and Meta API data
  // Use Meta API data for ad spend, ROAS, and purchases when available
  const adSpend = metaData?.totalSpend || 0;
  const stats: DashboardStats = {
    totalRevenue: metaData?.totalPurchaseValue || metrics?.summary.totalRevenue || 0,
    totalPurchases: metaData?.totalPurchases || metrics?.summary.purchases || 0,
    conversionRate: metrics?.summary.conversionRate || 0,
    aov: metrics?.summary.aovPerCustomer || 0,
    uniqueCustomers: metrics?.summary.uniqueCustomers || 0,
    sessions: metrics?.summary.sessions || 0,
    adSpend: adSpend,
    roas: metaData?.roas || 0,
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

  // Get date range label for display
  const getDateRangeLabel = () => {
    if (dateRange.preset) {
      const presetLabels: Record<DatePreset, string> = {
        today: 'Today',
        yesterday: 'Yesterday',
        last_7d: 'Last 7 days',
        last_14d: 'Last 14 days',
        last_28d: 'Last 28 days',
        last_30d: 'Last 30 days',
        this_week: 'This week',
        last_week: 'Last week',
        this_month: 'This month',
        last_month: 'Last month',
        maximum: 'All time',
      };
      return presetLabels[dateRange.preset];
    }
    // Custom date range
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const start = dateRange.startDate.toLocaleDateString('en-US', options);
    const end = dateRange.endDate.toLocaleDateString('en-US', options);
    return `${start} - ${end}`;
  };

  const dateRangeLabel = getDateRangeLabel();

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
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
          />
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
                    dateRangeLabel={dateRangeLabel}
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
