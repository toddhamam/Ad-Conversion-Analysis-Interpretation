import { describe, it, expect } from 'vitest';
import { resolveGridPlan, GRID_SHAPES, GRID_SHAPE_VALUES } from './gridPlan';
import { GRID_CELL_CAP } from './axisTags';
import type { GridCell, BlitzImageStrategy } from '../services/openaiApi';

function config(overrides: Partial<{ angles: string[]; hooks: string[]; callouts: string[] }> = {}) {
  return {
    angles: ['pain'],
    hooks: ['question'],
    callouts: [],
    ...overrides,
  } as never;
}

const READY = { hasCorePromise: true, hasSavedPromises: false };

function cell(id: string, overrides: Partial<GridCell> = {}): GridCell {
  return {
    id,
    angle: 'pain',
    hook: 'question',
    headline: `Headline ${id}`,
    body: 'body',
    cta: 'cta',
    rationale: 'why',
    ...overrides,
  } as GridCell;
}

/** Stand-ins for the collaborators the specs delegate to. */
const expandStub = (base: GridCell, callouts: string[]): GridCell[] =>
  callouts.map(c => ({ ...base, id: `${base.id}_${c}`, callout: c, headline: c }));
const slotStub = (cells: GridCell[], strategy: BlitzImageStrategy) => ({
  slotCount: strategy === 'single' ? 1 : cells.length,
  slotForCell: cells.map((_, i) => (strategy === 'single' ? 0 : i)),
  slotLabels: strategy === 'single' ? ['shared'] : cells.map(c => c.id),
});
const countStub = (sizes: { angles: number; hooks: number; cells: number }) => ({
  single: 1,
  per_angle: sizes.angles,
  per_hook: sizes.hooks,
  per_ad: sizes.cells,
});

// ---------------------------------------------------------------------------
// 1. Contract — every shape must answer every question
// ---------------------------------------------------------------------------

describe('shape table', () => {
  it('covers every GridShape', () => {
    // If a GridShape is added without an entry here, the flow would get `undefined` at every
    // call site rather than a type error, so this is the runtime backstop.
    for (const shape of GRID_SHAPE_VALUES) {
      expect(GRID_SHAPES[shape]).toBeDefined();
      expect(typeof GRID_SHAPES[shape].label).toBe('string');
      expect(GRID_SHAPES[shape].label.length).toBeGreaterThan(0);
      expect(GRID_SHAPES[shape].description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. angle_hook — the pre-existing behaviour must be unchanged
// ---------------------------------------------------------------------------

describe('angle_hook', () => {
  const spec = GRID_SHAPES.angle_hook;

  it('multiplies angles by hooks', () => {
    expect(spec.plannedCellCount(config({ angles: ['a', 'b'], hooks: ['x', 'y', 'z'] }))).toBe(6);
  });

  it('requires a hook', () => {
    expect(spec.blockReason(config({ hooks: [] }))).toBe('Select at least one hook');
    expect(spec.blockReason(config())).toBeNull();
  });

  it('passes angles and hooks through to the copy request unchanged', () => {
    const c = config({ angles: ['a', 'b'], hooks: ['x', 'y'] });
    expect(spec.copyRequest(c)).toEqual({ angles: ['a', 'b'], hooks: ['x', 'y'] });
  });

  it('does not expand the generated cells', () => {
    const generated = [cell('1'), cell('2')];
    expect(spec.expandCells(generated, config(), expandStub)).toBe(generated);
  });

  it('delegates image planning and strategy counts to the shared planners', () => {
    const cells = [cell('1'), cell('2')];
    expect(spec.planImages(cells, 'per_ad', slotStub).slotCount).toBe(2);
    expect(spec.strategyCounts({ angles: 3, hooks: 4, cells: 12 }, countStub).per_ad).toBe(12);
  });

  it('charges for every slot it plans', () => {
    expect(spec.generatedImageCount({ slotCount: 4, slotForCell: [], slotLabels: [] })).toBe(4);
  });

  it('keeps the strategy selector meaningful and composites nothing', () => {
    expect(spec.strategySelectable).toBe(true);
    expect(spec.compositesOverlays).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. callout_matrix
// ---------------------------------------------------------------------------

describe('callout_matrix', () => {
  const spec = GRID_SHAPES.callout_matrix;

  it('counts callouts, not the angle-hook product', () => {
    expect(spec.plannedCellCount(config({ angles: ['a'], hooks: ['x', 'y'], callouts: ['1', '2', '3'] }))).toBe(3);
  });

  it('requires exactly one angle so the callout is the only variable', () => {
    expect(spec.blockReason(config({ angles: ['a', 'b'], callouts: ['1'] })))
      .toBe('A callout matrix tests ONE angle — deselect the others');
  });

  it('requires at least one callout', () => {
    expect(spec.blockReason(config({ callouts: [] }))).toBe('Add at least one avatar callout');
    expect(spec.blockReason(config({ callouts: ['x'] }))).toBeNull();
  });

  it('pins the hook and takes one angle regardless of what is selected', () => {
    expect(spec.copyRequest(config({ angles: ['a', 'b'], hooks: ['x', 'y'] })))
      .toEqual({ angles: ['a'], hooks: ['callout'] });
  });

  it('expands one generated cell across every callout', () => {
    const result = spec.expandCells([cell('base')], config({ callouts: ['p', 'q'] }), expandStub);
    expect(result.map(c => c.callout)).toEqual(['p', 'q']);
  });

  it('caps the expansion at the grid cell cap', () => {
    const callouts = Array.from({ length: GRID_CELL_CAP + 10 }, (_, i) => `c${i}`);
    expect(spec.expandCells([cell('base')], config({ callouts }), expandStub)).toHaveLength(GRID_CELL_CAP);
  });

  it('yields nothing when copy generation came back empty', () => {
    expect(spec.expandCells([], config({ callouts: ['p'] }), expandStub)).toEqual([]);
  });

  it('gives every cell its own slot but charges for exactly one image', () => {
    // The heart of the design: N slots, 1 generation, N-1 canvas composites.
    const cells = [cell('1', { callout: 'p' }), cell('2', { callout: 'q' }), cell('3', { callout: 'r' })];
    const plan = spec.planImages(cells, 'single', slotStub);

    expect(plan.slotCount).toBe(3);
    expect(plan.slotForCell).toEqual([0, 1, 2]);
    expect(plan.slotLabels).toEqual(['p', 'q', 'r']);
    expect(spec.generatedImageCount(plan)).toBe(1);
  });

  it('labels a slot by its headline when a callout is somehow missing', () => {
    expect(spec.planImages([cell('1')], 'single', slotStub).slotLabels).toEqual(['Headline 1']);
  });

  it('reports one render for every strategy, which is why the selector is hidden', () => {
    expect(spec.strategyCounts({ angles: 9, hooks: 9, cells: 9 }, countStub))
      .toEqual({ single: 1, per_angle: 1, per_hook: 1, per_ad: 1 });
    expect(spec.strategySelectable).toBe(false);
    expect(spec.compositesOverlays).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. resolveGridPlan — shared rules and their ordering
// ---------------------------------------------------------------------------

describe('resolveGridPlan', () => {
  it('reports the most fundamental unmet requirement first', () => {
    // The disabled button shows exactly one reason, so ordering decides which one the user
    // sees. Missing an angle blocks everything else from being meaningful.
    expect(resolveGridPlan('callout_matrix', config({ angles: [], callouts: [] }), READY).blockReason)
      .toBe('Select at least one angle');
  });

  it('reports the shape rule before the shared core-promise rule', () => {
    const plan = resolveGridPlan('callout_matrix', config({ callouts: [] }), {
      hasCorePromise: false,
      hasSavedPromises: false,
    });
    expect(plan.blockReason).toBe('Add at least one avatar callout');
  });

  it('adapts the core-promise wording to whether any are saved', () => {
    const base = config({ callouts: ['x'] });
    expect(resolveGridPlan('callout_matrix', base, { hasCorePromise: false, hasSavedPromises: false }).blockReason)
      .toBe('Add a Core Promise to continue');
    expect(resolveGridPlan('callout_matrix', base, { hasCorePromise: false, hasSavedPromises: true }).blockReason)
      .toBe('Pick or add a Core Promise to continue');
  });

  it('blocks over the cell cap and clamps the reported count', () => {
    const callouts = Array.from({ length: GRID_CELL_CAP + 1 }, (_, i) => `c${i}`);
    const plan = resolveGridPlan('callout_matrix', config({ callouts }), READY);

    expect(plan.overCap).toBe(true);
    expect(plan.cellCount).toBe(GRID_CELL_CAP);
    expect(plan.blockReason).toContain(String(GRID_CELL_CAP));
  });

  it('returns no block reason for a valid configuration', () => {
    const plan = resolveGridPlan('angle_hook', config({ angles: ['a', 'b'], hooks: ['x', 'y'] }), READY);
    expect(plan.blockReason).toBeNull();
    expect(plan.cellCount).toBe(4);
    expect(plan.overCap).toBe(false);
  });
});
