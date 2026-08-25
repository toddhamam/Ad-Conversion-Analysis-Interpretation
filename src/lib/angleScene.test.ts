// The angle scene grammar is the whole reason a four-angle Blitz grid stops coming back as four
// re-lightings of one photograph. These tests hold the two properties that make that true:
// completeness (every angle has a scene) and DISTINCTNESS (no two angles describe the same
// picture) — a duplicated entry would silently reintroduce the convergence this exists to fix.
import { describe, it, expect } from 'vitest';

import {
  ANGLE_SCENES,
  ANGLE_DIRECTIVE_HEADER,
  buildAngleDirectiveBlock,
  visualDirectionFor,
} from './angleScene';
import { GRID_ANGLE_VALUES, type GridAngle } from './axisTags';

describe('angle scenes — completeness', () => {
  it('covers every angle the grid can select', () => {
    // Record<GridAngle, …> makes this a compile-time guarantee too, but the runtime check is what
    // catches an entry that exists yet is blank.
    for (const angle of GRID_ANGLE_VALUES) {
      const scene = ANGLE_SCENES[angle];
      expect(scene, angle).toBeDefined();
      expect(scene.name.trim(), `${angle}.name`).not.toBe('');
      // The direction fields must be real direction — a two-word placeholder is what the old
      // `visualDirection` one-liners were, and they are what the model could not act on.
      for (const field of ['subject', 'moment', 'composition', 'light', 'avoid'] as const) {
        expect(scene[field].trim().length, `${angle}.${field}`).toBeGreaterThan(30);
      }
    }
  });

  it('states an explicit anti-pattern for every angle', () => {
    // `avoid` is the field that does the work: each angle collapses into a specific generic shot
    // when under-specified, so every entry must actually forbid something.
    for (const angle of GRID_ANGLE_VALUES) {
      expect(ANGLE_SCENES[angle].avoid, angle).toContain('Do NOT');
    }
  });
});

describe('angle scenes — distinctness', () => {
  const fields = ['subject', 'moment', 'composition', 'light', 'avoid'] as const;

  it.each(fields)('gives every angle its own %s', field => {
    const values = GRID_ANGLE_VALUES.map(a => ANGLE_SCENES[a][field]);
    expect(new Set(values).size).toBe(GRID_ANGLE_VALUES.length);
  });

  it('never describes two angles with the same one-line visual direction', () => {
    const lines = GRID_ANGLE_VALUES.map(visualDirectionFor);
    expect(new Set(lines).size).toBe(GRID_ANGLE_VALUES.length);
  });
});

describe('angle directive block', () => {
  it('is inert without an angle', () => {
    // Every call that cannot assert an angle — 'auto', or a pooled image shared by disagreeing
    // cells — must keep the exact prompt it had before this existed.
    expect(buildAngleDirectiveBlock(undefined)).toEqual([]);
    expect(buildAngleDirectiveBlock(null)).toEqual([]);
    expect(buildAngleDirectiveBlock('not_an_angle' as GridAngle)).toEqual([]);
  });

  it('emits every field of the scene it was given', () => {
    const text = buildAngleDirectiveBlock('pain').join('\n');
    const scene = ANGLE_SCENES.pain;

    expect(text).toContain(ANGLE_DIRECTIVE_HEADER);
    expect(text).toContain(scene.name);
    expect(text).toContain(scene.subject);
    expect(text).toContain(scene.moment);
    expect(text).toContain(scene.composition);
    expect(text).toContain(scene.light);
    expect(text).toContain(scene.avoid);
  });

  it('tells the model the angle must be visible in the picture, not just the copy', () => {
    // The failure being guarded against is a technically-on-brief image that would serve any
    // angle equally well — which is what a caption-only angle produces.
    const text = buildAngleDirectiveBlock('contrarian_pov').join('\n');
    expect(text).toContain('SCENE ITSELF');
    expect(text).toContain('would serve any other angle equally well has failed');
  });

  it('defers to the references for finish and to the angle for the scene', () => {
    // Without this the angle directive and the similarity ladder read as a straight contradiction,
    // and the model resolves it by ignoring whichever it read first.
    const text = buildAngleDirectiveBlock('transformation').join('\n');
    expect(text).toContain('favour the angle for SUBJECT, MOMENT and COMPOSITION');
    expect(text).toContain('favour the references for production quality');
  });

  it('produces a distinct block per angle', () => {
    const blocks = GRID_ANGLE_VALUES.map(a => buildAngleDirectiveBlock(a).join('\n'));
    expect(new Set(blocks).size).toBe(GRID_ANGLE_VALUES.length);
  });
});
