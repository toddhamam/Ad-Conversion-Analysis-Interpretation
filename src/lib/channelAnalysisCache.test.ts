import { describe, it, expect, beforeEach } from 'vitest';
import type { ChannelAnalysisResult } from '../services/openaiApi';
import {
  getCachedAnalysis,
  setCachedAnalysis,
  setManualAnalysis,
  getManualSeed,
  hasManualSeed,
  clearManualSeed,
  clearImportMetadata,
  getImportMetadata,
} from './channelAnalysisCache';
import { setScopedAccountId } from './scopedStorage';
import { planAnalysisRun, buildSeededAnalysis } from './analysisMode';
import { normalizeManualAnalysis, parseManualSeed } from './manualSeed';

// ---------------------------------------------------------------------------
// localStorage stub — keeps the suite in a node environment (no jsdom needed)
// ---------------------------------------------------------------------------

function installLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = mock as unknown as Storage;
  return store;
}

const BT = 'ecommerce';

function minimalSeed(overrides: Partial<ChannelAnalysisResult> = {}): ChannelAnalysisResult {
  return {
    ...normalizeManualAnalysis({
      channelName: 'Meta',
      executiveSummary: 'Cold-start profile.',
      brandVoice: { tonality: 'Warm, plainspoken' },
      winningPatterns: { headlines: ['The 3am spiral'] },
      losingPatterns: { issues: ['Never promise a cure'], copyElements: ['biohack'] },
    }),
    ...overrides,
  };
}

function minimalObserved(): ChannelAnalysisResult {
  return {
    ...normalizeManualAnalysis({ executiveSummary: 'Observed run.' }),
    overallHealthScore: 7,
    analysisMode: 'observed',
    performanceBreakdown: {
      totalAdsAnalyzed: 42,
      highPerformers: 8,
      midPerformers: 20,
      lowPerformers: 14,
      avgConversionRate: 0.03,
      avgCostPerConversion: 28,
      totalSpend: 1000,
      totalConversions: 35,
    },
  };
}

beforeEach(() => {
  installLocalStorage();
  setScopedAccountId('act_123');
});

// ---------------------------------------------------------------------------
// Seed persistence
// ---------------------------------------------------------------------------

describe('manual seed persistence', () => {
  it('stores a seed that Run Channel Analysis can later find', () => {
    expect(hasManualSeed('meta', BT)).toBe(false);
    expect(setManualAnalysis('meta', minimalSeed(), BT)).toBe(true);
    expect(hasManualSeed('meta', BT)).toBe(true);
    expect(getManualSeed('meta', BT)?.executiveSummary).toBe('Cold-start profile.');
    expect(getImportMetadata('meta')?.source).toBe('manual');
  });

  it('survives an observed run, so the seed is still there for hybrid', () => {
    setManualAnalysis('meta', minimalSeed(), BT);

    // Exactly what a successful observed run does to the cache.
    setCachedAnalysis('meta', minimalObserved(), BT);
    clearImportMetadata('meta');

    expect(getCachedAnalysis('meta', BT)?.executiveSummary).toBe('Observed run.');
    expect(hasManualSeed('meta', BT)).toBe(true);
    expect(getManualSeed('meta', BT)?.executiveSummary).toBe('Cold-start profile.');
  });

  it('is isolated per ad account', () => {
    setManualAnalysis('meta', minimalSeed(), BT);
    setScopedAccountId('act_999');
    expect(hasManualSeed('meta', BT)).toBe(false);
    setScopedAccountId('act_123');
    expect(hasManualSeed('meta', BT)).toBe(true);
  });

  it('is isolated per channel', () => {
    setManualAnalysis('meta', minimalSeed(), BT);
    expect(hasManualSeed('google', BT)).toBe(false);
  });

  it('is hidden when the account business type no longer matches', () => {
    setManualAnalysis('meta', minimalSeed(), BT);
    expect(hasManualSeed('meta', 'leadgen')).toBe(false);
  });

  it('is removed only on an explicit clear', () => {
    setManualAnalysis('meta', minimalSeed(), BT);
    clearManualSeed('meta');
    expect(hasManualSeed('meta', BT)).toBe(false);
  });

  it('adopts a pre-existing seed written before the durable slot existed', () => {
    // Shape written by the previous release: seed in the analysis slot, manual provenance,
    // no `_seed_meta`. Without the migration these accounts would report "no seed".
    localStorage.setItem(
      'channel_analysis_cache_act_123',
      JSON.stringify({
        meta: minimalSeed(),
        _businessType: BT,
        _importedFrom_meta: {
          adAccountId: '',
          adAccountName: 'Manual seed',
          importedAt: '2026-08-18T18:00:00.000Z',
          sourceBusinessType: BT,
          source: 'manual',
        },
      }),
    );

    expect(hasManualSeed('meta', BT)).toBe(true);
    // Adoption persists, so a later observed run cannot orphan it.
    const raw = JSON.parse(localStorage.getItem('channel_analysis_cache_act_123')!);
    expect(raw._seed_meta).toBeTruthy();
  });

  it('does not treat a cross-account import as a seed', () => {
    localStorage.setItem(
      'channel_analysis_cache_act_123',
      JSON.stringify({
        meta: minimalObserved(),
        _businessType: BT,
        _importedFrom_meta: {
          adAccountId: 'act_555',
          adAccountName: 'Sister account',
          importedAt: '2026-08-18T18:00:00.000Z',
          sourceBusinessType: BT,
          source: 'account',
        },
      }),
    );
    expect(hasManualSeed('meta', BT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The four account states, end to end through storage
// ---------------------------------------------------------------------------

describe('Run Channel Analysis — account states', () => {
  /** Mirrors the branch in Insights.runAnalysis once the ad fetch has returned. */
  const decide = (adCount: number) =>
    planAnalysisRun({ hasAds: adCount > 0, seed: getManualSeed('meta', BT) }).mode;

  it('no ads + seed → seeded, and the seeded result caches cleanly', () => {
    setManualAnalysis('meta', minimalSeed(), BT);
    expect(decide(0)).toBe('seeded');

    const result = buildSeededAnalysis(getManualSeed('meta', BT)!, { channelName: 'Meta' });
    setCachedAnalysis('meta', result, BT);

    const cached = getCachedAnalysis('meta', BT)!;
    expect(cached.analysisMode).toBe('seeded');
    expect(cached.overallHealthScore).toBeNull();
    // Provenance is untouched, so the seed banner keeps telling the truth.
    expect(getImportMetadata('meta')?.source).toBe('manual');
  });

  it('no ads + no seed → none, i.e. the original error still applies', () => {
    expect(decide(0)).toBe('none');
  });

  it('ads + no seed → observed', () => {
    expect(decide(12)).toBe('observed');
  });

  it('ads + seed → hybrid', () => {
    setManualAnalysis('meta', minimalSeed(), BT);
    expect(decide(12)).toBe('hybrid');
  });

  it('a run that produces no analysis leaves the previous one intact', () => {
    // A prior analysis exists...
    setCachedAnalysis('meta', minimalObserved(), BT);
    const before = localStorage.getItem('channel_analysis_cache_act_123');

    // ...a later run finds neither ads nor a seed and bails before writing anything.
    expect(decide(0)).toBe('none');

    expect(localStorage.getItem('channel_analysis_cache_act_123')).toBe(before);
    expect(getCachedAnalysis('meta', BT)?.executiveSummary).toBe('Observed run.');
  });
});

// ---------------------------------------------------------------------------
// normalizeManualAnalysis
// ---------------------------------------------------------------------------

describe('parseManualSeed', () => {
  it('turns raw seed input straight into a seeded-mode analysis', () => {
    const seeded = parseManualSeed({ executiveSummary: 'x', winningPatterns: { headlines: ['a'] } });
    expect(seeded.analysisMode).toBe('seeded');
    expect(seeded.overallHealthScore).toBeNull();
    expect(seeded.seedConstraints).toBeDefined();
  });

  it('ignores a health score a pasted seed tries to assert', () => {
    expect(parseManualSeed({ overallHealthScore: 9 }).overallHealthScore).toBeNull();
  });
});

describe('normalizeManualAnalysis', () => {
  it('reports no health score when the seed does not supply one', () => {
    expect(normalizeManualAnalysis({ executiveSummary: 'x' }).overallHealthScore).toBeNull();
  });

  it('parses an explicit constraints block when the seed provides one', () => {
    const normalized = normalizeManualAnalysis({
      executiveSummary: 'x',
      constraints: {
        bannedVocabulary: ['biohack'],
        claimGuardrails: ['Never promise a cure'],
        avoidHeadlinePatterns: ['Clickbait numbers'],
      },
    });
    expect(normalized.seedConstraints?.bannedVocabulary).toEqual(['biohack']);
    expect(normalized.seedConstraints?.claimGuardrails).toEqual(['Never promise a cure']);
  });

  it('never throws on junk input', () => {
    const normalized = normalizeManualAnalysis({ topAds: 'oops' });
    expect(normalized.topAds).toEqual([]);
    expect(() => normalizeManualAnalysis(null)).not.toThrow();
    expect(() => normalizeManualAnalysis('a string')).not.toThrow();
  });

  it('still fills every required field so downstream readers cannot hit undefined', () => {
    const normalized = normalizeManualAnalysis({});
    expect(normalized.performanceBreakdown.totalAdsAnalyzed).toBe(0);
    expect(normalized.winningPatterns.headlines).toEqual([]);
    expect(normalized.losingPatterns.issues).toEqual([]);
    expect(normalized.audienceInsights.whatResonates).toEqual([]);
    expect(normalized.recommendations.immediate).toEqual([]);
    expect(normalized.topAds).toEqual([]);
    expect(normalized.bottomAds).toEqual([]);
  });
});
