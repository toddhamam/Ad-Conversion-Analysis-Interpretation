import type { BusinessType } from '../types/organization';

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

const CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  ecommerce: ECOMMERCE_CONFIG,
  leadgen: LEADGEN_CONFIG,
};

export function getBusinessTypeConfig(businessType: BusinessType): BusinessTypeConfig {
  return CONFIGS[businessType] || ECOMMERCE_CONFIG;
}
