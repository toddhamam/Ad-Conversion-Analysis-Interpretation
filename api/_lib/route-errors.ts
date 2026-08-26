/**
 * Report a handler failure to Sentry and return a useful response.
 *
 * Shared because it was byte-identical in inspiration-handlers and showcase-handlers, and the
 * next library table would have made three. `flushSentry` is not optional here — serverless
 * functions drop queued events when the response returns.
 */
import type { VercelResponse } from '@vercel/node';
import { captureError, flushSentry } from './sentry.js';

/**
 * Pull a human-readable message out of anything a handler might throw.
 *
 * `err instanceof Error` is NOT enough. Supabase surfaces PostgREST failures as a PLAIN OBJECT
 * (`{ message, details, hint, code }`), and `if (error) throw error` throws that object as-is —
 * so an instanceof check reports false and the real message is discarded. Every database
 * failure in these routes used to reach the operator as the bare string "Request failed", which
 * is indistinguishable from a network fault and says nothing about the cause.
 */
export function routeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [e.message, e.details, e.hint].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );
    if (parts.length > 0) return parts.join(' — ');
  }

  if (typeof err === 'string' && err.trim()) return err;
  return 'Request failed';
}

/**
 * True when the failure is "this table does not exist yet".
 *
 * PostgREST reports a missing table as a schema-cache miss, which in practice means a migration
 * has not been run — or was run without the trailing `NOTIFY pgrst, 'reload schema'`. `api/meta.ts`
 * already maps this to a 501 with an actionable message, but only for errors that reach its outer
 * catch; these handlers catch internally, so the mapping was unreachable for exactly the routes
 * whose tables are newest and most likely to be unprovisioned.
 */
function isMissingTable(message: string): boolean {
  return message.includes('schema cache') || message.includes('does not exist');
}

export function failRoute(
  res: VercelResponse,
  err: unknown,
  route: string,
  organizationId?: string
) {
  const message = routeErrorMessage(err);
  captureError(err, { route: `meta/${route}`, organizationId });

  return flushSentry().then(() => {
    if (isMissingTable(message)) {
      return res.status(501).json({
        error: 'Feature not yet available',
        message: 'A required database table has not been created. Run the pending migration, then `NOTIFY pgrst, \'reload schema\';`.',
      });
    }
    return res.status(500).json({ error: message });
  });
}
