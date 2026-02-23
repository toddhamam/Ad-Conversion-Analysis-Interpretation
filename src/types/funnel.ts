// Funnel Dashboard Types
// Types for funnel analytics data from Supabase

export type FunnelEventType =
  | 'page_view'
  | 'purchase'
  | 'order_bump_purchase'
  | 'upsell_accept'
  | 'upsell_decline'
  | 'downsell_accept'
  | 'downsell_decline';

// Dynamic — DB constraint was dropped to support configurable funnel steps
export type FunnelStep = string;

export interface FunnelEvent {
  id: string;
  visitor_id: string;
  funnel_session_id: string;
  session_id: string | null;
  event_type: FunnelEventType;
  funnel_step: FunnelStep;
  funnel_id: string;
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

export interface OrderBumpMetrics {
  purchases: number;
  takeRate: number;
  revenue: number;
}

export interface DashboardMetrics {
  summary: FunnelSummary;
  stepMetrics: FunnelStepMetrics[];
  abTests: ABTestMetrics[];
  orderBump: OrderBumpMetrics | null;
}

export interface FunnelVersionSummary {
  funnelId: string;
  funnelType: string;
  label: string;
  firstEventAt: string;
  lastEventAt: string;
  totalSessions: number;
  totalPurchases: number;
  totalRevenue: number;
  conversionRate: number;
}

export interface FunnelConfig {
  id: string;
  label: string;
  steps: FunnelStep[];
  stepNames: Record<string, string>;
  entryStep: FunnelStep;
  checkoutStep: FunnelStep;
  noMetricsSteps: FunnelStep[];
}
