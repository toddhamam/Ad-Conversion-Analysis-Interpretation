// Per-ad-account Brand Voice & Guidelines profile — scoped localStorage persistence.
//
// Mirrors the Products storage idiom (scopedStorage + a single base key), but stores ONE object
// per account rather than a list. The profile is the authoritative per-account voice injected into
// every copy prompt (see buildBrandVoiceContextString in services/openaiApi.ts).

import { getScopedItem, setScopedItem, removeScopedItem } from './scopedStorage';
import type { BrandVoiceProfile } from '../services/openaiApi';

const STORAGE_KEY = 'convertra_brand_voice';

function genId(): string {
  return `brand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    locked: typeof raw.locked === 'boolean' ? raw.locked : base.locked,
    signaturePhrases: asArray(raw.signaturePhrases),
    bannedWords: asArray(raw.bannedWords),
    requiredDisclaimers: asArray(raw.requiredDisclaimers),
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
