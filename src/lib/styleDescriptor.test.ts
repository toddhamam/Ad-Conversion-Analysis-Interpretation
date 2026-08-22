import { describe, it, expect } from 'vitest';
import { mergeStyleDescriptors, isUsableDescriptor, type StyleDescriptor } from './styleDescriptor';

function descriptor(overrides: Partial<StyleDescriptor> = {}): StyleDescriptor {
  return {
    visualStyle: 'Clean studio product photography',
    colorPalette: 'Warm neutrals',
    composition: 'Centered product',
    keyElements: ['product', 'flat backdrop'],
    mood: 'Confident',
    lighting: 'Soft key light',
    textOverlays: 'Single bold line',
    productPresentation: 'Front-facing',
    ...overrides,
  };
}

describe('mergeStyleDescriptors', () => {
  it('returns null for an empty set so the caller falls back to a live analysis', () => {
    // An empty style block is worse than a slow one — it silently strips the style direction
    // out of the prompt entirely.
    expect(mergeStyleDescriptors([])).toBeNull();
  });

  it('passes a single descriptor through untouched', () => {
    const only = descriptor();
    expect(mergeStyleDescriptors([only])).toBe(only);
  });

  it('joins distinct text fields', () => {
    const merged = mergeStyleDescriptors([
      descriptor({ mood: 'Confident' }),
      descriptor({ mood: 'Playful' }),
    ]);
    expect(merged?.mood).toBe('Confident; Playful');
  });

  it('deduplicates identical phrases case-insensitively', () => {
    // Three references from one advertiser routinely produce three identical descriptions.
    // Repeating a phrase three times in the prompt weights it three times.
    const merged = mergeStyleDescriptors([
      descriptor({ mood: 'Confident' }),
      descriptor({ mood: 'confident' }),
      descriptor({ mood: 'CONFIDENT' }),
    ]);
    expect(merged?.mood).toBe('Confident');
  });

  it('caps how many phrases reach the prompt', () => {
    const merged = mergeStyleDescriptors([
      descriptor({ visualStyle: 'a' }),
      descriptor({ visualStyle: 'b' }),
      descriptor({ visualStyle: 'c' }),
      descriptor({ visualStyle: 'd' }),
    ]);
    expect(merged?.visualStyle).toBe('a; b; c');
  });

  it('unions keyElements, order-preserving and deduped', () => {
    const merged = mergeStyleDescriptors([
      descriptor({ keyElements: ['product', 'shadow'] }),
      descriptor({ keyElements: ['Product', 'model'] }),
    ]);
    expect(merged?.keyElements).toEqual(['product', 'shadow', 'model']);
  });

  it('drops blank fields rather than emitting empty separators', () => {
    const merged = mergeStyleDescriptors([
      descriptor({ lighting: '' }),
      descriptor({ lighting: 'Hard flash' }),
    ]);
    expect(merged?.lighting).toBe('Hard flash');
  });
});

describe('isUsableDescriptor', () => {
  it('accepts a complete descriptor', () => {
    expect(isUsableDescriptor(descriptor())).toBe(true);
  });

  it('rejects a partially-populated record', () => {
    // A partial descriptor is worse than none: it narrows the style block while looking as
    // though the cache worked.
    expect(isUsableDescriptor(descriptor({ mood: '' }))).toBe(false);
    expect(isUsableDescriptor(descriptor({ lighting: '   ' }))).toBe(false);
  });

  it('rejects a missing keyElements array', () => {
    const rest: Record<string, unknown> = { ...descriptor() };
    delete rest.keyElements;
    expect(isUsableDescriptor(rest)).toBe(false);
  });

  it('rejects non-objects without throwing', () => {
    expect(isUsableDescriptor(null)).toBe(false);
    expect(isUsableDescriptor(undefined)).toBe(false);
    expect(isUsableDescriptor('a string')).toBe(false);
    expect(isUsableDescriptor([])).toBe(false);
    expect(isUsableDescriptor(42)).toBe(false);
  });
});
