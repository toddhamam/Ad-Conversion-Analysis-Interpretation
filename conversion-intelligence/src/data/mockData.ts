import { Channel, Creative, TrafficType, Concept, Product, Insight } from '../types';

export const channels: Channel[] = [
  {
    id: 'meta-ads',
    name: 'Meta Ads',
    description: 'Facebook & Instagram advertising',
    conversions: 2138
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    description: 'Search & Display Network',
    comingSoon: true
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Creator partnerships',
    comingSoon: true
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Email marketing campaigns',
    comingSoon: true
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Video advertising',
    comingSoon: true
  }
];

export const trafficTypes: TrafficType[] = [
  {
    id: 'all',
    name: 'All Traffic',
    conversions: 2138,
    spend: 27393
  },
  {
    id: 'prospecting',
    name: 'Prospecting',
    conversions: 49,
    spend: 9796
  },
  {
    id: 'retargeting',
    name: 'Retargeting',
    conversions: 46,
    spend: 9198
  },
  {
    id: 'warm',
    name: 'Warm',
    conversions: 42,
    spend: 8399
  }
];

export const creatives: Creative[] = [
  {
    id: '1',
    headline: 'Your Morning Ritual Is Costing You $47/Day',
    bodySnippet: 'Most people waste 2 hours every morning on routines that drain energy instead of building it...',
    conversions: 847,
    conversionRate: 6.2,
    costPerConversion: 12.50,
    clickThroughRate: 3.8,
    spend: 10587.50,
    impressions: 358654,
    clicks: 13649,
    campaignName: 'Peak Performance - Cold',
    adsetName: 'Morning Routine Awareness',
    concept: 'Hidden Cost Awareness',
    status: 'Winning',
    confidence: 'High'
  },
  {
    id: '2',
    headline: 'The "Busy" Trap That Keeps 6-Figure Earners Stuck',
    bodySnippet: "Working harder isn't the answer. The highest performers protect their energy like it's their...",
    conversions: 623,
    conversionRate: 5.9,
    costPerConversion: 15.75,
    clickThroughRate: 3.5,
    spend: 9812.25,
    impressions: 302156,
    clicks: 10575,
    campaignName: 'Peak Performance - Warm',
    adsetName: 'High Achiever Burnout',
    concept: 'Status Quo Challenge',
    status: 'Winning',
    confidence: 'High'
  },
  {
    id: '3',
    headline: 'Why Top Performers Never "Hustle"',
    bodySnippet: 'The grind culture lied to you. Real success comes from strategic recovery, not endless...',
    conversions: 156,
    conversionRate: 3.2,
    costPerConversion: 22.10,
    clickThroughRate: 2.8,
    spend: 3447.60,
    impressions: 174285,
    clicks: 4880,
    campaignName: 'Anti-Hustle Messaging',
    adsetName: 'Productivity Burnout',
    concept: 'Anti-Hustle',
    status: 'Testing',
    confidence: 'Medium'
  },
  {
    id: '4',
    headline: 'Stop Optimizing. Start Eliminating.',
    bodySnippet: 'The problem isn\'t doing things better. It\'s doing too many things. Learn the elimination framework...',
    conversions: 512,
    conversionRate: 5.1,
    costPerConversion: 18.25,
    clickThroughRate: 3.2,
    spend: 9344.00,
    impressions: 313750,
    clicks: 10039,
    campaignName: 'Focus Framework Launch',
    adsetName: 'Overwhelm Solution',
    concept: 'Implementation Gap',
    status: 'Winning',
    confidence: 'High'
  },
  {
    id: '5',
    headline: 'The Hidden Cost of Being "Always On"',
    bodySnippet: 'Constant availability isn\'t productivity—it\'s performance theater. Top executives protect their focus...',
    conversions: 234,
    conversionRate: 2.8,
    costPerConversion: 28.50,
    clickThroughRate: 2.1,
    spend: 6669.00,
    impressions: 397619,
    clicks: 8350,
    campaignName: 'Executive Reset',
    adsetName: 'Always-On Culture',
    concept: 'Hidden Cost Awareness',
    status: 'Testing',
    confidence: 'Low'
  },
  {
    id: '6',
    headline: 'Why Your Best Ideas Come in the Shower',
    bodySnippet: 'Breakthrough thinking requires boredom. The science of strategic rest and creative recovery...',
    conversions: 89,
    conversionRate: 1.2,
    costPerConversion: 45.80,
    clickThroughRate: 1.5,
    spend: 4076.20,
    impressions: 493333,
    clicks: 7400,
    campaignName: 'Creative Recovery',
    adsetName: 'Strategic Boredom',
    concept: 'Anti-Hustle',
    status: 'Fatigued',
    confidence: 'Medium'
  }
];

export const concepts: Concept[] = [
  {
    id: 'hidden-cost',
    name: 'Hidden Cost Awareness',
    description: 'Revealing the invisible price tag on existing behaviors and beliefs',
    quote: '"What you\'re currently doing has a quantifiable cost you haven\'t calculated"',
    creativeCount: 1,
    conversions: 847
  },
  {
    id: 'status-quo',
    name: 'Status Quo Challenge',
    description: 'Questioning the unexamined assumptions that keep people stuck',
    quote: '"The strategies that got you here are now the ceiling keeping you stuck"',
    creativeCount: 1,
    conversions: 623
  },
  {
    id: 'anti-hustle',
    name: 'Anti-Hustle',
    description: 'Reframing rest and recovery as strategic advantages, not weaknesses',
    quote: '"Grinding harder is the problem, not the solution"',
    creativeCount: 1,
    conversions: 156
  },
  {
    id: 'implementation-gap',
    name: 'Implementation Gap',
    description: 'Addressing the disconnect between knowledge and action',
    quote: '"You don\'t need more information—you need better systems"',
    creativeCount: 1,
    conversions: 512
  }
];

export const products: Product[] = [
  {
    id: 'peak-performance',
    name: 'Peak Performance System',
    type: 'Digital Course',
    topHeadline: '"Your Morning Ritual Is Costing You $47/Day"',
    conversions: 1847,
    revenue: 369253
  },
  {
    id: 'focus-framework',
    name: 'Focus Framework',
    type: 'Digital Course',
    topHeadline: '"Stop Optimizing. Start Eliminating."',
    conversions: 623,
    revenue: 124477
  },
  {
    id: 'executive-reset',
    name: 'Executive Reset Program',
    type: 'Coaching',
    topHeadline: '',
    conversions: 89,
    revenue: 133411
  }
];

export const insights: Insight[] = [
  {
    id: '1',
    beliefResolved: '"I need to do more to succeed"',
    analysis: 'This creative works by quantifying hidden waste, making the abstract concrete. The $47/day figure creates immediate pattern interrupt—it\'s specific enough to feel real, painful enough to demand attention. It reframes "morning routine" from self-care to self-sabotage for the wrong person.',
    whenWorks: 'Cold prospecting to achievement-oriented professionals who pride themselves on productivity. Works best with audiences already consuming productivity content but feeling stuck.',
    whenFails: 'Fails flat with audiences who don\'t have morning routines or who are in survival mode (worried about making rent, not optimizing time). The $47/day framing can feel privileged.',
    linkedCreatives: ['Your Morning Ritual Is Costing...']
  },
  {
    id: '2',
    beliefResolved: '"Success requires constant hustle"',
    analysis: 'The "Busy Trap" creative converts by validating exhaustion while offering a path out. The 6-figure anchor establishes that this is advice for people who\'ve already proven themselves—it\'s not beginner advice. "Protect their energy" reframes rest as strategic, not lazy.',
    whenWorks: 'Warm audiences and retargeting to people who have engaged with productivity content. Works exceptionally well with burned-out high achievers who are already successful but unsustainable.',
    whenFails: 'Falls flat with early-career professionals or people still trying to prove themselves. The "6-figure" qualifier can create resentment or make the message feel irrelevant.',
    linkedCreatives: ['The "Busy" Trap That Keeps 6-Figure Earners Stuck']
  }
];
