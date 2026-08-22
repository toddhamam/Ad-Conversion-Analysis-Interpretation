// Merging cached per-item style descriptors into the single joint descriptor the image
// engines consume.
//
// WHY THIS IS NOT FREE. `analyzeReferenceImages` analyses the whole reference set TOGETHER and
// returns ONE descriptor — the model sees three images and describes what they have in common.
// A cached descriptor is per-image, so reconstructing the joint view means merging, and a
// merge is an approximation of what the joint call would have said. That is a real change to
// generation quality, not a pure optimisation, which is why the fast path is behind a flag and
// why this module is separate and testable rather than inlined at the call site.

/** Matches the return shape of analyzeReferenceImages. */
export interface StyleDescriptor {
  visualStyle: string;
  colorPalette: string;
  composition: string;
  keyElements: string[];
  mood: string;
  lighting: string;
  textOverlays: string;
  productPresentation: string;
}

/**
 * Case-insensitive, order-preserving dedupe. Same primitive as `unionLists` in analysisMode.ts
 * — first occurrence wins, so the highest-ranked reference's phrasing survives.
 */
function unionPhrases(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const value = (raw || '').trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

/**
 * Join distinct text fields with '; '.
 *
 * Deduped case-insensitively because three references from the same advertiser routinely
 * produce three identical descriptions, and repeating one phrase three times in the prompt
 * weights it three times.
 */
function joinDistinct(values: string[], limit: number): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = (raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out.join('; ');
}

/** How many distinct phrases each merged text field may carry into the prompt. */
const MAX_PHRASES_PER_FIELD = 3;
/** keyElements is a list the prompt enumerates, so it needs a tighter ceiling. */
const MAX_KEY_ELEMENTS = 8;

/**
 * Merge per-image descriptors into one.
 *
 * Returns null for an empty input so the caller falls back to the live joint call rather than
 * feeding the engines an empty descriptor — an empty style block is worse than a slow one.
 */
export function mergeStyleDescriptors(descriptors: StyleDescriptor[]): StyleDescriptor | null {
  const usable = descriptors.filter(Boolean);
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0];

  return {
    visualStyle: joinDistinct(usable.map(d => d.visualStyle), MAX_PHRASES_PER_FIELD),
    colorPalette: joinDistinct(usable.map(d => d.colorPalette), MAX_PHRASES_PER_FIELD),
    composition: joinDistinct(usable.map(d => d.composition), MAX_PHRASES_PER_FIELD),
    keyElements: unionPhrases(usable.map(d => d.keyElements ?? [])).slice(0, MAX_KEY_ELEMENTS),
    mood: joinDistinct(usable.map(d => d.mood), MAX_PHRASES_PER_FIELD),
    lighting: joinDistinct(usable.map(d => d.lighting), MAX_PHRASES_PER_FIELD),
    textOverlays: joinDistinct(usable.map(d => d.textOverlays), MAX_PHRASES_PER_FIELD),
    productPresentation: joinDistinct(usable.map(d => d.productPresentation), MAX_PHRASES_PER_FIELD),
  };
}

/** Every field a usable descriptor must actually carry. */
const REQUIRED_FIELDS: Array<keyof StyleDescriptor> = [
  'visualStyle', 'colorPalette', 'composition', 'mood', 'lighting', 'textOverlays', 'productPresentation',
];

/**
 * Whether a stored descriptor is complete enough to substitute for a live analysis.
 *
 * A partially-populated record is worse than none: it silently narrows the style block while
 * looking like it worked.
 */
export function isUsableDescriptor(value: unknown): value is StyleDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  if (!Array.isArray(d.keyElements)) return false;
  return REQUIRED_FIELDS.every(field => typeof d[field] === 'string' && (d[field] as string).trim().length > 0);
}

/** Feature flag. Off by default — see the module header for why this is not a pure win. */
export function isDescriptorCacheEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_DESCRIPTOR_CACHE === 'true';
}
