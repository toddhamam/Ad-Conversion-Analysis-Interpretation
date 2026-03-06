// OpenAI API Service for Ad Analysis and Interpretation
console.log('🤖 openaiApi.ts loaded at', new Date().toISOString());

// Import image cache for using captured reference images
import { getTopHighQualityCachedImages } from './imageCache';
import { getAuthToken } from '../lib/authToken';
import { getBusinessTypeConfig } from '../lib/businessTypeConfig';

// Dev-mode fallback key (only used when no auth token is available)
const OPENAI_API_KEY_FALLBACK = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

// ─── OpenAI Backend Proxy ───────────────────────────────────────────────────
// Routes OpenAI calls through /api/ai/* so the API key stays server-side.
// Falls back to direct calls with VITE_OPENAI_API_KEY for local dev without auth.

async function openaiProxy(
  endpoint: 'chat' | 'images',
  body: Record<string, unknown>
): Promise<Response> {
  const token = await getAuthToken();

  if (token) {
    // Production: proxy through backend
    const res = await fetch(`/api/ai/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res;
  }

  // Dev fallback: direct call with VITE_ key
  if (!OPENAI_API_KEY_FALLBACK) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const url = endpoint === 'chat' ? OPENAI_API_URL : OPENAI_IMAGES_URL;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY_FALLBACK}`,
    },
    body: JSON.stringify(body),
  });
  return res;
}

// Google Gemini API Configuration
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// =============================================================================
// MODEL CONFIGURATION - Always use the latest available models
// =============================================================================
// GPT-5.4 is OpenAI's flagship model - reasoning is controlled via the reasoning.effort parameter
// 33% fewer factual errors, 47% more token-efficient, 1M context window, 128K max output
const DEFAULT_CHAT_MODEL = 'gpt-5.4'; // Latest GPT-5.4 with reasoning capabilities
const DEFAULT_VISION_MODEL = 'gpt-5.4'; // GPT-5.4 has multimodal vision support

// Reasoning configuration for GPT-5.4
// 'high' for generation tasks, 'xhigh' for analysis/interpretation (ConversionIQ™ core)
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
const ANALYSIS_REASONING_EFFORT: ReasoningEffort = 'xhigh';

// Image Generation - Gemini models with automatic fallback
// Primary: gemini-3-pro-image-preview (highest quality)
// Fallback: gemini-3.1-flash-image-preview (faster, more reliable during high demand)
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const FALLBACK_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
// Text-only model for reference analysis (image models are unreliable for text-only tasks)
const TEXT_ANALYSIS_MODEL = 'gemini-2.5-flash';
const USE_GEMINI_FOR_IMAGES = true; // Switch to use Gemini instead of DALL-E

// Video Generation - Using Google Veo 3.1
// Only 'veo-3.1-generate-preview' is documented in the official Gemini API docs.
const VEO_MODEL = 'veo-3.1-generate-preview';
const USE_VEO_FOR_VIDEO = true; // Use Veo instead of storyboard-only
const DALLE_MODEL = 'dall-e-3'; // DALL-E fallback for image generation

// Non-retryable error for safety/policy blocks — should not fall through to fallback models
class SafetyBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyBlockError';
  }
}

// =============================================================================
// JSON REPAIR UTILITY — fixes truncated JSON from token-limited responses
// =============================================================================

/**
 * Attempts to repair truncated JSON by closing any unclosed structures.
 * Returns null if the input is too damaged to repair.
 */
function attemptJsonRepair(input: string): string | null {
  // Find the start of the JSON object
  const jsonStart = input.indexOf('{');
  if (jsonStart === -1) return null;

  let json = input.slice(jsonStart);

  // Track unclosed structures
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (stack.length === 0) return null; // Already balanced — parse issue is elsewhere

  // Trim trailing incomplete values (partial strings, trailing commas)
  json = json.replace(/,\s*$/, '');
  // Close any unclosed string
  if (inString) json += '"';
  // Remove trailing incomplete key-value pairs like `"key": ` or `"key": "partial`
  json = json.replace(/,?\s*"[^"]*":\s*"?[^",}\]]*$/, '');
  // Close all unclosed structures in reverse order
  while (stack.length > 0) {
    json += stack.pop();
  }

  // Verify the repair actually produces valid JSON
  try {
    JSON.parse(json);
    return json;
  } catch {
    return null;
  }
}

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

// =============================================================================
// BANNED AI PHRASES — Single source of truth for prompt instructions + sanitizer
// =============================================================================

/** Phrases that are dead giveaways of AI-generated copy. Used in both prompt instructions and post-processing. */
const BANNED_PHRASES = [
  "You're not broken", "You're not the problem", "You were never broken",
  "Here's the thing", "Here's the truth", "Here's what no one tells you",
  "It's not your fault",
  "What if I told you",
  "In a world where",
  "Stop the scroll",
  "That actually works", "Like never before",
  "Game-changer", "Take it to the next level", "Next-level",
  "The secret nobody's talking about",
  "Let that sink in",
  "Read that again",
  "This isn't just another",
  "Are you tired of...?",
  "Spoiler alert:", "Plot twist:",
  "Your future self will thank you",
  "You deserve better", "You deserve more", "You deserve this",
] as const;

/** Prompt-ready string listing all banned phrases for injection into system prompts. */
const BANNED_PHRASES_PROMPT = `BANNED PHRASES — NEVER use: ${BANNED_PHRASES.map(p => `"${p}"`).join(', ')}.`;

/** Regex patterns derived from BANNED_PHRASES for post-processing sanitization. */
const BANNED_PHRASE_PATTERNS: RegExp[] = [
  /you'?re not broken/gi, /you'?re not the problem/gi, /you were never broken/gi,
  /here'?s the thing[.:,]?/gi, /here'?s the truth[.:,]?/gi, /here'?s what no one tells you/gi,
  /it'?s not your fault/gi,
  /what if i told you/gi,
  /in a world where/gi,
  /stop the scroll/gi,
  /that actually works/gi, /like never before/gi,
  /game[- ]?changer/gi, /take it to the next level/gi, /next[- ]?level/gi,
  /the secret (?:nobody'?s|no one'?s) talking about/gi,
  /let that sink in\.?/gi,
  /read that again\.?/gi,
  /this isn'?t just another/gi,
  /are you tired of/gi,
  /spoiler alert:?/gi, /plot twist:?/gi,
  /your future self will thank you/gi,
  /you deserve (?:better|more|this)/gi,
];

/**
 * Sanitize generated copy text: strip em dashes, remove banned AI phrases, clean whitespace.
 * Returns the original text if sanitization would produce degenerate output (empty or < 3 chars).
 */
function sanitizeCopyText(text: string): string {
  let cleaned = text.replace(/—/g, ',');
  for (const pattern of BANNED_PHRASE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/  +/g, ' ').trim();
  // Guard against degenerate output — keep original if cleaning stripped too much
  if (cleaned.length < 3 || !/[a-zA-Z]/.test(cleaned)) {
    console.warn('⚠️ Copy sanitizer produced degenerate output, keeping original text');
    return text.replace(/—/g, ',').trim();
  }
  return cleaned;
}

// =============================================================================
// VIDEO CONFIGURATION - Veo 3.1 video generation options
// =============================================================================
export type VideoAspectRatio = '16:9' | '9:16';
export type VideoDuration = 4 | 6 | 8;
export type VideoResolution = '720p' | '1080p';
// Only one model is available — 'standard' maps to veo-3.1-generate-preview.
// 'fast' is kept as an alias for backwards compatibility but uses the same model.
export type VideoModel = 'standard' | 'fast';

export interface VideoConfig {
  aspectRatio: VideoAspectRatio;
  duration: VideoDuration;
  resolution: VideoResolution;
  model: VideoModel;
}

export interface VideoSizeConfig {
  id: VideoAspectRatio;
  name: string;
  description: string;
  dimensions: string;
  icon: string;
}

export const VIDEO_ASPECT_RATIO_OPTIONS: VideoSizeConfig[] = [
  {
    id: '9:16',
    name: 'Portrait/Story',
    description: 'Stories, Reels, TikTok',
    dimensions: '1080×1920',
    icon: '📱',
  },
  {
    id: '16:9',
    name: 'Landscape',
    description: 'Feed ads, Facebook video',
    dimensions: '1920×1080',
    icon: '🖥️',
  },
];

export const VIDEO_DURATION_OPTIONS: { id: VideoDuration; name: string; description: string }[] = [
  { id: 4, name: '4s', description: 'Quick hook' },
  { id: 6, name: '6s', description: 'Standard' },
  { id: 8, name: '8s', description: 'Extended' },
];

export const VIDEO_RESOLUTION_OPTIONS: { id: VideoResolution; name: string; cost: string }[] = [
  { id: '720p', name: '720p', cost: '$' },
  { id: '1080p', name: '1080p HD', cost: '$$' },
];

export const VIDEO_MODEL_OPTIONS: { id: VideoModel; name: string; description: string; costPerSec: number }[] = [
  { id: 'standard', name: 'Standard', description: 'High quality with native audio', costPerSec: 0.40 },
];

export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  aspectRatio: '9:16',
  duration: 8,
  resolution: '720p',
  model: 'standard',
};

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

if (import.meta.env.DEV) {
  console.log('🤖 Using models:', {
    chat: DEFAULT_CHAT_MODEL,
    vision: DEFAULT_VISION_MODEL,
    image: USE_GEMINI_FOR_IMAGES ? `Gemini ${DEFAULT_IMAGE_MODEL}` : 'DALL-E 3',
    video: USE_VEO_FOR_VIDEO ? `Veo ${VEO_MODEL}` : 'Storyboard only'
  });
  console.log('🎨 Gemini API Key:', GEMINI_API_KEY ? 'configured' : 'NOT CONFIGURED');
}

// Check if OpenAI is configured (always true in production — key is server-side)
export function isOpenAIConfigured(): boolean {
  // In production with auth, the key is on the server — always available
  // In dev without auth, check for the VITE_ fallback key
  return true;
}

// Log configuration status
console.log('🔑 OpenAI API: proxy mode (key server-side)', OPENAI_API_KEY_FALLBACK ? '+ dev fallback' : '');

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
export type AdType = 'image' | 'video' | 'text';

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

// Audience-specific modifiers for each concept type (Schwartz awareness adaptation)
const CONCEPT_AUDIENCE_MODIFIERS: Record<ConceptType, Record<AudienceType, string>> = {
  auto: {
    prospecting: 'Auto-select should lean toward curiosity and problem-awareness angles',
    retargeting: 'Auto-select should lean toward mechanism-reveal and objection-handling angles',
    retention: 'Auto-select should lean toward upgrade and loyalty angles',
  },
  cognitive_dissonance: {
    prospecting: 'Frame the dissonance around the PROBLEM: "You know X is hurting you, but you keep doing Y." The reader does not know about your product yet -- the dissonance is between their current behavior and the outcome they want.',
    retargeting: 'Frame the dissonance around the DECISION: "You\'ve seen this. You know it works. So why haven\'t you started?" The dissonance is between knowing the solution exists and not acting on it. Use the actual product name.',
    retention: 'Frame the dissonance around the NEXT LEVEL: "You solved X already. But you\'re still leaving Y on the table." The dissonance is between their current results and what is possible with the upgrade. Use the actual product name.',
  },
  social_proof: {
    prospecting: 'Use BROAD social proof: large numbers, relatable demographics, general outcomes. "Over 10,000 people have discovered..." The reader does not know the brand, so proof must feel universal, not niche.',
    retargeting: 'Use SPECIFIC social proof: named testimonials, exact numbers, timeframes, before/after details. "Sarah went from X to Y in 3 weeks." The reader is weighing a decision -- they need detailed, credible evidence.',
    retention: 'Use PEER social proof from other customers who UPGRADED: "87% of customers who added the next step saw a 2x improvement." The reader is already a customer -- proof should come from people like them who took the next step.',
  },
  fear_elimination: {
    prospecting: 'Eliminate PROBLEM FEARS: the fear of the status quo, the cost of inaction, what happens if they do nothing. Do NOT address purchase fears -- they are not at that stage yet.',
    retargeting: 'Eliminate PURCHASE FEARS: money-back guarantees, risk reversal, "what if it doesn\'t work for me" objections. They want the product -- they are afraid of making a bad decision.',
    retention: 'Eliminate UPGRADE FEARS: "Is the next level worth it?", "Will I actually use it?", "Am I being upsold?" Address the natural skepticism of being asked to buy again from the same brand.',
  },
  product_benefits: {
    prospecting: 'Lead with OUTCOME BENEFITS, not feature lists. The reader does not know the product -- features mean nothing without context. "Get [result] in [timeframe]" beats "Includes 12 modules and a workbook."',
    retargeting: 'Lead with MECHANISM BENEFITS -- explain HOW the product delivers results. They know the outcome promise; now they need to understand the method. Features become relevant here because they support the mechanism.',
    retention: 'Lead with INCREMENTAL BENEFITS -- what does the new offer add ON TOP of what they already have? "You got X from this. The next step adds Y and Z." Frame benefits as building blocks, not standalone value. Use the actual product name.',
  },
  transformation: {
    prospecting: 'Paint the ASPIRATIONAL transformation: where they could be versus where they are now. The gap between their current state and the desired outcome. Make the transformation vivid and relatable.',
    retargeting: 'Paint the SPECIFIC transformation with proof: show exact before/after journeys. "Day 1 you feel X. By week 3, you experience Y." The transformation should feel achievable and evidence-based, not just aspirational.',
    retention: 'Paint the COMPOUNDING transformation: "You already achieved X. The next transformation is Y -- and it builds on what you\'ve already done." The transformation is about going from good to great, not bad to good.',
  },
  urgency_scarcity: {
    prospecting: 'Use COST-OF-INACTION urgency, not offer scarcity. "Every day you wait, X gets worse" or "The gap between you and [desired state] grows wider." There is no established desire for the product yet, so deadlines feel manipulative.',
    retargeting: 'Use OFFER-BASED urgency: deadlines, limited bonuses, price increases, enrollment windows. Desire is established -- now give them a reason to act TODAY instead of "someday." This is where traditional scarcity tactics are appropriate.',
    retention: 'Use EXCLUSIVE-ACCESS urgency: member-only windows, loyalty pricing that expires, early access that precedes public launch. The urgency should feel like a privilege of being a customer, not a pressure tactic.',
  },
  authority: {
    prospecting: 'Establish authority of the APPROACH/METHOD, not the brand. "Research from [institution] shows that X approach..." or "The method used by top performers." The reader does not know the brand, so brand authority means nothing yet.',
    retargeting: 'Establish authority of the BRAND AND CREATOR. Reference the creator\'s credentials, expertise, or track record. Now that they know the product, brand-specific authority helps them trust the investment. Use the actual product name and author.',
    retention: 'Reinforce authority as a TRUSTED PARTNER. "You already trust us with X. We applied the same methodology to create what comes next." The authority is relational -- they have direct experience with the brand.',
  },
};

export interface GeneratedImageResult {
  imageUrl: string;
  revisedPrompt: string;
}

export interface GeneratedVideoResult {
  videoUrl: string;        // blob: URL for preview (in-memory, non-persistent)
  veoFileRef: string;      // Veo file name/URI for backend publish (no key)
  duration: string;
  aspectRatio: string;
  resolution: string;
  model: string;           // 'fast' | 'standard'
  prompt: string;
  estimatedCost?: string;  // e.g. "$1.20"
}

export interface GeneratedCopyResult {
  headlines: string[];
  bodyTexts: string[];
  callToActions: string[];
  rationale: string;
}

export interface TextAdConfig {
  primaryText: string;
  highlightText?: string;
  anchorText?: string;
  styleIds: string[];
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
  video?: GeneratedVideoResult;     // Backwards compat — first video or only video
  videos?: GeneratedVideoResult[];  // All video variations
  videoConfig?: VideoConfig;        // Config used for generation
  copy: GeneratedCopyResult;
  storyboard?: VideoStoryboard;
  whyItWorks: string;
  imageError?: string; // Error message if image generation failed
  videoError?: string; // Error message if video generation failed
  imageHeadlines?: string[]; // Headlines rendered into images, indexed by variation
  variationCount?: number; // Original requested variation count (for retry)
  textAdConfig?: TextAdConfig; // Config used for text ad generation (for regeneration)
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
 * Make a request to OpenAI API (text-only)
 */
async function callOpenAI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    model?: string;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
  } = {}
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const {
    model = DEFAULT_CHAT_MODEL,
    maxTokens = 2000,
    reasoningEffort = DEFAULT_REASONING_EFFORT
  } = options;

  console.log('🤖 Calling OpenAI API with model:', model);
  console.log('🧠 Reasoning effort:', reasoningEffort);

  // GPT-5.4 with reasoning_effort only supports temperature=1 (default)
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
  };

  const response = await openaiProxy('chat', requestBody);

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

    throw new Error(`AI service error: ${errorMessage}`);
  }

  const data = await response.json();
  console.log('✅ OpenAI response received');

  return data.choices[0]?.message?.content || '';
}

/**
 * Make a request to OpenAI API with vision/image support
 */
async function callOpenAIWithVision(
  messages: ChatMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
    responseFormat?: { type: 'json_object' } | { type: 'text' };
  } = {}
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  // Use GPT-5.4 for vision - multimodal capabilities
  const {
    model = DEFAULT_VISION_MODEL,
    maxTokens = 4000,
    reasoningEffort = DEFAULT_REASONING_EFFORT,
    responseFormat
  } = options;

  console.log('🖼️ Calling OpenAI Vision API with model:', model);
  console.log('🧠 Reasoning effort:', reasoningEffort);
  console.log('📸 Processing images for analysis...');

  // GPT-5.4 with reasoning_effort only supports temperature=1 (default)
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
  };

  // Add response_format if specified — forces model to output valid JSON
  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  let response = await openaiProxy('chat', requestBody);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI Vision API Error Status:', response.status);
    console.error('❌ OpenAI Vision API Error Text:', errorText);

    // If the error is specifically about response_format being unsupported,
    // retry without it — some model versions may not support json_object mode
    if (responseFormat && (response.status === 400 || response.status === 422)) {
      const lowerErr = errorText.toLowerCase();
      if (lowerErr.includes('response_format') || lowerErr.includes('json_object') || lowerErr.includes('not supported')) {
        console.warn('⚠️ response_format not supported by this model — retrying without it');
        delete requestBody.response_format;
        response = await openaiProxy('chat', requestBody);
        if (!response.ok) {
          const retryErrorText = await response.text();
          throw new Error(`AI vision service error (retry): ${retryErrorText.substring(0, 200)}`);
        }
        // Fall through to normal response processing below
      } else {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          if (errorText) {
            errorMessage = errorText.substring(0, 200);
          }
        }
        throw new Error(`AI vision service error: ${errorMessage}`);
      }
    } else {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        if (errorText) {
          errorMessage = errorText.substring(0, 200);
        }
      }
      throw new Error(`AI vision service error: ${errorMessage}`);
    }
  }

  const data = await response.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  const usage = data.usage;
  if (import.meta.env.DEV) {
    console.log('✅ OpenAI Vision response received | finish_reason:', finishReason);
    if (usage) {
      const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
      const outputTokens = usage.completion_tokens - reasoningTokens;
      console.log(`📊 Tokens — reasoning: ${reasoningTokens}, output: ${outputTokens}, total completion: ${usage.completion_tokens}/${maxTokens}`);
    }
  }

  if (finishReason === 'length') {
    console.warn('⚠️ Response truncated — max_completion_tokens exhausted. Reasoning tokens consumed too much of the budget.');
    // When JSON mode is enabled, truncated output is guaranteed to be invalid JSON.
    // Throw immediately with a clear message instead of letting the caller fail on parse.
    if (responseFormat?.type === 'json_object') {
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      throw new Error(
        `AI response was truncated — reasoning used ${reasoningTokens} tokens, exhausting the ${maxTokens} token budget before completing the JSON output. Try again with a lower ConversionIQ™ reasoning level.`
      );
    }
  }

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
  const reasoningEffort = options?.reasoningEffort ?? ANALYSIS_REASONING_EFFORT;
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
  ], { reasoningEffort });

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
  ], { maxTokens: 1500 });

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

  // Brand Voice Profile (extracted from winning ads)
  brandVoice?: {
    tonality: string;           // e.g., "Confident and direct, with a coaching undertone"
    sentenceStyle: string;      // e.g., "Short punchy fragments mixed with one longer build-up sentence"
    pointOfView: string;        // e.g., "Second person (you/your), occasionally first person plural (we)"
    vocabularyLevel: string;    // e.g., "Conversational, 8th-grade reading level, no jargon"
    rhythmAndCadence: string;   // e.g., "Staccato openings, builds to a longer emotional middle, punchy close"
    distinctiveTraits: string[];// e.g., ["Uses sentence fragments as hooks", "Ends with a question"]
  };

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
    bodyText?: string; // Full body text from original ad data for voice/structure replication
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
  options?: { reasoningEffort?: ReasoningEffort; businessType?: import('../types/organization').BusinessType }
): Promise<ChannelAnalysisResult> {
  const reasoningEffort = options?.reasoningEffort ?? ANALYSIS_REASONING_EFFORT;
  const btConfig = getBusinessTypeConfig(options?.businessType || 'ecommerce');
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
BUSINESS CONTEXT:
${btConfig.aiConversionLanguage}

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
  "brandVoice": {
    "tonality": "<the overall tone of the winning ads, e.g. 'Confident and direct with a coaching undertone' or 'Warm and empathetic but urgent'>",
    "sentenceStyle": "<how sentences are structured in winners, e.g. 'Short punchy fragments mixed with one longer emotional sentence' or 'Full sentences, conversational rhythm'>",
    "pointOfView": "<dominant POV in winning copy, e.g. 'Second person direct address (you/your)' or 'First person storytelling (I/my)'>",
    "vocabularyLevel": "<reading level and word choices, e.g. 'Conversational, 8th-grade level, no jargon' or 'Sophisticated but accessible, uses industry terms sparingly'>",
    "rhythmAndCadence": "<the pacing pattern of winning copy, e.g. 'Staccato opener. Builds tension with a longer middle. Punchy one-line close.' or 'Steady rhythm, each sentence roughly the same length'>",
    "distinctiveTraits": ["<specific linguistic habit from winners, e.g. 'Uses sentence fragments as hooks'>", "<trait 2, e.g. 'Closes with a direct question'>", "<trait 3>"]
  },
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

  // GPT-5.4 with xhigh reasoning uses thousands of internal reasoning tokens that
  // share the max_completion_tokens budget with the actual output. 16384 was still
  // too tight — xhigh reasoning can consume 10K+ tokens, leaving insufficient room
  // for the full JSON output. 32768 provides adequate headroom.
  // response_format: json_object forces the model to output valid JSON, eliminating
  // markdown fences, prose wrapping, and other formatting issues at the source.
  const response = await callOpenAIWithVision(messages, {
    maxTokens: 32768,
    reasoningEffort,
    responseFormat: { type: 'json_object' }
  });

  try {
    let cleanedResponse = response.trim();

    // Strategy 1: Direct parse — with response_format: json_object, the model
    // should return clean JSON. Try this first before any string manipulation.
    let analysis: Record<string, unknown> | null = null;
    try {
      analysis = JSON.parse(cleanedResponse);
    } catch {
      // Direct parse failed — apply extraction strategies
    }

    if (!analysis) {
      // Strategy 2: Extract from markdown code fences (```json ... ``` or ``` ... ```)
      const jsonBlockMatch = cleanedResponse.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonBlockMatch) {
        cleanedResponse = jsonBlockMatch[1].trim();
      } else {
        // Strategy 3: Find the outermost JSON object by matching braces
        const jsonStart = cleanedResponse.indexOf('{');
        if (jsonStart !== -1) {
          let depth = 0;
          let jsonEnd = -1;
          for (let i = jsonStart; i < cleanedResponse.length; i++) {
            if (cleanedResponse[i] === '{') depth++;
            else if (cleanedResponse[i] === '}') {
              depth--;
              if (depth === 0) { jsonEnd = i; break; }
            }
          }
          if (jsonEnd !== -1) {
            cleanedResponse = cleanedResponse.slice(jsonStart, jsonEnd + 1);
          } else {
            // Brace-matching failed (truncated JSON) — fall back to lastIndexOf
            const lastBrace = cleanedResponse.lastIndexOf('}');
            if (lastBrace > jsonStart) {
              cleanedResponse = cleanedResponse.slice(jsonStart, lastBrace + 1);
            }
          }
        }
      }

      try {
        analysis = JSON.parse(cleanedResponse.trim());
      } catch (innerErr) {
        // Strategy 4: Attempt to repair truncated JSON by closing open structures
        const repaired = attemptJsonRepair(cleanedResponse.trim());
        if (repaired) {
          analysis = JSON.parse(repaired);
          console.warn('⚠️ Channel analysis JSON was repaired (likely truncated response)');
        } else {
          throw innerErr; // Re-throw to hit the outer catch
        }
      }
    }

    // Ensure analysis was successfully parsed — TypeScript can't prove non-null
    // through the nested try-catch structure above, so guard explicitly
    if (!analysis) {
      throw new Error('All JSON parsing strategies failed');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = analysis as any;

    // CRITICAL: Create maps of ad IDs to original data (image URLs, body text)
    // This allows us to attach actual data to the topAds for generation reference
    const adImageMap = new Map<string, string>();
    const adBodyTextMap = new Map<string, string>();
    ads.forEach(ad => {
      if (ad.imageUrl) {
        adImageMap.set(ad.id, ad.imageUrl);
      }
      if (ad.bodyText) {
        adBodyTextMap.set(ad.id, ad.bodyText);
      }
    });

    // Augment topAds with actual image URLs and full body text from original ad data
    if (parsed.topAds && Array.isArray(parsed.topAds)) {
      parsed.topAds = parsed.topAds.map((topAd: { id: string; [key: string]: unknown }) => ({
        ...topAd,
        imageUrl: adImageMap.get(topAd.id) || undefined,
        bodyText: adBodyTextMap.get(topAd.id) || undefined,
      }));
      console.log(`📸 Attached image URLs to ${parsed.topAds.filter((a: { imageUrl?: string }) => a.imageUrl).length}/${parsed.topAds.length} top ads`);
      console.log(`📝 Attached body text to ${parsed.topAds.filter((a: { bodyText?: string }) => a.bodyText).length}/${parsed.topAds.length} top ads`);
    }

    // Augment bottomAds with image URLs too
    if (parsed.bottomAds && Array.isArray(parsed.bottomAds)) {
      parsed.bottomAds = parsed.bottomAds.map((bottomAd: { id: string; [key: string]: unknown }) => ({
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
      ...parsed,
    } as ChannelAnalysisResult;
  } catch (error: unknown) {
    console.error('❌ Failed to parse channel analysis:', error);
    if (import.meta.env.DEV) {
      console.error('Raw response (first 500 chars):', response.substring(0, 500));
      console.error('Raw response (last 200 chars):', response.substring(response.length - 200));
      console.error('Response length:', response.length, 'chars');
    }

    // Detect truncation — check multiple signals
    const trimmed = response.trim();
    const endsClean = trimmed.endsWith('}') || trimmed.endsWith('```');
    const hasOpenBraces = (trimmed.match(/{/g) || []).length > (trimmed.match(/}/g) || []).length;
    const isTruncated = trimmed.length > 0 && (!endsClean || hasOpenBraces);

    if (isTruncated) {
      throw new Error('Channel analysis response was truncated (model ran out of output tokens). Try again with a lower ConversionIQ™ reasoning level, or reduce the number of ads in the analysis period.');
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse channel analysis response: ${errMsg}. Please try again.`);
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

const AUDIENCE_ANGLES: Record<AudienceType, {
  focus: string;
  tone: string;
  messaging: string;
  awarenessLevel: string;
  awarenessDescription: string;
  hookStrategy: string;
  bodyStructure: string;
  bodyStructureShort: string;
  ctaApproach: string;
  readerKnows: string[];
  readerDoesNotKnow: string[];
  antiPatterns: string[];
  conceptShifts: string;
}> = {
  prospecting: {
    focus: 'awareness and curiosity',
    tone: 'intriguing, benefit-focused, introducing the solution',
    messaging: 'Create intrigue, highlight the main problem/pain point, introduce the solution without being salesy, build initial trust',

    awarenessLevel: 'Unaware to Problem-Aware (Schwartz Levels 1-2)',
    awarenessDescription: 'This person does NOT know the brand, has NOT seen the product, and may not even recognize they have the problem yet. They are scrolling cold. Your job is to make them stop, recognize a pain or desire they already feel, and become curious about a solution they have never heard of.',

    hookStrategy: `Hooks must LEAD WITH THE PROBLEM or a relatable situation -- never the product. The reader does not care about the product yet. They care about their own pain, frustration, or desire. Effective cold hooks:
- Pattern interrupts that name a specific frustration ("Still doing X the hard way?")
- Curiosity gaps that make them need to read more ("The reason your X keeps failing isn't what you think")
- Bold claims backed by a specific number ("How 3,247 people fixed X in 14 days")
- Identity-based questions ("If you're a [type of person] who struggles with X...")
- Contrarian statements that challenge conventional wisdom`,

    bodyStructure: `Body copy must follow this arc for cold audiences:
1. VALIDATE THE PROBLEM: Show you understand their world. Be specific -- name the exact frustration, not a vague pain point
2. AGITATE: Make the problem feel urgent or costly to ignore. What happens if they keep doing nothing?
3. TEASE THE MECHANISM: Introduce the solution concept (not the product name) as a new approach. Focus on the "what" and "why it works" at a high level
4. BRIDGE TO CURIOSITY: End with forward momentum -- they should want to learn more, not feel sold to

Do NOT dump product features. Do NOT use the product name in the first sentence. The body copy should feel like discovering something, not being pitched.`,

    bodyStructureShort: 'Lead with ONE specific pain point or frustration the reader feels right now. Name the problem concretely, then hint at a new approach that solves it. End with forward momentum. Do NOT introduce the product by name first -- lead with the problem. Every word must earn its place.',

    ctaApproach: 'CTAs should be low-commitment and curiosity-driven. "See how it works", "Watch the free breakdown", "Discover the method". Avoid high-commitment CTAs like "Buy now", "Start your trial", "Sign up today" -- these are too aggressive for someone who just learned about you.',

    readerKnows: [
      'Their own pain point or desire (even if they cannot articulate it yet)',
      'That existing solutions have not fully worked for them',
    ],
    readerDoesNotKnow: [
      'Your brand or product name',
      'That your specific solution exists',
      'Why your approach is different from others',
      'Any social proof or results from your product',
    ],

    antiPatterns: [
      'NEVER assume they know the brand -- no "As you know..." or "You\'ve seen our..."',
      'NEVER lead with the product name or features -- they do not care yet',
      'NEVER use urgency/scarcity tactics (limited time, selling out) -- there is no established desire to lose',
      'NEVER reference a previous visit, email, or interaction -- they have had none',
      'NEVER use insider language or jargon specific to your product',
      'NEVER open with a testimonial -- they have no context for why the testimonial matters',
    ],

    conceptShifts: 'For cold audiences: social_proof should use broad, relatable numbers (not brand-specific testimonials). fear_elimination should focus on the fear of the PROBLEM, not the fear of buying. urgency_scarcity should be about the cost of INACTION, not a limited offer. authority should establish credibility of the APPROACH/method, not the brand.',
  },
  retargeting: {
    focus: 'consideration and conversion',
    tone: 'persuasive, reassuring, urgency-driven',
    messaging: 'Address common objections, show social proof and testimonials, highlight specific benefits, create urgency with limited-time offers',

    awarenessLevel: 'Solution-Aware to Product-Aware (Schwartz Levels 3-4)',
    awarenessDescription: 'This person HAS visited the site, HAS seen the product, and HAS seen your prospecting ads. They know the brand name. They know what the product claims to do. They are NOT yet convinced it will work for THEM. Your job is to push past their remaining hesitation by going deeper on the mechanism, addressing the specific objection they are sitting on, and giving them a reason to act NOW instead of later.',

    hookStrategy: `Hooks must ACKNOWLEDGE they already know about the product -- then go DEEPER. Do NOT repeat the same introductory messaging they saw in prospecting ads. They already got the "what." Now they need the "why" and "how." Effective retargeting hooks:
- Objection-first hooks ("You probably think X won't work because..." / "Still on the fence about X?")
- Mechanism reveals ("Here's WHY this works when other approaches don't")
- Social proof leads ("2,847 people started this month. Here's what they're saying")
- Deeper benefit hooks ("The part nobody talks about")
- Comparison hooks ("This vs. doing nothing -- here's the real math")
- Curiosity about the next layer ("You saw what it does. Here's what happens in week 2")

Use the actual product name from the product context. NEVER re-introduce the product as if they have never heard of it. They have. Speak to them as someone who is already partway through the decision.`,

    bodyStructure: `Body copy must follow this arc for warm audiences:
1. ACKNOWLEDGE FAMILIARITY: Show that you know they have already been exposed to the product. A subtle nod -- "You've seen this before" or "You're already considering this" -- signals this ad is for THEM, not a mass blast
2. GO DEEPER ON THE MECHANISM: Explain WHY the solution works at a level of detail the prospecting ad did not cover. Name the specific methodology, the step-by-step, or the science behind it
3. HANDLE THE #1 OBJECTION: Directly address the most common reason people stall at this stage -- "What if it doesn't work for me?", "Is it worth the price?", "I don't have time"
4. PROVIDE PROOF: Specific testimonial, case study result, or before/after with numbers. This is where heavy social proof lives
5. CREATE URGENCY: Give them a reason to act today, not next week. This can be scarcity, a bonus, a price change, or a cost-of-waiting argument

The body should feel like a conversation with someone who is 70% convinced and needs the final push.`,

    bodyStructureShort: 'They already know the product. Lead with the mechanism or a specific proof point that addresses their hesitation. Name the product directly. Hit the objection head-on, then give one concrete reason to act now. Use the actual product name.',

    ctaApproach: 'CTAs should be action-oriented and name the product directly. "Start the product today", "Claim your spot", "Get it before the deadline", "Lock in the offer". These people know what the product is -- the CTA can name it directly and imply commitment. Use the actual product name from the product context.',

    readerKnows: [
      'The brand and product name',
      'The core promise and what the product claims to do',
      'That this is an ad -- they have seen your ads before',
      'The general category of solution (course, supplement, tool, etc.)',
    ],
    readerDoesNotKnow: [
      'Whether it will work for their specific situation',
      'The detailed mechanism or methodology behind the results',
      'What real customers actually experienced',
      'Whether the investment is worth it compared to alternatives or doing nothing',
    ],

    antiPatterns: [
      'NEVER re-introduce the product as if they are seeing it for the first time',
      'NEVER use the same hooks that were in the prospecting ads -- they already saw those',
      'NEVER be vague about the mechanism -- they need specifics now',
      'NEVER skip social proof -- this audience needs third-party validation',
      'NEVER use purely curiosity-driven CTAs ("Learn more") -- they have already learned, they need to ACT',
      'NEVER ignore the price or investment -- address it head-on or frame value against cost',
    ],

    conceptShifts: 'For warm audiences: social_proof should use SPECIFIC testimonials with names, numbers, and timeframes (not broad claims). fear_elimination should focus on purchase-related fears (waste of money, doesn\'t work for me) not problem-related fears. urgency_scarcity CAN use deadlines, bonuses, and limited availability since desire is already established. authority should leverage brand-specific credentials and endorsements.',
  },
  retention: {
    focus: 'loyalty and expansion',
    tone: 'appreciative, exclusive, VIP treatment',
    messaging: 'Exclusive offers for existing customers, loyalty rewards, cross-sell/upsell opportunities, new feature announcements',

    awarenessLevel: 'Most Aware (Schwartz Level 5)',
    awarenessDescription: 'This person has ALREADY PURCHASED. They know the brand, the product, and the experience. They have used it. Your job is to deepen the relationship, make them feel like insiders, and present the next logical step -- whether that is an upsell, a complementary product, a renewal, or a referral opportunity. They do NOT need to be convinced the brand is legitimate. They need to feel valued and see a compelling reason to buy again.',

    hookStrategy: `Hooks must SPEAK TO THEM AS AN INSIDER. They are not prospects -- they are customers. The hook should make them feel recognized and privileged. Use the actual product name. Effective retention hooks:
- Insider/VIP hooks ("As a member, you get first access to...")
- Results-based hooks ("Now that you've gotten results, here's the next step")
- Exclusive access hooks ("This is only for existing customers")
- Upgrade/expansion hooks ("Love the product? This takes it further")
- Anniversary/milestone hooks ("You've been with us for X -- here's something special")
- Referral hooks ("Know someone who needs what you got?")

NEVER talk to them like they are strangers. NEVER re-sell them on the original product. NEVER use fear-based messaging about the original problem they already solved.`,

    bodyStructure: `Body copy must follow this arc for existing customers:
1. ACKNOWLEDGE THE RELATIONSHIP: Reference the fact that they are a customer. Mention the product they bought or the result they achieved. Make them feel SEEN
2. BRIDGE TO THE NEXT OFFER: Connect their existing purchase to the new opportunity. "Because you already took this step, you are perfectly positioned for what comes next"
3. EXCLUSIVE VALUE: Frame the new offer as something unavailable to non-customers -- a VIP price, early access, a bundle, or insider content
4. SOCIAL PROOF FROM PEERS: Testimonials from other customers who took this next step. "Other members who added this saw..."
5. EASY ACTION: The CTA should feel effortless since trust is already established

The body should feel like a note from a trusted advisor, not a sales pitch.`,

    bodyStructureShort: 'Acknowledge them as a customer in the first line. Name the next offer or upgrade as something exclusive to them. One proof point from peers who took this step. Make it feel like a VIP note, not a pitch. Use the actual product name.',

    ctaApproach: 'CTAs should feel exclusive and effortless. "Unlock your VIP upgrade", "Add this to your account", "Claim your member-only offer", "Refer a friend, earn a reward". High-commitment CTAs are fine here -- they already trust the brand. Use the actual product name from the product context.',

    readerKnows: [
      'The brand, the product, and the team behind it',
      'What the product does and whether it delivered on its promise',
      'The quality and experience of being a customer',
      'Their own results or progress from the original purchase',
    ],
    readerDoesNotKnow: [
      'That a new offer, upgrade, or complementary product exists',
      'Why this next step is relevant to them specifically',
      'What other customers like them have done after the initial purchase',
      'Any special pricing or access they qualify for as existing customers',
    ],

    antiPatterns: [
      'NEVER re-sell the original product -- they already bought it',
      'NEVER use fear-based problem agitation about the issue they already solved',
      'NEVER talk to them like a stranger -- no "Have you ever struggled with...?"',
      'NEVER use generic prospecting language -- they are past that stage',
      'NEVER forget to acknowledge their existing relationship with the brand',
      'NEVER use scarcity tactics about the original product -- focus scarcity on the NEW offer',
    ],

    conceptShifts: 'For existing customers: social_proof should come from OTHER CUSTOMERS WHO UPGRADED (not first-time buyers). fear_elimination should address "Is the upgrade worth it?" not "Is the brand trustworthy?". urgency_scarcity should be about exclusive member-only windows or limited loyalty rewards. authority should position the brand as a trusted partner they already have a relationship with. transformation should focus on the NEXT transformation, building on what they already achieved.',
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
  copyVariationLevel?: number; // 0 = replicate winners exactly, 100 = completely different angles
  productContext?: ProductContext;
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  businessType?: import('../types/organization').BusinessType;
}): Promise<CopyOptionsResult> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const reasoningEffort = config.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  const copyLength = config.copyLength ?? DEFAULT_COPY_LENGTH;
  const copyVariation = config.copyVariationLevel ?? 30;
  const copyLengthConfig = COPY_LENGTH_OPTIONS.find(opt => opt.id === copyLength) ?? COPY_LENGTH_OPTIONS[0];
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');
  console.log(`📝 Generating copy options for ${config.audienceType} audience with ${config.conceptType} concept | IQ Level: ${reasoningEffort} | Copy Length: ${copyLength} | Copy Variation: ${copyVariation}%`);
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
- Headline: "${ad.headline}"${ad.bodyText ? `
- Full Body Copy: "${ad.bodyText}"` : ''}
- Why it converts: ${ad.whyItWorks}
- Psychological drivers: ${ad.psychologicalDrivers?.join(', ') || 'N/A'}
`;
      });
      analysisContext += `
IMPORTANT: Study the FULL BODY COPY of these winners. Notice their structure, pacing, opening hooks, how they build tension, and how they close. Your generated body copy should follow the same structural patterns and voice.
`;
    }

    // BRAND VOICE PROFILE - How the winning ads sound (tone, cadence, style)
    if (analysis.brandVoice) {
      const bv = analysis.brandVoice;
      analysisContext += `\n=== BRAND VOICE PROFILE (MATCH THIS VOICE) ===
This is the voice that is ALREADY CONVERTING for this ad account. Your copy MUST sound like it came from the same copywriter.
- Tonality: ${bv.tonality}
- Sentence style: ${bv.sentenceStyle}
- Point of view: ${bv.pointOfView}
- Vocabulary level: ${bv.vocabularyLevel}
- Rhythm & cadence: ${bv.rhythmAndCadence}
${bv.distinctiveTraits?.length ? `- Distinctive traits:\n${bv.distinctiveTraits.map(t => `  * ${t}`).join('\n')}` : ''}

CRITICAL: Do NOT override this voice with generic "ad copywriter" tone. The voice profile above is extracted from REAL winning ads. Match its specific characteristics, not a generic approximation of it.
`;
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

  // Build Ad Library inspiration context (competitor/cross-industry references)
  let inspirationContext = '';
  if (config.adLibraryInspirations && config.adLibraryInspirations.length > 0) {
    console.log(`💡 Ad Library inspirations: ${config.adLibraryInspirations.length} active`);
    inspirationContext += `\n=== COMPETITOR/INDUSTRY INSPIRATION (Ad Library) ===
The user has curated these successful ads from the Meta Ad Library as creative inspiration.
Long-running ads indicate sustained profitability. Study their copy patterns, angles, and hooks.
Create ORIGINAL copy inspired by these approaches — DO NOT copy text verbatim.\n`;

    config.adLibraryInspirations.forEach((insp, i) => {
      const durationLabel = insp.isActive
        ? `Running for ${insp.durationDays} days (still active)`
        : `Ran for ${insp.durationDays} days`;

      inspirationContext += `
INSPIRATION #${i + 1} — ${insp.pageName} (${durationLabel}):`;
      if (insp.adCreativeLinkTitles.length > 0) {
        inspirationContext += `\n- Headlines: ${insp.adCreativeLinkTitles.join(' | ')}`;
      }
      if (insp.adCreativeBodies.length > 0) {
        const bodyPreview = insp.adCreativeBodies[0].substring(0, 400);
        inspirationContext += `\n- Body Copy: ${bodyPreview}${insp.adCreativeBodies[0].length > 400 ? '...' : ''}`;
      }
      if (insp.adCreativeLinkDescriptions.length > 0) {
        inspirationContext += `\n- Link Description: ${insp.adCreativeLinkDescriptions[0]}`;
      }
      inspirationContext += '\n';
    });

    inspirationContext += `
IMPORTANT: These are EXTERNAL inspiration sources. Your job is to:
1. Identify what makes these ads compelling (hooks, emotional angles, structure)
2. Apply those strategies to the user's product/brand
3. Combine with the user's own performance data (if available) for the best results
4. NEVER use competitor brand names or product names — always reference the user's product
`;
  }

  // Build copy variation instructions based on slider level
  const getCopyVariationInstructions = (variation: number, hasAnalysisData: boolean): string => {
    if (hasAnalysisData) {
      if (variation <= 20) {
        return `=== COPY VARIATION LEVEL: PATTERN MATCH (${variation}% variation) ===
REPLICATE the winning patterns as faithfully as possible. Your copy should be nearly indistinguishable in style, structure, and tone from the top-performing ads.

STRICT REQUIREMENTS:
- Use the EXACT headline structures from top ads (e.g., if winners use question hooks, ALL headlines must be questions)
- Mirror the SAME emotional triggers and psychological drivers identified in the analysis
- Match the SAME sentence length, punctuation style, and formatting patterns
- Use similar vocabulary and phrasing intensity
- Replicate the exact CTA urgency level from winning CTAs
- The only difference from existing winners should be the specific words — the underlying structure, rhythm, and emotional arc must be identical

Think of this as creating "sibling" ads — they should look like they came from the same copywriter in the same session as the winners.`;
      } else if (variation <= 40) {
        return `=== COPY VARIATION LEVEL: FRESH WORDING (${variation}% variation) ===
Follow the winning patterns closely but use fresh, original language. Same playbook, different words.

REQUIREMENTS:
- Maintain the SAME headline structures and hooks from top performers (question hooks stay questions, curiosity gaps stay curiosity gaps)
- Use the SAME emotional triggers but express them with new phrasing
- Keep the same tone and intensity level as the winners
- You MAY introduce minor structural variations (e.g., reorder elements within a body copy) but the core approach must match
- CTAs should use the same urgency/action level but can use different wording

Think of this as writing fresh copy that fits perfectly within the existing winning campaign — a natural extension that feels familiar but not repetitive.`;
      } else if (variation <= 60) {
        return `=== COPY VARIATION LEVEL: BALANCED MIX (${variation}% variation) ===
Blend proven winning patterns with new creative angles. About half your output should follow existing patterns, half should explore new territory.

REQUIREMENTS:
- 3 headlines should closely follow winning headline patterns; 3 should try new hook styles or angles
- Body copy should incorporate winning emotional triggers but may use different narrative structures
- You CAN introduce new psychological angles not seen in the winners, as long as they are grounded in the audience and product context
- CTAs can range from proven patterns to fresh approaches
- Maintain the overall quality standard and conversion-focused mindset from the winners, even when exploring new directions

Think of this as an A/B test — give the user both safe bets (pattern-matched) and calculated experiments (new angles).`;
      } else if (variation <= 80) {
        return `=== COPY VARIATION LEVEL: NEW ANGLES (${variation}% variation) ===
Use the winning patterns as loose inspiration but prioritize fresh, creative approaches. Push beyond what has been done before.

REQUIREMENTS:
- Reference winning patterns only as guardrails — understand WHAT emotions work, but explore completely different WAYS to trigger them
- Try headline structures NOT seen in the top performers (if winners use questions, try bold statements or storytelling hooks)
- Introduce new psychological angles, unexpected hooks, and different narrative frameworks
- The audience insights from the analysis still apply — understand WHO you are talking to — but experiment with HOW you talk to them
- Avoid patterns identified as losing, but otherwise prioritize novelty

Think of this as a creative strategist who has studied the account data and is now deliberately pushing in new directions to discover untapped angles.`;
      } else {
        return `=== COPY VARIATION LEVEL: BOLD & DIFFERENT (${variation}% variation) ===
Create radically different copy that breaks from all existing patterns. Use the analysis data only to understand the audience — ignore the copy patterns entirely.

REQUIREMENTS:
- Do NOT replicate any headline structures, hooks, or emotional patterns from the winning ads
- Use completely different psychological frameworks, narrative styles, and tonal approaches
- Challenge assumptions about what "should" work for this audience — surprise them
- The ONLY thing to preserve from the analysis is the audience understanding (who they are, what they care about) — everything else should be fresh
- Winning CTAs, headline formats, body copy structures — deliberately avoid all of them
- Draw inspiration from adjacent industries, unconventional copywriting schools, or contrarian approaches

Think of this as a creative reset — the user wants to discover if there are entirely new messaging territories that could outperform the current winners.`;
      }
    } else {
      // Without analysis: controls general creativity/conventionality
      if (variation <= 20) {
        return `=== COPY VARIATION LEVEL: CONSERVATIVE (${variation}% variation) ===
Generate safe, proven direct-response copy using established best practices. Prioritize reliability over novelty.

REQUIREMENTS:
- Use time-tested headline formulas (how-to, question hooks, number-based, benefit-first)
- Stick to conventional direct-response body copy structure (problem-agitate-solve, feature-benefit)
- Standard urgency and social proof patterns
- Professional, polished tone — nothing experimental`;
      } else if (variation <= 40) {
        return `=== COPY VARIATION LEVEL: SLIGHTLY CREATIVE (${variation}% variation) ===
Mostly conventional direct-response copy with slight creative twists.

REQUIREMENTS:
- Use proven headline formulas but add small unexpected elements
- Standard copy structure with occasional fresh metaphors or angles
- Conventional CTAs with slightly more personality`;
      } else if (variation <= 60) {
        return `=== COPY VARIATION LEVEL: BALANCED (${variation}% variation) ===
Mix conventional direct-response patterns with creative experimentation.

REQUIREMENTS:
- Half the headlines should use proven formulas, half should try newer approaches
- Body copy can blend traditional and contemporary styles
- CTAs range from standard to creative`;
      } else if (variation <= 80) {
        return `=== COPY VARIATION LEVEL: CREATIVE (${variation}% variation) ===
Push creative boundaries while staying grounded in direct-response principles.

REQUIREMENTS:
- Experiment with unconventional headline hooks (story fragments, bold claims, pattern interrupts)
- Body copy can use narrative, humor, or unexpected angles
- CTAs should feel fresh and distinctive`;
      } else {
        return `=== COPY VARIATION LEVEL: EXPERIMENTAL (${variation}% variation) ===
Highly experimental copy that challenges conventions. Maximum creative risk.

REQUIREMENTS:
- Break from standard ad copy formulas entirely
- Try unconventional hooks, unexpected tonal shifts, contrarian angles
- Prioritize stopping power and memorability over safe conversion optimization
- Draw from storytelling, journalism, or cultural commentary styles`;
      }
    }
  };

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

The user's livelihood depends on ${btConfig.primaryKPI}. Generic copy won't cut it.`;

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

  // Enhance system prompt when Ad Library inspirations are present
  if (config.adLibraryInspirations?.length) {
    systemPrompt += `\n\nYou also have COMPETITOR/INDUSTRY ADS from the Meta Ad Library that the user curated as creative inspiration. Long-running ads indicate profitability. Study their patterns but create ORIGINAL copy for the user's brand — never copy competitor text verbatim.`;
  }

  // Inject copy variation level instructions
  const copyVariationInstructions = getCopyVariationInstructions(copyVariation, hasAnalysis);
  systemPrompt += `\n\n${copyVariationInstructions}`;

  // Copy quality rules: anti-AI patterns, specificity, formatting
  systemPrompt += `\n\nCOPY QUALITY RULES (NON-NEGOTIABLE):
1. ${BANNED_PHRASES_PROMPT} If you catch yourself writing any of these, delete it and write something original and specific instead.
2. SPECIFICITY RULE: Generic claims kill conversions. Every headline and body text must contain at least one CONCRETE element: a number, a timeframe, a named outcome, or a specific mechanism. "Improve your results" is weak. "Cut your CPA 40% in 14 days" is strong.
3. FORMATTING: NEVER use em dashes (—). Max 1 exclamation mark per body text. Zero in headlines.`;

  // Inject business type context
  systemPrompt += `\n\nBUSINESS CONTEXT:\n${btConfig.aiConversionLanguage}`;

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

  const conceptModifier = CONCEPT_AUDIENCE_MODIFIERS[config.conceptType]?.[config.audienceType] || '';

  const userPrompt = `Generate copy OPTIONS for a ${config.audienceType.toUpperCase()} audience${isAutoMode ? ' using analysis-driven insights' : ` using the ${conceptAngle.name} concept`}.
${productSection}
=== AUDIENCE STAGE: ${config.audienceType.toUpperCase()} ===

AWARENESS LEVEL: ${audienceAngle.awarenessLevel}
${audienceAngle.awarenessDescription}
${config.businessType === 'leadgen' && config.audienceType === 'retention' ? `\nIMPORTANT OVERRIDE FOR THIS BUSINESS: ${btConfig.aiRetentionContext}` : ''}

WHAT THE READER ALREADY KNOWS:
${audienceAngle.readerKnows.map((k: string) => `- ${k}`).join('\n')}

WHAT THE READER DOES NOT KNOW:
${audienceAngle.readerDoesNotKnow.map((k: string) => `- ${k}`).join('\n')}

HOOK STRATEGY FOR THIS AUDIENCE:
${audienceAngle.hookStrategy}

BODY COPY STRUCTURE FOR THIS AUDIENCE (${copyLength === 'long' ? 'LONG-FORM' : 'SHORT-FORM'}):
${copyLength === 'long' ? audienceAngle.bodyStructure : audienceAngle.bodyStructureShort}

CTA APPROACH FOR THIS AUDIENCE:
${audienceAngle.ctaApproach}

CRITICAL -- DO NOT DO ANY OF THESE:
${audienceAngle.antiPatterns.map((p: string) => `- ${p}`).join('\n')}
${config.businessType === 'leadgen' ? `\nBUSINESS-SPECIFIC PSYCHOLOGY:\n${btConfig.aiPsychologyShifts}` : ''}

${conceptModifier ? `CONCEPT ADAPTATION FOR ${config.audienceType.toUpperCase()} AUDIENCE:\n${conceptModifier}` : ''}

${conceptSection}
${analysisContext}
${inspirationContext}

=== YOUR TASK ===

${hasAnalysis ? (copyVariation <= 40
  ? `Based on the REAL PERFORMANCE DATA above, generate copy that:
1. MIRRORS the patterns from top-performing ads
2. Uses the SAME emotional triggers and psychological drivers
3. Incorporates winning headline structures
4. AVOIDS the patterns from losing ads`
  : copyVariation <= 60
  ? `Based on the REAL PERFORMANCE DATA above, generate copy that:
1. USES patterns from top-performing ads as a starting point
2. BALANCES proven emotional triggers with new creative approaches
3. Mixes winning structures with fresh experiments
4. AVOIDS the patterns from losing ads`
  : `Based on the REAL PERFORMANCE DATA above, generate copy that:
1. UNDERSTANDS the audience from the analysis data
2. EXPLORES new emotional angles and messaging approaches
3. PUSHES beyond existing patterns to discover new territory
4. Still AVOIDS the patterns identified as losing`) + '\n\n' : ''}Generate OPTIONS for the user to choose from:

1. Generate 6 HEADLINE options (max 40 characters each)
   - Each should ${hasAnalysis ? (copyVariation <= 40 ? 'follow patterns from the top ads above' : copyVariation <= 60 ? 'blend winning patterns with new approaches' : 'explore fresh angles informed by audience insights') : 'be distinct and compelling'}
   - ${hasAnalysis ? (copyVariation <= 40 ? 'Reference specific winning elements from the analysis' : copyVariation <= 60 ? 'Mix proven elements with creative experiments' : 'Prioritize novel hooks and unexpected angles') : 'Use varied emotional angles'}
   - Each headline MUST use a DIFFERENT hook approach. Vary across: question hooks, bold claims, specific numbers/stats, metaphors, identity statements, before/after contrasts, pattern interrupts, and direct benefit statements. Do NOT generate 6 headlines that all use the same structure.

2. Generate 5 BODY COPY options (${copyLength === 'long' ? 'LONG-FORM' : 'SHORT-FORM'}, max ${copyLengthConfig.maxChars} characters each)
   - Each should ${hasAnalysis ? (copyVariation <= 40 ? 'incorporate winning copy elements from the analysis' : copyVariation <= 60 ? 'blend winning elements with new narrative approaches' : 'explore fresh messaging approaches informed by audience data') : 'use different approaches'}
   - ${hasAnalysis ? (copyVariation <= 40 ? 'Use the emotional triggers that work for this account' : copyVariation <= 60 ? 'Balance proven triggers with experimental angles' : 'Try new emotional angles and narrative structures') : 'Mix direct and story-driven approaches'}${copyLength === 'long' ? `
   - LONG-FORM STRUCTURE: Follow a desire-building arc: (1) Hook that stops the scroll, (2) Amplify the pain or desire, (3) Introduce the solution/mechanism, (4) Add one proof element or specific detail, (5) Close with forward momentum toward the CTA.
   - Use line breaks for readability. Tell a mini-story that takes the reader on a journey.` : `
   - SHORT-FORM STRUCTURE: Lead with the single strongest desire-trigger or pain-point. One core idea, one emotion, one action. No throat-clearing or warm-up sentences.`}

3. Generate 4 CTA options
   - ${hasAnalysis ? (copyVariation <= 40 ? 'Based on CTAs that drive action for this account' : copyVariation <= 60 ? 'Mix proven CTAs with fresh action-oriented approaches' : 'Try distinctive, unexpected calls to action') : 'Varied action words and urgency levels'}
   - Include the product/offer name in at least 2 CTAs when possible (e.g., "Start The Protocol" not just "Get Started"). Product-specific CTAs outperform generic ones.
   - Avoid dead-zone CTAs like "Learn More" or "Click Here". Each CTA should imply what happens next.

For EACH option, include a rationale that ${hasAnalysis ? (copyVariation <= 60 ? 'references specific insights from the analysis data' : 'explains the creative strategy and how it connects to the audience') : 'explains why it should work'}.

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
  if (inspirationContext.length > 0) {
    console.log(`💡 Inspiration context size: ${inspirationContext.length} characters`);
  }
  console.log(`📝 Total prompt size: ${systemPrompt.length + userPrompt.length} characters`);
  if (hasAnalysis) {
    console.log('✅ Copy generation will be DATA-DRIVEN using real analysis');
  } else {
    console.log('⚠️ Copy generation will be GENERIC (no analysis data available)');
  }

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 3500, reasoningEffort });

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

    // Post-processing: sanitize all generated copy text
    if (parsed.headlines) {
      for (const h of parsed.headlines) { if (h.text) h.text = sanitizeCopyText(h.text); }
    }
    if (parsed.bodyTexts) {
      for (const b of parsed.bodyTexts) { if (b.text) b.text = sanitizeCopyText(b.text); }
    }
    if (parsed.callToActions) {
      for (const c of parsed.callToActions) { if (c.text) c.text = sanitizeCopyText(c.text); }
    }

    console.log('✅ Copy options generated successfully');
    return parsed;
  } catch (error) {
    console.error('❌ Failed to parse copy options:', error);
    throw new Error('Failed to generate copy options');
  }
}

/**
 * Regenerate a single copy item (headline, body text, or CTA) without regenerating the entire batch.
 * Uses the same prompt context as generateCopyOptions() but requests exactly one replacement,
 * listing existing items to avoid duplicates.
 *
 * NOTE: Always uses reasoning_effort 'low' regardless of the user's IQ selector setting.
 * High reasoning effort makes GPT-5.2 too deterministic for single-item regeneration,
 * causing it to return identical text. Low effort produces more creative variance.
 */
export async function regenerateSingleCopy(config: {
  copyType: 'headline' | 'bodyText' | 'callToAction';
  existingItems: CopyOption[];       // Items that will REMAIN (excludes the one being replaced)
  itemToReplace?: string;            // Text of the item being replaced (for context)
  audienceType: AudienceType;
  conceptType: ConceptType;
  analysisData: ChannelAnalysisResult | null;
  copyLength?: CopyLength;
  copyVariationLevel?: number;
  productContext?: ProductContext;
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  businessType?: import('../types/organization').BusinessType;
}): Promise<CopyOption> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  // Force low reasoning effort for regeneration — high effort is too deterministic and
  // causes the model to converge on the same output given similar context
  const reasoningEffort: ReasoningEffort = 'low';
  const copyLength = config.copyLength ?? DEFAULT_COPY_LENGTH;
  const copyVariation = config.copyVariationLevel ?? 30;
  const copyLengthConfig = COPY_LENGTH_OPTIONS.find(opt => opt.id === copyLength) ?? COPY_LENGTH_OPTIONS[0];
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');
  const typeLabel = config.copyType === 'headline' ? 'headline'
    : config.copyType === 'bodyText' ? 'body copy'
    : 'call-to-action';

  console.log(`🔄 Regenerating single ${typeLabel} for ${config.audienceType} audience | Variation: ${copyVariation}% | Reasoning: ${reasoningEffort}`);

  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const conceptAngle = CONCEPT_ANGLES[config.conceptType];
  const isAutoMode = config.conceptType === 'auto';
  const analysis = config.analysisData;
  const hasAnalysis = !!analysis;

  // Build analysis context (same logic as generateCopyOptions)
  let analysisContext = '';
  if (hasAnalysis) {
    analysisContext += `\n=== CHANNEL PERFORMANCE SUMMARY ===
${analysis.executiveSummary}
Overall Health Score: ${analysis.overallHealthScore}/10
`;
    if (analysis.topAds && analysis.topAds.length > 0) {
      analysisContext += `\n=== YOUR TOP PERFORMING ADS ===\n`;
      analysis.topAds.forEach((ad, i) => {
        analysisContext += `TOP AD #${i + 1} (${(ad.conversionRate * 100).toFixed(2)}% CVR): "${ad.headline}"${ad.bodyText ? ` | Body: "${ad.bodyText}"` : ''} | ${ad.whyItWorks}\n`;
      });
    }
    if (analysis.brandVoice) {
      const bv = analysis.brandVoice;
      analysisContext += `\n=== BRAND VOICE (MATCH THIS) ===
Tone: ${bv.tonality} | Style: ${bv.sentenceStyle} | POV: ${bv.pointOfView} | Vocab: ${bv.vocabularyLevel}
Cadence: ${bv.rhythmAndCadence}
${bv.distinctiveTraits?.length ? `Traits: ${bv.distinctiveTraits.join('; ')}` : ''}
`;
    }
    if (analysis.winningPatterns) {
      analysisContext += `\n=== WINNING PATTERNS ===
- Headlines: ${analysis.winningPatterns.headlines?.join(' | ') || 'N/A'}
- Copy elements: ${analysis.winningPatterns.copyElements?.join(' | ') || 'N/A'}
- Emotional triggers: ${analysis.winningPatterns.emotionalTriggers?.join(', ') || 'N/A'}
- CTAs: ${analysis.winningPatterns.callToActions?.join(', ') || 'N/A'}
`;
    }
    if (analysis.losingPatterns) {
      analysisContext += `\n=== AVOID THESE ===
- Headlines: ${analysis.losingPatterns.headlines?.join(' | ') || 'N/A'}
- Issues: ${analysis.losingPatterns.issues?.join(', ') || 'N/A'}
`;
    }
  }

  // Build inspiration context
  let inspirationContext = '';
  if (config.adLibraryInspirations && config.adLibraryInspirations.length > 0) {
    inspirationContext += `\n=== COMPETITOR INSPIRATION ===\n`;
    config.adLibraryInspirations.forEach((insp, i) => {
      inspirationContext += `#${i + 1} ${insp.pageName}: `;
      if (insp.adCreativeLinkTitles.length > 0) {
        inspirationContext += `Headlines: ${insp.adCreativeLinkTitles.join(' | ')} `;
      }
      if (insp.adCreativeBodies.length > 0) {
        inspirationContext += `Body: ${insp.adCreativeBodies[0].substring(0, 200)}`;
      }
      inspirationContext += '\n';
    });
    inspirationContext += `Create ORIGINAL copy inspired by these — DO NOT copy verbatim.\n`;
  }

  // Build copy variation instructions (reuse the same tier logic)
  const getCopyVariationLabel = (variation: number, hasData: boolean): string => {
    if (hasData) {
      if (variation <= 20) return 'PATTERN MATCH — replicate winning patterns faithfully';
      if (variation <= 40) return 'FRESH WORDING — same playbook, different words';
      if (variation <= 60) return 'BALANCED MIX — blend proven patterns with new angles';
      if (variation <= 80) return 'NEW ANGLES — push beyond existing patterns';
      return 'BOLD & DIFFERENT — radical departure from all patterns';
    } else {
      if (variation <= 20) return 'CONSERVATIVE — safe, proven direct-response copy';
      if (variation <= 40) return 'SLIGHTLY CREATIVE — conventional with creative twists';
      if (variation <= 60) return 'BALANCED — mix conventional and experimental';
      if (variation <= 80) return 'CREATIVE — unconventional hooks, fresh angles';
      return 'EXPERIMENTAL — break formulas entirely, contrarian approaches';
    }
  };

  // Build system prompt (same structure as generateCopyOptions)
  let systemPrompt: string;
  if (isAutoMode && hasAnalysis) {
    systemPrompt = `You are an elite direct-response copywriter with access to REAL PERFORMANCE DATA. Generate high-converting ad copy that REPLICATES and IMPROVES upon proven winning patterns.`;
  } else if (hasAnalysis) {
    systemPrompt = `You are an elite direct-response copywriter with REAL PERFORMANCE DATA. Generate ad copy using the ${conceptAngle.name} concept, INFORMED by actual performance data.`;
  } else {
    systemPrompt = `You are an expert direct-response copywriter specializing in high-converting Meta/Facebook ads. Generate compelling copy using the ${conceptAngle.name} approach.`;
  }

  if (config.adLibraryInspirations?.length) {
    systemPrompt += ` You also have competitor/industry ads as creative inspiration. Study their patterns but create ORIGINAL copy.`;
  }

  systemPrompt += `\n\nCopy variation level: ${getCopyVariationLabel(copyVariation, hasAnalysis)}`;

  // Copy quality rules: anti-AI patterns, specificity, formatting
  systemPrompt += `\n\nCOPY QUALITY RULES (NON-NEGOTIABLE):
1. ${BANNED_PHRASES_PROMPT}
2. SPECIFICITY: Include at least one concrete element per headline and body text (a number, timeframe, named outcome, or specific mechanism). No vague claims.
3. FORMATTING: NEVER use em dashes (—). Max 1 exclamation mark per body text. Zero in headlines.`;

  // Inject business context for leadgen
  systemPrompt += `\n\nBUSINESS CONTEXT:\n${btConfig.aiConversionLanguage}`;
  if (config.businessType === 'leadgen') {
    systemPrompt += `\n${btConfig.aiPsychologyShifts}`;
    if (config.audienceType === 'retention') {
      systemPrompt += `\n\nRETENTION CONTEXT: ${btConfig.aiRetentionContext}`;
    }
  }

  // Build product context
  let productSection = '';
  if (config.productContext) {
    const p = config.productContext;
    productSection = `\nPRODUCT: "${p.name}" by ${p.author}. ${p.description}${p.landingPageUrl ? ` Landing page: ${p.landingPageUrl}` : ''}
All copy MUST reference "${p.name}" by ${p.author} — no other product or brand names.\n`;
  }

  // Build existing items list for dedup
  const existingList = config.existingItems
    .map((item, i) => `${i + 1}. "${item.text}"`)
    .join('\n');

  // Type-specific constraints
  let typeConstraints: string;
  if (config.copyType === 'headline') {
    typeConstraints = 'Max 40 characters. Punchy, scroll-stopping headline.';
  } else if (config.copyType === 'bodyText') {
    typeConstraints = `${copyLength === 'long' ? 'LONG-FORM' : 'SHORT-FORM'}, max ${copyLengthConfig.maxChars} characters.${copyLength === 'long' ? ' Use storytelling, line breaks, emotional depth.' : ' Punchy and concise.'}`;
  } else {
    typeConstraints = 'Short, action-oriented phrase. Creates urgency.';
  }

  // Random creative directions to break model determinism — each call picks a different one
  const creativeDirections = [
    'Use a question that challenges the reader\'s assumptions',
    'Lead with a specific, concrete number or statistic',
    'Start with a bold, contrarian statement',
    'Use a metaphor or analogy from everyday life',
    'Appeal to the reader\'s identity or self-image',
    'Create a vivid before/after mental picture',
    'Use pattern interruption: say something unexpected',
    'Lead with the emotional payoff, not the feature',
    'Reference a common frustration and flip it',
    'Use social proof or implied consensus',
    'Create urgency through a time-sensitive insight',
    'Address a hidden objection the reader is thinking',
  ];

  // Build the replacement context
  const replacementContext = config.itemToReplace
    ? `\n=== ITEM BEING REPLACED (USER REJECTED THIS) ===
"${config.itemToReplace}"
The user clicked "regenerate" because they DON'T LIKE the above. You MUST write something COMPLETELY DIFFERENT — different angle, different hook, different emotional trigger. Do NOT rephrase, reword, or restructure the rejected text.\n`
    : '';

  const MAX_REGEN_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt++) {
    // Pick a random creative direction (different each attempt)
    const directionIndex = Math.floor(Math.random() * creativeDirections.length);
    const creativeDirection = creativeDirections[directionIndex];

    const attemptContext = attempt > 0
      ? `\n⚠️ ATTEMPT ${attempt + 1}: Your previous attempt returned text too similar to the rejected item. You MUST take a RADICALLY DIFFERENT creative approach this time. Use this creative direction: "${creativeDirection}"\n`
      : `\nCreative direction hint: ${creativeDirection}\n`;

    const userPrompt = `Generate exactly 1 NEW ${typeLabel.toUpperCase()} for a ${config.audienceType.toUpperCase()} audience${isAutoMode ? ' using analysis-driven insights' : ` using the ${conceptAngle.name} concept`}.
${productSection}
AUDIENCE STAGE: ${config.audienceType.toUpperCase()} (${audienceAngle.awarenessLevel})
${audienceAngle.awarenessDescription}

HOOK STRATEGY: ${audienceAngle.hookStrategy.split('\n')[0]}
CTA APPROACH: ${audienceAngle.ctaApproach.split('.')[0]}.

DO NOT: ${audienceAngle.antiPatterns.slice(0, 3).join(' | ')}
${CONCEPT_AUDIENCE_MODIFIERS[config.conceptType]?.[config.audienceType] ? `\nCONCEPT ADAPTATION: ${CONCEPT_AUDIENCE_MODIFIERS[config.conceptType][config.audienceType]}` : ''}
${analysisContext}${inspirationContext}${replacementContext}${attemptContext}${existingList ? `=== OTHER ${typeLabel.toUpperCase()}S ALREADY IN USE (DO NOT DUPLICATE) ===
${existingList}
` : ''}
=== YOUR TASK ===
Generate exactly 1 BRAND NEW ${typeLabel} that uses a DIFFERENT angle, hook, or emotional trigger than anything listed above.
${typeConstraints}
CRITICAL: The text you generate MUST be completely new — not a rephrasing of any existing ${typeLabel}.

Return JSON only:
{"id": "x1", "text": "your new ${typeLabel} text here", "rationale": "why this works"}`;

    const response = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 500, reasoningEffort });

    try {
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) cleanedResponse = cleanedResponse.slice(7);
      if (cleanedResponse.startsWith('```')) cleanedResponse = cleanedResponse.slice(3);
      if (cleanedResponse.endsWith('```')) cleanedResponse = cleanedResponse.slice(0, -3);

      const parsed = JSON.parse(cleanedResponse.trim());

      // Post-processing: sanitize generated copy text
      if (parsed.text) {
        parsed.text = sanitizeCopyText(parsed.text);
      }

      // Override ID with a unique one to avoid collisions
      const prefix = config.copyType === 'headline' ? 'h' : config.copyType === 'bodyText' ? 'b' : 'c';
      parsed.id = `${prefix}${config.existingItems.length + 1}_${Date.now()}`;

      // Dedup check: if the new text is identical to the rejected item or any existing item, retry or fail
      const newNorm = parsed.text?.trim().toLowerCase() ?? '';
      const isIdenticalToOld = config.itemToReplace
        && newNorm === config.itemToReplace.trim().toLowerCase();
      const isDuplicateOfExisting = config.existingItems.some(item =>
        item.text.trim().toLowerCase() === newNorm
      );

      if (isIdenticalToOld || isDuplicateOfExisting) {
        const reason = isIdenticalToOld ? 'identical to rejected item' : 'duplicated an existing item';
        if (attempt < MAX_REGEN_ATTEMPTS - 1) {
          console.warn(`⚠️ Regeneration attempt ${attempt + 1} ${reason}, retrying...`);
          continue;
        }
        // Final attempt still returned a duplicate — hard fail
        console.error(`❌ All ${MAX_REGEN_ATTEMPTS} regeneration attempts returned duplicate text`);
        throw new Error(`Failed to generate a unique ${typeLabel} after ${MAX_REGEN_ATTEMPTS} attempts. Please try again.`);
      }

      console.log(`✅ Single ${typeLabel} regenerated successfully (attempt ${attempt + 1})`);
      return parsed as CopyOption;
    } catch (error: unknown) {
      // Parse errors are not retryable
      console.error(`❌ Failed to parse regenerated ${typeLabel}:`, error);
      throw new Error(`Failed to regenerate ${typeLabel}`);
    }
  }

  // Should not reach here, but fallback
  throw new Error(`Failed to generate a unique ${typeLabel} after ${MAX_REGEN_ATTEMPTS} attempts`);
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

  // Text-capable models for analysis, with fallback
  const analysisModels = [TEXT_ANALYSIS_MODEL, DEFAULT_IMAGE_MODEL];

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

  const defaultAnalysis = {
    visualStyle: 'dark, moody professional photography with dramatic contrasts',
    colorPalette: 'deep black backgrounds, warm amber/gold accents, clean white text',
    composition: 'centered focal point with breathing room, text in lower or upper third',
    keyElements: ['product mockup', 'atmospheric lighting', 'minimal distractions', 'strong contrast'],
    mood: 'sophisticated, premium, transformational',
    lighting: 'warm accent lighting with deep shadows, candlelit ambiance',
    textOverlays: 'bold contrasting headlines, clean modern typography',
    productPresentation: 'product prominently featured, often at slight angle with soft shadows',
  };

  // Outer try/catch: serialization of large base64 payloads can throw RangeError
  let analysisBody: string;
  try {
    analysisBody = JSON.stringify({
      contents: [{ parts: requestParts }],
      generationConfig: {
        temperature: 0.3, // Lower temperature for more precise analysis
        maxOutputTokens: 1000,
      }
    });
    requestParts.length = 0; // Free base64 references for GC during fetch
  } catch (serializationError) {
    console.warn('⚠️ Reference image analysis: serialization failed (payload too large), using defaults:', serializationError);
    requestParts.length = 0;
    return defaultAnalysis;
  }

  for (const model of analysisModels) {
    try {
      const apiUrl = `${GEMINI_API_URL}/${model}:generateContent`;
      console.log(`🔍 Analyzing reference images with ${model}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout
      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body: analysisBody,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        console.warn(`⚠️ Reference image analysis failed with ${model} (${response.status})`);
        continue;
      }

      const data = await response.json();
      const textPart = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);

      if (!textPart?.text) {
        console.warn(`⚠️ No text response from ${model} analysis`);
        continue;
      }

      // Parse the JSON response
      let cleanedResponse = textPart.text.trim();
      if (cleanedResponse.includes('```json')) {
        cleanedResponse = cleanedResponse.split('```json')[1].split('```')[0];
      } else if (cleanedResponse.includes('```')) {
        cleanedResponse = cleanedResponse.split('```')[1].split('```')[0];
      }

      const analysis = JSON.parse(cleanedResponse.trim());
      console.log(`✅ Reference image analysis complete (model: ${model}):`, analysis);
      return analysis;
    } catch (error) {
      const isFinal = model === analysisModels[analysisModels.length - 1];
      console.warn(`⚠️ Reference image analysis failed with ${model}:`, error);
      if (!isFinal) {
        console.log(`🔄 Trying fallback analysis model...`);
      }
    }
  }

  // All models failed — return defaults
  console.warn('⚠️ All analysis models failed, using generic defaults');
  return defaultAnalysis;
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
  // Pre-computed reference data to avoid redundant API calls during parallel generation
  precomputedRefs?: {
    referenceImages: Array<{ data: string; mimeType: string }>;
    refAnalysis: Awaited<ReturnType<typeof analyzeReferenceImages>>;
  };
  // Ad Library inspirations for thematic direction
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  // Headline to render directly into the generated image
  headlineText?: string;
}): Promise<GeneratedImageResult> {
  // Check if we should use Gemini or fall back to DALL-E
  if (USE_GEMINI_FOR_IMAGES && isGeminiConfigured()) {
    return generateAdImageWithGemini(config);
  } else if (isOpenAIConfigured()) {
    return generateAdImageWithDallE(config);
  } else {
    throw new Error('No image generation API configured. Please contact your administrator.');
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
  // Pre-computed reference data to avoid redundant API calls when generating in parallel
  precomputedRefs?: {
    referenceImages: Array<{ data: string; mimeType: string }>;
    refAnalysis: Awaited<ReturnType<typeof analyzeReferenceImages>>;
  };
  // Ad Library inspirations for thematic direction
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  // Headline to render directly into the generated image
  headlineText?: string;
}): Promise<GeneratedImageResult> {
  const similarity = config.similarityLevel ?? 30; // Default to 30% variation
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const sizeConfig = IMAGE_SIZE_OPTIONS.find(s => s.id === imageSize) || IMAGE_SIZE_OPTIONS[0];
  console.log(`🎨 Generating ad image with Gemini Nano Banana Pro ${config.variationIndex + 1}/${config.totalVariations} for ${config.audienceType} audience (${similarity}% variation, ${sizeConfig.dimensions})`);

  const visualAnalysis = config.analysisData?.visualAnalysis;
  const topAds = config.analysisData?.topAds || [];
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  let referenceImages: Array<{ data: string; mimeType: string }>;
  let refAnalysis: Awaited<ReturnType<typeof analyzeReferenceImages>>;

  if (config.precomputedRefs) {
    // Use pre-computed references (avoids redundant API calls during parallel generation)
    referenceImages = config.precomputedRefs.referenceImages;
    refAnalysis = config.precomputedRefs.refAnalysis;
    console.log(`📸 Using pre-computed reference data (${referenceImages.length} images)`);
  } else {
    // Compute references on-the-fly (single image regeneration)
    const MIN_QUALITY_SCORE = 60;
    const cachedImages = getTopHighQualityCachedImages(3, MIN_QUALITY_SCORE);

    console.log(`📸 Found ${cachedImages.length} high-quality reference images (quality >= ${MIN_QUALITY_SCORE})`);

    referenceImages = cachedImages.map(cached => ({
      data: cached.base64Data,
      mimeType: cached.mimeType
    }));

    if (config.productContext?.productImages?.length) {
      const productImgs = config.productContext.productImages.slice(0, 3);
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

    refAnalysis = await analyzeReferenceImages(referenceImages);
    console.log('🎨 Reference analysis:', refAnalysis);
  }

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
    `TARGET AUDIENCE: ${config.audienceType.toUpperCase()} (${audienceAngle.awarenessLevel})`,
    `- Focus: ${audienceAngle.focus}`,
    `- Tone: ${audienceAngle.tone}`,
    `- Visual implication: ${config.audienceType === 'prospecting'
      ? 'Image should evoke curiosity and problem recognition -- NOT product showcase'
      : config.audienceType === 'retargeting'
      ? 'Image should reinforce product credibility and mechanism -- can feature the product prominently'
      : 'Image should feel exclusive and premium -- VIP treatment, insider access'}`,
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

  // Ad Library inspiration context for thematic direction (text only, no images)
  if (config.adLibraryInspirations?.length) {
    promptParts.push('COMPETITOR/INDUSTRY INSPIRATION (thematic direction):');
    promptParts.push('The following successful ad copy patterns were curated from the Ad Library.');
    promptParts.push('Use their thematic direction to inform the visual narrative:');
    config.adLibraryInspirations.slice(0, 3).forEach((insp, i) => {
      const bodyPreview = insp.adCreativeBodies[0]?.substring(0, 200) || 'N/A';
      promptParts.push(`  ${i + 1}. ${insp.pageName} (ran ${insp.durationDays} days): ${bodyPreview}`);
    });
    promptParts.push('');
  }

  if (config.headlineText) {
    // Headline in image mode — render the headline into the creative
    promptParts.push(
      'CREATIVE REQUIREMENTS:',
      '- Professional advertising photography quality',
      '- Strong visual hierarchy with clear focal point',
      '- Emotionally compelling imagery that resonates with the target audience',
      '- Modern, premium aesthetic',
      '- Photorealistic style unless references show otherwise',
      '',
      `This is variation ${config.variationIndex + 1} of ${config.totalVariations} - create a unique variation while maintaining brand consistency with the references.`,
      '',
      'HEADLINE TEXT IN IMAGE — CRITICAL:',
      `Render this EXACT headline into the image: "${config.headlineText}"`,
      '',
      '- Render the EXACT text above — do NOT paraphrase, abbreviate, or change any words',
      '- Use large, bold typography that is legible at mobile scroll sizes',
      '- High contrast between text and background for readability',
      '- Position in the upper third or center of the image where it commands attention',
      '- Integrate the text into the composition naturally — it should feel designed, not superimposed',
      `- Typography style: ${refAnalysis.textOverlays || 'bold, clean sans-serif with strong contrast'}`,
      '- Do NOT add any OTHER text, words, taglines, URLs, or numbers beyond this exact headline',
    );
  } else {
    // No headline — image-only mode (default)
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
  }

  const prompt = promptParts.join('\n');
  console.log('📝 Gemini prompt:', prompt.substring(0, 300) + '...');

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

  // Stringify once, then free the request object to release base64 references sooner
  const requestBodyStr = JSON.stringify(requestBody);
  // Clear references from requestParts to allow GC of base64 data during fetch
  requestParts.length = 0;

  // Try primary model, then fallback model if primary fails
  const modelsToTry = [DEFAULT_IMAGE_MODEL, FALLBACK_IMAGE_MODEL];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    const apiUrl = `${GEMINI_API_URL}/${model}:generateContent`;
    console.log(`🎯 Trying image model: ${model}`);

    // Retry logic for transient Gemini errors (503, 429, 500)
    const MAX_RETRIES = 2;
    const RETRY_DELAYS = [2000, 5000]; // reduced backoff to avoid long stalls
    let response: Response | null = null;

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout per request
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': GEMINI_API_KEY,
            },
            body: requestBodyStr,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok) break;

        const isTransient = [429, 500, 503].includes(response.status);
        if (!isTransient || attempt === MAX_RETRIES) {
          const errorText = await response.text();
          console.error(`❌ Image generation API Error (${model}):`, response.status, errorText.substring(0, 500));
          throw new Error(`Image generation error (${response.status}): ${errorText.substring(0, 200)}`);
        }

        const delay = RETRY_DELAYS[attempt];
        console.warn(`⚠️ ${model} returned ${response.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const data = await response!.json();
      console.log(`📦 Response received from ${model}`);

      // Check for safety/policy blocks — these are NOT retryable across models
      const promptFeedback = data.promptFeedback;
      if (promptFeedback?.blockReason) {
        // Prompt itself was blocked — no model will accept it, fail fast
        throw new SafetyBlockError(`Image generation blocked by safety filter: ${promptFeedback.blockReason}`);
      }

      const finishReason = data.candidates?.[0]?.finishReason;
      // Explicit safety/policy finish reasons — not retryable across models
      const SAFETY_FINISH_REASONS = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'];
      if (finishReason && SAFETY_FINISH_REASONS.includes(finishReason)) {
        console.warn(`⚠️ ${model} response blocked by safety: finishReason=${finishReason}`);
        throw new SafetyBlockError(`Image generation blocked (${finishReason}). Try adjusting your prompt or product description.`);
      }
      // Other non-STOP/MAX_TOKENS reasons (e.g. OTHER, LANGUAGE) — retryable, may succeed on fallback model
      if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        console.warn(`⚠️ ${model} unexpected finishReason=${finishReason}, treating as retryable`);
        throw new Error(`Image generation incomplete (${finishReason})`);
      }

      // Extract the image from the response
      const candidates = data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('Image generation returned no results');
      }

      const parts = candidates[0].content?.parts;
      if (!parts) {
        throw new Error(`Image generation response incomplete (finishReason: ${finishReason || 'unknown'})`);
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
        // Don't stringify the full response — it may contain large binary data that crashes the console
        const candidateCount = data.candidates?.length ?? 0;
        const partTypes = parts?.map((p: Record<string, unknown>) => Object.keys(p).join(',')).join('; ') ?? 'none';
        console.error(`❌ No image data in ${model} response. Candidates: ${candidateCount}, Part types: ${partTypes}, Text: ${textResponse?.substring(0, 200) || '(none)'}`);
        throw new Error('Image generation did not return an image. Response: ' + (textResponse || 'No text response'));
      }

      // Success — return the image
      console.log(`✅ Image generated successfully with ${model}`);
      return {
        imageUrl: `data:${mimeType};base64,${imageData}`,
        revisedPrompt: textResponse || prompt,
      };
    } catch (err: unknown) {
      // Safety/policy blocks are not retryable — fail immediately
      if (err instanceof SafetyBlockError) {
        throw err;
      }
      // Convert AbortError (timeout) to a descriptive message
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(`Image generation timed out after 60s (${model})`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      const isFinalModel = model === modelsToTry[modelsToTry.length - 1];
      if (!isFinalModel) {
        console.warn(`⚠️ ${model} failed, trying fallback model...`, lastError.message);
      }
    }
  }

  // All models failed — throw the last error
  throw lastError || new Error('Image generation failed: all models unavailable');
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
  // Headline to render directly into the generated image
  headlineText?: string;
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
    `Target Audience: ${config.audienceType.toUpperCase()} (${audienceAngle.awarenessLevel}) - ${audienceAngle.focus}`,
    `Tone: ${audienceAngle.tone}`,
    `Visual approach: ${config.audienceType === 'prospecting'
      ? 'Evoke the problem/desire -- curiosity-driven imagery'
      : config.audienceType === 'retargeting'
      ? 'Feature the product and mechanism -- credibility-driven imagery'
      : 'Premium, exclusive feel -- loyalty-driven imagery'}`,
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
    config.headlineText
      ? `Render this EXACT headline into the image as a prominent typographic element: "${config.headlineText}". Use large, bold, legible typography with high contrast. Integrate it into the composition naturally. Do NOT add any other text beyond this exact headline. Create a visually striking ${sizeConfig.dimensions} ad image.`
      : `Create a visually striking ${sizeConfig.dimensions} ad image. Do NOT include any text in the image.`
  );

  const prompt = promptParts.join('\n');

  const response = await openaiProxy('images', {
    model: DALLE_MODEL,
    prompt,
    n: 1,
    size: sizeConfig.dalleSize,
    quality: 'hd',
    response_format: 'url',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ DALL-E API Error:', errorText);
    throw new Error(`Image generation error: ${response.status} ${response.statusText}`);
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
    throw new Error('AI API not configured. Please contact support.');
  }

  console.log(`📝 Generating ad copy for ${config.audienceType} audience (${config.variationCount} variations)`);

  const winningPatterns = config.analysisData?.winningPatterns;
  const audienceInsights = config.analysisData?.audienceInsights;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  let systemPrompt = `You are an expert direct-response copywriter specializing in high-converting Meta/Facebook ads.
Your copy should be emotionally compelling, benefit-focused, and tailored to the specific audience stage.
Write copy that feels authentic, not corporate or overly salesy.`;

  // Inject brand voice if available
  if (config.analysisData?.brandVoice) {
    const bv = config.analysisData.brandVoice;
    systemPrompt += `\n\nBRAND VOICE (MATCH THIS): Tone: ${bv.tonality} | Style: ${bv.sentenceStyle} | POV: ${bv.pointOfView} | Vocab: ${bv.vocabularyLevel} | Cadence: ${bv.rhythmAndCadence}${bv.distinctiveTraits?.length ? ` | Traits: ${bv.distinctiveTraits.join('; ')}` : ''}`;
  }

  // Copy quality rules
  systemPrompt += `\n\nCOPY QUALITY RULES (NON-NEGOTIABLE):
1. ${BANNED_PHRASES_PROMPT}
2. SPECIFICITY: Include at least one concrete element per headline and body text (a number, timeframe, named outcome, or specific mechanism). No vague claims.
3. FORMATTING: NEVER use em dashes (—). Max 1 exclamation mark per body text. Zero in headlines.`;

  const userPrompt = `Generate ad copy for a ${config.audienceType.toUpperCase()} audience.

=== AUDIENCE STAGE: ${config.audienceType.toUpperCase()} ===

AWARENESS LEVEL: ${audienceAngle.awarenessLevel}
${audienceAngle.awarenessDescription}

WHAT THE READER ALREADY KNOWS:
${audienceAngle.readerKnows.map((k: string) => `- ${k}`).join('\n')}

WHAT THE READER DOES NOT KNOW:
${audienceAngle.readerDoesNotKnow.map((k: string) => `- ${k}`).join('\n')}

HOOK STRATEGY FOR THIS AUDIENCE:
${audienceAngle.hookStrategy}

BODY COPY STRUCTURE FOR THIS AUDIENCE (SHORT-FORM):
${audienceAngle.bodyStructureShort}

CTA APPROACH FOR THIS AUDIENCE:
${audienceAngle.ctaApproach}

CRITICAL -- DO NOT DO ANY OF THESE:
${audienceAngle.antiPatterns.map((p: string) => `- ${p}`).join('\n')}

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
  ], { maxTokens: 1500 });

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

    // Post-processing: sanitize all generated copy text
    if (parsed.headlines) {
      parsed.headlines = parsed.headlines.map((h: string) => sanitizeCopyText(h));
    }
    if (parsed.bodyTexts) {
      parsed.bodyTexts = parsed.bodyTexts.map((b: string) => sanitizeCopyText(b));
    }
    if (parsed.callToActions) {
      parsed.callToActions = parsed.callToActions.map((c: string) => sanitizeCopyText(c));
    }

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
    throw new Error('AI API not configured. Please contact support.');
  }

  console.log(`🎬 Generating video storyboard for ${config.audienceType} audience`);

  const winningPatterns = config.analysisData?.winningPatterns;
  const visualAnalysis = config.analysisData?.visualAnalysis;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  const systemPrompt = `You are an expert video ad creative director specializing in short-form social media ads.
Create compelling video ad storyboards that follow the proven AIDA (Attention, Interest, Desire, Action) framework.
Your storyboards should be production-ready with clear visual direction.`;

  const userPrompt = `Create a 15-second video ad storyboard for a ${config.audienceType.toUpperCase()} audience.

AUDIENCE CONTEXT (${audienceAngle.awarenessLevel}):
- Focus: ${audienceAngle.focus}
- Tone: ${audienceAngle.tone}
- Messaging: ${audienceAngle.messaging}
- ${config.audienceType === 'prospecting'
  ? 'Video should lead with the PROBLEM -- do not mention the product in the first 3 seconds'
  : config.audienceType === 'retargeting'
  ? 'Video can open with the product/brand -- the viewer recognizes it. Go deeper on mechanism and proof'
  : 'Video should open with customer recognition -- VIP framing, insider content'}

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
  ], { maxTokens: 2000 });

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
 * Generate a video ad using Google Veo 3.1 (text-to-video).
 * Product context, hook-first prompts, channel analysis integration,
 * ad library inspirations, UGC audio cues, configurable model/duration/aspect/resolution.
 *
 * Note: Veo 3.1 does not support inlineData for image-to-video on the Gemini API.
 */
export async function generateAdVideoWithVeo(config: {
  audienceType: AudienceType;
  conceptType?: ConceptType;
  analysisData: ChannelAnalysisResult | null;
  selectedCopy?: {
    headlines: string[];
    bodyTexts: string[];
  };
  videoConfig?: VideoConfig;
  productContext?: ProductContext;
  // Competitor ad inspirations from Ad Library
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  // Which variation this is (for prompt variety)
  variationIndex?: number;
  totalVariations?: number;
}): Promise<GeneratedVideoResult> {
  if (!isGeminiConfigured()) {
    throw new Error('Video generation API not configured. Please contact support.');
  }

  const videoConfig = config.videoConfig || DEFAULT_VIDEO_CONFIG;
  const modelId = VEO_MODEL;
  // Enforce API constraint: 1080p and 4k require exactly 8s duration
  const durationSec = videoConfig.resolution !== '720p' ? 8 : videoConfig.duration;
  const variationIdx = config.variationIndex ?? 0;
  const totalVars = config.totalVariations ?? 1;

  console.log(`🎬 Generating video ${variationIdx + 1}/${totalVars} with Veo (${modelId}), ${durationSec}s ${videoConfig.aspectRatio} ${videoConfig.resolution}`);

  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const conceptAngle = config.conceptType ? CONCEPT_ANGLES[config.conceptType] : null;
  const winningPatterns = config.analysisData?.winningPatterns;
  const visualAnalysis = config.analysisData?.visualAnalysis;
  const audienceInsights = config.analysisData?.audienceInsights;

  // Rotate through available headlines/body for each variation
  const headlines = config.selectedCopy?.headlines || [];
  const bodyTexts = config.selectedCopy?.bodyTexts || [];
  const headline = headlines[variationIdx % Math.max(headlines.length, 1)] || 'Discover something amazing';
  const bodyText = bodyTexts[variationIdx % Math.max(bodyTexts.length, 1)] || '';

  // === Build hook-first video prompt ===
  const promptParts: string[] = [];

  // Hook-first structure: the opening seconds are everything
  promptParts.push(
    `Create a ${durationSec}-second social media advertisement video (${videoConfig.aspectRatio} aspect ratio).`,
    '',
    `HOOK (first 1-2 seconds) — THIS IS THE MOST IMPORTANT PART:`,
    `Open with an attention-grabbing visual that stops the scroll.`,
  );

  // Use winning headline patterns for the hook
  if (winningPatterns?.headlines?.length) {
    const hookPattern = winningPatterns.headlines[variationIdx % winningPatterns.headlines.length];
    promptParts.push(`Hook pattern proven to convert: "${hookPattern}"`);
  }
  promptParts.push(`Main headline to convey in the hook: "${headline}"`, '');

  // Product context — tell the AI what this ad is for
  if (config.productContext) {
    promptParts.push(
      'PRODUCT:',
      `- Name: ${config.productContext.name}`,
      `- By: ${config.productContext.author}`,
      `- Description: ${config.productContext.description}`,
      'The video must represent this product accurately.',
      ''
    );
  }

  // Target audience
  promptParts.push(
    `TARGET AUDIENCE: ${config.audienceType.toUpperCase()} (${audienceAngle.awarenessLevel})`,
    `- Focus: ${audienceAngle.focus}`,
    `- Tone: ${audienceAngle.tone}`,
    `- ${config.audienceType === 'prospecting'
      ? 'Open with the problem/desire -- build curiosity before revealing the product'
      : config.audienceType === 'retargeting'
      ? 'Product can appear immediately -- focus on mechanism and social proof'
      : 'Treat the viewer as an insider -- VIP reveal, exclusive access framing'}`,
    ''
  );

  // Concept angle
  if (conceptAngle && config.conceptType !== 'auto') {
    promptParts.push(
      `CONCEPT: ${conceptAngle.name}`,
      `- Visual direction: ${conceptAngle.visualDirection}`,
      `- Messaging style: ${conceptAngle.messagingStyle}`,
      ''
    );
  }

  // Channel analysis deep integration — winning visual elements
  if (visualAnalysis) {
    promptParts.push('VISUAL INTELLIGENCE FROM HIGH-CONVERTING ADS:');
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
      promptParts.push(`- Psychological triggers: ${visualAnalysis.psychologicalTriggers.slice(0, 3).join(', ')}`);
    }
    if (visualAnalysis.losingVisualElements?.length) {
      promptParts.push(`- AVOID (don't convert): ${visualAnalysis.losingVisualElements.slice(0, 3).join(', ')}`);
    }
    promptParts.push('');
  }

  // Winning copy patterns for emotional triggers
  if (winningPatterns?.emotionalTriggers?.length) {
    promptParts.push(`Emotional triggers that work: ${winningPatterns.emotionalTriggers.slice(0, 3).join(', ')}`);
  }

  // Audience visual preferences
  if (audienceInsights?.visualPreferences?.length) {
    promptParts.push(`Audience visual preferences: ${audienceInsights.visualPreferences.slice(0, 3).join(', ')}`);
  }

  // Ad Library inspiration — competitor thematic direction
  if (config.adLibraryInspirations?.length) {
    promptParts.push('', 'COMPETITOR/INDUSTRY INSPIRATION (thematic direction):');
    config.adLibraryInspirations.slice(0, 3).forEach((insp, i) => {
      const bodyPreview = insp.adCreativeBodies[0]?.substring(0, 150) || 'N/A';
      promptParts.push(`  ${i + 1}. ${insp.pageName} (ran ${insp.durationDays} days): ${bodyPreview}`);
    });
    promptParts.push('');
  }

  // Supporting body text
  if (bodyText) {
    promptParts.push(`Supporting message: "${bodyText}"`, '');
  }

  // Video structure guidance
  promptParts.push(
    'VIDEO STRUCTURE:',
    `- 0-2s: HOOK — scroll-stopping opening with "${headline}"`,
    `- 2-${Math.floor(durationSec * 0.7)}s: BODY — demonstrate value, show the product/outcome`,
    `- ${Math.floor(durationSec * 0.7)}-${durationSec}s: CTA — clear call to action with urgency`,
    ''
  );

  // UGC-style direction + audio cues (Veo 3.1 native audio)
  promptParts.push(
    'STYLE & AUDIO:',
    '- UGC (user-generated content) aesthetic — authentic, relatable, not overly polished',
    '- Dynamic motion with smooth transitions between scenes',
    `- Include a confident voiceover saying: "${headline}"`,
    '- Ambient sound cues that match the scene (subtle, not overpowering)',
    '- Text overlays with the headline at key moments — large, bold, readable on mobile',
  );

  // Variation diversity
  if (totalVars > 1) {
    promptParts.push(
      '',
      `This is variation ${variationIdx + 1} of ${totalVars}. Create a distinctly different creative approach while maintaining the same core message.`
    );
  }

  const prompt = promptParts.filter(Boolean).join('\n');
  console.log('📝 Veo prompt length:', prompt.length, 'chars');
  if (import.meta.env.DEV) {
    console.log('📝 Veo prompt:', prompt.substring(0, 500) + '...');
  }

  // === Build Veo API request ===
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance: Record<string, any> = { prompt };

  // Note: Veo 3.1 on the Gemini API does not support inlineData for image-to-video.
  // The model rejects base64 image data with "inlineData isn't supported by this model".
  // Text-to-video is used instead. If image-to-video support is added in the future,
  // images must be uploaded via the Gemini Files API and referenced by fileUri.

  // IMPORTANT: This code uses the Gemini API (generativelanguage.googleapis.com), NOT Vertex AI.
  // The Vertex AI docs list many params (personGeneration, enhancePrompt, generateAudio,
  // sampleCount, seed) but the Gemini API rejects ALL of them with 400 errors.
  // Only these four params are accepted by the Gemini API predictLongRunning endpoint:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parameters: Record<string, any> = {
    aspectRatio: videoConfig.aspectRatio,
    durationSeconds: durationSec,
    resolution: videoConfig.resolution,
    negativePrompt: 'blurry, low quality, distorted, watermark',
  };

  // Submit video generation request (long-running operation)
  const submitUrl = `${GEMINI_API_URL}/${modelId}:predictLongRunning`;
  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({ instances: [instance], parameters }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    console.error('❌ Veo submission failed:', errorText);
    throw new Error(`Video generation failed: ${submitResponse.status} ${errorText}`);
  }

  const operation = await submitResponse.json();
  console.log('⏳ Veo operation started:', operation.name);

  // Poll for completion (max 5 minutes)
  const maxWaitTime = 5 * 60 * 1000;
  const pollInterval = 10 * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operation.name}`,
      { headers: { 'x-goog-api-key': GEMINI_API_KEY } }
    );

    if (!statusResponse.ok) {
      console.warn('⚠️ Status check failed, retrying...');
      continue;
    }

    const status = await statusResponse.json();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`🔄 Veo status (${elapsed}s): ${status.done ? 'DONE' : 'PROCESSING'}`);

    if (status.done) {
      if (status.error) {
        throw new Error(`Video generation error: ${status.error.message}`);
      }

      // Veo 3.1 Gemini API response path: generateVideoResponse.generatedSamples
      const generatedVideo = status.response?.generateVideoResponse?.generatedSamples?.[0];
      if (!generatedVideo) {
        console.error('❌ Unexpected Veo response structure:', JSON.stringify(Object.keys(status.response || {})));
        throw new Error('No video generated in response');
      }

      // Get the video file URI
      const videoUri = generatedVideo.video?.uri || '';

      if (!videoUri) {
        throw new Error('No video file reference in generation response');
      }

      // Extract file reference from URI, version-agnostic
      // Veo URIs: https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media
      const fileMatch = videoUri.match(/\bfiles\/[a-zA-Z0-9_-]+/);
      const veoFileRef = fileMatch?.[0] || generatedVideo.video?.name || '';

      // SECURITY: Download video binary immediately using key as header, not in URL.
      // This prevents API key leakage in stored URLs or localStorage.
      const downloadUrl = videoUri;
      const videoResponse = await fetch(downloadUrl, {
        headers: { 'x-goog-api-key': GEMINI_API_KEY },
      });

      let videoUrl = '';
      if (videoResponse.ok) {
        const videoBlob = await videoResponse.blob();
        videoUrl = URL.createObjectURL(videoBlob);
        console.log('✅ Veo video downloaded to blob successfully');
      } else {
        console.warn('⚠️ Video download failed, preview unavailable. File ref preserved for publish.');
      }

      const costPerSec = 0.40; // veo-3.1-generate-preview
      const estimatedCost = `$${(costPerSec * durationSec).toFixed(2)}`;

      return {
        videoUrl,
        veoFileRef,
        duration: `${durationSec}s`,
        aspectRatio: videoConfig.aspectRatio,
        resolution: videoConfig.resolution,
        model: videoConfig.model,
        prompt,
        estimatedCost,
      };
    }
  }

  throw new Error('Video generation timed out after 5 minutes');
}

/**
 * Generate a complete ad package (images + copy or storyboard + copy)
 * If selectedCopy is provided, uses pre-selected copy instead of generating new
 * @param config - Configuration including ad type, audience, variations, and reasoning effort
 */
/**
 * Regenerate all images for an ad package without regenerating copy.
 * Handles reference pre-computation, batched generation, memory cleanup, and error categorization.
 * Used by both generateAdPackage (initial generation) and the "Regenerate All Images" UI action.
 */
export async function regenerateAllImages(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationCount: number;
  similarityLevel?: number;
  imageSize?: ImageSize;
  productContext?: ProductContext;
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  imageHeadlines?: string[];
  onProgress?: (message: string) => void;
}): Promise<{ images: GeneratedImageResult[]; indexedResults: (GeneratedImageResult | null)[]; imageError?: string }> {
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  console.log(`🖼️ Regenerating ${config.variationCount} image(s) for ${config.audienceType} audience`);

  // Pre-compute reference images and analysis ONCE before parallel generation
  let precomputedRefs: {
    referenceImages: Array<{ data: string; mimeType: string }>;
    refAnalysis: Awaited<ReturnType<typeof analyzeReferenceImages>>;
  } | undefined;

  if (USE_GEMINI_FOR_IMAGES && isGeminiConfigured()) {
    const MIN_QUALITY_SCORE = 60;
    const cachedImages = getTopHighQualityCachedImages(3, MIN_QUALITY_SCORE);
    const referenceImages: Array<{ data: string; mimeType: string }> = cachedImages.map(cached => ({
      data: cached.base64Data,
      mimeType: cached.mimeType
    }));

    if (config.productContext?.productImages?.length) {
      const productImgs = config.productContext.productImages.slice(0, 3);
      productImgs.forEach(img => {
        referenceImages.push({ data: img.base64Data, mimeType: img.mimeType });
      });
    }

    console.log(`📸 Pre-computing reference analysis for ${referenceImages.length} images (shared across ${config.variationCount} variations)`);
    config.onProgress?.('ConversionIQ™ analyzing reference styles...');
    const refAnalysis = await analyzeReferenceImages(referenceImages);
    precomputedRefs = { referenceImages, refAnalysis };
  }

  // Generate images with concurrency limit of 2 to prevent memory exhaustion
  const MAX_CONCURRENT = 2;
  const allResults: PromiseSettledResult<GeneratedImageResult>[] = [];

  for (let batch = 0; batch < config.variationCount; batch += MAX_CONCURRENT) {
    const batchEnd = Math.min(batch + MAX_CONCURRENT, config.variationCount);
    config.onProgress?.(`ConversionIQ™ generating image ${batch + 1}${batchEnd > batch + 1 ? `-${batchEnd}` : ''} of ${config.variationCount}...`);
    const batchPromises = Array.from({ length: batchEnd - batch }, (_, i) => {
      const variationIndex = batch + i;
      const headlineText = config.imageHeadlines?.length
        ? config.imageHeadlines[variationIndex % config.imageHeadlines.length]
        : undefined;
      return generateAdImage({
        audienceType: config.audienceType,
        analysisData: config.analysisData,
        variationIndex,
        totalVariations: config.variationCount,
        similarityLevel: config.similarityLevel,
        imageSize,
        productContext: config.productContext,
        precomputedRefs,
        adLibraryInspirations: config.adLibraryInspirations,
        headlineText,
      });
    });
    const batchResults = await Promise.allSettled(batchPromises);
    allResults.push(...batchResults);
  }

  // Free reference image memory now that all images are generated
  if (precomputedRefs) {
    precomputedRefs.referenceImages.length = 0;
    precomputedRefs = undefined;
  }

  // Indexed results: preserves position — null for failed slots, image for successful ones
  const indexedResults: (GeneratedImageResult | null)[] = allResults.map(r =>
    r.status === 'fulfilled' ? r.value : null
  );

  const images = allResults
    .filter((r): r is PromiseFulfilledResult<GeneratedImageResult> => r.status === 'fulfilled')
    .map(r => r.value);

  let imageError: string | undefined;
  const failedResults = allResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failedResults.length > 0) {
    console.warn(`⚠️ ${failedResults.length}/${allResults.length} image(s) failed to generate`);
    failedResults.forEach((r, i) => {
      const msg = r.reason?.message || String(r.reason);
      console.error(`  Image failure ${i + 1}: ${msg.substring(0, 300)}`);
    });
    const firstError = failedResults[0].reason;
    const errorMessage = firstError?.message || String(firstError);
    if (errorMessage.includes('429') || errorMessage.includes('quota')) {
      imageError = 'Image generation quota exceeded. Please wait a few minutes and try again, or check your billing settings.';
    } else if (errorMessage.includes('503') || errorMessage.includes('overloaded') || errorMessage.includes('500')) {
      imageError = 'Image generation service is temporarily overloaded. Both primary and fallback models were tried. Please try again in a few minutes.';
    } else if (errorMessage.includes('blocked') || errorMessage.includes('SAFETY') || errorMessage.includes('safety')) {
      imageError = 'Image generation was blocked by a safety filter. Try adjusting your prompt or product description.';
    } else if (errorMessage.includes('RangeError') || errorMessage.includes('Invalid string length') || errorMessage.includes('out of memory')) {
      imageError = 'Image generation ran out of memory. Try reducing variation count or clearing reference images.';
    } else if (errorMessage.includes('403') || errorMessage.includes('billing') || errorMessage.includes('permission')) {
      imageError = 'Image generation API access denied. Please verify your API key and billing are configured correctly.';
    } else {
      imageError = `Image generation failed: ${errorMessage}`;
    }
  }

  return { images, indexedResults, imageError };
}

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
  // Ad Library inspirations for competitor/cross-industry reference
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  // Headlines to render directly into images, rotated across variations
  imageHeadlines?: string[];
  // Video generation configuration (aspect ratio, duration, resolution, model)
  videoConfig?: VideoConfig;
  // Text ad configuration (canvas-rendered text images)
  textAdConfig?: TextAdConfig;
  // Progress callback for UI updates during generation
  onProgress?: (message: string) => void;
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
    const imageResult = await regenerateAllImages({
      audienceType: config.audienceType,
      analysisData: config.analysisData,
      variationCount: config.variationCount,
      similarityLevel: config.similarityLevel,
      imageSize: config.imageSize,
      productContext: config.productContext,
      adLibraryInspirations: config.adLibraryInspirations,
      imageHeadlines: config.imageHeadlines,
      onProgress: config.onProgress,
    });
    images = imageResult.images;
    imageError = imageResult.imageError;

    whyItWorks = `This ad package uses ${config.audienceType} audience targeting with ${images.length} image variation(s). ${copy.rationale}`;
  } else if (config.adType === 'text') {
    // Text-only ad: Canvas-rendered typographic images — no API calls, zero cost, instant
    const { generateTextAdVariations } = await import('./textAdCanvas');
    const textConfig = config.textAdConfig;
    if (!textConfig?.primaryText?.trim()) {
      imageError = 'Primary text is required for text ad generation.';
      images = [];
    } else {
      config.onProgress?.('ConversionIQ™ rendering text creatives...');
      const textResult = generateTextAdVariations({
        primaryText: textConfig.primaryText,
        highlightText: textConfig.highlightText,
        anchorText: textConfig.anchorText,
        styleIds: textConfig.styleIds,
        imageSize: config.imageSize ?? DEFAULT_IMAGE_SIZE,
        variationCount: config.variationCount,
      });
      images = textResult.images;
      imageError = textResult.imageError;
    }
    whyItWorks = `Text-only ad with ${images?.length || 0} style variation(s) for ${config.audienceType} audience. Bold text-on-background format optimized for scroll-stopping visibility. ${copy.rationale}`;
  } else {
    // Generate video(s) with Veo 3.1 — text-to-video, supports multi-variation
    const videos: GeneratedVideoResult[] = [];
    let videoError: string | undefined;
    const videoConfig = config.videoConfig || DEFAULT_VIDEO_CONFIG;
    const variationCount = Math.min(config.variationCount, 3); // Cap at 3 for video

    if (USE_VEO_FOR_VIDEO && isGeminiConfigured()) {
      // Note: Veo 3.1 does not support inlineData for image-to-video.
      // First-frame image generation is skipped — text-to-video is used instead.

      // Step 1: Generate videos serially (each takes 2-5 min polling; parallel won't save time)
      for (let i = 0; i < variationCount; i++) {
        try {
          console.log(`🎬 Generating video ${i + 1}/${variationCount} with Veo 3.1...`);
          const result = await generateAdVideoWithVeo({
            audienceType: config.audienceType,
            conceptType: config.conceptType,
            analysisData: config.analysisData,
            selectedCopy: config.selectedCopy ? {
              headlines: config.selectedCopy.headlines,
              bodyTexts: config.selectedCopy.bodyTexts,
            } : undefined,
            videoConfig,
            productContext: config.productContext,
            adLibraryInspirations: config.adLibraryInspirations,
            variationIndex: i,
            totalVariations: variationCount,
          });
          videos.push(result);
        } catch (error: unknown) {
          console.error(`❌ Veo video ${i + 1}/${variationCount} failed:`, error instanceof Error ? error.message : error);
          if (!videoError) {
            videoError = error instanceof Error ? error.message : 'Video generation failed';
          }
        }
      }
    }

    // Always generate storyboard as a supplement/fallback
    storyboard = await generateVideoStoryboard({
      audienceType: config.audienceType,
      analysisData: config.analysisData,
    });

    const video = videos[0]; // Backwards compat
    if (videos.length > 0) {
      whyItWorks = `This video ad was generated for ${config.audienceType} audiences with ${videos.length} variation(s). ${storyboard.conceptSummary}`;
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
      videos: videos.length > 0 ? videos : undefined,
      videoConfig,
      copy,
      storyboard,
      whyItWorks,
      imageError,
      videoError,
      imageHeadlines: config.imageHeadlines,
      variationCount: config.variationCount,
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
    imageHeadlines: config.imageHeadlines,
    variationCount: config.variationCount,
    textAdConfig: config.adType === 'text' ? config.textAdConfig : undefined,
  };
}

// ---------------------------------------------------------------------------
// Text Ad Copy Generation — GPT-powered suggestions for text-only ad images
// ---------------------------------------------------------------------------

export interface TextAdCopyResult {
  primaryTexts: CopyOption[];
  highlightTexts: CopyOption[];
  anchorTexts: CopyOption[];
}

/**
 * Generate text-ad-optimized copy suggestions.
 * Produces bold promise/guarantee-style text specifically designed for
 * rendering as text-only ad images (not standard ad headlines).
 */
export async function generateTextAdCopy(config: {
  audienceType: AudienceType;
  conceptType: ConceptType;
  analysisData: ChannelAnalysisResult | null;
  reasoningEffort?: ReasoningEffort;
  productContext?: ProductContext;
  businessType?: import('../types/organization').BusinessType;
}): Promise<TextAdCopyResult> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const reasoningEffort = config.reasoningEffort ?? 'medium';
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const analysis = config.analysisData;

  let contextSection = '';

  // Inject channel analysis if available
  if (analysis) {
    contextSection += `
=== PERFORMANCE CONTEXT ===
${analysis.executiveSummary || ''}

Health Score: ${analysis.overallHealthScore}/10
Top performing patterns from this account inform the suggestions below.
`;
    if (analysis.winningPatterns) {
      const wp = analysis.winningPatterns;
      if (wp.headlines?.length) contextSection += `\nWinning headline patterns: ${wp.headlines.join('; ')}`;
      if (wp.emotionalTriggers?.length) contextSection += `\nEmotional triggers that work: ${wp.emotionalTriggers.join('; ')}`;
    }
  }

  // Inject product context if available
  if (config.productContext) {
    contextSection += `
=== PRODUCT/SERVICE ===
Name: ${config.productContext.name}
${config.productContext.author ? `By: ${config.productContext.author}` : ''}
${config.productContext.description || ''}
`;
  }

  const systemPrompt = `You are an expert direct-response copywriter who specializes in TEXT-ONLY ad creatives for Meta (Facebook/Instagram) ads.

TEXT-ONLY ADS are images that contain ONLY bold text — no photographs, no graphics, just powerful words on a colored background. They work by conveying a clear, specific promise or outcome that stops the scroll.

Your job is to generate text suggestions for three sections of a text-only ad image:

1. PRIMARY TEXT (top of image) — The bold main hook. This is the first thing people see. Should be:
   - A clear, specific promise or action statement
   - Short enough to read in 1-2 seconds (ideally 3-8 words)
   - Written in second person ("We will..." / "Get..." / "Your...")
   - Example: "WE WILL RUN YOUR ADS" or "30 LEADS IN 30 DAYS"

2. HIGHLIGHT TEXT (middle banner) — The specific offer/outcome rendered on a contrasting dark banner. Should be:
   - A quantified promise with timeframe or specifics
   - More detailed than the primary text
   - Example: "GET 10-20 BOOKED CALLS EVERY 30 DAYS" or "DOUBLE YOUR REVENUE IN 90 DAYS"

3. ANCHOR TEXT (bottom) — A single trust-building word or short phrase. Should be:
   - 1-3 words maximum
   - Conveys guarantee, authority, or urgency
   - Example: "GUARANTEED" or "RISK-FREE" or "LIMITED SPOTS"

IMPORTANT RULES:
- This is for ${btConfig.conversionNoun.toLowerCase()} generation (${btConfig.aiConversionLanguage})
- Write for ${audienceAngle.awarenessLevel} audiences (${audienceAngle.focus})
- Be SPECIFIC with numbers, timeframes, and outcomes — vague promises don't stop the scroll
- Avoid AI-sounding phrases: no "unlock", "revolutionize", "game-changer", "transform your"
- Write like a direct-response marketer, not a brand copywriter
- All text will be rendered in ALL CAPS, so write naturally and the system will uppercase it
${contextSection}

Respond in JSON format:
{
  "primaryTexts": [
    { "id": "p1", "text": "...", "rationale": "..." },
    { "id": "p2", "text": "...", "rationale": "..." },
    { "id": "p3", "text": "...", "rationale": "..." },
    { "id": "p4", "text": "...", "rationale": "..." }
  ],
  "highlightTexts": [
    { "id": "h1", "text": "...", "rationale": "..." },
    { "id": "h2", "text": "...", "rationale": "..." },
    { "id": "h3", "text": "...", "rationale": "..." }
  ],
  "anchorTexts": [
    { "id": "a1", "text": "...", "rationale": "..." },
    { "id": "a2", "text": "...", "rationale": "..." },
    { "id": "a3", "text": "...", "rationale": "..." }
  ]
}`;

  const response = await callOpenAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate text-only ad copy suggestions for a ${config.audienceType} ${btConfig.conversionNoun.toLowerCase()} campaign using a ${config.conceptType === 'auto' ? 'data-driven' : config.conceptType.replace(/_/g, ' ')} angle.` },
    ],
    { reasoningEffort, maxTokens: 2000 },
  );

  // Parse response
  let cleanedResponse = response.trim();
  if (cleanedResponse.startsWith('```json')) cleanedResponse = cleanedResponse.slice(7);
  if (cleanedResponse.startsWith('```')) cleanedResponse = cleanedResponse.slice(3);
  if (cleanedResponse.endsWith('```')) cleanedResponse = cleanedResponse.slice(0, -3);

  try {
    const parsed = JSON.parse(cleanedResponse.trim());

    // Sanitize all text
    for (const item of [...(parsed.primaryTexts || []), ...(parsed.highlightTexts || []), ...(parsed.anchorTexts || [])]) {
      if (item.text) item.text = sanitizeCopyText(item.text);
    }

    return {
      primaryTexts: parsed.primaryTexts || [],
      highlightTexts: parsed.highlightTexts || [],
      anchorTexts: parsed.anchorTexts || [],
    };
  } catch (error: unknown) {
    console.error('Failed to parse text ad copy:', error);
    throw new Error('Failed to generate text ad copy suggestions');
  }
}
