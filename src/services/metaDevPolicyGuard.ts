/**
 * Meta Developer Policy Guard
 *
 * Enforces Meta's Marketing API rate limits, request queuing, response caching,
 * and error classification to prevent account restrictions and bans.
 *
 * Uses a multi-layer approach:
 *   1. Request queue with concurrency control (max 3 concurrent, 200ms delay)
 *   2. In-memory response cache with TTL per endpoint type
 *   3. Rate limit header monitoring (X-App-Usage, X-Business-Use-Case-Usage)
 *   4. Error classification with appropriate backoff strategies
 *   5. Usage tracking with warnings at 80% capacity
 *
 * Reference: .context/meta-developer-policy-reference.md
 *
 * Rate limit formulas (Standard Access):
 *   Ads Insights:    600 + 400 × ActiveAds − 0.001 × UserErrors calls/hour
 *   Ads Management:  300 + 40 × ActiveAds calls/hour
 *   Application:     200 × DailyActiveUsers calls/hour
 */

// =============================================================================
// TYPES
// =============================================================================

/** Meta Business Use Case categories for rate limit tracking */
export type BusinessUseCase =
  | 'ads_insights'
  | 'ads_management'
  | 'custom_audiences'
  | 'ad_account'
  | 'pages'
  | 'general';

/** Error classification for Meta API errors */
export type MetaErrorClass =
  | 'rate_limit'
  | 'transient'
  | 'auth'
  | 'permission'
  | 'fatal'
  | 'unknown';

export interface ErrorClassification {
  class: MetaErrorClass;
  shouldRetry: boolean;
  backoffMs: number;
  maxRetries: number;
  description: string;
}

export interface RateLimitState {
  /** % of app-level call limit used (from X-App-Usage) */
  callCount: number;
  /** % of CPU time limit used (from X-App-Usage) */
  totalCpuTime: number;
  /** % of total time limit used (from X-App-Usage) */
  totalTime: number;
  /** % of app capacity used for insights (from x-fb-ads-insights-throttle) */
  appIdUtilPct: number;
  /** % of account capacity used for insights (from x-fb-ads-insights-throttle) */
  accIdUtilPct: number;
  /** Minutes until access is regained (from X-Business-Use-Case-Usage) */
  estimatedTimeToRegainAccess: number;
  /** Timestamp (ms) when estimatedTimeToRegainAccess was set — used to auto-expire */
  regainAccessSetAt: number;
  /** Timestamp of last update */
  lastUpdated: number;
}

export interface EndpointClassification {
  buc: BusinessUseCase;
  isRead: boolean;
  isCacheable: boolean;
  cacheGroup: string;
}

export interface UsageStats {
  callsLastHour: number;
  callsLastMinute: number;
  cacheHits: number;
  cacheMisses: number;
  rateLimitWarnings: number;
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
  endpoint: string;
  createdAt: number;
}

interface QueueItem {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  priority: number; // lower = higher priority. writes=0, reads=1
  enqueuedAt: number;
}

interface UsageRecord {
  timestamp: number;
  endpoint: string;
  buc: BusinessUseCase;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Max concurrent Meta API requests. Conservative to avoid bot detection. */
const MAX_CONCURRENT = 3;

/** Delay between requests in normal conditions (ms). Limits to ~5 req/s per slot. */
const INTER_REQUEST_DELAY_MS = 200;

/** Delay between requests when approaching rate limits (ms). */
const THROTTLED_DELAY_MS = 2000;

/** Percentage threshold for logging rate limit warnings. */
const WARNING_THRESHOLD = 80;

/** Percentage threshold for pausing requests. */
const BLOCKING_THRESHOLD = 95;

/** Max number of entries in the response cache. LRU eviction beyond this. */
const MAX_CACHE_ENTRIES = 100;

/** Sliding window for usage tracking (1 hour in ms). */
const USAGE_WINDOW_MS = 60 * 60 * 1000;

/** Cache TTL per endpoint type (ms). */
const CACHE_TTL: Record<string, number> = {
  insights: 5 * 60 * 1000,       // 5 min — metrics refresh every 15 min per Meta docs
  campaigns: 5 * 60 * 1000,      // 5 min
  adsets: 5 * 60 * 1000,         // 5 min
  ads: 3 * 60 * 1000,            // 3 min — creative details
  adspixels: 30 * 60 * 1000,     // 30 min — rarely changes
  datasets: 30 * 60 * 1000,      // 30 min
  customaudiences: 10 * 60 * 1000, // 10 min
  search: 5 * 60 * 1000,         // 5 min — targeting suggestions
  promote_pages: 30 * 60 * 1000, // 30 min
  adimages: 30 * 60 * 1000,      // 30 min
  default: 3 * 60 * 1000,        // 3 min fallback
};

// =============================================================================
// MODULE STATE
// =============================================================================

/** Current rate limit state from Meta response headers */
let _rateLimitState: RateLimitState = {
  callCount: 0,
  totalCpuTime: 0,
  totalTime: 0,
  appIdUtilPct: 0,
  accIdUtilPct: 0,
  estimatedTimeToRegainAccess: 0,
  regainAccessSetAt: 0,
  lastUpdated: 0,
};

/** Sliding window of API calls for usage monitoring */
const _usageHistory: UsageRecord[] = [];

/** In-memory response cache */
const _cache = new Map<string, CacheEntry>();

/** Request queue */
const _queue: QueueItem[] = [];
let _activeCount = 0;
let _lastRequestTime = 0;

/** Stats counters */
let _cacheHits = 0;
let _cacheMisses = 0;
let _rateLimitWarnings = 0;

// =============================================================================
// RATE LIMIT STATE TRACKER
// =============================================================================

/**
 * Update rate limit state from Meta API response headers.
 * Call this after every successful or failed Meta API response.
 */
export function updateRateLimitState(headers: Record<string, string>): void {
  const now = Date.now();

  // Parse X-App-Usage: { call_count, total_cputime, total_time }
  const appUsage = headers['x-app-usage'];
  if (appUsage) {
    try {
      const parsed = JSON.parse(appUsage);
      _rateLimitState.callCount = parsed.call_count || 0;
      _rateLimitState.totalCpuTime = parsed.total_cputime || 0;
      _rateLimitState.totalTime = parsed.total_time || 0;
    } catch {
      // Malformed header — ignore
    }
  }

  // Parse x-fb-ads-insights-throttle: { app_id_util_pct, acc_id_util_pct }
  const insightsThrottle = headers['x-fb-ads-insights-throttle'];
  if (insightsThrottle) {
    try {
      const parsed = JSON.parse(insightsThrottle);
      _rateLimitState.appIdUtilPct = parsed.app_id_util_pct || 0;
      _rateLimitState.accIdUtilPct = parsed.acc_id_util_pct || 0;
    } catch {
      // Malformed header — ignore
    }
  }

  // Parse X-Business-Use-Case-Usage: { "<app_id>": [{ estimated_time_to_regain_access, ... }] }
  const bucUsage = headers['x-business-use-case-usage'];
  if (bucUsage) {
    try {
      const parsed = JSON.parse(bucUsage);
      // The value is keyed by app ID — iterate all keys
      let maxTimeToRegain = 0;
      for (const appId of Object.keys(parsed)) {
        const entries = parsed[appId];
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            const time = entry.estimated_time_to_regain_access || 0;
            if (time > maxTimeToRegain) maxTimeToRegain = time;

            // Also check per-BUC usage
            const callCount = entry.call_count || 0;
            const cpuTime = entry.total_cputime || 0;
            const totalTime = entry.total_time || 0;
            const maxPct = Math.max(callCount, cpuTime, totalTime);
            if (maxPct >= WARNING_THRESHOLD) {
              _rateLimitWarnings++;
              console.warn(
                `[MetaDevPolicyGuard] BUC "${entry.type}" at ${maxPct.toFixed(1)}% capacity ` +
                `(call_count=${callCount}%, cpu=${cpuTime}%, time=${totalTime}%). ` +
                (maxTimeToRegain > 0 ? `Regain access in ${maxTimeToRegain} min.` : 'Approaching limit.')
              );
            }
          }
        }
      }
      _rateLimitState.estimatedTimeToRegainAccess = maxTimeToRegain;
      _rateLimitState.regainAccessSetAt = maxTimeToRegain > 0 ? now : 0;
    } catch {
      // Malformed header — ignore
    }
  } else {
    // No BUC header in this response — clear the regain timer so it doesn't stick forever.
    // Meta only sends estimatedTimeToRegainAccess when actively throttled; absence means clear.
    _rateLimitState.estimatedTimeToRegainAccess = 0;
    _rateLimitState.regainAccessSetAt = 0;
  }

  _rateLimitState.lastUpdated = now;

  // Warn at 80% on any metric
  const maxUsage = Math.max(
    _rateLimitState.callCount,
    _rateLimitState.totalCpuTime,
    _rateLimitState.totalTime,
    _rateLimitState.appIdUtilPct,
    _rateLimitState.accIdUtilPct
  );

  if (maxUsage >= WARNING_THRESHOLD) {
    _rateLimitWarnings++;
    console.warn(
      `[MetaDevPolicyGuard] API usage at ${maxUsage.toFixed(1)}% — approaching rate limit. ` +
      `(call=${_rateLimitState.callCount}%, cpu=${_rateLimitState.totalCpuTime}%, ` +
      `time=${_rateLimitState.totalTime}%, app_util=${_rateLimitState.appIdUtilPct}%, ` +
      `acc_util=${_rateLimitState.accIdUtilPct}%)`
    );
  }
}

/** Read-only accessor for current rate limit state. */
export function getRateLimitState(): Readonly<RateLimitState> {
  return { ..._rateLimitState };
}

/** Returns true if any rate limit metric is at or above the blocking threshold. */
export function isThrottled(): boolean {
  // If Meta told us to wait, check if the wait period has elapsed
  if (_rateLimitState.estimatedTimeToRegainAccess > 0 && _rateLimitState.regainAccessSetAt > 0) {
    const elapsedMs = Date.now() - _rateLimitState.regainAccessSetAt;
    const requiredMs = _rateLimitState.estimatedTimeToRegainAccess * 60 * 1000;
    if (elapsedMs < requiredMs) {
      return true; // Still within the wait period
    }
    // Wait period has elapsed — clear the stale timer
    _rateLimitState.estimatedTimeToRegainAccess = 0;
    _rateLimitState.regainAccessSetAt = 0;
  }

  return Math.max(
    _rateLimitState.callCount,
    _rateLimitState.totalCpuTime,
    _rateLimitState.totalTime,
    _rateLimitState.appIdUtilPct,
    _rateLimitState.accIdUtilPct
  ) >= BLOCKING_THRESHOLD;
}

/** Returns true if we should slow down (approaching limits but not blocked). */
function isApproachingLimit(): boolean {
  return Math.max(
    _rateLimitState.callCount,
    _rateLimitState.totalCpuTime,
    _rateLimitState.totalTime,
    _rateLimitState.appIdUtilPct,
    _rateLimitState.accIdUtilPct
  ) >= WARNING_THRESHOLD;
}

// =============================================================================
// USAGE TRACKING
// =============================================================================

function recordUsage(endpoint: string, buc: BusinessUseCase): void {
  const now = Date.now();
  _usageHistory.push({ timestamp: now, endpoint, buc });

  // Prune entries older than the sliding window
  const cutoff = now - USAGE_WINDOW_MS;
  while (_usageHistory.length > 0 && _usageHistory[0].timestamp < cutoff) {
    _usageHistory.shift();
  }
}

/** Get current API usage statistics. */
export function getUsageStats(): UsageStats {
  const now = Date.now();
  const oneHourAgo = now - USAGE_WINDOW_MS;
  const oneMinuteAgo = now - 60 * 1000;

  return {
    callsLastHour: _usageHistory.filter(r => r.timestamp >= oneHourAgo).length,
    callsLastMinute: _usageHistory.filter(r => r.timestamp >= oneMinuteAgo).length,
    cacheHits: _cacheHits,
    cacheMisses: _cacheMisses,
    rateLimitWarnings: _rateLimitWarnings,
  };
}

// =============================================================================
// ERROR CLASSIFIER
// =============================================================================

/**
 * Classify a Meta API error to determine retry strategy.
 * Based on Meta's documented error codes.
 */
export function classifyMetaError(
  code?: number,
  subcode?: number,
  httpStatus?: number
): ErrorClassification {
  // Rate limit errors — must back off significantly
  if (code === 4 || httpStatus === 429) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 60_000,
      maxRetries: 3,
      description: 'App-level rate limit. Stop all calls for 60s.',
    };
  }
  if (code === 17) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 60_000,
      maxRetries: 3,
      description: 'User-level rate limit. Stop calls for this user for 60s.',
    };
  }
  if (code === 32) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 60_000,
      maxRetries: 2,
      description: 'Pages API rate limit.',
    };
  }
  if (code === 80000) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 300_000, // 5 minutes
      maxRetries: 2,
      description: 'Ads Insights throttled. Wait at least 5 minutes.',
    };
  }
  if (code === 80001) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 60_000,
      maxRetries: 3,
      description: 'Pages API (system user token) throttled.',
    };
  }
  if (code === 80003) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 120_000, // 2 minutes
      maxRetries: 2,
      description: 'Too many calls to this ad account.',
    };
  }
  if (code === 80004) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 300_000, // 5 minutes
      maxRetries: 2,
      description: 'Ads Management throttled. Wait at least 5 minutes.',
    };
  }
  if (code === 80006) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 60_000,
      maxRetries: 2,
      description: 'Too many calls to this specific ad object.',
    };
  }
  if (code === 613) {
    return {
      class: 'rate_limit',
      shouldRetry: true,
      backoffMs: 60_000,
      maxRetries: 2,
      description: 'Custom rate limit breached.',
    };
  }

  // Transient errors — retry with short backoff
  if (code === 2) {
    return {
      class: 'transient',
      shouldRetry: true,
      backoffMs: 1_000,
      maxRetries: 3,
      description: 'Transient server error. Retry with exponential backoff.',
    };
  }
  if (code === 1) {
    return {
      class: 'transient',
      shouldRetry: true,
      backoffMs: 2_000,
      maxRetries: 2,
      description: 'Generic/transient error. Retry once.',
    };
  }

  // Auth errors — do NOT retry
  if (code === 190) {
    return {
      class: 'auth',
      shouldRetry: false,
      backoffMs: 0,
      maxRetries: 0,
      description: 'Expired or invalid token. Re-authenticate.',
    };
  }

  // Permission errors — do NOT retry
  if (code === 10 || code === 200 || code === 294) {
    return {
      class: 'permission',
      shouldRetry: false,
      backoffMs: 0,
      maxRetries: 0,
      description: 'Permission denied. Check OAuth scopes.',
    };
  }

  // Invalid parameter — do NOT retry
  if (code === 100) {
    return {
      class: 'fatal',
      shouldRetry: false,
      backoffMs: 0,
      maxRetries: 0,
      description: `Invalid parameter (subcode: ${subcode || 'none'}). Fix request.`,
    };
  }

  // Unknown — don't retry by default
  return {
    class: 'unknown',
    shouldRetry: false,
    backoffMs: 0,
    maxRetries: 0,
    description: `Unknown error (code: ${code}, subcode: ${subcode}, http: ${httpStatus}).`,
  };
}

// =============================================================================
// ENDPOINT CLASSIFIER
// =============================================================================

/**
 * Classify an endpoint to determine its Business Use Case, cacheability, etc.
 */
export function classifyEndpoint(endpoint: string, method?: string): EndpointClassification {
  const isWrite = method === 'POST' || method === 'DELETE' || method === 'PUT';
  const lower = endpoint.toLowerCase();

  // ── Order matters: more specific patterns MUST come before broader ones ──

  // Token/permission validation — never cache (stale results mask auth changes)
  if (lower.includes('debug_token') || lower.includes('me/permissions')) {
    return { buc: 'general', isRead: true, isCacheable: false, cacheGroup: 'default' };
  }

  // Pixel endpoints — must come before /ads check since "adspixels" contains "ads"
  if (lower.includes('adspixels') || lower.includes('datasets')) {
    return { buc: 'ad_account', isRead: true, isCacheable: true, cacheGroup: 'adspixels' };
  }

  // Ad images — must come before /ads check since "adimages" contains "ads"
  if (lower.includes('adimages')) {
    return { buc: 'ads_management', isRead: !isWrite, isCacheable: false, cacheGroup: 'adimages' };
  }

  // Ad Library search — not a standard ads management call
  if (lower.includes('ads_archive')) {
    return { buc: 'general', isRead: true, isCacheable: true, cacheGroup: 'search' };
  }

  // Custom audiences — must come before /ads check since "customaudiences" starts differently
  if (lower.includes('customaudiences')) {
    return { buc: 'custom_audiences', isRead: !isWrite, isCacheable: !isWrite, cacheGroup: 'customaudiences' };
  }

  // Insights endpoints
  if (lower.includes('/insights')) {
    return { buc: 'ads_insights', isRead: !isWrite, isCacheable: !isWrite, cacheGroup: 'insights' };
  }

  // Campaign endpoints
  if (lower.includes('/campaigns')) {
    return { buc: 'ads_management', isRead: !isWrite, isCacheable: !isWrite, cacheGroup: 'campaigns' };
  }

  // Ad set endpoints
  if (lower.includes('/adsets')) {
    return { buc: 'ads_management', isRead: !isWrite, isCacheable: !isWrite, cacheGroup: 'adsets' };
  }

  // Ad endpoints — use word boundary-style matching to avoid "adspixels", "adimages" false positives
  // Matches: "act_123/ads", "/ads/", "/ads?", "12345/ads" but NOT "adspixels", "adimages"
  if (/\/ads(?:$|\/|\?)/.test(lower) || /^act_[^/]+\/ads/.test(lower)) {
    return { buc: 'ads_management', isRead: !isWrite, isCacheable: !isWrite, cacheGroup: 'ads' };
  }

  // Targeting search
  if (lower.includes('targetingsearch') || lower.includes('/search')) {
    return { buc: 'general', isRead: true, isCacheable: true, cacheGroup: 'search' };
  }

  // Page-related — promote_pages is used for validation so shorter TTL via 'promote_pages' group
  if (lower.includes('promote_pages')) {
    return { buc: 'pages', isRead: true, isCacheable: true, cacheGroup: 'promote_pages' };
  }

  // Account/page listing (me/accounts, me/adaccounts)
  if (lower.includes('/accounts') || lower.includes('/adaccounts')) {
    return { buc: 'pages', isRead: true, isCacheable: true, cacheGroup: 'promote_pages' };
  }

  // Individual object reads (e.g., "12345678" — bare numeric ad/campaign ID with fields param)
  // Only cache if reading with fields param (creative details), not bare status checks
  if (/^\d+$/.test(endpoint.split('/')[0])) {
    return { buc: 'ads_management', isRead: !isWrite, isCacheable: !isWrite, cacheGroup: 'ads' };
  }

  // Default — don't cache unknown endpoints to avoid stale data for health/validation checks
  return { buc: 'general', isRead: !isWrite, isCacheable: false, cacheGroup: 'default' };
}

// =============================================================================
// RESPONSE CACHE (In-Memory TTL)
// =============================================================================

/**
 * Build a deterministic cache key from endpoint + params.
 */
export function buildCacheKey(
  endpoint: string,
  params?: Record<string, string>,
  adAccountId?: string
): string {
  const parts = [endpoint];
  if (adAccountId) parts.push(`acct:${adAccountId}`);
  if (params) {
    const sorted = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    parts.push(sorted);
  }
  return parts.join('|');
}

/**
 * Get a cached response if it exists and hasn't expired.
 */
export function getCached<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }

  _cacheHits++;
  return entry.data as T;
}

/**
 * Store a response in the cache with appropriate TTL.
 */
export function setCache(key: string, data: unknown, cacheGroup: string): void {
  // LRU eviction if at capacity
  if (_cache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of _cache) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey) _cache.delete(oldestKey);
  }

  const ttl = CACHE_TTL[cacheGroup] || CACHE_TTL.default;
  const now = Date.now();
  _cache.set(key, {
    data,
    expiresAt: now + ttl,
    endpoint: key,
    createdAt: now,
  });
}

/**
 * Invalidate cache entries. If pattern is provided, only matching entries are cleared.
 * Without a pattern, clears the entire cache.
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    _cache.clear();
    return;
  }

  for (const key of _cache.keys()) {
    if (key.includes(pattern)) {
      _cache.delete(key);
    }
  }
}

// =============================================================================
// REQUEST QUEUE
// =============================================================================

/**
 * Enqueue a function to be executed respecting concurrency limits and rate limits.
 * Returns a Promise that resolves with the function's result.
 */
export function enqueue<T>(fn: () => Promise<T>, priority = 1): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    _queue.push({
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      priority,
      enqueuedAt: Date.now(),
    });
    // Sort by priority (lower = higher priority), then by enqueue time
    _queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
    _processQueue();
  });
}

async function _processQueue(): Promise<void> {
  if (_activeCount >= MAX_CONCURRENT || _queue.length === 0) return;

  const item = _queue.shift();
  if (!item) return;

  _activeCount++;

  // Calculate inter-request delay
  const now = Date.now();
  const delay = isThrottled()
    ? THROTTLED_DELAY_MS * 5 // If fully throttled, wait 10s
    : isApproachingLimit()
      ? THROTTLED_DELAY_MS    // Approaching limits: 2s
      : INTER_REQUEST_DELAY_MS; // Normal: 200ms

  const timeSinceLastRequest = now - _lastRequestTime;
  if (timeSinceLastRequest < delay) {
    await new Promise(resolve => setTimeout(resolve, delay - timeSinceLastRequest));
  }

  _lastRequestTime = Date.now();

  try {
    const result = await item.execute();
    item.resolve(result);
  } catch (error: unknown) {
    item.reject(error);
  } finally {
    _activeCount--;
    // Process next items
    _processQueue();
  }
}

// =============================================================================
// BATCH PROCESSOR (Promise.all replacement)
// =============================================================================

/**
 * Process items through the guard's queue with concurrency control.
 * Replaces uncontrolled Promise.all() patterns.
 *
 * Items that fail return null in the results array. Caller must handle nulls.
 *
 * @param items Array of items to process
 * @param processor Function that processes each item
 * @param options Concurrency and delay settings (uses queue defaults if omitted)
 * @returns Array of results in the same order as items (null for failures)
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options?: { concurrency?: number; delayMs?: number }
): Promise<(R | null)[]> {
  if (items.length === 0) return [];

  const concurrency = options?.concurrency ?? MAX_CONCURRENT;
  const delayMs = options?.delayMs ?? INTER_REQUEST_DELAY_MS;
  const results: (R | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await processor(items[index]);
      } catch (error: unknown) {
        console.warn(
          `[MetaDevPolicyGuard] Batch item ${index} failed:`,
          error instanceof Error ? error.message : error
        );
        results[index] = null;
      }
      // Inter-item delay
      if (nextIndex < items.length) {
        const actualDelay = isApproachingLimit() ? Math.max(delayMs, THROTTLED_DELAY_MS) : delayMs;
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }
  }

  // Launch workers up to the concurrency limit
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

/**
 * Strict version of batchProcess — throws on first failure.
 * Use when partial results aren't useful.
 */
export async function batchProcessStrict<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options?: { concurrency?: number; delayMs?: number }
): Promise<R[]> {
  if (items.length === 0) return [];

  const concurrency = options?.concurrency ?? MAX_CONCURRENT;
  const delayMs = options?.delayMs ?? INTER_REQUEST_DELAY_MS;
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: Error | null = null;

  async function worker(): Promise<void> {
    while (nextIndex < items.length && !firstError) {
      const index = nextIndex++;
      try {
        results[index] = await processor(items[index]);
      } catch (error: unknown) {
        firstError = error instanceof Error ? error : new Error(String(error));
        return;
      }
      if (nextIndex < items.length && !firstError) {
        const actualDelay = isApproachingLimit() ? Math.max(delayMs, THROTTLED_DELAY_MS) : delayMs;
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (firstError) throw firstError;
  return results;
}

// =============================================================================
// GUARDED FETCH — Main integration point
// =============================================================================

/**
 * Options for the guarded fetch wrapper.
 */
interface GuardedFetchOptions {
  method?: string;
  params?: Record<string, string>;
  endpoint: string;
  adAccountId?: string;
  /** The actual fetch function to execute (injected by metaApi.ts) */
  fetchFn: () => Promise<{ data: unknown; headers: Record<string, string> }>;
}

/**
 * Main guard wrapper for Meta API calls. Handles:
 * 1. Cache check (for reads)
 * 2. Throttle check
 * 3. Request queuing
 * 4. Rate limit header extraction
 * 5. Usage recording
 * 6. Cache storage (for reads)
 */
export async function guardedFetch<T>(options: GuardedFetchOptions): Promise<T> {
  const classification = classifyEndpoint(options.endpoint, options.method);

  // For reads, check cache first
  if (classification.isRead && classification.isCacheable) {
    const cacheKey = buildCacheKey(options.endpoint, options.params, options.adAccountId);
    const cached = getCached<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
    _cacheMisses++;
  }

  // Check if we're throttled
  if (isThrottled()) {
    const waitTime = _rateLimitState.estimatedTimeToRegainAccess > 0
      ? _rateLimitState.estimatedTimeToRegainAccess * 60 * 1000 // minutes to ms
      : 30_000; // default 30s wait

    console.warn(
      `[MetaDevPolicyGuard] Throttled. Waiting ${Math.round(waitTime / 1000)}s before ${options.endpoint}`
    );
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  // Execute through the queue
  const priority = classification.isRead ? 1 : 0; // writes get priority
  const result = await enqueue(async () => {
    const { data, headers } = await options.fetchFn();

    // Update rate limit state from response headers
    if (headers && Object.keys(headers).length > 0) {
      updateRateLimitState(headers);
    }

    // Record usage
    recordUsage(options.endpoint, classification.buc);

    // Cache the response for reads
    if (classification.isRead && classification.isCacheable) {
      const cacheKey = buildCacheKey(options.endpoint, options.params, options.adAccountId);
      setCache(cacheKey, data, classification.cacheGroup);
    }

    // Invalidate related cache on writes
    if (!classification.isRead) {
      invalidateCache(classification.cacheGroup);
    }

    return data;
  }, priority);

  return result as T;
}

// =============================================================================
// RATE-LIMIT-AWARE RETRY
// =============================================================================

/**
 * Execute a Meta API call with rate-limit-aware retry logic.
 * Replaces the simple code-2-only retry in metaFetch().
 *
 * @param fetchFn The function to execute (should throw with metaCode on error)
 * @param endpoint For logging
 * @returns The result from fetchFn
 */
export async function retryWithBackoff<T>(
  fetchFn: () => Promise<T>,
  endpoint: string
): Promise<T> {
  let lastError: Error | null = null;

  // Initial attempt
  try {
    return await fetchFn();
  } catch (error: unknown) {
    lastError = error instanceof Error ? error : new Error(String(error));
    const metaCode = (error as { metaCode?: number }).metaCode;
    const metaSubcode = (error as { metaSubcode?: number }).metaSubcode;
    const classification = classifyMetaError(metaCode, metaSubcode);

    if (!classification.shouldRetry) {
      throw error;
    }

    // Rate limit retries
    for (let attempt = 1; attempt <= classification.maxRetries; attempt++) {
      const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
      const delay = classification.class === 'transient'
        ? Math.pow(2, attempt) * 1000 + jitter  // Exponential: 2s, 4s, 8s + jitter
        : classification.backoffMs + jitter;     // Fixed backoff for rate limits + jitter

      console.warn(
        `[MetaDevPolicyGuard] ${classification.description} ` +
        `Retrying ${endpoint} in ${Math.round(delay / 1000)}s ` +
        `(attempt ${attempt}/${classification.maxRetries})`
      );

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        return await fetchFn();
      } catch (retryError: unknown) {
        lastError = retryError instanceof Error ? retryError : new Error(String(retryError));
        // If we get a different error class on retry, re-classify
        const retryCode = (retryError as { metaCode?: number }).metaCode;
        const retryClassification = classifyMetaError(retryCode);
        if (!retryClassification.shouldRetry) {
          throw retryError;
        }
      }
    }
  }

  throw lastError || new Error(`Failed after retries: ${endpoint}`);
}

// =============================================================================
// HEADER EXTRACTION HELPER
// =============================================================================

/** Rate limit header names to extract from Meta API responses */
const RATE_LIMIT_HEADERS = [
  'x-app-usage',
  'x-business-use-case-usage',
  'x-fb-ads-insights-throttle',
] as const;

/**
 * Extract rate limit headers from a fetch Response.
 * Returns null if no rate limit headers are present.
 */
export function extractRateLimitHeaders(headers: Headers): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const headerName of RATE_LIMIT_HEADERS) {
    const val = headers.get(headerName);
    if (val) result[headerName] = val;
  }
  return Object.keys(result).length > 0 ? result : null;
}

// =============================================================================
// DEVELOPER POLICY RULES — For use in planning and code review
// =============================================================================

/**
 * Meta Developer Platform Policy rules for code review and planning.
 * Injected into planning prompts to ensure all new features comply.
 */
export const META_DEV_POLICY_RULES = {
  rateLimit: {
    maxConcurrent: MAX_CONCURRENT,
    interRequestDelayMs: INTER_REQUEST_DELAY_MS,
    throttledDelayMs: THROTTLED_DELAY_MS,
    warningThreshold: WARNING_THRESHOLD,
    blockingThreshold: BLOCKING_THRESHOLD,
    standardAccessFormulas: {
      adsInsights: '600 + 400 × ActiveAds − 0.001 × UserErrors calls/hour',
      adsManagement: '300 + 40 × ActiveAds calls/hour',
      application: '200 × DailyActiveUsers calls/hour',
    },
  },
  tokenSecurity: [
    'Never send tokens to the browser — all calls through backend proxy',
    'Encrypt tokens at rest (AES-256-GCM)',
    'Never log tokens — not even partially',
    'Use minimum required OAuth scopes',
  ],
  dataHandling: [
    'Delete user data on request',
    'Delete data when no longer necessary',
    'Never sell, license, or purchase Platform Data',
    'Maintain publicly available privacy policy',
    'Ensure service providers comply with Meta terms',
  ],
  enforcementTriggers: [
    'Excessive parallel API calls (bot-like behavior)',
    'No backoff on rate limit errors',
    'Error rate >15% over 15 days',
    '28-day API permission dormancy',
    'Circumventing previous enforcement actions',
    'Failure to respond to monitoring/audit requests',
  ],
  requiredChecks: [
    'All Meta API calls go through metaDevPolicyGuard queue',
    'All read endpoints use response caching',
    'All batch operations use batchProcess() with concurrency ≤ 5',
    'All error handling classifies Meta error codes',
    'No unbounded Promise.all() for Meta API calls',
    'Rate limit headers extracted on every response',
    'Write operations invalidate related cache entries',
  ],
} as const;

// =============================================================================
// RESET (for testing)
// =============================================================================

/** Reset all guard state. For testing only. */
export function _resetGuardState(): void {
  _rateLimitState = {
    callCount: 0,
    totalCpuTime: 0,
    totalTime: 0,
    appIdUtilPct: 0,
    accIdUtilPct: 0,
    estimatedTimeToRegainAccess: 0,
    regainAccessSetAt: 0,
    lastUpdated: 0,
  };
  _usageHistory.length = 0;
  _cache.clear();
  _queue.length = 0;
  _activeCount = 0;
  _lastRequestTime = 0;
  _cacheHits = 0;
  _cacheMisses = 0;
  _rateLimitWarnings = 0;
}
