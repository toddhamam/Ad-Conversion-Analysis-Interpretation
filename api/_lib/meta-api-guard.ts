/**
 * Server-side Meta API rate limit guard for backend serverless functions.
 *
 * Cannot reuse the frontend metaDevPolicyGuard.ts (browser-only, uses import.meta.env).
 * This module provides equivalent protections for server-side Meta API calls:
 *
 * - Inter-request delays (200ms minimum, more when usage is high)
 * - Rate limit header extraction (X-App-Usage, X-Business-Use-Case-Usage, x-fb-ads-insights-throttle)
 * - Meta error code classification with appropriate backoff
 * - Automatic retry for transient errors (code 2)
 * - Per-execution call budget tracking
 *
 * This file is a shared helper in api/_lib/ — it is NOT a serverless function
 * and does not count toward Vercel's 12-function limit.
 */

// ─── Rate Limit State ────────────────────────────────────────────────────────

interface RateLimitState {
  /** Total Meta API calls made in this execution. */
  callCount: number;
  /** Timestamp of the last Meta API call. */
  lastCallTime: number;
  /** Highest usage percentage from X-App-Usage header (0-100). */
  appUsagePercent: number;
  /** Highest usage percentage from X-Business-Use-Case-Usage header (0-100). */
  accountUsagePercent: number;
  /** Whether a rate limit error has been received. */
  isRateLimited: boolean;
  /** Timestamp when the rate limit resets. */
  rateLimitResetMs: number;
}

const state: RateLimitState = {
  callCount: 0,
  lastCallTime: 0,
  appUsagePercent: 0,
  accountUsagePercent: 0,
  isRateLimited: false,
  rateLimitResetMs: 0,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_DELAY_MS = 200;
const HIGH_USAGE_EXTRA_DELAY_MS = 500;
const HIGH_USAGE_THRESHOLD = 60;
const MAX_CALLS_PER_EXECUTION = 50;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [2000, 5000];

// ─── Custom Error Classes ────────────────────────────────────────────────────

export class MetaRateLimitError extends Error {
  errorCode: number;
  constructor(message: string, errorCode = 0) {
    super(message);
    this.name = 'MetaRateLimitError';
    this.errorCode = errorCode;
  }
}

export class MetaBudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaBudgetExhaustedError';
  }
}

// ─── Error Classification ────────────────────────────────────────────────────

type ErrorAction = 'rate_limit' | 'transient' | 'auth' | 'fatal';

interface MetaErrorClassification {
  action: ErrorAction;
  waitMs: number;
  retryable: boolean;
}

function classifyMetaError(errorCode: number): MetaErrorClassification {
  switch (errorCode) {
    case 4:     // App-level rate limit
    case 17:    // User-level rate limit
      return { action: 'rate_limit', waitMs: 60_000, retryable: false };
    case 80000: // Ads Insights throttled
    case 80004: // Ads Management throttled
      return { action: 'rate_limit', waitMs: 300_000, retryable: false };
    case 80003: // Too many calls to ad account
      return { action: 'rate_limit', waitMs: 120_000, retryable: false };
    case 2:     // Transient error
      return { action: 'transient', waitMs: 0, retryable: true };
    case 190:   // Auth error (expired/invalid token)
      return { action: 'auth', waitMs: 0, retryable: false };
    case 100:   // Invalid parameter
    default:
      return { action: 'fatal', waitMs: 0, retryable: false };
  }
}

// ─── Rate Limit Header Extraction ────────────────────────────────────────────

function extractRateLimitHeaders(response: Response): void {
  // X-App-Usage: {"call_count":28,"total_cputime":25,"total_time":30}
  const appUsage = response.headers.get('x-app-usage');
  if (appUsage) {
    try {
      const parsed = JSON.parse(appUsage);
      const maxUsage = Math.max(
        parsed.call_count || 0,
        parsed.total_cputime || 0,
        parsed.total_time || 0,
      );
      if (maxUsage > state.appUsagePercent) {
        state.appUsagePercent = maxUsage;
      }
    } catch {
      // Ignore malformed header
    }
  }

  // X-Business-Use-Case-Usage: {"act_123":[{"call_count":10,...}]}
  const bizUsage = response.headers.get('x-business-use-case-usage');
  if (bizUsage) {
    try {
      const parsed = JSON.parse(bizUsage);
      for (const accountEntries of Object.values(parsed)) {
        if (Array.isArray(accountEntries)) {
          for (const entry of accountEntries) {
            const e = entry as Record<string, number>;
            const maxField = Math.max(
              e.call_count || 0,
              e.total_cputime || 0,
              e.total_time || 0,
            );
            if (maxField > state.accountUsagePercent) {
              state.accountUsagePercent = maxField;
            }
          }
        }
      }
    } catch {
      // Ignore malformed header
    }
  }

  // x-fb-ads-insights-throttle: {"app_id_util_pct":N,"acc_id_util_pct":N}
  const insightsThrottle = response.headers.get('x-fb-ads-insights-throttle');
  if (insightsThrottle) {
    try {
      const parsed = JSON.parse(insightsThrottle);
      const maxPct = Math.max(
        parsed.app_id_util_pct || 0,
        parsed.acc_id_util_pct || 0,
      );
      // Treat insights throttle as account usage (it's the most restrictive)
      if (maxPct > state.accountUsagePercent) {
        state.accountUsagePercent = maxPct;
      }
    } catch {
      // Ignore malformed header
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Guarded Fetch ───────────────────────────────────────────────────────────

/**
 * Fetch a Meta Graph API URL with rate limiting, error classification, and retry.
 * Returns parsed JSON on success.
 * Throws MetaRateLimitError, MetaBudgetExhaustedError, or Error on failure.
 */
export async function guardedMetaFetchJson(url: string): Promise<any> {
  // Check call budget
  if (state.callCount >= MAX_CALLS_PER_EXECUTION) {
    throw new MetaBudgetExhaustedError(
      `Meta API call budget exhausted (${MAX_CALLS_PER_EXECUTION} calls). `
      + 'Remaining work will be processed on next cron run.',
    );
  }

  // Check if still rate limited from a previous call
  if (state.isRateLimited && Date.now() < state.rateLimitResetMs) {
    throw new MetaRateLimitError(
      `Meta API rate limited. Resets in ${Math.ceil((state.rateLimitResetMs - Date.now()) / 1000)}s.`,
    );
  }

  // Enforce minimum delay between calls
  if (state.lastCallTime > 0) {
    const elapsed = Date.now() - state.lastCallTime;
    if (elapsed < MIN_DELAY_MS) {
      await sleep(MIN_DELAY_MS - elapsed);
    }
  }

  // Extra delay when usage is getting high
  const currentUsage = Math.max(state.appUsagePercent, state.accountUsagePercent);
  if (currentUsage > HIGH_USAGE_THRESHOLD) {
    await sleep(HIGH_USAGE_EXTRA_DELAY_MS);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1] || 5000);
    }

    state.lastCallTime = Date.now();
    state.callCount++;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (networkError: unknown) {
      // Network-level error (DNS failure, connection refused, etc.)
      lastError = networkError instanceof Error
        ? networkError
        : new Error(`Network error: ${String(networkError)}`);
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    }

    extractRateLimitHeaders(response);

    // Parse response body
    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new Error(`Meta API returned non-JSON response (HTTP ${response.status})`);
    }

    // Check for error in response body
    if (json.error) {
      const errorCode = json.error.code || 0;
      const classification = classifyMetaError(errorCode);

      if (classification.action === 'rate_limit') {
        state.isRateLimited = true;
        state.rateLimitResetMs = Date.now() + classification.waitMs;
        throw new MetaRateLimitError(
          `Meta rate limit (code ${errorCode}): ${json.error.message || 'Rate limited'}`,
          errorCode,
        );
      }

      if (classification.retryable && attempt < MAX_RETRIES) {
        lastError = new Error(json.error.message || `Meta API error (code ${errorCode})`);
        continue;
      }

      // Non-retryable error
      throw new Error(json.error.message || `Meta API error (code ${errorCode})`);
    }

    // No error — success
    return json;
  }

  throw lastError || new Error('Meta API request failed after retries');
}

// ─── State Accessors ─────────────────────────────────────────────────────────

/** Get the highest usage percentage across all rate limit headers. */
export function getUsageLevel(): number {
  return Math.max(state.appUsagePercent, state.accountUsagePercent);
}

/** Check if currently rate limited. */
export function isRateLimited(): boolean {
  return state.isRateLimited && Date.now() < state.rateLimitResetMs;
}

/** Get total Meta API calls made in this execution. */
export function getCallCount(): number {
  return state.callCount;
}

/**
 * Reset all rate limit state. Call at the start of each cron/report execution
 * to ensure a fresh call budget.
 */
export function resetState(): void {
  state.callCount = 0;
  state.lastCallTime = 0;
  state.appUsagePercent = 0;
  state.accountUsagePercent = 0;
  state.isRateLimited = false;
  state.rateLimitResetMs = 0;
}
