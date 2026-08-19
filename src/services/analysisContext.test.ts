import { describe, it, expect } from 'vitest';
import { buildAnalysisContextString, condensedCopyFor, healthScoreLine } from './analysisContext';
import { buildObservedAnalysis, buildSeededAnalysis, mergeHybridAnalysis } from '../lib/analysisMode';
import { observedFixture, seedFixture } from '../test/fixtures';

const observed = buildAnalysisContextString(buildObservedAnalysis(observedFixture()));
const seeded = buildAnalysisContextString(buildSeededAnalysis(seedFixture()));
const hybrid = buildAnalysisContextString(
  mergeHybridAnalysis(buildObservedAnalysis(observedFixture()), seedFixture()),
);

describe('observed mode', () => {
  it('presents measured findings as winners', () => {
    expect(observed).toContain('=== CHANNEL PERFORMANCE SUMMARY ===');
    expect(observed).toContain('=== WINNING COPY PATTERNS (USE THESE) ===');
    expect(observed).toContain('=== YOUR TOP PERFORMING ADS (COPY THESE PATTERNS) ===');
    expect(observed).toContain('TOP AD #1 (6.10% conversion rate)');
    expect(observed).toContain('Overall Health Score: 7/10');
  });

  it('carries no cold-start framing', () => {
    expect(observed).not.toContain('EVIDENCE STATUS');
    expect(observed).not.toContain('HYPOTHESIS');
    expect(observed).not.toContain('cold-start');
  });
});

describe('seeded mode', () => {
  it('states the evidence status up front so nothing reads as proven', () => {
    expect(seeded).toContain('=== EVIDENCE STATUS: NO AD HISTORY (SEEDED PROFILE) ===');
    expect(seeded).toContain('Treat every pattern as a HYPOTHESIS to test, never as a proven winner');
  });

  it('never labels untested angles as winners', () => {
    expect(seeded).not.toContain('WINNING COPY PATTERNS');
    expect(seeded).not.toContain('TOP PERFORMING ADS');
    expect(seeded).toContain('=== HYPOTHESISED ANGLES TO TEST FIRST (UNPROVEN) ===');
    expect(seeded).toContain('Headline directions to try');
  });

  it('omits the health score entirely rather than printing null/10 or 0/10', () => {
    expect(seeded).not.toContain('Health Score');
    expect(seeded).not.toContain('null');
    expect(seeded).not.toContain('0/10');
  });

  it('does not print a 0% conversion rate against exemplar ads', () => {
    expect(seeded).toContain('EXEMPLAR #1:');
    expect(seeded).not.toContain('0.00% conversion rate');
  });

  it('reports zero ads analyzed instead of fabricating volume', () => {
    expect(seeded).toContain('Ads Analyzed: 0 (no delivery data yet');
  });

  it('passes the seed’s constraints through as binding', () => {
    expect(seeded).toContain('=== NON-NEGOTIABLE CONSTRAINTS (OPERATOR-ASSERTED, VALIDATED) ===');
    expect(seeded).toContain('biohack');
    expect(seeded).toContain('Never promise a cure');
  });
});

describe('hybrid mode', () => {
  it('marks performance as measured while keeping constraints binding', () => {
    expect(hybrid).toContain('=== EVIDENCE STATUS: MEASURED DATA + STRATEGIST SEED ===');
    expect(hybrid).toContain('=== WINNING COPY PATTERNS (USE THESE) ===');
    expect(hybrid).toContain('=== NON-NEGOTIABLE CONSTRAINTS (OPERATOR-ASSERTED, VALIDATED) ===');
    expect(hybrid).toContain('Overall Health Score: 7/10');
  });

  it('puts the seed’s voice in the authoritative slot and keeps the observed one as reference', () => {
    const authoritative = hybrid.indexOf('=== BRAND VOICE PROFILE (MATCH THIS VOICE) ===');
    const reference = hybrid.indexOf('=== OBSERVED VOICE FROM PAST WINNERS (reference only) ===');
    expect(authoritative).toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(authoritative);
    expect(hybrid).toContain('Warm, plainspoken, never clinical'); // seed voice
    expect(hybrid).toContain('Confident, clinical'); // observed voice, demoted
  });
});

describe('edge cases', () => {
  it('returns an empty string for a null analysis', () => {
    expect(buildAnalysisContextString(null)).toBe('');
  });

  it('omits the constraints block when the seed asserted none', () => {
    const seed = seedFixture();
    delete seed.seedConstraints;
    seed.losingPatterns = { headlines: [], copyElements: [], issues: [], visualIssues: [] };
    seed.audienceInsights.whatDoesntWork = [];
    expect(buildAnalysisContextString(buildSeededAnalysis(seed))).not.toContain(
      'NON-NEGOTIABLE CONSTRAINTS',
    );
  });
});

// ---------------------------------------------------------------------------
// Condensed contexts — regenerateSingleCopy / generateTextAdCopy build their own short
// blocks, and they must be as honest about evidence as the full builder.
// ---------------------------------------------------------------------------

describe('condensed prompt vocabulary', () => {
  const observedRecord = buildObservedAnalysis(observedFixture());
  const seededRecord = buildSeededAnalysis(seedFixture());

  it('reproduces the exact observed strings the call sites used before the table existed', () => {
    const cc = condensedCopyFor(observedRecord);
    expect(cc.preamble).toBe('');
    expect(cc.summaryHeader).toBe('CHANNEL PERFORMANCE SUMMARY');
    expect(cc.topAdsHeader).toBe('YOUR TOP PERFORMING ADS');
    expect(cc.topAdsEntry).toBe('TOP AD');
    expect(cc.showConversionRate).toBe(true);
    expect(cc.patternsHeader).toBe('WINNING PATTERNS');
    expect(cc.avoidHeader).toBe('AVOID THESE');
    expect(cc.textAdHeader).toBe('PERFORMANCE CONTEXT');
    expect(cc.textAdIntro).toBe('Top performing patterns from this account inform the suggestions below.');
  });

  it('never calls a seeded account’s untested angles winners or top performers', () => {
    const cc = condensedCopyFor(seededRecord);
    expect(cc.topAdsHeader).not.toContain('TOP PERFORMING');
    expect(cc.patternsHeader).not.toContain('WINNING');
    expect(cc.textAdIntro).not.toContain('Top performing');
    expect(cc.showConversionRate).toBe(false);
    expect(cc.preamble).toContain('no ad history');
  });

  it('treats hybrid as measured — it has real delivery data', () => {
    expect(condensedCopyFor(mergeHybridAnalysis(observedRecord, seedFixture())).showConversionRate).toBe(true);
  });
});

describe('healthScoreLine', () => {
  it('prints the score when there is delivery data behind it', () => {
    expect(healthScoreLine(buildObservedAnalysis(observedFixture()))).toBe('Overall Health Score: 7/10\n');
  });

  it('honours a custom label', () => {
    expect(healthScoreLine(buildObservedAnalysis(observedFixture()), 'Health Score')).toBe('Health Score: 7/10\n');
  });

  it('emits nothing at all for a seeded account — never null/10 or 0/10', () => {
    const line = healthScoreLine(buildSeededAnalysis(seedFixture()));
    expect(line).toBe('');
    expect(line).not.toContain('null');
    expect(line).not.toContain('0/10');
  });
});
