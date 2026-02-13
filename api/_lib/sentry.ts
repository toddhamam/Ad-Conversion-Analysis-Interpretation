import * as Sentry from '@sentry/node';

let isInitialized = false;

/**
 * Initialize Sentry for serverless functions.
 * Runs once per cold start (module-level).
 */
export function initSentry(): void {
  if (isInitialized) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA
      ? `convertra@${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
      : undefined,
    tracesSampleRate: 0.2,

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null;
      }
      return breadcrumb;
    },
  });

  isInitialized = true;
}

/**
 * Capture an exception in Sentry with optional context.
 * Safe to call even when Sentry is not configured.
 */
export function captureError(
  error: unknown,
  context?: {
    route?: string;
    organizationId?: string;
    userId?: string;
    extra?: Record<string, unknown>;
  },
): void {
  if (!process.env.SENTRY_DSN) return;
  initSentry();

  Sentry.withScope((scope) => {
    if (context?.route) {
      scope.setTag('api.route', context.route);
    }
    if (context?.organizationId) {
      scope.setTag('organization_id', context.organizationId);
    }
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.extra) {
      scope.setExtras(context.extra);
    }

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureException(new Error(String(error)));
    }
  });
}

/**
 * Flush Sentry events before the serverless function terminates.
 * Must be called before returning responses in catch blocks.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  await Sentry.flush(timeout);
}
