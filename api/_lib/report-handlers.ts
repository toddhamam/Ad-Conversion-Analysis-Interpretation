/**
 * Report schedule and email delivery handlers.
 *
 * Dispatched from api/meta.ts — this file is a shared helper in api/_lib/
 * and does NOT count as a serverless function.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { decrypt } from './encryption.js';
import { captureError, flushSentry } from './sentry.js';
import {
  computeMetrics,
  fetchAllCampaignInsights,
  fetchAccountInsights,
  parseCampaignInsights,
  formatMetricValue,
  buildDateParamsForPreset,
  getPresetLabel,
  getPresetDateRange,
  getPreviousPeriodDates,
  generateCSV,
  METRIC_META,
  FUNNEL_ONLY_METRICS,
} from './metrics.js';
import type { DashboardStats, RawMetaData, AccountLevelData } from './metrics.js';

// ─── Setup ────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = 'ConversionIQ <reports@convertraiq.com>';

const MAX_RECIPIENTS = 10;
const MAX_SCHEDULES_PER_ORG = 5;
const CRON_BATCH_LIMIT = 10;
const SEND_LOCK_MINUTES = 5;
const MANUAL_SEND_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Detect Supabase "table not found in schema cache" errors.
 * These occur when report tables haven't been created via migration yet.
 * Works with both returned Supabase error objects and thrown exceptions.
 */
function isTableNotFoundError(error: { message?: string; code?: string } | null): boolean {
  return !!error?.message?.includes('schema cache');
}

function isSchemaError(err: unknown): boolean {
  if (err instanceof Error) return err.message.includes('schema cache');
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message).includes('schema cache');
  }
  return String(err).includes('schema cache');
}


// ─── Auth Helpers ─────────────────────────────────────────────────────────────

interface AuthContext {
  userId: string;
  organizationId: string;
}

async function authenticateRequest(req: VercelRequest): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('id, organization_id')
    .eq('auth_id', user.id)
    .single();

  if (!profile) return null;
  return { userId: profile.id, organizationId: profile.organization_id };
}

async function requireAdmin(auth: AuthContext): Promise<boolean> {
  const { data: userProfile } = await supabase
    .from('users')
    .select('role, is_super_admin')
    .eq('id', auth.userId)
    .single();

  if (!userProfile) return false;
  return userProfile.is_super_admin || userProfile.role === 'owner' || userProfile.role === 'admin';
}

// ─── Timezone / Next Run Computation ──────────────────────────────────────────

/**
 * Compute the next UTC run time from a local delivery_hour + timezone.
 * Handles DST by using the Intl API to find the current UTC offset.
 */
function computeNextRunAt(
  frequency: string,
  deliveryHour: number,
  timezone: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
): Date {
  const now = new Date();

  // Find the next target date based on frequency
  let targetDate = new Date(now);

  switch (frequency) {
    case 'daily':
      // Next occurrence of deliveryHour in the user's timezone
      targetDate.setDate(targetDate.getDate() + 1);
      break;
    case 'weekly': {
      const currentDay = getLocalDayOfWeek(now, timezone);
      let daysUntil = (dayOfWeek! - currentDay + 7) % 7;
      if (daysUntil === 0) daysUntil = 7; // Always schedule at least 1 day out
      targetDate.setDate(targetDate.getDate() + daysUntil);
      break;
    }
    case 'monthly': {
      targetDate.setMonth(targetDate.getMonth() + 1);
      targetDate.setDate(Math.min(dayOfMonth!, 28));
      break;
    }
  }

  // Convert deliveryHour in the user's timezone to UTC
  return localTimeToUtc(targetDate, deliveryHour, timezone);
}

function getLocalDayOfWeek(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayName = formatter.format(date);
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return dayMap[dayName] ?? 0;
}

function localTimeToUtc(date: Date, hour: number, timezone: string): Date {
  // Build an ISO string for the target local date + time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const localStr = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:00:00`;

  // Use Intl to find the UTC offset for this timezone on this date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName');
  const offsetStr = offsetPart?.value || '+0';

  // Parse offset like "GMT-5" or "GMT+10:30"
  const match = offsetStr.match(/GMT([+-]?)(\d+)(?::(\d+))?/);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const mins = parseInt(match[3] || '0', 10);
    offsetMinutes = sign * (hours * 60 + mins);
  }

  // Create UTC date: local time minus offset
  const localDate = new Date(localStr + 'Z');
  localDate.setMinutes(localDate.getMinutes() - offsetMinutes);
  return localDate;
}

// ─── Credential Loading ───────────────────────────────────────────────────────

async function loadAccessToken(organizationId: string): Promise<string | null> {
  const { data: cred } = await supabase
    .from('organization_credentials')
    .select('access_token_encrypted, status')
    .eq('organization_id', organizationId)
    .eq('provider', 'meta')
    .single();

  if (!cred || cred.status !== 'active') return null;

  try {
    return decrypt(cred.access_token_encrypted);
  } catch {
    return null;
  }
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

interface FetchedMetrics {
  stats: DashboardStats;
  rawMeta: RawMetaData;
  accountLevel: AccountLevelData;
  accountName?: string;
}

async function fetchMetricsForAccount(
  accessToken: string,
  adAccountId: string,
  datePreset: string,
): Promise<FetchedMetrics> {
  const dateParams = buildDateParamsForPreset(datePreset);

  // Fetch campaign insights with pagination
  const campaignRows = await fetchAllCampaignInsights(adAccountId, accessToken, dateParams);
  const rawMeta = parseCampaignInsights(campaignRows);

  // Fetch account-level unique metrics
  const accountLevel = await fetchAccountInsights(adAccountId, accessToken, dateParams);

  const stats = computeMetrics(rawMeta, accountLevel);

  // Try to get account name
  let accountName: string | undefined;
  const { data: account } = await supabase
    .from('organization_ad_accounts')
    .select('ad_account_name')
    .eq('ad_account_id', adAccountId)
    .single();
  if (account?.ad_account_name) {
    accountName = account.ad_account_name;
  }

  return { stats, rawMeta, accountLevel, accountName };
}

// ─── Email Template ───────────────────────────────────────────────────────────

function renderEmailHtml(options: {
  reportName: string;
  dateRangeLabel: string;
  metricIds: string[];
  stats: DashboardStats;
  previousStats?: DashboardStats;
  accountName?: string;
  multiAccountBreakdown?: Array<{ accountName: string; stats: DashboardStats }>;
}): string {
  const { reportName, dateRangeLabel, metricIds, stats, previousStats, accountName, multiAccountBreakdown } = options;

  const metricRows = metricIds
    .filter((id) => METRIC_META[id] && !FUNNEL_ONLY_METRICS.includes(id))
    .map((id) => {
      const value = stats[id as keyof DashboardStats] as number;
      const formatted = formatMetricValue(id, value);
      let deltaHtml = '';

      if (previousStats) {
        const prevValue = previousStats[id as keyof DashboardStats] as number;
        if (prevValue > 0 && value > 0) {
          const change = ((value - prevValue) / prevValue) * 100;
          const isPositive = change > 0;
          // For cost metrics, decrease is good
          const isCostMetric = id.startsWith('cost') || id === 'cpc' || id === 'cpm' || id === 'cpe' || id === 'cac';
          const isGood = isCostMetric ? !isPositive : isPositive;
          const color = isGood ? '#16a34a' : '#dc2626';
          const arrow = isPositive ? '&#9650;' : '&#9660;';
          deltaHtml = `<td style="padding:12px 16px;text-align:right;font-size:13px;color:${color};">${arrow} ${Math.abs(change).toFixed(1)}%</td>`;
        } else {
          deltaHtml = '<td style="padding:12px 16px;text-align:right;font-size:13px;color:#94a3b8;">—</td>';
        }
      }

      return `<tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 16px;font-size:13px;color:#475569;">${METRIC_META[id].label}</td>
        <td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:600;color:#1e293b;">${formatted}</td>
        ${deltaHtml}
      </tr>`;
    })
    .join('');

  const comparisonHeader = previousStats
    ? '<th style="padding:12px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Change</th>'
    : '';

  let breakdownHtml = '';
  if (multiAccountBreakdown && multiAccountBreakdown.length > 0) {
    const breakdownRows = multiAccountBreakdown
      .map((account) => {
        const spend = formatMetricValue('adSpend', account.stats.adSpend);
        const revenue = formatMetricValue('totalRevenue', account.stats.totalRevenue);
        const roas = formatMetricValue('roas', account.stats.roas);
        const conversions = formatMetricValue('totalPurchases', account.stats.totalPurchases);
        return `<tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 16px;font-size:13px;color:#475569;">${account.accountName}</td>
          <td style="padding:10px 16px;text-align:right;font-size:13px;color:#1e293b;">${spend}</td>
          <td style="padding:10px 16px;text-align:right;font-size:13px;color:#1e293b;">${revenue}</td>
          <td style="padding:10px 16px;text-align:right;font-size:13px;color:#1e293b;">${roas}</td>
          <td style="padding:10px 16px;text-align:right;font-size:13px;color:#1e293b;">${conversions}</td>
        </tr>`;
      })
      .join('');

    breakdownHtml = `
      <div style="margin-top:32px;">
        <h3 style="font-size:15px;font-weight:600;color:#1e293b;margin:0 0 16px;">Per-Account Breakdown</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Account</th>
              <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Spend</th>
              <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Revenue</th>
              <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;">ROAS</th>
              <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;">Conversions</th>
            </tr>
          </thead>
          <tbody>${breakdownRows}</tbody>
        </table>
        <p style="font-size:11px;color:#94a3b8;margin:8px 0 0;">* Reach and unique link clicks are per-account and cannot be accurately summed across accounts.</p>
      </div>`;
  }

  const subtitle = accountName ? `${accountName} &middot; ${dateRangeLabel}` : dateRangeLabel;
  const appUrl = process.env.VITE_APP_URL || 'https://www.convertraiq.com';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:22px;font-weight:700;color:#1e293b;margin-bottom:4px;">Convertra</div>
      <div style="font-size:11px;color:#a855f7;font-weight:600;letter-spacing:1px;text-transform:uppercase;">ConversionIQ Report</div>
    </div>

    <!-- Report Title -->
    <div style="margin-bottom:24px;">
      <h1 style="font-size:20px;font-weight:700;color:#1e293b;margin:0 0 4px;">${reportName}</h1>
      <p style="font-size:13px;color:#475569;margin:0;">${subtitle}</p>
    </div>

    <!-- Metrics Table -->
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Metric</th>
          <th style="padding:12px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Value</th>
          ${comparisonHeader}
        </tr>
      </thead>
      <tbody>${metricRows}</tbody>
    </table>

    ${breakdownHtml}

    <!-- Footer -->
    <div style="margin-top:32px;text-align:center;padding-top:24px;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0 0 8px;">Generated by ConversionIQ&#8482; &middot; <a href="${appUrl}" style="color:#a855f7;text-decoration:none;">convertraiq.com</a></p>
      <p style="font-size:11px;color:#94a3b8;margin:0;"><a href="${appUrl}/reports" style="color:#a855f7;text-decoration:none;">Manage report preferences</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Route: report-schedules (CRUD) ───────────────────────────────────────────

export async function handleReportSchedules(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Authentication required' });

  if (req.method === 'GET') {
    // Admin-only: schedules contain recipient emails
    const isAdminUser = await requireAdmin(auth);
    if (!isAdminUser) return res.status(403).json({ error: 'Admin access required' });

    const { data, error } = await supabase
      .from('report_schedules')
      .select('*')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isTableNotFoundError(error)) {
        return res.status(501).json({ error: 'Report scheduling is not yet available. Database migration pending.' });
      }
      captureError(new Error(error.message), { route: 'meta/report-schedules' });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to fetch report schedules' });
    }

    return res.status(200).json(data || []);
  }

  // POST, PUT, DELETE require admin role
  const isAdmin = await requireAdmin(auth);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required to manage report schedules' });

  if (req.method === 'POST') {
    const {
      ad_account_id,
      report_name,
      frequency,
      day_of_week,
      day_of_month,
      delivery_hour,
      timezone,
      metrics,
      date_range_preset,
      include_comparison,
      recipients,
    } = req.body;

    // Validate
    if (!frequency || !['daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency. Must be daily, weekly, or monthly.' });
    }
    if (frequency === 'weekly' && (day_of_week === undefined || day_of_week === null)) {
      return res.status(400).json({ error: 'day_of_week is required for weekly schedules.' });
    }
    if (frequency === 'monthly' && (day_of_month === undefined || day_of_month === null)) {
      return res.status(400).json({ error: 'day_of_month is required for monthly schedules.' });
    }
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient email is required.' });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return res.status(400).json({ error: `Maximum ${MAX_RECIPIENTS} recipients allowed.` });
    }
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'At least one metric must be selected.' });
    }

    // Check org schedule limit
    const { count } = await supabase
      .from('report_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', auth.organizationId)
      .eq('is_active', true);

    if ((count || 0) >= MAX_SCHEDULES_PER_ORG) {
      return res.status(400).json({ error: `Maximum ${MAX_SCHEDULES_PER_ORG} active schedules per organization.` });
    }

    const nextRunAt = computeNextRunAt(
      frequency,
      delivery_hour ?? 8,
      timezone || 'UTC',
      day_of_week,
      day_of_month,
    );

    const { data, error } = await supabase
      .from('report_schedules')
      .insert({
        organization_id: auth.organizationId,
        user_id: auth.userId,
        ad_account_id: ad_account_id || null,
        report_name: report_name || 'Dashboard Report',
        frequency,
        day_of_week: day_of_week ?? null,
        day_of_month: day_of_month ?? null,
        delivery_hour: delivery_hour ?? 8,
        timezone: timezone || 'UTC',
        metrics,
        date_range_preset: date_range_preset || 'last_7d',
        include_comparison: include_comparison ?? true,
        recipients,
        is_active: true,
        next_run_at: nextRunAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (isTableNotFoundError(error)) {
        return res.status(501).json({ error: 'Report scheduling is not yet available. Database migration pending.' });
      }
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A schedule with this frequency already exists for this account.' });
      }
      captureError(new Error(error.message), { route: 'meta/report-schedules' });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to create report schedule' });
    }

    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'Schedule ID is required.' });

    // Verify ownership — select all fields needed for next_run_at recompute
    const { data: existing } = await supabase
      .from('report_schedules')
      .select('organization_id, frequency, delivery_hour, timezone, day_of_week, day_of_month')
      .eq('id', id)
      .single();

    if (!existing || existing.organization_id !== auth.organizationId) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }

    // Validate recipients if provided
    if (updates.recipients) {
      if (!Array.isArray(updates.recipients) || updates.recipients.length > MAX_RECIPIENTS) {
        return res.status(400).json({ error: `Maximum ${MAX_RECIPIENTS} recipients allowed.` });
      }
    }

    // Recompute next_run_at if timing fields changed
    if (updates.frequency || updates.delivery_hour !== undefined || updates.timezone || updates.day_of_week !== undefined || updates.day_of_month !== undefined) {
      const freq = updates.frequency || existing.frequency;
      const hour = updates.delivery_hour ?? existing.delivery_hour ?? 8;
      const tz = updates.timezone || existing.timezone || 'UTC';
      updates.next_run_at = computeNextRunAt(
        freq,
        hour,
        tz,
        updates.day_of_week ?? existing.day_of_week,
        updates.day_of_month ?? existing.day_of_month,
      ).toISOString();
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('report_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      captureError(new Error(error.message), { route: 'meta/report-schedules' });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to update report schedule' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string || req.body?.id;
    if (!id) return res.status(400).json({ error: 'Schedule ID is required.' });

    const { data: existing } = await supabase
      .from('report_schedules')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (!existing || existing.organization_id !== auth.organizationId) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }

    const { error } = await supabase
      .from('report_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      captureError(new Error(error.message), { route: 'meta/report-schedules' });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to delete report schedule' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── Route: report-export (Server-Side CSV) ───────────────────────────────────

export async function handleReportExport(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Authentication required' });

  const { ad_account_id, date_range_preset, metrics: metricIds } = req.body;

  if (!ad_account_id) return res.status(400).json({ error: 'ad_account_id is required.' });
  if (!metricIds || !Array.isArray(metricIds)) return res.status(400).json({ error: 'metrics array is required.' });

  try {
    const accessToken = await loadAccessToken(auth.organizationId);
    if (!accessToken) return res.status(400).json({ error: 'Meta credentials not configured or expired.' });

    const { stats, accountName } = await fetchMetricsForAccount(
      accessToken,
      ad_account_id,
      date_range_preset || 'last_30d',
    );

    const dateLabel = getPresetLabel(date_range_preset || 'last_30d');
    const csv = generateCSV(stats, metricIds, dateLabel, accountName);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="convertra-report-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.status(200).send(csv);
  } catch (err: unknown) {
    captureError(err, { route: 'meta/report-export', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}

// ─── Route: report-send (Manual / Test Send) ─────────────────────────────────

export async function handleReportSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Authentication required' });

  const isAdmin = await requireAdmin(auth);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

  if (!resend) return res.status(500).json({ error: 'Email service not configured. Set RESEND_API_KEY.' });

  const { schedule_id } = req.body;
  if (!schedule_id) return res.status(400).json({ error: 'schedule_id is required.' });

  const { data: schedule, error: scheduleError } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('id', schedule_id)
    .eq('organization_id', auth.organizationId)
    .single();

  if (scheduleError && isTableNotFoundError(scheduleError)) {
    return res.status(501).json({ error: 'Report scheduling is not yet available. Database migration pending.' });
  }
  if (!schedule) return res.status(404).json({ error: 'Schedule not found.' });

  // Rate limit: 5 minute cooldown
  if (schedule.last_sent_at) {
    const timeSinceLastSend = Date.now() - new Date(schedule.last_sent_at).getTime();
    if (timeSinceLastSend < MANUAL_SEND_COOLDOWN_MS) {
      const waitSecs = Math.ceil((MANUAL_SEND_COOLDOWN_MS - timeSinceLastSend) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSecs} seconds before sending again.` });
    }
  }

  try {
    await processAndSendReport(schedule);
    return res.status(200).json({ success: true, message: 'Report sent successfully.' });
  } catch (err: unknown) {
    captureError(err, { route: 'meta/report-send', organizationId: auth.organizationId });
    await flushSentry();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send report' });
  }
}

// ─── Route: report-cron (Hourly Scheduled Send) ──────────────────────────────

export async function handleReportCron(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!resend) {
    return res.status(200).json({ message: 'Email service not configured (RESEND_API_KEY missing). Skipping.', sent: 0, failed: 0 });
  }

  try {
    const now = new Date().toISOString();
    const lockUntil = new Date(Date.now() + SEND_LOCK_MINUTES * 60 * 1000).toISOString();

    // Atomically claim due schedules by setting send_lock_until
    const { data: dueSchedules, error: queryError } = await supabase
      .from('report_schedules')
      .update({ send_lock_until: lockUntil })
      .lte('next_run_at', now)
      .eq('is_active', true)
      .or(`send_lock_until.is.null,send_lock_until.lt.${now}`)
      .select('*')
      .limit(CRON_BATCH_LIMIT);

    if (queryError) {
      if (isTableNotFoundError(queryError)) {
        return res.status(200).json({ message: 'Report tables not yet provisioned — skipping cron', sent: 0, failed: 0 });
      }
      captureError(new Error(queryError.message), { route: 'meta/report-cron' });
      await flushSentry();
      return res.status(500).json({ error: 'Failed to query due schedules' });
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      return res.status(200).json({ message: 'No reports due', sent: 0, failed: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const schedule of dueSchedules) {
      try {
        await processAndSendReport(schedule);

        const nextRun = computeNextRunAt(
          schedule.frequency,
          schedule.delivery_hour,
          schedule.timezone,
          schedule.day_of_week,
          schedule.day_of_month,
        );

        await supabase.from('report_schedules').update({
          last_sent_at: new Date().toISOString(),
          next_run_at: nextRun.toISOString(),
          send_lock_until: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', schedule.id);

        sent++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        captureError(err, {
          route: 'meta/report-cron',
          organizationId: schedule.organization_id,
          extra: { scheduleId: schedule.id },
        });

        // Clear lock so it can retry next hour
        await supabase.from('report_schedules').update({
          send_lock_until: null,
          last_error: errorMsg,
          updated_at: new Date().toISOString(),
        }).eq('id', schedule.id);

        // Record failure in history with actual date range
        const failDateRange = getPresetDateRange(schedule.date_range_preset || 'last_7d');
        await supabase.from('report_history').insert({
          schedule_id: schedule.id,
          organization_id: schedule.organization_id,
          ad_account_id: schedule.ad_account_id,
          date_range_start: failDateRange.since,
          date_range_end: failDateRange.until,
          metrics_included: schedule.metrics,
          recipients: schedule.recipients,
          status: 'failed',
          error: errorMsg,
        });

        failed++;
      }
    }

    await flushSentry();
    return res.status(200).json({ message: `Processed ${sent + failed} reports`, sent, failed });
  } catch (err: unknown) {
    if (isSchemaError(err)) {
      return res.status(200).json({ message: 'Report tables not yet provisioned — skipping cron', sent: 0, failed: 0 });
    }
    captureError(err, { route: 'meta/report-cron' });
    await flushSentry();
    return res.status(500).json({ error: 'Cron handler failed' });
  }
}

// ─── Route: report-history ────────────────────────────────────────────────────

export async function handleReportHistory(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  if (!auth) return res.status(401).json({ error: 'Authentication required' });

  const isAdminUser = await requireAdmin(auth);
  if (!isAdminUser) return res.status(403).json({ error: 'Admin access required' });

  const { data, error } = await supabase
    .from('report_history')
    .select('*')
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    if (isTableNotFoundError(error)) {
      return res.status(501).json({ error: 'Report history is not yet available. Database migration pending.' });
    }
    captureError(new Error(error.message), { route: 'meta/report-history' });
    await flushSentry();
    return res.status(500).json({ error: 'Failed to fetch report history' });
  }

  return res.status(200).json(data || []);
}

// ─── Core: Process and Send a Single Report ───────────────────────────────────

async function processAndSendReport(schedule: any): Promise<void> {
  if (!resend) throw new Error('Email service not configured');

  const accessToken = await loadAccessToken(schedule.organization_id);
  if (!accessToken) throw new Error('Meta credentials not configured or expired');

  const metricIds: string[] = schedule.metrics || [];
  const datePreset = schedule.date_range_preset || 'last_7d';
  const dateLabel = getPresetLabel(datePreset);

  let stats: DashboardStats;
  let previousStats: DashboardStats | undefined;
  let accountName: string | undefined;
  let multiAccountBreakdown: Array<{ accountName: string; stats: DashboardStats }> | undefined;

  if (schedule.ad_account_id) {
    // Single-account report
    const result = await fetchMetricsForAccount(accessToken, schedule.ad_account_id, datePreset);
    stats = result.stats;
    accountName = result.accountName;
  } else {
    // Cross-account aggregate report
    const { data: accounts } = await supabase
      .from('organization_ad_accounts')
      .select('ad_account_id, ad_account_name')
      .eq('organization_id', schedule.organization_id)
      .eq('is_active', true);

    if (!accounts || accounts.length === 0) {
      throw new Error('No active ad accounts found for cross-account report');
    }

    multiAccountBreakdown = [];
    // Aggregate totals
    const aggregate: RawMetaData = {
      totalSpend: 0, totalPurchases: 0, totalPurchaseValue: 0,
      totalClicks: 0, totalImpressions: 0, totalLeads: 0,
      totalLinkClicks: 0, totalPostEngagements: 0, totalLandingPageViews: 0,
      totalAddToCart: 0, totalInitiateCheckout: 0, totalVideoViews: 0,
    };
    // Note: reach/uniqueLinkClicks cannot be accurately aggregated cross-account
    const aggregateAccount: AccountLevelData = { reach: 0, uniqueLinkClicks: 0 };

    for (const account of accounts) {
      try {
        const result = await fetchMetricsForAccount(accessToken, account.ad_account_id, datePreset);
        multiAccountBreakdown.push({
          accountName: account.ad_account_name || account.ad_account_id,
          stats: result.stats,
        });

        // Sum raw fields for aggregate — use rawMeta, not derived stats
        aggregate.totalSpend += result.rawMeta.totalSpend;
        aggregate.totalPurchases += result.rawMeta.totalPurchases;
        aggregate.totalPurchaseValue += result.rawMeta.totalPurchaseValue;
        aggregate.totalClicks += result.rawMeta.totalClicks;
        aggregate.totalImpressions += result.rawMeta.totalImpressions;
        aggregate.totalLeads += result.rawMeta.totalLeads;
        aggregate.totalLinkClicks += result.rawMeta.totalLinkClicks;
        aggregate.totalPostEngagements += result.rawMeta.totalPostEngagements;
        aggregate.totalLandingPageViews += result.rawMeta.totalLandingPageViews;
        aggregate.totalAddToCart += result.rawMeta.totalAddToCart;
        aggregate.totalInitiateCheckout += result.rawMeta.totalInitiateCheckout;
        aggregate.totalVideoViews += result.rawMeta.totalVideoViews;
        // Note: reach/uniqueLinkClicks may double-count across accounts
        aggregateAccount.reach += result.accountLevel.reach;
        aggregateAccount.uniqueLinkClicks += result.accountLevel.uniqueLinkClicks;
      } catch (err: unknown) {
        // Skip failed accounts but continue with others
        console.warn(`Failed to fetch metrics for ${account.ad_account_id}:`, err instanceof Error ? err.message : err);
      }
    }

    stats = computeMetrics(aggregate, aggregateAccount);
    accountName = 'All Accounts';
  }

  // Fetch previous period if comparison enabled
  if (schedule.include_comparison) {
    try {
      const prevDates = getPreviousPeriodDates(datePreset);
      const prevDateParams = { time_range: JSON.stringify(prevDates) };

      if (schedule.ad_account_id) {
        const prevRows = await fetchAllCampaignInsights(
          schedule.ad_account_id, accessToken,
          { 'time_range': JSON.stringify(prevDates) },
        );
        const prevMeta = parseCampaignInsights(prevRows);
        const prevAccount = await fetchAccountInsights(
          schedule.ad_account_id, accessToken,
          { 'time_range': JSON.stringify(prevDates) },
        );
        previousStats = computeMetrics(prevMeta, prevAccount);
      }
      // Skip comparison for cross-account (too many API calls)
    } catch {
      // Comparison is best-effort — skip on error
    }
  }

  // Render email
  const html = renderEmailHtml({
    reportName: schedule.report_name || 'Dashboard Report',
    dateRangeLabel: dateLabel,
    metricIds,
    stats,
    previousStats,
    accountName,
    multiAccountBreakdown,
  });

  // Send email
  const recipients: string[] = schedule.recipients || [];
  if (recipients.length === 0) throw new Error('No recipients configured');

  const { error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `${schedule.report_name || 'Dashboard Report'} — ${dateLabel}`,
    html,
    headers: {
      'List-Unsubscribe': `<${process.env.VITE_APP_URL || 'https://www.convertraiq.com'}/reports>`,
    },
  });

  if (sendError) {
    throw new Error(`Email delivery failed: ${sendError.message}`);
  }

  // Record success in history with actual date range
  const dateRange = getPresetDateRange(datePreset);
  await supabase.from('report_history').insert({
    schedule_id: schedule.id,
    organization_id: schedule.organization_id,
    ad_account_id: schedule.ad_account_id,
    date_range_start: dateRange.since,
    date_range_end: dateRange.until,
    metrics_included: metricIds,
    recipients,
    status: 'sent',
  });

  // Update last_sent_at
  await supabase.from('report_schedules').update({
    last_sent_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', schedule.id);
}
