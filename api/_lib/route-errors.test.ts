// Message extraction for library-route failures.
//
// The bug this exists to prevent: Supabase surfaces PostgREST failures as a PLAIN OBJECT, not an
// Error, and the handlers throw it as-is. An `err instanceof Error` check therefore reports false
// and discards the real message, so every database fault reached the operator as the bare string
// "Request failed" — indistinguishable from a network drop, and silent about the actual cause
// (which, for a newly added table, is almost always a migration that has not been run).
import { describe, it, expect } from 'vitest';
import { routeErrorMessage } from './route-errors';

/** What supabase-js actually hands back in `{ data, error }`. Not an Error instance. */
const postgrestError = (over: Record<string, unknown> = {}) => ({
  message: 'relation "public.showcase_assets" does not exist',
  details: null,
  hint: null,
  code: '42P01',
  ...over,
});

describe('routeErrorMessage', () => {
  it('reads the message off a PostgREST error object', () => {
    // The whole point: this shape is not an Error, and used to fall through to the generic
    // string, hiding the one fact the operator needed.
    expect(routeErrorMessage(postgrestError())).toBe(
      'relation "public.showcase_assets" does not exist'
    );
  });

  it('surfaces the schema-cache miss verbatim, so a missing migration is diagnosable', () => {
    const err = postgrestError({
      message: "Could not find the table 'public.showcase_assets' in the schema cache",
    });
    expect(routeErrorMessage(err)).toContain('schema cache');
  });

  it('appends details and hint when PostgREST supplies them', () => {
    const err = postgrestError({
      message: 'duplicate key value violates unique constraint',
      details: 'Key (content_hash)=(abc) already exists.',
      hint: 'Use upsert.',
    });
    expect(routeErrorMessage(err)).toBe(
      'duplicate key value violates unique constraint — Key (content_hash)=(abc) already exists. — Use upsert.'
    );
  });

  it('still reads a real Error', () => {
    expect(routeErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('accepts a thrown string', () => {
    expect(routeErrorMessage('something broke')).toBe('something broke');
  });

  it('falls back only when there is genuinely nothing to report', () => {
    // Blank strings must not win over the fallback — an empty error banner is worse than a
    // generic one, because it reads as a rendering fault rather than a failure.
    for (const nothing of [null, undefined, {}, { message: '' }, { message: '   ' }, 42, '']) {
      expect(routeErrorMessage(nothing), String(nothing)).toBe('Request failed');
    }
  });

  it('ignores non-string message fields rather than stringifying them', () => {
    expect(routeErrorMessage({ message: { nested: true } })).toBe('Request failed');
  });
});
