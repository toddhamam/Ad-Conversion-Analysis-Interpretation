import { useState } from 'react';
import type { CampaignTypeMetrics, CampaignType } from '../services/metaApi';
import type { BusinessType } from '../types/organization';
import { getBusinessTypeConfig } from '../lib/businessTypeConfig';
import { Target, RefreshCw, Gem, BarChart3, type LucideIcon } from 'lucide-react';
import './CampaignTypeDashboard.css';

interface CampaignTypeDashboardProps {
  metrics: CampaignTypeMetrics[];
  loading?: boolean;
  businessType?: BusinessType;
}

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, { label: string; Icon: LucideIcon; color: string }> = {
  Prospecting: { label: 'Prospecting', Icon: Target, color: '#00d4ff' },
  Retargeting: { label: 'Retargeting', Icon: RefreshCw, color: '#a855f7' },
  Retention: { label: 'Retention', Icon: Gem, color: '#10b981' },
  Other: { label: 'Other', Icon: BarChart3, color: '#f59e0b' },
};

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
}

function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export default function CampaignTypeDashboard({ metrics, loading, businessType }: CampaignTypeDashboardProps) {
  const [selectedType, setSelectedType] = useState<CampaignType | 'all'>('all');
  const btConfig = getBusinessTypeConfig(businessType || 'ecommerce');
  const isLeadgen = businessType === 'leadgen';
  const isHybrid = businessType === 'hybrid';

  // Filter metrics based on selection
  const filteredMetrics = selectedType === 'all'
    ? metrics.filter(m => m.campaignCount > 0)
    : metrics.filter(m => m.campaignType === selectedType);

  // Calculate totals for "all" view
  const totals = metrics.reduce(
    (acc, m) => ({
      totalSpend: acc.totalSpend + m.totalSpend,
      totalPurchases: acc.totalPurchases + m.totalPurchases,
      totalPurchaseValue: acc.totalPurchaseValue + m.totalPurchaseValue,
      totalClicks: acc.totalClicks + m.totalClicks,
      totalConversions: acc.totalConversions + (m.totalConversions || 0),
    }),
    { totalSpend: 0, totalPurchases: 0, totalPurchaseValue: 0, totalClicks: 0, totalConversions: 0 }
  );

  const displayConversions = isLeadgen ? totals.totalConversions : isHybrid ? totals.totalConversions : totals.totalPurchases;
  const totalRoas = totals.totalSpend > 0 ? totals.totalPurchaseValue / totals.totalSpend : 0;
  const totalCpp = displayConversions > 0 ? totals.totalSpend / displayConversions : 0;
  const totalCr = totals.totalClicks > 0 ? (displayConversions / totals.totalClicks) * 100 : 0;
  const totalAov = totals.totalPurchases > 0 ? totals.totalPurchaseValue / totals.totalPurchases : 0;

  if (loading) {
    return (
      <div className="campaign-dashboard loading">
        <div className="dashboard-skeleton">Loading campaign metrics...</div>
      </div>
    );
  }

  return (
    <div className="campaign-dashboard">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Campaign Performance by Type</h2>
        <div className="type-selector">
          <button
            className={`type-button ${selectedType === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedType('all')}
          >
            All Types
          </button>
          {(['Prospecting', 'Retargeting', 'Retention'] as CampaignType[]).map(type => {
            const typeMetrics = metrics.find(m => m.campaignType === type);
            const hasData = typeMetrics && typeMetrics.campaignCount > 0;
            const { Icon, label, color } = CAMPAIGN_TYPE_LABELS[type];
            return (
              <button
                key={type}
                className={`type-button ${selectedType === type ? 'active' : ''} ${!hasData ? 'disabled' : ''}`}
                onClick={() => hasData && setSelectedType(type)}
                style={{ '--type-color': color } as React.CSSProperties}
              >
                <span className="type-icon"><Icon size={14} strokeWidth={1.5} /></span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {selectedType === 'all' ? (
        <>
          {/* Summary row for all campaign types - Primary metrics */}
          <div className="metrics-summary">
            <div className="metric-card summary">
              <div className="metric-label">Total Ad Spend</div>
              <div className="metric-value">{formatCurrency(totals.totalSpend)}</div>
            </div>
            <div className="metric-card summary">
              <div className="metric-label">Total {btConfig.conversionNounPlural}</div>
              <div className="metric-value">{formatNumber(displayConversions)}</div>
            </div>
            {!isLeadgen && (
              <div className="metric-card summary">
                <div className="metric-label">Total Revenue</div>
                <div className="metric-value">{formatCurrency(totals.totalPurchaseValue)}</div>
              </div>
            )}
            <div className="metric-card summary highlight">
              <div className="metric-label">{isLeadgen ? btConfig.costPerConversionLabel : 'Overall ROAS'}</div>
              <div className="metric-value">{isLeadgen ? formatCurrency(totalCpp) : formatRoas(totalRoas)}</div>
            </div>
          </div>

          {/* Secondary metrics row */}
          <div className="metrics-summary secondary">
            {!isLeadgen && (
              <div className="metric-card summary small">
                <div className="metric-label">{btConfig.costPerConversionLabel}</div>
                <div className="metric-value small">{formatCurrency(totalCpp)}</div>
              </div>
            )}
            <div className="metric-card summary small">
              <div className="metric-label">{btConfig.conversionRateLabel}</div>
              <div className="metric-value small">{formatPercent(totalCr)}</div>
            </div>
            {!isLeadgen && (
              <div className="metric-card summary small">
                <div className="metric-label">Avg Order Value</div>
                <div className="metric-value small">{formatCurrency(totalAov)}</div>
              </div>
            )}
          </div>

          {/* Breakdown by type */}
          <div className="type-breakdown">
            {filteredMetrics.map(m => {
              const { Icon, label, color } = CAMPAIGN_TYPE_LABELS[m.campaignType];
              const rowConversions = (isLeadgen || isHybrid) ? (m.totalConversions || 0) : m.totalPurchases;
              const rowCpp = rowConversions > 0 ? m.totalSpend / rowConversions : 0;
              const rowCr = m.totalClicks > 0 ? (rowConversions / m.totalClicks) * 100 : 0;
              return (
              <div
                key={m.campaignType}
                className="type-row"
                style={{ '--type-color': color } as React.CSSProperties}
              >
                <div className="type-info">
                  <span className="type-icon"><Icon size={18} strokeWidth={1.5} /></span>
                  <span className="type-name">{label}</span>
                  <span className="campaign-count">{m.campaignCount} campaigns</span>
                </div>
                <div className="type-metrics">
                  <div className="type-metric">
                    <span className="label">Spend</span>
                    <span className="value">{formatCurrency(m.totalSpend)}</span>
                  </div>
                  <div className="type-metric">
                    <span className="label">{btConfig.conversionNounPlural}</span>
                    <span className="value">{formatNumber(rowConversions)}</span>
                  </div>
                  {!isLeadgen && (
                    <div className="type-metric">
                      <span className="label">Revenue</span>
                      <span className="value">{formatCurrency(m.totalPurchaseValue)}</span>
                    </div>
                  )}
                  <div className="type-metric">
                    <span className="label">{isLeadgen ? 'CPL' : 'CPP'}</span>
                    <span className="value">{formatCurrency(rowCpp)}</span>
                  </div>
                  <div className="type-metric">
                    <span className="label">CR%</span>
                    <span className="value">{formatPercent(rowCr)}</span>
                  </div>
                  {!isLeadgen && (
                    <div className="type-metric">
                      <span className="label">AOV</span>
                      <span className="value">{formatCurrency(m.aov)}</span>
                    </div>
                  )}
                  <div className="type-metric highlight">
                    <span className="label">{isLeadgen ? 'CPL' : 'ROAS'}</span>
                    <span className="value">{isLeadgen ? formatCurrency(rowCpp) : formatRoas(m.roas)}</span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Single type detail view */
        <div className="single-type-view">
          {filteredMetrics.map(m => {
            const rowConversions = (isLeadgen || isHybrid) ? (m.totalConversions || 0) : m.totalPurchases;
            const rowCpp = rowConversions > 0 ? m.totalSpend / rowConversions : 0;
            const rowCr = m.totalClicks > 0 ? (rowConversions / m.totalClicks) * 100 : 0;
            return (
            <div key={m.campaignType}>
              {/* Primary metrics row */}
              <div className="metrics-grid">
                <div className="metric-card large">
                  <div className="metric-label">
                    <span className="label-text">Amount Spent</span>
                    <span className="info-icon" title="Total advertising spend">i</span>
                  </div>
                  <div className="metric-value large">{formatCurrency(m.totalSpend)}</div>
                  <div className="metric-subtext">{m.campaignCount} campaigns</div>
                </div>

                <div className="metric-card large">
                  <div className="metric-label">
                    <span className="label-text">{btConfig.conversionNounPlural}</span>
                    <span className="info-icon" title={`Number of ${btConfig.conversionNoun.toLowerCase()} conversions`}>i</span>
                  </div>
                  <div className="metric-value large">{formatNumber(rowConversions)}</div>
                  <div className="metric-subtext">{formatNumber(m.totalClicks)} clicks</div>
                </div>

                {!isLeadgen && (
                  <div className="metric-card large">
                    <div className="metric-label">
                      <span className="label-text">Purchase Value</span>
                      <span className="info-icon" title="Total revenue from purchases">i</span>
                    </div>
                    <div className="metric-value large">{formatCurrency(m.totalPurchaseValue)}</div>
                    <div className="metric-subtext">Total revenue</div>
                  </div>
                )}

                <div className="metric-card large highlight">
                  <div className="metric-label">
                    <span className="label-text">{isLeadgen ? btConfig.costPerConversionLabel : 'ROAS'}</span>
                    <span className="info-icon" title={isLeadgen ? 'Cost per lead (Spend / Leads)' : 'Return on Ad Spend (Revenue / Spend)'}>i</span>
                  </div>
                  <div className="metric-value large">{isLeadgen ? formatCurrency(rowCpp) : formatRoas(m.roas)}</div>
                  <div className="metric-subtext">
                    {isLeadgen ? (
                      rowCpp > 0 ? 'Spend / Leads' : '-'
                    ) : m.roas > 1 ? (
                      <span className="positive">Profitable</span>
                    ) : m.roas > 0 ? (
                      <span className="negative">Below break-even</span>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>
              </div>

              {/* Secondary metrics row */}
              <div className="metrics-grid secondary">
                {!isLeadgen && (
                  <div className="metric-card large">
                    <div className="metric-label">
                      <span className="label-text">{btConfig.costPerConversionLabel}</span>
                      <span className="info-icon" title={`Average cost to acquire one ${btConfig.conversionNoun.toLowerCase()}`}>i</span>
                    </div>
                    <div className="metric-value large">{formatCurrency(rowCpp)}</div>
                    <div className="metric-subtext">Spend / {btConfig.conversionNounPlural}</div>
                  </div>
                )}

                <div className="metric-card large">
                  <div className="metric-label">
                    <span className="label-text">{btConfig.conversionRateLabel}</span>
                    <span className="info-icon" title={`Percentage of clicks that result in ${btConfig.conversionNounPlural.toLowerCase()}`}>i</span>
                  </div>
                  <div className="metric-value large">{formatPercent(rowCr)}</div>
                  <div className="metric-subtext">{btConfig.conversionNounPlural} / Clicks</div>
                </div>

                {!isLeadgen && (
                  <div className="metric-card large">
                    <div className="metric-label">
                      <span className="label-text">Avg Order Value</span>
                      <span className="info-icon" title="Average revenue per purchase">i</span>
                    </div>
                    <div className="metric-value large">{formatCurrency(m.aov)}</div>
                    <div className="metric-subtext">Revenue / Purchases</div>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
