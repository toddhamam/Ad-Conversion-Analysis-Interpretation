// Where the pixels go in a showcase composite — the pure half of the compositor.
//
// WHY THIS EXISTS. `vitest.config.ts` runs in a node environment with no jsdom, deliberately,
// so anything touching `document.createElement('canvas')` or `new Image()` cannot be tested at
// all — which is why `textAdCanvas.ts` has no tests. Splitting the compositor along that line
// puts every DECISION in here, where it can be asserted, and leaves the renderer as a loop that
// walks descriptors issuing draw calls. Same idiom as `gridPlan.ts`.
//
// THE MODULE NEVER SEES A PIXEL. `planShowcase` takes natural dimensions and returns rectangles.
// That is the whole reason it is testable, so keep image data out of these signatures.
//
// Pure module — no React, no storage, no network, no canvas. Unit-tested in showcaseLayout.test.ts.

/** A composite arrangement. Every one of these draws REAL screenshots; none call an image model. */
export type ShowcaseTemplate =
  | 'before_after_split'
  | 'hero_browser'
  | 'client_grid'
  | 'device_frame';

/**
 * Output sizes for composited creative.
 *
 * Deliberately NOT added to `ImageSize` in services/openaiApi.ts. That union is paired with
 * `ImageSizeConfig.gptImageSize`, typed to the three sizes gpt-image actually accepts — and
 * gpt-image has no legal 4:5 value. Widening it would make an illegal state representable in a
 * type that feeds a paid API, to buy nothing: the showcase path never calls an image model.
 *
 * 4:5 is the default because it is the tallest format Meta's feed renders without cropping,
 * which matters more here than anywhere else — a website screenshot is mostly vertical.
 */
export type ShowcaseSize = '1:1' | '4:5' | '9:16';

export const SHOWCASE_SIZE_DIMENSIONS: Record<ShowcaseSize, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
};

export const DEFAULT_SHOWCASE_SIZE: ShowcaseSize = '4:5';

export const SHOWCASE_SIZE_LABELS: Record<ShowcaseSize, string> = {
  '1:1': 'Square (1080×1080)',
  '4:5': 'Feed / Portrait (1080×1350)',
  '9:16': 'Story / Reel (1080×1920)',
};

export interface Rect { x: number; y: number; w: number; h: number }

export interface ChromeSpec {
  kind: 'browser' | 'none';
  /** Height of the chrome bar. 0 when `kind` is 'none'. */
  barHeight: number;
  radius: number;
  urlText?: string;
}

export interface BandSpec {
  text: string;
  band: Rect;
  bg: string;
  fg: string;
}

export interface PanelDescriptor {
  /** Index into the caller's image array. */
  sourceIndex: number;
  /** Where this panel lands on the output canvas. */
  dest: Rect;
  /** WHICH REGION of the source is drawn — resolved here, not left to the renderer. */
  src: Rect;
  chrome: ChromeSpec;
  label?: BandSpec;
}

/**
 * A drawn device body around a panel.
 *
 * Deliberately NOT a photographic plate. A photo of a laptop on a desk has its screen in
 * perspective, and an affine transform maps a rectangle to a parallelogram — a screenshot
 * fitted into a perspective quad visibly slides off the bezel. A drawn body keeps the screen
 * a true rectangle, so the screenshot stays pixel-exact with nothing but a scale. See ADR #25.
 */
export type DeviceKind = 'laptop' | 'tablet' | 'phone';

export interface DeviceSpec {
  kind: DeviceKind;
  /** The body outline. The panel's `dest` is the screen inside it. */
  body: Rect;
  bodyRadius: number;
  /** Laptop base — the wedge below the screen. Null for tablet and phone. */
  base: Rect | null;
  /** Phone/tablet camera notch. Null for a laptop. */
  notch: Rect | null;
}

export interface ShowcasePlan {
  width: number;
  height: number;
  background: string;
  panels: PanelDescriptor[];
  divider: Rect | null;
  caption: BandSpec | null;
  device: DeviceSpec | null;
}

/** Colours a plan needs. Derived from a TextAdStyle — see paletteFromStyle. */
export interface ShowcasePalette {
  background: string;
  divider: string;
  labelBg: string;
  labelFg: string;
  captionBg: string;
  captionFg: string;
  chromeBar: string;
}

/** The subset of `TextAdStyle` a palette is built from, restated so this module stays pure. */
export interface StyleLike {
  backgroundColors: string[];
  textColor: string;
  accentColor: string;
  bannerBgColor: string;
  bannerTextColor: string;
}

/**
 * Borrow one of the 12 designed presets in `textAdCanvas.ts` rather than inventing a parallel
 * theme model. The operator gets a theme picker for free, with palettes someone already
 * designed, and a per-account custom brand style flows through unchanged.
 */
export function paletteFromStyle(style: StyleLike): ShowcasePalette {
  return {
    background: style.backgroundColors[0] || '#0f172a',
    divider: style.accentColor,
    labelBg: style.bannerBgColor,
    labelFg: style.bannerTextColor,
    captionBg: style.bannerBgColor,
    captionFg: style.bannerTextColor,
    chromeBar: style.backgroundColors[style.backgroundColors.length - 1] || style.textColor,
  };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Proportion of a panel's height given to the BEFORE/AFTER label band. */
const LABEL_BAND_RATIO = 0.11;
/** Proportion of the output height given to the caption band, when there is one. */
const CAPTION_BAND_RATIO = 0.12;
/** Chrome bar height as a proportion of panel width — scales with the panel, not the canvas. */
const CHROME_BAR_RATIO = 0.075;
/** Gap between the two halves of a split. */
const DIVIDER_WIDTH = 6;
/** Inset around a single hero panel. */
const HERO_INSET_RATIO = 0.07;
/** Gap between cells on a results wall. */
const GRID_GAP = 10;
/** Client-name band on a wall cell — slimmer than a BEFORE/AFTER label; it identifies, not claims. */
const GRID_LABEL_RATIO = 0.16;
/** Inset around a drawn device body. */
const DEVICE_INSET_RATIO = 0.09;
/** Bezel thickness as a proportion of the body's shorter edge. */
const DEVICE_BEZEL_RATIO = 0.035;

/**
 * How many columns a results wall uses. One column below three sites — two 540px-wide cells
 * of a website are already near the legibility floor in a feed, and a lone pair reads better
 * stacked.
 */
function gridColumns(count: number): number {
  return count <= 2 ? 1 : 2;
}

/**
 * Cells per row, distributed so the LAST row absorbs the remainder by spanning.
 *
 * The obvious `ceil(n / cols)` grid leaves a hole at odd counts, and a hole in a "wall of
 * results" reads as a failed render rather than a design. Five sites become [2, 2, 1] with the
 * final cell full width.
 */
export function gridRowCounts(count: number, columns: number): number[] {
  if (count <= 0 || columns <= 0) return [];
  const rows: number[] = [];
  let left = count;
  while (left > 0) {
    const take = Math.min(columns, left);
    rows.push(take);
    left -= take;
  }
  return rows;
}

/**
 * The source region to draw.
 *
 * A website capture is far taller than any ad panel, so something must be discarded. It crops
 * from the TOP because the hero section is the proof and the footer is not — centring would
 * reliably frame the middle of a page, which is where the least persuasive content lives.
 *
 * There is deliberately no letterbox mode. Every template covers, and a `fit` parameter with
 * one reachable value is a branch nothing can take.
 *
 * Returns the full source for a degenerate destination rather than dividing by zero.
 */
export function fitSourceRect(
  source: { width: number; height: number },
  dest: Rect
): Rect {
  const sw = source.width;
  const sh = source.height;
  const full: Rect = { x: 0, y: 0, w: sw, h: sh };

  if (sw <= 0 || sh <= 0 || dest.w <= 0 || dest.h <= 0) return full;

  const sourceRatio = sw / sh;
  const destRatio = dest.w / dest.h;

  if (sourceRatio > destRatio) {
    // Source is proportionally wider — trim the sides, keeping the centre horizontally.
    const w = sh * destRatio;
    return { x: (sw - w) / 2, y: 0, w, h: sh };
  }

  // Source is proportionally taller — keep the full width and take the TOP of the page.
  const h = sw / destRatio;
  return { x: 0, y: 0, w: sw, h };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface PlanShowcaseInput {
  template: ShowcaseTemplate;
  size: ShowcaseSize;
  /**
   * NATURAL dimensions of each source, in the caller's order. A `before_after_split` expects
   * [before, after]; `hero_browser` expects [hero].
   */
  sources: Array<{ width: number; height: number }>;
  palette: ShowcasePalette;
  labels?: {
    before?: string;
    after?: string;
    /** Per-source labels for a results wall, index-aligned with `sources`. */
    captions?: Array<string | undefined>;
  };
  caption?: string;
  chrome?: 'browser' | 'none';
  urlText?: string;
  /** Which body to draw for `device_frame`. Ignored by every other template. */
  device?: DeviceKind;
}

function bandFor(text: string, band: Rect, bg: string, fg: string): BandSpec {
  return { text, band, bg, fg };
}

/** A source that cannot be drawn — zero or negative dimensions from a broken decode. */
function usable(source: { width: number; height: number } | undefined): boolean {
  return !!source && source.width > 0 && source.height > 0;
}

/**
 * Resolve a template into rectangles.
 *
 * Degrades rather than throwing: too few sources yields fewer panels, and an unusable source is
 * omitted entirely. Callers already handle a short panel list, and a plan containing NaN would
 * fail deep inside a `drawImage` call where the cause is invisible.
 */
// ---------------------------------------------------------------------------
// Templates
//
// ONE table, not three parallel Records plus an if-chain in the planner. This module's header
// cites gridPlan.ts as its model, and that is precisely the promise gridPlan.ts makes: "the
// shape resolves ONCE into a spec… adding a third shape is one entry and zero changes to the
// component". A fifth template is one entry here.
// ---------------------------------------------------------------------------

/** What a template's planner is handed. Everything it needs, nothing it can mutate. */
export interface TemplatePlanContext {
  input: PlanShowcaseInput;
  palette: ShowcasePalette;
  width: number;
  /** Canvas height minus the caption band, when there is one. */
  bodyHeight: number;
}

export interface ShowcaseTemplateSpec {
  label: string;
  /** One line under the label in the template picker. */
  hint: string;
  /**
   * How many assets this template consumes, and whether they must carry a "before".
   *
   * A RANGE, not a count: a results wall is meaningless with one site and unreadable past six,
   * and the picker enforces both ends. `requiresBefore` is the other thing it filters on —
   * offering an asset with no "before" for a split would render a half-empty frame, which
   * reads as a bug rather than a missing upload.
   */
  arity: { min: number; max: number; requiresBefore: boolean };
  /** Everything below the caption band. Returns a partial plan; never mutates the context. */
  plan(ctx: TemplatePlanContext): {
    panels: PanelDescriptor[];
    divider?: Rect | null;
    device?: DeviceSpec | null;
  };
}

const BEFORE_AFTER_SPLIT: ShowcaseTemplateSpec = {
  label: 'Before / After',
  hint: 'Needs an asset with a "before"',
  arity: { min: 1, max: 1, requiresBefore: true },

  plan({ input, palette, width, bodyHeight }) {
    const panels: PanelDescriptor[] = [];
    const halfW = (width - DIVIDER_WIDTH) / 2;
    const labelH = Math.round(bodyHeight * LABEL_BAND_RATIO);

    const halves = [
      { x: 0, sourceIndex: 0, text: input.labels?.before || 'BEFORE' },
      { x: halfW + DIVIDER_WIDTH, sourceIndex: 1, text: input.labels?.after || 'AFTER' },
    ];

    for (const half of halves) {
      const source = input.sources[half.sourceIndex];
      if (!usable(source)) continue;

      // The label sits at the TOP of each half: the bottom of a website capture is where its
      // own content is busiest, and a band there competes with the screenshot.
      const dest: Rect = { x: half.x, y: labelH, w: halfW, h: bodyHeight - labelH };
      panels.push({
        sourceIndex: half.sourceIndex,
        dest,
        src: fitSourceRect(source, dest),
        // No browser chrome here: two chrome bars in one frame reads as a screenshot of a
        // browser, not as a comparison.
        chrome: { kind: 'none', barHeight: 0, radius: 0 },
        label: bandFor(half.text, { x: half.x, y: 0, w: halfW, h: labelH }, palette.labelBg, palette.labelFg),
      });
    }

    return {
      panels,
      // Only draw a divider when there is something on both sides of it — one with a blank
      // half beside it looks like a rendering fault.
      divider: panels.length === 2 ? { x: halfW, y: 0, w: DIVIDER_WIDTH, h: bodyHeight } : null,
    };
  },
};

const HERO_BROWSER: ShowcaseTemplateSpec = {
  label: 'Single Site Hero',
  hint: 'One screenshot, framed',
  arity: { min: 1, max: 1, requiresBefore: false },

  plan({ input, width, bodyHeight }) {
    const source = input.sources[0];
    if (!usable(source)) return { panels: [] };

    const chromeKind = input.chrome ?? 'browser';
    const inset = Math.round(width * HERO_INSET_RATIO);
    const frameW = width - inset * 2;
    const barHeight = chromeKind === 'browser' ? Math.round(frameW * CHROME_BAR_RATIO) : 0;
    const frameH = bodyHeight - inset * 2;

    const dest: Rect = { x: inset, y: inset + barHeight, w: frameW, h: frameH - barHeight };
    if (dest.h <= 0 || dest.w <= 0) return { panels: [] };

    return {
      panels: [{
        sourceIndex: 0,
        dest,
        src: fitSourceRect(source, dest),
        chrome: {
          kind: chromeKind,
          barHeight,
          radius: Math.round(barHeight * 0.35),
          urlText: input.urlText,
        },
      }],
    };
  },
};

const CLIENT_GRID: ShowcaseTemplateSpec = {
  label: 'Results Wall',
  hint: 'Several clients at once',
  arity: { min: 2, max: 6, requiresBefore: false },

  plan({ input, palette, width, bodyHeight }) {
    const entries = input.sources
      .map((source, sourceIndex) => ({ source, sourceIndex }))
      .filter(entry => usable(entry.source));

    if (entries.length === 0) return { panels: [] };

    const panels: PanelDescriptor[] = [];
    const rowCounts = gridRowCounts(entries.length, gridColumns(entries.length));
    const rowH = (bodyHeight - GRID_GAP * (rowCounts.length - 1)) / rowCounts.length;
    const labelH = Math.round(rowH * GRID_LABEL_RATIO);

    let cursor = 0;
    rowCounts.forEach((cellsInRow, rowIndex) => {
      // The final row spans whatever columns it has, so an odd count leaves no hole.
      const cellW = (width - GRID_GAP * (cellsInRow - 1)) / cellsInRow;
      const y = rowIndex * (rowH + GRID_GAP);

      for (let col = 0; col < cellsInRow; col++) {
        const entry = entries[cursor++];
        const x = col * (cellW + GRID_GAP);
        const dest: Rect = { x, y, w: cellW, h: rowH - labelH };
        // Keyed on sourceIndex, not panel position: one broken decode must not silently
        // relabel every client after it.
        const caption = input.labels?.captions?.[entry.sourceIndex];

        panels.push({
          sourceIndex: entry.sourceIndex,
          dest,
          src: fitSourceRect(entry.source, dest),
          chrome: { kind: 'none', barHeight: 0, radius: 0 },
          // The client's NAME, never a metric. `showcase_assets` has no performance columns
          // precisely so a wall like this cannot quietly begin asserting results.
          label: caption
            ? bandFor(caption, { x, y: y + rowH - labelH, w: cellW, h: labelH }, palette.labelBg, palette.labelFg)
            : undefined,
        });
      }
    });

    return { panels };
  },
};

const DEVICE_FRAME: ShowcaseTemplateSpec = {
  label: 'In a Device',
  hint: 'Laptop, tablet or phone',
  arity: { min: 1, max: 1, requiresBefore: false },

  plan({ input, width, bodyHeight }) {
    const source = input.sources[0];
    if (!usable(source)) return { panels: [] };

    const kind = input.device ?? 'laptop';
    const inset = Math.round(width * DEVICE_INSET_RATIO);
    const bodyW = width - inset * 2;

    // A laptop needs room beneath the body for its base; the slabs do not.
    const baseH = kind === 'laptop' ? Math.round(bodyW * 0.035) : 0;
    const bodyH = bodyHeight - inset * 2 - baseH;
    if (bodyW <= 0 || bodyH <= 0) return { panels: [] };

    const body: Rect = { x: inset, y: inset, w: bodyW, h: bodyH };
    const bezel = Math.round(Math.min(bodyW, bodyH) * DEVICE_BEZEL_RATIO);
    const notchH = kind === 'laptop' ? 0 : Math.round(bezel * 1.4);

    const dest: Rect = {
      x: body.x + bezel,
      y: body.y + bezel + notchH,
      w: bodyW - bezel * 2,
      h: bodyH - bezel * 2 - notchH,
    };
    if (dest.w <= 0 || dest.h <= 0) return { panels: [] };

    return {
      panels: [{
        sourceIndex: 0,
        dest,
        src: fitSourceRect(source, dest),
        chrome: { kind: 'none', barHeight: 0, radius: 0 },
      }],
      device: {
        kind,
        body,
        bodyRadius: Math.round(bezel * (kind === 'laptop' ? 1.2 : 2.4)),
        base: kind === 'laptop'
          // Wider than the lid and centred — the wedge a laptop actually sits on.
          ? { x: inset - Math.round(bodyW * 0.04), y: body.y + bodyH, w: bodyW + Math.round(bodyW * 0.08), h: baseH }
          : null,
        notch: notchH > 0
          ? { x: body.x + bodyW / 2 - bodyW * 0.14, y: body.y + bezel * 0.5, w: bodyW * 0.28, h: notchH * 0.7 }
          : null,
      },
    };
  },
};

export const SHOWCASE_TEMPLATES: Record<ShowcaseTemplate, ShowcaseTemplateSpec> = {
  before_after_split: BEFORE_AFTER_SPLIT,
  hero_browser: HERO_BROWSER,
  client_grid: CLIENT_GRID,
  device_frame: DEVICE_FRAME,
};

export const SHOWCASE_TEMPLATE_VALUES = [
  'before_after_split', 'hero_browser', 'client_grid', 'device_frame',
] as const satisfies readonly ShowcaseTemplate[];

/**
 * Resolve a template into rectangles.
 *
 * Degrades rather than throwing: too few sources yields fewer panels, and an unusable source is
 * omitted entirely. A plan containing NaN would fail deep inside a `drawImage` call where the
 * cause is invisible, so specs return empty panel lists instead.
 */
export function planShowcase(input: PlanShowcaseInput): ShowcasePlan {
  const { width, height } = SHOWCASE_SIZE_DIMENSIONS[input.size];
  const captionText = input.caption?.trim();
  const captionHeight = captionText ? Math.round(height * CAPTION_BAND_RATIO) : 0;

  const laid = SHOWCASE_TEMPLATES[input.template].plan({
    input,
    palette: input.palette,
    width,
    bodyHeight: height - captionHeight,
  });

  return {
    width,
    height,
    background: input.palette.background,
    panels: laid.panels,
    divider: laid.divider ?? null,
    device: laid.device ?? null,
    caption: captionText
      ? bandFor(
          captionText,
          { x: 0, y: height - captionHeight, w: width, h: captionHeight },
          input.palette.captionBg,
          input.palette.captionFg
        )
      : null,
  };
}

// ---------------------------------------------------------------------------
// The operator's draft
// ---------------------------------------------------------------------------

/**
 * Everything the operator chooses about a composite, as ONE object.
 *
 * Nine loose `useState` calls in a 4.6k-line component is how `CustomDirectionField` ended up
 * threading six props before ADR #23 bundled them into `CustomDirectionDraft`. Same fix, same
 * reason: every consumer needs all of these together, and as nine they have to be passed,
 * snapshotted and restored nine times.
 *
 * The chosen ASSETS are deliberately NOT in here. This is the arrangement — plain data that
 * round-trips through the session snapshot — whereas assets are loaded library rows that the
 * library, not the session, is the source of truth for.
 */
export interface ShowcaseDraft {
  template: ShowcaseTemplate;
  size: ShowcaseSize;
  styleId: string;
  caption: string;
  beforeLabel: string;
  afterLabel: string;
  chrome: 'browser' | 'none';
}

export function emptyShowcaseDraft(styleId: string): ShowcaseDraft {
  return {
    template: 'before_after_split',
    size: DEFAULT_SHOWCASE_SIZE,
    styleId,
    caption: '',
    beforeLabel: '',
    afterLabel: '',
    chrome: 'browser',
  };
}

/** The label pair a draft represents, or undefined for each side the operator left blank. */
export function draftLabels(draft: ShowcaseDraft): { before?: string; after?: string } {
  return { before: draft.beforeLabel || undefined, after: draft.afterLabel || undefined };
}
