// Showcase composite geometry.
//
// Every DECISION in the compositor lives in this module precisely so it can be asserted here —
// the renderer that consumes these descriptors runs against a real canvas and is untestable in
// the repo's node-only vitest environment. A plan containing NaN would fail deep inside a
// `drawImage` call with no visible cause, so several of these tests exist to catch that shape
// of bug at the only layer where it is catchable.
import { describe, it, expect } from 'vitest';

import {
  planShowcase,
  isPassthrough,
  containDestRect,
  gridRowCounts,
  fitSourceRect,
  paletteFromStyle,
  SHOWCASE_SIZE_DIMENSIONS,
  SHOWCASE_TEMPLATES,
  SHOWCASE_TEMPLATE_VALUES,
  DEFAULT_SHOWCASE_SIZE,
  type ShowcasePalette,
  type ShowcaseSize,
  type ShowcaseTemplate,
  type Rect,
} from './showcaseLayout';
import { TEXT_AD_STYLES } from '../services/textAdCanvas';

const PALETTE: ShowcasePalette = {
  background: '#0f172a',
  divider: '#d4e157',
  labelBg: '#111827',
  labelFg: '#ffffff',
  captionBg: '#111827',
  captionFg: '#ffffff',
  chromeBar: '#1f2937',
};

const SIZES: ShowcaseSize[] = ['1:1', '4:5', '9:16'];
// Derived, not hand-listed: a new template joins every invariant sweep below automatically
// instead of silently escaping them.
const TEMPLATES: readonly ShowcaseTemplate[] = SHOWCASE_TEMPLATE_VALUES;

/** A desktop capture: wide and not very tall relative to an ad panel. */
const desktop = { width: 1440, height: 900 };
/** A full-page capture: far taller than any panel. */
const fullPage = { width: 1440, height: 4200 };

function plan(template: ShowcaseTemplate, size: ShowcaseSize, sources = [desktop, desktop], extra = {}) {
  return planShowcase({ template, size, sources, palette: PALETTE, ...extra });
}

/** Every number anywhere in the plan must be finite. */
function allNumbersFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (value && typeof value === 'object') return Object.values(value).every(allNumbersFinite);
  return true;
}

const within = (r: Rect, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------------------
// 1. Structural invariants across every template x size
// ---------------------------------------------------------------------------

describe('planShowcase — invariants', () => {
  it.each(TEMPLATES.flatMap(t => SIZES.map(s => [t, s] as const)))(
    'keeps %s at %s inside the canvas and free of NaN',
    (template, size) => {
      const p = plan(template, size, [desktop, desktop], { caption: 'Acme Dental' });
      const { width, height } = SHOWCASE_SIZE_DIMENSIONS[size];

      expect(p.width).toBe(width);
      expect(p.height).toBe(height);
      expect(allNumbersFinite(p)).toBe(true);
      expect(p.panels.length).toBeGreaterThan(0);

      for (const panel of p.panels) {
        expect(within(panel.dest, width, height), 'dest in bounds').toBe(true);
        expect(panel.dest.w).toBeGreaterThan(0);
        expect(panel.dest.h).toBeGreaterThan(0);
        if (panel.label) expect(within(panel.label.band, width, height)).toBe(true);
      }
    }
  );

  it('never overlaps a panel with the caption band', () => {
    // The caption is the one band that spans the full width, so it is the one that can eat a
    // panel if the body height is computed from the wrong number.
    for (const size of SIZES) {
      for (const template of TEMPLATES) {
        const p = plan(template, size, [desktop, desktop], { caption: 'Built in 3 weeks' });
        expect(p.caption).not.toBeNull();
        for (const panel of p.panels) {
          expect(overlaps(panel.dest, p.caption!.band), `${template} @ ${size}`).toBe(false);
        }
      }
    }
  });

  it('never overlaps a panel with its own label band', () => {
    const p = plan('before_after_split', '4:5');
    for (const panel of p.panels) {
      expect(overlaps(panel.dest, panel.label!.band)).toBe(false);
    }
  });

  it('omits the caption band entirely when there is no caption', () => {
    // Not merely empty text — an empty band would still occupy height and shrink the panels.
    for (const caption of [undefined, '', '   ']) {
      const p = plan('hero_browser', '4:5', [desktop], { caption });
      expect(p.caption).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. before_after_split
// ---------------------------------------------------------------------------

describe('planShowcase — before/after split', () => {
  it('gives both halves equal width, mirrored about the centre', () => {
    const p = plan('before_after_split', '4:5');
    const [before, after] = p.panels;

    expect(p.panels).toHaveLength(2);
    expect(before.dest.w).toBeCloseTo(after.dest.w, 5);
    expect(before.dest.x).toBe(0);
    // Left edge of the right half mirrors the right edge of the left half about the divider.
    expect(after.dest.x + after.dest.w).toBeCloseTo(p.width, 5);
  });

  it('puts the divider between the halves, touching neither', () => {
    const p = plan('before_after_split', '4:5');
    const [before, after] = p.panels;

    expect(p.divider).not.toBeNull();
    expect(p.divider!.x).toBeGreaterThanOrEqual(before.dest.x + before.dest.w);
    expect(p.divider!.x + p.divider!.w).toBeLessThanOrEqual(after.dest.x);
  });

  it('labels the halves BEFORE and AFTER in source order', () => {
    const p = plan('before_after_split', '4:5');

    expect(p.panels[0].sourceIndex).toBe(0);
    expect(p.panels[0].label?.text).toBe('BEFORE');
    expect(p.panels[1].sourceIndex).toBe(1);
    expect(p.panels[1].label?.text).toBe('AFTER');
  });

  it('accepts operator-supplied label text', () => {
    const p = plan('before_after_split', '4:5', [desktop, desktop], {
      labels: { before: 'Their old site', after: 'What we built' },
    });

    expect(p.panels[0].label?.text).toBe('Their old site');
    expect(p.panels[1].label?.text).toBe('What we built');
  });

  it('wears no browser chrome — two chrome bars read as one browser, not a comparison', () => {
    const p = plan('before_after_split', '4:5');
    for (const panel of p.panels) {
      expect(panel.chrome.kind).toBe('none');
      expect(panel.chrome.barHeight).toBe(0);
    }
  });

  it('degrades to one panel and no divider when the pair is incomplete', () => {
    // A drawn divider with nothing on one side of it looks like a rendering fault.
    const p = planShowcase({
      template: 'before_after_split',
      size: '4:5',
      sources: [desktop],
      palette: PALETTE,
    });

    expect(p.panels).toHaveLength(1);
    expect(p.divider).toBeNull();
    expect(allNumbersFinite(p)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. hero_browser
// ---------------------------------------------------------------------------

describe('planShowcase — hero', () => {
  it('insets the panel and reserves room above it for the chrome bar', () => {
    const p = plan('hero_browser', '4:5', [desktop]);
    const [panel] = p.panels;

    expect(p.panels).toHaveLength(1);
    expect(panel.chrome.kind).toBe('browser');
    expect(panel.chrome.barHeight).toBeGreaterThan(0);
    expect(panel.dest.x).toBeGreaterThan(0);
    // The bar occupies the gap between the inset and the panel's top edge.
    expect(panel.dest.y).toBeGreaterThanOrEqual(panel.chrome.barHeight);
  });

  it('drops the chrome bar and its reserved height when chrome is off', () => {
    const withChrome = plan('hero_browser', '4:5', [desktop]);
    const without = plan('hero_browser', '4:5', [desktop], { chrome: 'none' });

    expect(without.panels[0].chrome.barHeight).toBe(0);
    expect(without.panels[0].dest.h).toBeGreaterThan(withChrome.panels[0].dest.h);
  });

  it('carries the URL text through to the chrome spec', () => {
    const p = plan('hero_browser', '4:5', [desktop], { urlText: 'acmedental.com' });
    expect(p.panels[0].chrome.urlText).toBe('acmedental.com');
  });

  it('produces no panel at all for an unusable source', () => {
    for (const bad of [{ width: 0, height: 0 }, { width: 100, height: 0 }]) {
      const p = planShowcase({
        template: 'hero_browser', size: '4:5', sources: [bad], palette: PALETTE,
      });
      expect(p.panels).toHaveLength(0);
      expect(allNumbersFinite(p)).toBe(true);
    }
  });

  it('produces no panel when given no sources', () => {
    const p = planShowcase({ template: 'hero_browser', size: '4:5', sources: [], palette: PALETTE });
    expect(p.panels).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. fitSourceRect — the crop decision
// ---------------------------------------------------------------------------

describe('fitSourceRect', () => {
  const tallPanel: Rect = { x: 0, y: 0, w: 540, h: 1200 };
  const widePanel: Rect = { x: 0, y: 0, w: 1080, h: 300 };

  it('crops a tall page from the TOP, never the middle', () => {
    // The hero section is the proof; centring would frame the middle of the page, which is
    // where the least persuasive content lives.
    const src = fitSourceRect(fullPage, tallPanel);

    expect(src.y).toBe(0);
    expect(src.x).toBe(0);
    expect(src.w).toBe(fullPage.width);
    expect(src.h).toBeLessThan(fullPage.height);
  });

  it('keeps the full width when the source is proportionally taller than the panel', () => {
    // A full-page capture (0.34) is far taller in ratio than even a tall panel (0.45), so the
    // width survives intact and only the bottom of the page is discarded.
    const src = fitSourceRect(fullPage, tallPanel);

    expect(src.w).toBe(fullPage.width);
    expect(src.y).toBe(0);
    expect(src.h).toBeLessThan(fullPage.height);
  });

  it('keeps the full width for a wide panel too, cropping the page height hard', () => {
    // A 1440x900 desktop capture (1.60) is still proportionally TALLER than a 3.6 banner
    // panel, so this is a top crop, not a side trim.
    const src = fitSourceRect(desktop, widePanel);

    expect(src.w).toBe(desktop.width);
    expect(src.y).toBe(0);
    expect(src.h).toBeLessThan(desktop.height);
  });

  it('trims the sides symmetrically when the source is proportionally wider', () => {
    // 1440x900 (1.60) into a narrow 540x1200 panel (0.45): width must go, height stays.
    const src = fitSourceRect(desktop, tallPanel);

    expect(src.h).toBe(desktop.height);
    expect(src.w).toBeLessThan(desktop.width);
    // Horizontal centring is right here — a page's left and right margins are equivalent,
    // unlike its top and bottom.
    expect(src.x).toBeCloseTo((desktop.width - src.w) / 2, 5);
  });

  it('matches the destination aspect ratio so nothing is stretched', () => {
    for (const [source, dest] of [[fullPage, tallPanel], [desktop, widePanel], [desktop, tallPanel]] as const) {
      const src = fitSourceRect(source, dest);
      expect(src.w / src.h).toBeCloseTo(dest.w / dest.h, 4);
    }
  });


  it('returns the whole source rather than dividing by zero on a degenerate input', () => {
    const zeroSource = { width: 0, height: 0 };
    const zeroDest: Rect = { x: 0, y: 0, w: 0, h: 0 };

    expect(allNumbersFinite(fitSourceRect(zeroSource, tallPanel))).toBe(true);
    expect(allNumbersFinite(fitSourceRect(desktop, zeroDest))).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// 5. Palette + tables
// ---------------------------------------------------------------------------

describe('paletteFromStyle', () => {
  it('is total over every shipped text-ad style', () => {
    // The theme picker offers all of these, so any one of them producing an undefined colour
    // would paint a transparent band at render time.
    for (const style of TEXT_AD_STYLES) {
      const palette = paletteFromStyle(style);
      for (const [key, value] of Object.entries(palette)) {
        expect(typeof value, `${style.id}.${key}`).toBe('string');
        expect(value.length, `${style.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('survives a style with no background colours', () => {
    const palette = paletteFromStyle({
      backgroundColors: [], textColor: '#fff', accentColor: '#0f0',
      bannerBgColor: '#000', bannerTextColor: '#fff',
    });
    expect(palette.background.length).toBeGreaterThan(0);
    expect(palette.chromeBar.length).toBeGreaterThan(0);
  });
});

describe('tables', () => {
  it('describes every template exactly once, with a label, a hint and a planner', () => {
    // The table is the single source for all four facts. Three parallel Records is what this
    // replaced, and it is what let a template exist in one and not another.
    expect(new Set(SHOWCASE_TEMPLATE_VALUES).size).toBe(SHOWCASE_TEMPLATE_VALUES.length);
    for (const template of TEMPLATES) {
      const spec = SHOWCASE_TEMPLATES[template];
      expect(spec.label.length, template).toBeGreaterThan(0);
      expect(spec.hint.length, template).toBeGreaterThan(0);
      expect(typeof spec.plan, template).toBe('function');
      expect(SHOWCASE_TEMPLATES[template].arity).toBeDefined();
      expect(SHOWCASE_TEMPLATES[template].arity.min).toBeGreaterThan(0);
      expect(SHOWCASE_TEMPLATES[template].arity.max)
        .toBeGreaterThanOrEqual(SHOWCASE_TEMPLATES[template].arity.min);
    }
    // Only the split needs a "before" — this is what the asset picker filters on.
    expect(SHOWCASE_TEMPLATES.before_after_split.arity.requiresBefore).toBe(true);
    expect(SHOWCASE_TEMPLATES.hero_browser.arity.requiresBefore).toBe(false);
  });

  it('defaults to the tallest format Meta renders without cropping', () => {
    expect(DEFAULT_SHOWCASE_SIZE).toBe('4:5');
    expect(SHOWCASE_SIZE_DIMENSIONS['4:5']).toEqual({ width: 1080, height: 1350 });
  });
});

// ---------------------------------------------------------------------------
// 6. client_grid — the results wall
// ---------------------------------------------------------------------------

describe('gridRowCounts', () => {
  it('leaves no hole — the last row absorbs the remainder', () => {
    // A hole in a "wall of results" reads as a failed render rather than a design choice.
    expect(gridRowCounts(2, 1)).toEqual([1, 1]);
    expect(gridRowCounts(4, 2)).toEqual([2, 2]);
    expect(gridRowCounts(5, 2)).toEqual([2, 2, 1]);
    expect(gridRowCounts(6, 2)).toEqual([2, 2, 2]);
  });

  it('always sums back to the input count', () => {
    for (let n = 1; n <= 8; n++) {
      for (const cols of [1, 2, 3]) {
        expect(gridRowCounts(n, cols).reduce((a, b) => a + b, 0), `${n}/${cols}`).toBe(n);
      }
    }
  });

  it('is empty for degenerate input rather than looping forever', () => {
    expect(gridRowCounts(0, 2)).toEqual([]);
    expect(gridRowCounts(4, 0)).toEqual([]);
    expect(gridRowCounts(-3, 2)).toEqual([]);
  });
});

describe('planShowcase — results wall', () => {
  const many = (n: number) => Array.from({ length: n }, () => desktop);

  it('renders one panel per client, for every supported count', () => {
    for (let n = 2; n <= 6; n++) {
      const p = plan('client_grid', '4:5', many(n));
      expect(p.panels, `n=${n}`).toHaveLength(n);
      expect(allNumbersFinite(p)).toBe(true);
    }
  });

  it('never overlaps two cells', () => {
    for (let n = 2; n <= 6; n++) {
      const p = plan('client_grid', '4:5', many(n));
      for (let i = 0; i < p.panels.length; i++) {
        for (let j = i + 1; j < p.panels.length; j++) {
          expect(overlaps(p.panels[i].dest, p.panels[j].dest), `n=${n} ${i}v${j}`).toBe(false);
        }
      }
    }
  });

  it('spans the final row when the count is odd, leaving no gap', () => {
    const p = plan('client_grid', '4:5', many(5));
    const last = p.panels[4];

    expect(last.dest.x).toBe(0);
    expect(last.dest.w).toBeCloseTo(p.width, 5);
  });

  it('labels cells with the caption supplied for each source, and only those', () => {
    const p = plan('client_grid', '4:5', many(3), {
      labels: { captions: ['Acme Dental', undefined, 'Bell Roofing'] },
    });

    expect(p.panels[0].label?.text).toBe('Acme Dental');
    expect(p.panels[1].label).toBeUndefined();
    expect(p.panels[2].label?.text).toBe('Bell Roofing');
  });

  it('drops unusable sources without shifting the labels of the survivors', () => {
    // sourceIndex, not panel position, is what a caption is keyed on — otherwise one broken
    // decode would silently relabel every client after it.
    const p = plan('client_grid', '4:5', [desktop, { width: 0, height: 0 }, desktop], {
      labels: { captions: ['Acme', 'Broken', 'Bell'] },
    });

    expect(p.panels).toHaveLength(2);
    expect(p.panels.map(x => x.label?.text)).toEqual(['Acme', 'Bell']);
  });

  it('never draws a divider — that belongs to the split', () => {
    expect(plan('client_grid', '4:5', many(4)).divider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. device_frame
// ---------------------------------------------------------------------------

describe('planShowcase — device frame', () => {
  it('puts the screen strictly inside the body on every device', () => {
    for (const device of ['laptop', 'tablet', 'phone'] as const) {
      const p = plan('device_frame', '4:5', [desktop], { device });
      const [panel] = p.panels;

      expect(p.device, device).not.toBeNull();
      expect(p.device!.kind).toBe(device);
      // A bezel on all four sides — a screen flush with the body edge reads as a plain rect.
      expect(panel.dest.x, device).toBeGreaterThan(p.device!.body.x);
      expect(panel.dest.y, device).toBeGreaterThan(p.device!.body.y);
      expect(panel.dest.x + panel.dest.w).toBeLessThan(p.device!.body.x + p.device!.body.w);
      expect(panel.dest.y + panel.dest.h).toBeLessThan(p.device!.body.y + p.device!.body.h);
    }
  });

  it('gives a laptop a base beneath the body and no notch', () => {
    const p = plan('device_frame', '4:5', [desktop], { device: 'laptop' });

    expect(p.device!.notch).toBeNull();
    expect(p.device!.base).not.toBeNull();
    expect(p.device!.base!.y).toBeGreaterThanOrEqual(p.device!.body.y + p.device!.body.h);
    // Wider than the lid, like a real one.
    expect(p.device!.base!.w).toBeGreaterThan(p.device!.body.w);
  });

  it('gives a phone a notch and no base', () => {
    const p = plan('device_frame', '4:5', [desktop], { device: 'phone' });

    expect(p.device!.base).toBeNull();
    expect(p.device!.notch).not.toBeNull();
    // The notch sits above the screen, not over it.
    expect(p.device!.notch!.y + p.device!.notch!.h).toBeLessThanOrEqual(p.panels[0].dest.y + 0.5);
  });

  it('defaults to a laptop when no device is given', () => {
    expect(plan('device_frame', '4:5', [desktop]).device!.kind).toBe('laptop');
  });

  it('keeps the whole body on canvas at every size', () => {
    for (const size of SIZES) {
      const p = plan('device_frame', size, [desktop], { device: 'laptop' });
      const d = p.device!;
      const outer = d.base
        ? { x: Math.min(d.body.x, d.base.x), y: d.body.y,
            w: Math.max(d.body.w, d.base.w), h: d.base.y + d.base.h - d.body.y }
        : d.body;
      expect(within(outer, p.width, p.height), size).toBe(true);
    }
  });

  it('emits no device and no panel for an unusable source', () => {
    const p = planShowcase({
      template: 'device_frame', size: '4:5',
      sources: [{ width: 0, height: 0 }], palette: PALETTE,
    });

    expect(p.panels).toHaveLength(0);
    expect(p.device).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. as_is — the null template, and the one place the fit rule inverts
// ---------------------------------------------------------------------------

describe('planShowcase — as_is', () => {
  const square = { width: 2048, height: 2048 };

  it('fills the whole frame when the aspects match, adding nothing', () => {
    const p = plan('as_is', '1:1', [square]);
    const [panel] = p.panels;

    expect(panel.dest).toEqual({ x: 0, y: 0, w: 1080, h: 1080 });
    expect(panel.chrome.kind).toBe('none');
    expect(panel.label).toBeUndefined();
    expect(p.divider).toBeNull();
    expect(p.device).toBeNull();
  });

  it('LETTERBOXES rather than crops when they differ', () => {
    // The inversion that matters: every other template crops a screenshot, because a document
    // loses nothing by dropping its tail. A finished creative is composed, and a crop cuts
    // through an arrangement somebody made on purpose.
    const p = plan('as_is', '4:5', [square]);
    const [panel] = p.panels;

    // Whole source drawn — nothing discarded.
    expect(panel.src).toEqual({ x: 0, y: 0, w: square.width, h: square.height });
    expect(panel.fit).toBe('contain');
    // Destination shrunk and centred instead.
    expect(panel.dest.w).toBe(1080);
    expect(panel.dest.h).toBeCloseTo(1080, 5);
    expect(panel.dest.y).toBeCloseTo((1350 - 1080) / 2, 5);
  });

  it('keeps the source aspect exactly, so a design is never stretched', () => {
    for (const size of SIZES) {
      for (const src of [square, desktop, { width: 1080, height: 1920 }]) {
        const [panel] = plan('as_is', size, [src]).panels;
        expect(panel.dest.w / panel.dest.h, `${size}`).toBeCloseTo(src.width / src.height, 3);
      }
    }
  });

  it('produces no panel for an unusable source', () => {
    const p = planShowcase({
      template: 'as_is', size: '1:1', sources: [{ width: 0, height: 0 }], palette: PALETTE,
    });
    expect(p.panels).toHaveLength(0);
  });
});

describe('isPassthrough', () => {
  const square = { width: 2048, height: 2048 };

  it('is true only when nothing would be transformed', () => {
    expect(isPassthrough(plan('as_is', '1:1', [square]))).toBe(true);
  });

  it('is false once the frame letterboxes', () => {
    // A canvas IS needed here — the background has to be painted around the design.
    expect(isPassthrough(plan('as_is', '4:5', [square]))).toBe(false);
  });

  it('is false when a caption band is added', () => {
    // The caption is drawn onto the output, so the stored bytes are no longer the whole ad.
    expect(isPassthrough(plan('as_is', '1:1', [square], { caption: 'Rebuilt in 3 weeks' }))).toBe(false);
  });

  it('is false for every framing template', () => {
    for (const template of TEMPLATES.filter(t => t !== 'as_is')) {
      expect(isPassthrough(plan(template, '1:1', [desktop, desktop])), template).toBe(false);
    }
  });

  it('is false for an empty plan', () => {
    expect(isPassthrough(planShowcase({
      template: 'as_is', size: '1:1', sources: [], palette: PALETTE,
    }))).toBe(false);
  });
});

describe('fitSourceRect — contain', () => {
  it('returns the whole source, discarding nothing', () => {
    const dest: Rect = { x: 0, y: 0, w: 540, h: 1200 };
    expect(fitSourceRect(fullPage, dest, 'contain')).toEqual({
      x: 0, y: 0, w: fullPage.width, h: fullPage.height,
    });
  });

  it('still defaults to top-cover when no fit is given', () => {
    // Every existing caller omits the argument and must keep cropping.
    const dest: Rect = { x: 0, y: 0, w: 540, h: 1200 };
    expect(fitSourceRect(fullPage, dest)).toEqual(fitSourceRect(fullPage, dest, 'top-cover'));
    expect(fitSourceRect(fullPage, dest).h).toBeLessThan(fullPage.height);
  });
});

describe('containDestRect', () => {
  it('preserves the source aspect and centres inside the destination', () => {
    const dest: Rect = { x: 100, y: 200, w: 600, h: 600 };
    const fitted = containDestRect(desktop, dest);

    expect(fitted.w / fitted.h).toBeCloseTo(desktop.width / desktop.height, 4);
    expect(fitted.w).toBeLessThanOrEqual(dest.w + 0.5);
    expect(fitted.h).toBeLessThanOrEqual(dest.h + 0.5);
    expect(fitted.x - dest.x).toBeCloseTo(dest.x + dest.w - (fitted.x + fitted.w), 5);
    expect(fitted.y - dest.y).toBeCloseTo(dest.y + dest.h - (fitted.y + fitted.h), 5);
  });

  it('returns the destination untouched for a degenerate source', () => {
    const dest: Rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(containDestRect({ width: 0, height: 0 }, dest)).toEqual(dest);
  });
});
