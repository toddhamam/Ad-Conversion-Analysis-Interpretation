import type { BusinessType, CampaignIntent } from '../types/organization';

export interface BusinessTypeConfig {
  // Labels
  conversionNoun: string;
  conversionNounPlural: string;
  conversionVerb: string;
  costPerConversionLabel: string;
  conversionRateLabel: string;
  primaryKPI: string;
  valueMetricLabel: string;

  // Meta API
  primaryActionType: string;

  // Thresholds for ad status classification
  winningCVRThreshold: number;
  fatiguedCVRThreshold: number;
  winningConversionMin: number;
  fatiguedSpendMin: number;

  // Dashboard default visible/hidden metrics
  defaultVisibleMetrics: string[];
  hiddenMetrics: string[];

  // Ad Publisher defaults
  defaultObjective: string;
  defaultConversionEvent: string;
  defaultCTAType: string;

  // AI Prompt context
  aiConversionLanguage: string;
  aiPsychologyShifts: string;
  aiRetentionContext: string;
}

const ECOMMERCE_CONFIG: BusinessTypeConfig = {
  conversionNoun: 'Purchase',
  conversionNounPlural: 'Purchases',
  conversionVerb: 'purchased',
  costPerConversionLabel: 'Cost Per Purchase',
  conversionRateLabel: 'Conversion Rate',
  primaryKPI: 'ROAS',
  valueMetricLabel: 'AOV',

  primaryActionType: 'offsite_conversion.fb_pixel_purchase',

  winningCVRThreshold: 5,
  fatiguedCVRThreshold: 1,
  winningConversionMin: 10,
  fatiguedSpendMin: 50,

  defaultVisibleMetrics: [
    'totalRevenue', 'totalPurchases', 'conversionRate', 'aov',
    'uniqueCustomers', 'adSpend', 'roas', 'cac',
    'transactionFees', 'cogs', 'grossProfit', 'netProfit',
  ],
  hiddenMetrics: [
    'leads', 'costPerLead', 'leadRate',
  ],

  defaultObjective: 'OUTCOME_SALES',
  defaultConversionEvent: 'PURCHASE',
  defaultCTAType: 'SHOP_NOW',

  aiConversionLanguage: 'When we say "conversion", we mean a completed purchase. ROAS (Return on Ad Spend) and AOV (Average Order Value) are the primary performance metrics.',
  aiPsychologyShifts: 'fear_elimination should focus on purchase-related fears (waste of money, product doesn\'t work for me, buyer\'s remorse).',
  aiRetentionContext: 'This person has ALREADY PURCHASED. They know the brand, the product, and the experience. They have used it. Your job is to deepen the relationship, make them feel like insiders, and present the next logical step.',
};

const LEADGEN_CONFIG: BusinessTypeConfig = {
  conversionNoun: 'Lead',
  conversionNounPlural: 'Leads',
  conversionVerb: 'opted in',
  costPerConversionLabel: 'Cost Per Lead',
  conversionRateLabel: 'Lead Rate',
  primaryKPI: 'Cost Per Lead',
  valueMetricLabel: '',

  primaryActionType: 'lead',

  winningCVRThreshold: 15,
  fatiguedCVRThreshold: 3,
  winningConversionMin: 10,
  fatiguedSpendMin: 50,

  defaultVisibleMetrics: [
    'leads', 'costPerLead', 'leadRate', 'adSpend',
    'results', 'costPerResult', 'resultRate', 'leadToResultRate',
    'linkClicks', 'impressions', 'reach',
  ],
  hiddenMetrics: [
    'totalRevenue', 'aov', 'roas', 'uniqueCustomers',
    'transactionFees', 'cogs', 'grossProfit', 'netProfit',
  ],

  defaultObjective: 'OUTCOME_LEADS',
  defaultConversionEvent: 'LEAD',
  defaultCTAType: 'SIGN_UP',

  aiConversionLanguage: 'When we say "conversion", we mean a lead submission (form fill, booked call, opt-in). Cost Per Lead is the primary performance metric. ROAS and revenue do NOT apply to this business.',
  aiPsychologyShifts: 'fear_elimination should focus on commitment fears (sharing personal info, getting spammed, wasting time on a call, fear of being sold to aggressively).',
  aiRetentionContext: 'This person has ALREADY OPTED IN or BOOKED A CALL. They have expressed interest and taken action. They are familiar with the brand and have shown intent. Your job is to nurture the relationship and move them to the next step.',
};

const HYBRID_CONFIG: BusinessTypeConfig = {
  conversionNoun: 'Conversion',
  conversionNounPlural: 'Conversions',
  conversionVerb: 'converted',
  costPerConversionLabel: 'Cost Per Conversion',
  conversionRateLabel: 'Conversion Rate',
  primaryKPI: 'Overall Performance',
  valueMetricLabel: 'AOV / CPL',

  primaryActionType: 'hybrid',

  // Use conservative (e-commerce) defaults; overridden per-ad for leads in fetchAdCreatives
  winningCVRThreshold: 5,
  fatiguedCVRThreshold: 1,
  winningConversionMin: 10,
  fatiguedSpendMin: 50,

  // Show ALL metrics — union of e-com and lead gen
  defaultVisibleMetrics: [
    'totalRevenue', 'totalPurchases', 'conversionRate', 'aov',
    'uniqueCustomers', 'adSpend', 'roas', 'cac',
    'transactionFees', 'cogs', 'grossProfit', 'netProfit',
    'leads', 'costPerLead', 'leadRate',
    'results', 'costPerResult', 'resultRate', 'leadToResultRate',
    'linkClicks', 'impressions', 'reach',
  ],
  hiddenMetrics: [],

  // Base defaults — overridden by campaign intent at creation time
  defaultObjective: 'OUTCOME_SALES',
  defaultConversionEvent: 'PURCHASE',
  defaultCTAType: 'SHOP_NOW',

  aiConversionLanguage: 'This ad account runs BOTH e-commerce purchase campaigns AND lead generation campaigns. Some campaigns optimize for completed purchases (tracked via pixel purchase events, measured by ROAS and AOV). Others optimize for lead submissions — form fills, booked calls, or opt-ins (measured by Cost Per Lead and Lead Rate). Analyze all campaign types together. Identify patterns that work across both funnels, as well as patterns unique to each.',
  aiPsychologyShifts: 'fear_elimination should be adapted to the campaign type. For purchase campaigns: focus on buyer fears (waste of money, product doesn\'t work, buyer\'s remorse). For lead gen campaigns: focus on commitment fears (sharing personal info, getting spammed, wasting time on a call).',
  aiRetentionContext: 'This person has ALREADY CONVERTED — they may have purchased a product OR opted in / booked a call. Adapt retention messaging to match their conversion type. For past purchasers: deepen the relationship and present the next product. For past leads: nurture toward the next step in the funnel.',
};

// --- Campaign Intent Config (used at creative generation / publish time for hybrid accounts) ---

export interface CampaignIntentConfig {
  label: string;
  description: string;
  defaultObjective: string;
  defaultConversionEvent: string;
  defaultCTAType: string;
  aiConversionLanguage: string;
  aiPsychologyShifts: string;
  aiRetentionContext: string;
}

const PURCHASE_INTENT_CONFIG: CampaignIntentConfig = {
  label: 'Sell a Product',
  description: 'E-commerce purchase campaign — optimize for sales',
  defaultObjective: ECOMMERCE_CONFIG.defaultObjective,
  defaultConversionEvent: ECOMMERCE_CONFIG.defaultConversionEvent,
  defaultCTAType: ECOMMERCE_CONFIG.defaultCTAType,
  aiConversionLanguage: ECOMMERCE_CONFIG.aiConversionLanguage,
  aiPsychologyShifts: ECOMMERCE_CONFIG.aiPsychologyShifts,
  aiRetentionContext: ECOMMERCE_CONFIG.aiRetentionContext,
};

const LEAD_INTENT_CONFIG: CampaignIntentConfig = {
  label: 'Generate Leads',
  description: 'Lead gen campaign — optimize for leads, calls, or opt-ins',
  defaultObjective: LEADGEN_CONFIG.defaultObjective,
  defaultConversionEvent: LEADGEN_CONFIG.defaultConversionEvent,
  defaultCTAType: LEADGEN_CONFIG.defaultCTAType,
  aiConversionLanguage: LEADGEN_CONFIG.aiConversionLanguage,
  aiPsychologyShifts: LEADGEN_CONFIG.aiPsychologyShifts,
  aiRetentionContext: LEADGEN_CONFIG.aiRetentionContext,
};

const QUIZ_INTENT_CONFIG: CampaignIntentConfig = {
  label: 'Quiz / Assessment Funnel',
  description: 'Quiz funnel campaign — drive quiz completions that lead to sales',
  defaultObjective: 'OUTCOME_LEADS',
  defaultConversionEvent: 'LEAD',
  defaultCTAType: 'LEARN_MORE',
  aiConversionLanguage: `When we say "conversion", we mean a QUIZ or ASSESSMENT completion. The ad drives traffic to an interactive quiz/assessment. The user answers questions and receives a personalized result, which then presents a relevant product or service offer. The funnel is: Ad → Quiz → Personalized Result → Offer/Sale. At the ad level, optimize for quiz starts and completions (tracked as leads). The ultimate business goal is sales, but the ad copy should sell the QUIZ EXPERIENCE, not the product directly.`,
  aiPsychologyShifts: `fear_elimination should focus on quiz-specific fears: "will I learn something uncomfortable about myself", "is this just a gimmick to sell me something", "will this waste my time", "what if my results are bad". Counter these with: the quiz is free, takes 2 minutes, no email required (if applicable), and the results are genuinely valuable regardless of whether they buy anything. The PRIMARY psychological lever is CURIOSITY — the irresistible desire to discover something hidden about themselves.`,
  aiRetentionContext: `This person has ALREADY TAKEN THE QUIZ. They have their personalized results and know their "type" or profile. They may or may not have purchased after seeing the offer. Your job is to re-engage based on their quiz results — reference the self-discovery they experienced, deepen the insight from their results, and position the product as the next step in their personal journey. Use identity-based language tied to their quiz outcome.`,
};

const INTENT_CONFIGS: Record<CampaignIntent, CampaignIntentConfig> = {
  purchase: PURCHASE_INTENT_CONFIG,
  lead: LEAD_INTENT_CONFIG,
  quiz: QUIZ_INTENT_CONFIG,
};

export function getCampaignIntentConfig(intent: CampaignIntent): CampaignIntentConfig {
  return INTENT_CONFIGS[intent];
}

const CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  ecommerce: ECOMMERCE_CONFIG,
  leadgen: LEADGEN_CONFIG,
  hybrid: HYBRID_CONFIG,
};

export function getBusinessTypeConfig(businessType: BusinessType): BusinessTypeConfig {
  return CONFIGS[businessType] || ECOMMERCE_CONFIG;
}
