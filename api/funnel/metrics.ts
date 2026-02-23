import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { initSentry, captureError, flushSentry } from '../_lib/sentry.js';

initSentry();

// Auth Supabase — Convertra's database (JWT verification, user profiles)
const authSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Funnel Supabase — funnel site's database (authoritative funnel_events source)
// Falls back to Convertra's Supabase if funnel-specific env vars aren't set
const funnelSupabase = process.env.FUNNEL_SUPABASE_URL && process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.FUNNEL_SUPABASE_URL, process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY)
  : authSupabase;

/** Verify JWT Bearer token is valid (auth gate — funnel_events has no org column) */
async function isAuthenticated(req: VercelRequest): Promise<boolean> {
  if (!authSupabase) return false;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const { data: { user }, error } = await authSupabase.auth.getUser(token);
  return !error && !!user;
}

// Funnel step configs — defines step order and display for each funnel type
const FUNNEL_CONFIGS: Record<string, {
  steps: string[];
  entryStep: string;
  checkoutStep: string;
  noMetricsSteps: string[];
}> = {
  main: {
    steps: ['landing', 'checkout', 'upsell-1', 'downsell-1', 'upsell-2', 'thank-you'],
    entryStep: 'landing',
    checkoutStep: 'checkout',
    noMetricsSteps: ['landing', 'thank-you'],
  },
  free: {
    steps: ['free-optin', 'free-offer', 'free-checkout', 'free-upsell-1', 'free-downsell-1', 'free-upsell-2', 'free-thank-you'],
    entryStep: 'free-optin',
    checkoutStep: 'free-checkout',
    noMetricsSteps: ['free-optin', 'free-thank-you'],
  },
};

/** Derive funnel type from funnel_id (e.g. 'main-v2' → 'main', 'free-v1' → 'free') */
function getFunnelType(funnelId: string): string {
  const match = funnelId.match(/^(.+?)-v\d+$/);
  return match ? match[1] : funnelId;
}

/** Get ordered steps for a funnel type, falling back to main config */
function getStepsForType(funnelType: string): string[] {
  return FUNNEL_CONFIGS[funnelType]?.steps || FUNNEL_CONFIGS.main.steps;
}

/** Get entry step for a funnel type */
function getEntryStep(funnelType: string): string {
  return FUNNEL_CONFIGS[funnelType]?.entryStep || 'landing';
}

/** Get checkout step for a funnel type */
function getCheckoutStep(funnelType: string): string {
  return FUNNEL_CONFIGS[funnelType]?.checkoutStep || 'checkout';
}

// Types (duplicated here to avoid import path issues in serverless)
interface FunnelStepMetrics {
  step: string;
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
  step: string;
  variant: string;
  sessions: number;
  purchases: number;
  conversionRate: number;
  revenue: number;
}

interface OrderBumpMetrics {
  purchases: number;
  takeRate: number;
  revenue: number;
}

interface DashboardMetrics {
  summary: FunnelSummary;
  stepMetrics: FunnelStepMetrics[];
  abTests: ABTestMetrics[];
  orderBump: OrderBumpMetrics | null;
}

interface FunnelVersionSummary {
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

interface StepData {
  step: string;
  sessions: number;
  purchases: number;
  revenue: number;
}

interface ABData {
  step: string;
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

    // Optional funnel filters
    const funnelId = req.query.funnelId as string | undefined;
    const funnelType = req.query.funnel as string | undefined;
    const discover = req.query.discover === 'true';
    const debug = req.query.debug === 'true';

    // Diagnostic endpoint — shows which Supabase is being used
    if (debug) {
      const hasFunnelEnv = !!(process.env.FUNNEL_SUPABASE_URL && process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY);
      const hasAuthEnv = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
      return res.status(200).json({
        funnelSource: hasFunnelEnv ? 'separate_funnel_supabase' : 'convertra_fallback',
        funnelUrlSet: !!process.env.FUNNEL_SUPABASE_URL,
        funnelKeySet: !!process.env.FUNNEL_SUPABASE_SERVICE_ROLE_KEY,
        authUrlSet: hasAuthEnv,
        funnelSupabaseReady: !!funnelSupabase,
        authSupabaseReady: !!authSupabase,
      });
    }

    if (!funnelSupabase || !authSupabase) {
      if (discover) return res.status(200).json({ funnels: [] });
      return res.status(200).json(buildEmptyMetrics('main'));
    }

    // Require valid JWT — funnel_events table has no organization_id column,
    // so we auth-gate instead. Funnels page is also behind SuperAdminRoute.
    const authed = await isAuthenticated(req);
    if (!authed) {
      if (discover) return res.status(200).json({ funnels: [] });
      return res.status(200).json(buildEmptyMetrics('main'));
    }

    // Route: discover funnel versions
    if (discover) {
      return await handleDiscover(req, res, startDate, endDate);
    }

    // Route: metrics (default)
    return await handleMetrics(req, res, startDate, endDate, funnelId, funnelType);
  } catch (error: unknown) {
    console.error('[Funnel Metrics API] Error:', error);
    captureError(error, { route: 'funnel/metrics' });
    await flushSentry();
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** Build empty metrics response for a given funnel type */
function buildEmptyMetrics(fType: string): DashboardMetrics {
  const steps = getStepsForType(fType);
  return {
    summary: { sessions: 0, purchases: 0, conversionRate: 0, totalRevenue: 0, uniqueCustomers: 0, aovPerCustomer: 0 },
    stepMetrics: steps.map((step) => ({ step, sessions: 0, purchases: 0, conversionRate: 0, revenue: 0 })),
    abTests: [],
    orderBump: null,
  };
}

/** Handle funnel version discovery */
async function handleDiscover(
  _req: VercelRequest,
  res: VercelResponse,
  startDate: string,
  endDate: string,
): Promise<VercelResponse> {
  const { data: events, error } = await funnelSupabase!
    .from('funnel_events')
    .select('funnel_id, funnel_session_id, funnel_step, event_type, revenue_cents, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) {
    console.error('[Funnel Metrics API] Discovery error:', error);
    return res.status(500).json({ error: `Failed to discover funnels: ${error.message}` });
  }

  // Group events by funnel_id
  const funnelMap = new Map<string, {
    sessions: Set<string>;
    purchaseSessions: Set<string>;
    totalRevenueCents: number;
    firstEvent: string;
    lastEvent: string;
  }>();

  for (const event of events || []) {
    const fid = event.funnel_id || 'main-v1';
    const fType = getFunnelType(fid);
    const validSteps = FUNNEL_CONFIGS[fType]?.steps;

    // Skip events whose step doesn't belong to this funnel type's config.
    // This filters out free funnel events incorrectly tagged as main-v1.
    if (validSteps && event.funnel_step && !validSteps.includes(event.funnel_step)) {
      continue;
    }

    let bucket = funnelMap.get(fid);
    if (!bucket) {
      bucket = {
        sessions: new Set(),
        purchaseSessions: new Set(),
        totalRevenueCents: 0,
        firstEvent: event.created_at,
        lastEvent: event.created_at,
      };
      funnelMap.set(fid, bucket);
    }

    bucket.sessions.add(event.funnel_session_id);

    if (event.created_at < bucket.firstEvent) bucket.firstEvent = event.created_at;
    if (event.created_at > bucket.lastEvent) bucket.lastEvent = event.created_at;

    const isPurchase = ['purchase', 'order_bump_purchase', 'upsell_accept', 'downsell_accept'].includes(event.event_type);
    if (isPurchase) {
      bucket.purchaseSessions.add(event.funnel_session_id);
      bucket.totalRevenueCents += event.revenue_cents || 0;
    }
  }

  // Build summaries
  const funnels: FunnelVersionSummary[] = Array.from(funnelMap.entries())
    .map(([fid, bucket]) => {
      const totalSessions = bucket.sessions.size;
      const totalPurchases = bucket.purchaseSessions.size;
      const totalRevenue = bucket.totalRevenueCents / 100;
      const fType = getFunnelType(fid);
      return {
        funnelId: fid,
        funnelType: fType,
        label: fid,
        firstEventAt: bucket.firstEvent,
        lastEventAt: bucket.lastEvent,
        totalSessions,
        totalPurchases,
        totalRevenue,
        conversionRate: totalSessions > 0 ? (totalPurchases / totalSessions) * 100 : 0,
      };
    })
    .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));

  return res.status(200).json({ funnels });
}

/** Handle metrics aggregation */
async function handleMetrics(
  _req: VercelRequest,
  res: VercelResponse,
  startDate: string,
  endDate: string,
  funnelId?: string,
  funnelType?: string,
): Promise<VercelResponse> {
  // Build query against funnel site's Supabase (authoritative data source)
  let query = funnelSupabase!
    .from('funnel_events')
    .select('funnel_step, event_type, revenue_cents, funnel_session_id, variant, funnel_id')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  // Apply funnel filters
  if (funnelId) {
    query = query.eq('funnel_id', funnelId);
  } else if (funnelType) {
    // Prefix match: 'main' matches 'main-v1', 'main-v2'
    query = query.like('funnel_id', `${funnelType}-%`);
  }

  const { data: events, error } = await query;

  if (error) {
    console.error('[Funnel Metrics API] Error fetching events:', error);
    return res.status(500).json({ error: `Failed to fetch metrics: ${error.message}` });
  }

  // Determine which funnel type we're looking at (for step ordering)
  let resolvedType = 'main';
  if (funnelId) {
    resolvedType = getFunnelType(funnelId);
  } else if (funnelType) {
    resolvedType = funnelType;
  } else if (events && events.length > 0) {
    // Auto-detect from most common funnel_id in the data
    const fIdCounts = new Map<string, number>();
    for (const e of events) {
      const fid = e.funnel_id || 'main-v1';
      fIdCounts.set(fid, (fIdCounts.get(fid) || 0) + 1);
    }
    let maxCount = 0;
    let maxFid = 'main-v1';
    for (const [fid, count] of fIdCounts) {
      if (count > maxCount) { maxCount = count; maxFid = fid; }
    }
    resolvedType = getFunnelType(maxFid);
  }

  const configuredSteps = getStepsForType(resolvedType);
  const entryStep = getEntryStep(resolvedType);
  const checkoutStep = getCheckoutStep(resolvedType);

  // Process events into metrics
  const stepDataMap = new Map<string, StepData>();
  const abDataMap = new Map<string, ABData>();
  const uniqueSessions = new Set<string>();
  const purchaseSessions = new Set<string>();
  let totalRevenue = 0;

  // When filtering by a specific funnel, only accept steps that belong to that funnel type.
  // This prevents free funnel steps (e.g. free-optin) from leaking into main-v1 results
  // when historical events were all tagged with DEFAULT 'main-v1'.
  const validStepsSet = (funnelId || funnelType) ? new Set(configuredSteps) : null;

  // Initialize known steps
  for (const step of configuredSteps) {
    stepDataMap.set(step, { step, sessions: 0, purchases: 0, revenue: 0 });
  }

  // Track sessions per step to avoid double counting
  const stepSessions = new Map<string, Set<string>>();
  for (const step of configuredSteps) {
    stepSessions.set(step, new Set());
  }

  // Order bump tracking
  let orderBumpPurchases = 0;
  let orderBumpRevenue = 0;
  let checkoutSessions = 0;

  // Process each event
  for (const event of events || []) {
    const step = event.funnel_step as string;

    // Skip events whose step doesn't belong to this funnel type's config
    if (validStepsSet && !validStepsSet.has(step)) {
      continue;
    }

    // Ensure step data exists (handles steps not in config — only reachable when no filter)
    if (!stepDataMap.has(step)) {
      stepDataMap.set(step, { step, sessions: 0, purchases: 0, revenue: 0 });
      stepSessions.set(step, new Set());
    }

    const stepData = stepDataMap.get(step)!;

    // Track unique sessions for this step (via page_view events)
    if (event.event_type === 'page_view') {
      const stepSessionSet = stepSessions.get(step)!;
      if (!stepSessionSet.has(event.funnel_session_id)) {
        stepSessionSet.add(event.funnel_session_id);
        stepData.sessions++;
      }

      // Track overall unique sessions (at entry step)
      if (step === entryStep) {
        uniqueSessions.add(event.funnel_session_id);
      }

      // Track checkout sessions for order bump take rate
      if (step === checkoutStep) {
        checkoutSessions++;
      }
    }

    // Track order bump purchases
    if (event.event_type === 'order_bump_purchase') {
      orderBumpPurchases++;
      orderBumpRevenue += event.revenue_cents || 0;
      totalRevenue += event.revenue_cents || 0;
      continue; // Don't count as regular purchase
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
        abData = { step, variant: event.variant, sessions: 0, purchases: 0, revenue: 0 };
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

  // Build step metrics — configured steps first (in order), then any extra steps found in data
  const orderedSteps = [...configuredSteps];
  for (const step of stepDataMap.keys()) {
    if (!orderedSteps.includes(step)) {
      orderedSteps.push(step);
    }
  }

  const stepMetrics: FunnelStepMetrics[] = orderedSteps.map((step) => {
    const data = stepDataMap.get(step) || { step, sessions: 0, purchases: 0, revenue: 0 };
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

  // Build order bump metrics
  const orderBump: OrderBumpMetrics | null = orderBumpPurchases > 0
    ? {
        purchases: orderBumpPurchases,
        takeRate: checkoutSessions > 0 ? (orderBumpPurchases / checkoutSessions) * 100 : 0,
        revenue: orderBumpRevenue / 100,
      }
    : null;

  const metrics: DashboardMetrics = {
    summary,
    stepMetrics,
    abTests,
    orderBump,
  };

  return res.status(200).json(metrics);
}
