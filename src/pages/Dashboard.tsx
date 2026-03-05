import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DashboardMetrics } from '../types/funnel';
import { fetchCampaignSummaries, fetchAccountLevelInsights, type CampaignSummary, type AccountLevelInsights, type DatePreset, loadOrgMetaCredentials, clearOrgMetaCache } from '../services/metaApi';
import { useAdAccount } from '../contexts/AdAccountContext';
import { getAuthToken } from '../lib/authToken';
import { getScopedItem, setScopedItem } from '../lib/scopedStorage';
import Loading from '../components/Loading';
import SEO from '../components/SEO';
import DateRangePicker from '../components/DateRangePicker';
import DashboardCustomizer from '../components/DashboardCustomizer';
import type { MetricConfig } from '../components/DashboardCustomizer';
import ExportMenu from '../components/ExportMenu';
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
  CreditCard,
  Wallet,
  MousePointerClick,
  Eye,
  Radio,
  Repeat,
  Heart,
  ExternalLink,
  Play,
  UserCheck,
  Package,
} from 'lucide-react';
import OnboardingChecklist from '../components/OnboardingChecklist';
import { useOrganization } from '../contexts/OrganizationContext';
import { getBusinessTypeConfig } from '../lib/businessTypeConfig';
import type { BusinessType } from '../types/organization';
import './Dashboard.css';

// Default transaction fee rate (percentage of revenue)
// Configurable per-user via localStorage — common rates:
// Stripe US: ~2.9%, Stripe international: ~3.9%, Stripe + platform fee: ~6.2%
const DEFAULT_TRANSACTION_FEE_RATE = 0.029; // 2.9%

function loadTransactionFeeRate(): number {
  try {
    const saved = getScopedItem('dashboard_transaction_fee_rate');
    if (saved) {
      const rate = parseFloat(saved);
      if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate;
    }
  } catch { /* fall through */ }
  return DEFAULT_TRANSACTION_FEE_RATE;
}

function saveTransactionFeeRate(rate: number) {
  setScopedItem('dashboard_transaction_fee_rate', rate.toString());
}

// COGS (Cost of Goods Sold) configuration
// Supports two modes: fixed $ per conversion, or % of revenue
interface CogsConfig {
  mode: 'per_unit' | 'percent';
  value: number;
}

const DEFAULT_COGS_CONFIG: CogsConfig = { mode: 'per_unit', value: 0 };

function loadCogsConfig(): CogsConfig {
  try {
    const saved = getScopedItem('dashboard_cogs_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed &&
        (parsed.mode === 'per_unit' || parsed.mode === 'percent') &&
        typeof parsed.value === 'number' &&
        Number.isFinite(parsed.value) &&
        parsed.value >= 0
      ) {
        return parsed;
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_COGS_CONFIG;
}

function saveCogsConfig(config: CogsConfig) {
  setScopedItem('dashboard_cogs_config', JSON.stringify(config));
}

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
  transactionFees: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  // Lead metrics
  leads: number;
  costPerLead: number;
  leadRate: number;
  // Click metrics
  linkClicks: number;
  cpc: number;
  costPerLinkClick: number;
  uniqueLinkClicks: number;
  costPerUniqueLinkClick: number;
  linkCtr: number;
  uniqueLinkCtr: number;
  // Awareness metrics
  impressions: number;
  reach: number;
  cpm: number;
  frequency: number;
  // Engagement metrics
  postEngagements: number;
  cpe: number;
  // Funnel metrics
  landingPageViews: number;
  costPerLandingPageView: number;
  addToCart: number;
  costPerAddToCart: number;
  initiateCheckout: number;
  costPerInitiateCheckout: number;
  // Video metrics
  videoViews: number;
  costPerVideoView: number;
  // Result metrics (objective-based)
  results: number;
  costPerResult: number;
  resultRate: number;
  leadToResultRate: number;
}

// Default metric configuration
const DEFAULT_METRICS: MetricConfig[] = [
  // Core metrics (visible by default)
  { id: 'totalRevenue', label: 'Total Revenue', visible: true },
  { id: 'totalPurchases', label: 'Total Conversions', visible: true },
  { id: 'conversionRate', label: 'Conversion Rate', visible: true },
  { id: 'aov', label: 'Avg. Order Value', visible: true },
  { id: 'uniqueCustomers', label: 'Unique Customers', visible: true },
  { id: 'sessions', label: 'Sessions', visible: false },
  { id: 'adSpend', label: 'Ad Spend', visible: true },
  { id: 'roas', label: 'ROAS', visible: true },
  { id: 'cac', label: 'CPA', visible: true },
  { id: 'transactionFees', label: 'Transaction Fees', visible: true },
  { id: 'cogs', label: 'COGS', visible: true },
  { id: 'grossProfit', label: 'Gross Profit', visible: true },
  { id: 'netProfit', label: 'Net Profit', visible: true },
  // Lead metrics
  { id: 'leads', label: 'Leads', visible: false },
  { id: 'costPerLead', label: 'Cost Per Lead', visible: false },
  { id: 'leadRate', label: 'Lead Rate', visible: false },
  // Click metrics
  { id: 'linkClicks', label: 'Link Clicks', visible: false },
  { id: 'cpc', label: 'CPC (All Clicks)', visible: false },
  { id: 'costPerLinkClick', label: 'Cost Per Link Click', visible: false },
  { id: 'uniqueLinkClicks', label: 'Unique Link Clicks', visible: false },
  { id: 'costPerUniqueLinkClick', label: 'Cost Per Unique Link Click', visible: false },
  { id: 'linkCtr', label: 'Link CTR', visible: false },
  { id: 'uniqueLinkCtr', label: 'Unique Link CTR', visible: false },
  // Awareness metrics
  { id: 'impressions', label: 'Impressions', visible: false },
  { id: 'reach', label: 'Reach', visible: false },
  { id: 'cpm', label: 'CPM', visible: false },
  { id: 'frequency', label: 'Frequency', visible: false },
  // Engagement metrics
  { id: 'postEngagements', label: 'Post Engagements', visible: false },
  { id: 'cpe', label: 'CPE (Cost Per Engagement)', visible: false },
  // Funnel metrics
  { id: 'landingPageViews', label: 'Landing Page Views', visible: false },
  { id: 'costPerLandingPageView', label: 'Cost Per LPV', visible: false },
  { id: 'addToCart', label: 'Add to Cart', visible: false },
  { id: 'costPerAddToCart', label: 'Cost Per Add to Cart', visible: false },
  { id: 'initiateCheckout', label: 'Initiate Checkout', visible: false },
  { id: 'costPerInitiateCheckout', label: 'Cost Per Checkout', visible: false },
  // Video metrics
  { id: 'videoViews', label: 'Video Views (3-sec)', visible: false },
  { id: 'costPerVideoView', label: 'Cost Per Video View', visible: false },
  // Result metrics (objective-based — matches Meta Ads Manager "Results" column)
  { id: 'results', label: 'Results', visible: false },
  { id: 'costPerResult', label: 'Cost Per Result', visible: false },
  { id: 'resultRate', label: 'Result Rate', visible: false },
  { id: 'leadToResultRate', label: 'Lead to Result Rate', visible: false },
];

// Generate default metrics for a given business type
function getDefaultMetricsForBusinessType(businessType: BusinessType): MetricConfig[] {
  const config = getBusinessTypeConfig(businessType);
  return DEFAULT_METRICS.map(metric => ({
    ...metric,
    visible: config.defaultVisibleMetrics.includes(metric.id),
  }));
}

// Get metric label with business-type overrides
function getMetricLabel(metricId: string, businessType: BusinessType): string {
  if (businessType === 'leadgen') {
    const overrides: Record<string, string> = {
      totalPurchases: 'Total Leads',
      conversionRate: 'Lead Rate',
      cac: 'Cost Per Lead',
    };
    if (overrides[metricId]) return overrides[metricId];
  }
  return METRIC_LABELS[metricId] || metricId;
}

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
  transactionFees: <CreditCard size={24} strokeWidth={1.5} />,
  cogs: <Package size={24} strokeWidth={1.5} />,
  grossProfit: <TrendingUp size={24} strokeWidth={1.5} />,
  netProfit: <Wallet size={24} strokeWidth={1.5} />,
  // Lead metrics
  leads: <UserCheck size={24} strokeWidth={1.5} />,
  costPerLead: <DollarSign size={24} strokeWidth={1.5} />,
  leadRate: <BarChart3 size={24} strokeWidth={1.5} />,
  // Click metrics
  linkClicks: <MousePointerClick size={24} strokeWidth={1.5} />,
  cpc: <DollarSign size={24} strokeWidth={1.5} />,
  costPerLinkClick: <DollarSign size={24} strokeWidth={1.5} />,
  uniqueLinkClicks: <MousePointerClick size={24} strokeWidth={1.5} />,
  costPerUniqueLinkClick: <DollarSign size={24} strokeWidth={1.5} />,
  linkCtr: <Crosshair size={24} strokeWidth={1.5} />,
  uniqueLinkCtr: <Crosshair size={24} strokeWidth={1.5} />,
  // Awareness metrics
  impressions: <Eye size={24} strokeWidth={1.5} />,
  reach: <Radio size={24} strokeWidth={1.5} />,
  cpm: <DollarSign size={24} strokeWidth={1.5} />,
  frequency: <Repeat size={24} strokeWidth={1.5} />,
  // Engagement metrics
  postEngagements: <Heart size={24} strokeWidth={1.5} />,
  cpe: <DollarSign size={24} strokeWidth={1.5} />,
  // Funnel metrics
  landingPageViews: <ExternalLink size={24} strokeWidth={1.5} />,
  costPerLandingPageView: <DollarSign size={24} strokeWidth={1.5} />,
  addToCart: <ShoppingCart size={24} strokeWidth={1.5} />,
  costPerAddToCart: <DollarSign size={24} strokeWidth={1.5} />,
  initiateCheckout: <CreditCard size={24} strokeWidth={1.5} />,
  costPerInitiateCheckout: <DollarSign size={24} strokeWidth={1.5} />,
  // Video metrics
  videoViews: <Play size={24} strokeWidth={1.5} />,
  costPerVideoView: <DollarSign size={24} strokeWidth={1.5} />,
  // Result metrics
  results: <Target size={24} strokeWidth={1.5} />,
  costPerResult: <DollarSign size={24} strokeWidth={1.5} />,
  resultRate: <BarChart3 size={24} strokeWidth={1.5} />,
  leadToResultRate: <BarChart3 size={24} strokeWidth={1.5} />,
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
  cac: 'CPA',
  transactionFees: 'Transaction Fees',
  cogs: 'COGS',
  grossProfit: 'Gross Profit',
  netProfit: 'Net Profit',
  leads: 'Leads',
  costPerLead: 'Cost Per Lead',
  leadRate: 'Lead Rate',
  linkClicks: 'Link Clicks',
  cpc: 'CPC (All Clicks)',
  costPerLinkClick: 'Cost Per Link Click',
  uniqueLinkClicks: 'Unique Link Clicks',
  costPerUniqueLinkClick: 'Cost Per Unique Link Click',
  linkCtr: 'Link CTR',
  uniqueLinkCtr: 'Unique Link CTR',
  impressions: 'Impressions',
  reach: 'Reach',
  cpm: 'CPM',
  frequency: 'Frequency',
  postEngagements: 'Post Engagements',
  cpe: 'CPE (Cost Per Engagement)',
  landingPageViews: 'Landing Page Views',
  costPerLandingPageView: 'Cost Per LPV',
  addToCart: 'Add to Cart',
  costPerAddToCart: 'Cost Per Add to Cart',
  initiateCheckout: 'Initiate Checkout',
  costPerInitiateCheckout: 'Cost Per Checkout',
  videoViews: 'Video Views (3-sec)',
  costPerVideoView: 'Cost Per Video View',
  results: 'Results',
  costPerResult: 'Cost Per Result',
  resultRate: 'Result Rate',
  leadToResultRate: 'Lead to Result Rate',
};

// Metric periods - some are dynamic based on date range
const STATIC_PERIODS: Record<string, string> = {
  totalPurchases: 'All purchase events',
  conversionRate: 'LPV to unique purchase',
  aov: 'Revenue ÷ unique customers',
  sessions: 'Unique visitors',
  roas: 'Return on ad spend',
  cac: 'Spend ÷ unique customers',
  transactionFees: 'Payment processing fees',
  cogs: 'Cost of goods sold',
  grossProfit: 'Revenue − COGS',
  netProfit: 'Revenue − all expenses',
  costPerLead: 'Spend ÷ leads',
  leadRate: 'Leads ÷ link clicks',
  cpc: 'Spend ÷ all clicks',
  costPerLinkClick: 'Spend ÷ link clicks',
  costPerUniqueLinkClick: 'Spend ÷ unique link clicks',
  linkCtr: 'Link clicks ÷ impressions',
  uniqueLinkCtr: 'Unique link clicks ÷ reach',
  cpm: 'Cost per 1,000 impressions',
  frequency: 'Impressions ÷ reach',
  cpe: 'Spend ÷ engagements',
  costPerLandingPageView: 'Spend ÷ landing page views',
  costPerAddToCart: 'Spend ÷ add to carts',
  costPerInitiateCheckout: 'Spend ÷ checkouts',
  costPerVideoView: 'Spend ÷ video views',
  costPerResult: 'Spend ÷ results',
  resultRate: 'Results ÷ link clicks',
  leadToResultRate: 'Results ÷ leads',
};

// Metrics that should show the date range (raw counts and totals)
const DATE_RANGE_METRICS = [
  'totalRevenue', 'uniqueCustomers', 'adSpend', 'transactionFees', 'cogs', 'grossProfit', 'netProfit',
  'leads', 'linkClicks', 'uniqueLinkClicks', 'impressions', 'reach',
  'postEngagements', 'landingPageViews', 'addToCart', 'initiateCheckout', 'videoViews',
  'results',
];

// Funnel-only metrics — hidden for non-super-admins (requires Supabase funnel data)
// Only uniqueCustomers and sessions genuinely require funnel tracking;
// AOV and CPA are now derived from Meta API data and available to all users.
const FUNNEL_ONLY_METRICS = ['sessions'];

// Lead-specific metric IDs used for migration detection
const LEAD_METRIC_IDS = ['leads', 'costPerLead', 'leadRate'];

// Load metrics config from localStorage with business-type migration
function loadMetricsConfig(businessType: BusinessType): MetricConfig[] {
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
        // Migration: if businessType is leadgen but no lead metrics are visible,
        // this is a stale e-commerce config — reset to leadgen defaults
        if (businessType === 'leadgen') {
          const hasAnyLeadMetricVisible = merged.some(
            (m: MetricConfig) => LEAD_METRIC_IDS.includes(m.id) && m.visible
          );
          if (!hasAnyLeadMetricVisible) {
            return getDefaultMetricsForBusinessType('leadgen');
          }
        }
        return merged;
      }
    } catch {
      // Fall through to default
    }
  }
  return getDefaultMetricsForBusinessType(businessType);
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
  formatCurrencyPrecise: (value: number) => string;
  formatNumber: (value: number) => string;
  transactionFeeRate?: number;
  onTransactionFeeRateChange?: (rate: number) => void;
  cogsConfig?: CogsConfig;
  onCogsConfigChange?: (config: CogsConfig) => void;
  businessType?: BusinessType;
}

function SortableStatCard({
  id,
  stats,
  dateRangeLabel,
  formatCurrency,
  formatCurrencyPrecise,
  formatNumber,
  transactionFeeRate,
  onTransactionFeeRateChange,
  cogsConfig,
  onCogsConfigChange,
  businessType,
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
    const val = stats[id as keyof DashboardStats] as number;
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
      case 'transactionFees':
        return stats.transactionFees > 0 ? formatCurrency(stats.transactionFees) : '—';
      case 'cogs':
        return formatCurrency(stats.cogs);
      case 'grossProfit':
        return formatCurrency(stats.grossProfit);
      case 'netProfit':
        return formatCurrency(stats.netProfit);
      // Currency metrics (cost-per) — use precise formatter for sub-dollar values
      case 'costPerLead':
      case 'cpc':
      case 'costPerLinkClick':
      case 'costPerUniqueLinkClick':
      case 'cpe':
      case 'costPerLandingPageView':
      case 'costPerAddToCart':
      case 'costPerInitiateCheckout':
      case 'costPerVideoView':
      case 'costPerResult':
      case 'cpm':
        return val > 0 ? formatCurrencyPrecise(val) : '—';
      // Percentage metrics
      case 'leadRate':
      case 'linkCtr':
      case 'uniqueLinkCtr':
      case 'resultRate':
      case 'leadToResultRate':
        return val > 0 ? `${val.toFixed(2)}%` : '—';
      // Frequency — decimal
      case 'frequency':
        return val > 0 ? val.toFixed(2) : '—';
      // Count metrics
      case 'leads':
      case 'linkClicks':
      case 'uniqueLinkClicks':
      case 'impressions':
      case 'reach':
      case 'postEngagements':
      case 'landingPageViews':
      case 'addToCart':
      case 'initiateCheckout':
      case 'videoViews':
      case 'results':
        return formatNumber(val);
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
        <div className="stat-label">{getMetricLabel(id, businessType || 'ecommerce')}</div>
        <div className="stat-value">{formatValue()}</div>
        <div className="stat-period">
          {id === 'transactionFees' && transactionFeeRate !== undefined && onTransactionFeeRateChange ? (
            <span className="fee-rate-editor">
              <input
                type="number"
                className="fee-rate-input"
                value={parseFloat((transactionFeeRate * 100).toFixed(1))}
                min={0}
                max={100}
                step={0.1}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 100) {
                    const rate = val / 100;
                    onTransactionFeeRateChange(rate);
                    saveTransactionFeeRate(rate);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <span>% of revenue</span>
            </span>
          ) : id === 'cogs' && cogsConfig && onCogsConfigChange ? (
            <span className="fee-rate-editor">
              <select
                className="cogs-mode-select"
                value={cogsConfig.mode}
                onChange={(e) => {
                  const newConfig = { ...cogsConfig, mode: e.target.value as 'per_unit' | 'percent' };
                  onCogsConfigChange(newConfig);
                  saveCogsConfig(newConfig);
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="per_unit">$</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number"
                className="fee-rate-input"
                value={cogsConfig.value}
                min={0}
                step={cogsConfig.mode === 'per_unit' ? 1 : 0.1}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0) {
                    const newConfig = { ...cogsConfig, value: val };
                    onCogsConfigChange(newConfig);
                    saveCogsConfig(newConfig);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <span>{cogsConfig.mode === 'per_unit' ? '/unit' : '% rev'}</span>
            </span>
          ) : (
            DATE_RANGE_METRICS.includes(id) ? dateRangeLabel : STATIC_PERIODS[id]
          )}
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
  const { isTrialing, trialDaysRemaining, isSuperAdmin, businessType } = useOrganization();
  const { currentAccount } = useAdAccount();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [metaData, setMetaData] = useState<{
    totalSpend: number;
    totalPurchases: number;
    totalPurchaseValue: number;
    totalClicks: number;
    roas: number;
    totalImpressions: number;
    totalLeads: number;
    totalLinkClicks: number;
    totalPostEngagements: number;
    totalLandingPageViews: number;
    totalAddToCart: number;
    totalInitiateCheckout: number;
    totalVideoViews: number;
    totalResults: number;
  } | null>(null);
  const [accountInsights, setAccountInsights] = useState<AccountLevelInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnelWarning, setFunnelWarning] = useState<string | null>(null);
  const [metaWarning, setMetaWarning] = useState<string | null>(null);
  const [metricsConfig, setMetricsConfig] = useState<MetricConfig[]>(() => loadMetricsConfig(businessType));
  const businessTypeRef = useRef(businessType);

  // Re-run metrics migration when businessType changes (e.g., after async org hydration)
  useEffect(() => {
    if (businessType !== businessTypeRef.current) {
      businessTypeRef.current = businessType;
      setMetricsConfig(loadMetricsConfig(businessType));
    }
  }, [businessType]);

  const [transactionFeeRate, setTransactionFeeRate] = useState(loadTransactionFeeRate);
  const [cogsConfig, setCogsConfig] = useState<CogsConfig>(loadCogsConfig);
  const [searchParams, setSearchParams] = useSearchParams();
  const [metaNotification, setMetaNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Handle OAuth callback redirect (e.g., ?meta_connected=true)
  useEffect(() => {
    const metaConnected = searchParams.get('meta_connected');
    const oauthError = searchParams.get('error');
    const oauthMessage = searchParams.get('message');

    if (metaConnected === 'true') {
      clearOrgMetaCache();
      loadOrgMetaCredentials().then(() => {
        setMetaNotification({
          type: 'success',
          message: 'Meta Ads connected successfully! Please select your ad account, page, and pixel below.',
        });
      });
      setSearchParams({});
    } else if (oauthError) {
      setMetaNotification({
        type: 'error',
        message: oauthMessage || 'Failed to connect Meta Ads. Please try again.',
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

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
        setFunnelWarning(null);
        setMetaWarning(null);

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

        // Fetch funnel metrics and Meta API data independently
        // Each has its own error handling so one failure doesn't block the other
        // Funnel data is only fetched for super admins
        const token = await getAuthToken();

        const funnelPromise: Promise<Response | null> = isSuperAdmin
          ? fetch(`/api/funnel/metrics?startDate=${startDateStr}&endDate=${endDateStr}`, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            }).catch((err) => {
              console.error('Failed to fetch funnel data:', err);
              return null;
            })
          : Promise.resolve(null);

        const metaPromise = fetchCampaignSummaries(metaDateOptions)
          .catch((err) => {
            console.error('Failed to fetch Meta data:', err);
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setMetaWarning(`Meta Ads data unavailable — ${msg}`);
            return [] as CampaignSummary[];
          });

        // Fetch account-level insights for unique-user metrics (reach, unique link clicks)
        // These can't be summed across campaigns without double-counting users
        const accountPromise = fetchAccountLevelInsights(metaDateOptions)
          .catch((err) => {
            console.error('Failed to fetch account-level insights:', err);
            return { reach: 0, uniqueLinkClicks: 0, uniquePurchases: 0 } as AccountLevelInsights;
          });

        const [funnelResponse, campaigns, acctInsights] = await Promise.all([funnelPromise, metaPromise, accountPromise]);

        // Process funnel data (super admin only)
        if (funnelResponse && funnelResponse.ok) {
          const data = await funnelResponse.json();
          setMetrics(data);
        } else if (isSuperAdmin && funnelResponse && !funnelResponse.ok) {
          console.warn('Funnel API returned non-ok status:', funnelResponse.status);
          setFunnelWarning('Funnel data unavailable — some metrics may be incomplete.');
          setMetrics(null);
        } else if (isSuperAdmin) {
          setFunnelWarning('Funnel data unavailable — some metrics may be incomplete.');
          setMetrics(null);
        } else {
          setMetrics(null);
        }

        // Aggregate Meta campaign data
        if (campaigns.length > 0) {
          const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
          const totalPurchases = campaigns.reduce((sum, c) => sum + c.purchases, 0);
          const totalPurchaseValue = campaigns.reduce((sum, c) => sum + c.purchaseValue, 0);
          const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
          const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
          const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
          const totalLeads = campaigns.reduce((sum, c) => sum + c.leads, 0);
          const totalLinkClicks = campaigns.reduce((sum, c) => sum + c.linkClicks, 0);
          const totalPostEngagements = campaigns.reduce((sum, c) => sum + c.postEngagements, 0);
          const totalLandingPageViews = campaigns.reduce((sum, c) => sum + c.landingPageViews, 0);
          const totalAddToCart = campaigns.reduce((sum, c) => sum + c.addToCart, 0);
          const totalInitiateCheckout = campaigns.reduce((sum, c) => sum + c.initiateCheckout, 0);
          const totalVideoViews = campaigns.reduce((sum, c) => sum + c.videoViews, 0);
          const totalResults = campaigns.reduce((sum, c) => sum + c.results, 0);

          setMetaData({
            totalSpend,
            totalPurchases,
            totalPurchaseValue,
            totalClicks,
            roas,
            totalImpressions,
            totalLeads,
            totalLinkClicks,
            totalPostEngagements,
            totalLandingPageViews,
            totalAddToCart,
            totalInitiateCheckout,
            totalVideoViews,
            totalResults,
          });
        } else {
          setMetaData(null);
        }

        // Account-level unique-user metrics (reach, unique link clicks)
        // Fetched separately at account level to avoid double-counting across campaigns
        setAccountInsights(acctInsights);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [dateRange, currentAccount?.ad_account_id]);

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

  // Calculate stats from Meta API data (primary source for all users)
  //
  // Data source strategy:
  // ALL core metrics derive from Meta API so they work for any ad account:
  // - Ad Spend, ROAS, Revenue, Conversions, AOV, CPA, Conversion Rate
  // Funnel-only metrics (Unique Customers, Sessions) require Supabase funnel
  // tracking and are only shown to super admins who have that data configured.

  const adSpend = metaData?.totalSpend || 0;

  // Core ad attribution metrics — all from Meta API
  const totalPurchases = metaData?.totalPurchases || 0;
  const totalRevenue = metaData?.totalPurchaseValue || 0;
  const totalClicks = metaData?.totalClicks || 0;

  // Purchasers from account-level actions (deduplicated across campaigns).
  // Fetched at account level rather than summed per-campaign to avoid inflating
  // counts when the same purchase is attributed to multiple campaigns.
  // Note: this is total purchases, not unique people — Meta doesn't support
  // unique_actions for conversion types. Multiple purchases by one person count separately.
  const uniquePurchases = accountInsights?.uniquePurchases || 0;

  // AOV: Revenue per unique customer (total revenue includes upsells)
  const aov = uniquePurchases > 0 ? totalRevenue / uniquePurchases : 0;

  // CPA: Cost per unique customer acquired
  const cac = uniquePurchases > 0 && adSpend > 0 ? adSpend / uniquePurchases : 0;

  // Conversion Rate: % of landing page viewers who became unique customers.
  // Uses Landing Page Views (not link clicks) — LPV only fires after the page
  // actually loads and the Meta pixel initializes, filtering out accidental taps and bot clicks.
  const totalLPV = metaData?.totalLandingPageViews || 0;
  const conversionRate = totalLPV > 0 && uniquePurchases > 0
    ? (uniquePurchases / totalLPV) * 100
    : 0;

  // Unique Customers: from Meta unique_actions (works for all users, not just funnel-tracked)
  const uniqueCustomers = uniquePurchases;

  // Transaction fees: configurable rate (default 2.9%)
  const transactionFees = totalRevenue * transactionFeeRate;

  // COGS: configurable — either $ per conversion or % of revenue
  const cogs = cogsConfig.mode === 'per_unit'
    ? cogsConfig.value * totalPurchases
    : totalRevenue * (cogsConfig.value / 100);

  // Gross Profit: Revenue − COGS (standard accounting)
  const grossProfit = totalRevenue - cogs;

  // Net Profit: Revenue − COGS − Ad Spend − Transaction Fees
  const netProfit = totalRevenue - cogs - adSpend - transactionFees;

  // Extended Facebook Ads metrics — raw counts from Meta API
  const totalImpressions = metaData?.totalImpressions || 0;
  const totalLeads = metaData?.totalLeads || 0;
  const totalLinkClicks = metaData?.totalLinkClicks || 0;
  // Reach and unique link clicks use account-level data (not campaign sums)
  // to avoid double-counting users who appear in multiple campaigns
  const totalReach = accountInsights?.reach || 0;
  const totalUniqueLinkClicks = accountInsights?.uniqueLinkClicks || 0;
  const totalPostEngagements = metaData?.totalPostEngagements || 0;
  const totalLandingPageViews = metaData?.totalLandingPageViews || 0;
  const totalAddToCart = metaData?.totalAddToCart || 0;
  const totalInitiateCheckout = metaData?.totalInitiateCheckout || 0;
  const totalVideoViews = metaData?.totalVideoViews || 0;

  // Derived Facebook Ads metrics
  const costPerLead = totalLeads > 0 && adSpend > 0 ? adSpend / totalLeads : 0;
  const leadRate = totalLinkClicks > 0 && totalLeads > 0 ? (totalLeads / totalLinkClicks) * 100 : 0;
  const cpcAll = totalClicks > 0 && adSpend > 0 ? adSpend / totalClicks : 0;
  const costPerLinkClick = totalLinkClicks > 0 && adSpend > 0 ? adSpend / totalLinkClicks : 0;
  const costPerUniqueLinkClick = totalUniqueLinkClicks > 0 && adSpend > 0 ? adSpend / totalUniqueLinkClicks : 0;
  const linkCtr = totalImpressions > 0 && totalLinkClicks > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;
  // Unique Link CTR: unique link clicks / reach (not impressions)
  // Meta defines this as unique clickers / unique people reached
  const uniqueLinkCtr = totalReach > 0 && totalUniqueLinkClicks > 0 ? (totalUniqueLinkClicks / totalReach) * 100 : 0;
  const cpmVal = totalImpressions > 0 && adSpend > 0 ? (adSpend / totalImpressions) * 1000 : 0;
  const frequencyVal = totalReach > 0 && totalImpressions > 0 ? totalImpressions / totalReach : 0;
  const cpeVal = totalPostEngagements > 0 && adSpend > 0 ? adSpend / totalPostEngagements : 0;
  const costPerLandingPageView = totalLandingPageViews > 0 && adSpend > 0 ? adSpend / totalLandingPageViews : 0;
  const costPerAddToCartVal = totalAddToCart > 0 && adSpend > 0 ? adSpend / totalAddToCart : 0;
  const costPerInitiateCheckoutVal = totalInitiateCheckout > 0 && adSpend > 0 ? adSpend / totalInitiateCheckout : 0;
  const costPerVideoViewVal = totalVideoViews > 0 && adSpend > 0 ? adSpend / totalVideoViews : 0;

  // Result metrics (objective-based — matches Meta Ads Manager "Results" column)
  const totalResults = metaData?.totalResults || 0;
  const costPerResult = totalResults > 0 && adSpend > 0 ? adSpend / totalResults : 0;
  const resultRate = totalLinkClicks > 0 && totalResults > 0 ? (totalResults / totalLinkClicks) * 100 : 0;
  const leadToResultRate = totalLeads > 0 && totalResults > 0 ? (totalResults / totalLeads) * 100 : 0;

  const stats: DashboardStats = {
    totalRevenue,
    totalPurchases,
    conversionRate,
    aov,
    uniqueCustomers,
    sessions: metrics?.summary.sessions || 0,
    adSpend,
    roas: metaData?.roas || 0,
    cac,
    transactionFees,
    cogs,
    grossProfit,
    netProfit,
    // Extended Facebook Ads metrics
    leads: totalLeads,
    costPerLead,
    leadRate,
    linkClicks: totalLinkClicks,
    cpc: cpcAll,
    costPerLinkClick,
    uniqueLinkClicks: totalUniqueLinkClicks,
    costPerUniqueLinkClick,
    linkCtr,
    uniqueLinkCtr,
    impressions: totalImpressions,
    reach: totalReach,
    cpm: cpmVal,
    frequency: frequencyVal,
    postEngagements: totalPostEngagements,
    cpe: cpeVal,
    landingPageViews: totalLandingPageViews,
    costPerLandingPageView,
    addToCart: totalAddToCart,
    costPerAddToCart: costPerAddToCartVal,
    initiateCheckout: totalInitiateCheckout,
    costPerInitiateCheckout: costPerInitiateCheckoutVal,
    videoViews: totalVideoViews,
    costPerVideoView: costPerVideoViewVal,
    // Result metrics
    results: totalResults,
    costPerResult,
    resultRate,
    leadToResultRate,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Precise currency for cost-per metrics where values are often < $1
  const formatCurrencyPrecise = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

  // Funnel-only metrics are hidden for non-super-admins
  const visibleMetrics = metricsConfig.filter((m) =>
    m.visible && (isSuperAdmin || !FUNNEL_ONLY_METRICS.includes(m.id))
  );

  return (
    <div className="dashboard-page">
      <SEO
        title="Dashboard"
        description="Your ConversionIQ™ dashboard - view ad performance, conversion insights, and AI-generated creative recommendations."
        canonical="/dashboard"
        noindex={true}
      />
      <OnboardingChecklist
        notification={metaNotification}
        onDismissNotification={() => setMetaNotification(null)}
      />

      {isTrialing && trialDaysRemaining > 0 && (
        <div className="early-bird-card glass">
          <div className="early-bird-card-content">
            <Sparkles size={18} strokeWidth={1.5} className="early-bird-card-icon" />
            <span className="early-bird-card-text">
              <strong>Early Bird Offer:</strong> Subscribe before your trial ends and save 10% on Starter
              <span className="early-bird-card-days"> — {trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'} left</span>
            </span>
            <Link to="/billing" className="early-bird-card-cta">View Plans</Link>
          </div>
        </div>
      )}

      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Your ad performance at a glance{currentAccount?.ad_account_name ? ` · ${currentAccount.ad_account_name}` : ''}
          </p>
        </div>
        <div className="dashboard-header-right">
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
          />
          <ExportMenu
            stats={stats as unknown as Record<string, number>}
            visibleMetrics={visibleMetrics.map((m) => ({ id: m.id, label: getMetricLabel(m.id, businessType) }))}
            dateRangeLabel={dateRangeLabel}
            accountName={currentAccount?.ad_account_name || undefined}
          />
          <DashboardCustomizer
            metrics={isSuperAdmin ? metricsConfig : metricsConfig.filter((m) => !FUNNEL_ONLY_METRICS.includes(m.id))}
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

      {funnelWarning && !error && (
        <div className="dashboard-error" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#d97706' }}>
          <span className="error-icon">⚠</span>
          {funnelWarning}
        </div>
      )}

      {metaWarning && !error && (
        <div className="dashboard-error" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#d97706' }}>
          <span className="error-icon">⚠</span>
          {metaWarning}
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
                    formatCurrencyPrecise={formatCurrencyPrecise}
                    formatNumber={formatNumber}
                    transactionFeeRate={transactionFeeRate}
                    onTransactionFeeRateChange={setTransactionFeeRate}
                    cogsConfig={cogsConfig}
                    onCogsConfigChange={setCogsConfig}
                    businessType={businessType}
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
