import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,

  environment: import.meta.env.MODE,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Performance monitoring: 10% in production, 100% in dev
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

  // Session replay: only record error sessions (saves free plan quota)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Only send errors in production (avoid noise during local dev)
  enabled: import.meta.env.PROD,

  // Strip sensitive data from fetch breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'fetch' && breadcrumb.data) {
      delete breadcrumb.data.request_body;
    }
    return breadcrumb;
  },

  // Filter out known non-actionable browser errors
  beforeSend(event) {
    if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
      return null;
    }
    return event;
  },
});
