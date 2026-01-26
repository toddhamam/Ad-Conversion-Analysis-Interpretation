// Funnel Dashboard Types
// Types for funnel analytics data from Supabase

export type FunnelEventType =
  | 'page_view'
  | 'purchase'
  | 'upsell_accept'
  | 'upsell_decline'
  | 'downsell_accept'
  | 'downsell_decline';

export type FunnelStep =
  | 'landing'
  | 'checkout'
  | 'upsell-1'
  | 'downsell-1'
  | 'upsell-2'
  | 'thank-you';

export interface FunnelEvent {
  id: string;
  visitor_id: string;
  funnel_session_id: string;
  session_id: string | null;
  event_type: FunnelEventType;
  funnel_step: FunnelStep;
  variant: string | null;
  revenue_cents: number;
  product_slug: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface FunnelStepMetrics {
  step: FunnelStep;
  sessions: number;
  purchases: number;
  conversionRate: number;
  revenue: number;
}

export interface FunnelSummary {
  sessions: number;
  purchases: number;
  conversionRate: number;
  totalRevenue: number;
  uniqueCustomers: number;
  aovPerCustomer: number;
}

export interface ABTestMetrics {
  step: FunnelStep;
  variant: string;
  sessions: number;
  purchases: number;
  conversionRate: number;
  revenue: number;
}

export interface DashboardMetrics {
  summary: FunnelSummary;
  stepMetrics: FunnelStepMetrics[];
  abTests: ABTestMetrics[];
}
