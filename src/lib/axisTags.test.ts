import { describe, it, expect } from 'vitest';
import {
  buildAdName,
  parseAxisTag,
  slugifyCallout,
  deslugifyCallout,
  GRID_ANGLE_VALUES,
  CALLOUT_SLUG_MAX,
  type AxisTag,
} from './axisTags';

// The ad-name token is a PERSISTED WIRE FORMAT: it is written into Meta ad names at publish
// time and parsed back weeks later to attribute performance per axis. A change that breaks the
// round-trip silently orphans every already-published ad's attribution, with no error anywhere.

// ---------------------------------------------------------------------------
// 1. Round-trip
// ---------------------------------------------------------------------------

describe('ad-name round-trip', () => {
  it('survives for every angle', () => {
    for (const angle of GRID_ANGLE_VALUES) {
      const tag: AxisTag = { angle, hook: 'callout', format: 'static_graphic' };
      expect(parseAxisTag(buildAdName(tag, 0, 'A headline', 'image'))).toEqual(tag);
    }
  });

  it('survives with a callout', () => {
    const tag: AxisTag = { angle: 'pain', hook: 'callout', format: 'static_screenshot', callout: 'dads-over-40' };
    expect(parseAxisTag(buildAdName(tag, 3, 'Dads over 40 need this', 'image'))).toEqual(tag);
  });

  it('survives for video ads', () => {
    const tag: AxisTag = { angle: 'transformation', callout: 'busy-mums' };
    expect(parseAxisTag(buildAdName(tag, 1, 'Headline', 'video'))).toEqual(tag);
  });

  it('omits absent optional axes rather than emitting empty values', () => {
    const name = buildAdName({ angle: 'authority' }, 0, 'X', 'image');
    expect(name).toContain('[CI|a:authority]');
    expect(name).not.toContain('h:');
    expect(name).not.toContain('c:');
    expect(parseAxisTag(name)).toEqual({ angle: 'authority' });
  });
});

// ---------------------------------------------------------------------------
// 2. Legacy compatibility — already-published ads must keep attributing
// ---------------------------------------------------------------------------

describe('legacy compatibility', () => {
  it('produces a byte-identical name for a callout-less tag', () => {
    // Regression guard for every ad published before the callout axis existed.
    expect(buildAdName({ angle: 'pain', hook: 'callout', format: 'static_screenshot' }, 0, 'Foo', 'image'))
      .toBe('[CI|a:pain|h:callout|f:static_screenshot] Ad 1 - Foo');
  });

  it('leaves an untagged name completely alone', () => {
    expect(buildAdName(undefined, 0, 'Foo', 'image')).toBe('CI Ad 1 - Foo');
    expect(buildAdName(undefined, 4, 'Foo', 'video')).toBe('CI Video Ad 5 - Foo');
  });

  it('returns undefined for names with no token', () => {
    expect(parseAxisTag('CI Ad 1 - Foo')).toBeUndefined();
    expect(parseAxisTag('')).toBeUndefined();
    expect(parseAxisTag(undefined)).toBeUndefined();
  });

  it('requires a valid angle — a tag without one is not usable for attribution', () => {
    expect(parseAxisTag('[CI|h:callout|c:dads-over-40] Ad 1')).toBeUndefined();
    expect(parseAxisTag('[CI|a:not_an_angle|h:callout] Ad 1')).toBeUndefined();
  });

  it('ignores unknown keys and invalid enum values instead of failing the whole parse', () => {
    expect(parseAxisTag('[CI|a:pain|h:bogus|f:bogus|z:junk|c:dads] Ad 1')).toEqual({
      angle: 'pain',
      callout: 'dads',
    });
  });
});

// ---------------------------------------------------------------------------
// 3. The 180-char budget — truncation must never eat the token
// ---------------------------------------------------------------------------

describe('ad-name length budget', () => {
  const worstCase: AxisTag = {
    angle: 'cognitive_dissonance',      // longest angle
    hook: 'pattern_interrupt',          // longest hook
    format: 'static_screenshot',        // longest format
    callout: 'a'.repeat(CALLOUT_SLUG_MAX),
  };

  it('never exceeds 180 characters', () => {
    expect(buildAdName(worstCase, 99, 'x'.repeat(300), 'video').length).toBeLessThanOrEqual(180);
  });

  it('still parses when the readable half is truncated away', () => {
    // The token is a PREFIX and truncation is a tail operation, so the tag survives even when
    // the human-readable part is clipped to nothing. If this ever inverts, attribution breaks
    // silently for long headlines only — the worst possible failure shape.
    const name = buildAdName(worstCase, 99, 'x'.repeat(300), 'video');
    expect(parseAxisTag(name)).toEqual(worstCase);
  });
});

// ---------------------------------------------------------------------------
// 4. slugifyCallout — the only thing that may produce a `c:` value
// ---------------------------------------------------------------------------

describe('slugifyCallout', () => {
  it('slugs the canonical example', () => {
    expect(slugifyCallout('Dads over 40 need this!')).toBe('dads-over-40-need-this');
  });

  it('collapses punctuation and whitespace runs into single dashes', () => {
    expect(slugifyCallout('  Busy   mums — who   lift  ')).toBe('busy-mums-who-lift');
  });

  it('strips accents rather than mangling them', () => {
    expect(slugifyCallout('Café owners')).toBe('cafe-owners');
  });

  it('returns empty for text with nothing usable, so callers omit the token', () => {
    expect(slugifyCallout('🔥🔥🔥')).toBe('');
    expect(slugifyCallout('   ')).toBe('');
    expect(slugifyCallout('')).toBe('');
  });

  it('never leaves a trailing dash after truncation', () => {
    const slug = slugifyCallout('aaaaaaaaaaaaaaaaaaaaaaa b');
    expect(slug.length).toBeLessThanOrEqual(CALLOUT_SLUG_MAX);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('is idempotent — re-slugging an existing slug is a no-op', () => {
    const once = slugifyCallout('Dads over 40 need this!');
    expect(slugifyCallout(once)).toBe(once);
  });

  it('strips token delimiters that would corrupt the ad name', () => {
    const slug = slugifyCallout('dads|over[40]');
    expect(slug).not.toMatch(/[|[\]]/);
    expect(parseAxisTag(buildAdName({ angle: 'pain', callout: slug }, 0, 'X', 'image')))
      .toEqual({ angle: 'pain', callout: slug });
  });

  it('omits the token entirely when the callout slugs to nothing', () => {
    const name = buildAdName({ angle: 'pain', callout: '🔥' }, 0, 'X', 'image');
    expect(name).not.toContain('c:');
    expect(parseAxisTag(name)).toEqual({ angle: 'pain' });
  });
});

describe('deslugifyCallout', () => {
  it('produces a readable label when the original text is gone', () => {
    expect(deslugifyCallout('dads-over-40')).toBe('Dads Over 40');
  });

  it('tolerates empty and malformed slugs', () => {
    expect(deslugifyCallout('')).toBe('');
    expect(deslugifyCallout('--')).toBe('');
  });
});
