/**
 * Shared creative-axis tag contract for the BlitzScale grid-format ad system.
 *
 * A single source of truth for the {angle, hook, format} axes used across copy
 * generation, publishing (encoded into the Meta ad name), and channel analysis
 * (parsed back out of the ad name to attribute winners per axis).
 *
 * Pure module: imports only the ConceptType *type* from openaiApi (erased at
 * compile time), so there is no runtime circular dependency.
 */
import type { ConceptType } from '../services/openaiApi';

// An angle usable in the grid — every concept angle except the auto-select sentinel.
export type GridAngle = Exclude<ConceptType, 'auto'>;

// The first 3 seconds — the scroll-stopping lever. Framework's 4 + our existing extras.
export type HookType =
  | 'question' | 'stat' | 'contrarian' | 'callout'      // BlitzScale's 4 (grid axis)
  | 'bold_claim' | 'pattern_interrupt' | 'identity' | 'before_after'; // extras (single mode)

// Production style. v1 is image-only; video formats are deferred.
export type FormatType = 'static_graphic' | 'static_screenshot';

// Encoded into the ad name (a/h/f only). The core promise is batch context, not an
// attribution axis, so it stays package-only and is NOT part of this tag.
export interface AxisTag {
  angle: GridAngle;
  hook?: HookType;
  format?: FormatType;
}

// ---------------------------------------------------------------------------
// Runtime sources of truth (the *types* above are erased, so validation and
// default selection need real values).
// ---------------------------------------------------------------------------

// Every concrete angle. Keep in sync with ConceptType (minus 'auto') — the
// compile-time guard below fails the build if a new ConceptType is added but
// not listed here. `satisfies` rejects any invalid/extra entry.
export const GRID_ANGLE_VALUES = [
  'cognitive_dissonance',
  'social_proof',
  'fear_elimination',
  'product_benefits',
  'transformation',
  'urgency_scarcity',
  'authority',
  'pain',
  'contrarian_pov',
] as const satisfies readonly GridAngle[];

// Compile-time completeness check: if a GridAngle is missing from GRID_ANGLE_VALUES
// this type resolves to `never` and the assignment below fails to build.
type _AssertGridAnglesComplete =
  Exclude<GridAngle, (typeof GRID_ANGLE_VALUES)[number]> extends never ? true : never;
const _gridAnglesComplete: _AssertGridAnglesComplete = true;
void _gridAnglesComplete;

const HOOK_VALUES = [
  'question', 'stat', 'contrarian', 'callout',
  'bold_claim', 'pattern_interrupt', 'identity', 'before_after',
] as const satisfies readonly HookType[];

const FORMAT_VALUES = ['static_graphic', 'static_screenshot'] as const satisfies readonly FormatType[];

// Single source of truth for the hook axis — display label (UI) + promptHint (AI prompts).
export const HOOKS: Record<HookType, { label: string; promptHint: string }> = {
  question: { label: 'Question', promptHint: 'opens a curiosity-gap question the reader needs answered' },
  stat: { label: 'Stat', promptHint: 'opens with a concrete, specific number that reads as proof' },
  contrarian: { label: 'Contrarian', promptHint: 'directly disagrees with a belief the prospect or the industry holds' },
  callout: { label: 'Callout', promptHint: 'names the avatar directly to pre-qualify the right person' },
  bold_claim: { label: 'Bold Claim', promptHint: 'makes a bold, confident promise up front' },
  pattern_interrupt: { label: 'Pattern Interrupt', promptHint: 'says something unexpected that breaks the scroll' },
  identity: { label: 'Identity', promptHint: 'speaks to who the reader is or wants to become' },
  before_after: { label: 'Before/After', promptHint: 'contrasts the current painful state with the desired outcome' },
};

// Display labels for UI chips/pickers — derived from HOOKS (single source of truth).
export const HOOK_LABELS = Object.fromEntries(
  (Object.keys(HOOKS) as HookType[]).map(k => [k, HOOKS[k].label]),
) as Record<HookType, string>;

// Enumerated hook menu for AI prompts that offer the full hook set.
export const HOOK_PROMPT_MENU = (Object.keys(HOOKS) as HookType[])
  .map(k => `"${k}" — ${HOOKS[k].promptHint}`)
  .join('; ');

export const FORMAT_LABELS: Record<FormatType, string> = {
  static_graphic: 'Graphic',
  static_screenshot: 'Screenshot',
};

// Grid defaults — the framework's 4 angles and 4 hooks.
export const DEFAULT_GRID_ANGLES = ['pain', 'transformation', 'social_proof', 'contrarian_pov'] as const satisfies readonly GridAngle[];
export const DEFAULT_GRID_HOOKS = ['question', 'stat', 'contrarian', 'callout'] as const satisfies readonly HookType[];

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function isValidAngle(s: string | undefined): s is GridAngle {
  return !!s && (GRID_ANGLE_VALUES as readonly string[]).includes(s);
}
export function isValidHook(s: string | undefined): s is HookType {
  return !!s && (HOOK_VALUES as readonly string[]).includes(s);
}
export function isValidFormat(s: string | undefined): s is FormatType {
  return !!s && (FORMAT_VALUES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Ad-name token: build (publish) + parse (analysis)
// Format: [CI|a:pain|h:callout|f:static_screenshot] <readable name>
// ---------------------------------------------------------------------------

const MAX_AD_NAME = 180;     // keep well within Meta's ad-name limit
const HEADLINE_MAX = 30;     // matches the existing legacy naming

// Enum values are controlled ASCII snake_case, so no escaping is needed; strip
// the token delimiters defensively in case a value is ever mis-set.
function sanitizeTokenValue(v: string): string {
  return v.replace(/[|[\]]/g, '');
}

function buildToken(tag: AxisTag): string {
  const parts = [`a:${sanitizeTokenValue(tag.angle)}`];
  if (tag.hook) parts.push(`h:${sanitizeTokenValue(tag.hook)}`);
  if (tag.format) parts.push(`f:${sanitizeTokenValue(tag.format)}`);
  return `[CI|${parts.join('|')}]`;
}

/**
 * Build a Meta ad name. When `tag` is undefined the legacy name is preserved
 * verbatim — `CI Ad N - …` for images, `CI Video Ad N - …` for videos — so
 * untagged (single-mode / legacy) ads do not regress.
 */
export function buildAdName(
  tag: AxisTag | undefined,
  index: number,
  headline: string,
  mediaType: 'image' | 'video',
): string {
  const clean = (headline || '').replace(/\s+/g, ' ').trim();
  const legacyPrefix = mediaType === 'video' ? 'CI Video Ad' : 'CI Ad';

  if (!tag) {
    return `${legacyPrefix} ${index + 1} - ${clean.substring(0, HEADLINE_MAX)}`.substring(0, MAX_AD_NAME);
  }

  const token = buildToken(tag);
  const mediaWord = mediaType === 'video' ? 'Video Ad' : 'Ad';
  const readable = `${mediaWord} ${index + 1} - ${clean || 'untitled'}`;
  return `${token} ${readable}`.substring(0, MAX_AD_NAME);
}

/**
 * Parse an axis tag out of an ad name. Returns undefined for legacy/untagged
 * names or when the angle is missing/invalid (angle is required for a usable tag).
 */
export function parseAxisTag(adName: string | undefined): AxisTag | undefined {
  if (!adName) return undefined;
  const match = adName.match(/^\[CI\|([^\]]+)\]/);
  if (!match) return undefined;

  let angle: GridAngle | undefined;
  let hook: HookType | undefined;
  let format: FormatType | undefined;

  for (const pair of match[1].split('|')) {
    const sep = pair.indexOf(':');
    if (sep === -1) continue;
    const key = pair.slice(0, sep);
    const val = pair.slice(sep + 1);
    if (key === 'a' && isValidAngle(val)) angle = val;
    else if (key === 'h' && isValidHook(val)) hook = val;
    else if (key === 'f' && isValidFormat(val)) format = val;
  }

  if (!angle) return undefined;
  return { angle, ...(hook ? { hook } : {}), ...(format ? { format } : {}) };
}
