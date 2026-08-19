import { describe, it, expect } from 'vitest';
import {
  planAnalysisRun,
  analysisModeOf,
  isSeeded,
  buildObservedAnalysis,
  buildSeededAnalysis,
  mergeHybridAnalysis,
  extractSeedConstraints,
  unapplySeed,
} from './analysisMode';
import { observedFixture, seedFixture } from '../test/fixtures';

// ---------------------------------------------------------------------------
// 1. Run planning — the four account states in the acceptance criteria
// ---------------------------------------------------------------------------

describe('planAnalysisRun — the four account states', () => {
  const seed = seedFixture();

  it('ads, no seed → observed', () => {
    expect(planAnalysisRun({ hasAds: true, seed: null })).toEqual({ mode: 'observed' });
  });

  it('no ads, seed → seeded (no longer an error), carrying the seed', () => {
    expect(planAnalysisRun({ hasAds: false, seed })).toEqual({ mode: 'seeded', seed });
  });

  it('ads and seed → hybrid, carrying the seed', () => {
    expect(planAnalysisRun({ hasAds: true, seed })).toEqual({ mode: 'hybrid', seed });
  });

  it('no ads, no seed → none, the only state where the no-ads error is accurate', () => {
    expect(planAnalysisRun({ hasAds: false, seed: null })).toEqual({ mode: 'none' });
  });

  it('never silently downgrades hybrid to seeded or vice versa', () => {
    expect(planAnalysisRun({ hasAds: true, seed }).mode).not.toBe('seeded');
    expect(planAnalysisRun({ hasAds: false, seed }).mode).not.toBe('hybrid');
  });
});

describe('analysisModeOf / isSeeded', () => {
  it('treats records written before modes existed as observed', () => {
    const legacy = observedFixture();
    delete legacy.analysisMode;
    expect(analysisModeOf(legacy)).toBe('observed');
    expect(isSeeded(legacy)).toBe(false);
  });

  it('handles null/undefined without throwing', () => {
    expect(analysisModeOf(null)).toBe('observed');
    expect(isSeeded(undefined)).toBe(false);
  });

  it('identifies a seeded record', () => {
    expect(isSeeded(buildSeededAnalysis(seedFixture()))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Observed mode must not regress
// ---------------------------------------------------------------------------

describe('buildObservedAnalysis — observed output is unchanged', () => {
  it('passes every pre-existing field through untouched', () => {
    const input = observedFixture();
    const output = buildObservedAnalysis(input);

    // Strip the one additive marker; what remains must be byte-identical to the input.
    const { analysisMode, ...rest } = output;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(input));
    expect(analysisMode).toBe('observed');
  });

  it('does not mutate its input', () => {
    const input = observedFixture();
    const snapshot = JSON.stringify(input);
    buildObservedAnalysis(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('keeps the health score for an account that has delivery data', () => {
    expect(buildObservedAnalysis(observedFixture()).overallHealthScore).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 3. Seeded mode
// ---------------------------------------------------------------------------

describe('buildSeededAnalysis', () => {
  const seeded = buildSeededAnalysis(seedFixture(), { now: '2026-08-18T19:00:00.000Z' });

  it('emits the same output contract as an observed analysis', () => {
    for (const key of Object.keys(observedFixture())) {
      expect(Object.keys(seeded)).toContain(key);
    }
  });

  it('returns empty collections rather than omitting measured-only fields', () => {
    expect(seeded.headlineImageAnalysis).toEqual([]);
    expect(seeded.bottomAds).toEqual([]);
    expect(seeded.performanceBreakdown.totalAdsAnalyzed).toBe(0);
    expect(seeded.performanceBreakdown.totalSpend).toBe(0);
  });

  it('emits NO health score — a score here would be scoring the absence of data', () => {
    expect(seeded.overallHealthScore).toBeNull();
  });

  it('preserves the seed’s forward-looking content and constraints', () => {
    expect(seeded.analysisMode).toBe('seeded');
    expect(seeded.winningPatterns.headlines).toContain('The 3am spiral');
    expect(seeded.seedConstraints?.claimGuardrails).toContain('Never promise a cure');
  });

  it('does not invent ad data', () => {
    expect(seeded.topAds.every(ad => ad.conversionRate === 0)).toBe(true);
    expect(seeded.axisInsights).toBeUndefined();
    expect(seeded.creativeFatigue).toBeUndefined();
  });

  it('is idempotent apart from the run timestamp', () => {
    const again = buildSeededAnalysis(seeded, { now: '2026-08-18T19:00:00.000Z' });
    expect(JSON.stringify(again)).toBe(JSON.stringify(seeded));
  });
});

// ---------------------------------------------------------------------------
// 4. Hybrid mode
// ---------------------------------------------------------------------------

describe('mergeHybridAnalysis', () => {
  const merged = mergeHybridAnalysis(buildObservedAnalysis(observedFixture()), seedFixture());

  it('keeps observed data authoritative for what performs', () => {
    expect(merged.analysisMode).toBe('hybrid');
    expect(merged.overallHealthScore).toBe(7);
    expect(merged.performanceBreakdown.totalAdsAnalyzed).toBe(42);
    expect(merged.winningPatterns.headlines).toEqual(['Question openers']);
    expect(merged.topAds[0].id).toBe('ad_1');
  });

  it('keeps the seed’s voice authoritative and preserves the observed voice as reference', () => {
    expect(merged.brandVoice?.tonality).toBe('Warm, plainspoken, never clinical');
    expect(merged.observedBrandVoice?.tonality).toBe('Confident, clinical');
  });

  it('does not silently discard the seed’s constraints', () => {
    expect(merged.seedConstraints?.bannedVocabulary).toContain('biohack');
    expect(merged.losingPatterns.copyElements).toContain('biohack');
    expect(merged.losingPatterns.issues).toContain('Never promise a cure');
    expect(merged.losingPatterns.headlines).toContain('Clickbait numbers');
    expect(merged.audienceInsights.whatDoesntWork).toContain('Discipline framing');
  });

  it('keeps the observed avoid-lists as well as the seed’s', () => {
    expect(merged.losingPatterns.issues).toContain('Buries the offer');
    expect(merged.audienceInsights.whatDoesntWork).toContain('Status appeals');
  });

  it('dedupes unioned lists case-insensitively, observed entry winning', () => {
    const observed = buildObservedAnalysis(observedFixture());
    observed.losingPatterns.issues = ['Never Promise A Cure', 'Buries the offer'];
    const out = mergeHybridAnalysis(observed, seedFixture());
    expect(out.losingPatterns.issues.filter(i => /never promise a cure/i.test(i))).toEqual([
      'Never Promise A Cure',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Constraint extraction
// ---------------------------------------------------------------------------

describe('extractSeedConstraints', () => {
  it('derives constraints from a seed that has no explicit constraints block', () => {
    const seed = seedFixture();
    delete seed.seedConstraints;
    const constraints = extractSeedConstraints(seed);
    expect(constraints.bannedVocabulary).toContain('Hype adjectives');
    expect(constraints.claimGuardrails).toContain('Never promise a cure');
    expect(constraints.claimGuardrails).toContain('Discipline framing');
    expect(constraints.avoidHeadlinePatterns).toContain('Clickbait numbers');
    expect(constraints.brandVoice?.tonality).toBe('Warm, plainspoken, never clinical');
  });

  it('prefers an explicit constraints block over derived values', () => {
    expect(extractSeedConstraints(seedFixture()).bannedVocabulary).toContain('biohack');
  });

  it('drops blank entries', () => {
    const seed = seedFixture();
    delete seed.seedConstraints;
    seed.losingPatterns.copyElements = ['  ', 'Hype adjectives'];
    expect(extractSeedConstraints(seed).bannedVocabulary).toEqual(['Hype adjectives']);
  });
});

// ---------------------------------------------------------------------------
// 6. Removing a seed
// ---------------------------------------------------------------------------

describe('unapplySeed', () => {
  it('drops a seeded analysis entirely — it IS the seed', () => {
    expect(unapplySeed(buildSeededAnalysis(seedFixture()))).toBeNull();
  });

  it('leaves a purely observed analysis untouched', () => {
    const observed = buildObservedAnalysis(observedFixture());
    expect(unapplySeed(observed)).toBe(observed);
  });

  it('strips the seed out of a hybrid analysis but keeps the measured half', () => {
    const hybrid = mergeHybridAnalysis(buildObservedAnalysis(observedFixture()), seedFixture());
    const stripped = unapplySeed(hybrid)!;

    // The seed stops steering generation immediately, not at the next run.
    expect(stripped.analysisMode).toBe('observed');
    expect(stripped.seedConstraints).toBeUndefined();
    expect(stripped.observedBrandVoice).toBeUndefined();
    expect(stripped.brandVoice?.tonality).toBe('Confident, clinical'); // voice handed back

    // Measured data survives — removing a seed must not cost the user their real analysis.
    expect(stripped.performanceBreakdown.totalAdsAnalyzed).toBe(42);
    expect(stripped.overallHealthScore).toBe(7);
    expect(stripped.topAds[0].id).toBe('ad_1');
  });

  it('keeps the observed voice when the seed never supplied one', () => {
    const seed = seedFixture();
    delete seed.brandVoice;
    delete seed.seedConstraints;
    const hybrid = mergeHybridAnalysis(buildObservedAnalysis(observedFixture()), seed);
    expect(unapplySeed(hybrid)!.brandVoice?.tonality).toBe('Confident, clinical');
  });
});
