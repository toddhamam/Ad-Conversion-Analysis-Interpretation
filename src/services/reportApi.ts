/**
 * Report API service — CRUD for schedules, send test emails, fetch history.
 * Follows the same pattern as seoIqApi.ts.
 */

import type {
  ReportSchedule,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  ReportHistoryEntry,
} from '../types/reports';
import { supabase } from '../lib/supabase';

const API_BASE = '/api/meta';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options?.headers);
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  if (!headers.has('Content-Type') && options?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

// ─── Schedules ──────────────────────────────────────────────────────────────

export async function fetchSchedules(): Promise<ReportSchedule[]> {
  return fetchJson<ReportSchedule[]>(`${API_BASE}/report-schedules`);
}

export async function createSchedule(data: CreateScheduleRequest): Promise<ReportSchedule> {
  return fetchJson<ReportSchedule>(`${API_BASE}/report-schedules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSchedule(
  scheduleId: string,
  data: UpdateScheduleRequest,
): Promise<ReportSchedule> {
  return fetchJson<ReportSchedule>(`${API_BASE}/report-schedules`, {
    method: 'PUT',
    body: JSON.stringify({ id: scheduleId, ...data }),
  });
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await fetchJson<{ success: boolean }>(`${API_BASE}/report-schedules`, {
    method: 'DELETE',
    body: JSON.stringify({ id: scheduleId }),
  });
}

// ─── Test / Manual Send ──────────────────────────────────────────────────────

export async function sendTestReport(scheduleId: string): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(`${API_BASE}/report-send`, {
    method: 'POST',
    body: JSON.stringify({ schedule_id: scheduleId }),
  });
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function fetchReportHistory(): Promise<ReportHistoryEntry[]> {
  return fetchJson<ReportHistoryEntry[]>(`${API_BASE}/report-history`);
}
