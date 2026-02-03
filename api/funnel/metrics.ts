import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Types (duplicated here to avoid import path issues in serverless)
type FunnelStep = 'landing' | 'checkout' | 'upsell-1' | 'downsell-1' | 'upsell-2' | 'thank-you';

interface FunnelStepMetrics {
  step: FunnelStep;
  sessions: number;
  purchases: number;
  conversionRate: number;
  revenue: number;
}

interface FunnelSummary {
  sessions: number;
  purchases: number;
  conversionRate: number;
  totalRevenue: number;
  uniqueCustomers: number;
  aovPerCustomer: number;
}

interface ABTestMetrics {
  step: FunnelStep;
  variant: string;
  sessions: number;
  purchases: number;
  conversionRate: number;
  revenue: number;
}

interface DashboardMetrics {
  summary: FunnelSummary;
  stepMetrics: FunnelStepMetrics[];
  abTests: ABTestMetrics[];
}

// Ordered funnel steps for consistent display
const FUNNEL_STEPS: FunnelStep[] = [
  'landing',
  'checkout',
  'upsell-1',
  'downsell-1',
  'upsell-2',
  'thank-you',
];

interface StepData {
  step: FunnelStep;
  sessions: number;
  purchases: number;
  revenue: number;
}

interface ABData {
  step: FunnelStep;
  variant: string;
  sessions: number;
  purchases: number;
  revenue: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse date range (default to last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const startDate = (req.query.startDate as string) || thirtyDaysAgo.toISOString();
    const endDate = (req.query.endDate as string) || now.toISOString();

    // Create Supabase client inline (with env var check)
    const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (!supabase) {
      // Return empty metrics when Supabase is not configured
      return res.status(200).json({
        summary: { sessions: 0, purchases: 0, conversionRate: 0, totalRevenue: 0, uniqueCustomers: 0, aovPerCustomer: 0 },
        stepMetrics: FUNNEL_STEPS.map((step) => ({ step, sessions: 0, purchases: 0, conversionRate: 0, revenue: 0 })),
        abTests: [],
      } as DashboardMetrics);
    }

    // Query all events in date range
    const { data: events, error } = await supabase
      .from('funnel_events')
      .select('funnel_step, event_type, revenue_cents, funnel_session_id, variant')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) {
      console.error('[Funnel Metrics API] Error fetching events:', error);
      return res.status(500).json({ error: `Failed to fetch metrics: ${error.message}` });
    }

    // Process events into metrics
    const stepDataMap = new Map<FunnelStep, StepData>();
    const abDataMap = new Map<string, ABData>();
    const uniqueSessions = new Set<string>();
    const purchaseSessions = new Set<string>();
    let totalRevenue = 0;

    // Initialize step data
    for (const step of FUNNEL_STEPS) {
      stepDataMap.set(step, {
        step,
        sessions: 0,
        purchases: 0,
        revenue: 0,
      });
    }

    // Track sessions per step to avoid double counting
    const stepSessions = new Map<FunnelStep, Set<string>>();
    for (const step of FUNNEL_STEPS) {
      stepSessions.set(step, new Set());
    }

    // Process each event
    for (const event of events || []) {
      const step = event.funnel_step as FunnelStep;
      const stepData = stepDataMap.get(step);
      if (!stepData) continue;

      // Track unique sessions for this step (via page_view events)
      if (event.event_type === 'page_view') {
        const stepSessionSet = stepSessions.get(step);
        if (stepSessionSet && !stepSessionSet.has(event.funnel_session_id)) {
          stepSessionSet.add(event.funnel_session_id);
          stepData.sessions++;
        }

        // Track overall unique sessions (at landing page)
        if (step === 'landing') {
          uniqueSessions.add(event.funnel_session_id);
        }
      }

      // Track purchases and revenue
      const isPurchase = ['purchase', 'upsell_accept', 'downsell_accept'].includes(event.event_type);
      if (isPurchase) {
        stepData.purchases++;
        stepData.revenue += event.revenue_cents || 0;
        totalRevenue += event.revenue_cents || 0;

        // Track unique purchasing sessions (for checkout purchases)
        if (event.event_type === 'purchase') {
          purchaseSessions.add(event.funnel_session_id);
        }
      }

      // Track A/B test data if variant exists
      if (event.variant) {
        const abKey = `${step}:${event.variant}`;
        let abData = abDataMap.get(abKey);

        if (!abData) {
          abData = {
            step,
            variant: event.variant,
            sessions: 0,
            purchases: 0,
            revenue: 0,
          };
          abDataMap.set(abKey, abData);
        }

        if (event.event_type === 'page_view') {
          abData.sessions++;
        }

        if (isPurchase) {
          abData.purchases++;
          abData.revenue += event.revenue_cents || 0;
        }
      }
    }

    // Build step metrics with conversion rates
    const stepMetrics: FunnelStepMetrics[] = FUNNEL_STEPS.map((step) => {
      const data = stepDataMap.get(step)!;
      return {
        step,
        sessions: data.sessions,
        purchases: data.purchases,
        conversionRate: data.sessions > 0 ? (data.purchases / data.sessions) * 100 : 0,
        revenue: data.revenue / 100, // Convert cents to dollars
      };
    });

    // Build summary
    const totalSessions = uniqueSessions.size;
    const totalPurchases = purchaseSessions.size;
    const uniqueCustomers = purchaseSessions.size;

    const summary: FunnelSummary = {
      sessions: totalSessions,
      purchases: totalPurchases,
      conversionRate: totalSessions > 0 ? (totalPurchases / totalSessions) * 100 : 0,
      totalRevenue: totalRevenue / 100, // Convert cents to dollars
      uniqueCustomers,
      aovPerCustomer: uniqueCustomers > 0 ? (totalRevenue / 100) / uniqueCustomers : 0,
    };

    // Build A/B test metrics
    const abTests: ABTestMetrics[] = Array.from(abDataMap.values()).map((data) => ({
      step: data.step,
      variant: data.variant,
      sessions: data.sessions,
      purchases: data.purchases,
      conversionRate: data.sessions > 0 ? (data.purchases / data.sessions) * 100 : 0,
      revenue: data.revenue / 100, // Convert cents to dollars
    }));

    const metrics: DashboardMetrics = {
      summary,
      stepMetrics,
      abTests,
    };

    return res.status(200).json(metrics);
  } catch (error) {
    console.error('[Funnel Metrics API] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
