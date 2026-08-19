// Turns a ChannelAnalysisResult into the prompt text that copy generation reads.
//
// Extracted from openaiApi.ts so it can be read, reasoned about and unit-tested on its own — this
// is the layer that decides whether generation treats a pattern as a proven winner or an untested
// hypothesis, which is too important to be buried in a 6k-line service module.

import type { ChannelAnalysisResult } from './openaiApi';
import type { AnalysisMode, EvidenceLevel } from '../lib/analysisMode';
import { analysisModeOf } from '../lib/analysisMode';

/**
 * Per-mode prompt vocabulary. One table, resolved once, instead of a `seeded ? … : …` at every
 * section header — and it puts the evidence level in front of the model as literal text so it can
 * distinguish measured findings from reasoned guesses.
 */
interface ModePrompt {
  /** How much weight the performance claims in this record carry. */
  performanceEvidence: EvidenceLevel;
  /** Preamble stating the evidence status of everything that follows. Empty for observed. */
  preamble: string;
  summaryHeader: string;
  patternsHeader: string;
  patternLabels: {
    headlines: string;
    copyElements: string;
    emotionalTriggers: string;
    callToActions: string;
  };
  topAds: {
    header: string;
    /** Seed exemplars have a conversionRate of 0; printing it would read as "0% converting". */
    showConversionRate: boolean;
    entryLabel: string;
    whyLabel: string;
    outro: string;
  };
}

const OBSERVED_PROMPT: ModePrompt = {
  performanceEvidence: 'MEASURED',
  preamble: '',
  summaryHeader: 'CHANNEL PERFORMANCE SUMMARY',
  patternsHeader: 'WINNING COPY PATTERNS (USE THESE)',
  patternLabels: {
    headlines: 'Headlines that convert',
    copyElements: 'Effective copy elements',
    emotionalTriggers: 'Emotional triggers that work',
    callToActions: 'CTAs that drive action',
  },
  topAds: {
    header: 'YOUR TOP PERFORMING ADS (COPY THESE PATTERNS)',
    showConversionRate: true,
    entryLabel: 'TOP AD',
    whyLabel: 'Why it converts',
    outro:
      'IMPORTANT: Study the FULL BODY COPY of these winners. Notice their structure, pacing, opening hooks, how they build tension, and how they close. Your generated body copy should follow the same structural patterns and voice.',
  },
};

const SEEDED_PROMPT: ModePrompt = {
  performanceEvidence: 'HYPOTHESIS',
  preamble: `=== EVIDENCE STATUS: NO AD HISTORY (SEEDED PROFILE) ===
This account has not run ads yet. Everything below comes from a manual strategist seed, NOT from
measured performance. Treat every pattern as a HYPOTHESIS to test, never as a proven winner. Do not
write copy that claims or implies these approaches have already been validated by results.
`,
  summaryHeader: 'CHANNEL CREATIVE PROFILE',
  patternsHeader: 'HYPOTHESISED ANGLES TO TEST FIRST (UNPROVEN)',
  patternLabels: {
    headlines: 'Headline directions to try',
    copyElements: 'Copy elements to try',
    emotionalTriggers: 'Emotional triggers to try',
    callToActions: 'CTA directions to try',
  },
  topAds: {
    header: 'EXEMPLAR ADS WRITTEN IN THE BRAND VOICE (UNTESTED — MATCH THE STYLE, NOT THE CLAIMS)',
    showConversionRate: false,
    entryLabel: 'EXEMPLAR',
    whyLabel: 'Why it should resonate',
    outro: `IMPORTANT: These exemplars were written to demonstrate the brand's VOICE and STRUCTURE. They have
never run. Mirror their tone, pacing and structure; do not treat their angles as validated.`,
  },
};

const HYBRID_PROMPT: ModePrompt = {
  ...OBSERVED_PROMPT,
  preamble: `=== EVIDENCE STATUS: MEASURED DATA + STRATEGIST SEED ===
Performance findings below are MEASURED from this account's own ads. The brand voice and the
constraints in "NON-NEGOTIABLE CONSTRAINTS" are operator-asserted (VALIDATED) and are binding
regardless of what the performance data says.
`,
};

const MODE_PROMPT: Record<AnalysisMode, ModePrompt> = {
  observed: OBSERVED_PROMPT,
  seeded: SEEDED_PROMPT,
  hybrid: HYBRID_PROMPT,
};

/**
 * Vocabulary for the CONDENSED analysis contexts — `regenerateSingleCopy` and `generateTextAdCopy`
 * build their own short prompt blocks (small token budgets, reasoning 'low') rather than using the
 * full builder above, but they need the same honesty about evidence.
 *
 * The `observed` entry reproduces the strings those call sites hard-coded, verbatim, so observed
 * prompts are byte-identical to before this table existed.
 */
export interface CondensedModeCopy {
  preamble: string;
  summaryHeader: string;
  topAdsHeader: string;
  topAdsEntry: string;
  showConversionRate: boolean;
  patternsHeader: string;
  avoidHeader: string;
  textAdHeader: string;
  textAdIntro: string;
}

const OBSERVED_CONDENSED: CondensedModeCopy = {
  preamble: '',
  summaryHeader: 'CHANNEL PERFORMANCE SUMMARY',
  topAdsHeader: 'YOUR TOP PERFORMING ADS',
  topAdsEntry: 'TOP AD',
  showConversionRate: true,
  patternsHeader: 'WINNING PATTERNS',
  avoidHeader: 'AVOID THESE',
  textAdHeader: 'PERFORMANCE CONTEXT',
  textAdIntro: 'Top performing patterns from this account inform the suggestions below.',
};

const CONDENSED_MODE_COPY: Record<AnalysisMode, CondensedModeCopy> = {
  observed: OBSERVED_CONDENSED,
  hybrid: OBSERVED_CONDENSED,
  seeded: {
    preamble: 'NOTE: this account has no ad history. Everything below is an untested hypothesis from a manual seed, never a proven winner.\n',
    summaryHeader: 'CHANNEL CREATIVE PROFILE (NO DELIVERY DATA)',
    topAdsHeader: 'EXEMPLAR ADS IN THE BRAND VOICE (UNTESTED — MATCH THE STYLE, NOT THE CLAIMS)',
    topAdsEntry: 'EXEMPLAR',
    showConversionRate: false,
    patternsHeader: 'HYPOTHESISED PATTERNS TO TEST (UNPROVEN)',
    avoidHeader: 'SEED GUARDRAILS — AVOID THESE',
    textAdHeader: 'CREATIVE PROFILE (NO DELIVERY DATA YET)',
    textAdIntro: 'These are untested hypotheses from a manual seed, not measured winners.',
  },
};

/** Condensed-prompt vocabulary for this analysis. */
export function condensedCopyFor(analysis: ChannelAnalysisResult): CondensedModeCopy {
  return CONDENSED_MODE_COPY[analysisModeOf(analysis)];
}

/**
 * A health-score line for a prompt, or nothing at all when there is no delivery data to score.
 * Never emit "null/10" or "0/10" — both read to the model as a failing account and drag generation
 * toward remediation copy.
 */
export function healthScoreLine(analysis: ChannelAnalysisResult, label = 'Overall Health Score'): string {
  return typeof analysis.overallHealthScore === 'number'
    ? `${label}: ${analysis.overallHealthScore}/10\n`
    : '';
}

export function buildAnalysisContextString(
  analysis: ChannelAnalysisResult | null,
  options?: { demoteObservedVoice?: boolean },
): string {
  if (!analysis) return '';
  const copy = MODE_PROMPT[analysisModeOf(analysis)];
  const measured = copy.performanceEvidence === 'MEASURED';

  let analysisContext = copy.preamble ? `\n${copy.preamble}` : '';

  analysisContext += `\n=== ${copy.summaryHeader} ===
${analysis.executiveSummary}
`;
  // A health score is omitted entirely when not applicable — a "0/10" or "null/10" in the prompt
  // reads as a failing account and drags generation toward remediation copy.
  if (typeof analysis.overallHealthScore === 'number') {
    analysisContext += `
Overall Health Score: ${analysis.overallHealthScore}/10`;
  }
  analysisContext += measured
    ? `
Total Ads Analyzed: ${analysis.performanceBreakdown.totalAdsAnalyzed}
High Performers: ${analysis.performanceBreakdown.highPerformers} ads
Avg Conversion Rate: ${(analysis.performanceBreakdown.avgConversionRate * 100).toFixed(2)}%
`
    : `
Ads Analyzed: 0 (no delivery data yet — this is a cold-start profile)
`;

  if (analysis.topAds && analysis.topAds.length > 0) {
    const ads = copy.topAds;
    analysisContext += `\n=== ${ads.header} ===\n`;
    analysis.topAds.forEach((ad, i) => {
      const rate = ads.showConversionRate
        ? ` (${(ad.conversionRate * 100).toFixed(2)}% conversion rate)`
        : '';
      analysisContext += `
${ads.entryLabel} #${i + 1}${rate}:
- Headline: "${ad.headline}"${ad.bodyText ? `
- Full Body Copy: "${ad.bodyText}"` : ''}
- ${ads.whyLabel}: ${ad.whyItWorks}
- Psychological drivers: ${ad.psychologicalDrivers?.join(', ') || 'N/A'}
`;
    });
    analysisContext += `
${ads.outro}
`;
  }

  if (analysis.brandVoice) {
    const bv = analysis.brandVoice;
    // When a user-authored Brand Voice profile is in force, this data-derived voice is demoted to
    // supporting evidence (header/intro reframed, the "MATCH THIS" mandate dropped) so it doesn't
    // contradict the authoritative profile. The voice fields render identically either way.
    const demoted = options?.demoteObservedVoice;
    const header = demoted
      ? '=== OBSERVED VOICE FROM PAST WINNERS (reference only) ==='
      : '=== BRAND VOICE PROFILE (MATCH THIS VOICE) ===';
    const intro = demoted
      ? 'This is the voice extracted from ads that already converted for this account. Use it as supporting evidence, but DEFER to the Brand Voice & Guidelines profile on any conflict.'
      : 'This is the voice that is ALREADY CONVERTING for this ad account. Your copy MUST sound like it came from the same copywriter.';
    const outro = demoted
      ? ''
      : '\n\nCRITICAL: Do NOT override this voice with generic "ad copywriter" tone. The voice profile above is extracted from REAL winning ads. Match its specific characteristics, not a generic approximation of it.';
    analysisContext += `\n${header}
${intro}
- Tonality: ${bv.tonality}
- Sentence style: ${bv.sentenceStyle}
- Point of view: ${bv.pointOfView}
- Vocabulary level: ${bv.vocabularyLevel}
- Rhythm & cadence: ${bv.rhythmAndCadence}
${bv.distinctiveTraits?.length ? `- Distinctive traits:\n${bv.distinctiveTraits.map(t => `  * ${t}`).join('\n')}` : ''}${outro}
`;
  }

  if (analysis.winningPatterns) {
    const labels = copy.patternLabels;
    analysisContext += `\n=== ${copy.patternsHeader} ===
- ${labels.headlines}: ${analysis.winningPatterns.headlines?.join(' | ') || 'N/A'}
- ${labels.copyElements}: ${analysis.winningPatterns.copyElements?.join(' | ') || 'N/A'}
- ${labels.emotionalTriggers}: ${analysis.winningPatterns.emotionalTriggers?.join(', ') || 'N/A'}
- ${labels.callToActions}: ${analysis.winningPatterns.callToActions?.join(', ') || 'N/A'}
`;
  }

  if (analysis.visualAnalysis?.psychologicalTriggers?.length) {
    analysisContext += `\n=== PSYCHOLOGICAL TRIGGERS THAT ${measured ? 'WORK' : 'SHOULD RESONATE'} ===
${analysis.visualAnalysis.psychologicalTriggers.map(t => `- ${t}`).join('\n')}
`;
  }

  if (analysis.audienceInsights) {
    analysisContext += `\n=== AUDIENCE INSIGHTS ===
What resonates with this audience:
${analysis.audienceInsights.whatResonates?.map(r => `- ${r}`).join('\n') || '- N/A'}

What to AVOID (doesn't work):
${analysis.audienceInsights.whatDoesntWork?.map(r => `- ${r}`).join('\n') || '- N/A'}
`;
  }

  if (analysis.losingPatterns) {
    analysisContext += `\n=== AVOID THESE PATTERNS (${measured ? 'LOW PERFORMERS' : 'UNTESTED — SEED GUARDRAILS'}) ===
- Headlines that fail: ${analysis.losingPatterns.headlines?.join(' | ') || 'N/A'}
- Copy issues: ${analysis.losingPatterns.issues?.join(', ') || 'N/A'}
- Problematic elements: ${analysis.losingPatterns.copyElements?.join(', ') || 'N/A'}
`;
  }

  if (analysis.recommendations) {
    analysisContext += `\n=== STRATEGIC RECOMMENDATIONS ===
Immediate actions: ${analysis.recommendations.immediate?.join('; ') || 'N/A'}
Creative direction: ${analysis.recommendations.creativeDirection?.join('; ') || 'N/A'}
`;
  }

  // Hybrid: the voice extracted from winners is kept as supporting evidence beneath the seed's
  // authoritative voice (rendered above), never dropped.
  if (analysis.observedBrandVoice) {
    const obv = analysis.observedBrandVoice;
    analysisContext += `\n=== OBSERVED VOICE FROM PAST WINNERS (reference only) ===
Extracted from ads that already converted for this account. Useful supporting evidence, but the
brand voice above is operator-asserted and wins on any conflict.
- Tonality: ${obv.tonality}
- Sentence style: ${obv.sentenceStyle}
- Point of view: ${obv.pointOfView}
- Vocabulary level: ${obv.vocabularyLevel}
- Rhythm & cadence: ${obv.rhythmAndCadence}
`;
  }

  // Seed constraints are binding in BOTH seeded and hybrid mode — this is the block that stops a
  // hybrid run from silently discarding what the operator said the brand may not say.
  const sc = analysis.seedConstraints;
  if (sc && (sc.bannedVocabulary.length || sc.claimGuardrails.length || sc.avoidHeadlinePatterns.length)) {
    analysisContext += `\n=== NON-NEGOTIABLE CONSTRAINTS (OPERATOR-ASSERTED, VALIDATED) ===
These are binding regardless of what the performance data suggests.`;
    if (sc.bannedVocabulary.length) {
      analysisContext += `\n- NEVER use this vocabulary/phrasing: ${sc.bannedVocabulary.join(' | ')}`;
    }
    if (sc.claimGuardrails.length) {
      analysisContext += `\n- Claim guardrails you must respect: ${sc.claimGuardrails.join(' | ')}`;
    }
    if (sc.avoidHeadlinePatterns.length) {
      analysisContext += `\n- Headline shapes that fall flat with this audience: ${sc.avoidHeadlinePatterns.join(' | ')}`;
    }
    analysisContext += '\n';
  }

  return analysisContext;
}
