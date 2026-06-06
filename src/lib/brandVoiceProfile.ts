// Per-ad-account Brand Voice & Guidelines profile — scoped localStorage persistence.
//
// Mirrors the Products storage idiom (scopedStorage + a single base key), but stores ONE object
// per account rather than a list. The profile is the authoritative per-account voice injected into
// every copy prompt (see buildBrandVoiceContextString in services/openaiApi.ts).

import { getScopedItem, setScopedItem, removeScopedItem } from './scopedStorage';
import type { BrandVoiceProfile, Testimonial } from '../services/openaiApi';

const STORAGE_KEY = 'convertra_brand_voice';

/** The "top N" social-proof corpus is intentionally small — quality over quantity, and prompt-token safe. */
export const MAX_TESTIMONIALS = 5;

function genId(prefix = 'brand'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** A blank testimonial card for the UI repeater. Starts unapproved so it is excluded from prompts until vetted. */
export function createEmptyTestimonial(): Testimonial {
  return { id: genId('tm'), quote: '', attribution: '', result: '', theme: '', approved: false };
}

/** A blank profile with safe defaults. `enabled` starts true so a saved profile takes effect immediately. */
export function createEmptyBrandVoiceProfile(): BrandVoiceProfile {
  const now = new Date().toISOString();
  return {
    id: genId(),
    enabled: true,
    locked: false,
    voiceSummary: '',
    tonality: '',
    toneAvoid: '',
    pointOfView: '',
    readingLevel: '',
    rhythm: '',
    signaturePhrases: [],
    avatar: '',
    bigIdea: '',
    testimonials: [],
    spellingLocale: 'US',
    bannedWords: [],
    requiredDisclaimers: [],
    emojiPolicy: 'sparing',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Normalize a parsed object into a complete BrandVoiceProfile, filling any missing fields from the
 * empty template. Keeps forward/backward compatibility if the shape grows over time.
 */
function normalize(raw: Partial<BrandVoiceProfile> | null): BrandVoiceProfile {
  const base = createEmptyBrandVoiceProfile();
  if (!raw || typeof raw !== 'object') return base;
  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : base.signaturePhrases;
  // Coerce stored testimonials into a clean, capped list: drop non-objects, trim strings, require a
  // non-empty quote, backfill ids, and never exceed MAX_TESTIMONIALS.
  const asTestimonials = (v: unknown): Testimonial[] => {
    if (!Array.isArray(v)) return [];
    const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
    return v
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map((t) => ({
        id: typeof t.id === 'string' && t.id ? t.id : genId(),
        quote: str(t.quote),
        attribution: str(t.attribution) || undefined,
        result: str(t.result) || undefined,
        theme: str(t.theme) || undefined,
        approved: typeof t.approved === 'boolean' ? t.approved : false,
      }))
      .filter((t) => !!t.quote)
      .slice(0, MAX_TESTIMONIALS);
  };
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    locked: typeof raw.locked === 'boolean' ? raw.locked : base.locked,
    signaturePhrases: asArray(raw.signaturePhrases),
    bannedWords: asArray(raw.bannedWords),
    requiredDisclaimers: asArray(raw.requiredDisclaimers),
    testimonials: asTestimonials(raw.testimonials),
    spellingLocale: raw.spellingLocale ?? base.spellingLocale,
    emojiPolicy: raw.emojiPolicy ?? base.emojiPolicy,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

/** Load the current account's profile, or null when none has been saved. */
export function loadBrandVoiceProfile(): BrandVoiceProfile | null {
  try {
    const stored = getScopedItem(STORAGE_KEY);
    if (!stored) return null;
    return normalize(JSON.parse(stored));
  } catch {
    return null;
  }
}

/** Persist the profile for the current account, stamping updatedAt. Mirrors the Products save guard. */
export function saveBrandVoiceProfile(profile: BrandVoiceProfile): { success: boolean; error?: string } {
  try {
    const toStore: BrandVoiceProfile = { ...profile, updatedAt: new Date().toISOString() };
    const json = JSON.stringify(toStore);
    setScopedItem(STORAGE_KEY, json);
    // setScopedItem swallows quota errors after a retry — verify the write actually landed.
    if (getScopedItem(STORAGE_KEY) !== json) {
      return { success: false, error: 'Could not save — your browser storage is full.' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Could not save the brand voice profile.' };
  }
}

/** Remove the current account's profile entirely. */
export function clearBrandVoiceProfile(): void {
  removeScopedItem(STORAGE_KEY);
}
