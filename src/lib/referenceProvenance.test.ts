import { describe, it, expect } from 'vitest';
import {
  evidenceOf,
  referenceSourceOf,
  isMeasured,
  rankFlagsFor,
  buildReferenceBlock,
  hasMeasuredReference,
  partitionBySource,
  REFERENCE_PROMPT,
  type StyleReference,
} from './referenceProvenance';

function own(overrides: Partial<StyleReference> = {}): StyleReference {
  return {
    id: 'a',
    source: 'own_winner',
    data: 'AAAA',
    mimeType: 'image/jpeg',
    conversions: 0,
    conversionRate: 0,
    ...overrides,
  };
}

function external(overrides: Partial<StyleReference> = {}): StyleReference {
  return { id: 'x', source: 'external', data: 'AAAA', mimeType: 'image/jpeg', ...overrides };
}

// ---------------------------------------------------------------------------
// 1. The derivation itself
// ---------------------------------------------------------------------------

describe('evidence derivation', () => {
  it('maps each source to its evidence level', () => {
    expect(evidenceOf('own_winner')).toBe('MEASURED');
    expect(evidenceOf('own_upload')).toBe('VALIDATED');
    expect(evidenceOf('external')).toBe('HYPOTHESIS');
  });

  it('defaults a record with no source to own_winner', () => {
    // Cache entries written before `source` existed are all account ads.
    expect(referenceSourceOf({})).toBe('own_winner');
    expect(referenceSourceOf(null)).toBe('own_winner');
    expect(referenceSourceOf(undefined)).toBe('own_winner');
    expect(referenceSourceOf({ source: 'nonsense' })).toBe('own_winner');
  });

  it('round-trips the two explicit sources', () => {
    expect(referenceSourceOf({ source: 'own_upload' })).toBe('own_upload');
    expect(referenceSourceOf({ source: 'external' })).toBe('external');
  });

  it('treats only own_winner as measured', () => {
    expect(isMeasured('own_winner')).toBe(true);
    expect(isMeasured('own_upload')).toBe(false);
    expect(isMeasured('external')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. BYTE-IDENTITY GUARD — the observed path must not drift
//
// These are the exact strings the pre-provenance `buildRefConversionContext` produced.
// `toEqual` on literals, not `toContain`, so any character change fails loudly. Changing
// them changes the prompt for every existing customer.
// ---------------------------------------------------------------------------

describe('own_winner block — byte identity', () => {
  it('reproduces the legacy STYLE REFERENCE lines exactly', () => {
    const refs = [
      own({ id: '1', conversions: 120, conversionRate: 6.1 }),
      own({ id: '2', conversions: 3, conversionRate: 9.4 }),
      own({ id: '3', conversions: 0, conversionRate: 0 }),
    ];

    expect(buildReferenceBlock('own_winner', refs)).toEqual([
      'STYLE REFERENCE 1: 120 conversions (6.1% CVR) — HIGHEST CONVERTING',
      'STYLE REFERENCE 2: 3 conversions (9.4% CVR) — HIGHEST CVR',
      'STYLE REFERENCE 3: 0 conversions (0.0% CVR)',
    ]);
  });

  it('uses the singular "conversion" for exactly one', () => {
    expect(buildReferenceBlock('own_winner', [own({ conversions: 1, conversionRate: 2 })])).toEqual([
      'STYLE REFERENCE 1: 1 conversion (2.0% CVR) — HIGHEST CONVERTING',
    ]);
  });

  it('never labels a zero-conversion reference as the leader', () => {
    // A "HIGHEST CONVERTING" tag on an ad with 0 conversions is a claim about nothing.
    expect(buildReferenceBlock('own_winner', [own({ conversions: 0, conversionRate: 0 })])).toEqual([
      'STYLE REFERENCE 1: 0 conversions (0.0% CVR)',
    ]);
  });

  it('suppresses HIGHEST CVR when it lands on the HIGHEST CONVERTING reference', () => {
    // Consequence of that rule: the two labels can never appear together, because they are
    // only both eligible when they point at the same index — and then CVR is dropped. The
    // ` — HIGHEST CONVERTING, HIGHEST CVR` string is therefore unreachable, in this
    // implementation and in the one it replaced. Asserted so nobody "fixes" it by accident.
    const refs = [own({ conversions: 50, conversionRate: 9 }), own({ conversions: 2, conversionRate: 1 })];
    const block = buildReferenceBlock('own_winner', refs);

    expect(block).toEqual([
      'STYLE REFERENCE 1: 50 conversions (9.0% CVR) — HIGHEST CONVERTING',
      'STYLE REFERENCE 2: 2 conversions (1.0% CVR)',
    ]);
    expect(block.join('\n')).not.toContain('HIGHEST CONVERTING, HIGHEST CVR');
  });

  it('emits no header of its own — the image engines own that wording', () => {
    expect(REFERENCE_PROMPT.own_winner.blockHeader).toBeNull();
    expect(buildReferenceBlock('own_winner', [own()])[0]).toMatch(/^STYLE REFERENCE 1:/);
  });

  it('reproduces the legacy inline image label exactly', () => {
    expect(REFERENCE_PROMPT.own_winner.inlineLabel(0, 3, own())).toBe(
      '[STYLE REFERENCE 1 of 3] A high-converting ad. Emulate its visual style for the scene only. Do NOT copy its product, text, or subject.'
    );
  });

  it('ranks independently of array order', () => {
    const flags = rankFlagsFor([
      own({ conversions: 1, conversionRate: 9 }),
      own({ conversions: 90, conversionRate: 1 }),
    ]);
    expect(flags[0]).toEqual({ highestConv: false, highestCVR: true });
    expect(flags[1]).toEqual({ highestConv: true, highestCVR: false });
  });

  it('returns nothing for an empty set', () => {
    expect(rankFlagsFor([])).toEqual([]);
    expect(buildReferenceBlock('own_winner', [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. External block — the core honesty guarantee
// ---------------------------------------------------------------------------

describe('external block', () => {
  const block = buildReferenceBlock('external', [
    external({ advertiser: 'Acme Supplements', daysRunning: 214, firstSeenAt: '2025-01-09T00:00:00Z', lane: 'ad_library' }),
  ]).join('\n');

  it('states that nothing here is proven for this account', () => {
    expect(block).toContain('EXTERNAL INSPIRATION REFERENCES — NOT PROVEN FOR THIS ACCOUNT:');
    expect(block).toContain('There is NO conversion data for them');
    expect(block).toContain('longevity');
    expect(block).toContain('Do NOT assume the angle, claim or offer works');
  });

  it('carries the provenance the operator needs to judge it', () => {
    expect(block).toContain('Acme Supplements');
    expect(block).toContain('running 214 days');
    expect(block).toContain('first seen 2025-01-09');
    expect(block).toContain('captured via Meta Ad Library');
  });

  it('NEVER claims conversions or a CVR', () => {
    // The single most important assertion in this file. If an external reference can print a
    // conversion figure, the whole provenance model is decorative.
    expect(block).not.toContain('PROVEN CONVERSIONS');
    expect(block).not.toContain('CVR');
    expect(block).not.toContain('conversion rate');
    expect(block).not.toMatch(/\bconversions?\b(?!\s+data)/);
  });

  it('states a missing longevity signal rather than omitting it', () => {
    // Silence would read as "longevity was not relevant". The truth is "the one available
    // proof signal is absent", and the model should weight the reference accordingly.
    const noDuration = buildReferenceBlock('external', [external({ advertiser: 'Acme' })]).join('\n');
    expect(noDuration).toContain('no longevity data available');
    expect(noDuration).not.toContain('running undefined');
    expect(noDuration).not.toContain('CVR');
  });

  it('names an unknown advertiser rather than leaving a blank', () => {
    expect(buildReferenceBlock('external', [external({ daysRunning: 30 })]).join('\n')).toContain(
      'INSPIRATION 1: Unknown advertiser — running 30 days'
    );
  });

  it('labels the inline image as unproven', () => {
    const label = REFERENCE_PROMPT.external.inlineLabel(0, 2, external());
    expect(label).toContain('[INSPIRATION REFERENCE 1 of 2]');
    expect(label).toContain('NO conversion data for this account');
    expect(label).toContain('Emulate its CONSTRUCTION only');
    expect(label).not.toContain('high-converting');
  });
});

// ---------------------------------------------------------------------------
// 4. own_upload — real, but never delivered
// ---------------------------------------------------------------------------

describe('own_upload block', () => {
  const block = buildReferenceBlock('own_upload', [
    { id: 'u1', source: 'own_upload', data: 'A', mimeType: 'image/jpeg' },
  ]).join('\n');

  it('says plainly that it has no delivery data', () => {
    expect(block).toContain('operator-supplied, no delivery data');
    expect(block).toContain('BRAND REFERENCE 1: uploaded brand asset — no conversion data');
  });

  it('does not present itself as a proven winner', () => {
    expect(block).not.toContain('PROVEN CONVERSIONS');
    expect(block).not.toContain('% CVR');
    expect(block).not.toContain('high-converting');
  });
});

// ---------------------------------------------------------------------------
// 5. Set-level helpers that gate the "PROVEN CONVERSIONS" claim
// ---------------------------------------------------------------------------

describe('hasMeasuredReference', () => {
  it('is false for an external-only cold-start set', () => {
    // This is what gates the engines' "ads with PROVEN CONVERSIONS" line. Gating on total
    // reference count instead is what told cold-start accounts their competitor screenshots
    // were proven winners.
    expect(hasMeasuredReference([external(), external()])).toBe(false);
  });

  it('is false for uploads alone', () => {
    expect(hasMeasuredReference([{ id: 'u', source: 'own_upload', data: 'A', mimeType: 'image/jpeg' }])).toBe(false);
  });

  it('is true as soon as one own winner is present', () => {
    expect(hasMeasuredReference([external(), own()])).toBe(true);
  });

  it('is false for an empty set', () => {
    expect(hasMeasuredReference([])).toBe(false);
  });
});

describe('partitionBySource', () => {
  it('groups every source without dropping or duplicating a reference', () => {
    const refs = [
      own({ id: 'w1' }),
      external({ id: 'x1' }),
      { id: 'u1', source: 'own_upload' as const, data: 'A', mimeType: 'image/jpeg' },
      external({ id: 'x2' }),
    ];
    const parts = partitionBySource(refs);

    expect(parts.own_winner.map(r => r.id)).toEqual(['w1']);
    expect(parts.own_upload.map(r => r.id)).toEqual(['u1']);
    expect(parts.external.map(r => r.id)).toEqual(['x1', 'x2']);
    expect(parts.own_winner.length + parts.own_upload.length + parts.external.length).toBe(refs.length);
  });
});
