// One typed dispatcher for BlitzScale grid shapes.
//
// WHY THIS EXISTS. Adding the callout matrix as a second grid shape initially meant a
// `shape === 'callout_matrix' ? … : …` ternary at every question the grid flow asks — cell
// count, block reason, what to request from the copy generator, how to expand the result, how
// many images to render, how to map cells to slots, what to charge. That is thirteen branches
// spread across a 4000-line component, and every future shape would add thirteen more.
//
// Instead the shape resolves ONCE into a spec, and the flow just asks the spec. Adding a third
// shape is one entry in GRID_SHAPES and zero changes to the component. This is the same idiom
// as MODE_PROMPT in services/analysisContext.ts and MODE_COPY in channelInsightsCopy.ts: a
// lookup keyed by the one persisted fact, rather than a ternary at each use site.
//
// Pure module — no React, no storage, no network. Unit-tested in gridPlan.test.ts.

import {
  GRID_CELL_CAP,
  DEFAULT_GRID_HOOKS,
  type GridShape,
  type GridAngle,
  type HookType,
} from './axisTags';
import type { GridCell, BlitzImageStrategy } from '../services/openaiApi';

/** What the operator has configured. The only input any spec method needs. */
export interface GridConfig {
  angles: GridAngle[];
  hooks: HookType[];
  callouts: string[];
}

/** Which cells map to which rendered image, and what each image slot is called. */
export interface BlitzImagePlan {
  slotCount: number;
  /** `images[slotForCell[i]]` is the image for cell i. */
  slotForCell: number[];
  slotLabels: string[];
}

export interface GridShapeSpec {
  /** Radio-button copy for the shape picker. */
  label: string;
  description: string;

  /** How the angle picker reads in this shape — singular when only one angle is meaningful. */
  angleLabel: string;
  angleHint(config: GridConfig): string;

  /** Cells this configuration will produce, before GRID_CELL_CAP is applied. */
  plannedCellCount(config: GridConfig): number;

  /** First unmet SHAPE-SPECIFIC requirement, or null. Shared rules stay with the caller. */
  blockReason(config: GridConfig): string | null;

  /** What to ask the copy generator for. */
  copyRequest(config: GridConfig): { angles: GridAngle[]; hooks: HookType[] };

  /** Turn the generator's output into the final cell set. */
  expandCells(generated: GridCell[], config: GridConfig, expand: CalloutExpander): GridCell[];

  /** Map kept cells to image slots. */
  planImages(keptCells: GridCell[], strategy: BlitzImageStrategy, fallback: SlotPlanner): BlitzImagePlan;

  /** Per-strategy render-count preview for the strategy selector. */
  strategyCounts(sizes: StrategySizes, fallback: StrategyCounter): Record<BlitzImageStrategy, number>;

  /**
   * Images actually sent to the model — i.e. what is charged. Diverges from `slotCount` for
   * shapes that composite locally rather than generating every slot.
   */
  generatedImageCount(plan: BlitzImagePlan): number;

  /** True when the remaining slots are composited from the first generated image. */
  compositesOverlays: boolean;

  /** Whether the image-strategy selector is meaningful for this shape. */
  strategySelectable: boolean;
}

export type CalloutExpander = (base: GridCell, callouts: string[]) => GridCell[];
export type SlotPlanner = (cells: GridCell[], strategy: BlitzImageStrategy) => BlitzImagePlan;
export type StrategySizes = { angles: number; hooks: number; cells: number };
export type StrategyCounter = (sizes: StrategySizes) => Record<BlitzImageStrategy, number>;

// ---------------------------------------------------------------------------

const ANGLE_HOOK: GridShapeSpec = {
  label: 'Angle × Hook',
  description: 'Every angle against every hook. Tests messaging strategy.',
  angleLabel: 'Angles',
  angleHint: config => `The strategic frame — each becomes a row. ${config.angles.length} selected.`,

  plannedCellCount: config => config.angles.length * config.hooks.length,

  blockReason: config => (config.hooks.length === 0 ? 'Select at least one hook' : null),

  copyRequest: config => ({ angles: config.angles, hooks: config.hooks }),

  expandCells: generated => generated,

  planImages: (keptCells, strategy, fallback) => fallback(keptCells, strategy),

  strategyCounts: (sizes, fallback) => fallback(sizes),

  generatedImageCount: plan => plan.slotCount,

  compositesOverlays: false,
  strategySelectable: true,
};

const CALLOUT_MATRIX: GridShapeSpec = {
  label: 'Avatar Callout Matrix',
  description:
    'One angle, one image, many callouts. Tests who you name — "Dads over 40 need this". Costs 1 image credit for the whole batch.',
  angleLabel: 'Angle',
  angleHint: config =>
    `A callout matrix tests ONE angle so the callout is the only variable. ${config.angles.length} selected.`,

  plannedCellCount: config => config.callouts.length,

  blockReason: config => {
    if (config.angles.length > 1) return 'A callout matrix tests ONE angle — deselect the others';
    if (config.callouts.length === 0) return 'Add at least one avatar callout';
    return null;
  },

  // One cell's worth of copy, with the hook pinned. The copy is then SHARED across every
  // callout: the variable under test is which person gets named, so regenerating copy per
  // callout would confound it with copy variance.
  copyRequest: config => ({ angles: config.angles.slice(0, 1), hooks: ['callout'] }),

  expandCells: (generated, config, expand) =>
    generated.length > 0 ? expand(generated[0], config.callouts).slice(0, GRID_CELL_CAP) : [],

  // Every cell gets its own slot because every cell carries its own rendered callout — but
  // only the first is generated (see generatedImageCount); the rest are canvas composites.
  planImages: keptCells => ({
    slotCount: keptCells.length,
    slotForCell: keptCells.map((_, i) => i),
    slotLabels: keptCells.map(c => c.callout || c.headline),
  }),

  // Every strategy collapses to one render, which is why the selector is hidden for this shape.
  strategyCounts: () => ({ single: 1, per_angle: 1, per_hook: 1, per_ad: 1 }),

  generatedImageCount: () => 1,

  compositesOverlays: true,
  strategySelectable: false,
};

export const GRID_SHAPES: Record<GridShape, GridShapeSpec> = {
  angle_hook: ANGLE_HOOK,
  callout_matrix: CALLOUT_MATRIX,
};

export const GRID_SHAPE_VALUES = ['angle_hook', 'callout_matrix'] as const satisfies readonly GridShape[];

// ---------------------------------------------------------------------------
// Resolved plan
// ---------------------------------------------------------------------------

/** Everything the config step needs to know, resolved once. */
export interface ResolvedGridPlan {
  spec: GridShapeSpec;
  /** Cells that will actually be produced, after the cap. */
  cellCount: number;
  overCap: boolean;
  /** First unmet requirement across shared AND shape-specific rules, or null. */
  blockReason: string | null;
}

/**
 * Resolve the config into the answers the flow needs.
 *
 * Shared requirements (an angle, a core promise, the cell cap) live here because they hold for
 * every shape; only genuinely shape-specific rules are delegated. Ordering matters — the first
 * unmet requirement is what the disabled button explains, so the most fundamental comes first.
 */
export function resolveGridPlan(
  shape: GridShape,
  config: GridConfig,
  context: { hasCorePromise: boolean; hasSavedPromises: boolean }
): ResolvedGridPlan {
  const spec = GRID_SHAPES[shape];
  const planned = spec.plannedCellCount(config);
  const overCap = planned > GRID_CELL_CAP;

  const blockReason =
    config.angles.length === 0
      ? 'Select at least one angle'
      : spec.blockReason(config)
        ?? (!context.hasCorePromise
          ? context.hasSavedPromises
            ? 'Pick or add a Core Promise to continue'
            : 'Add a Core Promise to continue'
          : overCap
            ? `Reduce to ${GRID_CELL_CAP} or fewer creatives to generate`
            : null);

  return { spec, cellCount: Math.min(planned, GRID_CELL_CAP), overCap, blockReason };
}

/** Hooks a shape actually uses, for shapes that pin them. Exported for the config summary. */
export function effectiveHooks(shape: GridShape, config: GridConfig): HookType[] {
  const requested = GRID_SHAPES[shape].copyRequest(config).hooks;
  return requested.length > 0 ? requested : [...DEFAULT_GRID_HOOKS];
}
