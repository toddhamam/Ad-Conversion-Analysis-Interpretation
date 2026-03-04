/** Report schedule and history types — mirrors api/_lib/report-handlers.ts */

export interface ReportSchedule {
  id: string;
  organization_id: string;
  user_id: string;
  ad_account_id: string | null;
  report_name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  delivery_hour: number;
  timezone: string;
  metrics: string[];
  date_range_preset: string;
  include_comparison: boolean;
  recipients: string[];
  is_active: boolean;
  last_sent_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleRequest {
  report_name: string;
  ad_account_id?: string | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number | null;
  day_of_month?: number | null;
  delivery_hour: number;
  timezone: string;
  metrics: string[];
  date_range_preset: string;
  include_comparison: boolean;
  recipients: string[];
}

export interface UpdateScheduleRequest extends Partial<CreateScheduleRequest> {
  is_active?: boolean;
}

export interface ReportHistoryEntry {
  id: string;
  schedule_id: string | null;
  organization_id: string;
  ad_account_id: string | null;
  date_range_start: string;
  date_range_end: string;
  metrics_included: string[];
  recipients: string[];
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}
