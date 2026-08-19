// Shared test fixtures. Test-only module — not imported by application code.
import type { ChannelAnalysisResult } from '../services/openaiApi';

/** A realistic observed analysis — the shape analyzeChannelPerformance returns. */
export function observedFixture(): ChannelAnalysisResult {
  return {
    channelName: 'Meta',
    analyzedAt: '2026-08-18T18:12:51.000Z',
    executiveSummary: 'Retargeting carries the account; prospecting is fatigued.',
    overallHealthScore: 7,
    performanceBreakdown: {
      totalAdsAnalyzed: 42,
      highPerformers: 8,
      midPerformers: 20,
      lowPerformers: 14,
      avgConversionRate: 0.031,
      avgCostPerConversion: 28.4,
      totalSpend: 19_450,
      totalConversions: 684,
    },
    visualAnalysis: {
      winningVisualElements: ['Founder to camera', 'Handwritten annotation'],
      losingVisualElements: ['Stock photography'],
      colorPsychology: 'Warm neutrals outperform high-saturation gradients.',
      imageryPatterns: 'Single-subject shots beat collages.',
      inImageMessaging: 'Six words or fewer.',
      psychologicalTriggers: ['social proof', 'loss aversion'],
    },
    headlineImageAnalysis: [
      {
        headline: 'The 20-minute reset',
        variations: [
          { adId: '1', imageDescription: 'Founder at desk', conversionRate: 0.05, whyItConverts: 'Trust' },
        ],
        keyDifferentiator: 'Human face in frame',
      },
    ],
    brandVoice: {
      tonality: 'Confident, clinical',
      sentenceStyle: 'Long, evidence-led',
      pointOfView: 'Third person',
      vocabularyLevel: 'Technical',
      rhythmAndCadence: 'Even, measured',
      distinctiveTraits: ['Leads with a statistic'],
    },
    winningPatterns: {
      headlines: ['Question openers'],
      copyElements: ['Numbered proof points'],
      emotionalTriggers: ['relief'],
      callToActions: ['Start free'],
      visualElements: ['Founder to camera'],
    },
    losingPatterns: {
      headlines: ['Pun-led headlines'],
      copyElements: ['Corporate throat-clearing'],
      issues: ['Buries the offer'],
      visualIssues: ['Busy backgrounds'],
    },
    audienceInsights: {
      whatResonates: ['Time savings'],
      whatDoesntWork: ['Status appeals'],
      targetingRecommendations: ['Broad + creative-led'],
      visualPreferences: ['Real people'],
    },
    recommendations: {
      immediate: ['Kill the two fatigued prospecting ads'],
      shortTerm: ['Test three new hooks'],
      strategic: ['Build a testimonial library'],
      creativeDirection: ['More founder-led video'],
    },
    topAds: [
      {
        id: 'ad_1',
        headline: 'The 20-minute reset',
        bodyText: 'Most people quit at week three...',
        conversionRate: 0.061,
        whyItWorks: 'Names the failure point',
        imageAnalysis: 'Founder at desk, direct eye contact',
        psychologicalDrivers: ['authority'],
      },
    ],
    bottomAds: [
      {
        id: 'ad_9',
        headline: 'Unlock synergy',
        conversionRate: 0.002,
        whyItFails: 'Abstract, no promise',
        imageIssues: 'Stock handshake',
        suggestedFix: 'Lead with the outcome',
      },
    ],
  };
}

export function seedFixture(): ChannelAnalysisResult {
  return {
    channelName: 'Meta',
    analyzedAt: '2026-08-18T18:00:00.000Z',
    executiveSummary: 'Sleep coaching for shift workers who have tried everything.',
    overallHealthScore: null,
    performanceBreakdown: {
      totalAdsAnalyzed: 0,
      highPerformers: 0,
      midPerformers: 0,
      lowPerformers: 0,
      avgConversionRate: 0,
      avgCostPerConversion: 0,
      totalSpend: 0,
      totalConversions: 0,
    },
    visualAnalysis: {
      winningVisualElements: [],
      losingVisualElements: [],
      colorPsychology: '',
      imageryPatterns: '',
      inImageMessaging: '',
      psychologicalTriggers: ['fear resolution'],
    },
    headlineImageAnalysis: [],
    brandVoice: {
      tonality: 'Warm, plainspoken, never clinical',
      sentenceStyle: 'Short sentences',
      pointOfView: 'Second person',
      vocabularyLevel: 'Grade 8',
      rhythmAndCadence: 'Calm open, clear invitation',
      distinctiveTraits: ['Opens with the reader’s 3am thought'],
    },
    seedConstraints: {
      bannedVocabulary: ['biohack', 'crush it'],
      claimGuardrails: ['Never promise a cure', 'No specific hours-of-sleep guarantees'],
      avoidHeadlinePatterns: ['Clickbait numbers'],
      hypothesisedAngles: ['The 3am spiral'],
      seededAt: '2026-08-18T18:00:00.000Z',
    },
    winningPatterns: {
      headlines: ['The 3am spiral'],
      copyElements: ['Name the symptom first'],
      emotionalTriggers: ['recognition'],
      callToActions: ['Take the sleep quiz'],
      visualElements: ['Dim bedroom light'],
    },
    losingPatterns: {
      headlines: ['Clickbait numbers'],
      copyElements: ['Hype adjectives'],
      issues: ['Never promise a cure'],
      visualIssues: [],
    },
    audienceInsights: {
      whatResonates: ['Being believed'],
      whatDoesntWork: ['Discipline framing'],
      targetingRecommendations: [],
      visualPreferences: ['Low-light imagery'],
    },
    recommendations: {
      immediate: ['Launch the 3am spiral angle'],
      shortTerm: [],
      strategic: [],
      creativeDirection: ['Quiet, nocturnal imagery'],
    },
    topAds: [
      {
        id: 'exemplar_1',
        headline: 'It is 3am again.',
        bodyText: 'You are not broken. Your schedule is.',
        conversionRate: 0,
        whyItWorks: 'Meets the reader inside the moment',
        imageAnalysis: '',
        psychologicalDrivers: ['recognition'],
      },
    ],
    bottomAds: [],
  };
}

