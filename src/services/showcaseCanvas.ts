// Draws a showcase composite. The thin half of the compositor.
//
// Every DECISION lives in lib/showcaseLayout.ts, which is pure and unit-tested; this file walks
// the descriptors that module produced and issues draw calls. Keep it that way — anything here
// that starts making a choice about geometry is untestable in the repo's node-only vitest
// environment and belongs on the other side of the seam.
//
// Contract copied from renderCalloutOverlay: return `GeneratedImageResult | null`, never throw.
// One failed composite must not lose the batch, and callers keep the null in position so a
// failure maps back to the asset that caused it.

import {
  planShowcase,
  paletteFromStyle,
  SHOWCASE_SIZE_DIMENSIONS,
  DEFAULT_SHOWCASE_SIZE,
  type ShowcaseTemplate,
  type ShowcaseSize,
  type ShowcasePlan,
  type PanelDescriptor,
  type BandSpec,
  type DeviceSpec,
  type DeviceKind,
  type Rect,
} from '../lib/showcaseLayout';
import {
  TEXT_AD_STYLES,
  getStyleById,
  fitText,
  drawCenteredText,
  FONT_FAMILY,
} from './textAdCanvas';
import type { GeneratedImageResult } from './openaiApi';

/**
 * JPEG, not PNG — a deliberate divergence from textAdCanvas.ts.
 *
 * A text ad is a few flat colours and compresses to nothing as PNG. A showcase composite is a
 * detail-dense website screenshot, where a 1080x1350 PNG reaches 2-4MB and base64-inflates to
 * ~5.3MB in the publish body. `handleUpload` has no size guard, so an oversized body fails at
 * the Vercel platform level with an opaque error before the handler ever runs.
 */
const OUTPUT_MIME = 'image/jpeg';
const OUTPUT_QUALITY = 0.92;

export interface ShowcaseRenderConfig {
  template: ShowcaseTemplate;
  size?: ShowcaseSize;
  /** data: URLs, in the order the template expects (split → [before, after]). */
  images: string[];
  /** A TEXT_AD_STYLES id — the showcase theme picker reuses those presets. */
  styleId?: string;
  labels?: { before?: string; after?: string; captions?: Array<string | undefined> };
  caption?: string;
  chrome?: 'browser' | 'none';
  urlText?: string;
  /** Which body `device_frame` draws. Derived from the asset's capture device. */
  device?: DeviceKind;
  /** Used only for the human-readable `revisedPrompt`. */
  clientName?: string;
}

/** Load a data URL, resolving null instead of throwing. Mirrors renderCalloutOverlay. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function roundedRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.lineTo(r.x + r.w - rad, r.y);
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad);
  ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h);
  ctx.lineTo(r.x + rad, r.y + r.h);
  ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - rad);
  ctx.lineTo(r.x, r.y + rad);
  ctx.quadraticCurveTo(r.x, r.y, r.x + rad, r.y);
  ctx.closePath();
}

/** A band with its text auto-sized to fit, reusing the text-ad engine's wrapping rules. */
function drawBand(ctx: CanvasRenderingContext2D, band: BandSpec): void {
  ctx.fillStyle = band.bg;
  ctx.fillRect(band.band.x, band.band.y, band.band.w, band.band.h);

  const text = band.text.trim();
  if (!text) return;

  const padX = band.band.w * 0.06;
  const section = fitText(
    ctx,
    text.toUpperCase(),
    Math.max(1, band.band.w - padX * 2),
    band.band.h * 0.7,
    800,
    Math.min(72, band.band.h * 0.55)
  );
  const textHeight = section.lines.length * section.lineHeight;
  drawCenteredText(
    ctx,
    section,
    band.fg,
    band.band.x + band.band.w / 2,
    band.band.y + (band.band.h - textHeight) / 2,
    800
  );
}

/** Browser chrome: a bar with three dots and an optional URL pill above the panel. */
function drawChrome(ctx: CanvasRenderingContext2D, panel: PanelDescriptor, barColor: string): void {
  const { chrome, dest } = panel;
  if (chrome.kind !== 'browser' || chrome.barHeight <= 0) return;

  const bar: Rect = { x: dest.x, y: dest.y - chrome.barHeight, w: dest.w, h: chrome.barHeight };
  ctx.fillStyle = barColor;
  // Rounded on top only — the bar meets the screenshot flush at the bottom.
  roundedRectPath(ctx, { ...bar, h: bar.h + chrome.radius }, chrome.radius);
  ctx.fill();

  const dotR = Math.max(2, chrome.barHeight * 0.13);
  const dotY = bar.y + bar.h / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(bar.x + dotR * 3 + i * dotR * 3, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  const url = chrome.urlText?.trim();
  if (!url) return;

  // A real address bar. Not a "fake UI element" in the policy sense — it frames a genuine
  // screenshot rather than imitating an interface the viewer could try to interact with.
  const pillH = bar.h * 0.5;
  const pillX = bar.x + dotR * 3 + 3 * dotR * 3;
  const pill: Rect = { x: pillX, y: dotY - pillH / 2, w: bar.x + bar.w - pillX - dotR * 3, h: pillH };
  if (pill.w <= 0) return;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  roundedRectPath(ctx, pill, pillH / 2);
  ctx.fill();

  const fontSize = Math.max(10, pillH * 0.55);
  ctx.font = `500 ${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.beginPath();
  ctx.rect(pill.x, pill.y, pill.w, pill.h);
  ctx.clip();
  ctx.fillText(url, pill.x + pillH * 0.5, dotY);
  ctx.restore();
}

/**
 * The device body behind a panel.
 *
 * Drawn, not photographed. A photographic plate would put the screen in perspective, and an
 * affine transform cannot fit a rectangle to a non-parallelogram quad — the screenshot would
 * visibly slide off the bezel. Drawing keeps the screen a true rectangle, which is the whole
 * point: the client's site stays pixel-exact.
 */
function drawDevice(ctx: CanvasRenderingContext2D, device: DeviceSpec, bodyColor: string): void {
  const { body, base, notch, bodyRadius, kind } = device;

  if (base) {
    // Drawn first so the body sits on top of it.
    ctx.fillStyle = bodyColor;
    roundedRectPath(ctx, base, Math.min(base.h / 2, bodyRadius));
    ctx.fill();
  }

  ctx.fillStyle = bodyColor;
  roundedRectPath(ctx, body, bodyRadius);
  ctx.fill();

  if (notch) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundedRectPath(ctx, notch, notch.h / 2);
    ctx.fill();
  }

  if (kind === 'laptop' && base) {
    // A single highlight where the lid meets the base — enough to read as a hinge without
    // pretending to be a rendering.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(base.x + base.w * 0.42, base.y + base.h * 0.35, base.w * 0.16, Math.max(1, base.h * 0.18));
  }
}

function drawPlan(
  ctx: CanvasRenderingContext2D,
  plan: ShowcasePlan,
  images: (HTMLImageElement | null)[],
  chromeBar: string,
  dividerColor: string
): void {
  ctx.fillStyle = plan.background;
  ctx.fillRect(0, 0, plan.width, plan.height);

  // High-quality downscale: these are text-bearing screenshots and the default filter visibly
  // softens UI type. Same reason lib/imageResize.ts sets it for product mockups.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // The body goes down before any screenshot, so the screen is drawn into it.
  if (plan.device) drawDevice(ctx, plan.device, chromeBar);

  for (const panel of plan.panels) {
    const img = images[panel.sourceIndex];
    if (!img) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.dest.x, panel.dest.y, panel.dest.w, panel.dest.h);
    ctx.clip();
    ctx.drawImage(
      img,
      panel.src.x, panel.src.y, panel.src.w, panel.src.h,
      panel.dest.x, panel.dest.y, panel.dest.w, panel.dest.h
    );
    ctx.restore();

    drawChrome(ctx, panel, chromeBar);
    if (panel.label) drawBand(ctx, panel.label);
  }

  if (plan.divider) {
    ctx.fillStyle = dividerColor;
    ctx.fillRect(plan.divider.x, plan.divider.y, plan.divider.w, plan.divider.h);
  }

  if (plan.caption) drawBand(ctx, plan.caption);
}

/**
 * Compose one showcase creative.
 *
 * Returns null for every failure mode (unreadable image, no canvas context, nothing to draw)
 * rather than throwing, so a batch survives one bad asset.
 */
export async function renderShowcase(
  config: ShowcaseRenderConfig
): Promise<GeneratedImageResult | null> {
  const size = config.size ?? DEFAULT_SHOWCASE_SIZE;
  const style = getStyleById(config.styleId || '') ?? TEXT_AD_STYLES[0];
  const palette = paletteFromStyle(style);

  const images = await Promise.all(config.images.map(loadImage));
  const sources = images.map(img =>
    img ? { width: img.naturalWidth, height: img.naturalHeight } : { width: 0, height: 0 }
  );

  const plan = planShowcase({
    template: config.template,
    size,
    sources,
    palette,
    labels: config.labels,
    caption: config.caption,
    chrome: config.chrome,
    urlText: config.urlText,
    device: config.device,
  });

  // Nothing usable decoded — a blank rectangle is worse than an honest failure.
  if (plan.panels.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawPlan(ctx, plan, images, palette.chromeBar, palette.divider);

  const dimensions = SHOWCASE_SIZE_DIMENSIONS[size];
  const who = config.clientName ? ` — ${config.clientName}` : '';
  return {
    imageUrl: canvas.toDataURL(OUTPUT_MIME, OUTPUT_QUALITY),
    // Required by the type and read by nothing, but textAdCanvas fills it descriptively and a
    // composite should be as self-describing as a text ad.
    revisedPrompt: `Showcase composite (${config.template}, ${dimensions.width}x${dimensions.height})${who} — real client screenshots, not AI-generated`,
  };
}

