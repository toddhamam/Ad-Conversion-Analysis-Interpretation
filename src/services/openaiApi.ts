// OpenAI API Service for Ad Analysis and Interpretation
console.log('🤖 openaiApi.ts loaded at', new Date().toISOString());

// Import image cache for using captured reference images
import { getTopHighQualityCachedImages } from './imageCache';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

// Google Gemini API Configuration
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// =============================================================================
// MODEL CONFIGURATION - Always use the latest available models
// =============================================================================
// GPT-5.2 is OpenAI's flagship model - reasoning is controlled via the reasoning.effort parameter
const DEFAULT_CHAT_MODEL = 'gpt-5.2'; // Latest GPT-5.2 with reasoning capabilities
const DEFAULT_VISION_MODEL = 'gpt-5.2'; // GPT-5.2 has multimodal vision support

// Reasoning configuration for GPT-5.2 Thinking
// Options: 'none' | 'low' | 'medium' | 'high' | 'xhigh'
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';

// ConversionIQ™ branded reasoning levels for UI
// Timing estimates based on GPT-5.2 reasoning behavior for typical ad analysis tasks
export const IQ_LEVELS: Record<ReasoningEffort, {
  name: string;
  tagline: string;
  description: string;
  timing: string;
  tokenLabel: string;
  tokenUsage: 'low' | 'medium' | 'high';
  icon: string;
}> = {
  none: {
    name: 'IQ Off',
    tagline: 'Basic processing',
    description: 'No AI reasoning applied',
    timing: '~5 sec',
    tokenLabel: 'Low',
    tokenUsage: 'low',
    icon: '○'
  },
  low: {
    name: 'IQ Quick',
    tagline: 'Fast analysis',
    description: 'Light reasoning for simple tasks',
    timing: '~10 sec',
    tokenLabel: 'Low',
    tokenUsage: 'low',
    icon: '◔'
  },
  medium: {
    name: 'IQ Standard',
    tagline: 'Smart & efficient',
    description: 'Balanced insights with quick turnaround. Great for everyday analysis.',
    timing: '10-20 sec',
    tokenLabel: 'Standard',
    tokenUsage: 'medium',
    icon: '◑'
  },
  high: {
    name: 'IQ Deep',
    tagline: 'Thorough analysis',
    description: 'Extended reasoning for nuanced insights. Ideal for strategic decisions.',
    timing: '20-40 sec',
    tokenLabel: '2x Standard',
    tokenUsage: 'medium',
    icon: '◕'
  },
  xhigh: {
    name: 'IQ Maximum',
    tagline: 'Ultra-intelligent',
    description: 'Maximum reasoning depth. Best for complex, high-stakes creative strategy.',
    timing: '30-90 sec',
    tokenLabel: '3-5x Standard',
    tokenUsage: 'high',
    icon: '●'
  }
};

// User-facing levels (exclude 'none' and 'low' for standard users)
export const USER_IQ_LEVELS: ReasoningEffort[] = ['medium', 'high', 'xhigh'];

// Image Generation - Using Google Gemini Nano Banana Pro
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview'; // Nano Banana Pro for professional ad assets
const USE_GEMINI_FOR_IMAGES = true; // Switch to use Gemini instead of DALL-E

// Video Generation - Using Google Veo 3.1
const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview'; // Latest Veo with native audio
const VEO_FAST_MODEL = 'veo-3.1-fast-generate-preview'; // Faster generation, still has audio
const USE_VEO_FOR_VIDEO = true; // Use Veo instead of storyboard-only
const DALLE_MODEL = 'dall-e-3'; // DALL-E fallback for image generation

// =============================================================================
// IMAGE SIZE CONFIGURATION - Common Meta Ads formats
// =============================================================================
export type ImageSize = '1:1' | '16:9' | '9:16';

export interface ImageSizeConfig {
  id: ImageSize;
  name: string;
  description: string;
  dimensions: string;
  dalleSize: '1024x1024' | '1792x1024' | '1024x1792';
  icon: string;
}

export const IMAGE_SIZE_OPTIONS: ImageSizeConfig[] = [
  {
    id: '1:1',
    name: 'Square',
    description: 'Feed ads, Instagram posts',
    dimensions: '1080×1080',
    dalleSize: '1024x1024',
    icon: '⬜',
  },
  {
    id: '16:9',
    name: 'Landscape',
    description: 'Link ads, Facebook feed',
    dimensions: '1920×1080',
    dalleSize: '1792x1024',
    icon: '🖼️',
  },
  {
    id: '9:16',
    name: 'Portrait/Story',
    description: 'Stories, Reels',
    dimensions: '1080×1920',
    dalleSize: '1024x1792',
    icon: '📱',
  },
];

export const DEFAULT_IMAGE_SIZE: ImageSize = '1:1';

// Copy length types for body copy generation
export type CopyLength = 'short' | 'long';

export interface CopyLengthConfig {
  id: CopyLength;
  name: string;
  description: string;
  maxChars: number;
  icon: string;
}

export const COPY_LENGTH_OPTIONS: CopyLengthConfig[] = [
  {
    id: 'short',
    name: 'Short-Form',
    description: 'Punchy, scroll-stopping (max 125 chars)',
    maxChars: 125,
    icon: '⚡',
  },
  {
    id: 'long',
    name: 'Long-Form',
    description: 'Full story, emotional depth (max 500 chars)',
    maxChars: 500,
    icon: '📖',
  },
];

export const DEFAULT_COPY_LENGTH: CopyLength = 'short';

// Product context for accurate ad generation
export interface ProductContext {
  id: string;
  name: string;
  author: string;
  description: string;
  landingPageUrl: string;
  productImages: Array<{
    base64Data: string;
    mimeType: string;
    fileName: string;
  }>;
  createdAt: string;
}

// Check if Gemini API is configured
export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY.length > 0;
}

console.log('🤖 Using models:', {
  chat: DEFAULT_CHAT_MODEL,
  vision: DEFAULT_VISION_MODEL,
  image: USE_GEMINI_FOR_IMAGES ? `Gemini ${DEFAULT_IMAGE_MODEL}` : 'DALL-E 3',
  video: USE_VEO_FOR_VIDEO ? `Veo ${DEFAULT_VIDEO_MODEL}` : 'Storyboard only'
});
console.log('🎨 Gemini API Key:', GEMINI_API_KEY ? 'configured' : 'NOT CONFIGURED');

// Check if API key is configured
export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY && OPENAI_API_KEY.length > 0;
}

// Log configuration status
console.log('🔑 OpenAI API Key:', OPENAI_API_KEY ? 'configured' : 'NOT CONFIGURED');

// Types for ad analysis
export interface AdCreativeData {
  id: string;
  headline: string;
  bodyText: string;
  imageUrl?: string;
  campaignName: string;
  adsetName: string;
  // Performance metrics
  spend: number;
  conversions: number;
  conversionRate: number;
  costPerConversion: number;
  clicks: number;
  impressions: number;
  ctr: number;
  roas?: number;
}

export interface AdAnalysisResult {
  adId: string;
  overallScore: number; // 1-10 rating
  summary: string;

  // Creative Analysis
  creativeAnalysis: {
    strengths: string[];
    weaknesses: string[];
    visualImpact: string;
    brandAlignment: string;
  };

  // Copy Analysis
  copyAnalysis: {
    headlineEffectiveness: string;
    bodyTextAnalysis: string;
    callToAction: string;
    emotionalTriggers: string[];
    persuasionTechniques: string[];
  };

  // Performance Insights
  performanceInsights: {
    conversionDrivers: string[];
    potentialIssues: string[];
    audienceAlignment: string;
  };

  // Recommendations
  recommendations: {
    immediate: string[];
    testing: string[];
    scaling: string[];
  };

  // Competitive positioning
  competitiveAnalysis?: string;
}

export interface CampaignInsightsSummary {
  overallPerformance: string;
  topPerformingElements: string[];
  underperformingElements: string[];
  keyInsights: string[];
  strategicRecommendations: string[];
  creativeTrends: string[];
}

// Ad Generator Types
export type AudienceType = 'prospecting' | 'retargeting' | 'retention';
export type AdType = 'image' | 'video';

// Concept Types for multi-step creative generation
export type ConceptType =
  | 'auto'
  | 'cognitive_dissonance'
  | 'social_proof'
  | 'fear_elimination'
  | 'product_benefits'
  | 'transformation'
  | 'urgency_scarcity'
  | 'authority';

// Concept configuration for psychological messaging angles
export const CONCEPT_ANGLES: Record<ConceptType, {
  name: string;
  icon: string;
  description: string;
  visualDirection: string;
  messagingStyle: string;
  promptHints: string[];
}> = {
  auto: {
    name: 'C.I. Intelligence',
    icon: '◎',
    description: 'Auto-select based on your channel analysis insights',
    visualDirection: 'Derived from top-performing patterns in your ads',
    messagingStyle: 'Informed by what already works in your campaigns',
    promptHints: ['analysis-driven', 'data-informed', 'optimized']
  },
  cognitive_dissonance: {
    name: 'Cognitive Dissonance',
    icon: '◇',
    description: 'Address the gap between what people know and what they do',
    visualDirection: 'Before/after transformations, breakthrough moments, relief imagery',
    messagingStyle: 'Challenge current state, highlight the internal conflict, offer resolution',
    promptHints: ['internal conflict', 'you already know', 'alignment', 'what you know vs what you do', 'breakthrough']
  },
  social_proof: {
    name: 'Social Proof',
    icon: '◈',
    description: 'Leverage crowd behavior, testimonials, and popularity',
    visualDirection: 'Groups of people, testimonial quotes, numbers/statistics, trust badges',
    messagingStyle: 'Numbers, testimonials, community, popularity indicators',
    promptHints: ['thousands of people', 'join the community', 'trusted by', 'reviews', 'others like you']
  },
  fear_elimination: {
    name: 'Fear Elimination',
    icon: '◆',
    description: 'Remove anxiety, risk, and barriers to action',
    visualDirection: 'Safety imagery, guarantees, shields, protective elements',
    messagingStyle: 'Risk reversal, guarantees, safety, reassurance',
    promptHints: ['no risk', 'guaranteed', 'worry-free', 'protected', 'safe to try']
  },
  product_benefits: {
    name: 'Product Benefits',
    icon: '✦',
    description: 'Highlight specific features and tangible benefits',
    visualDirection: 'Product showcase, feature highlights, detail shots',
    messagingStyle: 'Feature-benefit statements, specifications, tangible outcomes',
    promptHints: ['get access to', 'includes', 'features', 'you receive', 'comes with']
  },
  transformation: {
    name: 'Transformation Promise',
    icon: '↗',
    description: 'Show the aspirational outcome and identity shift',
    visualDirection: 'Aspirational lifestyle, success imagery, identity transformation',
    messagingStyle: 'Future pacing, identity language, aspirational outcomes',
    promptHints: ['become the person', 'imagine yourself', 'transform into', 'finally be', 'your new reality']
  },
  urgency_scarcity: {
    name: 'Urgency & Scarcity',
    icon: '⧖',
    description: 'Create time pressure and limited availability',
    visualDirection: 'Countdown timers, limited badges, exclusive access imagery',
    messagingStyle: 'Time limits, quantity limits, exclusive access, FOMO triggers',
    promptHints: ['limited time', 'only X left', 'expires soon', 'exclusive', 'dont miss out']
  },
  authority: {
    name: 'Authority & Expertise',
    icon: '★',
    description: 'Build credibility through expertise and credentials',
    visualDirection: 'Expert imagery, credentials, certifications, professional settings',
    messagingStyle: 'Expert endorsements, credentials, research-backed claims',
    promptHints: ['backed by science', 'expert-approved', 'certified', 'proven method', 'research shows']
  }
};

export interface GeneratedImageResult {
  imageUrl: string;
  revisedPrompt: string;
}

export interface GeneratedVideoResult {
  videoUrl: string;
  duration: string;
  aspectRatio: string;
  prompt: string;
}

export interface GeneratedCopyResult {
  headlines: string[];
  bodyTexts: string[];
  callToActions: string[];
  rationale: string;
}

export interface VideoStoryboard {
  scenes: Array<{
    sceneNumber: number;
    duration: string;
    visualDescription: string;
    textOverlay: string;
    voiceover: string;
  }>;
  conceptSummary: string;
}

export interface GeneratedAdPackage {
  id: string;
  generatedAt: string;
  adType: AdType;
  audienceType: AudienceType;
  conceptType?: ConceptType;
  images?: GeneratedImageResult[];
  video?: GeneratedVideoResult;
  copy: GeneratedCopyResult;
  storyboard?: VideoStoryboard;
  whyItWorks: string;
  imageError?: string; // Error message if image generation failed
  videoError?: string; // Error message if video generation failed
}

// Copy Options for multi-step generation
export interface CopyOption {
  id: string;
  text: string;
  rationale: string;
}

export interface CopyOptionsResult {
  headlines: CopyOption[];
  bodyTexts: CopyOption[];
  callToActions: CopyOption[];
}

/**
 * Make a request to OpenAI API (supports both text and vision)
 * Note: The reasoning parameter is not supported by the current OpenAI API
 */
async function callOpenAI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
  } = {}
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured. Please add your API key to the configuration.');
  }

  const {
    model = DEFAULT_CHAT_MODEL,
    temperature = 0.7,
    maxTokens = 2000,
    reasoningEffort = DEFAULT_REASONING_EFFORT
  } = options;

  console.log('🤖 Calling OpenAI API with model:', model);
  console.log('🧠 Reasoning effort:', reasoningEffort, '(note: not applied - parameter not supported)');
  console.log('🔑 API Key present:', !!OPENAI_API_KEY);

  // Build request body - reasoning parameter is NOT supported by current OpenAI API
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI API Error Status:', response.status);
    console.error('❌ OpenAI API Error Text:', errorText);

    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (parseError) {
      // JSON parsing failed, use the raw text if available
      if (errorText) {
        errorMessage = errorText.substring(0, 200);
      }
    }

    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  const data = await response.json();
  console.log('✅ OpenAI response received');

  return data.choices[0]?.message?.content || '';
}

/**
 * Make a request to OpenAI API with vision/image support
 * Note: The reasoning parameter is not supported for multimodal/vision requests
 */
async function callOpenAIWithVision(
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
  } = {}
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured. Please add your API key to the configuration.');
  }

  // Use GPT-5.2 for vision - multimodal capabilities
  const {
    model = DEFAULT_VISION_MODEL,
    temperature = 0.7,
    maxTokens = 4000,
    reasoningEffort = DEFAULT_REASONING_EFFORT
  } = options;

  console.log('🖼️ Calling OpenAI Vision API with model:', model);
  console.log('🧠 Reasoning effort:', reasoningEffort, '(note: not applied to vision requests)');
  console.log('📸 Processing images for analysis...');

  // Build request body - reasoning parameter is NOT supported for vision/multimodal requests
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI Vision API Error Status:', response.status);
    console.error('❌ OpenAI Vision API Error Text:', errorText);

    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (parseError) {
      if (errorText) {
        errorMessage = errorText.substring(0, 200);
      }
    }

    throw new Error(`OpenAI Vision API error: ${errorMessage}`);
  }

  const data = await response.json();
  console.log('✅ OpenAI Vision response received');

  return data.choices[0]?.message?.content || '';
}

/**
 * Analyze a single ad creative
 * @param ad - The ad creative data to analyze
 * @param options - Optional configuration including reasoning effort level
 */
export async function analyzeAdCreative(
  ad: AdCreativeData,
  options?: { reasoningEffort?: ReasoningEffort }
): Promise<AdAnalysisResult> {
  const reasoningEffort = options?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  console.log('🔍 Analyzing ad:', ad.id, '| IQ Level:', reasoningEffort);

  const systemPrompt = `You are an expert digital marketing analyst specializing in Facebook/Meta advertising.
Your role is to analyze ad creatives and provide actionable insights based on performance data and creative elements.
You understand conversion optimization, copywriting psychology, visual design principles, and audience targeting.
Always provide specific, actionable recommendations based on the data provided.`;

  const userPrompt = `Analyze this Meta ad creative and provide detailed insights:

**Ad Details:**
- Headline: ${ad.headline}
- Body Copy: ${ad.bodyText}
- Campaign: ${ad.campaignName}
- Ad Set: ${ad.adsetName}
${ad.imageUrl ? `- Image URL: ${ad.imageUrl}` : '- No image available'}

**Performance Metrics:**
- Spend: $${ad.spend.toFixed(2)}
- Conversions: ${ad.conversions}
- Conversion Rate: ${ad.conversionRate.toFixed(2)}%
- Cost Per Conversion: $${ad.costPerConversion.toFixed(2)}
- Clicks: ${ad.clicks}
- Impressions: ${ad.impressions}
- CTR: ${ad.ctr.toFixed(2)}%
${ad.roas ? `- ROAS: ${ad.roas.toFixed(2)}x` : ''}

Please provide your analysis in the following JSON format:
{
  "overallScore": <1-10 rating>,
  "summary": "<brief 2-3 sentence summary>",
  "creativeAnalysis": {
    "strengths": ["<strength 1>", "<strength 2>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>"],
    "visualImpact": "<assessment of visual elements>",
    "brandAlignment": "<assessment of brand consistency>"
  },
  "copyAnalysis": {
    "headlineEffectiveness": "<analysis>",
    "bodyTextAnalysis": "<analysis>",
    "callToAction": "<analysis>",
    "emotionalTriggers": ["<trigger 1>", "<trigger 2>"],
    "persuasionTechniques": ["<technique 1>", "<technique 2>"]
  },
  "performanceInsights": {
    "conversionDrivers": ["<driver 1>", "<driver 2>"],
    "potentialIssues": ["<issue 1>", "<issue 2>"],
    "audienceAlignment": "<assessment>"
  },
  "recommendations": {
    "immediate": ["<action 1>", "<action 2>"],
    "testing": ["<test idea 1>", "<test idea 2>"],
    "scaling": ["<scaling recommendation 1>"]
  }
}

Return ONLY the JSON object, no additional text.`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.5, reasoningEffort });

  try {
    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    const analysis = JSON.parse(cleanedResponse.trim());
    return {
      adId: ad.id,
      ...analysis,
    };
  } catch (error) {
    console.error('❌ Failed to parse OpenAI response:', error);
    console.error('Raw response:', response);
    throw new Error('Failed to parse ad analysis response');
  }
}

/**
 * Analyze multiple ads and generate campaign-level insights
 */
export async function analyzeCampaignAds(ads: AdCreativeData[]): Promise<CampaignInsightsSummary> {
  console.log('📊 Analyzing campaign with', ads.length, 'ads');

  // Sort ads by performance
  const sortedAds = [...ads].sort((a, b) => b.conversionRate - a.conversionRate);
  const topPerformers = sortedAds.slice(0, 3);
  const underperformers = sortedAds.slice(-3).reverse();

  const systemPrompt = `You are an expert digital marketing strategist specializing in Meta advertising campaigns.
Analyze the provided campaign data and identify patterns, trends, and strategic insights.
Focus on what's working, what's not, and how to improve overall campaign performance.`;

  const userPrompt = `Analyze this Meta advertising campaign and provide strategic insights:

**Campaign Overview:**
- Total Ads: ${ads.length}
- Total Spend: $${ads.reduce((sum, ad) => sum + ad.spend, 0).toFixed(2)}
- Total Conversions: ${ads.reduce((sum, ad) => sum + ad.conversions, 0)}
- Average Conversion Rate: ${(ads.reduce((sum, ad) => sum + ad.conversionRate, 0) / ads.length).toFixed(2)}%

**Top Performing Ads:**
${topPerformers.map((ad, i) => `
${i + 1}. "${ad.headline}"
   - Conversion Rate: ${ad.conversionRate.toFixed(2)}%
   - Cost/Conv: $${ad.costPerConversion.toFixed(2)}
   - Body: ${ad.bodyText.substring(0, 100)}...
`).join('')}

**Underperforming Ads:**
${underperformers.map((ad, i) => `
${i + 1}. "${ad.headline}"
   - Conversion Rate: ${ad.conversionRate.toFixed(2)}%
   - Cost/Conv: $${ad.costPerConversion.toFixed(2)}
   - Body: ${ad.bodyText.substring(0, 100)}...
`).join('')}

Provide your analysis in the following JSON format:
{
  "overallPerformance": "<summary of campaign performance>",
  "topPerformingElements": ["<element 1>", "<element 2>", "<element 3>"],
  "underperformingElements": ["<element 1>", "<element 2>"],
  "keyInsights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "strategicRecommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "creativeTrends": ["<trend 1>", "<trend 2>"]
}

Return ONLY the JSON object, no additional text.`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.5, maxTokens: 1500 });

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    return JSON.parse(cleanedResponse.trim());
  } catch (error) {
    console.error('❌ Failed to parse campaign insights:', error);
    throw new Error('Failed to parse campaign insights response');
  }
}

/**
 * Generate new ad copy based on winning elements
 */
export async function generateAdCopy(
  winningAds: AdCreativeData[],
  options: {
    style?: 'similar' | 'variation' | 'new-angle';
    targetAudience?: string;
    productDescription?: string;
  } = {}
): Promise<{
  headlines: string[];
  bodyTexts: string[];
  callToActions: string[];
}> {
  const { style = 'variation', targetAudience, productDescription } = options;

  const systemPrompt = `You are an expert copywriter specializing in high-converting Meta ad copy.
Based on the winning ad patterns provided, generate new ad variations that maintain the successful elements
while introducing fresh approaches to prevent ad fatigue.`;

  const userPrompt = `Based on these winning ads, generate new ad copy variations:

**Winning Ad Examples:**
${winningAds.map((ad, i) => `
${i + 1}. Headline: "${ad.headline}"
   Body: "${ad.bodyText}"
   Conversion Rate: ${ad.conversionRate.toFixed(2)}%
`).join('')}

${targetAudience ? `**Target Audience:** ${targetAudience}` : ''}
${productDescription ? `**Product/Offer:** ${productDescription}` : ''}
**Style:** ${style}

Generate new ad copy in the following JSON format:
{
  "headlines": ["<headline 1>", "<headline 2>", "<headline 3>", "<headline 4>", "<headline 5>"],
  "bodyTexts": ["<body text 1>", "<body text 2>", "<body text 3>"],
  "callToActions": ["<CTA 1>", "<CTA 2>", "<CTA 3>"]
}

Return ONLY the JSON object, no additional text.`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.8, maxTokens: 1500 });

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    return JSON.parse(cleanedResponse.trim());
  } catch (error) {
    console.error('❌ Failed to parse generated copy:', error);
    throw new Error('Failed to generate ad copy');
  }
}

// Channel-wide analysis types
export interface ChannelAnalysisResult {
  channelName: string;
  analyzedAt: string;

  // Executive Summary
  executiveSummary: string;
  overallHealthScore: number; // 1-10

  // Performance Breakdown
  performanceBreakdown: {
    totalAdsAnalyzed: number;
    highPerformers: number;
    midPerformers: number;
    lowPerformers: number;
    avgConversionRate: number;
    avgCostPerConversion: number;
    totalSpend: number;
    totalConversions: number;
  };

  // Visual/Creative Analysis (NEW)
  visualAnalysis: {
    winningVisualElements: string[];
    losingVisualElements: string[];
    colorPsychology: string;
    imageryPatterns: string;
    inImageMessaging: string;
    psychologicalTriggers: string[]; // e.g., "cognitive dissonance reduction", "social proof"
  };

  // Same Headline Different Image Analysis (NEW)
  headlineImageAnalysis: Array<{
    headline: string;
    variations: Array<{
      adId: string;
      imageDescription: string;
      conversionRate: number;
      whyItConverts: string;
    }>;
    keyDifferentiator: string; // What in the IMAGE made the difference
  }>;

  // Pattern Analysis
  winningPatterns: {
    headlines: string[];
    copyElements: string[];
    emotionalTriggers: string[];
    callToActions: string[];
    visualElements: string[]; // NEW
  };

  losingPatterns: {
    headlines: string[];
    copyElements: string[];
    issues: string[];
    visualIssues: string[]; // NEW
  };

  // Audience Insights
  audienceInsights: {
    whatResonates: string[];
    whatDoesntWork: string[];
    targetingRecommendations: string[];
    visualPreferences: string[]; // NEW
  };

  // Strategic Recommendations
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    strategic: string[];
    creativeDirection: string[]; // NEW - visual/creative recommendations
  };

  // Top/Bottom Performers (Enhanced)
  topAds: Array<{
    id: string;
    headline: string;
    conversionRate: number;
    whyItWorks: string;
    imageAnalysis: string; // What's in the image that drives conversion
    psychologicalDrivers: string[];
    imageUrl?: string; // CRITICAL: Actual image URL for visual reference in generation
  }>;

  bottomAds: Array<{
    id: string;
    headline: string;
    conversionRate: number;
    whyItFails: string;
    imageIssues: string; // What's wrong with the visual
    suggestedFix: string;
    imageUrl?: string; // Image URL for reference
  }>;
}

// Type for multimodal message content
type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
    >;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

/**
 * Analyze all ads for a channel with comprehensive IMAGE ANALYSIS
 * Uses GPT-5.2 Thinking vision to analyze ad creatives visually
 * @param ads - Array of ad creatives to analyze
 * @param channelName - Name of the advertising channel
 * @param options - Optional configuration including reasoning effort level
 */
export async function analyzeChannelPerformance(
  ads: AdCreativeData[],
  channelName: string = 'Meta',
  options?: { reasoningEffort?: ReasoningEffort }
): Promise<ChannelAnalysisResult> {
  const reasoningEffort = options?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  console.log(`📊 Running channel-wide VISUAL analysis for ${channelName} with ${ads.length} ads | IQ Level: ${reasoningEffort}`);

  if (ads.length === 0) {
    throw new Error('No ads to analyze');
  }

  // Calculate aggregated statistics
  const totalSpend = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const totalConversions = ads.reduce((sum, ad) => sum + ad.conversions, 0);
  const avgConversionRate = ads.reduce((sum, ad) => sum + ad.conversionRate, 0) / ads.length;
  const avgCostPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Sort ads by conversion rate
  const sortedAds = [...ads].sort((a, b) => b.conversionRate - a.conversionRate);

  // Classify performance tiers
  const highPerformers = sortedAds.filter(ad => ad.conversionRate > avgConversionRate * 1.5);
  const lowPerformers = sortedAds.filter(ad => ad.conversionRate < avgConversionRate * 0.5);
  const midPerformers = sortedAds.filter(ad =>
    ad.conversionRate >= avgConversionRate * 0.5 && ad.conversionRate <= avgConversionRate * 1.5
  );

  // Get top 5 and bottom 5 for detailed analysis
  const top5 = sortedAds.slice(0, Math.min(5, sortedAds.length));
  const bottom5 = sortedAds.slice(-Math.min(5, sortedAds.length)).reverse();

  // CRITICAL: Group ads by headline to identify where IMAGE is the differentiator
  const headlineGroups = new Map<string, AdCreativeData[]>();
  ads.forEach(ad => {
    const existing = headlineGroups.get(ad.headline) || [];
    existing.push(ad);
    headlineGroups.set(ad.headline, existing);
  });

  // Find headlines with multiple ads (different images, same headline)
  const sameHeadlineDifferentPerformance = Array.from(headlineGroups.entries())
    .filter(([_, ads]) => ads.length > 1)
    .map(([headline, ads]) => {
      const sorted = [...ads].sort((a, b) => b.conversionRate - a.conversionRate);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const performanceDiff = best.conversionRate - worst.conversionRate;
      return { headline, ads: sorted, best, worst, performanceDiff };
    })
    .filter(group => group.performanceDiff > 1) // Only show if there's meaningful difference
    .sort((a, b) => b.performanceDiff - a.performanceDiff)
    .slice(0, 3); // Top 3 most interesting comparisons

  console.log(`🔍 Found ${sameHeadlineDifferentPerformance.length} headlines with varying image performance`);

  // Collect ads with images for visual analysis (prioritize top/bottom performers)
  // Filter out Facebook CDN URLs that require authentication
  const adsWithImages = [...top5, ...bottom5]
    .filter(ad => {
      if (!ad.imageUrl) return false;
      // Skip Facebook CDN URLs as they require authentication
      // OpenAI cannot download these directly
      const isFacebookCdn = ad.imageUrl.includes('fbcdn.net') ||
                            ad.imageUrl.includes('facebook.com') ||
                            ad.imageUrl.includes('fb.com');
      if (isFacebookCdn) {
        console.log(`⚠️ Skipping Facebook CDN image for ad ${ad.id} - requires auth`);
        return false;
      }
      return true;
    })
    .slice(0, 10); // Limit to 10 images for API efficiency

  console.log(`🖼️ Analyzing ${adsWithImages.length} ad images visually`);

  // If no accessible images, we'll do text-only analysis with enhanced prompting
  const hasAccessibleImages = adsWithImages.length > 0;

  // Build the multimodal message with images
  const imageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' | 'auto' } }> = [];

  // Add the main analysis prompt as text - adapt based on whether we have images
  const systemPrompt = hasAccessibleImages
    ? `You are an EXPERT advertising creative analyst and conversion optimization specialist.

YOUR PRIMARY TASK: Analyze ad IMAGES to understand WHY certain ads convert and others don't.

CRITICAL ANALYSIS REQUIREMENTS:
1. VISUAL ANALYSIS: Examine each ad image in detail - colors, imagery, text overlays, composition, emotional appeal
2. IN-IMAGE MESSAGING: Read and analyze any text/headlines WITHIN the images themselves
3. PSYCHOLOGICAL TRIGGERS: Identify deep psychological concepts like:
   - Cognitive dissonance reduction
   - Social proof elements
   - Scarcity/urgency cues
   - Identity reinforcement
   - Fear resolution
   - Aspiration/transformation imagery
4. SAME HEADLINE COMPARISON: When the same headline appears on multiple ads with different performance,
   the IMAGE is the differentiator. Identify EXACTLY what visual elements caused the conversion difference.
5. CREATIVE PATTERNS: What visual styles, colors, imagery types correlate with high vs low conversion?

You understand color psychology, visual hierarchy, emotional design, and conversion-focused creative strategy.`
    : `You are an EXPERT advertising creative analyst and conversion optimization specialist.

YOUR PRIMARY TASK: Analyze ad performance data to understand WHY certain ads convert and others don't.

NOTE: The ad images are hosted on Facebook's CDN and require authentication to access directly.
However, you can still provide valuable analysis based on:
1. HEADLINE PATTERNS: Analyze what makes certain headlines convert better
2. COPY ANALYSIS: What body text patterns correlate with high/low conversion
3. CAMPAIGN/ADSET CONTEXT: Use campaign and adset names to infer creative strategies
4. PSYCHOLOGICAL TRIGGERS in copy: Identify persuasion techniques, emotional triggers, urgency cues
5. SAME HEADLINE COMPARISON: When the same headline has different performance, hypothesize what
   creative differences (image variations, targeting, etc.) might explain the gap
6. CONVERSION PSYCHOLOGY: Apply principles like cognitive dissonance reduction, social proof,
   fear resolution, transformation promises, etc.

Based on the headline themes and ad performance data, make educated inferences about what
VISUAL elements likely drive conversion (e.g., "Fear-themed headlines perform best - visuals
likely show transformation/resolution imagery").`;

  imageContent.push({ type: 'text', text: systemPrompt });

  // Add each ad image with its context (only if we have accessible images)
  if (hasAccessibleImages) {
    for (const ad of adsWithImages) {
      if (ad.imageUrl) {
        imageContent.push({
          type: 'text',
          text: `\n--- AD ${ad.id} ---\nHeadline: "${ad.headline}"\nConversion Rate: ${ad.conversionRate.toFixed(2)}%\nSpend: $${ad.spend.toFixed(2)}\nConversions: ${ad.conversions}\nBody: "${ad.bodyText.substring(0, 100)}..."\nImage below:`
        });
        imageContent.push({
          type: 'image_url',
          image_url: { url: ad.imageUrl, detail: 'high' }
        });
      }
    }
  }

  // Add the analysis request
  const analysisPrompt = `
**ACCOUNT OVERVIEW:**
- Total Ads: ${ads.length}
- Total Spend: $${totalSpend.toFixed(2)}
- Total Conversions: ${totalConversions}
- Average CVR: ${avgConversionRate.toFixed(2)}%
- High Performers: ${highPerformers.length} | Mid: ${midPerformers.length} | Low: ${lowPerformers.length}
${!hasAccessibleImages ? '\n⚠️ NOTE: Ad images are on Facebook CDN (requires auth). Provide analysis based on copy patterns and inferred visual strategies.' : ''}

**TOP 5 ADS - DETAILED:**
${top5.map((ad, i) => `
${i + 1}. Ad ID: ${ad.id}
   Headline: "${ad.headline}"
   Body: "${ad.bodyText}"
   Campaign: ${ad.campaignName}
   Ad Set: ${ad.adsetName}
   CVR: ${ad.conversionRate.toFixed(2)}% | Spend: $${ad.spend.toFixed(2)} | Conversions: ${ad.conversions}
`).join('')}

**BOTTOM 5 ADS - DETAILED:**
${bottom5.map((ad, i) => `
${i + 1}. Ad ID: ${ad.id}
   Headline: "${ad.headline}"
   Body: "${ad.bodyText}"
   Campaign: ${ad.campaignName}
   Ad Set: ${ad.adsetName}
   CVR: ${ad.conversionRate.toFixed(2)}% | Spend: $${ad.spend.toFixed(2)} | Conversions: ${ad.conversions}
`).join('')}

**SAME HEADLINE, DIFFERENT PERFORMANCE (IMAGE/TARGETING IS THE DIFFERENTIATOR):**
${sameHeadlineDifferentPerformance.length > 0 ? sameHeadlineDifferentPerformance.map(group => `
Headline: "${group.headline}"
- Best: ${group.best.conversionRate.toFixed(2)}% CVR (Ad ${group.best.id}, AdSet: ${group.best.adsetName})
- Worst: ${group.worst.conversionRate.toFixed(2)}% CVR (Ad ${group.worst.id}, AdSet: ${group.worst.adsetName})
- Gap: ${group.performanceDiff.toFixed(2)}% difference across ${group.ads.length} variations
`).join('') : 'No headlines with multiple variations found.'}

**ALL ADS PERFORMANCE:**
${sortedAds.map(ad => `- "${ad.headline}" | CVR: ${ad.conversionRate.toFixed(2)}% | Ad ${ad.id} | AdSet: ${ad.adsetName}`).join('\n')}

${hasAccessibleImages ? 'Based on your VISUAL ANALYSIS of the ad images above' : 'Based on the performance data, copy patterns, and campaign context'}, provide comprehensive insights in this JSON format:
{
  "executiveSummary": "<2-3 paragraphs focusing on ${hasAccessibleImages ? 'VISUAL/CREATIVE findings and why certain images convert' : 'copy patterns, psychological triggers, and inferred visual strategies'}>",
  "overallHealthScore": <1-10>,
  "visualAnalysis": {
    "winningVisualElements": ["<${hasAccessibleImages ? 'specific visual element' : 'inferred visual element based on copy themes'} that drives conversion 1>", "<element 2>", "<element 3>"],
    "losingVisualElements": ["<${hasAccessibleImages ? 'visual element' : 'inferred visual issue'} that hurts conversion 1>", "<element 2>"],
    "colorPsychology": "<${hasAccessibleImages ? 'analysis of how colors affect conversion' : 'inferred color strategy based on brand/theme'}>",
    "imageryPatterns": "<what types of imagery/photos ${hasAccessibleImages ? 'work vs don\'t work' : 'likely work based on headline themes'}>",
    "inImageMessaging": "<${hasAccessibleImages ? 'analysis of text overlays in images' : 'analysis of headline/copy messaging patterns'}>",
    "psychologicalTriggers": ["<deep psychological driver 1, e.g. 'cognitive dissonance reduction'>", "<driver 2>", "<driver 3>"]
  },
  "headlineImageAnalysis": [
    {
      "headline": "<headline that appears on multiple ads>",
      "variations": [
        {"adId": "<id>", "imageDescription": "<${hasAccessibleImages ? 'what\'s in this image' : 'inferred visual approach based on adset/campaign'}>", "conversionRate": <rate>, "whyItConverts": "<why this ${hasAccessibleImages ? 'image' : 'variation'} works or doesn't>"}
      ],
      "keyDifferentiator": "<${hasAccessibleImages ? 'SPECIFIC visual element' : 'key factor (targeting, creative variation, etc.)'} that made the difference>"
    }
  ],
  "winningPatterns": {
    "headlines": ["<pattern 1>", "<pattern 2>"],
    "copyElements": ["<pattern 1>", "<pattern 2>"],
    "emotionalTriggers": ["<trigger 1>", "<trigger 2>"],
    "callToActions": ["<CTA pattern 1>", "<CTA pattern 2>"],
    "visualElements": ["<winning visual pattern 1>", "<pattern 2>", "<pattern 3>"]
  },
  "losingPatterns": {
    "headlines": ["<pattern 1>", "<pattern 2>"],
    "copyElements": ["<pattern 1>", "<pattern 2>"],
    "issues": ["<issue 1>", "<issue 2>"],
    "visualIssues": ["<visual problem 1>", "<visual problem 2>"]
  },
  "audienceInsights": {
    "whatResonates": ["<insight 1>", "<insight 2>"],
    "whatDoesntWork": ["<insight 1>", "<insight 2>"],
    "targetingRecommendations": ["<rec 1>", "<rec 2>"],
    "visualPreferences": ["<what visuals this audience responds to 1>", "<preference 2>"]
  },
  "recommendations": {
    "immediate": ["<action 1>", "<action 2>"],
    "shortTerm": ["<action 1>", "<action 2>"],
    "strategic": ["<action 1>", "<action 2>"],
    "creativeDirection": ["<specific visual/creative recommendation 1>", "<rec 2>", "<rec 3>"]
  },
  "topAds": [
    {
      "id": "${top5[0]?.id || ''}",
      "headline": "${top5[0]?.headline || ''}",
      "conversionRate": ${top5[0]?.conversionRate || 0},
      "whyItWorks": "<explanation focusing on ${hasAccessibleImages ? 'VISUAL elements' : 'copy, psychological triggers, and inferred creative strategy'}>",
      "imageAnalysis": "<${hasAccessibleImages ? 'detailed description of what\'s in the image and why it converts' : 'inferred visual strategy based on headline theme and campaign context'}>",
      "psychologicalDrivers": ["<psychological principle 1>", "<principle 2>"]
    },
    {
      "id": "${top5[1]?.id || ''}",
      "headline": "${top5[1]?.headline || ''}",
      "conversionRate": ${top5[1]?.conversionRate || 0},
      "whyItWorks": "<explanation>",
      "imageAnalysis": "<${hasAccessibleImages ? 'image analysis' : 'inferred visual strategy'}>",
      "psychologicalDrivers": ["<principle 1>", "<principle 2>"]
    },
    {
      "id": "${top5[2]?.id || ''}",
      "headline": "${top5[2]?.headline || ''}",
      "conversionRate": ${top5[2]?.conversionRate || 0},
      "whyItWorks": "<explanation>",
      "imageAnalysis": "<${hasAccessibleImages ? 'image analysis' : 'inferred visual strategy'}>",
      "psychologicalDrivers": ["<principle 1>", "<principle 2>"]
    }
  ],
  "bottomAds": [
    {
      "id": "${bottom5[0]?.id || ''}",
      "headline": "${bottom5[0]?.headline || ''}",
      "conversionRate": ${bottom5[0]?.conversionRate || 0},
      "whyItFails": "<explanation focusing on ${hasAccessibleImages ? 'VISUAL problems' : 'copy issues, targeting problems, or creative fatigue'}>",
      "imageIssues": "<${hasAccessibleImages ? 'what\'s wrong with the image' : 'inferred visual/creative issues'}>",
      "suggestedFix": "<specific ${hasAccessibleImages ? 'visual change' : 'creative/copy change'} to improve it>"
    },
    {
      "id": "${bottom5[1]?.id || ''}",
      "headline": "${bottom5[1]?.headline || ''}",
      "conversionRate": ${bottom5[1]?.conversionRate || 0},
      "whyItFails": "<explanation>",
      "imageIssues": "<issues>",
      "suggestedFix": "<fix>"
    },
    {
      "id": "${bottom5[2]?.id || ''}",
      "headline": "${bottom5[2]?.headline || ''}",
      "conversionRate": ${bottom5[2]?.conversionRate || 0},
      "whyItFails": "<explanation>",
      "imageIssues": "<issues>",
      "suggestedFix": "<fix>"
    }
  ]
}

Return ONLY the JSON object, no additional text.`;

  imageContent.push({ type: 'text', text: analysisPrompt });

  // Make the vision API call
  const messages: ChatMessage[] = [
    { role: 'user', content: imageContent }
  ];

  const response = await callOpenAIWithVision(messages, {
    temperature: 0.5,
    maxTokens: 8000,
    reasoningEffort
  });

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    const analysis = JSON.parse(cleanedResponse.trim());

    // CRITICAL: Create a map of ad IDs to image URLs from the original data
    // This allows us to attach actual image URLs to the topAds for visual reference generation
    const adImageMap = new Map<string, string>();
    ads.forEach(ad => {
      if (ad.imageUrl) {
        adImageMap.set(ad.id, ad.imageUrl);
      }
    });

    // Augment topAds with actual image URLs
    if (analysis.topAds && Array.isArray(analysis.topAds)) {
      analysis.topAds = analysis.topAds.map((topAd: { id: string; [key: string]: unknown }) => ({
        ...topAd,
        imageUrl: adImageMap.get(topAd.id) || undefined,
      }));
      console.log(`📸 Attached image URLs to ${analysis.topAds.filter((a: { imageUrl?: string }) => a.imageUrl).length}/${analysis.topAds.length} top ads`);
    }

    // Augment bottomAds with image URLs too
    if (analysis.bottomAds && Array.isArray(analysis.bottomAds)) {
      analysis.bottomAds = analysis.bottomAds.map((bottomAd: { id: string; [key: string]: unknown }) => ({
        ...bottomAd,
        imageUrl: adImageMap.get(bottomAd.id) || undefined,
      }));
    }

    return {
      channelName,
      analyzedAt: new Date().toISOString(),
      performanceBreakdown: {
        totalAdsAnalyzed: ads.length,
        highPerformers: highPerformers.length,
        midPerformers: midPerformers.length,
        lowPerformers: lowPerformers.length,
        avgConversionRate,
        avgCostPerConversion,
        totalSpend,
        totalConversions,
      },
      ...analysis,
    };
  } catch (error) {
    console.error('❌ Failed to parse channel analysis:', error);
    console.error('Raw response:', response);
    throw new Error('Failed to parse channel analysis response');
  }
}

/**
 * Test OpenAI API connection
 */
export async function testOpenAIConnection(): Promise<{ success: boolean; message: string }> {
  console.log('🧪 Testing OpenAI API connection...');

  if (!isOpenAIConfigured()) {
    return {
      success: false,
      message: 'OpenAI API key not configured',
    };
  }

  try {
    const response = await callOpenAI([
      { role: 'user', content: 'Say "Connection successful" in exactly those words.' },
    ], { maxTokens: 50 });

    console.log('✅ OpenAI connection test passed');
    return {
      success: true,
      message: `Connected successfully. Response: ${response}`,
    };
  } catch (error: unknown) {
    console.error('❌ OpenAI connection test failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// ============================================================================
// AD GENERATOR FUNCTIONS
// ============================================================================

const AUDIENCE_ANGLES = {
  prospecting: {
    focus: 'awareness and curiosity',
    tone: 'intriguing, benefit-focused, introducing the solution',
    messaging: 'Create intrigue, highlight the main problem/pain point, introduce the solution without being salesy, build initial trust',
  },
  retargeting: {
    focus: 'consideration and conversion',
    tone: 'persuasive, reassuring, urgency-driven',
    messaging: 'Address common objections, show social proof and testimonials, highlight specific benefits, create urgency with limited-time offers',
  },
  retention: {
    focus: 'loyalty and expansion',
    tone: 'appreciative, exclusive, VIP treatment',
    messaging: 'Exclusive offers for existing customers, loyalty rewards, cross-sell/upsell opportunities, new feature announcements',
  },
};

/**
 * Generate multiple copy options for user selection (Step 1 of multi-step workflow)
 * Returns headlines, body texts, and CTAs with rationales for each
 *
 * CRITICAL: This function deeply integrates analysis data to generate data-driven copy
 * that replicates and improves upon proven winning patterns from the user's actual ads.
 */
export async function generateCopyOptions(config: {
  audienceType: AudienceType;
  conceptType: ConceptType;
  analysisData: ChannelAnalysisResult | null;
  reasoningEffort?: ReasoningEffort;
  copyLength?: CopyLength;
  productContext?: ProductContext;
}): Promise<CopyOptionsResult> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured');
  }

  const reasoningEffort = config.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  const copyLength = config.copyLength ?? DEFAULT_COPY_LENGTH;
  const copyLengthConfig = COPY_LENGTH_OPTIONS.find(opt => opt.id === copyLength) ?? COPY_LENGTH_OPTIONS[0];
  console.log(`📝 Generating copy options for ${config.audienceType} audience with ${config.conceptType} concept | IQ Level: ${reasoningEffort} | Copy Length: ${copyLength}`);
  console.log('📊 Analysis data available:', !!config.analysisData);
  console.log('📦 Product context:', config.productContext ? config.productContext.name : 'Not provided');

  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const conceptAngle = CONCEPT_ANGLES[config.conceptType];
  const isAutoMode = config.conceptType === 'auto';

  // Extract ALL relevant analysis data for deep integration
  const analysis = config.analysisData;
  const hasAnalysis = !!analysis;

  // Build comprehensive analysis context
  let analysisContext = '';

  if (hasAnalysis) {
    // Executive Summary - key strategic insights
    analysisContext += `\n=== CHANNEL PERFORMANCE SUMMARY ===
${analysis.executiveSummary}

Overall Health Score: ${analysis.overallHealthScore}/10
Total Ads Analyzed: ${analysis.performanceBreakdown.totalAdsAnalyzed}
High Performers: ${analysis.performanceBreakdown.highPerformers} ads
Avg Conversion Rate: ${(analysis.performanceBreakdown.avgConversionRate * 100).toFixed(2)}%
`;

    // TOP PERFORMING ADS - This is CRITICAL for learning what works
    if (analysis.topAds && analysis.topAds.length > 0) {
      analysisContext += `\n=== YOUR TOP PERFORMING ADS (COPY THESE PATTERNS) ===\n`;
      analysis.topAds.forEach((ad, i) => {
        analysisContext += `
TOP AD #${i + 1} (${(ad.conversionRate * 100).toFixed(2)}% conversion rate):
- Headline: "${ad.headline}"
- Why it converts: ${ad.whyItWorks}
- Psychological drivers: ${ad.psychologicalDrivers?.join(', ') || 'N/A'}
`;
      });
    }

    // WINNING PATTERNS - Proven elements
    if (analysis.winningPatterns) {
      analysisContext += `\n=== WINNING COPY PATTERNS (USE THESE) ===
- Headlines that convert: ${analysis.winningPatterns.headlines?.join(' | ') || 'N/A'}
- Effective copy elements: ${analysis.winningPatterns.copyElements?.join(' | ') || 'N/A'}
- Emotional triggers that work: ${analysis.winningPatterns.emotionalTriggers?.join(', ') || 'N/A'}
- CTAs that drive action: ${analysis.winningPatterns.callToActions?.join(', ') || 'N/A'}
`;
    }

    // PSYCHOLOGICAL TRIGGERS - What resonates psychologically
    if (analysis.visualAnalysis?.psychologicalTriggers?.length) {
      analysisContext += `\n=== PSYCHOLOGICAL TRIGGERS THAT WORK ===
${analysis.visualAnalysis.psychologicalTriggers.map(t => `- ${t}`).join('\n')}
`;
    }

    // AUDIENCE INSIGHTS - Deep understanding of the target
    if (analysis.audienceInsights) {
      analysisContext += `\n=== AUDIENCE INSIGHTS ===
What resonates with this audience:
${analysis.audienceInsights.whatResonates?.map(r => `- ${r}`).join('\n') || '- N/A'}

What to AVOID (doesn't work):
${analysis.audienceInsights.whatDoesntWork?.map(r => `- ${r}`).join('\n') || '- N/A'}
`;
    }

    // LOSING PATTERNS - What NOT to do
    if (analysis.losingPatterns) {
      analysisContext += `\n=== AVOID THESE PATTERNS (LOW PERFORMERS) ===
- Headlines that fail: ${analysis.losingPatterns.headlines?.join(' | ') || 'N/A'}
- Copy issues: ${analysis.losingPatterns.issues?.join(', ') || 'N/A'}
- Problematic elements: ${analysis.losingPatterns.copyElements?.join(', ') || 'N/A'}
`;
    }

    // STRATEGIC RECOMMENDATIONS
    if (analysis.recommendations) {
      analysisContext += `\n=== STRATEGIC RECOMMENDATIONS ===
Immediate actions: ${analysis.recommendations.immediate?.join('; ') || 'N/A'}
Creative direction: ${analysis.recommendations.creativeDirection?.join('; ') || 'N/A'}
`;
    }
  }

  // Build the system prompt
  let systemPrompt: string;
  let conceptSection: string;

  if (isAutoMode && hasAnalysis) {
    systemPrompt = `You are an elite direct-response copywriter with access to REAL PERFORMANCE DATA from the user's Meta/Facebook ad account.

YOUR MISSION: Generate high-converting ad copy that REPLICATES and IMPROVES upon the user's proven winning patterns.

CRITICAL INSTRUCTIONS:
1. STUDY the top-performing ads below - these are REAL ads that are converting
2. IDENTIFY the patterns - headlines, emotional triggers, psychological drivers
3. GENERATE new copy that uses the SAME patterns but with fresh angles
4. Every headline and body text should feel like a natural extension of their winners
5. DO NOT generate generic marketing copy - it MUST be informed by the data below

The user's livelihood depends on high ROAS. Generic copy won't cut it.`;

    conceptSection = `CONCEPT: C.I. Intelligence (Analysis-Driven)
Your job is to MINE the analysis data below and create copy that feels like it came from the same winning playbook.
You are essentially reverse-engineering their success and scaling it.`;
  } else if (hasAnalysis) {
    systemPrompt = `You are an elite direct-response copywriter with access to REAL PERFORMANCE DATA from the user's Meta/Facebook ad account.

YOUR MISSION: Generate ad copy using the ${conceptAngle.name} concept, but INFORMED by their actual performance data.

CRITICAL: Even though you're using a specific concept, you MUST incorporate patterns from their winning ads.
Blend the psychological concept with their proven messaging patterns.`;

    conceptSection = `CONCEPT: ${conceptAngle.name}
- Description: ${conceptAngle.description}
- Messaging style: ${conceptAngle.messagingStyle}
- Key phrases/hints: ${conceptAngle.promptHints.join(', ')}

IMPORTANT: Merge this concept with the winning patterns from their analysis data below.`;
  } else {
    // No analysis data - fallback to standard generation
    systemPrompt = `You are an expert direct-response copywriter specializing in high-converting Meta/Facebook ads.
Generate compelling copy using the ${conceptAngle.name} approach.

NOTE: No analysis data is available. Run Channel Analysis first for data-driven copy.`;

    conceptSection = `CONCEPT: ${conceptAngle.name}
- Description: ${conceptAngle.description}
- Messaging style: ${conceptAngle.messagingStyle}
- Key phrases/hints: ${conceptAngle.promptHints.join(', ')}`;
  }

  // Build product context section
  let productSection = '';
  if (config.productContext) {
    const p = config.productContext;
    productSection = `
=== PRODUCT YOU ARE WRITING ADS FOR ===
Product Name: ${p.name}
Author/Brand: ${p.author}
Description: ${p.description}
${p.landingPageUrl ? `Landing Page: ${p.landingPageUrl}` : ''}

CRITICAL: All copy MUST be about "${p.name}" by ${p.author}. NEVER reference any other product, brand, or company name. The product name and author above are the ONLY correct references.
`;
  }

  const userPrompt = `Generate copy OPTIONS for a ${config.audienceType.toUpperCase()} audience${isAutoMode ? ' using analysis-driven insights' : ` using the ${conceptAngle.name} concept`}.
${productSection}
AUDIENCE CONTEXT:
- Focus: ${audienceAngle.focus}
- Tone: ${audienceAngle.tone}
- Messaging approach: ${audienceAngle.messaging}

${conceptSection}
${analysisContext}

=== YOUR TASK ===

${hasAnalysis ? `Based on the REAL PERFORMANCE DATA above, generate copy that:
1. MIRRORS the patterns from top-performing ads
2. Uses the SAME emotional triggers and psychological drivers
3. Incorporates winning headline structures
4. AVOIDS the patterns from losing ads

` : ''}Generate OPTIONS for the user to choose from:

1. Generate 6 HEADLINE options (max 40 characters each)
   - Each should ${hasAnalysis ? 'follow patterns from the top ads above' : 'be distinct and compelling'}
   - ${hasAnalysis ? 'Reference specific winning elements from the analysis' : 'Use varied emotional angles'}

2. Generate 5 BODY COPY options (${copyLength === 'long' ? 'LONG-FORM' : 'SHORT-FORM'}, max ${copyLengthConfig.maxChars} characters each)
   - Each should ${hasAnalysis ? 'incorporate winning copy elements from the analysis' : 'use different approaches'}
   - ${hasAnalysis ? 'Use the emotional triggers that work for this account' : 'Mix direct and story-driven approaches'}${copyLength === 'long' ? `
   - LONG-FORM REQUIREMENTS: Paint the full emotional picture, address objections, build desire, include storytelling elements
   - Use line breaks for readability. Tell a mini-story that takes the reader on a journey.` : ''}

3. Generate 4 CTA options
   - ${hasAnalysis ? 'Based on CTAs that drive action for this account' : 'Varied action words and urgency levels'}

For EACH option, include a rationale that ${hasAnalysis ? 'references specific insights from the analysis data' : 'explains why it should work'}.

Return JSON only:
{
  "headlines": [
    {"id": "h1", "text": "headline text", "rationale": "why this works based on analysis"},
    {"id": "h2", "text": "headline text", "rationale": "why this works based on analysis"}
  ],
  "bodyTexts": [
    {"id": "b1", "text": "body text", "rationale": "why this works based on analysis"},
    {"id": "b2", "text": "body text", "rationale": "why this works based on analysis"}
  ],
  "callToActions": [
    {"id": "c1", "text": "CTA text", "rationale": "why this works based on analysis"},
    {"id": "c2", "text": "CTA text", "rationale": "why this works based on analysis"}
  ]
}`;

  // Log the context we're sending (for debugging)
  console.log(`📊 Analysis context size: ${analysisContext.length} characters`);
  console.log(`📝 Total prompt size: ${systemPrompt.length + userPrompt.length} characters`);
  if (hasAnalysis) {
    console.log('✅ Copy generation will be DATA-DRIVEN using real analysis');
  } else {
    console.log('⚠️ Copy generation will be GENERIC (no analysis data available)');
  }

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.85, maxTokens: 3500, reasoningEffort }); // Increased tokens for comprehensive responses

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    const parsed = JSON.parse(cleanedResponse.trim());
    console.log('✅ Copy options generated successfully');
    return parsed;
  } catch (error) {
    console.error('❌ Failed to parse copy options:', error);
    throw new Error('Failed to generate copy options');
  }
}

/**
 * Analyze reference images to extract specific visual characteristics
 * This enables precise style replication in generated images
 */
async function analyzeReferenceImages(
  referenceImages: Array<{ data: string; mimeType: string }>
): Promise<{
  visualStyle: string;
  colorPalette: string;
  composition: string;
  keyElements: string[];
  mood: string;
  lighting: string;
  textOverlays: string;
  productPresentation: string;
}> {
  if (referenceImages.length === 0) {
    return {
      visualStyle: 'professional advertising',
      colorPalette: 'sophisticated dark tones with accent colors',
      composition: 'clean with clear focal point',
      keyElements: ['product showcase', 'clean typography'],
      mood: 'professional and aspirational',
      lighting: 'dramatic studio lighting',
      textOverlays: 'minimal text with strong contrast',
      productPresentation: 'featured prominently',
    };
  }

  console.log(`🔍 Analyzing ${referenceImages.length} reference images for visual characteristics...`);

  const analysisPrompt = `You are analyzing reference images from top-performing advertisements.

Your task is to extract SPECIFIC, DETAILED visual characteristics that can be used to replicate this style.

Analyze ALL the provided images and identify the COMMON visual patterns across them.

Respond in JSON format with these exact fields:
{
  "visualStyle": "Describe the overall visual style in detail (e.g., 'dark, moody photography with dramatic shadows' or 'minimalist design with bold colors')",
  "colorPalette": "List the EXACT colors you see (e.g., 'deep charcoal black (#1a1a1a), warm amber/gold accents, soft warm white for text')",
  "composition": "Describe the layout pattern (e.g., 'centered product with negative space on sides, text positioned in lower third')",
  "keyElements": ["List", "specific", "visual", "elements", "present", "in", "the", "images"],
  "mood": "The emotional feeling conveyed (e.g., 'sophisticated, premium, mysterious')",
  "lighting": "Describe the lighting style specifically (e.g., 'warm candlelight with soft amber glow, dramatic shadows')",
  "textOverlays": "Describe any text treatment you see (e.g., 'bold white sans-serif headlines, smaller serif body text')",
  "productPresentation": "How products are shown (e.g., 'book mockups at 30-degree angle with soft shadows, physical product in hands')"
}

Be EXTREMELY specific - your descriptions will be used to generate new images that match this exact style.`;

  const apiUrl = `${GEMINI_API_URL}/${DEFAULT_IMAGE_MODEL}:generateContent`;

  const requestParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Add all reference images
  referenceImages.forEach((img) => {
    requestParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  });

  // Add the analysis prompt
  requestParts.push({ text: analysisPrompt });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig: {
          temperature: 0.3, // Lower temperature for more precise analysis
          maxOutputTokens: 1000,
        }
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Reference image analysis failed, using defaults');
      throw new Error('Analysis request failed');
    }

    const data = await response.json();
    const textPart = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);

    if (!textPart?.text) {
      throw new Error('No text response from analysis');
    }

    // Parse the JSON response
    let cleanedResponse = textPart.text.trim();
    if (cleanedResponse.includes('```json')) {
      cleanedResponse = cleanedResponse.split('```json')[1].split('```')[0];
    } else if (cleanedResponse.includes('```')) {
      cleanedResponse = cleanedResponse.split('```')[1].split('```')[0];
    }

    const analysis = JSON.parse(cleanedResponse.trim());
    console.log('✅ Reference image analysis complete:', analysis);
    return analysis;
  } catch (error) {
    console.warn('⚠️ Reference image analysis failed:', error);
    // Return defaults that match common high-converting ad patterns
    return {
      visualStyle: 'dark, moody professional photography with dramatic contrasts',
      colorPalette: 'deep black backgrounds, warm amber/gold accents, clean white text',
      composition: 'centered focal point with breathing room, text in lower or upper third',
      keyElements: ['product mockup', 'atmospheric lighting', 'minimal distractions', 'strong contrast'],
      mood: 'sophisticated, premium, transformational',
      lighting: 'warm accent lighting with deep shadows, candlelit ambiance',
      textOverlays: 'bold contrasting headlines, clean modern typography',
      productPresentation: 'product prominently featured, often at slight angle with soft shadows',
    };
  }
}

/**
 * Generate an ad image using Google Gemini Nano Banana Pro
 * Falls back to DALL-E 3 if Gemini is not configured
 */
export async function generateAdImage(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationIndex: number;
  totalVariations: number;
  similarityLevel?: number; // 0 = identical to references, 100 = completely different
  imageSize?: ImageSize; // Aspect ratio for generated images
  productContext?: ProductContext;
}): Promise<GeneratedImageResult> {
  // Check if we should use Gemini or fall back to DALL-E
  if (USE_GEMINI_FOR_IMAGES && isGeminiConfigured()) {
    return generateAdImageWithGemini(config);
  } else if (isOpenAIConfigured()) {
    return generateAdImageWithDallE(config);
  } else {
    throw new Error('No image generation API configured. Please add either VITE_GEMINI_API_KEY or VITE_OPENAI_API_KEY.');
  }
}

/**
 * Generate an ad image using Google Gemini Nano Banana Pro
 * Now includes visual references from top-performing ads for brand consistency
 */
async function generateAdImageWithGemini(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationIndex: number;
  totalVariations: number;
  similarityLevel?: number; // 0 = identical to references, 100 = completely different
  imageSize?: ImageSize; // Aspect ratio for generated images
  productContext?: ProductContext;
}): Promise<GeneratedImageResult> {
  const similarity = config.similarityLevel ?? 30; // Default to 30% variation
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const sizeConfig = IMAGE_SIZE_OPTIONS.find(s => s.id === imageSize) || IMAGE_SIZE_OPTIONS[0];
  console.log(`🎨 Generating ad image with Gemini Nano Banana Pro ${config.variationIndex + 1}/${config.totalVariations} for ${config.audienceType} audience (${similarity}% variation, ${sizeConfig.dimensions})`);

  const visualAnalysis = config.analysisData?.visualAnalysis;
  const topAds = config.analysisData?.topAds || [];
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  // CRITICAL: Get HIGH-QUALITY reference images from the browser-captured image cache
  // This solves the Facebook CDN authentication issue AND filters out blurry/low-res images
  const MIN_QUALITY_SCORE = 60; // At least 480px on shortest dimension
  const cachedImages = getTopHighQualityCachedImages(3, MIN_QUALITY_SCORE);

  console.log(`📸 Found ${cachedImages.length} high-quality reference images (quality >= ${MIN_QUALITY_SCORE})`);

  // Convert cached images to the format needed for Gemini
  const referenceImages: Array<{ data: string; mimeType: string }> = cachedImages.map(cached => ({
    data: cached.base64Data,
    mimeType: cached.mimeType
  }));

  // Add product mockup images as additional references
  if (config.productContext?.productImages?.length) {
    const productImgs = config.productContext.productImages.slice(0, 3); // Max 3 product mockups
    productImgs.forEach(img => {
      referenceImages.push({ data: img.base64Data, mimeType: img.mimeType });
    });
    console.log(`📦 Added ${productImgs.length} product mockup images as references`);
  }

  if (cachedImages.length > 0) {
    console.log('📸 Using high-quality reference images:',
      cachedImages.map(c => `${c.width}x${c.height} (Q:${c.qualityScore}, ${c.conversionRate?.toFixed(1)}%)`).join(', '));
  } else {
    console.log('⚠️ No high-quality cached images available. Visit Meta Ads page and cache higher-resolution images.');
  }

  // CRITICAL: Analyze reference images to extract SPECIFIC visual characteristics
  // This enables precise style replication rather than vague "copy this style" instructions
  const refAnalysis = await analyzeReferenceImages(referenceImages);
  console.log('🎨 Reference analysis:', refAnalysis);

  // Build a detailed prompt for Gemini
  const promptParts = [
    'Generate a professional advertisement image that PRECISELY matches the provided reference style.',
    '',
  ];

  // Creative variation level instructions based on similarity setting
  const getSimilarityInstructions = () => {
    if (similarity <= 20) {
      return {
        level: 'NEAR IDENTICAL',
        instruction: `REPLICATE the reference images as closely as possible. This is NOT about inspiration - you must COPY these EXACT visual characteristics:

MANDATORY STYLE REQUIREMENTS (from reference analysis):
• VISUAL STYLE: ${refAnalysis.visualStyle}
• COLOR PALETTE: ${refAnalysis.colorPalette} - Use these EXACT colors
• COMPOSITION: ${refAnalysis.composition}
• LIGHTING: ${refAnalysis.lighting}
• MOOD/ATMOSPHERE: ${refAnalysis.mood}
• PRODUCT PRESENTATION: ${refAnalysis.productPresentation}
• KEY ELEMENTS TO INCLUDE: ${refAnalysis.keyElements.join(', ')}

The generated image should look like it was created in the same design session as the references. Only vary the specific content/subject matter slightly - ALL visual styling must match.`,
        emphasis: 'STRICT REPLICATION. Copy the exact visual DNA of the references.'
      };
    } else if (similarity <= 40) {
      return {
        level: 'SUBTLE VARIATIONS',
        instruction: `Create an image that closely follows the reference style with small creative variations.

FOLLOW these visual characteristics (from reference analysis):
• VISUAL STYLE: ${refAnalysis.visualStyle}
• COLOR PALETTE: ${refAnalysis.colorPalette}
• LIGHTING: ${refAnalysis.lighting}
• MOOD: ${refAnalysis.mood}

You may introduce minor variations in composition or subject matter, but the overall look and feel must clearly match the references.`,
        emphasis: 'Strong style consistency with minor creative touches.'
      };
    } else if (similarity <= 60) {
      return {
        level: 'BALANCED MIX',
        instruction: `Create an image that maintains the brand aesthetic while allowing creative exploration.

USE these core characteristics from the references:
• COLOR PALETTE: ${refAnalysis.colorPalette}
• MOOD/ATMOSPHERE: ${refAnalysis.mood}
• VISUAL STYLE INFLUENCE: ${refAnalysis.visualStyle}

Feel free to explore new compositions and concepts while staying within this visual framework.`,
        emphasis: 'Brand consistency with moderate creative freedom.'
      };
    } else if (similarity <= 80) {
      return {
        level: 'MORE CREATIVE',
        instruction: `Create an image that takes creative liberties while respecting the brand.

REFERENCE points for quality and mood:
• General atmosphere: ${refAnalysis.mood}
• Quality benchmark: Professional advertising standard

Explore fresh visual directions while maintaining professional quality.`,
        emphasis: 'Creative exploration with brand awareness.'
      };
    } else {
      return {
        level: 'BOLD & DIFFERENT',
        instruction: 'Create a bold, fresh image that pushes creative boundaries. Use the references only to understand the quality standard expected. Feel free to explore completely new visual directions, styles, and concepts.',
        emphasis: 'Maximum creative freedom with professional quality.'
      };
    }
  };

  const similarityInstructions = getSimilarityInstructions();

  // Always include creative direction
  promptParts.push(
    `⚠️ CREATIVE DIRECTION: ${similarityInstructions.level} (${similarity}% variation from references)`,
    '',
    similarityInstructions.instruction,
    '',
    `Emphasis: ${similarityInstructions.emphasis}`,
    ''
  );

  // If we have reference images, add explicit note about them
  if (referenceImages.length > 0) {
    const productImgCount = config.productContext?.productImages?.length ? Math.min(config.productContext.productImages.length, 3) : 0;
    const adRefCount = referenceImages.length - productImgCount;
    promptParts.push(
      `I have attached ${referenceImages.length} REFERENCE IMAGES.`,
      adRefCount > 0 ? `${adRefCount} are from top-performing ads - match their visual style.` : '',
      productImgCount > 0 ? `${productImgCount} are PRODUCT MOCKUP images - the generated image MUST depict this exact product.` : '',
      'You MUST study these images and match their visual style as specified above.',
      ''
    );
  }

  // Product context for accurate product depiction
  if (config.productContext) {
    promptParts.push(
      'PRODUCT CONTEXT:',
      `- Product: ${config.productContext.name}`,
      `- Author/Brand: ${config.productContext.author}`,
      `- Description: ${config.productContext.description}`,
      '',
      'The generated image MUST accurately represent this product. If product mockup reference images are attached, match the product appearance closely.',
      ''
    );
  }

  promptParts.push(
    `TARGET AUDIENCE: ${config.audienceType.toUpperCase()}`,
    `- Focus: ${audienceAngle.focus}`,
    `- Tone: ${audienceAngle.tone}`,
    ''
  );

  if (visualAnalysis) {
    promptParts.push('VISUAL ANALYSIS FROM HIGH-CONVERTING ADS:');
    if (visualAnalysis.winningVisualElements?.length) {
      promptParts.push(`- Winning elements to include: ${visualAnalysis.winningVisualElements.slice(0, 5).join(', ')}`);
    }
    if (visualAnalysis.colorPsychology) {
      promptParts.push(`- Color strategy that converts: ${visualAnalysis.colorPsychology}`);
    }
    if (visualAnalysis.imageryPatterns) {
      promptParts.push(`- Imagery patterns that work: ${visualAnalysis.imageryPatterns}`);
    }
    if (visualAnalysis.psychologicalTriggers?.length) {
      promptParts.push(`- Psychological triggers to evoke: ${visualAnalysis.psychologicalTriggers.slice(0, 3).join(', ')}`);
    }
    if (visualAnalysis.losingVisualElements?.length) {
      promptParts.push(`- AVOID these elements (they don't convert): ${visualAnalysis.losingVisualElements.slice(0, 3).join(', ')}`);
    }
    promptParts.push('');
  }

  // Include top ad image analysis for additional context
  if (topAds.length > 0) {
    promptParts.push('TOP PERFORMING AD IMAGE DESCRIPTIONS:');
    topAds.slice(0, 3).forEach((ad, i) => {
      if (ad.imageAnalysis) {
        promptParts.push(`${i + 1}. ${ad.imageAnalysis}`);
      }
    });
    promptParts.push('');
  }

  promptParts.push(
    'CREATIVE REQUIREMENTS:',
    '- Professional advertising photography quality',
    '- Strong visual hierarchy with clear focal point',
    '- Emotionally compelling imagery that resonates with the target audience',
    '- Clean composition with space for text overlays',
    '- Modern, premium aesthetic',
    '- Photorealistic style unless references show otherwise',
    '',
    `This is variation ${config.variationIndex + 1} of ${config.totalVariations} - create a unique variation while maintaining brand consistency with the references.`,
    '',
    'IMPORTANT: Do NOT include any text, words, letters, or numbers in the image. The image should be purely visual.'
  );

  const prompt = promptParts.join('\n');
  console.log('📝 Gemini prompt:', prompt.substring(0, 300) + '...');

  const apiUrl = `${GEMINI_API_URL}/${DEFAULT_IMAGE_MODEL}:generateContent`;

  // Build the request with reference images as inline data
  const requestParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Add reference images first so Gemini sees them before the prompt
  referenceImages.forEach((img, i) => {
    requestParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
    console.log(`📸 Added reference image ${i + 1} to request`);
  });

  // Add the text prompt
  requestParts.push({ text: prompt });

  const requestBody = {
    contents: [{
      parts: requestParts
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: imageSize, // Use the selected aspect ratio (e.g., "1:1", "16:9", "9:16")
      }
    }
  };

  console.log(`📤 Sending request to Gemini with ${referenceImages.length} reference images, aspect ratio: ${imageSize}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Gemini API Error:', errorText);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('📦 Gemini response received');

  // Extract the image from the response
  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  const parts = candidates[0].content?.parts;
  if (!parts) {
    throw new Error('Gemini response missing parts');
  }

  // Find the image part in the response
  let imageData: string | null = null;
  let mimeType: string = 'image/png';
  let textResponse: string = '';

  for (const part of parts) {
    if (part.inlineData) {
      imageData = part.inlineData.data;
      mimeType = part.inlineData.mimeType || 'image/png';
    }
    if (part.text) {
      textResponse = part.text;
    }
  }

  if (!imageData) {
    console.error('❌ No image data in Gemini response:', JSON.stringify(data, null, 2));
    throw new Error('Gemini did not return an image. Response: ' + textResponse);
  }

  // Convert base64 to data URL
  const imageUrl = `data:${mimeType};base64,${imageData}`;

  console.log('✅ Gemini image generated successfully');

  return {
    imageUrl,
    revisedPrompt: textResponse || prompt,
  };
}

/**
 * Generate an ad image using DALL-E 3 (fallback)
 */
async function generateAdImageWithDallE(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationIndex: number;
  totalVariations: number;
  imageSize?: ImageSize; // Aspect ratio for generated images
  productContext?: ProductContext;
}): Promise<GeneratedImageResult> {
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const sizeConfig = IMAGE_SIZE_OPTIONS.find(s => s.id === imageSize) || IMAGE_SIZE_OPTIONS[0];
  console.log(`🎨 Generating ad image with DALL-E 3 ${config.variationIndex + 1}/${config.totalVariations} for ${config.audienceType} audience (${sizeConfig.dimensions})`);

  const visualAnalysis = config.analysisData?.visualAnalysis;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  // Build the DALL-E prompt from analysis insights
  const promptParts = [
    'Create a high-converting social media advertisement image.',
    '',
  ];

  // Product context for accurate product depiction
  if (config.productContext) {
    promptParts.push(
      'PRODUCT:',
      `- Product: ${config.productContext.name}`,
      `- Author/Brand: ${config.productContext.author}`,
      `- Description: ${config.productContext.description}`,
      '',
      'The image MUST accurately represent this product.',
      ''
    );
  }

  promptParts.push(
    `Target Audience: ${config.audienceType.toUpperCase()} - ${audienceAngle.focus}`,
    `Tone: ${audienceAngle.tone}`,
    '',
  );

  if (visualAnalysis) {
    promptParts.push('VISUAL STYLE GUIDANCE (from winning ads):');
    if (visualAnalysis.winningVisualElements?.length) {
      promptParts.push(`- Winning elements: ${visualAnalysis.winningVisualElements.slice(0, 3).join(', ')}`);
    }
    if (visualAnalysis.colorPsychology) {
      promptParts.push(`- Color psychology: ${visualAnalysis.colorPsychology}`);
    }
    if (visualAnalysis.imageryPatterns) {
      promptParts.push(`- Imagery style: ${visualAnalysis.imageryPatterns}`);
    }
    if (visualAnalysis.psychologicalTriggers?.length) {
      promptParts.push(`- Psychological triggers: ${visualAnalysis.psychologicalTriggers.slice(0, 2).join(', ')}`);
    }
    promptParts.push('');
  }

  promptParts.push(
    'REQUIREMENTS:',
    '- Professional, polished advertising quality',
    '- Clear focal point that draws attention',
    '- Leave appropriate space for text overlays',
    '- Evoke emotion relevant to the target audience',
    '- Modern, aspirational aesthetic',
    '',
    `This is variation ${config.variationIndex + 1} of ${config.totalVariations} - make it distinct while maintaining brand consistency.`,
    '',
    `Create a visually striking ${sizeConfig.dimensions} ad image. Do NOT include any text in the image.`
  );

  const prompt = promptParts.join('\n');

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DALLE_MODEL,
      prompt,
      n: 1,
      size: sizeConfig.dalleSize,
      quality: 'hd',
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ DALL-E API Error:', errorText);
    throw new Error(`DALL-E API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ DALL-E image generated successfully');

  return {
    imageUrl: data.data[0].url,
    revisedPrompt: data.data[0].revised_prompt,
  };
}

/**
 * Generate ad copy tailored to a specific audience type
 */
export async function generateAudienceAdCopy(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationCount: number;
}): Promise<GeneratedCopyResult> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured');
  }

  console.log(`📝 Generating ad copy for ${config.audienceType} audience (${config.variationCount} variations)`);

  const winningPatterns = config.analysisData?.winningPatterns;
  const audienceInsights = config.analysisData?.audienceInsights;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  const systemPrompt = `You are an expert direct-response copywriter specializing in high-converting Meta/Facebook ads.
Your copy should be emotionally compelling, benefit-focused, and tailored to the specific audience stage.
Write copy that feels authentic, not corporate or overly salesy.`;

  const userPrompt = `Generate ad copy for a ${config.audienceType.toUpperCase()} audience.

AUDIENCE CONTEXT:
- Focus: ${audienceAngle.focus}
- Tone: ${audienceAngle.tone}
- Messaging approach: ${audienceAngle.messaging}

${winningPatterns ? `WINNING PATTERNS FROM ANALYSIS:
- Headlines that work: ${winningPatterns.headlines?.slice(0, 3).join('; ') || 'benefit-driven, curiosity-inducing'}
- Effective copy elements: ${winningPatterns.copyElements?.slice(0, 3).join('; ') || 'clear value prop, emotional appeal'}
- Emotional triggers: ${winningPatterns.emotionalTriggers?.slice(0, 3).join(', ') || 'aspiration, fear of missing out'}
- Working CTAs: ${winningPatterns.callToActions?.slice(0, 3).join(', ') || 'action-oriented'}
` : ''}

${audienceInsights ? `AUDIENCE INSIGHTS:
- What resonates: ${audienceInsights.whatResonates?.slice(0, 2).join('; ') || 'authentic messaging'}
- What to avoid: ${audienceInsights.whatDoesntWork?.slice(0, 2).join('; ') || 'overly salesy language'}
` : ''}

Generate ${config.variationCount} unique headline variations, ${Math.max(2, config.variationCount)} body copy variations, and ${config.variationCount} CTA variations.

Headlines should be punchy (max 40 characters) and create curiosity or highlight a key benefit.
Body copy should be conversational, benefit-focused, and create desire (max 125 characters each).
CTAs should be action-oriented and specific.

Return JSON only:
{
  "headlines": ["headline 1", "headline 2", ...],
  "bodyTexts": ["body copy 1", "body copy 2", ...],
  "callToActions": ["CTA 1", "CTA 2", ...],
  "rationale": "2-3 sentences explaining the strategic approach and why this copy should convert"
}`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.8, maxTokens: 1500 });

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    const parsed = JSON.parse(cleanedResponse.trim());
    console.log('✅ Ad copy generated successfully');
    return parsed;
  } catch (error) {
    console.error('❌ Failed to parse generated copy:', error);
    throw new Error('Failed to parse generated ad copy');
  }
}

/**
 * Generate a video ad storyboard
 */
export async function generateVideoStoryboard(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
}): Promise<VideoStoryboard> {
  if (!isOpenAIConfigured()) {
    throw new Error('OpenAI API key not configured');
  }

  console.log(`🎬 Generating video storyboard for ${config.audienceType} audience`);

  const winningPatterns = config.analysisData?.winningPatterns;
  const visualAnalysis = config.analysisData?.visualAnalysis;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  const systemPrompt = `You are an expert video ad creative director specializing in short-form social media ads.
Create compelling video ad storyboards that follow the proven AIDA (Attention, Interest, Desire, Action) framework.
Your storyboards should be production-ready with clear visual direction.`;

  const userPrompt = `Create a 15-second video ad storyboard for a ${config.audienceType.toUpperCase()} audience.

AUDIENCE CONTEXT:
- Focus: ${audienceAngle.focus}
- Tone: ${audienceAngle.tone}
- Messaging: ${audienceAngle.messaging}

${visualAnalysis ? `VISUAL GUIDANCE:
- Winning visual elements: ${visualAnalysis.winningVisualElements?.slice(0, 3).join(', ') || 'transformation imagery'}
- Imagery patterns: ${visualAnalysis.imageryPatterns || 'lifestyle, aspirational'}
- Psychological triggers: ${visualAnalysis.psychologicalTriggers?.slice(0, 2).join(', ') || 'social proof, aspiration'}
` : ''}

${winningPatterns ? `COPY PATTERNS:
- Effective hooks: ${winningPatterns.headlines?.slice(0, 2).join('; ') || 'curiosity, benefit-driven'}
- Emotional triggers: ${winningPatterns.emotionalTriggers?.slice(0, 2).join(', ') || 'aspiration, urgency'}
` : ''}

Create a 4-5 scene storyboard. Each scene should have:
- Scene number
- Duration (e.g., "0-3s")
- Visual description (what's shown on screen)
- Text overlay (any text shown on screen)
- Voiceover/audio (what's heard)

Return JSON only:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": "0-3s",
      "visualDescription": "description",
      "textOverlay": "text on screen",
      "voiceover": "audio/narration"
    }
  ],
  "conceptSummary": "2-3 sentence summary of the video concept and why it should work for this audience"
}`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.7, maxTokens: 2000 });

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }

    const parsed = JSON.parse(cleanedResponse.trim());
    console.log('✅ Video storyboard generated successfully');
    return parsed;
  } catch (error) {
    console.error('❌ Failed to parse video storyboard:', error);
    throw new Error('Failed to parse video storyboard');
  }
}

/**
 * Generate a video ad using Google Veo 3.1
 * This is a long-running operation that polls for completion
 */
export async function generateAdVideoWithVeo(config: {
  audienceType: AudienceType;
  conceptType?: ConceptType;
  analysisData: ChannelAnalysisResult | null;
  selectedCopy?: {
    headlines: string[];
    bodyTexts: string[];
  };
  useFastModel?: boolean;
}): Promise<GeneratedVideoResult> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key not configured for Veo video generation');
  }

  const model = config.useFastModel ? VEO_FAST_MODEL : DEFAULT_VIDEO_MODEL;
  console.log(`🎬 Generating video with Veo (${model}) for ${config.audienceType} audience`);

  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const conceptAngle = config.conceptType ? CONCEPT_ANGLES[config.conceptType] : null;
  const winningPatterns = config.analysisData?.winningPatterns;

  // Build a compelling video prompt
  const headline = config.selectedCopy?.headlines?.[0] || 'Discover something amazing';
  const bodyText = config.selectedCopy?.bodyTexts?.[0] || '';

  let promptParts = [
    `Create a professional 8-second social media advertisement video.`,
    `Target audience: ${config.audienceType} (${audienceAngle.focus}).`,
    `Tone: ${audienceAngle.tone}.`,
  ];

  if (conceptAngle && config.conceptType !== 'auto') {
    promptParts.push(`Visual style: ${conceptAngle.visualDirection}.`);
  }

  if (winningPatterns?.visualElements) {
    promptParts.push(`Include visual elements: ${winningPatterns.visualElements.slice(0, 3).join(', ')}.`);
  }

  promptParts.push(
    `The video should convey: "${headline}"`,
    bodyText ? `Supporting message: "${bodyText}"` : '',
    `Style: Modern, clean, professional advertising aesthetic with dynamic motion.`,
    `Include text overlay with the headline at key moments.`,
    `Audio: Professional background music with a positive, energetic feel.`
  );

  const prompt = promptParts.filter(Boolean).join(' ');
  console.log('📝 Veo prompt:', prompt.substring(0, 200) + '...');

  // Submit video generation request (long-running operation)
  const submitUrl = `${GEMINI_API_URL}/${model}:predictLongRunning?key=${GEMINI_API_KEY}`;

  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{
        prompt: prompt,
      }],
      parameters: {
        aspectRatio: '9:16', // Vertical for social media
        durationSeconds: 8,
        resolution: '720p',
      }
    }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    console.error('❌ Veo submission failed:', errorText);
    throw new Error(`Veo video generation failed: ${submitResponse.status} ${errorText}`);
  }

  const operation = await submitResponse.json();
  console.log('⏳ Veo operation started:', operation.name);

  // Poll for completion (max 5 minutes)
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 10 * 1000; // 10 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusUrl = `https://generativelanguage.googleapis.com/v1beta/${operation.name}?key=${GEMINI_API_KEY}`;
    const statusResponse = await fetch(statusUrl);

    if (!statusResponse.ok) {
      console.warn('⚠️ Status check failed, retrying...');
      continue;
    }

    const status = await statusResponse.json();
    console.log('🔄 Veo status:', status.done ? 'DONE' : 'PROCESSING');

    if (status.done) {
      if (status.error) {
        throw new Error(`Veo generation error: ${status.error.message}`);
      }

      const generatedVideo = status.response?.generatedVideos?.[0];
      if (!generatedVideo) {
        throw new Error('No video generated in response');
      }

      // Get the video URL from the file reference
      const videoFile = generatedVideo.video;
      let videoUrl = '';

      if (videoFile?.uri) {
        videoUrl = videoFile.uri;
      } else if (videoFile?.name) {
        // Construct URL from file name
        videoUrl = `https://generativelanguage.googleapis.com/v1beta/${videoFile.name}?key=${GEMINI_API_KEY}&alt=media`;
      }

      console.log('✅ Veo video generated successfully');
      return {
        videoUrl,
        duration: '8s',
        aspectRatio: '9:16',
        prompt,
      };
    }
  }

  throw new Error('Veo video generation timed out after 5 minutes');
}

/**
 * Generate a complete ad package (images + copy or storyboard + copy)
 * If selectedCopy is provided, uses pre-selected copy instead of generating new
 * @param config - Configuration including ad type, audience, variations, and reasoning effort
 */
export async function generateAdPackage(config: {
  adType: AdType;
  audienceType: AudienceType;
  conceptType?: ConceptType;
  variationCount: number;
  analysisData: ChannelAnalysisResult | null;
  // Pre-selected copy from multi-step workflow (optional)
  selectedCopy?: {
    headlines: string[];
    bodyTexts: string[];
    callToActions: string[];
  };
  // Creative variation level: 0 = identical to references, 100 = completely different
  similarityLevel?: number;
  // ConversionIQ reasoning effort level
  reasoningEffort?: ReasoningEffort;
  // Image size/aspect ratio for generated images
  imageSize?: ImageSize;
  // Product context for accurate product references
  productContext?: ProductContext;
}): Promise<GeneratedAdPackage> {
  const conceptName = config.conceptType ? CONCEPT_ANGLES[config.conceptType].name : 'general';
  const reasoningEffort = config.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const sizeConfig = IMAGE_SIZE_OPTIONS.find(s => s.id === imageSize) || IMAGE_SIZE_OPTIONS[0];
  console.log(`🚀 Generating ${config.adType} ad package for ${config.audienceType} with ${conceptName} concept (${config.variationCount} variations, ${sizeConfig.dimensions}) | IQ Level: ${reasoningEffort}`);

  const id = `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const generatedAt = new Date().toISOString();

  // Use pre-selected copy if provided, otherwise generate new
  let copy: GeneratedCopyResult;
  if (config.selectedCopy) {
    console.log('📋 Using pre-selected copy from multi-step workflow');
    copy = {
      headlines: config.selectedCopy.headlines,
      bodyTexts: config.selectedCopy.bodyTexts,
      callToActions: config.selectedCopy.callToActions,
      rationale: `User-selected copy based on ${conceptName} concept for ${config.audienceType} audience.`,
    };
  } else {
    // Generate copy (legacy single-step workflow)
    copy = await generateAudienceAdCopy({
      audienceType: config.audienceType,
      analysisData: config.analysisData,
      variationCount: config.variationCount,
    });
  }

  let images: GeneratedImageResult[] | undefined;
  let storyboard: VideoStoryboard | undefined;
  let whyItWorks: string;

  let imageError: string | undefined;

  if (config.adType === 'image') {
    // Generate images in parallel
    const imagePromises = Array.from({ length: config.variationCount }, (_, i) =>
      generateAdImage({
        audienceType: config.audienceType,
        analysisData: config.analysisData,
        variationIndex: i,
        totalVariations: config.variationCount,
        similarityLevel: config.similarityLevel,
        imageSize: config.imageSize,
        productContext: config.productContext,
      })
    );

    const imageResults = await Promise.allSettled(imagePromises);
    images = imageResults
      .filter((r): r is PromiseFulfilledResult<GeneratedImageResult> => r.status === 'fulfilled')
      .map(r => r.value);

    const failedResults = imageResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failedResults.length > 0) {
      console.warn(`⚠️ ${failedResults.length} image(s) failed to generate`);
      // Extract error message from first failure
      const firstError = failedResults[0].reason;
      const errorMessage = firstError?.message || String(firstError);
      if (errorMessage.includes('429') || errorMessage.includes('quota')) {
        imageError = 'Image generation quota exceeded. Please wait for the quota to reset or enable billing on your Gemini/OpenAI account.';
      } else {
        imageError = `Image generation failed: ${errorMessage}`;
      }
    }

    whyItWorks = `This ad package uses ${config.audienceType} audience targeting with ${images.length} image variation(s). ${copy.rationale}`;
  } else {
    // Generate video with Veo 3.1
    let video: GeneratedVideoResult | undefined;
    let videoError: string | undefined;

    if (USE_VEO_FOR_VIDEO && isGeminiConfigured()) {
      try {
        console.log('🎬 Generating video with Veo 3.1...');
        video = await generateAdVideoWithVeo({
          audienceType: config.audienceType,
          conceptType: config.conceptType,
          analysisData: config.analysisData,
          selectedCopy: config.selectedCopy ? {
            headlines: config.selectedCopy.headlines,
            bodyTexts: config.selectedCopy.bodyTexts,
          } : undefined,
        });
      } catch (error: unknown) {
        console.error('❌ Veo video generation failed:', error);
        videoError = error instanceof Error ? error.message : 'Video generation failed';
      }
    }

    // Always generate storyboard as a supplement/fallback
    storyboard = await generateVideoStoryboard({
      audienceType: config.audienceType,
      analysisData: config.analysisData,
    });

    if (video) {
      whyItWorks = `This video ad was generated with Veo 3.1 for ${config.audienceType} audiences. ${storyboard.conceptSummary}`;
    } else {
      whyItWorks = `This video ad storyboard is designed for ${config.audienceType} audiences. ${storyboard.conceptSummary}`;
    }

    console.log('✅ Ad package generated successfully');

    return {
      id,
      generatedAt,
      adType: config.adType,
      audienceType: config.audienceType,
      conceptType: config.conceptType,
      images,
      video,
      copy,
      storyboard,
      whyItWorks,
      imageError,
      videoError,
    };
  }

  console.log('✅ Ad package generated successfully');

  return {
    id,
    generatedAt,
    adType: config.adType,
    audienceType: config.audienceType,
    conceptType: config.conceptType,
    images,
    copy,
    storyboard,
    whyItWorks,
    imageError,
  };
}
