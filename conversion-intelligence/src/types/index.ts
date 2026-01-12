// Type definitions for Conversion Intelligence
// Force module refresh: 2026-01-12T00:30:00Z

export interface Channel {
  id: string;
  name: string;
  description: string;
  conversions?: number;
  comingSoon?: boolean;
}

export interface Creative {
  id: string;
  headline: string;
  bodySnippet: string;
  conversions: number;
  conversionRate: number;
  costPerConversion: number;
  clickThroughRate: number;
  spend: number;
  impressions: number;
  clicks: number;
  campaignName: string;
  adsetName: string;
  concept: string;
  status: 'Winning' | 'Testing' | 'Fatigued';
  confidence: 'High' | 'Medium' | 'Low';
  imageUrl?: string;
}

export interface TrafficType {
  id: string;
  name: string;
  conversions: number;
  spend: number;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  quote: string;
  creativeCount: number;
  conversions: number;
}

export interface Product {
  id: string;
  name: string;
  type: string;
  topHeadline: string;
  conversions: number;
  revenue: number;
}

export interface Insight {
  id: string;
  beliefResolved: string;
  analysis: string;
  whenWorks: string;
  whenFails: string;
  linkedCreatives: string[];
}

// Explicit re-export for module resolution
export type { Channel as ChannelType };
export type { Creative as CreativeType };
export type { TrafficType as TrafficTypeType };
export type { Concept as ConceptType };
export type { Product as ProductType };
export type { Insight as InsightType };
