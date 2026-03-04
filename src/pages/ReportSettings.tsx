import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '../contexts/OrganizationContext';
import { useAdAccount } from '../contexts/AdAccountContext';
import {
  fetchSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  sendTestReport,
  fetchReportHistory,
} from '../services/reportApi';
import type {
  ReportSchedule,
  CreateScheduleRequest,
  ReportHistoryEntry,
} from '../types/reports';
import Loading from '../components/Loading';
import SEO from '../components/SEO';
import {
  Plus,
  Trash2,
  Send,
  Clock,
  Calendar,
  Mail,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Check,
  FileText,
} from 'lucide-react';
import './ReportSettings.css';

// ─── Metric options (excluding funnel-only) ─────────────────────────────────

const FUNNEL_ONLY = new Set(['uniqueCustomers', 'aov', 'sessions', 'cac']);

interface MetricOption {
  id: string;
  label: string;
  category: string;
}

const METRIC_OPTIONS: MetricOption[] = [
  // Core
  { id: 'totalRevenue', label: 'Total Revenue', category: 'Core' },
  { id: 'totalPurchases', label: 'Total Conversions', category: 'Core' },
  { id: 'conversionRate', label: 'Conversion Rate', category: 'Core' },
  { id: 'adSpend', label: 'Ad Spend', category: 'Core' },
  { id: 'roas', label: 'ROAS', category: 'Core' },
  { id: 'transactionFees', label: 'Transaction Fees', category: 'Core' },
  { id: 'netProfit', label: 'Net Profit', category: 'Core' },
  // Lead
  { id: 'leads', label: 'Leads', category: 'Lead' },
  { id: 'costPerLead', label: 'Cost Per Lead', category: 'Lead' },
  { id: 'leadRate', label: 'Lead Rate', category: 'Lead' },
  // Click
  { id: 'linkClicks', label: 'Link Clicks', category: 'Click' },
  { id: 'cpc', label: 'CPC (All Clicks)', category: 'Click' },
  { id: 'costPerLinkClick', label: 'Cost Per Link Click', category: 'Click' },
  { id: 'uniqueLinkClicks', label: 'Unique Link Clicks', category: 'Click' },
  { id: 'costPerUniqueLinkClick', label: 'Cost Per Unique Link Click', category: 'Click' },
  { id: 'linkCtr', label: 'Link CTR', category: 'Click' },
  { id: 'uniqueLinkCtr', label: 'Unique Link CTR', category: 'Click' },
  // Awareness
  { id: 'impressions', label: 'Impressions', category: 'Awareness' },
  { id: 'reach', label: 'Reach', category: 'Awareness' },
  { id: 'cpm', label: 'CPM', category: 'Awareness' },
  { id: 'frequency', label: 'Frequency', category: 'Awareness' },
  // Engagement
  { id: 'postEngagements', label: 'Post Engagements', category: 'Engagement' },
  { id: 'cpe', label: 'CPE (Cost Per Engagement)', category: 'Engagement' },
  // Funnel (page-level, not customer-level)
  { id: 'landingPageViews', label: 'Landing Page Views', category: 'Funnel' },
  { id: 'costPerLandingPageView', label: 'Cost Per LPV', category: 'Funnel' },
  { id: 'addToCart', label: 'Add to Cart', category: 'Funnel' },
  { id: 'costPerAddToCart', label: 'Cost Per Add to Cart', category: 'Funnel' },
  { id: 'initiateCheckout', label: 'Initiate Checkout', category: 'Funnel' },
  { id: 'costPerInitiateCheckout', label: 'Cost Per Checkout', category: 'Funnel' },
  // Video
  { id: 'videoViews', label: 'Video Views (3-sec)', category: 'Video' },
  { id: 'costPerVideoView', label: 'Cost Per Video View', category: 'Video' },
];

const DEFAULT_METRICS = [
  'totalRevenue', 'totalPurchases', 'adSpend', 'roas', 'netProfit',
  'linkClicks', 'cpc', 'impressions', 'cpm',
];

const FREQUENCY_PRESETS: Record<string, string> = {
  daily: 'yesterday',
  weekly: 'last_7d',
  monthly: 'last_30d',
};

const DATE_RANGE_OPTIONS = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_3d', label: 'Last 3 Days' },
  { value: 'last_7d', label: 'Last 7 Days' },
  { value: 'last_14d', label: 'Last 14 Days' },
  { value: 'last_30d', label: 'Last 30 Days' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReportSettings() {
  const { isAdmin, user } = useOrganization();
  const { accounts, isMultiAccount } = useAdAccount();

  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [history, setHistory] = useState<ReportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateScheduleRequest>(getEmptyForm());
  const [saving, setSaving] = useState(false);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);

  // Collapsible sections
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [metricsExpanded, setMetricsExpanded] = useState(false);

  function getEmptyForm(): CreateScheduleRequest {
    return {
      report_name: 'Dashboard Report',
      ad_account_id: null,
      frequency: 'daily',
      day_of_week: 1,
      day_of_month: 1,
      delivery_hour: 8,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      metrics: DEFAULT_METRICS,
      date_range_preset: 'yesterday',
      include_comparison: true,
      recipients: user?.email ? [user.email] : [],
    };
  }

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [schedulesRes, historyRes] = await Promise.all([
        fetchSchedules(),
        fetchReportHistory(),
      ]);
      setSchedules(schedulesRes);
      setHistory(historyRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clear success message after 4 seconds
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleEdit(schedule: ReportSchedule) {
    setEditingId(schedule.id);
    setFormData({
      report_name: schedule.report_name,
      ad_account_id: schedule.ad_account_id,
      frequency: schedule.frequency,
      day_of_week: schedule.day_of_week,
      day_of_month: schedule.day_of_month,
      delivery_hour: schedule.delivery_hour,
      timezone: schedule.timezone,
      metrics: schedule.metrics,
      date_range_preset: schedule.date_range_preset,
      include_comparison: schedule.include_comparison,
      recipients: schedule.recipients,
    });
    setShowForm(true);
  }

  function handleNewSchedule() {
    setEditingId(null);
    setFormData(getEmptyForm());
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateSchedule(editingId, formData);
        setSuccessMsg('Schedule updated successfully');
      } else {
        await createSchedule(formData);
        setSuccessMsg('Schedule created successfully');
      }
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this report schedule?')) return;
    try {
      await deleteSchedule(id);
      setSuccessMsg('Schedule deleted');
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  }

  async function handleToggleActive(schedule: ReportSchedule) {
    try {
      await updateSchedule(schedule.id, { is_active: !schedule.is_active });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  }

  async function handleSendTest(scheduleId: string) {
    setSendingTestId(scheduleId);
    setError(null);
    try {
      await sendTestReport(scheduleId);
      setSuccessMsg('Test email sent! Check your inbox.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send test email');
    } finally {
      setSendingTestId(null);
    }
  }

  function handleFrequencyChange(frequency: 'daily' | 'weekly' | 'monthly') {
    setFormData(prev => ({
      ...prev,
      frequency,
      date_range_preset: FREQUENCY_PRESETS[frequency] || prev.date_range_preset,
    }));
  }

  function toggleMetric(metricId: string) {
    setFormData(prev => {
      const metrics = prev.metrics.includes(metricId)
        ? prev.metrics.filter(m => m !== metricId)
        : [...prev.metrics, metricId];
      return { ...prev, metrics };
    });
  }

  // ─── Recipient Management ───────────────────────────────────────────────────

  const [recipientInput, setRecipientInput] = useState('');

  function addRecipient() {
    const email = recipientInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (formData.recipients.length >= 10) return;
    if (formData.recipients.includes(email)) return;
    setFormData(prev => ({ ...prev, recipients: [...prev.recipients, email] }));
    setRecipientInput('');
  }

  function removeRecipient(email: string) {
    setFormData(prev => ({
      ...prev,
      recipients: prev.recipients.filter(r => r !== email),
    }));
  }

  // ─── Access Check ───────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="report-settings">
        <SEO title="Reports | Convertra" noindex />
        <div className="report-settings-empty">
          <AlertCircle size={48} />
          <h2>Admin Access Required</h2>
          <p>Only owners and admins can manage report schedules.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <Loading size="large" message="ConversionIQ™ loading reports..." />;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const categories = [...new Set(METRIC_OPTIONS.map(m => m.category))];

  return (
    <div className="report-settings">
      <SEO title="Reports | Convertra" noindex />

      {/* Header */}
      <div className="report-settings-header">
        <div>
          <h1>Scheduled Reports</h1>
          <p className="report-settings-subtitle">
            Automate dashboard metric delivery to your inbox
          </p>
        </div>
        <button
          className="report-btn report-btn-primary"
          onClick={handleNewSchedule}
          disabled={showForm || schedules.length >= 5}
        >
          <Plus size={16} />
          New Schedule
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <div className="report-alert report-alert-error">
          <AlertCircle size={16} />
          {error}
          <button className="report-alert-close" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="report-alert report-alert-success">
          <Check size={16} />
          {successMsg}
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <div className="report-form-card">
          <div className="report-form-header">
            <h2>{editingId ? 'Edit Schedule' : 'Create Schedule'}</h2>
            <button className="report-btn-icon" onClick={handleCancelForm}>
              <X size={18} />
            </button>
          </div>

          <div className="report-form-grid">
            {/* Report Name */}
            <div className="report-form-field">
              <label>Report Name</label>
              <input
                type="text"
                value={formData.report_name}
                onChange={e => setFormData(prev => ({ ...prev, report_name: e.target.value }))}
                placeholder="Dashboard Report"
              />
            </div>

            {/* Ad Account */}
            {isMultiAccount && (
              <div className="report-form-field">
                <label>Ad Account</label>
                <select
                  value={formData.ad_account_id || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    ad_account_id: e.target.value || null,
                  }))}
                >
                  <option value="">All accounts (breakdown)</option>
                  {accounts.map(acc => (
                    <option key={acc.ad_account_id} value={acc.ad_account_id}>
                      {acc.ad_account_name || acc.ad_account_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Frequency */}
            <div className="report-form-field">
              <label>Frequency</label>
              <div className="report-radio-group">
                {(['daily', 'weekly', 'monthly'] as const).map(f => (
                  <label key={f} className={`report-radio-pill ${formData.frequency === f ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="frequency"
                      value={f}
                      checked={formData.frequency === f}
                      onChange={() => handleFrequencyChange(f)}
                    />
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* Day of week (weekly) */}
            {formData.frequency === 'weekly' && (
              <div className="report-form-field">
                <label>Day of Week</label>
                <select
                  value={formData.day_of_week ?? 1}
                  onChange={e => setFormData(prev => ({ ...prev, day_of_week: parseInt(e.target.value) }))}
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Day of month (monthly) */}
            {formData.frequency === 'monthly' && (
              <div className="report-form-field">
                <label>Day of Month</label>
                <select
                  value={formData.day_of_month ?? 1}
                  onChange={e => setFormData(prev => ({ ...prev, day_of_month: parseInt(e.target.value) }))}
                >
                  {Array.from({ length: 28 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Delivery Time */}
            <div className="report-form-field">
              <label>Delivery Time ({formData.timezone.split('/').pop()?.replace(/_/g, ' ')})</label>
              <select
                value={formData.delivery_hour}
                onChange={e => setFormData(prev => ({ ...prev, delivery_hour: parseInt(e.target.value) }))}
              >
                {Array.from({ length: 24 }, (_, h) => {
                  const label = h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`;
                  return <option key={h} value={h}>{label}</option>;
                })}
              </select>
            </div>

            {/* Date Range */}
            <div className="report-form-field">
              <label>Date Range</label>
              <select
                value={formData.date_range_preset}
                onChange={e => setFormData(prev => ({ ...prev, date_range_preset: e.target.value }))}
              >
                {DATE_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Include Comparison */}
            <div className="report-form-field report-form-field-inline">
              <label className="report-toggle-label">
                <input
                  type="checkbox"
                  checked={formData.include_comparison}
                  onChange={e => setFormData(prev => ({ ...prev, include_comparison: e.target.checked }))}
                />
                <span className="report-toggle-slider"></span>
                Include previous period comparison
              </label>
            </div>

            {/* Metrics Selection */}
            <div className="report-form-field report-form-field-full">
              <button
                className="report-metrics-toggle"
                onClick={() => setMetricsExpanded(!metricsExpanded)}
              >
                <label>Metrics ({formData.metrics.length} selected)</label>
                {metricsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {metricsExpanded && (
                <div className="report-metrics-grid">
                  {categories.map(cat => (
                    <div key={cat} className="report-metrics-category">
                      <span className="report-metrics-category-label">{cat}</span>
                      {METRIC_OPTIONS.filter(m => m.category === cat && !FUNNEL_ONLY.has(m.id)).map(m => (
                        <label key={m.id} className="report-metric-checkbox">
                          <input
                            type="checkbox"
                            checked={formData.metrics.includes(m.id)}
                            onChange={() => toggleMetric(m.id)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recipients */}
            <div className="report-form-field report-form-field-full">
              <label>Recipients (max 10)</label>
              <div className="report-recipients">
                {formData.recipients.map(email => (
                  <span key={email} className="report-recipient-chip">
                    {email}
                    <button onClick={() => removeRecipient(email)} aria-label={`Remove ${email}`}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {formData.recipients.length < 10 && (
                  <div className="report-recipient-input-wrap">
                    <input
                      type="email"
                      placeholder="Add email..."
                      value={recipientInput}
                      onChange={e => setRecipientInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addRecipient(); }
                      }}
                    />
                    <button
                      className="report-btn-sm"
                      onClick={addRecipient}
                      disabled={!recipientInput.includes('@')}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="report-form-actions">
            <button className="report-btn report-btn-secondary" onClick={handleCancelForm}>
              Cancel
            </button>
            <button
              className="report-btn report-btn-primary"
              onClick={handleSave}
              disabled={saving || formData.recipients.length === 0 || formData.metrics.length === 0}
            >
              {saving ? 'Saving...' : editingId ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </div>
      )}

      {/* Active Schedules */}
      <div className="report-section">
        <h2 className="report-section-title">
          <Calendar size={18} />
          Active Schedules
          <span className="report-section-count">{schedules.length}/5</span>
        </h2>

        {schedules.length === 0 ? (
          <div className="report-empty-card">
            <Mail size={40} />
            <p>No report schedules yet</p>
            <p className="report-empty-hint">Create a schedule to receive automated dashboard reports via email.</p>
          </div>
        ) : (
          <div className="report-schedule-list">
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                className={`report-schedule-card ${!schedule.is_active ? 'inactive' : ''}`}
              >
                <div className="report-schedule-card-header">
                  <div className="report-schedule-info">
                    <h3>{schedule.report_name}</h3>
                    <div className="report-schedule-meta">
                      <span className="report-schedule-badge">
                        <Clock size={12} />
                        {schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)}
                        {schedule.frequency === 'weekly' && schedule.day_of_week != null && ` — ${DAY_NAMES[schedule.day_of_week]}`}
                        {schedule.frequency === 'monthly' && schedule.day_of_month != null && ` — Day ${schedule.day_of_month}`}
                      </span>
                      <span className="report-schedule-badge">
                        <Mail size={12} />
                        {schedule.recipients.length} recipient{schedule.recipients.length !== 1 ? 's' : ''}
                      </span>
                      {schedule.ad_account_id ? (
                        <span className="report-schedule-badge">
                          {accounts.find(a => a.ad_account_id === schedule.ad_account_id)?.ad_account_name || schedule.ad_account_id}
                        </span>
                      ) : isMultiAccount ? (
                        <span className="report-schedule-badge">All accounts</span>
                      ) : null}
                    </div>
                    {schedule.next_run_at && (
                      <p className="report-schedule-next">
                        Next delivery: {new Date(schedule.next_run_at).toLocaleString()}
                      </p>
                    )}
                    {schedule.last_error && (
                      <p className="report-schedule-error">
                        <AlertCircle size={12} />
                        {schedule.last_error}
                      </p>
                    )}
                  </div>
                  <div className="report-schedule-actions">
                    <label className="report-active-toggle" title={schedule.is_active ? 'Active' : 'Paused'}>
                      <input
                        type="checkbox"
                        checked={schedule.is_active}
                        onChange={() => handleToggleActive(schedule)}
                      />
                      <span className="report-toggle-slider"></span>
                    </label>
                    <button
                      className="report-btn-icon"
                      title="Send test email"
                      onClick={() => handleSendTest(schedule.id)}
                      disabled={sendingTestId === schedule.id}
                    >
                      <Send size={16} />
                    </button>
                    <button
                      className="report-btn-icon"
                      title="Edit"
                      onClick={() => handleEdit(schedule)}
                    >
                      <FileText size={16} />
                    </button>
                    <button
                      className="report-btn-icon report-btn-danger"
                      title="Delete"
                      onClick={() => handleDelete(schedule.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report History */}
      <div className="report-section">
        <button
          className="report-section-toggle"
          onClick={() => setHistoryExpanded(!historyExpanded)}
        >
          <h2 className="report-section-title">
            <Clock size={18} />
            Report History
            <span className="report-section-count">{history.length}</span>
          </h2>
          {historyExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {historyExpanded && (
          history.length === 0 ? (
            <div className="report-empty-card">
              <p>No reports sent yet</p>
            </div>
          ) : (
            <div className="report-history-table-wrap">
              <table className="report-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Account</th>
                    <th>Recipients</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(entry => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td>{entry.date_range_start} — {entry.date_range_end}</td>
                      <td>
                        {entry.ad_account_id
                          ? accounts.find(a => a.ad_account_id === entry.ad_account_id)?.ad_account_name || entry.ad_account_id
                          : 'All accounts'}
                      </td>
                      <td>{entry.recipients?.length || 0}</td>
                      <td>
                        <span className={`report-status-badge ${entry.status}`}>
                          {entry.status === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                        {entry.error && (
                          <span className="report-history-error" title={entry.error}>
                            <AlertCircle size={12} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
