// Section titles and labels for ChannelInsightsPanel, per analysis mode.
//
// A seeded analysis describes what SHOULD work; an observed one describes what DID. Same data
// shape, different claim — so the wording is a lookup rather than a ternary at every heading in
// the render tree. Keeping it here also keeps all user-facing analysis copy in one reviewable file.

import type { AnalysisMode } from '../lib/analysisMode';

export interface ModeCopy {
  badge: string | null;
  visualTitle: string;
  visualWinning: string;
  patternsTitle: string;
  patternsIntro: string | null;
  winningTitle: string;
  winningHeadlines: string;
  winningCopyElements: string;
  winningVisuals: string;
  losingTitle: string;
  losingHeadlines: string;
  losingCopyElements: string;
  losingIssues: string;
  audienceTitle: string;
  audienceResonates: string;
  audienceAvoid: string;
  recommendationsTitle: string;
}

const OBSERVED_COPY: ModeCopy = {
  badge: null,
  visualTitle: 'Visual & Creative Analysis',
  visualWinning: 'Winning Visual Elements',
  patternsTitle: 'Pattern Analysis',
  patternsIntro: null,
  winningTitle: "What's Working",
  winningHeadlines: 'Winning Headlines',
  winningCopyElements: 'Effective Copy Elements',
  winningVisuals: 'Winning Visual Elements',
  losingTitle: "What's Not Working",
  losingHeadlines: 'Problematic Headlines',
  losingCopyElements: 'Ineffective Copy',
  losingIssues: 'Common Issues',
  audienceTitle: 'Audience Insights',
  audienceResonates: 'What Resonates',
  audienceAvoid: "What Doesn't Work",
  recommendationsTitle: 'Strategic Recommendations',
};

export const MODE_COPY: Record<AnalysisMode, ModeCopy> = {
  observed: OBSERVED_COPY,
  hybrid: { ...OBSERVED_COPY, badge: 'Ad data + manual seed' },
  seeded: {
    badge: 'Seeded · no ad history',
    visualTitle: 'Visual Direction (untested)',
    visualWinning: 'Visual Directions to Try',
    patternsTitle: 'Creative Hypotheses',
    patternsIntro:
      'None of this has been tested yet. These are the angles your seed says to try first, and the guardrails it says to respect — treat them as a test plan, not as winners.',
    winningTitle: 'Angles to Test First',
    winningHeadlines: 'Headline Directions',
    winningCopyElements: 'Copy Elements to Try',
    winningVisuals: 'Visual Directions to Try',
    losingTitle: 'Guardrails to Respect',
    losingHeadlines: 'Headline Shapes to Avoid',
    losingCopyElements: 'Vocabulary to Avoid',
    losingIssues: 'Claim Guardrails',
    audienceTitle: 'Audience Hypotheses',
    audienceResonates: 'What Should Resonate',
    audienceAvoid: 'What to Avoid',
    recommendationsTitle: 'Where to Start',
  },
};
