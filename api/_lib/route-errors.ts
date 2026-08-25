/**
 * Report a handler failure to Sentry and return a 500.
 *
 * Shared because it was byte-identical in inspiration-handlers and showcase-handlers, and the
 * next library table would have made three. `flushSentry` is not optional here — serverless
 * functions drop queued events when the response returns.
 */
import type { VercelResponse } from '@vercel/node';
import { captureError, flushSentry } from './sentry.js';

export function failRoute(
  res: VercelResponse,
  err: unknown,
  route: string,
  organizationId?: string
) {
  captureError(err, { route: `meta/${route}`, organizationId });
  return flushSentry().then(() =>
    res.status(500).json({ error: err instanceof Error ? err.message : 'Request failed' })
  );
}
