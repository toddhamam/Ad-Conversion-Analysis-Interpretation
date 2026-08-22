// OpenAI API Service for Ad Analysis and Interpretation
console.log('🤖 openaiApi.ts loaded at', new Date().toISOString());

// Import image cache for using captured reference images
// Reference SELECTION now lives in services/referenceSet.ts — this module only needs the
// direct cache reads that the analysis paths do.
import { getCachedImage, storeImageFromUrl } from './imageCache';
import { isEmbeddingAvailable, embedMultimodal, pairwiseSimilarityMatrix, kMeansClustering, findOptimalK, cosineSimilarity } from './embeddingService';
import { getEmbedding, setEmbedding } from './embeddingStore';
import { getAuthToken } from '../lib/authToken';
import { getBusinessTypeConfig, getCampaignIntentConfig } from '../lib/businessTypeConfig';
import { META_AD_POLICY_PROMPT, IMAGE_SAFETY_DIRECTIVE, POLICY_SANITIZE_PATTERNS } from './adPolicyGuard';
import { buildAnalysisContextString, condensedCopyFor, healthScoreLine } from './analysisContext';
import { isValidHook, isValidAngle, DEFAULT_GRID_ANGLES, DEFAULT_GRID_HOOKS, HOOKS, HOOK_PROMPT_MENU, HOOK_LABELS, slugifyCallout, type HookType, type AxisTag, type GridAngle, type FormatType } from '../lib/axisTags';
import { buildReferenceBlock, type StyleReference } from '../lib/referenceProvenance';
import { resolveReferenceSet, projectProductImages } from './referenceSet';
import { mergeStyleDescriptors, isDescriptorCacheEnabled, isUsableDescriptor, type StyleDescriptor } from '../lib/styleDescriptor';

// ─── OpenAI API Calls ───────────────────────────────────────────────────────
// All OpenAI calls route through the backend proxy (/api/ai/*) so the API key
// never reaches the browser. The backend streams SSE to stay within Vercel's
// function timeout; this proxy reassembles the stream into a JSON response so
// callers can use `await res.json()` as before.

async function openaiProxy(
  endpoint: 'chat' | 'images',
  body: Record<string, unknown>
): Promise<Response> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('AI API not configured. Please sign in and try again.');
  }

  const res = await fetch(`/api/ai/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // Images endpoint returns JSON directly — no reassembly needed
  if (endpoint === 'images') return res;

  // Error responses are JSON — pass through as-is
  if (!res.ok) return res;

  // Chat endpoint returns SSE stream — reassemble into a single JSON response
  // so callers can do `await response.json()` and get the standard OpenAI shape:
  // { choices: [{ message: { content }, finish_reason }], model, usage }
  if (!res.body) {
    return new Response(JSON.stringify({
      error: { message: 'Failed to read AI response stream' },
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let model = '';
  let finishReason = '';
  let usage: Record<string, unknown> | null = null;

  try {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            fullContent += parsed.choices[0].delta.content;
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
          if (parsed.model) model = parsed.model;
          if (parsed.usage) usage = parsed.usage;
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }
  } catch (err: unknown) {
    if (fullContent) {
      // Stream was interrupted (e.g. Vercel function timeout) — content is incomplete.
      // Mark as truncated so callOpenAI's finish_reason check can surface a proper error
      // instead of letting partial JSON silently fail during parsing.
      console.warn('⚠️ SSE stream interrupted, returning partial content as truncated');
      finishReason = 'length';
    } else {
      return new Response(JSON.stringify({
        error: { message: err instanceof Error ? err.message : 'AI stream failed' },
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const reassembled = {
    choices: [{
      message: { role: 'assistant', content: fullContent },
      finish_reason: finishReason || 'stop',
    }],
    model,
    usage,
  };

  return new Response(JSON.stringify(reassembled), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Google Gemini API Configuration
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// =============================================================================
// MODEL CONFIGURATION - Always use the latest available models
// =============================================================================
// GPT-5.5 is OpenAI's flagship model (released 2026-04-23) - reasoning is controlled via the
// reasoning.effort parameter (none/low/medium/high/xhigh). 1.05M context window, 128K max output.
// Drop-in API-compatible with GPT-5.4: same request shape, no breaking changes.
const DEFAULT_CHAT_MODEL = 'gpt-5.5'; // Latest GPT-5.5 with reasoning capabilities
const DEFAULT_VISION_MODEL = 'gpt-5.5'; // GPT-5.5 has multimodal vision support

// Reasoning configuration for GPT-5.5
// All OpenAI calls now route through the backend proxy (api/meta.ts) which has
// a 300-second Vercel function timeout. 'medium' keeps most calls well within
// that window; 'high'/'xhigh' may approach the limit on complex prompts.
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';
const ANALYSIS_REASONING_EFFORT: ReasoningEffort = 'medium';

// ── AI provider routing ──────────────────────────────────────────────────────
// The backend (`/api/ai/chat`) speaks one OpenAI-shaped dialect but can serve it from
// either OpenAI or Anthropic (Claude). Whichever provider goes first, the other is used
// automatically as a fallback when the first can't serve the request — exhausted
// credits, rate limit, invalid key, retired model, outage. So a single provider running
// out of credits no longer takes ConversionIQ™ down.
//
// ConversionIQ™ ANALYSIS + INTERPRETATION is routed to Claude (Fable 5) first: these are
// one-off, deep-reasoning runs that only happen when a meaningful batch of new ad data
// has landed, so the highest-reasoning tier is worth it. Generation paths (copy, grid,
// creative) stay on OpenAI first — they run constantly and are tuned for GPT.
type AIProviderPreference = 'openai' | 'anthropic';
const ANALYSIS_PROVIDER: AIProviderPreference = 'anthropic';

// Image Generation - Gemini models with automatic fallback
// Primary: gemini-3-pro-image-preview (highest quality)
// Fallback: gemini-3.1-flash-image-preview (faster, more reliable during high demand)
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const FALLBACK_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
// Multimodal model for reference-image analysis — reads creative style from reference images and
// returns a text analysis (image-GENERATION models are unreliable for text output, so we use a
// general model here). Gemini 3.5 Flash (GA, Google I/O 2026): natively multimodal, a major quality
// jump over 2.5 Flash for reading creative, and the flash tier keeps the per-generation step fast.
const TEXT_ANALYSIS_MODEL = 'gemini-3.5-flash';

// OpenAI image generation models — gpt-image-2 is the new flagship (Apr 21, 2026)
// with native reasoning, 2K resolution, and multi-image consistency.
// gpt-image-1 is the GA fallback if gpt-image-2 is unavailable.
const GPT_IMAGE_PRIMARY = 'gpt-image-2';
const GPT_IMAGE_FALLBACK = 'gpt-image-1';

// User-selectable image generation provider
export type ImageModel = 'gemini' | 'openai';
export const DEFAULT_IMAGE_MODEL_PROVIDER: ImageModel = 'gemini';

// Product fidelity gate — when a product mockup is attached, every generated image is
// inspected (Gemini flash vision compare vs the mockup) and regenerated ONCE with
// corrective feedback if the product-match score falls below the threshold. The score is
// surfaced on the ad card so weak replicas are visible even when the retry doesn't pass.
const FIDELITY_GATE_THRESHOLD = 75;

// Video Generation - Using Google Veo 3.1
// Only 'veo-3.1-generate-preview' is documented in the official Gemini API docs.
const VEO_MODEL = 'veo-3.1-generate-preview';
const USE_VEO_FOR_VIDEO = true; // Use Veo instead of storyboard-only

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
  // gpt-image-1 / gpt-image-2 supported sizes
  gptImageSize: '1024x1024' | '1536x1024' | '1024x1536';
  icon: string;
}

export const IMAGE_SIZE_OPTIONS: ImageSizeConfig[] = [
  {
    id: '1:1',
    name: 'Square',
    description: 'Feed ads, Instagram posts',
    dimensions: '1080×1080',
    gptImageSize: '1024x1024',
    icon: '⬜',
  },
  {
    id: '16:9',
    name: 'Landscape',
    description: 'Link ads, Facebook feed',
    dimensions: '1920×1080',
    gptImageSize: '1536x1024',
    icon: '🖼️',
  },
  {
    id: '9:16',
    name: 'Portrait/Story',
    description: 'Stories, Reels',
    dimensions: '1080×1920',
    gptImageSize: '1024x1536',
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

/**
 * Specificity + numerals guidance — one source of truth injected into every copy-generation
 * prompt so the rule can't drift between single-mode, grid, reroll, and audience paths.
 *
 * The old rule listed "a number" as the FIRST way to be specific and demanded a concrete element
 * in every headline. Since a headline is only ~40 chars, the model satisfied that the cheapest way:
 * it jammed a bare digit into every cell — filler like "1 loop" / "3 steps", often tacked onto the
 * end ("...trigger 1"). This decouples specificity from literal numbers and makes numerals the
 * exception (spelled as words for small counts; digits reserved for genuine stats).
 */
const SPECIFICITY_PROMPT = `SPECIFICITY: Ground the copy in something concrete — a named outcome, a vivid mechanism, a real timeframe, or genuine proof. Body copy must carry at least one concrete element; a headline must be specific in MEANING but does NOT need to contain a number.
NUMBERS — USE SPARINGLY: Never insert a number just to sound specific, and never end a headline with a bare count (e.g. "...trigger 1", "...thought 1"). Most lines should contain NO number — use one only where it works as real proof, a price, a percentage, or a timeframe. When a small count is genuinely needed, spell it as a word (one, two, three); reserve digits for real statistics, percentages, prices, and timeframes (e.g. "40%", "$97", "14 days").`;

/**
 * First-person / no-byline voice rule — one source of truth injected into every product-aware copy
 * path (single-mode, grid, reroll) so it can't drift between them.
 *
 * Fixes the artifact where the model, told it "MUST reference '<product>' by <author>", stamped a
 * third-person byline into otherwise first-person copy — e.g. "In <Title> by <Author>, I map…". The
 * author IS the speaker; their name tells the model WHOSE voice to write in, it is not a credit to
 * print in the ad. The customer-testimonial carve-out keeps real third-party quotes attributed.
 */
const AUTHOR_VOICE_PROMPT = `VOICE — SPEAK AS THE CREATOR, DIRECTLY TO THE READER: Write as the product's own creator talking straight to one person ("I" to "you"), like a personal message — never an announcement about someone else. NEVER name the creator/author in the third person, NEVER print a credit or byline such as "by <author>", and never open with "In <product> by <author>, I…". The reader must feel the author is talking to them, not reading about the author. The ONLY third-person voice allowed is a REAL customer testimonial — quote it verbatim and keep its own attribution (e.g. "— Sarah M."); never rewrite a customer's quote into first person.`;

/**
 * Promise/outcome clarity — a baseline QUALITY floor, deliberately written to DEFER to the angle
 * (emotional frame) and hook (opening line) so it raises clarity without homogenizing the grid.
 * "Concrete" means the promise is real and specific, NOT that it must lead or be fully revealed —
 * curiosity / contrarian / cognitive-dissonance cells keep their gap. Sits beside the DIVERSITY rule.
 */
const PROMISE_OUTCOME_PROMPT = `PROMISE & OUTCOME — CONCRETE, NEVER VAGUE: Every ad must resolve to one real, specific promise — a tangible outcome the reader gets, not a vague label ("clarity", "no more guesswork", "confidence"). This is a CLARITY FLOOR, not a structure: the ANGLE owns the emotional frame and the HOOK owns the opening line, and they take priority on placement and pacing. Do NOT force the promise into the first line or reuse the same promise-first shape across cells. Hooks and angles built on tension — a curiosity-gap question, a pattern interrupt, a contrarian or cognitive-dissonance frame — MUST keep their gap and tease or delay the payoff on purpose. "Concrete" means the promise underneath is real and earnable, not that every detail is spelled out up front. Never flatten distinct angles into the same generic outcome statement.`;

/** Escape a user-supplied string so it can be embedded literally inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
function sanitizeCopyText(text: string, opts?: { author?: string }): string {
  let cleaned = text.replace(/—/g, ',');
  for (const pattern of BANNED_PHRASE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Policy compliance: strip phrases that violate Meta Advertising Standards
  for (const pattern of POLICY_SANITIZE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Deterministic backstop for the third-person author byline the model slips into first-person
  // copy (e.g. "In <Title> by Todd Hamam, I map…" → "In <Title>, I map…"). The prompt forbids this
  // (see AUTHOR_VOICE_PROMPT) but the rule isn't reliable, so we strip it here too. Only the
  // high-confidence "by <author>" forms are removed, which keeps the surrounding grammar intact.
  const author = opts?.author?.trim();
  if (author) {
    const a = escapeRegExp(author);
    cleaned = cleaned
      .replace(new RegExp(`\\s*\\(\\s*by\\s+${a}\\s*\\)`, 'gi'), '') // "(by Todd Hamam)"
      .replace(new RegExp(`,?\\s*\\bby\\s+${a}\\b`, 'gi'), '')       // "… by Todd Hamam"
      // Tidy punctuation/spacing left behind by the removal
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,.])/g, '$1')
      .replace(/,\s*([,.])/g, '$1')
      .replace(/^[\s,]+/, '');
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
// Veo 3.1 natively supports only 16:9 and 9:16. The 4:5 option generates at
// 9:16 and crops client-side to 1080×1350 — the optimal Meta feed aspect ratio.
export type VideoAspectRatio = '4:5' | '16:9' | '9:16';
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
    id: '4:5',
    name: 'Meta Feed',
    description: 'Optimal for Facebook & Instagram feed',
    dimensions: '1080×1350',
    icon: '📐',
  },
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
  { id: 'standard', name: 'Standard', description: 'High quality with native audio', costPerSec: 0.15 },
];

export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  aspectRatio: '4:5',
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

export type SpellingLocale = 'US' | 'UK' | 'AU' | 'CA';
export type EmojiPolicy = 'none' | 'sparing' | 'liberal';

/**
 * A real customer testimonial the user supplied (the "top 5" social-proof corpus).
 *
 * These are REAL words and are fed to the copywriter to be quoted VERBATIM — they replace the
 * AI's tendency to invent fake named testimonials (e.g. "Sarah went from X to Y"). Only `approved`
 * testimonials are ever serialized into a prompt (see buildTestimonialContextString), so the user
 * explicitly attests they have the rights to use the quote and that it is accurate.
 */
export interface Testimonial {
  id: string;
  quote: string;          // REQUIRED — the customer's verbatim words (quoted exactly in copy)
  attribution?: string;   // who said it: "Sarah M.", "Sarah M., Austin TX", or "verified buyer"
  result?: string;        // optional structured outcome highlight, e.g. "down 15 lbs in 6 weeks"
  theme?: string;         // optional steer for angle-matching: "result" | "ease" | "skepticism" | "price" | ''
  approved?: boolean;     // compliance gate — user confirms rights to use + accuracy; only approved are used
}

/**
 * Per-ad-account, user-authored Brand Voice & Guidelines profile.
 *
 * This is the AUTHORITATIVE voice for the account — it is injected into every copy prompt and
 * overrides the voice the channel analysis infers from past ads (see buildBrandVoiceContextString
 * and the `demoteObservedVoice` path in buildAnalysisContextString). The voice/style fields mirror
 * the auto-extracted `ChannelAnalysisResult.brandVoice` shape so "Fill from analysis" maps 1:1.
 *
 * Stored per account in scoped localStorage (see lib/brandVoiceProfile.ts). Single object per account.
 */
export interface BrandVoiceProfile {
  id: string;
  enabled: boolean;   // master on/off — lets a user stage a profile before it goes live
  locked: boolean;    // when true, "Fill from analysis" / re-analysis must not overwrite the voice fields

  // — Voice & style (soft; mirrors the auto-extracted brandVoice schema) —
  voiceSummary: string;        // 1–3 sentence north star: who is writing and how they sound
  tonality: string;            // e.g. "Confident, warm, a little irreverent — never corporate"
  toneAvoid: string;           // what to NEVER sound like, e.g. "hypey, clinical, salesy"
  pointOfView: string;         // e.g. "First person (founder)" | "Second person (you/your)" | "We"
  readingLevel: string;        // e.g. "Grade 8" — controls vocabulary / jargon ceiling
  rhythm: string;              // cadence, e.g. "Staccato opener, longer middle, punchy close"
  signaturePhrases: string[];  // tics to weave in naturally — NOT forced into every ad

  // — Strategic substance (soft; auto-extraction never produces these) —
  avatar: string;              // the ICP: who they are, their pain, desire, and #1 objection
  bigIdea: string;             // the unique mechanism / core promise the brand leads with
  testimonials: Testimonial[]; // the top ~5 real customer testimonials — quoted verbatim for social-proof angles

  // — Hard guardrails (v1: prompt-enforced; deterministic enforcement is a later pass) —
  spellingLocale: SpellingLocale;
  bannedWords: string[];       // brand-specific, stacked ON TOP of the global BANNED_PHRASES
  requiredDisclaimers: string[]; // text that must appear verbatim in body copy
  emojiPolicy: EmojiPolicy;

  createdAt: string;
  updatedAt: string;
}

// Check if Gemini API is configured
export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY.length > 0;
}

if (import.meta.env.DEV) {
  console.log('🤖 Using models:', {
    chat: DEFAULT_CHAT_MODEL,
    vision: DEFAULT_VISION_MODEL,
    image: `Gemini ${DEFAULT_IMAGE_MODEL}`,
    video: USE_VEO_FOR_VIDEO ? `Veo ${VEO_MODEL}` : 'Storyboard only'
  });
  console.log('🎨 Gemini API Key:', GEMINI_API_KEY ? 'configured' : 'NOT CONFIGURED');
}

// Check if OpenAI is configured (backend proxy available when Supabase auth is configured)
export function isOpenAIConfigured(): boolean {
  return !!import.meta.env.VITE_SUPABASE_URL;
}

// Log configuration status
console.log('🔑 OpenAI API: backend proxy mode (key stays server-side)');

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
  detectedConversionType?: 'purchase' | 'lead' | 'both' | 'none';
  purchaseConversions?: number;
  leadConversions?: number;
  adName?: string;        // Meta ad name (carries the axis tag, if present)
  axisTag?: AxisTag;      // parsed creative-axis tag from the ad name
}

// Per-axis performance rollup (BlitzScale "read winners by axis")
export interface AxisStat {
  key: string;
  label: string;
  adCount: number;
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
  ctr: number;   // %
  cvr: number;   // %
  cpa: number;
}
export interface AxisInsights {
  byAngle: AxisStat[];
  byHook: AxisStat[];
  byFormat: AxisStat[];
  /**
   * Per-avatar-callout performance. OPTIONAL and absent (not empty) when no ad in the window
   * carried a callout — AxisInsights is embedded in the persisted ChannelAnalysisResult, so
   * cached records predate this field entirely.
   */
  byCallout?: AxisStat[];
  winningAngle?: string;
  winningHook?: string;
  winningFormat?: string;
  winningCallout?: string;
  taggedAdCount: number;
  untaggedAdCount: number;
}

// aggregateByAxis() (computes AxisInsights from axis-tagged ads) lives in ./axisAnalytics.ts —
// it's pure analytics with no AI, so it stays out of this module.

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
  | 'authority'
  | 'pain'
  | 'contrarian_pov';

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
  },
  pain: {
    name: 'Pain Point',
    icon: '◍',
    description: 'Name a specific frustration the prospect is living with so they feel understood',
    visualDirection: 'The problem made visceral — the frustrating moment, the stuck state, the cost of doing nothing',
    messagingStyle: 'Name the specific frustration precisely; make them nod before any pitch. Specific over vague.',
    promptHints: ['stuck at', 'every time you', 'the real reason', 'you keep', 'that frustrating moment']
  },
  contrarian_pov: {
    name: 'Contrarian POV',
    icon: '⟂',
    description: 'Lead with a non-obvious belief that reframes the problem and pre-sells the offer',
    visualDirection: 'Bold statement-driven visuals, myth-vs-reality contrasts, a confident challenge to conventional wisdom',
    messagingStyle: 'Teach a contrarian worldview; disagree with what the industry preaches. The frame pre-sells the offer.',
    promptHints: ['most people think', 'what\'s really happening', 'the truth nobody', 'stop doing', 'it\'s not what you think']
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
  pain: {
    prospecting: 'Name the PROBLEM precisely -- the specific frustration they live with right now. Make them feel understood before any solution. The reader does not know the product yet.',
    retargeting: 'Name the frustration that REMAINS because they have not acted -- connect the unsolved pain to the specific solution they already saw. Use the actual product name.',
    retention: 'Name the NEXT-LEVEL frustration -- the ceiling they hit even after solving the first problem. The pain the upgrade resolves. Use the actual product name.',
  },
  contrarian_pov: {
    prospecting: 'Challenge a belief the prospect or the industry holds, with NO product mention -- the reframe itself earns the click. "Most people think X. Here is what is really going on."',
    retargeting: 'Use the contrarian frame to dismantle the #1 objection keeping them from acting -- reframe the hesitation as the old way of thinking. Use the actual product name.',
    retention: 'Reframe what "good enough" means for an existing customer -- the contrarian take is that staying put is the real risk. Position the upgrade as the obvious next move. Use the actual product name.',
  },
};

export interface GeneratedImageResult {
  imageUrl: string;
  revisedPrompt: string;
  fidelityScore?: number;    // 0-100 product-match score from the fidelity gate (mockup ads only)
  fidelityIssues?: string[]; // Specific product mismatches found by the gate (empty when clean)
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
  campaignIntent?: import('../types/organization').CampaignIntent; // Hybrid: purchase or lead intent
  headlineHooks?: (HookType | null)[]; // hook label per copy.headlines entry (for per-ad axis tagging)
  axisTag?: AxisTag;      // Creative-axis tag {angle,hook,format} — grid mode or synthesized from conceptType
  corePromise?: string;   // The single idea this batch lives inside (BlitzScale grid)
}

// Copy Options for multi-step generation
export interface CopyOption {
  id: string;
  text: string;
  rationale: string;
  hook?: HookType; // labeled scroll-stopper type (headlines only)
}

export interface CopyOptionsResult {
  headlines: CopyOption[];
  bodyTexts: CopyOption[];
  callToActions: CopyOption[];
}

// ─── BlitzScale Grid (Angle × Hook matrix) ──────────────────────────────────

// One cell of the grid = a complete creative for a specific (angle, hook) combination.
export interface GridCell {
  id: string;
  angle: GridAngle;
  hook: HookType;
  headline: string;
  body: string;
  cta: string;
  rationale: string;
  /**
   * Avatar callout line for callout-matrix grids. When set, this is the text rendered ONTO
   * the shared base image and the value that becomes the `c:` attribution axis. Absent for
   * ordinary angle x hook grids.
   */
  callout?: string;
}

// (Hook descriptions live in HOOKS in axisTags.ts — single source of truth.)

/**
 * Make a request to OpenAI API (text-only)
 */
async function callOpenAI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    model?: string;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
    responseFormat?: { type: 'json_object' } | { type: 'text' };
    provider?: AIProviderPreference;
  } = {}
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const {
    model = DEFAULT_CHAT_MODEL,
    maxTokens = 2000,
    reasoningEffort = DEFAULT_REASONING_EFFORT,
    responseFormat,
    provider
  } = options;

  console.log('🤖 Calling AI API with model:', model, provider ? `| provider: ${provider}` : '');
  console.log('🧠 Reasoning effort:', reasoningEffort);

  // GPT-5.4 with reasoning_effort only supports temperature=1 (default)
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
  };

  // Backend routing hint — picks the primary provider. Stripped before the
  // request is forwarded upstream; the other provider remains the fallback.
  if (provider) {
    requestBody.ci_provider = provider;
  }

  // Add response_format if specified — forces model to output valid JSON
  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  let response = await openaiProxy('chat', requestBody);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI API Error Status:', response.status);
    console.error('❌ OpenAI API Error Text:', errorText);

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
          throw new Error(`AI service error (retry): ${retryErrorText.substring(0, 200)}`);
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
        throw new Error(`AI service error: ${errorMessage}`);
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
      throw new Error(`AI service error: ${errorMessage}`);
    }
  }

  const data = await response.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  const usage = data.usage;
  if (import.meta.env.DEV) {
    console.log('✅ OpenAI response received | finish_reason:', finishReason);
    if (usage) {
      const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
      const outputTokens = usage.completion_tokens - reasoningTokens;
      console.log(`📊 Tokens — reasoning: ${reasoningTokens}, output: ${outputTokens}, total completion: ${usage.completion_tokens}/${maxTokens}`);
    }
  }

  if (finishReason === 'length') {
    console.warn('⚠️ Response truncated — max_completion_tokens exhausted. Reasoning tokens consumed too much of the budget.');
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
 * Make a request to OpenAI API with vision/image support
 */
async function callOpenAIWithVision(
  messages: ChatMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    reasoningEffort?: ReasoningEffort;
    responseFormat?: { type: 'json_object' } | { type: 'text' };
    provider?: AIProviderPreference;
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
    responseFormat,
    provider
  } = options;

  console.log('🖼️ Calling AI Vision API with model:', model, provider ? `| provider: ${provider}` : '');
  console.log('🧠 Reasoning effort:', reasoningEffort);
  console.log('📸 Processing images for analysis...');

  // GPT-5.4 with reasoning_effort only supports temperature=1 (default)
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
  };

  // Backend routing hint — picks the primary provider. Stripped before the
  // request is forwarded upstream; the other provider remains the fallback.
  if (provider) {
    requestBody.ci_provider = provider;
  }

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
  ], { maxTokens: 8192, reasoningEffort, responseFormat: { type: 'json_object' }, provider: ANALYSIS_PROVIDER });

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

    let analysis;
    try {
      analysis = JSON.parse(cleanedResponse.trim());
    } catch {
      const repaired = attemptJsonRepair(cleanedResponse);
      if (repaired) {
        console.warn('⚠️ Ad analysis JSON truncated — repaired');
        analysis = JSON.parse(repaired);
      } else {
        throw new Error('JSON parse failed and repair unsuccessful');
      }
    }
    return {
      adId: ad.id,
      ...analysis,
    };
  } catch (error) {
    console.error('❌ Failed to parse OpenAI response:', error);
    console.error('Raw response (first 500 chars):', response.substring(0, 500));
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
  ], { maxTokens: 8192, responseFormat: { type: 'json_object' }, provider: ANALYSIS_PROVIDER });

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

    try {
      return JSON.parse(cleanedResponse.trim());
    } catch {
      const repaired = attemptJsonRepair(cleanedResponse);
      if (repaired) {
        console.warn('⚠️ Campaign insights JSON truncated — repaired');
        return JSON.parse(repaired);
      }
      throw new Error('JSON parse failed and repair unsuccessful');
    }
  } catch (error) {
    console.error('❌ Failed to parse campaign insights:', error);
    throw new Error('Failed to parse campaign insights response');
  }
}

// Channel-wide analysis types
export interface ChannelAnalysisResult {
  channelName: string;
  analyzedAt: string;

  // How this analysis was produced — observed (live ads), seeded (manual seed, no ad history),
  // or hybrid (both). Absent on records written before modes existed; those are observed.
  // This is the ONLY mode-related fact stored: evidence labelling, section titles and health-score
  // applicability are all derived from it at the point of use. See lib/analysisMode.ts.
  analysisMode?: import('../lib/analysisMode').AnalysisMode;

  // Constraints carried over from a manual seed (voice, banned vocabulary, claim guardrails).
  // Present in seeded and hybrid modes — these survive a hybrid run instead of being discarded.
  seedConstraints?: import('../lib/analysisMode').SeedConstraints;

  // Executive Summary
  executiveSummary: string;
  /**
   * 1-10. `null` means NOT APPLICABLE — a seeded account has no delivery data, and a number here
   * would be scoring the absence of data rather than the quality of anything.
   */
  overallHealthScore: number | null;

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

  /**
   * In `hybrid` mode the seed's operator-asserted voice takes the authoritative `brandVoice` slot
   * and the voice extracted from winning ads is preserved here as supporting evidence.
   */
  observedBrandVoice?: {
    tonality: string;
    sentenceStyle: string;
    pointOfView: string;
    vocabularyLevel: string;
    rhythmAndCadence: string;
    distinctiveTraits: string[];
  };

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

  // Axis-level attribution (BlitzScale grid) — computed in code, attached after analysis
  axisInsights?: AxisInsights;

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

  // Creative Fatigue Detection (embedding-based)
  creativeFatigue?: {
    score: number;              // 0-100 (0 = diverse, 100 = all ads identical)
    label: 'Low' | 'Moderate' | 'High' | 'Severe';
    avgPairwiseSimilarity: number;
    mostSimilarPair?: { adId1: string; adId2: string; similarity: number; headline1: string; headline2: string };
    leastSimilarPair?: { adId1: string; adId2: string; similarity: number; headline1: string; headline2: string };
    recommendation: string;
    adsEmbedded: number;
    adsSkipped: number;
  };

  // Visual Clustering (embedding-based)
  visualClusters?: Array<{
    clusterId: number;
    styleDescription: string;
    adCount: number;
    adIds: string[];
    avgConversionRate: number;
    avgCPA: number;
    topPerformerHeadline: string;
    representativeAdId?: string;
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
  const isHybrid = options?.businessType === 'hybrid';
  const totalSpend = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const totalConversions = ads.reduce((sum, ad) => sum + ad.conversions, 0);
  const avgConversionRate = ads.reduce((sum, ad) => sum + ad.conversionRate, 0) / ads.length;
  const avgCostPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Sort ads by conversion rate
  const sortedAds = [...ads].sort((a, b) => b.conversionRate - a.conversionRate);

  // For hybrid: split into per-intent cohorts to avoid CVR scale bias
  // (lead ads ~15% CVR vs purchase ads ~5% CVR would bias rankings)
  let purchaseAds: AdCreativeData[] = [];
  let leadAds: AdCreativeData[] = [];
  if (isHybrid) {
    purchaseAds = ads.filter(ad => ad.detectedConversionType === 'purchase' || ad.detectedConversionType === 'both');
    leadAds = ads.filter(ad => ad.detectedConversionType === 'lead');
    // Ads with no detected type go into purchase cohort (conservative default)
    const untyped = ads.filter(ad => !ad.detectedConversionType || ad.detectedConversionType === 'none');
    purchaseAds = [...purchaseAds, ...untyped];
  }

  // Classify performance tiers
  const highPerformers = sortedAds.filter(ad => ad.conversionRate > avgConversionRate * 1.5);
  const lowPerformers = sortedAds.filter(ad => ad.conversionRate < avgConversionRate * 0.5);
  const midPerformers = sortedAds.filter(ad =>
    ad.conversionRate >= avgConversionRate * 0.5 && ad.conversionRate <= avgConversionRate * 1.5
  );

  // Get top 5 and bottom 5 for detailed analysis
  // For hybrid: rank within each cohort separately to avoid CVR scale bias
  let top5: AdCreativeData[];
  let bottom5: AdCreativeData[];
  if (isHybrid && (purchaseAds.length > 0 || leadAds.length > 0)) {
    const sortedPurchase = [...purchaseAds].sort((a, b) => b.conversionRate - a.conversionRate);
    const sortedLead = [...leadAds].sort((a, b) => b.conversionRate - a.conversionRate);
    // Take top from each cohort proportionally
    const purchaseTop = sortedPurchase.slice(0, Math.min(5, sortedPurchase.length));
    const leadTop = sortedLead.slice(0, Math.min(5, sortedLead.length));
    top5 = [...purchaseTop, ...leadTop].slice(0, 10); // Up to 10 total for hybrid
    const purchaseBottom = sortedPurchase.slice(-Math.min(3, sortedPurchase.length)).reverse();
    const leadBottom = sortedLead.slice(-Math.min(3, sortedLead.length)).reverse();
    bottom5 = [...purchaseBottom, ...leadBottom].slice(0, 10);
  } else {
    top5 = sortedAds.slice(0, Math.min(5, sortedAds.length));
    bottom5 = sortedAds.slice(-Math.min(5, sortedAds.length)).reverse();
  }

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

  // Collect ads with images for visual analysis — interleave top and bottom performers
  // so the cap always includes both winners AND losers for comparison.
  // Filter out Facebook CDN URLs that require authentication.
  const filterAccessibleImages = (ad: AdCreativeData) => {
    if (!ad.imageUrl) return false;
    const isFacebookCdn = ad.imageUrl.includes('fbcdn.net') ||
                          ad.imageUrl.includes('facebook.com') ||
                          ad.imageUrl.includes('fb.com');
    if (isFacebookCdn) {
      console.log(`⚠️ Skipping Facebook CDN image for ad ${ad.id} - requires auth`);
      return false;
    }
    return true;
  };
  const topWithImages = top5.filter(filterAccessibleImages);
  const bottomWithImages = bottom5.filter(filterAccessibleImages);
  // Interleave: top1, bottom1, top2, bottom2, top3 — ensures both tiers represented
  const MAX_ANALYSIS_IMAGES = 10;
  const adsWithImages: AdCreativeData[] = [];
  const maxLen = Math.max(topWithImages.length, bottomWithImages.length);
  for (let i = 0; i < maxLen && adsWithImages.length < MAX_ANALYSIS_IMAGES; i++) {
    if (i < topWithImages.length && adsWithImages.length < MAX_ANALYSIS_IMAGES) {
      adsWithImages.push(topWithImages[i]);
    }
    if (i < bottomWithImages.length && adsWithImages.length < MAX_ANALYSIS_IMAGES) {
      adsWithImages.push(bottomWithImages[i]);
    }
  }

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
  // Build hybrid-specific context block
  const hybridContext = isHybrid ? `
HYBRID BUSINESS MODEL:
This ad account runs BOTH e-commerce purchase campaigns AND lead generation campaigns.
- Purchase campaigns (${purchaseAds.length} ads): Optimize for completed sales. Benchmark winning CVR: ~5%+
- Lead gen campaigns (${leadAds.length} ads): Optimize for form fills, booked calls, opt-ins. Benchmark winning CVR: ~15%+

IMPORTANT: Ads are ranked within their own cohort (purchase vs lead) to avoid CVR scale bias.
Analyze each cohort against its own benchmarks. Identify:
1. Cross-cutting patterns that work across BOTH funnels
2. Patterns unique to purchase campaigns
3. Patterns unique to lead gen campaigns
` : '';

  // Format per-ad line with optional conversion type for hybrid
  const formatAdLine = (ad: AdCreativeData) => {
    const typeLabel = isHybrid && ad.detectedConversionType
      ? ` | Type: ${ad.detectedConversionType}`
      : '';
    return `- "${ad.headline}" | CVR: ${ad.conversionRate.toFixed(2)}% | Ad ${ad.id} | AdSet: ${ad.adsetName}${typeLabel}`;
  };

  const formatAdDetail = (ad: AdCreativeData, i: number) => {
    const typeLabel = isHybrid && ad.detectedConversionType
      ? `\n   Conversion Type: ${ad.detectedConversionType}`
      : '';
    return `
${i + 1}. Ad ID: ${ad.id}
   Headline: "${ad.headline}"
   Body: "${ad.bodyText}"
   Campaign: ${ad.campaignName}
   Ad Set: ${ad.adsetName}${typeLabel}
   CVR: ${ad.conversionRate.toFixed(2)}% | Spend: $${ad.spend.toFixed(2)} | Conversions: ${ad.conversions}
`;
  };

  // For hybrid: build cohort-separated top/bottom sections
  let topBottomSection: string;
  if (isHybrid && purchaseAds.length > 0 && leadAds.length > 0) {
    const sortedPurchase = [...purchaseAds].sort((a, b) => b.conversionRate - a.conversionRate);
    const sortedLead = [...leadAds].sort((a, b) => b.conversionRate - a.conversionRate);
    const purchaseTop5 = sortedPurchase.slice(0, Math.min(5, sortedPurchase.length));
    const purchaseBottom5 = sortedPurchase.slice(-Math.min(3, sortedPurchase.length)).reverse();
    const leadTop5 = sortedLead.slice(0, Math.min(5, sortedLead.length));
    const leadBottom5 = sortedLead.slice(-Math.min(3, sortedLead.length)).reverse();

    topBottomSection = `
**=== PURCHASE CAMPAIGN PERFORMANCE ===**

**TOP PURCHASE ADS (ranked by purchase CVR):**
${purchaseTop5.map((ad, i) => formatAdDetail(ad, i)).join('')}

**BOTTOM PURCHASE ADS:**
${purchaseBottom5.map((ad, i) => formatAdDetail(ad, i)).join('')}

**=== LEAD GEN CAMPAIGN PERFORMANCE ===**

**TOP LEAD GEN ADS (ranked by lead CVR):**
${leadTop5.map((ad, i) => formatAdDetail(ad, i)).join('')}

**BOTTOM LEAD GEN ADS:**
${leadBottom5.map((ad, i) => formatAdDetail(ad, i)).join('')}`;
  } else {
    topBottomSection = `
**TOP ${isHybrid ? '' : '5 '}ADS - DETAILED:**
${top5.map((ad, i) => formatAdDetail(ad, i)).join('')}

**BOTTOM ${isHybrid ? '' : '5 '}ADS - DETAILED:**
${bottom5.map((ad, i) => formatAdDetail(ad, i)).join('')}`;
  }

  const analysisPrompt = `
BUSINESS CONTEXT:
${btConfig.aiConversionLanguage}
${hybridContext}
**ACCOUNT OVERVIEW:**
- Total Ads: ${ads.length}
- Total Spend: $${totalSpend.toFixed(2)}
- Total Conversions: ${totalConversions}${isHybrid ? ` (${purchaseAds.filter(a => a.conversions > 0).length} purchase ads, ${leadAds.filter(a => a.conversions > 0).length} lead ads)` : ''}
- Average CVR: ${avgConversionRate.toFixed(2)}%
- High Performers: ${highPerformers.length} | Mid: ${midPerformers.length} | Low: ${lowPerformers.length}
${!hasAccessibleImages ? '\n⚠️ NOTE: Ad images are on Facebook CDN (requires auth). Provide analysis based on copy patterns and inferred visual strategies.' : ''}
${topBottomSection}

**SAME HEADLINE, DIFFERENT PERFORMANCE (IMAGE/TARGETING IS THE DIFFERENTIATOR):**
${sameHeadlineDifferentPerformance.length > 0 ? sameHeadlineDifferentPerformance.map(group => `
Headline: "${group.headline}"
- Best: ${group.best.conversionRate.toFixed(2)}% CVR (Ad ${group.best.id}, AdSet: ${group.best.adsetName})
- Worst: ${group.worst.conversionRate.toFixed(2)}% CVR (Ad ${group.worst.id}, AdSet: ${group.worst.adsetName})
- Gap: ${group.performanceDiff.toFixed(2)}% difference across ${group.ads.length} variations
`).join('') : 'No headlines with multiple variations found.'}

**ADS PERFORMANCE (sorted by CVR):**
${(() => {
    // Send top 25 + bottom 25 for deep analysis. Middle-tier ads add noise
    // without analytical signal — aggregate stats suffice.
    const MAX_ADS_PER_TAIL = 25;
    if (sortedAds.length <= MAX_ADS_PER_TAIL * 2) {
      // Small enough to send everything
      return sortedAds.map(ad => formatAdLine(ad)).join('\n');
    }
    const topSlice = sortedAds.slice(0, MAX_ADS_PER_TAIL);
    const bottomSlice = sortedAds.slice(-MAX_ADS_PER_TAIL);
    const middleSlice = sortedAds.slice(MAX_ADS_PER_TAIL, -MAX_ADS_PER_TAIL);
    const middleAvgCVR = middleSlice.reduce((s, a) => s + a.conversionRate, 0) / middleSlice.length;
    const middleTotalSpend = middleSlice.reduce((s, a) => s + a.spend, 0);
    const middleTotalConversions = middleSlice.reduce((s, a) => s + a.conversions, 0);
    return [
      '--- TOP 25 ---',
      ...topSlice.map(ad => formatAdLine(ad)),
      '',
      `--- MIDDLE TIER (${middleSlice.length} ads omitted for brevity) ---`,
      `Avg CVR: ${middleAvgCVR.toFixed(2)}% | Total Spend: $${middleTotalSpend.toFixed(2)} | Total Conversions: ${middleTotalConversions}`,
      '',
      '--- BOTTOM 25 ---',
      ...bottomSlice.map(ad => formatAdLine(ad)),
    ].join('\n');
  })()}

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
  ]${isHybrid ? `,
  "hybridInsights": {
    "purchasePatterns": "<patterns specific to purchase/e-commerce campaigns — what headlines, visuals, and psychology drive sales>",
    "leadPatterns": "<patterns specific to lead gen campaigns — what drives form fills, call bookings, opt-ins>",
    "crossCuttingPatterns": "<patterns that work across BOTH purchase and lead gen funnels>"
  }` : ''}
}

Return ONLY the JSON object, no additional text.`;

  imageContent.push({ type: 'text', text: analysisPrompt });

  // Make the vision API call
  const messages: ChatMessage[] = [
    { role: 'user', content: imageContent }
  ];

  // Token budget: 16384 is sufficient for 'high' reasoning effort.
  // response_format: json_object forces valid JSON output, eliminating
  // markdown fences, prose wrapping, and other formatting issues.
  const response = await callOpenAIWithVision(messages, {
    maxTokens: 16384,
    reasoningEffort,
    responseFormat: { type: 'json_object' },
    provider: ANALYSIS_PROVIDER
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

    // ─── Creative Fatigue Detection & Visual Clustering (Embedding-Based) ────
    // Runs after GPT analysis. Embeds ad creatives to quantify diversity
    // and cluster by visual style. Wrapped in try/catch — failures don't break analysis.
    let creativeFatigue: ChannelAnalysisResult['creativeFatigue'];
    let visualClusters: ChannelAnalysisResult['visualClusters'];

    if (isEmbeddingAvailable()) {
      try {
        console.log('🧬 Computing creative fatigue score via embeddings...');

        // Acquire images for ads that aren't in the cache yet
        // This makes Insights self-sufficient — works without visiting MetaAds first
        const embeddableAds: Array<{ ad: AdCreativeData; base64: string; mimeType: string }> = [];
        let skippedCount = 0;

        for (const ad of ads) {
          // Check cache first
          let cached = getCachedImage(ad.id);

          // If not cached and has a non-CDN image URL, try to fetch it
          if (!cached && ad.imageUrl) {
            const isFacebookCdn = ad.imageUrl.includes('fbcdn.net') ||
                                   ad.imageUrl.includes('facebook.com') ||
                                   ad.imageUrl.includes('fb.com');
            if (!isFacebookCdn) {
              cached = await storeImageFromUrl(ad.imageUrl, ad.id, ad.conversionRate, 40, ad.headline, ad.bodyText);
            }
          }

          if (cached?.base64Data) {
            embeddableAds.push({ ad, base64: cached.base64Data, mimeType: cached.mimeType });
          } else {
            skippedCount++;
          }
        }

        console.log(`🧬 Embeddable ads: ${embeddableAds.length}, skipped: ${skippedCount}`);

        if (embeddableAds.length >= 3) {
          // Compute embeddings for each ad
          const adVectors: Array<{ adId: string; headline: string; vector: number[] }> = [];

          for (const { ad, base64, mimeType } of embeddableAds) {
            // Check IndexedDB cache first
            let stored = await getEmbedding(ad.id);
            if (stored?.vector) {
              adVectors.push({ adId: ad.id, headline: ad.headline, vector: stored.vector });
              continue;
            }

            // Compute new embedding
            const textContent = `${ad.headline}. ${ad.bodyText?.slice(0, 200) || ''}`;
            const vector = await embedMultimodal(textContent, base64, mimeType, 'SEMANTIC_SIMILARITY');
            if (vector) {
              await setEmbedding(ad.id, vector, textContent);
              adVectors.push({ adId: ad.id, headline: ad.headline, vector });
            }
          }

          console.log(`🧬 Computed ${adVectors.length} embeddings for fatigue analysis`);

          if (adVectors.length >= 3) {
            // ── Fatigue Detection ──
            const vectors = adVectors.map(v => v.vector);
            const simMatrix = pairwiseSimilarityMatrix(vectors);

            // Compute average pairwise similarity (upper triangle only)
            let totalSim = 0;
            let pairCount = 0;
            let mostSimilar = { i: 0, j: 1, sim: -Infinity };
            let leastSimilar = { i: 0, j: 1, sim: Infinity };

            for (let i = 0; i < simMatrix.length; i++) {
              for (let j = i + 1; j < simMatrix.length; j++) {
                const sim = simMatrix[i][j];
                totalSim += sim;
                pairCount++;
                if (sim > mostSimilar.sim) mostSimilar = { i, j, sim };
                if (sim < leastSimilar.sim) leastSimilar = { i, j, sim };
              }
            }

            const avgSim = pairCount > 0 ? totalSim / pairCount : 0;

            // Map avg similarity to fatigue score (0-100)
            let fatigueScore: number;
            let fatigueLabel: 'Low' | 'Moderate' | 'High' | 'Severe';
            if (avgSim < 0.3) {
              fatigueScore = Math.round(avgSim / 0.3 * 25);
              fatigueLabel = 'Low';
            } else if (avgSim < 0.5) {
              fatigueScore = Math.round(25 + ((avgSim - 0.3) / 0.2) * 25);
              fatigueLabel = 'Moderate';
            } else if (avgSim < 0.7) {
              fatigueScore = Math.round(50 + ((avgSim - 0.5) / 0.2) * 25);
              fatigueLabel = 'High';
            } else {
              fatigueScore = Math.round(75 + ((avgSim - 0.7) / 0.3) * 25);
              fatigueLabel = 'Severe';
            }
            fatigueScore = Math.min(100, Math.max(0, fatigueScore));

            // Generate recommendation
            const recommendations: Record<string, string> = {
              'Low': 'Your ad creatives show healthy diversity. Keep testing varied visual styles and messaging angles.',
              'Moderate': 'Your creatives are becoming somewhat similar. Consider introducing new visual styles or messaging angles to maintain audience engagement.',
              'High': 'Creative fatigue detected. Your ads are visually and thematically clustered. Prioritize generating creatives with fresh visual approaches, different color palettes, and new messaging frameworks.',
              'Severe': 'Severe creative fatigue. Most of your ads look and sound alike. Audiences are likely experiencing banner blindness. Immediately diversify your creative strategy with fundamentally different visual styles and value propositions.',
            };

            creativeFatigue = {
              score: fatigueScore,
              label: fatigueLabel,
              avgPairwiseSimilarity: avgSim,
              mostSimilarPair: {
                adId1: adVectors[mostSimilar.i].adId,
                adId2: adVectors[mostSimilar.j].adId,
                similarity: mostSimilar.sim,
                headline1: adVectors[mostSimilar.i].headline,
                headline2: adVectors[mostSimilar.j].headline,
              },
              leastSimilarPair: {
                adId1: adVectors[leastSimilar.i].adId,
                adId2: adVectors[leastSimilar.j].adId,
                similarity: leastSimilar.sim,
                headline1: adVectors[leastSimilar.i].headline,
                headline2: adVectors[leastSimilar.j].headline,
              },
              recommendation: recommendations[fatigueLabel],
              adsEmbedded: adVectors.length,
              adsSkipped: ads.length - adVectors.length,
            };

            console.log(`🧬 Creative Fatigue Score: ${fatigueScore}/100 (${fatigueLabel}) — avg similarity: ${avgSim.toFixed(3)}`);

            // ── Visual Clustering ──
            if (adVectors.length >= 6) {
              console.log('🧬 Computing visual style clusters...');
              const maxK = Math.min(5, Math.floor(adVectors.length / 2));
              const optimalK = findOptimalK(vectors, 2, maxK);
              const clusterResult = kMeansClustering(vectors, optimalK, 50, 3);

              // Build cluster data
              const clusterMap = new Map<number, typeof adVectors>();
              clusterResult.clusters.forEach((clusterId, idx) => {
                const existing = clusterMap.get(clusterId) || [];
                existing.push(adVectors[idx]);
                clusterMap.set(clusterId, existing);
              });

              // Build ad metrics lookup
              const adMetricsMap = new Map<string, AdCreativeData>();
              ads.forEach(ad => adMetricsMap.set(ad.id, ad));

              const clusters: ChannelAnalysisResult['visualClusters'] = [];
              let clusterIdx = 0;
              for (const [clusterId, members] of clusterMap) {
                if (members.length < 2) continue; // Skip degenerate clusters

                const clusterAds = members
                  .map(m => adMetricsMap.get(m.adId))
                  .filter((a): a is AdCreativeData => Boolean(a));

                const avgCVR = clusterAds.reduce((sum, a) => sum + a.conversionRate, 0) / clusterAds.length;
                const avgCPA = clusterAds.reduce((sum, a) => {
                  const cpa = a.conversions > 0 ? a.spend / a.conversions : 0;
                  return sum + cpa;
                }, 0) / clusterAds.length;

                // Find representative ad (closest to centroid)
                const centroid = clusterResult.centroids[clusterId];
                let representativeIdx = 0;
                let bestSim = -Infinity;
                members.forEach((m, idx) => {
                  const sim = cosineSimilarity(m.vector, centroid);
                  if (sim > bestSim) {
                    bestSim = sim;
                    representativeIdx = idx;
                  }
                });

                const topPerformer = clusterAds.sort((a, b) => b.conversionRate - a.conversionRate)[0];

                clusters.push({
                  clusterId: clusterIdx++,
                  styleDescription: '', // Will be filled by GPT below
                  adCount: members.length,
                  adIds: members.map(m => m.adId),
                  avgConversionRate: avgCVR,
                  avgCPA,
                  topPerformerHeadline: topPerformer?.headline || '',
                  representativeAdId: members[representativeIdx]?.adId,
                });
              }

              // Generate style descriptions via a single GPT call
              if (clusters.length >= 2) {
                try {
                  const clusterSummaries = clusters.map((c, i) => {
                    const clusterAdData = c.adIds
                      .map(id => adMetricsMap.get(id))
                      .filter((a): a is AdCreativeData => Boolean(a));
                    const headlines = clusterAdData.map(a => `"${a.headline}"`).join(', ');
                    return `Cluster ${i + 1} (${c.adCount} ads, avg CVR ${c.avgConversionRate.toFixed(2)}%): Headlines: ${headlines}`;
                  }).join('\n');

                  const descResponse = await callOpenAI([
                    {
                      role: 'user',
                      content: `These ad creatives have been grouped by visual/thematic similarity using embeddings. For each cluster, write a SHORT (3-6 word) visual style label that describes the common visual/thematic thread. Return a JSON array of strings, one per cluster.\n\n${clusterSummaries}\n\nReturn ONLY a JSON array like: ["Dark product photography", "Lifestyle outdoor imagery", "Bold text-heavy design"]`
                    }
                  ], { maxTokens: 200, reasoningEffort: 'low' as ReasoningEffort });

                  try {
                    const descriptions = JSON.parse(descResponse.trim());
                    if (Array.isArray(descriptions)) {
                      descriptions.forEach((desc: string, i: number) => {
                        if (clusters[i]) clusters[i].styleDescription = desc;
                      });
                    }
                  } catch {
                    // Failed to parse descriptions — leave empty
                    clusters.forEach((c, i) => {
                      c.styleDescription = `Visual Style ${i + 1}`;
                    });
                  }
                } catch {
                  clusters.forEach((c, i) => {
                    c.styleDescription = `Visual Style ${i + 1}`;
                  });
                }

                // Sort by avg conversion rate descending
                clusters.sort((a, b) => b.avgConversionRate - a.avgConversionRate);
                visualClusters = clusters;
                console.log(`🧬 Found ${clusters.length} visual style clusters`);
              }
            }
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.warn('🧬 Embedding-based analysis failed (non-fatal):', msg);
        // creativeFatigue and visualClusters remain undefined — analysis continues
      }
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
      creativeFatigue,
      visualClusters,
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
 * Build the channel-analysis context string. Shared by single-copy generation
 * (generateCopyOptions) and grid-copy generation (generateGridCopy) so the
 * analysis formatting never drifts between the two paths.
 */
/**
 * True when the profile is active AND supplies any VOICE/style guidance (not just guardrails).
 * Used to decide whether the analysis-derived "observed voice" should be demoted to reference-only
 * so it doesn't fight the user's authored voice. A guardrails-only profile (e.g. just banned words)
 * leaves the observed voice as the primary voice signal.
 */
function brandProfileDefinesVoice(profile: BrandVoiceProfile | null | undefined): boolean {
  if (!profile || !profile.enabled) return false;
  return !!(
    profile.voiceSummary?.trim() ||
    profile.tonality?.trim() ||
    profile.toneAvoid?.trim() ||
    profile.pointOfView?.trim() ||
    profile.readingLevel?.trim() ||
    profile.rhythm?.trim() ||
    (profile.signaturePhrases || []).some(s => s?.trim())
  );
}

/**
 * Serialize the per-account Brand Voice & Guidelines profile into an AUTHORITATIVE system-prompt
 * block. Sits above the analysis-derived "observed voice" and explicitly wins on conflict. Only
 * populated fields are emitted (keeps tokens lean, avoids empty-field noise). Returns '' when there
 * is no profile, it is disabled, or it has no usable content.
 */
function buildBrandVoiceContextString(profile: BrandVoiceProfile | null | undefined): string {
  if (!profile || !profile.enabled) return '';

  const lines: string[] = [];
  const add = (label: string, value: string | undefined) => {
    const v = value?.trim();
    if (v) lines.push(`${label}: ${v}`);
  };

  add('VOICE', profile.voiceSummary);
  add('SOUND LIKE', profile.tonality);
  add('NEVER SOUND LIKE', profile.toneAvoid);
  add('POINT OF VIEW', profile.pointOfView);
  if (profile.readingLevel?.trim()) {
    lines.push(`READING LEVEL: ${profile.readingLevel.trim()} — match this vocabulary; never write above it.`);
  }
  add('RHYTHM & CADENCE', profile.rhythm);
  const phrases = (profile.signaturePhrases || []).map(p => p?.trim()).filter(Boolean);
  if (phrases.length) {
    lines.push(`SIGNATURE PHRASES (use only where they fit naturally — do NOT force one into every ad): ${phrases.join(', ')}`);
  }
  add('WHO YOU ARE TALKING TO (avatar)', profile.avatar);
  add('LEAD WITH THIS IDEA (the unique mechanism / core promise)', profile.bigIdea);

  // Hard guardrails — v1 enforces these via the prompt (deterministic enforcement is a later pass).
  const rules: string[] = [];
  if (profile.spellingLocale && profile.spellingLocale !== 'US') {
    const localeName: Record<string, string> = { UK: 'British', AU: 'Australian', CA: 'Canadian' };
    rules.push(`Spelling: use ${localeName[profile.spellingLocale] || profile.spellingLocale} English spelling throughout (e.g. optimise, colour, personalise, centre).`);
  }
  const banned = (profile.bannedWords || []).map(w => w?.trim()).filter(Boolean);
  if (banned.length) {
    rules.push(`Never use these words or phrases: ${banned.map(w => `"${w}"`).join(', ')}.`);
  }
  if (profile.emojiPolicy === 'none') {
    rules.push('Do not use any emoji.');
  } else if (profile.emojiPolicy === 'sparing') {
    rules.push('Use emoji sparingly — at most one, and only when it genuinely adds meaning.');
  }
  const disclaimers = (profile.requiredDisclaimers || []).map(d => d?.trim()).filter(Boolean);
  if (disclaimers.length) {
    rules.push(`Every body copy must include this text verbatim: ${disclaimers.map(d => `"${d}"`).join(' and ')}.`);
  }

  if (!lines.length && !rules.length) return '';

  let block = `\n\n=== BRAND VOICE & GUIDELINES (AUTHORITATIVE — overrides any voice inferred from past ads) ===
You are writing as this specific brand. Match it exactly. Where this conflicts with patterns observed in past ads, THIS PROFILE WINS.`;
  if (lines.length) block += `\n${lines.join('\n')}`;
  if (rules.length) block += `\n\nNON-NEGOTIABLE BRAND RULES:\n${rules.map(r => `- ${r}`).join('\n')}`;
  return block;
}

// Angles where real testimonials are the PRIMARY lever, not just decoration.
const PROOF_PRIMARY_ANGLES: readonly GridAngle[] = ['social_proof', 'transformation', 'authority', 'fear_elimination'];

/**
 * Serialize the user's REAL customer testimonials into a prompt block, weighted by how proof-driven
 * the current request is (angle × audience). Only `approved` testimonials are ever emitted.
 *
 * This is the anti-fabrication mechanism: the angle guidance elsewhere literally tells the model to
 * invent named testimonials ("Sarah went from X to Y"). When the user has supplied real quotes, this
 * block hands the copywriter the actual words to use VERBATIM and forbids fabrication. Returns '' when
 * there is no profile, it is disabled, or there are no approved testimonials.
 *
 * @param ctx.angles the angle(s) in play — pass [] for auto-select / unknown angle (e.g. 'auto' mode).
 */
function buildTestimonialContextString(
  profile: BrandVoiceProfile | null | undefined,
  ctx: { angles: GridAngle[]; audienceType: AudienceType },
): string {
  if (!profile || !profile.enabled) return '';
  // The ≤MAX_TESTIMONIALS cap is a storage invariant (enforced in normalize()); no need to re-cap here.
  const approved = (profile.testimonials || []).filter(t => t?.approved && t.quote?.trim());
  if (!approved.length) return '';

  const warm = ctx.audienceType === 'retargeting' || ctx.audienceType === 'retention';
  const hasPrimaryAngle = ctx.angles.some(a => PROOF_PRIMARY_ANGLES.includes(a));
  const hasSupportingAngle = ctx.angles.some(a => a === 'product_benefits' || a === 'pain');
  // Warm audiences and proof-led angles → primary. Unknown angle (auto) or moderate angles → supporting.
  const tier: 'primary' | 'supporting' | 'optional' =
    warm || hasPrimaryAngle ? 'primary'
    : ctx.angles.length === 0 || hasSupportingAngle ? 'supporting'
    : 'optional';

  const list = approved
    .map((t, i) => {
      const quote = t.quote.trim().replace(/\s+/g, ' ').slice(0, 400);
      const who = t.attribution?.trim() || 'verified customer';
      const outcome = t.result?.trim() ? ` [outcome: ${t.result.trim()}]` : '';
      const bestFor = t.theme?.trim() ? ` [best for: ${t.theme.trim()}]` : '';
      return `${i + 1}. "${quote}" — ${who}${outcome}${bestFor}`;
    })
    .join('\n');

  const emphasisLead =
    tier === 'primary'
      ? "TESTIMONIALS ARE A PRIMARY LEVER FOR THIS REQUEST. Build the proof-driven copy (social proof, transformation, authority, objection-handling) AROUND one of the real quotes below — let the customer's own words carry the sell."
      : tier === 'supporting'
      ? 'Testimonials are a SUPPORTING asset here. Weave a real quote in where it strengthens credibility, but do not force one into every option.'
      : 'Testimonials are available if useful. This angle is not primarily proof-driven — only use a quote if it genuinely fits; otherwise leave them out.';

  const audienceNote = warm
    ? 'AUDIENCE IS WARM (they already know the product and are weighing a decision): specific, named, detailed testimonials are exactly what converts — use the concrete names, numbers, and timeframes in the quotes.'
    : 'AUDIENCE IS COLD (they do not know the brand yet): favor the most relatable, broadly credible testimonials; keep them feeling universal rather than niche.';

  return `\n\n=== REAL CUSTOMER TESTIMONIALS (verbatim — actual customer words) ===
${emphasisLead}
${audienceNote}

${list}

HOW TO USE THESE TESTIMONIALS — READ CAREFULLY:
- They are REAL. When you place a customer quote in body copy, reproduce the words EXACTLY as written, inside quotation marks. You MAY use a shorter continuous excerpt or trim the middle with an ellipsis (…), but you may NOT paraphrase, add, reorder, or change any word inside the quotation marks, and you may NOT attribute a quote to a different person.
- A headline is too short for a full quote: there you may distill the SENTIMENT in your own words, but NEVER wrap invented words in quotation marks as if a customer said them.
- Do NOT fabricate testimonials, names, numbers, or outcomes. Any "Sarah went from X to Y" style example anywhere in these instructions is an ILLUSTRATIVE PLACEHOLDER — replace it with one of the REAL testimonials above, or leave the quote out entirely.
- If an angle calls for proof but none of the real testimonials genuinely fit, use the numeric proof from the performance data instead of inventing a quote.
- Never claim more than a testimonial actually states.`;
}


/**
 * Build the Ad Library inspiration context string. Shared by single-copy and
 * grid-copy generation.
 */
function buildInspirationContextString(inspirations?: import('../types').AdLibraryInspiration[]): string {
  if (!inspirations || inspirations.length === 0) return '';
  let inspirationContext = `\n=== COMPETITOR/INDUSTRY INSPIRATION (Ad Library) ===
The user has curated these successful ads from the Meta Ad Library as creative inspiration.
Long-running ads indicate sustained profitability. Study their copy patterns, angles, and hooks.
Create ORIGINAL copy inspired by these approaches — DO NOT copy text verbatim.\n`;
  inspirations.forEach((insp, i) => {
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
  return inspirationContext;
}

/**
 * Cold-start analysis template. A user (or `distillManualAnalysis` below) feeds a brand /
 * positioning brief in place of {{BRAND_CONTEXT}} and any LLM returns a ConversionIQ profile
 * that seeds copy generation before an account has live ad data.
 *
 * IMPORTANT: the JSON shape below mirrors the GENERATION-RELEVANT subset of
 * `ChannelAnalysisResult` (the fields `buildAnalysisContextString` reads). Keep them in sync —
 * a TS interface can't be introspected at runtime, so this is maintained by hand.
 */
export const MANUAL_ANALYSIS_PROMPT_TEMPLATE = `You are an elite direct-response strategist building a ConversionIQ creative-intelligence profile for a brand that has NO live ad data yet. Using ONLY the brand/positioning context below, synthesize a well-reasoned profile a copywriter can immediately draw on. These are informed hypotheses, not measured results — make them specific, realistic, and grounded in the brand context. Do NOT use em dashes.

You have NO measured delivery data, so everything you infer is a HYPOTHESIS, not a proven winner. The only things that count as VALIDATED are what the operator states outright in the brief below (voice, rules, compliance limits) — put those in "constraints", which is treated as binding downstream.

Do NOT output an overall health score. This account has no delivery data, so there is nothing to score.

=== BRAND / POSITIONING CONTEXT ===
{{BRAND_CONTEXT}}

Return JSON ONLY, matching this exact shape (omit nothing; use [] for lists you can't fill):
{
  "executiveSummary": "<2-3 sentences: who this brand is, who it sells to, and the core creative angle that should win>",
  "constraints": {
    "bannedVocabulary": ["<word or phrase this brand must never use, from the brief>"],
    "claimGuardrails": ["<claim this brand may not make, or must qualify, e.g. no guaranteed outcomes>"],
    "avoidHeadlinePatterns": ["<headline shape that falls flat for this audience>"]
  },
  "brandVoice": {
    "tonality": "<e.g. 'Warm, grounded, quietly authoritative'>",
    "sentenceStyle": "<e.g. 'Short plain sentences with the occasional one-line punch'>",
    "pointOfView": "<e.g. 'Second person (you/your)'>",
    "vocabularyLevel": "<e.g. 'Conversational, 8th-grade, no jargon'>",
    "rhythmAndCadence": "<e.g. 'Calm opener, builds, lands on a clear invitation'>",
    "distinctiveTraits": ["<trait 1>", "<trait 2>", "<trait 3>"]
  },
  "winningPatterns": {
    "headlines": ["<headline pattern that should resonate>", "<another>"],
    "copyElements": ["<copy element 1>", "<element 2>"],
    "emotionalTriggers": ["<trigger 1>", "<trigger 2>"],
    "callToActions": ["<CTA pattern 1>", "<CTA pattern 2>"],
    "visualElements": ["<visual pattern 1>", "<pattern 2>"]
  },
  "audienceInsights": {
    "whatResonates": ["<what this audience responds to 1>", "<2>"],
    "whatDoesntWork": ["<what to avoid 1>", "<2>"],
    "targetingRecommendations": [],
    "visualPreferences": ["<visual preference 1>"]
  },
  "losingPatterns": {
    "headlines": ["<headline pattern to avoid>"],
    "copyElements": [],
    "issues": ["<common mistake to avoid for this audience>"],
    "visualIssues": []
  },
  "visualAnalysis": {
    "winningVisualElements": [],
    "losingVisualElements": [],
    "colorPsychology": "",
    "imageryPatterns": "",
    "inImageMessaging": "",
    "psychologicalTriggers": ["<deep driver 1, e.g. 'fear resolution'>", "<driver 2>"]
  },
  "recommendations": {
    "immediate": ["<first creative move>"],
    "shortTerm": [],
    "strategic": [],
    "creativeDirection": ["<creative direction 1>", "<2>"]
  },
  "topAds": [
    {
      "id": "exemplar_1",
      "headline": "<an exemplar headline in the brand voice>",
      "bodyText": "<a short exemplar body in the brand voice>",
      "conversionRate": 0,
      "whyItWorks": "<why this would resonate with the audience>",
      "imageAnalysis": "",
      "psychologicalDrivers": ["<driver 1>", "<driver 2>"]
    }
  ]
}`;

/**
 * Cold-start: synthesize a ConversionIQ analysis from a freeform brand/positioning brief
 * (no live ad data). Returns the RAW parsed object — the caller normalizes it via
 * `normalizeManualAnalysis` (channelAnalysisCache) into a full ChannelAnalysisResult.
 */
export async function distillManualAnalysis(
  brief: string,
  opts?: { reasoningEffort?: ReasoningEffort },
): Promise<unknown> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }
  const clean = (brief || '').trim();
  if (!clean) throw new Error('Provide a brand/positioning brief to distill.');
  const reasoningEffort = opts?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  const userPrompt = MANUAL_ANALYSIS_PROMPT_TEMPLATE.replace('{{BRAND_CONTEXT}}', clean);

  const response = await callOpenAI(
    [{ role: 'user', content: userPrompt }],
    { maxTokens: 16384, reasoningEffort, responseFormat: { type: 'json_object' }, provider: ANALYSIS_PROVIDER },
  );

  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  try {
    return JSON.parse(cleaned.trim());
  } catch {
    const repaired = attemptJsonRepair(cleaned);
    if (repaired) return JSON.parse(repaired);
    throw new Error('The distilled analysis was not valid JSON. Please try again.');
  }
}

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
  campaignIntent?: import('../types/organization').CampaignIntent;
  corePromise?: string; // the single idea the whole batch lives inside (BlitzScale grid)
  brandProfile?: BrandVoiceProfile; // per-account authored voice (overrides the observed voice)
}): Promise<CopyOptionsResult> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const reasoningEffort = config.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  const copyLength = config.copyLength ?? DEFAULT_COPY_LENGTH;
  const copyVariation = config.copyVariationLevel ?? 30;
  const copyLengthConfig = COPY_LENGTH_OPTIONS.find(opt => opt.id === copyLength) ?? COPY_LENGTH_OPTIONS[0];
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');
  // Use intent-specific AI context when a campaign intent is set
  const intentConfig = (config.campaignIntent)
    ? getCampaignIntentConfig(config.campaignIntent)
    : null;
  console.log(`📝 Generating copy options for ${config.audienceType} audience with ${config.conceptType} concept | IQ Level: ${reasoningEffort} | Copy Length: ${copyLength} | Copy Variation: ${copyVariation}%`);
  console.log('📊 Analysis data available:', !!config.analysisData);
  console.log('📦 Product context:', config.productContext ? config.productContext.name : 'Not provided');

  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const conceptAngle = CONCEPT_ANGLES[config.conceptType];
  const isAutoMode = config.conceptType === 'auto';

  // Extract ALL relevant analysis data for deep integration
  const analysis = config.analysisData;
  const hasAnalysis = !!analysis;

  // Per-account authored Brand Voice profile — injected into the system prompt and (when it defines
  // a voice) demotes the analysis-derived voice to reference-only.
  const brandVoiceContext = buildBrandVoiceContextString(config.brandProfile);
  // Real customer testimonials — weighted by this concept's proof-relevance (auto mode → unknown angle).
  const testimonialContext = buildTestimonialContextString(config.brandProfile, {
    angles: config.conceptType !== 'auto' ? [config.conceptType] : [],
    audienceType: config.audienceType,
  });

  // Build comprehensive analysis context (shared with grid-copy generation)
  const analysisContext = buildAnalysisContextString(analysis, {
    demoteObservedVoice: brandProfileDefinesVoice(config.brandProfile),
  });

  // Build Ad Library inspiration context (shared with grid-copy generation)
  const inspirationContext = buildInspirationContextString(config.adLibraryInspirations);

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
2. ${SPECIFICITY_PROMPT}
3. FORMATTING: NEVER use em dashes (—). Max 1 exclamation mark per body text. Zero in headlines.
4. ${PROMISE_OUTCOME_PROMPT}
5. ${META_AD_POLICY_PROMPT}`;

  // Inject business type context (use intent-specific language for hybrid)
  const effectiveConversionLanguage = intentConfig?.aiConversionLanguage || btConfig.aiConversionLanguage;
  const effectivePsychologyShifts = intentConfig?.aiPsychologyShifts || btConfig.aiPsychologyShifts;
  const effectiveRetentionContext = intentConfig?.aiRetentionContext || btConfig.aiRetentionContext;
  systemPrompt += `\n\nBUSINESS CONTEXT:\n${effectiveConversionLanguage}`;
  if (config.campaignIntent) {
    const intentFocusDesc = config.campaignIntent === 'purchase' ? 'purchases and sales' : config.campaignIntent === 'quiz' ? 'quiz/assessment completions (the ad sells the quiz experience, not the product directly — curiosity and self-discovery are the primary hooks)' : 'lead submissions, call bookings, or opt-ins';
    systemPrompt += `\n\nCAMPAIGN INTENT: This creative is for a "${intentConfig?.label}" campaign. Focus copy on driving ${intentFocusDesc}. Use the relevant patterns from the analysis for this intent type.`;
  }

  // Authoritative per-account brand voice — appended last so it carries top priority.
  systemPrompt += brandVoiceContext;
  // Real customer testimonials (verbatim social-proof corpus) — sits with the brand voice.
  systemPrompt += testimonialContext;

  // Build product context section
  let productSection = '';
  if (config.productContext) {
    const p = config.productContext;
    productSection = `
=== PRODUCT YOU ARE WRITING ADS FOR ===
Product Name: ${p.name}
Creator (write AS this person — this identifies whose voice to use; it is NOT a name to print in the ad): ${p.author}
Description: ${p.description}
${p.landingPageUrl ? `Landing Page: ${p.landingPageUrl}` : ''}

CRITICAL: All copy is about "${p.name}". NEVER reference any other product, brand, or company name. Name "${p.name}" only where it reads naturally — never force the full title into a sentence.
${AUTHOR_VOICE_PROMPT}
`;
  }

  const conceptModifier = CONCEPT_AUDIENCE_MODIFIERS[config.conceptType]?.[config.audienceType] || '';

  const corePromiseSection = config.corePromise?.trim()
    ? `\n=== CORE PROMISE (anchor every option to THIS one idea) ===\n"${config.corePromise.trim()}"\nEvery headline, body, and CTA must live inside this single promise. Do not drift to other benefits or offers.\n`
    : '';

  const userPrompt = `Generate copy OPTIONS for a ${config.audienceType.toUpperCase()} audience${isAutoMode ? ' using analysis-driven insights' : ` using the ${conceptAngle.name} concept`}.
${productSection}${corePromiseSection}
=== AUDIENCE STAGE: ${config.audienceType.toUpperCase()} ===

AWARENESS LEVEL: ${audienceAngle.awarenessLevel}
${audienceAngle.awarenessDescription}
${(config.businessType === 'leadgen' || config.businessType === 'hybrid') && config.audienceType === 'retention' ? `\nIMPORTANT OVERRIDE FOR THIS BUSINESS: ${effectiveRetentionContext}` : ''}

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
${(config.businessType === 'leadgen' || config.businessType === 'hybrid') ? `\nBUSINESS-SPECIFIC PSYCHOLOGY:\n${effectivePsychologyShifts}` : ''}

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
   - Each headline MUST use a DIFFERENT hook approach, and you MUST label each headline with its hook type using the EXACT value (one of): ${HOOK_PROMPT_MENU}. Spread the 6 headlines across DIFFERENT hook types — do NOT repeat the same hook or use the same structure twice.

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
    {"id": "h1", "text": "headline text", "hook": "question", "rationale": "why this works based on analysis"},
    {"id": "h2", "text": "headline text", "hook": "stat", "rationale": "why this works based on analysis"}
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

  // GPT-5.4 reasoning tokens share the max_completion_tokens budget.
  // 3500 was too tight — reasoning can consume 2-5K tokens, leaving insufficient
  // room for the full JSON output. 16384 provides adequate headroom.
  // response_format: json_object forces valid JSON output, eliminating markdown fences.
  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 16384, reasoningEffort, responseFormat: { type: 'json_object' } });

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

    let parsed;
    try {
      parsed = JSON.parse(cleanedResponse.trim());
    } catch {
      // Attempt JSON repair for truncated responses
      const repaired = attemptJsonRepair(cleanedResponse);
      if (repaired) {
        console.warn('⚠️ Copy options JSON was truncated — repaired successfully');
        parsed = JSON.parse(repaired);
      } else {
        throw new Error('JSON parse failed and repair unsuccessful');
      }
    }

    // Post-processing: sanitize all generated copy text + validate hook labels
    if (parsed.headlines) {
      for (const h of parsed.headlines) {
        if (h.text) h.text = sanitizeCopyText(h.text, { author: config.productContext?.author });
        h.hook = isValidHook(h.hook) ? h.hook : undefined;
      }
    }
    if (parsed.bodyTexts) {
      for (const b of parsed.bodyTexts) { if (b.text) b.text = sanitizeCopyText(b.text, { author: config.productContext?.author }); }
    }
    if (parsed.callToActions) {
      for (const c of parsed.callToActions) { if (c.text) c.text = sanitizeCopyText(c.text, { author: config.productContext?.author }); }
    }

    console.log('✅ Copy options generated successfully');
    return parsed;
  } catch (error) {
    console.error('❌ Failed to parse copy options:', error);
    console.error('❌ Raw response length:', response.length, '| first 500 chars:', response.substring(0, 500));
    // Surface a more specific message if the response looks truncated
    if (!response || response.length === 0) {
      throw new Error('Failed to generate copy options — AI returned an empty response. Please try again.');
    }
    if (response.length > 0 && !response.trim().endsWith('}')) {
      throw new Error('Failed to generate copy options — AI response was cut short. Please try again.');
    }
    throw new Error('Failed to generate copy options — AI returned invalid data. Please try again.');
  }
}

/**
 * Generate a full Angle × Hook copy matrix in ONE GPT call (BlitzScale grid).
 * Returns one {headline, body, cta} cell per (angle, hook) combination, each labeled.
 * Reuses the SAME analysis/inspiration context builders as generateCopyOptions so the
 * two paths never drift. Malformed cells are dropped (graceful partial grid).
 */
/**
 * Propose avatar callout lines for the callout matrix.
 *
 * The framework this implements is emphatic that the operator knows their avatars — this is
 * a starting point, not an authority. The UI keeps the list editable and never requires
 * generation. Routed through the SAME brand-voice, analysis-context and banned-phrase path as
 * generateGridCopy so a callout cannot bypass guardrails that ordinary copy is held to.
 */
export async function generateAvatarCallouts(config: {
  count?: number;
  corePromise?: string;
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  productContext?: ProductContext;
  brandProfile?: BrandVoiceProfile;
  businessType?: import('../types/organization').BusinessType;
  reasoningEffort?: ReasoningEffort;
}): Promise<string[]> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const count = Math.min(Math.max(config.count ?? 8, 1), 24);
  const brandVoiceContext = buildBrandVoiceContextString(config.brandProfile);
  const analysisContext = buildAnalysisContextString(config.analysisData, {
    demoteObservedVoice: Boolean(brandVoiceContext),
  });
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');

  const systemPrompt = `You write avatar callout lines for direct-response image ads.

A callout NAMES THE PERSON the ad is for, so the right reader self-selects in the first half
second. The canonical example is a bare product photo captioned "Dads over 40 need this".

HARD RULES:
1. Six words maximum. Shorter is better. These are rendered large on an image.
2. Name a PERSON or a SITUATION, never a benefit, feature or outcome.
   GOOD: "Dads over 40", "Nurses on night shift", "Parents at weekend tournaments"
   BAD: "Boost your energy", "Save 40% today", "Clinically proven formula"
3. Make no claim of any kind. A callout identifies; it does not promise.
4. Get specific. "Men" is useless. "Men over 45 who sit all day" is a callout.
5. Vary the AXIS of specificity across the set — age, role, life stage, routine, pain moment —
   so the batch tests genuinely different segments rather than one segment reworded.
6. ${BANNED_PHRASES_PROMPT}
7. ${META_AD_POLICY_PROMPT}

BUSINESS CONTEXT:
${btConfig.aiConversionLanguage}

Return ONLY JSON: { "callouts": ["...", "..."] }`;

  const userParts: string[] = [`Write ${count} distinct avatar callout lines.`];
  if (config.corePromise) userParts.push(`\nCORE PROMISE: ${config.corePromise}`);
  if (config.productContext) {
    userParts.push(`\nPRODUCT: ${config.productContext.name}${config.productContext.author ? ` by ${config.productContext.author}` : ''}`);
    if (config.productContext.description) userParts.push(config.productContext.description);
  }
  userParts.push(`\nAUDIENCE STAGE: ${config.audienceType}`);
  if (brandVoiceContext) userParts.push(`\n${brandVoiceContext}`);
  if (analysisContext) userParts.push(`\n${analysisContext}`);

  const content = await callOpenAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts.join('\n') },
    ],
    {
      maxTokens: 1500,
      reasoningEffort: config.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
      responseFormat: { type: 'json_object' },
    }
  );

  const parsed = JSON.parse(content) as { callouts?: unknown };
  const raw = Array.isArray(parsed.callouts) ? parsed.callouts : [];

  // Coerce hard: this text is rendered onto a creative and slugged into an ad name, so an
  // over-long or empty entry is a defect downstream rather than here.
  const seen = new Set<string>();
  const callouts: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim().replace(/\s+/g, ' ');
    if (!text || text.length > 60) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    callouts.push(text);
    if (callouts.length >= count) break;
  }

  return callouts;
}

export async function generateGridCopy(config: {
  corePromise: string;
  angles: GridAngle[];
  hooks: HookType[];
  format?: FormatType;
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  copyLength?: CopyLength;
  productContext?: ProductContext;
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  reasoningEffort?: ReasoningEffort;
  brandProfile?: BrandVoiceProfile; // per-account authored voice (overrides the observed voice)
}): Promise<GridCell[]> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const angles = config.angles.length ? config.angles : [...DEFAULT_GRID_ANGLES];
  const hooks = config.hooks.length ? config.hooks : [...DEFAULT_GRID_HOOKS];
  const copyLength = config.copyLength ?? DEFAULT_COPY_LENGTH;
  const copyLengthConfig = COPY_LENGTH_OPTIONS.find(opt => opt.id === copyLength) ?? COPY_LENGTH_OPTIONS[0];
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');
  const intentConfig = config.campaignIntent ? getCampaignIntentConfig(config.campaignIntent) : null;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];
  const reasoningEffort = config.reasoningEffort ?? DEFAULT_REASONING_EFFORT;

  const brandVoiceContext = buildBrandVoiceContextString(config.brandProfile);
  // Real customer testimonials — the grid runs many angles at once, so emphasis reflects the full set.
  const testimonialContext = buildTestimonialContextString(config.brandProfile, {
    angles,
    audienceType: config.audienceType,
  });
  const analysisContext = buildAnalysisContextString(config.analysisData, {
    demoteObservedVoice: brandProfileDefinesVoice(config.brandProfile),
  });
  const inspirationContext = buildInspirationContextString(config.adLibraryInspirations);

  let productSection = '';
  if (config.productContext) {
    const p = config.productContext;
    productSection = `\nPRODUCT: "${p.name}", created by ${p.author} (write AS ${p.author} — their name identifies whose voice to use; do NOT print it as a byline). ${p.description}${p.landingPageUrl ? ` Landing page: ${p.landingPageUrl}` : ''}
All copy is about "${p.name}" — no other product or brand names. Name it only where it reads naturally; never force the full title into a sentence.
${AUTHOR_VOICE_PROMPT}\n`;
  }

  const angleMenu = angles
    .map(a => `- ${a}: ${CONCEPT_ANGLES[a].name} — ${CONCEPT_ANGLES[a].description}.${CONCEPT_AUDIENCE_MODIFIERS[a]?.[config.audienceType] ? ` ${CONCEPT_AUDIENCE_MODIFIERS[a][config.audienceType]}` : ''}`)
    .join('\n');
  const hookMenu = hooks.map(h => `- ${h}: ${HOOKS[h].promptHint}`).join('\n');
  const combos = angles.flatMap(a => hooks.map(h => `- angle:${a} + hook:${h}`)).join('\n');

  const effectiveConversionLanguage = intentConfig?.aiConversionLanguage || btConfig.aiConversionLanguage;

  const systemPrompt = `You are an elite direct-response copywriter generating a STRUCTURED TEST MATRIX of Meta ad copy.
Produce ONE distinct ad (headline + body + CTA) for every Angle × Hook combination requested.
${config.analysisData ? 'Use the REAL PERFORMANCE DATA provided to ground every cell in proven patterns.' : ''}

CORE PROMISE — every cell must live inside this ONE promise; do not drift to other offers:
"${config.corePromise}"

COPY QUALITY RULES (NON-NEGOTIABLE):
1. ${BANNED_PHRASES_PROMPT}
2. ${SPECIFICITY_PROMPT}
3. FORMATTING: NEVER use em dashes. Max 1 exclamation mark per body. Zero in headlines.
4. DIVERSITY: each cell must be genuinely different. The ANGLE controls the emotional frame; the HOOK controls the opening line. Never reuse the same opening line across cells.
5. ${PROMISE_OUTCOME_PROMPT}
6. ${META_AD_POLICY_PROMPT}

BUSINESS CONTEXT:
${effectiveConversionLanguage}${brandVoiceContext}${testimonialContext}`;

  const userPrompt = `Generate the copy matrix for a ${config.audienceType.toUpperCase()} audience.
${productSection}
AUDIENCE STAGE: ${audienceAngle.awarenessLevel} — ${audienceAngle.awarenessDescription}
BODY COPY STRUCTURE (${copyLength === 'long' ? 'LONG-FORM' : 'SHORT-FORM'}, max ${copyLengthConfig.maxChars} chars): ${copyLength === 'long' ? audienceAngle.bodyStructure : audienceAngle.bodyStructureShort}

ANGLES (the strategic frame):
${angleMenu}

HOOKS (the first 3 seconds):
${hookMenu}
${analysisContext}${inspirationContext}
=== YOUR TASK ===
Produce EXACTLY one cell for each of these ${angles.length} × ${hooks.length} = ${angles.length * hooks.length} combinations:
${combos}

For each cell: write a headline (max 40 characters) whose opening uses the specified HOOK, a body (max ${copyLengthConfig.maxChars} characters) operating from the specified ANGLE, and a CTA. Tag each cell with its exact angle and hook values.

Return JSON only:
{"cells":[{"angle":"${angles[0]}","hook":"${hooks[0]}","headline":"...","body":"...","cta":"...","rationale":"why this angle+hook works"}]}`;

  const response = await callOpenAI(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    { maxTokens: 16384, reasoningEffort, responseFormat: { type: 'json_object' } },
  );

  let parsed: { cells?: Array<Record<string, unknown>> };
  try {
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    try {
      parsed = JSON.parse(cleaned.trim());
    } catch {
      const repaired = attemptJsonRepair(cleaned);
      if (!repaired) throw new Error('repair failed');
      parsed = JSON.parse(repaired);
    }
  } catch (err) {
    console.error('❌ Failed to parse grid copy matrix:', err);
    throw new Error('Failed to generate the grid copy matrix. Please try again.');
  }

  const rawCells = Array.isArray(parsed.cells) ? parsed.cells : [];
  const cells: GridCell[] = [];
  rawCells.forEach((c, i) => {
    const angle = c.angle as string | undefined;
    const hook = c.hook as string | undefined;
    const headline = typeof c.headline === 'string' ? sanitizeCopyText(c.headline, { author: config.productContext?.author }) : '';
    const body = typeof c.body === 'string' ? sanitizeCopyText(c.body, { author: config.productContext?.author }) : '';
    const cta = typeof c.cta === 'string' ? sanitizeCopyText(c.cta, { author: config.productContext?.author }) : '';
    // Drop malformed cells (graceful partial grid) — angle + hook + headline + body are required.
    if (!isValidAngle(angle) || !isValidHook(hook) || !headline || !body) return;
    cells.push({
      id: `cell_${i}_${angle}_${hook}`,
      angle,
      hook,
      headline,
      body,
      cta: cta || 'Learn More',
      rationale: typeof c.rationale === 'string' ? c.rationale : '',
    });
  });

  console.log(`✅ Grid copy matrix: ${cells.length}/${angles.length * hooks.length} cells generated`);
  return cells;
}

/**
 * How a rendered image pool maps across the Angle × Hook grid — the lever that lets you hold the
 * image constant along a chosen axis so the COPY is what's under test (and the slow part, image
 * generation, shrinks from one-render-per-cell to a handful):
 *   single   → 1 image shared by every ad. Purest copy/angle/hook test, and the scaling play:
 *              reuse one proven image across every angle & hook to find the best combination.
 *   per_angle→ one image per distinct angle, shared across that angle's hooks. Mirrors the
 *              publisher's "one ad set per angle" split — isolates hooks within an angle.
 *   per_hook → one image per distinct hook, shared across that hook's angles.
 *   per_ad   → a unique image per cell (maximum variety; the old one-render-per-cell behaviour).
 */
export type BlitzImageStrategy = 'single' | 'per_angle' | 'per_hook' | 'per_ad';

/**
 * Resolve a strategy against the kept cells into a concrete plan: how many images to render
 * (`slotCount`), which rendered image each cell uses (`slotForCell[i]`), and a human label per
 * slot (`slotLabels[j]`, e.g. the angle or hook it represents) for the review UI. Pure.
 */
export function planBlitzImageSlots(
  cells: GridCell[],
  strategy: BlitzImageStrategy,
): { slotCount: number; slotForCell: number[]; slotLabels: string[] } {
  if (cells.length === 0) return { slotCount: 0, slotForCell: [], slotLabels: [] };

  if (strategy === 'single') {
    return { slotCount: 1, slotForCell: cells.map(() => 0), slotLabels: ['Shared across every ad'] };
  }
  if (strategy === 'per_ad') {
    return {
      slotCount: cells.length,
      slotForCell: cells.map((_, i) => i),
      slotLabels: cells.map(c => `${CONCEPT_ANGLES[c.angle].name} · ${HOOK_LABELS[c.hook]}`),
    };
  }

  // per_angle / per_hook — one slot per distinct axis value, in first-seen order.
  const keyFor = (c: GridCell): string => (strategy === 'per_angle' ? c.angle : c.hook);
  const labelFor = (c: GridCell): string =>
    strategy === 'per_angle' ? CONCEPT_ANGLES[c.angle].name : HOOK_LABELS[c.hook];

  const slotOf = new Map<string, number>();
  const slotLabels: string[] = [];
  const slotForCell = cells.map(c => {
    const k = keyFor(c);
    let slot = slotOf.get(k);
    if (slot === undefined) {
      slot = slotOf.size;
      slotOf.set(k, slot);
      slotLabels.push(labelFor(c));
    }
    return slot;
  });
  return { slotCount: slotLabels.length, slotForCell, slotLabels };
}

/**
 * Render count each strategy needs, given a grid's axis sizes — the count rule in one place, used
 * by the strategy selector's preview (config + review). `planBlitzImageSlots` produces the same
 * counts structurally when it builds the actual per-cell mapping.
 */
export function blitzStrategyImageCounts(
  sizes: { angles: number; hooks: number; cells: number },
): Record<BlitzImageStrategy, number> {
  return {
    single: 1,
    per_angle: Math.max(1, sizes.angles),
    per_hook: Math.max(1, sizes.hooks),
    per_ad: Math.max(1, sizes.cells),
  };
}

/**
 * Build one fully axis-tagged GeneratedAdPackage per kept Angle × Hook cell, assigning each cell
 * the pooled image its strategy plan points at (`images[slotForCell[i]]`). Pure/synchronous —
 * images are generated and reviewed SEPARATELY (the Blitz image-review step) so the copy stays the
 * test variable. The pool is SLOT-ALIGNED (one entry per rendered slot, `null` where a slot's
 * render failed), so a failed slot maps cleanly to packages with no image + `imageError`.
 */
/**
 * Expand one generated cell into a callout matrix: same angle, same hook, same body copy —
 * only the avatar callout changes.
 *
 * Copy is generated ONCE and shared deliberately. The experiment being run is "which person
 * do I name", so the body copy has to be a constant; regenerating it per callout would
 * confound the variable with copy variance and make the result unreadable.
 */
export function expandCalloutMatrix(base: GridCell, callouts: string[]): GridCell[] {
  const seen = new Set<string>();
  const cells: GridCell[] = [];

  for (const raw of callouts) {
    const text = raw.trim();
    if (!text) continue;
    // Dedupe on the SLUG, not the text: two callouts that slug identically would collide into
    // one attribution bucket and make the axis report wrong.
    const slug = slugifyCallout(text);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    cells.push({
      ...base,
      id: `${base.id}_c_${slug}`,
      // The callout becomes the headline: it is what gets rendered onto the creative and what
      // the reader actually sees first.
      headline: text,
      callout: text,
      hook: 'callout',
    });
  }

  return cells;
}

export function buildGridPackages(config: {
  cells: GridCell[];
  images: (GeneratedImageResult | null)[];   // slot-aligned pool; null = that slot's render failed
  slotForCell: number[];   // images[slotForCell[i]] — the isolation strategy's image for cell i
  audienceType: AudienceType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  format?: FormatType;
  corePromise?: string;
  imageError?: string;
}): GeneratedAdPackage[] {
  const { cells, images, slotForCell } = config;
  if (cells.length === 0) return [];

  const generatedAt = new Date().toISOString();
  const stamp = Date.now();

  return cells.map((cell, i) => {
    const img = images[slotForCell[i] ?? 0] ?? null;
    const pkg: GeneratedAdPackage = {
      id: `grid_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      generatedAt,
      adType: 'image',
      audienceType: config.audienceType,
      conceptType: cell.angle,
      images: img ? [img] : [],
      headlineHooks: [cell.hook],
      axisTag: {
        angle: cell.angle,
        hook: cell.hook,
        ...(config.format ? { format: config.format } : {}),
        // Slugged here so the tag is already wire-safe by the time it reaches buildAdName.
        ...(cell.callout ? { callout: slugifyCallout(cell.callout) } : {}),
      },
      corePromise: config.corePromise,
      copy: {
        headlines: [cell.headline],
        bodyTexts: [cell.body],
        callToActions: [cell.cta],
        rationale: cell.rationale,
      },
      whyItWorks: cell.rationale || `${CONCEPT_ANGLES[cell.angle].name} angle with a ${cell.hook} hook.`,
      imageError: img ? undefined : config.imageError,
      campaignIntent: config.campaignIntent,
    };
    return pkg;
  });
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
  campaignIntent?: import('../types/organization').CampaignIntent;
  corePromise?: string; // anchor the replacement to the same batch promise
  brandProfile?: BrandVoiceProfile; // per-account authored voice (overrides the observed voice)
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

  // Per-account authored Brand Voice profile — appended to the system prompt below, and (when it
  // defines a voice) demotes the condensed observed-voice block to reference-only.
  const brandVoiceContext = buildBrandVoiceContextString(config.brandProfile);
  // Real customer testimonials — weighted by this concept's proof-relevance (auto mode → unknown angle).
  const testimonialContext = buildTestimonialContextString(config.brandProfile, {
    angles: config.conceptType !== 'auto' ? [config.conceptType] : [],
    audienceType: config.audienceType,
  });
  const demoteObservedVoice = brandProfileDefinesVoice(config.brandProfile);

  // Build a CONDENSED analysis context — deliberately lighter than buildAnalysisContextString.
  // Single-item regen runs at reasoning 'low' with a small token budget, so it intentionally
  // omits the fuller sections (psychological triggers, audience insights, recommendations).
  let analysisContext = '';
  if (hasAnalysis) {
    // Mode-aware vocabulary: a seeded account has no winners, so nothing here may be framed as one.
    const cc = condensedCopyFor(analysis);
    analysisContext += `\n${cc.preamble}=== ${cc.summaryHeader} ===
${analysis.executiveSummary}
${healthScoreLine(analysis)}`;
    if (analysis.topAds && analysis.topAds.length > 0) {
      analysisContext += `\n=== ${cc.topAdsHeader} ===\n`;
      analysis.topAds.forEach((ad, i) => {
        const cvr = cc.showConversionRate ? ` (${(ad.conversionRate * 100).toFixed(2)}% CVR)` : '';
        analysisContext += `${cc.topAdsEntry} #${i + 1}${cvr}: "${ad.headline}"${ad.bodyText ? ` | Body: "${ad.bodyText}"` : ''} | ${ad.whyItWorks}\n`;
      });
    }
    if (analysis.brandVoice) {
      const bv = analysis.brandVoice;
      const voiceHeader = demoteObservedVoice
        ? '=== OBSERVED VOICE FROM PAST WINNERS (reference only — defer to the Brand Voice & Guidelines on any conflict) ==='
        : '=== BRAND VOICE (MATCH THIS) ===';
      analysisContext += `\n${voiceHeader}
Tone: ${bv.tonality} | Style: ${bv.sentenceStyle} | POV: ${bv.pointOfView} | Vocab: ${bv.vocabularyLevel}
Cadence: ${bv.rhythmAndCadence}
${bv.distinctiveTraits?.length ? `Traits: ${bv.distinctiveTraits.join('; ')}` : ''}
`;
    }
    if (analysis.winningPatterns) {
      analysisContext += `\n=== ${cc.patternsHeader} ===
- Headlines: ${analysis.winningPatterns.headlines?.join(' | ') || 'N/A'}
- Copy elements: ${analysis.winningPatterns.copyElements?.join(' | ') || 'N/A'}
- Emotional triggers: ${analysis.winningPatterns.emotionalTriggers?.join(', ') || 'N/A'}
- CTAs: ${analysis.winningPatterns.callToActions?.join(', ') || 'N/A'}
`;
    }
    if (analysis.losingPatterns) {
      analysisContext += `\n=== ${cc.avoidHeader} ===
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
2. ${SPECIFICITY_PROMPT}
3. FORMATTING: NEVER use em dashes (—). Max 1 exclamation mark per body text. Zero in headlines.
4. ${PROMISE_OUTCOME_PROMPT}
5. ${META_AD_POLICY_PROMPT}`;

  // Inject business context (use intent-specific language for hybrid)
  const regenIntentConfig = (config.campaignIntent)
    ? getCampaignIntentConfig(config.campaignIntent)
    : null;
  const regenConversionLanguage = regenIntentConfig?.aiConversionLanguage || btConfig.aiConversionLanguage;
  const regenPsychologyShifts = regenIntentConfig?.aiPsychologyShifts || btConfig.aiPsychologyShifts;
  const regenRetentionContext = regenIntentConfig?.aiRetentionContext || btConfig.aiRetentionContext;
  systemPrompt += `\n\nBUSINESS CONTEXT:\n${regenConversionLanguage}`;
  if (config.businessType === 'leadgen' || config.businessType === 'hybrid') {
    systemPrompt += `\n${regenPsychologyShifts}`;
    if (config.audienceType === 'retention') {
      systemPrompt += `\n\nRETENTION CONTEXT: ${regenRetentionContext}`;
    }
  }
  if (config.campaignIntent) {
    const regenIntentFocusDesc = config.campaignIntent === 'purchase' ? 'purchases and sales' : config.campaignIntent === 'quiz' ? 'quiz/assessment completions (sell the quiz experience, not the product directly)' : 'lead submissions, call bookings, or opt-ins';
    systemPrompt += `\n\nCAMPAIGN INTENT: This creative is for a "${regenIntentConfig?.label}" campaign. Focus on driving ${regenIntentFocusDesc}.`;
  }

  // Authoritative per-account brand voice — appended last so it carries top priority.
  systemPrompt += brandVoiceContext;
  // Real customer testimonials (verbatim social-proof corpus) — sits with the brand voice.
  systemPrompt += testimonialContext;

  // Build product context
  let productSection = '';
  if (config.productContext) {
    const p = config.productContext;
    productSection = `\nPRODUCT: "${p.name}", created by ${p.author} (write AS ${p.author} — their name identifies whose voice to use; do NOT print it as a byline). ${p.description}${p.landingPageUrl ? ` Landing page: ${p.landingPageUrl}` : ''}
All copy is about "${p.name}" — no other product or brand names. Name it only where it reads naturally; never force the full title into a sentence.
${AUTHOR_VOICE_PROMPT}\n`;
  }

  const corePromiseLine = config.corePromise?.trim()
    ? `\nCORE PROMISE (anchor to THIS one idea — do not drift to another promise): "${config.corePromise.trim()}"\n`
    : '';

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
${productSection}${corePromiseLine}
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
${config.copyType === 'headline' ? 'Also label the scroll-stopper with a "hook" field using EXACTLY one of: question, stat, contrarian, callout, bold_claim, pattern_interrupt, identity, before_after.\n' : ''}
Return JSON only:
{"id": "x1", "text": "your new ${typeLabel} text here", ${config.copyType === 'headline' ? '"hook": "stat", ' : ''}"rationale": "why this works"}`;

    const response = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 2000, reasoningEffort, responseFormat: { type: 'json_object' } });

    try {
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) cleanedResponse = cleanedResponse.slice(7);
      if (cleanedResponse.startsWith('```')) cleanedResponse = cleanedResponse.slice(3);
      if (cleanedResponse.endsWith('```')) cleanedResponse = cleanedResponse.slice(0, -3);

      let parsed;
      try {
        parsed = JSON.parse(cleanedResponse.trim());
      } catch {
        const repaired = attemptJsonRepair(cleanedResponse);
        if (repaired) {
          console.warn('⚠️ Single copy regen JSON truncated — repaired');
          parsed = JSON.parse(repaired);
        } else {
          throw new Error('JSON parse failed and repair unsuccessful');
        }
      }

      // Post-processing: sanitize generated copy text
      if (parsed.text) {
        parsed.text = sanitizeCopyText(parsed.text, { author: config.productContext?.author });
      }
      // Validate hook label (headlines only; strip any stray hook on body/CTA)
      parsed.hook = (config.copyType === 'headline' && isValidHook(parsed.hook)) ? parsed.hook : undefined;

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
 * The reference payload every image-generation path shares.
 *
 * `styleRefs` carries provenance, so the prompt builders can describe each image honestly
 * instead of assuming every reference is a proven winner. There is deliberately no
 * `refConversionContext` field: it is derived from `styleRefs` at the point of use, and
 * storing it alongside would be two sources of truth for one fact.
 */
export interface PrecomputedRefs {
  styleRefs: StyleReference[];
  productImages: Array<{ data: string; mimeType: string }>;
  refAnalysis: Awaited<ReturnType<typeof analyzeReferenceImages>>;
}

/**
 * Resolve + describe the reference set for a generation request.
 *
 * Previously duplicated three times (once per engine, once on the batch path) and already
 * drifted — only the batch copy did embedding-based selection, so a reroll pulled a different
 * reference set than the batch it belonged to. `resolveReferenceSet` is now the only selector.
 */
async function precomputeReferenceSet(config: {
  productContext?: ProductContext;
  audienceType: AudienceType;
  externalRefs?: StyleReference[];
  /** Cached style descriptors by reference id — Phase 7 fast path, flagged off by default. */
  descriptorsById?: Record<string, StyleDescriptor>;
  computeMissingEmbeddings?: boolean;
  onProgress?: (message: string) => void;
}): Promise<PrecomputedRefs> {
  const set = await resolveReferenceSet({
    productContext: config.productContext,
    audienceType: config.audienceType,
    externalRefs: config.externalRefs,
    computeMissingEmbeddings: config.computeMissingEmbeddings,
    descriptorsById: config.descriptorsById,
  });

  // FAST PATH (flagged off by default). Substituting cached per-image descriptors for the live
  // joint vision call is NOT a pure optimisation: analyzeReferenceImages describes what the
  // whole set has in common, and merging per-image descriptors only approximates that. It is
  // taken only when EVERY reference in the set has a usable cached descriptor — a partial
  // cache would silently narrow the style block while appearing to work.
  if (isDescriptorCacheEnabled() && set.styleRefs.length > 0) {
    const allCached = set.cachedDescriptors.every(d => d !== null);
    if (allCached) {
      const merged = mergeStyleDescriptors(set.cachedDescriptors as StyleDescriptor[]);
      if (merged) {
        console.log(`🎨 Style descriptor cache hit (${set.styleRefs.length} refs) — skipping the vision call`);
        return { styleRefs: set.styleRefs, productImages: set.productImages, refAnalysis: merged };
      }
    }
  }

  config.onProgress?.('ConversionIQ™ analyzing reference styles...');
  // Style analysis runs on the style references ONLY. Product mockups are identity
  // references, not style sources: blending them in pushed the model to restyle the
  // product instead of reproducing it 1:1.
  const refAnalysis = await analyzeReferenceImages(set.styleRefs);

  return { styleRefs: set.styleRefs, productImages: set.productImages, refAnalysis };
}

/**
 * The per-reference performance lines for a set. Only own-account winners appear — uploads and
 * external captures have no conversion figures, and a non-empty result is exactly the predicate
 * "this request may use measured wording".
 */
function refConversionContextFor(styleRefs: StyleReference[]): string[] {
  return buildReferenceBlock('own_winner', styleRefs.filter(r => r.source === 'own_winner'));
}

/**
 * Analyze reference images to extract specific visual characteristics
 * This enables precise style replication in generated images
 */
/**
 * Describe ONE image's visual style, for caching against an inspiration-library row.
 *
 * Exported for the ingest path so the vision call is paid once per image instead of once per
 * generation. Note this is a per-image descriptor: `analyzeReferenceImages` describes a SET
 * jointly, and mergeStyleDescriptors only approximates that — which is why the fast path that
 * consumes these is behind a flag. Returns null on any failure; the caller stores nothing and
 * generation falls back to the live joint call.
 */
export async function describeReferenceImage(
  image: { data: string; mimeType: string }
): Promise<StyleDescriptor | null> {
  try {
    const descriptor = await analyzeReferenceImages([image]);
    return isUsableDescriptor(descriptor) ? descriptor : null;
  } catch (error: unknown) {
    console.warn('Could not describe reference image:', error instanceof Error ? error.message : error);
    return null;
  }
}

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
 * Parse a base64 data URL into Gemini inlineData shape. Returns null for non-data URLs.
 */
function dataUrlToInline(dataUrl: string): { data: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

/**
 * Product fidelity inspector — compares the product as rendered in a generated ad against
 * the product mockup reference(s) and scores how exactly the design was replicated.
 *
 * Non-fatal by design: returns null when the check can't run (no key, parse failure, API
 * error) so the gate never blocks image generation.
 */
async function verifyProductFidelity(
  generatedImage: { data: string; mimeType: string },
  productImages: Array<{ data: string; mimeType: string }>,
  productName?: string
): Promise<{ score: number; issues: string[] } | null> {
  if (!isGeminiConfigured() || productImages.length === 0) return null;

  const inspectionPrompt = `You are a strict product-fidelity inspector for advertising creatives.

Compare the product${productName ? ` "${productName}"` : ''} as it appears in the GENERATED AD image against the PRODUCT MOCKUP reference image(s). Judge ONLY the product itself — ignore the scene, background, lighting style, props, and any headline text outside the product.

Score 0-100 how exactly the product's design is replicated:
- 100 = indistinguishable from the mockup (same artwork, exact title/author spelling, same fonts, colors, layout, proportions)
- Deduct heavily for: changed or substituted artwork, misspelled or altered title/author text, different fonts, shifted colors, changed layout or proportions, added/removed design elements (badges, stickers, extra text)
- Deduct lightly for: minor perspective/lighting differences from being placed in a new scene (these are expected and acceptable)
- 0 = a completely different product

List every concrete mismatch you find, most severe first.

Respond with ONLY this JSON (no markdown fences):
{"score": <0-100 integer>, "issues": ["specific mismatch 1", "specific mismatch 2"]}

If the product is not visible in the generated ad at all, return {"score": 0, "issues": ["product not visible in generated image"]}.`;

  const requestParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  // Send at most 2 mockups to keep the payload small — the first images are the primary design
  productImages.slice(0, 2).forEach((img, i) => {
    requestParts.push({ text: `PRODUCT MOCKUP ${i + 1} (reference design):` });
    requestParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });
  requestParts.push({ text: 'GENERATED AD (image under inspection):' });
  requestParts.push({ inlineData: { mimeType: generatedImage.mimeType, data: generatedImage.data } });
  requestParts.push({ text: inspectionPrompt });

  let body: string;
  try {
    body = JSON.stringify({
      contents: [{ parts: requestParts }],
      generationConfig: {
        temperature: 0, // Deterministic inspection
        maxOutputTokens: 800,
      },
    });
    requestParts.length = 0; // Free base64 references for GC during fetch
  } catch (serializationError) {
    console.warn('⚠️ Fidelity check: serialization failed (payload too large), skipping:', serializationError);
    requestParts.length = 0;
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_URL}/${TEXT_ANALYSIS_MODEL}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn(`⚠️ Fidelity check failed (${response.status}) — skipping gate`);
      return null;
    }

    const data = await response.json();
    const textPart = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);
    if (!textPart?.text) return null;

    let cleaned = textPart.text.trim();
    if (cleaned.includes('```json')) {
      cleaned = cleaned.split('```json')[1].split('```')[0];
    } else if (cleaned.includes('```')) {
      cleaned = cleaned.split('```')[1].split('```')[0];
    }
    const parsed = JSON.parse(cleaned.trim());
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    if (Number.isNaN(score)) return null;
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((i: unknown) => typeof i === 'string').slice(0, 8) : [];
    return { score, issues };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Fidelity check error — skipping gate: ${msg.substring(0, 200)}`);
    return null;
  }
}

/**
 * Generate an ad image using the selected provider (Gemini Nano Banana Pro or OpenAI GPT Image 2),
 * with automatic cross-provider fallback on failure. See the fallback policy in the body.
 */
export async function generateAdImage(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationIndex: number;
  totalVariations: number;
  similarityLevel?: number; // 0 = identical to references, 100 = completely different
  imageSize?: ImageSize; // Aspect ratio for generated images
  productContext?: ProductContext;
  /**
   * External inspiration references (competitor / market creative), already loaded with pixels.
   * They fill only the reference slots the account's own winners left empty, and the prompt
   * builders describe them as unproven — see lib/referenceProvenance.ts.
   */
  externalRefs?: StyleReference[];
  /** Cached style descriptors by reference id — Phase 7 fast path, flagged off by default. */
  descriptorsById?: Record<string, StyleDescriptor>;
  // Pre-computed reference data to avoid redundant API calls during parallel generation.
  // Style refs (winning ads) and product mockups (identity-locked) are kept SEPARATE so
  // each can be labeled for its distinct role in the generation request.
  precomputedRefs?: PrecomputedRefs;
  // Ad Library inspirations for thematic direction
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  // Headline to render directly into the generated image
  headlineText?: string;
  // Business type + campaign intent for hybrid accounts
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  // Image generation provider — 'gemini' (default) or 'openai' (gpt-image-2)
  imageModel?: ImageModel;
  // Format axis hint (BlitzScale grid): 'static_screenshot' | 'static_graphic'
  formatHint?: FormatType;
}): Promise<GeneratedImageResult> {
  const provider = config.imageModel ?? DEFAULT_IMAGE_MODEL_PROVIDER;

  // Cross-provider fallback: try the selected engine, then automatically fall over to the other on
  // any infra/account failure — billing hard limit, quota, timeout, 5xx, out-of-memory, or an
  // empty/garbled response. Safety/policy blocks are the one exception: re-thrown immediately, since
  // the same prompt would be refused by the other engine too. Fallback is per-image, so a single
  // batch can legitimately come back mixed-engine when one variation trips a transient failure.
  const runners: Record<ImageModel, { available: boolean; run: (fidelityFeedback?: string) => Promise<GeneratedImageResult> }> = {
    gemini: { available: isGeminiConfigured(), run: (fidelityFeedback?: string) => generateAdImageWithGemini({ ...config, fidelityFeedback }) },
    openai: { available: isOpenAIConfigured(), run: (fidelityFeedback?: string) => generateAdImageWithGptImage({ ...config, fidelityFeedback }) },
  };
  const order: ImageModel[] = provider === 'openai' ? ['openai', 'gemini'] : ['gemini', 'openai'];
  const attempts = order.filter(name => runners[name].available);

  if (attempts.length === 0) {
    throw new Error('No image generation API configured. Please contact your administrator.');
  }

  // Fidelity gate: when a product mockup exists, inspect the generated image against it
  // and retry ONCE on the same engine with corrective feedback if the product-match score
  // is below FIDELITY_GATE_THRESHOLD. Keeps whichever attempt replicated the product
  // better. Inspector failures are non-fatal — the image is returned unscored.
  const applyFidelityGate = async (engine: ImageModel, first: GeneratedImageResult): Promise<GeneratedImageResult> => {
    const productImages = config.precomputedRefs?.productImages
      ?? projectProductImages(config.productContext);
    if (productImages.length === 0) return first;

    const generated = dataUrlToInline(first.imageUrl);
    if (!generated) return first;

    const verdict = await verifyProductFidelity(generated, productImages, config.productContext?.name);
    if (!verdict) return first;

    if (verdict.score >= FIDELITY_GATE_THRESHOLD) {
      console.log(`🔍 Fidelity gate passed: ${verdict.score}/100`);
      return { ...first, fidelityScore: verdict.score, fidelityIssues: verdict.issues };
    }

    console.warn(`🔍 Fidelity gate FAILED (${verdict.score}/100): ${verdict.issues.join('; ').substring(0, 300)} — retrying once with corrective feedback`);
    try {
      const feedback = verdict.issues.length > 0 ? verdict.issues.join('; ') : 'The product did not match the mockup design.';
      const retry = await runners[engine].run(feedback);
      const retryInline = dataUrlToInline(retry.imageUrl);
      const retryVerdict = retryInline ? await verifyProductFidelity(retryInline, productImages, config.productContext?.name) : null;
      if (retryVerdict) {
        console.log(`🔍 Fidelity retry scored ${retryVerdict.score}/100 (first attempt: ${verdict.score})`);
        if (retryVerdict.score >= verdict.score) {
          return { ...retry, fidelityScore: retryVerdict.score, fidelityIssues: retryVerdict.issues };
        }
        return { ...first, fidelityScore: verdict.score, fidelityIssues: verdict.issues };
      }
      // Retry generated but couldn't be re-verified — prefer it (it had corrective feedback)
      return retry;
    } catch (retryErr: unknown) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.warn(`⚠️ Fidelity retry failed (${msg.substring(0, 150)}) — keeping first attempt`);
      return { ...first, fidelityScore: verdict.score, fidelityIssues: verdict.issues };
    }
  };

  let lastError: Error | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const name = attempts[i];
    try {
      if (i > 0) console.log(`🔁 Falling back to ${name} for image generation...`);
      return await applyFidelityGate(name, await runners[name].run());
    } catch (err: unknown) {
      // Content/policy block — the other engine will refuse the same prompt. Fail fast.
      if (err instanceof SafetyBlockError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      const next = attempts[i + 1];
      console.warn(`⚠️ ${name} image generation failed${next ? ` — falling back to ${next}` : ''}: ${lastError.message.substring(0, 150)}`);
    }
  }

  throw lastError ?? new Error('Image generation failed: no engine produced an image.');
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
  precomputedRefs?: PrecomputedRefs;
  // Ad Library inspirations for thematic direction
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  // Headline to render directly into the generated image
  headlineText?: string;
  // Business type + campaign intent for hybrid accounts
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  formatHint?: FormatType;
  // Corrective feedback from a failed fidelity-gate inspection (set on gate retries only)
  fidelityFeedback?: string;
}): Promise<GeneratedImageResult> {
  const similarity = config.similarityLevel ?? 30; // Default to 30% variation
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const sizeConfig = IMAGE_SIZE_OPTIONS.find(s => s.id === imageSize) || IMAGE_SIZE_OPTIONS[0];
  console.log(`🎨 Generating ad image with Gemini Nano Banana Pro ${config.variationIndex + 1}/${config.totalVariations} for ${config.audienceType} audience (${similarity}% variation, ${sizeConfig.dimensions})`);

  const visualAnalysis = config.analysisData?.visualAnalysis;
  const topAds = config.analysisData?.topAds || [];
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  // Pre-computed on the batch path so N variations share one selection + one vision call.
  // On a single-image reroll there is nothing to share, so resolve here — but skip embedding
  // computation, since the batch this reroll belongs to already populated the store and
  // recomputing would add n sequential network calls to an interactive action.
  const refs: PrecomputedRefs = config.precomputedRefs
    ?? await precomputeReferenceSet({ ...config, computeMissingEmbeddings: false });

  // StyleReference is structurally a { data, mimeType } — the inline-attachment code below
  // reads it directly, while the prompt builders read the provenance fields.
  const styleImages = refs.styleRefs;
  const productImages = refs.productImages;
  const refAnalysis = refs.refAnalysis;
  const refConversionContext = refConversionContextFor(refs.styleRefs);

  // Build a detailed prompt for Gemini.
  // When product mockups are attached, the task is framed as PRODUCT PLACEMENT (take the
  // exact product, build a scene around it) rather than free-form generation — this is the
  // single strongest lever for 1:1 product fidelity.
  const promptParts = productImages.length > 0
    ? [
        'TASK: Take the EXACT product shown in the [PRODUCT MOCKUP] image(s) and place it into a new, high-converting advertisement scene.',
        'The product must be a faithful 1:1 reproduction of the mockup — same artwork, text, fonts, colors, layout, and proportions. Only the scene around it is newly created, following the creative direction below.',
        '',
      ]
    : [
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

  // The creative direction must never be read as license to redesign the product
  if (productImages.length > 0) {
    promptParts.push(
      'SCOPE: The creative direction above governs the SCENE ONLY (environment, lighting, composition, mood, props). The product design itself is fixed by the [PRODUCT MOCKUP] image(s) and is exempt from ALL variation.',
      ''
    );
  }

  // If we have reference images, add explicit note about them.
  //
  // `refConversionContext` is built from own-account winners ONLY, so a non-empty list is
  // exactly the predicate "at least one reference has measured delivery data behind it".
  // The PROVEN CONVERSIONS claim must be gated on THAT, not on how many images are attached —
  // gating on the count told cold-start accounts that their uploads and competitor captures
  // were proven winners.
  const hasMeasuredRefs = refConversionContext.length > 0;
  if (styleImages.length + productImages.length > 0) {
    promptParts.push(
      `I have attached ${styleImages.length + productImages.length} reference images, each labeled with its role immediately before it:`,
      styleImages.length > 0
        ? (hasMeasuredRefs
            ? `- ${styleImages.length} labeled [STYLE REFERENCE]: ads with PROVEN CONVERSIONS — emulate their visual style for the scene (composition, lighting, color, mood), prioritizing the highest-converting image. Do NOT copy their products, text, or subjects.`
            : `- ${styleImages.length} labeled [STYLE REFERENCE]: reference ads with NO conversion data for this account — emulate their construction and visual style for the scene (composition, lighting, color, mood). They are UNPROVEN here: treat them as a hypothesis to test, not a formula that already works. Do NOT copy their products, text, or subjects.`)
        : '',
      productImages.length > 0 ? `- ${productImages.length} labeled [PRODUCT MOCKUP]: the exact product that must appear in the ad, reproduced 1:1.` : '',
    );

    // Include per-image conversion data so Gemini prioritizes the best-performing styles
    if (refConversionContext.length > 0) {
      promptParts.push('', 'CONVERSION PERFORMANCE DATA (prioritize visual patterns from highest-converting images):');
      refConversionContext.forEach(line => promptParts.push(`  ${line}`));
    }

    promptParts.push(
      '',
      styleImages.length > 0
        ? (hasMeasuredRefs
            ? 'Study the [STYLE REFERENCE] images and match the visual style of the highest-converting ones for the scene.'
            : 'Study the [STYLE REFERENCE] images and match their visual construction for the scene. None of them has performance data for this account, so there is no highest-converting one to prioritize.')
        : 'Study the [PRODUCT MOCKUP] image(s) carefully — every design detail matters.',
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

  // Inject campaign intent visual direction for hybrid accounts
  if (config.campaignIntent) {
    const imgIntentConfig = getCampaignIntentConfig(config.campaignIntent);
    promptParts.push(
      `CAMPAIGN INTENT: ${imgIntentConfig.label}`,
      `- ${imgIntentConfig.description}`,
      `- ${config.campaignIntent === 'purchase'
        ? 'Visual should emphasize the product, its value, and the purchase outcome — show what the buyer gets'
        : config.campaignIntent === 'quiz'
        ? 'Visual should evoke curiosity and self-discovery — abstract imagery of hidden layers, identity, or inner exploration. Avoid showing the product. The visual should make the viewer wonder "what will I discover about myself?"'
        : 'Visual should emphasize the transformation, the result of taking action — consultation, freedom, next step'}`,
      ''
    );
  }

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

  // Product mockup preservation override — must come AFTER the creative direction
  // so it takes precedence at high-similarity settings ("Bold & Different" tells the
  // model to "explore new visual directions", which it would otherwise apply to the
  // product cover too).
  if (productImages.length > 0) {
    promptParts.push(
      '',
      'PRODUCT MOCKUP PRESERVATION (NON-NEGOTIABLE — OVERRIDES CREATIVE DIRECTION):',
      'The [PRODUCT MOCKUP] image(s) attached are IDENTITY-LOCKED. You must reproduce the product itself EXACTLY as shown — treat it like photographing a real physical product placed into a new scene. Do NOT redesign, restyle, abstract, reimagine, or "improve" the product.',
      '',
      'FIDELITY CHECKLIST — every item must match the mockup exactly:',
      '  • Cover/packaging artwork and graphic elements — identical imagery, no substitutions or simplifications',
      '  • Title, subtitle, and author/brand name — exact spelling, casing, and wording, rendered sharp and legible',
      '  • Typography — same fonts, weights, sizes, and text placement',
      '  • Colors — the exact hues of the background, artwork, and text',
      '  • Layout and proportions — same arrangement and aspect ratio of all design elements',
      '  • Do NOT add new text, badges, logos, stickers, or design elements to the product',
      productImages.length > 1 ? '  • Multiple mockup images show the SAME product — use them together to understand its design fully' : '',
      '',
      'Creative variation (regardless of the % setting above, even at 100% / Bold & Different) applies ONLY to:',
      '  • The scene, environment, and background around the product',
      '  • Lighting, mood, atmosphere, and overall color grading',
      '  • Composition, camera angle, and framing',
      '  • Surrounding objects, models, hands, props, or context',
      '',
      'The product itself never changes. You are placing the existing product into different scenes — not redesigning it.'
    );
  }

  // Format axis directive (BlitzScale grid). Static-only in v1.
  if (config.formatHint === 'static_screenshot') {
    promptParts.push(
      '',
      'FORMAT — AUTHENTIC SCREENSHOT: Render this as a realistic phone/app screenshot (a real text message, DM, Stripe/revenue dashboard, results screen, or social post), NOT a polished marketing graphic. It should look genuinely captured and native to the platform. Authentic screenshots consistently out-convert designed graphics for proof-driven ads.'
    );
  } else if (config.formatHint === 'static_graphic') {
    promptParts.push(
      '',
      'FORMAT — POLISHED GRAPHIC: Render this as a clean, intentional, professionally designed marketing graphic.'
    );
  }

  // Fidelity-gate retry: surface the inspector's concrete mismatches so this attempt
  // corrects them instead of repeating the same drift
  if (config.fidelityFeedback) {
    promptParts.push(
      '',
      '🚨 A PREVIOUS ATTEMPT FAILED THE PRODUCT FIDELITY INSPECTION.',
      `Issues found: ${config.fidelityFeedback}`,
      'You MUST correct every issue above. Re-examine the [PRODUCT MOCKUP] image(s) detail by detail and reproduce the product EXACTLY this time.'
    );
  }

  promptParts.push('', IMAGE_SAFETY_DIRECTIVE);
  const prompt = promptParts.join('\n');
  console.log('📝 Gemini prompt:', prompt.substring(0, 300) + '...');

  // Build the request with reference images as inline data.
  // CRITICAL: every image is preceded by an inline text label declaring its role. Without
  // labels the model cannot tell style references apart from the identity-locked product
  // mockup, and applies "match the style" / "explore new directions" to the product itself.
  // Product mockups go LAST so they sit closest to the prompt (strongest attention anchor).
  const requestParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  styleImages.forEach((img, i) => {
    requestParts.push({
      text: `[STYLE REFERENCE ${i + 1} of ${styleImages.length}] A high-converting ad. Emulate its visual style for the scene only. Do NOT copy its product, text, or subject.`,
    });
    requestParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  });

  productImages.forEach((img, i) => {
    requestParts.push({
      text: `[PRODUCT MOCKUP ${i + 1} of ${productImages.length}] The EXACT product${config.productContext?.name ? ` "${config.productContext.name}"` : ''} — IDENTITY-LOCKED. Reproduce this design 1:1 in the generated ad: same artwork, text, fonts, colors, layout, and proportions.`,
    });
    requestParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  });

  console.log(`📸 Added ${styleImages.length} labeled style reference(s) + ${productImages.length} labeled product mockup(s) to request`);

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

  console.log(`📤 Sending request to Gemini with ${styleImages.length + productImages.length} reference images, aspect ratio: ${imageSize}`);

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
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout — reference images can be 25-50MB
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
        lastError = new Error(`Image generation timed out after 120s (${model})`);
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
 * Downscale a base64-encoded image for sending through the Vercel proxy.
 *
 * Vercel functions have a 4.5MB request body limit. The Gemini path goes
 * directly to Google's API (no Vercel function in between), but the OpenAI
 * path routes through /api/ai/images which IS subject to that limit. With 6
 * reference images at 1024px each, the JSON payload can exceed 4.5MB and
 * trigger 413 FUNCTION_PAYLOAD_TOO_LARGE.
 *
 * Downscaling to 768px JPEG @ 0.7 quality keeps each image under ~150KB,
 * leaving plenty of headroom even with 6 references. gpt-image-2 only uses
 * references for style guidance, so 768px is sufficient.
 */
async function downscaleImageForProxy(
  base64Data: string,
  mimeType: string,
  maxDim: number = 768,
  quality: number = 0.7
): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const data = dataUrl.split(',')[1];
        if (!data) {
          reject(new Error('Canvas toDataURL returned empty data'));
          return;
        }
        resolve({ data, mimeType: 'image/jpeg' });
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error('Failed to load reference image for downscale'));
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
}

/**
 * Generate an ad image using OpenAI gpt-image-2 (with gpt-image-1 fallback).
 *
 * Mirrors generateAdImageWithGemini's prompt structure, but routes through the
 * OpenAI image API. When reference images are present, the backend uses the
 * /v1/images/edits endpoint (multipart form-data); otherwise /v1/images/generations.
 *
 * Returns a base64 data URL for the generated image.
 */
async function generateAdImageWithGptImage(config: {
  audienceType: AudienceType;
  analysisData: ChannelAnalysisResult | null;
  variationIndex: number;
  totalVariations: number;
  similarityLevel?: number;
  imageSize?: ImageSize;
  productContext?: ProductContext;
  precomputedRefs?: PrecomputedRefs;
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  headlineText?: string;
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  // Corrective feedback from a failed fidelity-gate inspection (set on gate retries only)
  fidelityFeedback?: string;
}): Promise<GeneratedImageResult> {
  const similarity = config.similarityLevel ?? 30;
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const sizeConfig = IMAGE_SIZE_OPTIONS.find(s => s.id === imageSize) || IMAGE_SIZE_OPTIONS[0];
  console.log(`🎨 Generating ad image with OpenAI gpt-image ${config.variationIndex + 1}/${config.totalVariations} for ${config.audienceType} audience (${similarity}% variation, ${sizeConfig.dimensions})`);

  const visualAnalysis = config.analysisData?.visualAnalysis;
  const topAds = config.analysisData?.topAds || [];
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  // Identical resolution to the Gemini path — see generateAdImageWithGemini for why the
  // reroll path skips embedding computation.
  const refs: PrecomputedRefs = config.precomputedRefs
    ?? await precomputeReferenceSet({ ...config, computeMissingEmbeddings: false });

  const styleImages = refs.styleRefs;
  const productImages = refs.productImages;
  const refAnalysis = refs.refAnalysis;
  const refConversionContext = refConversionContextFor(refs.styleRefs);

  // Build prompt — same structure as the Gemini path so outputs are comparable.
  // With product mockups attached, frame the task as product placement (see Gemini path).
  const promptParts: string[] = productImages.length > 0
    ? [
        'TASK: Take the EXACT product shown in the PRODUCT MOCKUP image(s) and place it into a new, high-converting advertisement scene.',
        'The product must be a faithful 1:1 reproduction of the mockup — same artwork, text, fonts, colors, layout, and proportions. Only the scene around it is newly created, following the creative direction below.',
        '',
      ]
    : [
        'Generate a professional advertisement image that PRECISELY matches the provided reference style.',
        '',
      ];

  const getSimilarityInstructions = () => {
    if (similarity <= 20) {
      return `NEAR IDENTICAL replication (${similarity}% variation). Copy the exact visual DNA of the references.
MANDATORY STYLE REQUIREMENTS:
• VISUAL STYLE: ${refAnalysis.visualStyle}
• COLOR PALETTE: ${refAnalysis.colorPalette}
• COMPOSITION: ${refAnalysis.composition}
• LIGHTING: ${refAnalysis.lighting}
• MOOD: ${refAnalysis.mood}
• PRODUCT PRESENTATION: ${refAnalysis.productPresentation}
• KEY ELEMENTS: ${refAnalysis.keyElements.join(', ')}`;
    } else if (similarity <= 40) {
      return `SUBTLE VARIATIONS (${similarity}% variation). Strong style consistency with minor creative touches.
FOLLOW: visual style ${refAnalysis.visualStyle}; color palette ${refAnalysis.colorPalette}; lighting ${refAnalysis.lighting}; mood ${refAnalysis.mood}.`;
    } else if (similarity <= 60) {
      return `BALANCED MIX (${similarity}% variation). Brand consistency with moderate creative freedom.
USE: color palette ${refAnalysis.colorPalette}; mood ${refAnalysis.mood}; visual style influence ${refAnalysis.visualStyle}.`;
    } else if (similarity <= 80) {
      return `MORE CREATIVE (${similarity}% variation). Reference for quality and mood: ${refAnalysis.mood}. Explore fresh visual directions while maintaining professional advertising quality.`;
    }
    return `BOLD & DIFFERENT (${similarity}% variation). Use references only as a quality benchmark. Explore completely new visual directions.`;
  };

  promptParts.push(`CREATIVE DIRECTION: ${getSimilarityInstructions()}`, '');

  // See the note in the Gemini builder: a non-empty refConversionContext is the predicate
  // "at least one reference is an own-account winner with measured delivery data".
  const hasMeasuredRefs = refConversionContext.length > 0;
  if (styleImages.length + productImages.length > 0) {
    const productImgCount = productImages.length;
    const adRefCount = styleImages.length;
    promptParts.push(`I have attached ${adRefCount + productImgCount} REFERENCE IMAGES in this exact order:`);
    if (adRefCount > 0) {
      promptParts.push(hasMeasuredRefs
        ? `  • Images 1–${adRefCount}: STYLE references from ads with PROVEN CONVERSIONS. Their visual style (composition, color, lighting, mood) is what to emulate — subject to the creative direction setting above. Do NOT copy their products, text, or subjects.`
        : `  • Images 1–${adRefCount}: STYLE references with NO conversion data for this account. Their visual construction (composition, color, lighting, mood) is what to emulate — subject to the creative direction setting above. They are UNPROVEN here: treat them as a hypothesis to test, not a formula that already works. Do NOT copy their products, text, or subjects.`);
    }
    if (productImgCount > 0) {
      const start = adRefCount + 1;
      const end = adRefCount + productImgCount;
      promptParts.push(`  • Images ${start}–${end}: PRODUCT MOCKUPS. These show the exact product (cover art, packaging, title, author name, colors, layout). Their content is identity-locked and must be reproduced EXACTLY — not subject to the creative direction setting.`);
    }

    if (refConversionContext.length > 0) {
      promptParts.push('', 'CONVERSION PERFORMANCE DATA (prioritize highest-converting visual patterns):');
      refConversionContext.forEach(line => promptParts.push(`  ${line}`));
    }
    promptParts.push('', 'Study the style references for visual approach. Reproduce the product mockups verbatim.', '');
  }

  if (config.productContext) {
    promptParts.push(
      'PRODUCT CONTEXT:',
      `- Product: ${config.productContext.name}`,
      `- Author/Brand: ${config.productContext.author}`,
      `- Description: ${config.productContext.description}`,
      '',
      'The generated image MUST accurately represent this product.',
      ''
    );
  }

  promptParts.push(
    `TARGET AUDIENCE: ${config.audienceType.toUpperCase()} (${audienceAngle.awarenessLevel})`,
    `- Focus: ${audienceAngle.focus}`,
    `- Tone: ${audienceAngle.tone}`,
    `- Visual implication: ${config.audienceType === 'prospecting'
      ? 'Image should evoke curiosity and problem recognition'
      : config.audienceType === 'retargeting'
      ? 'Image should reinforce product credibility and mechanism'
      : 'Image should feel exclusive and premium'}`,
    ''
  );

  if (config.campaignIntent) {
    const intentConfig = getCampaignIntentConfig(config.campaignIntent);
    promptParts.push(
      `CAMPAIGN INTENT: ${intentConfig.label} — ${intentConfig.description}`,
      ''
    );
  }

  if (visualAnalysis) {
    promptParts.push('VISUAL ANALYSIS FROM HIGH-CONVERTING ADS:');
    if (visualAnalysis.winningVisualElements?.length) promptParts.push(`- Winning elements: ${visualAnalysis.winningVisualElements.slice(0, 5).join(', ')}`);
    if (visualAnalysis.colorPsychology) promptParts.push(`- Color strategy: ${visualAnalysis.colorPsychology}`);
    if (visualAnalysis.imageryPatterns) promptParts.push(`- Imagery patterns: ${visualAnalysis.imageryPatterns}`);
    if (visualAnalysis.psychologicalTriggers?.length) promptParts.push(`- Triggers: ${visualAnalysis.psychologicalTriggers.slice(0, 3).join(', ')}`);
    if (visualAnalysis.losingVisualElements?.length) promptParts.push(`- AVOID: ${visualAnalysis.losingVisualElements.slice(0, 3).join(', ')}`);
    promptParts.push('');
  }

  if (topAds.length > 0) {
    promptParts.push('TOP PERFORMING AD IMAGE DESCRIPTIONS:');
    topAds.slice(0, 3).forEach((ad, i) => {
      if (ad.imageAnalysis) promptParts.push(`${i + 1}. ${ad.imageAnalysis}`);
    });
    promptParts.push('');
  }

  if (config.adLibraryInspirations?.length) {
    promptParts.push('COMPETITOR/INDUSTRY INSPIRATION:');
    config.adLibraryInspirations.slice(0, 3).forEach((insp, i) => {
      const bodyPreview = insp.adCreativeBodies[0]?.substring(0, 200) || 'N/A';
      promptParts.push(`  ${i + 1}. ${insp.pageName} (${insp.durationDays} days): ${bodyPreview}`);
    });
    promptParts.push('');
  }

  if (config.headlineText) {
    promptParts.push(
      'CREATIVE REQUIREMENTS:',
      '- Professional advertising photography quality',
      '- Strong visual hierarchy with clear focal point',
      '- Photorealistic style unless references show otherwise',
      '',
      `This is variation ${config.variationIndex + 1} of ${config.totalVariations} — make it distinct while maintaining brand consistency.`,
      '',
      'HEADLINE TEXT IN IMAGE — CRITICAL:',
      `Render this EXACT headline into the image: "${config.headlineText}"`,
      '- Render the EXACT text — do NOT paraphrase, abbreviate, or change any words',
      '- Use large, bold, legible typography with high contrast',
      '- Position in upper third or center where it commands attention',
      `- Typography style: ${refAnalysis.textOverlays || 'bold, clean sans-serif with strong contrast'}`,
      '- Do NOT add any OTHER text, words, taglines, URLs, or numbers'
    );
  } else {
    promptParts.push(
      'CREATIVE REQUIREMENTS:',
      '- Professional advertising photography quality',
      '- Strong visual hierarchy with clear focal point',
      '- Clean composition with space for text overlays',
      '- Photorealistic style unless references show otherwise',
      '',
      `This is variation ${config.variationIndex + 1} of ${config.totalVariations} — create a unique variation while maintaining brand consistency.`,
      '',
      'IMPORTANT: Do NOT include any text, words, letters, or numbers in the image.'
    );
  }

  // Product mockup preservation override — must come AFTER the creative direction
  // so it takes precedence at high-similarity settings ("Bold & Different" tells the
  // model to "explore new visual directions", which it would otherwise apply to the
  // product cover too).
  if (productImages.length > 0) {
    promptParts.push(
      '',
      'PRODUCT MOCKUP PRESERVATION (NON-NEGOTIABLE — OVERRIDES CREATIVE DIRECTION):',
      'The PRODUCT MOCKUP image(s) attached are IDENTITY-LOCKED. You must reproduce the product itself EXACTLY as shown — treat it like photographing a real physical product placed into a new scene. Do NOT redesign, restyle, abstract, reimagine, or "improve" the product.',
      '',
      'FIDELITY CHECKLIST — every item must match the mockup exactly:',
      '  • Cover/packaging artwork and graphic elements — identical imagery, no substitutions or simplifications',
      '  • Title, subtitle, and author/brand name — exact spelling, casing, and wording, rendered sharp and legible',
      '  • Typography — same fonts, weights, sizes, and text placement',
      '  • Colors — the exact hues of the background, artwork, and text',
      '  • Layout and proportions — same arrangement and aspect ratio of all design elements',
      '  • Do NOT add new text, badges, logos, stickers, or design elements to the product',
      productImages.length > 1 ? '  • Multiple mockup images show the SAME product — use them together to understand its design fully' : '',
      '',
      'Creative variation (regardless of the % setting above, even at 100% / Bold & Different) applies ONLY to:',
      '  • The scene, environment, and background around the product',
      '  • Lighting, mood, atmosphere, and overall color grading',
      '  • Composition, camera angle, and framing',
      '  • Surrounding objects, models, hands, props, or context',
      '',
      'The product itself never changes. You are placing the existing product into different scenes — not redesigning it.'
    );
  }

  // Fidelity-gate retry: surface the inspector's concrete mismatches so this attempt
  // corrects them instead of repeating the same drift
  if (config.fidelityFeedback) {
    promptParts.push(
      '',
      '🚨 A PREVIOUS ATTEMPT FAILED THE PRODUCT FIDELITY INSPECTION.',
      `Issues found: ${config.fidelityFeedback}`,
      'You MUST correct every issue above. Re-examine the PRODUCT MOCKUP image(s) detail by detail and reproduce the product EXACTLY this time.'
    );
  }

  promptParts.push('', IMAGE_SAFETY_DIRECTIVE);
  const prompt = promptParts.join('\n');
  console.log('📝 GPT-Image prompt:', prompt.substring(0, 300) + '...');

  // Prepare reference images for the Vercel proxy (4.5MB body limit).
  // STYLE references are aggressively downscaled (768px @ JPEG 0.7) — they only inform
  // scene styling, so lossy compression is fine.
  // PRODUCT MOCKUPS are passed through UNCHANGED whenever they fit: Products.tsx already
  // bounds them at 1024px JPEG 0.8, and a second lossy re-encode (old behavior: 768px @
  // 0.7) blurred the cover text/artwork the model must reproduce 1:1 — a direct cause of
  // product drift. A CUMULATIVE byte budget (not a per-image cutoff) guards the proxy
  // limit: when the combined payload would overflow, mockups are re-encoded at
  // progressively lower — but still text-legible — settings, never as low as 768 @ 0.7.
  let proxyReferenceImages: Array<{ data: string; mimeType: string }> = [];
  if (styleImages.length + productImages.length > 0) {
    try {
      const downscaledStyle = await Promise.all(
        styleImages.map(ref => downscaleImageForProxy(ref.data, ref.mimeType))
      );
      // Budget in base64 chars (1 char = 1 JSON body byte), with headroom under the
      // 4.5MB proxy limit for the prompt and JSON framing.
      const PROXY_IMAGE_BUDGET = 3_800_000;
      const styleTotal = downscaledStyle.reduce((sum, ref) => sum + ref.data.length, 0);
      const mockupBudget = Math.max(PROXY_IMAGE_BUDGET - styleTotal, 1_000_000);

      let proxyMockups: Array<{ data: string; mimeType: string }> =
        productImages.map(ref => ({ data: ref.data, mimeType: ref.mimeType }));
      const REENCODE_STEPS = [
        { maxDim: 1024, quality: 0.85 },
        { maxDim: 896, quality: 0.8 },
      ] as const;
      for (const step of REENCODE_STEPS) {
        if (proxyMockups.reduce((sum, ref) => sum + ref.data.length, 0) <= mockupBudget) break;
        console.warn(`⚠️ Mockup payload exceeds proxy budget — re-encoding mockups at ${step.maxDim}px @ JPEG ${step.quality}`);
        proxyMockups = await Promise.all(
          productImages.map(ref => downscaleImageForProxy(ref.data, ref.mimeType, step.maxDim, step.quality))
        );
      }

      // Hard enforcement: if pathological inputs still overflow after the smallest
      // re-encode step, drop trailing mockups rather than send a request the proxy will
      // reject with 413. The first mockup (the primary design) is always kept — a single
      // 896px JPEG cannot exceed the budget alone. Compressing further instead would
      // recreate the 768@0.7 blur that caused product drift in the first place.
      let mockupTotal = proxyMockups.reduce((sum, ref) => sum + ref.data.length, 0);
      while (proxyMockups.length > 1 && mockupTotal > mockupBudget) {
        const dropped = proxyMockups.pop()!;
        mockupTotal -= dropped.data.length;
        console.warn(`⚠️ Proxy payload budget exhausted — dropped a product mockup from the request (${proxyMockups.length} kept)`);
      }

      // Order must match the prompt's "Images 1–N style, then product mockups" description
      proxyReferenceImages = [...downscaledStyle, ...proxyMockups];
      const totalKB = Math.round(proxyReferenceImages.reduce((sum, ref) => sum + ref.data.length * 0.75, 0) / 1024);
      console.log(`📦 Prepared ${downscaledStyle.length} downscaled style ref(s) + ${proxyMockups.length} mockup(s) (~${totalKB}KB total) for proxy`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Identity beats style: if preparation fails, still send the raw mockups (bounded at
      // upload time) rather than generating with no product reference at all.
      console.warn(`⚠️ Reference image preparation failed (${msg}); falling back to product mockups only`);
      proxyReferenceImages = productImages.map(ref => ({ data: ref.data, mimeType: ref.mimeType }));
    }
  }

  // Try gpt-image-2 first, fall back to gpt-image-1 if the model isn't available on this account
  const modelsToTry = [GPT_IMAGE_PRIMARY, GPT_IMAGE_FALLBACK];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    console.log(`🎯 Trying OpenAI image model: ${model}`);
    try {
      const requestBody: Record<string, unknown> = {
        model,
        prompt,
        size: sizeConfig.gptImageSize,
        quality: 'high',
        n: 1,
      };
      // Only attach reference images when present — backend uses /edits when present, /generations otherwise
      if (proxyReferenceImages.length > 0) {
        requestBody.referenceImages = proxyReferenceImages;
      }

      const response = await openaiProxy('images', requestBody);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ OpenAI image API error (${model}):`, response.status, errText.substring(0, 500));
        // Model-not-available errors should fall through to fallback model
        const isModelError = response.status === 404 || /model.*not.*found|does not (have|exist)|invalid.*model/i.test(errText);
        if (isModelError && model !== modelsToTry[modelsToTry.length - 1]) {
          lastError = new Error(`${model} not available — trying fallback`);
          console.warn(`⚠️ ${model} not available on this account, trying fallback...`);
          continue;
        }
        throw new Error(`Image generation error (${response.status}): ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      const result = data.data?.[0];
      if (!result) {
        throw new Error('OpenAI image API returned no results');
      }

      // gpt-image-1 / gpt-image-2 return b64_json by default; older models may return url
      let imageUrl: string;
      if (result.b64_json) {
        imageUrl = `data:image/png;base64,${result.b64_json}`;
      } else if (result.url) {
        imageUrl = result.url;
      } else {
        throw new Error('OpenAI image API response missing b64_json and url');
      }

      console.log(`✅ Image generated successfully with ${model}`);
      return {
        imageUrl,
        revisedPrompt: result.revised_prompt || prompt,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isFinalModel = model === modelsToTry[modelsToTry.length - 1];
      if (!isFinalModel) {
        console.warn(`⚠️ ${model} failed, trying fallback model...`, lastError.message);
      }
    }
  }

  throw lastError || new Error('OpenAI image generation failed: all models unavailable');
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
2. ${SPECIFICITY_PROMPT}
3. FORMATTING: NEVER use em dashes (—). Max 1 exclamation mark per body text. Zero in headlines.
4. ${PROMISE_OUTCOME_PROMPT}
5. ${META_AD_POLICY_PROMPT}`;

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
  ], { maxTokens: 8192, responseFormat: { type: 'json_object' } });

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

    let parsed;
    try {
      parsed = JSON.parse(cleanedResponse.trim());
    } catch {
      const repaired = attemptJsonRepair(cleanedResponse);
      if (repaired) {
        console.warn('⚠️ Ad copy JSON truncated — repaired');
        parsed = JSON.parse(repaired);
      } else {
        throw new Error('JSON parse failed and repair unsuccessful');
      }
    }

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
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
}): Promise<VideoStoryboard> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  console.log(`🎬 Generating video storyboard for ${config.audienceType} audience`);

  const winningPatterns = config.analysisData?.winningPatterns;
  const visualAnalysis = config.analysisData?.visualAnalysis;
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  // Build intent-aware system prompt for hybrid accounts
  const storyboardIntentConfig = (config.campaignIntent)
    ? getCampaignIntentConfig(config.campaignIntent)
    : null;
  const storyboardIntentContext = storyboardIntentConfig
    ? `\nThis is a ${storyboardIntentConfig.label.toUpperCase()} campaign. ${storyboardIntentConfig.aiConversionLanguage}`
    : '';

  const systemPrompt = `You are an expert video ad creative director specializing in short-form social media ads.
Create compelling video ad storyboards that follow the proven AIDA (Attention, Interest, Desire, Action) framework.
Your storyboards should be production-ready with clear visual direction.${storyboardIntentContext}`;

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
  ], { maxTokens: 8192, responseFormat: { type: 'json_object' } });

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

    let parsed;
    try {
      parsed = JSON.parse(cleanedResponse.trim());
    } catch {
      const repaired = attemptJsonRepair(cleanedResponse);
      if (repaired) {
        console.warn('⚠️ Video storyboard JSON truncated — repaired');
        parsed = JSON.parse(repaired);
      } else {
        throw new Error('JSON parse failed and repair unsuccessful');
      }
    }
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
 * When 4:5 aspect ratio is requested, generates at 9:16 and crops to 4:5 client-side.
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
  // Business type + campaign intent for hybrid accounts
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
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

  // 4:5 is not natively supported by Veo — generate at 9:16 and crop after download
  const is4x5 = videoConfig.aspectRatio === '4:5';
  const veoAspectRatio = is4x5 ? '9:16' as const : videoConfig.aspectRatio === '16:9' ? '16:9' as const : '9:16' as const;

  console.log(`🎬 Generating video ${variationIdx + 1}/${totalVars} with Veo (${modelId}), ${durationSec}s ${videoConfig.aspectRatio}${is4x5 ? ' (via 9:16→crop)' : ''} ${videoConfig.resolution}`);

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
    `Create a ${durationSec}-second social media advertisement video (${veoAspectRatio} aspect ratio).`,
    '',
    `HOOK (first 1-2 seconds) — THIS IS THE MOST IMPORTANT PART:`,
    `Open with an attention-grabbing visual that stops the scroll.`,
  );

  // 4:5 composition guidance — the video will be center-cropped from 9:16
  if (is4x5) {
    promptParts.push(
      '',
      'CRITICAL FRAMING CONSTRAINT (4:5 crop):',
      'This 9:16 video will be center-cropped to 4:5 aspect ratio for Meta feeds.',
      'The top 15% and bottom 15% of the frame WILL BE CUT OFF.',
      '- Keep ALL important content (faces, text, product, action) in the center 70% of the vertical frame',
      '- Place text overlays in the center-middle area, never near the very top or bottom edge',
      '- Frame subjects from chest/shoulders up, not full-body shots',
      '- Avoid placing any critical visual elements in the top or bottom margins',
    );
  }

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

  // Inject campaign intent for hybrid accounts
  if (config.campaignIntent) {
    const veoIntentConfig = getCampaignIntentConfig(config.campaignIntent);
    promptParts.push(
      `CAMPAIGN INTENT: ${veoIntentConfig.label}`,
      `- ${veoIntentConfig.description}`,
      `- ${veoIntentConfig.aiConversionLanguage}`,
      ''
    );
  }

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

  // Video structure guidance — optimized for Meta feed autoplay behavior
  const bodyEnd = Math.floor(durationSec * 0.7);
  promptParts.push(
    'VIDEO STRUCTURE (optimized for Meta feed autoplay):',
    `- 0-1s: PATTERN INTERRUPT — a jarring visual change, unexpected motion, or bold text flash that breaks the scroll. The viewer decides in under 1 second whether to stop. This must feel different from everything else in their feed.`,
    `- 1-2s: HOOK — immediately deliver the core promise or provoke curiosity with "${headline}". Show, don't tell.`,
    `- 2-${bodyEnd}s: BODY — demonstrate the transformation, mechanism, or proof. Show the product/outcome in action. Build desire with before/after contrast if applicable.`,
    `- ${bodyEnd}-${durationSec}s: CTA — clear, urgent call to action. End on a strong visual that makes the viewer want to learn more.`,
    '',
    'PACING:',
    '- Cut every 1.5-2 seconds — short attention span, every moment must earn its screen time',
    '- No static frames longer than 1.5 seconds — always have motion, transitions, or text animating',
    '- Build visual intensity toward the CTA — start simple, end dynamic',
    ''
  );

  // UGC-style direction + audio cues (Veo 3.1 native audio)
  promptParts.push(
    'STYLE & AUDIO:',
    '- UGC (user-generated content) aesthetic — authentic, relatable, shot-on-phone feel, NOT corporate or stock-footage-like',
    '- Quick, punchy transitions — jump cuts, zoom-ins, swipe transitions',
    `- Confident, energetic voiceover delivering: "${headline}" — speak with authority and conviction`,
    '- Background music: upbeat, trending, energetic — the kind that makes people watch longer',
    '- Text overlays: LARGE, bold, high-contrast against background, centered in frame, readable even on small mobile screens without sound',
    '- Captions/subtitles for key spoken words — 85% of Meta videos are watched on mute',
  );

  // Variation diversity
  if (totalVars > 1) {
    promptParts.push(
      '',
      `This is variation ${variationIdx + 1} of ${totalVars}. Create a distinctly different creative approach while maintaining the same core message.`
    );
  }

  promptParts.push('', IMAGE_SAFETY_DIRECTIVE);
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
    aspectRatio: veoAspectRatio,
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
        console.log('✅ Veo video downloaded to blob successfully');

        videoUrl = URL.createObjectURL(videoBlob);
      } else {
        console.warn('⚠️ Video download failed, preview unavailable. File ref preserved for publish.');
      }

      const costPerSec = 0.15; // veo-3.1-fast
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
  /**
   * External inspiration references (competitor / market creative), already loaded with pixels.
   * They fill only the reference slots the account's own winners left empty, and the prompt
   * builders describe them as unproven — see lib/referenceProvenance.ts.
   */
  externalRefs?: StyleReference[];
  /** Cached style descriptors by reference id — Phase 7 fast path, flagged off by default. */
  descriptorsById?: Record<string, StyleDescriptor>;

  similarityLevel?: number;
  imageSize?: ImageSize;
  productContext?: ProductContext;
  adLibraryInspirations?: import('../types').AdLibraryInspiration[];
  imageHeadlines?: string[];
  onProgress?: (message: string) => void;
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  imageModel?: ImageModel;
  formatHint?: FormatType;
}): Promise<{ images: GeneratedImageResult[]; indexedResults: (GeneratedImageResult | null)[]; imageError?: string }> {
  const imageSize = config.imageSize ?? DEFAULT_IMAGE_SIZE;
  const imageModel = config.imageModel ?? DEFAULT_IMAGE_MODEL_PROVIDER;
  console.log(`🖼️ Regenerating ${config.variationCount} image(s) for ${config.audienceType} audience using ${imageModel}`);

  // Pre-compute reference images and analysis ONCE before parallel generation.
  // Style refs (winning ads) and product mockups stay separate so the engines can label
  // each image with its role — style-to-emulate vs identity-locked product.
  let precomputedRefs: PrecomputedRefs | undefined;

  // Pre-compute reference data when refAnalysis is needed.
  // - Gemini path always uses refAnalysis (Gemini-2.5-flash text analysis of references)
  // - OpenAI path also uses the same refAnalysis to build the prompt
  const needsPrecompute = (imageModel === 'openai' && isOpenAIConfigured())
    || (imageModel === 'gemini' && isGeminiConfigured());
  if (needsPrecompute) {
    // Resolved ONCE and shared across every variation: one selection, one vision call.
    precomputedRefs = await precomputeReferenceSet(config);
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
        externalRefs: config.externalRefs,
        descriptorsById: config.descriptorsById,
        precomputedRefs,
        adLibraryInspirations: config.adLibraryInspirations,
        headlineText,
        businessType: config.businessType,
        campaignIntent: config.campaignIntent,
        imageModel,
        formatHint: config.formatHint,
      });
    });
    const batchResults = await Promise.allSettled(batchPromises);
    allResults.push(...batchResults);
  }

  // Free reference image memory now that all images are generated
  if (precomputedRefs) {
    precomputedRefs.styleRefs.length = 0;
    precomputedRefs.productImages.length = 0;
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
    if (errorMessage.includes('timed out')) {
      imageError = `${images.length} of ${config.variationCount} images generated before timeout. You can regenerate the failed slots individually, or try reducing the number of variations.`;
    } else if (errorMessage.includes('429') || errorMessage.includes('quota')) {
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
  /**
   * External inspiration references (competitor / market creative), already loaded with pixels.
   * They fill only the reference slots the account's own winners left empty, and the prompt
   * builders describe them as unproven — see lib/referenceProvenance.ts.
   */
  externalRefs?: StyleReference[];
  /** Cached style descriptors by reference id — Phase 7 fast path, flagged off by default. */
  descriptorsById?: Record<string, StyleDescriptor>;
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
  // Business type + campaign intent for hybrid accounts
  businessType?: import('../types/organization').BusinessType;
  campaignIntent?: import('../types/organization').CampaignIntent;
  // Image generation provider — 'gemini' (default) or 'openai' (gpt-image-2)
  imageModel?: ImageModel;
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
      externalRefs: config.externalRefs,
      descriptorsById: config.descriptorsById,
      adLibraryInspirations: config.adLibraryInspirations,
      imageHeadlines: config.imageHeadlines,
      onProgress: config.onProgress,
      businessType: config.businessType,
      campaignIntent: config.campaignIntent,
      imageModel: config.imageModel,
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
            businessType: config.businessType,
            campaignIntent: config.campaignIntent,
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
      businessType: config.businessType,
      campaignIntent: config.campaignIntent,
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
      campaignIntent: config.campaignIntent,
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
    campaignIntent: config.campaignIntent,
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
  campaignIntent?: import('../types/organization').CampaignIntent;
}): Promise<TextAdCopyResult> {
  if (!isOpenAIConfigured()) {
    throw new Error('AI API not configured. Please contact support.');
  }

  const reasoningEffort = config.reasoningEffort ?? 'medium';
  const btConfig = getBusinessTypeConfig(config.businessType || 'ecommerce');
  const audienceAngle = AUDIENCE_ANGLES[config.audienceType];

  // Intent-specific context for hybrid accounts
  const textIntentConfig = (config.campaignIntent)
    ? getCampaignIntentConfig(config.campaignIntent)
    : null;
  const textConversionLanguage = textIntentConfig?.aiConversionLanguage || btConfig.aiConversionLanguage;
  const analysis = config.analysisData;

  let contextSection = '';

  // Inject channel analysis if available
  if (analysis) {
    // Mode-aware vocabulary — a seeded account has no measured "top performers" to point at.
    const cc = condensedCopyFor(analysis);
    const seededProfile = cc.showConversionRate === false;
    contextSection += `
=== ${cc.textAdHeader} ===
${analysis.executiveSummary || ''}

${healthScoreLine(analysis, 'Health Score')}${cc.textAdIntro}
`;
    if (analysis.winningPatterns) {
      const wp = analysis.winningPatterns;
      if (wp.headlines?.length) {
        contextSection += `\n${seededProfile ? 'Headline directions to try' : 'Winning headline patterns'}: ${wp.headlines.join('; ')}`;
      }
      if (wp.emotionalTriggers?.length) {
        contextSection += `\n${seededProfile ? 'Emotional triggers to try' : 'Emotional triggers that work'}: ${wp.emotionalTriggers.join('; ')}`;
      }
    }
  }

  // Inject product context if available
  if (config.productContext) {
    contextSection += `
=== PRODUCT/SERVICE ===
Name: ${config.productContext.name}
${config.productContext.author ? `Creator (write AS them — do NOT print this name as a byline in the ad): ${config.productContext.author}` : ''}
${config.productContext.description || ''}
VOICE: Speak directly to the reader as the product's own creator. NEVER name the creator in the third person and never print a credit or byline such as "by ${config.productContext.author || 'the author'}". The only third-person voice allowed is a real customer testimonial, quoted verbatim with its own attribution.
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
- This is for ${btConfig.conversionNoun.toLowerCase()} generation (${textConversionLanguage})
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
    { reasoningEffort, maxTokens: 8192, responseFormat: { type: 'json_object' } },
  );

  // Parse response
  let cleanedResponse = response.trim();
  if (cleanedResponse.startsWith('```json')) cleanedResponse = cleanedResponse.slice(7);
  if (cleanedResponse.startsWith('```')) cleanedResponse = cleanedResponse.slice(3);
  if (cleanedResponse.endsWith('```')) cleanedResponse = cleanedResponse.slice(0, -3);

  try {
    let parsed;
    try {
      parsed = JSON.parse(cleanedResponse.trim());
    } catch {
      const repaired = attemptJsonRepair(cleanedResponse);
      if (repaired) {
        console.warn('⚠️ Text ad copy JSON truncated — repaired');
        parsed = JSON.parse(repaired);
      } else {
        throw new Error('JSON parse failed and repair unsuccessful');
      }
    }

    // Sanitize all text
    for (const item of [...(parsed.primaryTexts || []), ...(parsed.highlightTexts || []), ...(parsed.anchorTexts || [])]) {
      if (item.text) item.text = sanitizeCopyText(item.text, { author: config.productContext?.author });
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
