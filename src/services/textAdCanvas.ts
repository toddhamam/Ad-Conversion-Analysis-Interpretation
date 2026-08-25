/**
 * Text Ad Canvas Renderer
 *
 * Generates text-only ad images using the Canvas API.
 * No AI API calls — instant, zero-cost, pixel-perfect text rendering.
 *
 * Layout inspired by high-converting lead gen text ads:
 * - Primary text (top): Bold hook/promise in accent color
 * - Highlight banner (middle): Key offer on dark contrast strip
 * - Anchor text (bottom): Trust anchor word
 */

import type { GeneratedImageResult } from './openaiApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextAdStyle {
  id: string;
  name: string;
  backgroundType: 'solid' | 'linear-gradient';
  backgroundColors: string[];
  gradientAngle?: number;
  textColor: string;
  accentColor: string;
  bannerBgColor: string;
  bannerTextColor: string;
  bannerAccentColor: string;
  previewCSS: string;
}

export type ImageSize = '1:1' | '16:9' | '9:16';

export interface TextSection {
  text: string;
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

// ---------------------------------------------------------------------------
// Style Presets
// ---------------------------------------------------------------------------

export const TEXT_AD_STYLES: TextAdStyle[] = [
  {
    id: 'clean-orange',
    name: 'Clean Orange',
    backgroundType: 'solid',
    backgroundColors: ['#ffffff'],
    textColor: '#1a1a1a',
    accentColor: '#ff6600',
    bannerBgColor: '#1a1a2e',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#ff6600',
    previewCSS: 'linear-gradient(135deg, #ffffff 60%, #ff6600 60%)',
  },
  {
    id: 'dark-orange',
    name: 'Dark Orange',
    backgroundType: 'solid',
    backgroundColors: ['#1a1a2e'],
    textColor: '#ffffff',
    accentColor: '#ff6600',
    bannerBgColor: '#ff6600',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#1a1a2e',
    previewCSS: 'linear-gradient(135deg, #1a1a2e 60%, #ff6600 60%)',
  },
  {
    id: 'navy-gold',
    name: 'Navy & Gold',
    backgroundType: 'solid',
    backgroundColors: ['#0d1b3e'],
    textColor: '#ffffff',
    accentColor: '#d4a843',
    bannerBgColor: '#d4a843',
    bannerTextColor: '#0d1b3e',
    bannerAccentColor: '#ffffff',
    previewCSS: 'linear-gradient(135deg, #0d1b3e 60%, #d4a843 60%)',
  },
  {
    id: 'clean-red',
    name: 'Clean Red',
    backgroundType: 'solid',
    backgroundColors: ['#ffffff'],
    textColor: '#1a1a1a',
    accentColor: '#dc2626',
    bannerBgColor: '#1a1a2e',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#dc2626',
    previewCSS: 'linear-gradient(135deg, #ffffff 60%, #dc2626 60%)',
  },
  {
    id: 'dark-lime',
    name: 'Dark Lime',
    backgroundType: 'solid',
    backgroundColors: ['#1e293b'],
    textColor: '#ffffff',
    accentColor: '#d4e157',
    bannerBgColor: '#d4e157',
    bannerTextColor: '#1e293b',
    bannerAccentColor: '#ffffff',
    previewCSS: 'linear-gradient(135deg, #1e293b 60%, #d4e157 60%)',
  },
  {
    id: 'clean-blue',
    name: 'Clean Blue',
    backgroundType: 'solid',
    backgroundColors: ['#ffffff'],
    textColor: '#1a1a1a',
    accentColor: '#2563eb',
    bannerBgColor: '#1a1a2e',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#2563eb',
    previewCSS: 'linear-gradient(135deg, #ffffff 60%, #2563eb 60%)',
  },
  {
    id: 'gradient-warm',
    name: 'Warm Gradient',
    backgroundType: 'linear-gradient',
    backgroundColors: ['#ff6b35', '#d63031'],
    gradientAngle: 135,
    textColor: '#ffffff',
    accentColor: '#fbbf24',
    bannerBgColor: 'rgba(0,0,0,0.35)',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#fbbf24',
    previewCSS: 'linear-gradient(135deg, #ff6b35, #d63031)',
  },
  {
    id: 'gradient-cool',
    name: 'Cool Gradient',
    backgroundType: 'linear-gradient',
    backgroundColors: ['#4158D0', '#C850C0'],
    gradientAngle: 135,
    textColor: '#ffffff',
    accentColor: '#22d3ee',
    bannerBgColor: 'rgba(0,0,0,0.35)',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#22d3ee',
    previewCSS: 'linear-gradient(135deg, #4158D0, #C850C0)',
  },
  {
    id: 'black-yellow',
    name: 'High Contrast',
    backgroundType: 'solid',
    backgroundColors: ['#000000'],
    textColor: '#ffffff',
    accentColor: '#fbbf24',
    bannerBgColor: '#fbbf24',
    bannerTextColor: '#000000',
    bannerAccentColor: '#ffffff',
    previewCSS: 'linear-gradient(135deg, #000000 60%, #fbbf24 60%)',
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    backgroundType: 'solid',
    backgroundColors: ['#2c3e50'],
    textColor: '#ecf0f1',
    accentColor: '#e67e22',
    bannerBgColor: 'rgba(0,0,0,0.4)',
    bannerTextColor: '#ecf0f1',
    bannerAccentColor: '#e67e22',
    previewCSS: 'linear-gradient(135deg, #2c3e50 60%, #e67e22 60%)',
  },
  {
    id: 'gradient-money',
    name: 'Money Green',
    backgroundType: 'linear-gradient',
    backgroundColors: ['#11998e', '#38ef7d'],
    gradientAngle: 135,
    textColor: '#ffffff',
    accentColor: '#fef08a',
    bannerBgColor: 'rgba(0,0,0,0.35)',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#fef08a',
    previewCSS: 'linear-gradient(135deg, #11998e, #38ef7d)',
  },
  {
    id: 'electric-blue',
    name: 'Electric Blue',
    backgroundType: 'linear-gradient',
    backgroundColors: ['#0052D4', '#6FB1FC'],
    gradientAngle: 135,
    textColor: '#ffffff',
    accentColor: '#67e8f9',
    bannerBgColor: 'rgba(0,0,0,0.35)',
    bannerTextColor: '#ffffff',
    bannerAccentColor: '#67e8f9',
    previewCSS: 'linear-gradient(135deg, #0052D4, #6FB1FC)',
  },
];

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const SIZE_DIMENSIONS: Record<ImageSize, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

// ---------------------------------------------------------------------------
// Font & Layout Constants
// ---------------------------------------------------------------------------

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const HORIZONTAL_PADDING_RATIO = 0.08; // 8% of width on each side
const MIN_FONT_SIZE = 36;
const BANNER_VERTICAL_PADDING = 0.03; // 3% of height above/below banner text

// ---------------------------------------------------------------------------
// Text Layout Engine
//
// Exported because services/showcaseCanvas.ts is the second consumer: a showcase composite
// draws BEFORE/AFTER label bands and a caption with the same wrapping and auto-sizing rules
// as a text ad, and a second copy of this engine would let the two drift.
// ---------------------------------------------------------------------------

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: number = 900,
): string[] {
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontWeight: number = 900,
  maxFontSize: number = 140,
): TextSection {
  let fontSize = maxFontSize;
  let lines: string[] = [];
  let lineHeight = 0;

  while (fontSize >= MIN_FONT_SIZE) {
    lines = wrapText(ctx, text, maxWidth, fontSize, fontWeight);
    lineHeight = fontSize * 1.15;
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= maxHeight) break;
    fontSize -= 2;
  }

  // Final clamp
  if (fontSize < MIN_FONT_SIZE) fontSize = MIN_FONT_SIZE;
  lines = wrapText(ctx, text, maxWidth, fontSize, fontWeight);
  lineHeight = fontSize * 1.15;

  return { text, lines, fontSize, lineHeight };
}

// ---------------------------------------------------------------------------
// Background Rendering
// ---------------------------------------------------------------------------

export function fillBackground(
  ctx: CanvasRenderingContext2D,
  style: TextAdStyle,
  width: number,
  height: number,
): void {
  if (style.backgroundType === 'linear-gradient' && style.backgroundColors.length >= 2) {
    const angle = (style.gradientAngle ?? 135) * (Math.PI / 180);
    const cx = width / 2;
    const cy = height / 2;
    const len = Math.sqrt(width * width + height * height) / 2;
    const x0 = cx - Math.cos(angle) * len;
    const y0 = cy - Math.sin(angle) * len;
    const x1 = cx + Math.cos(angle) * len;
    const y1 = cy + Math.sin(angle) * len;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    style.backgroundColors.forEach((c, i) => {
      grad.addColorStop(i / (style.backgroundColors.length - 1), c);
    });
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = style.backgroundColors[0] || '#ffffff';
  }
  ctx.fillRect(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// Section Rendering
// ---------------------------------------------------------------------------

export function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  section: TextSection,
  color: string,
  centerX: number,
  startY: number,
  fontWeight: number = 900,
): void {
  ctx.font = `${fontWeight} ${section.fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i < section.lines.length; i++) {
    ctx.fillText(section.lines[i], centerX, startY + i * section.lineHeight);
  }
}

// ---------------------------------------------------------------------------
// Main Rendering Function
// ---------------------------------------------------------------------------

export function generateTextAdImage(config: {
  primaryText: string;
  highlightText?: string;
  anchorText?: string;
  style: TextAdStyle;
  imageSize: ImageSize;
}): GeneratedImageResult {
  const { primaryText, highlightText, anchorText, style, imageSize } = config;
  const { width, height } = SIZE_DIMENSIONS[imageSize];
  const padX = width * HORIZONTAL_PADDING_RATIO;
  const maxTextWidth = width - padX * 2;

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Fill background
  fillBackground(ctx, style, width, height);

  // Determine which sections are present
  const hasPrimary = primaryText.trim().length > 0;
  const hasHighlight = !!highlightText?.trim();
  const hasAnchor = !!anchorText?.trim();

  const upperedPrimary = primaryText.trim().toUpperCase();
  const upperedHighlight = highlightText?.trim().toUpperCase() || '';
  const upperedAnchor = anchorText?.trim().toUpperCase() || '';

  // Allocate vertical space based on which sections exist
  let primaryRatio: number, highlightRatio: number, anchorRatio: number;

  if (hasPrimary && hasHighlight && hasAnchor) {
    primaryRatio = 0.42;
    highlightRatio = 0.33;
    anchorRatio = 0.25;
  } else if (hasPrimary && hasHighlight) {
    primaryRatio = 0.50;
    highlightRatio = 0.50;
    anchorRatio = 0;
  } else if (hasPrimary && hasAnchor) {
    primaryRatio = 0.65;
    highlightRatio = 0;
    anchorRatio = 0.35;
  } else {
    primaryRatio = 1;
    highlightRatio = 0;
    anchorRatio = 0;
  }

  const primaryHeight = height * primaryRatio;
  const highlightHeight = height * highlightRatio;
  const anchorHeight = height * anchorRatio;

  const primaryY = 0;
  const highlightY = primaryHeight;
  const anchorY = primaryHeight + highlightHeight;

  // --- Render Primary Section ---
  if (hasPrimary) {
    const usableHeight = primaryHeight * 0.75; // leave some padding
    const section = fitText(ctx, upperedPrimary, maxTextWidth, usableHeight);
    const totalTextHeight = section.lines.length * section.lineHeight;
    const startY = primaryY + (primaryHeight - totalTextHeight) / 2;
    drawCenteredText(ctx, section, style.accentColor, width / 2, startY);
  }

  // --- Render Highlight Banner Section ---
  if (hasHighlight) {
    // Draw banner background
    ctx.fillStyle = style.bannerBgColor;
    ctx.fillRect(0, highlightY, width, highlightHeight);

    const bannerPadY = height * BANNER_VERTICAL_PADDING;
    const usableHeight = highlightHeight - bannerPadY * 2;
    const section = fitText(ctx, upperedHighlight, maxTextWidth, usableHeight);
    const totalTextHeight = section.lines.length * section.lineHeight;
    const startY = highlightY + (highlightHeight - totalTextHeight) / 2;
    drawCenteredText(ctx, section, style.bannerTextColor, width / 2, startY);
  }

  // --- Render Anchor Section ---
  if (hasAnchor) {
    const usableHeight = anchorHeight * 0.65;
    const section = fitText(ctx, upperedAnchor, maxTextWidth, usableHeight, 900, 100);
    const totalTextHeight = section.lines.length * section.lineHeight;
    const startY = anchorY + (anchorHeight - totalTextHeight) / 2;
    drawCenteredText(ctx, section, style.textColor, width / 2, startY);
  }

  // Export as data URL
  const imageUrl = canvas.toDataURL('image/png');

  // Descriptive revisedPrompt for GeneratedImageResult compatibility
  const sections = [
    hasPrimary ? `Primary: "${primaryText.trim()}"` : '',
    hasHighlight ? `Highlight: "${highlightText!.trim()}"` : '',
    hasAnchor ? `Anchor: "${anchorText!.trim()}"` : '',
  ].filter(Boolean).join(' | ');

  const revisedPrompt = `Text ad (${style.name}, ${imageSize}): ${sections}`;

  return { imageUrl, revisedPrompt };
}

// ---------------------------------------------------------------------------
// Batch Generation with Style Rotation
// ---------------------------------------------------------------------------

export function generateTextAdVariations(config: {
  primaryText: string;
  highlightText?: string;
  anchorText?: string;
  styleIds: string[];
  imageSize: ImageSize;
  variationCount: number;
}): { images: GeneratedImageResult[]; imageError?: string } {
  const { primaryText, highlightText, anchorText, styleIds, imageSize, variationCount } = config;

  if (!primaryText.trim()) {
    return { images: [], imageError: 'Primary text is required for text ad generation.' };
  }

  // Resolve styles — fall back to first preset if none selected or invalid
  const resolvedStyles = styleIds.length > 0
    ? styleIds
        .map(id => getStyleById(id))
        .filter((s): s is TextAdStyle => s !== undefined)
    : [TEXT_AD_STYLES[0]];

  if (resolvedStyles.length === 0) {
    resolvedStyles.push(TEXT_AD_STYLES[0]);
  }

  const images: GeneratedImageResult[] = [];

  for (let i = 0; i < variationCount; i++) {
    const style = resolvedStyles[i % resolvedStyles.length];
    const result = generateTextAdImage({
      primaryText,
      highlightText,
      anchorText,
      style,
      imageSize,
    });
    images.push(result);
  }

  return { images };
}

// ---------------------------------------------------------------------------
// Custom Brand Style
// ---------------------------------------------------------------------------

export const CUSTOM_BRAND_ID = 'custom-brand';

let _customBrandStyle: TextAdStyle | null = null;

export function registerCustomBrandStyle(style: TextAdStyle | null): void {
  _customBrandStyle = style;
}

export function getCustomBrandStyle(): TextAdStyle | null {
  return _customBrandStyle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStyleById(id: string): TextAdStyle | undefined {
  if (id === CUSTOM_BRAND_ID && _customBrandStyle) {
    return _customBrandStyle;
  }
  return TEXT_AD_STYLES.find(s => s.id === id);
}

export function getDefaultStyleId(): string {
  return 'clean-orange';
}

// ---------------------------------------------------------------------------
// Avatar Callout Overlay
// ---------------------------------------------------------------------------

/** Where the callout band sits on the base image. */
export type CalloutPosition = 'top' | 'bottom';

export interface CalloutOverlayConfig {
  /** Base image as a data URL — the shared, text-free creative for the whole matrix. */
  baseImageUrl: string;
  /** The avatar callout line, e.g. "Dads over 40 need this". */
  calloutText: string;
  position?: CalloutPosition;
  /** Band height as a fraction of image height. */
  bandRatio?: number;
  bandColor?: string;
  textColor?: string;
}

const CALLOUT_BAND_RATIO = 0.22;
const CALLOUT_MAX_FONT = 96;

/**
 * Composite an avatar callout onto an already-generated base image.
 *
 * This is the whole point of the callout matrix: ONE generated image, N callout lines. Doing
 * the overlay on canvas rather than re-generating means the construct is *pixel-identical*
 * across every variant, so the callout is genuinely the only variable — which is what makes
 * the test valid. It also costs zero credits and zero latency, where N generations would cost
 * N credits and drift the composition between them.
 *
 * Reuses fitText / drawCenteredText, so wrapping and auto-sizing behave exactly as they do in
 * the text-ad renderer. Returns null rather than throwing: one failed overlay must not lose
 * the base image or the other variants.
 */
export async function renderCalloutOverlay(
  config: CalloutOverlayConfig
): Promise<GeneratedImageResult | null> {
  const {
    baseImageUrl,
    calloutText,
    position = 'bottom',
    bandRatio = CALLOUT_BAND_RATIO,
    bandColor = 'rgba(15, 23, 42, 0.88)',
    textColor = '#ffffff',
  } = config;

  const text = calloutText.trim();
  if (!text) return null;

  const img = await new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = baseImageUrl;
  });
  if (!img || img.naturalWidth === 0) return null;

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);

  const bandHeight = height * bandRatio;
  const bandY = position === 'top' ? 0 : height - bandHeight;

  ctx.fillStyle = bandColor;
  ctx.fillRect(0, bandY, width, bandHeight);

  const padX = width * HORIZONTAL_PADDING_RATIO;
  const section = fitText(
    ctx,
    text.toUpperCase(),
    width - padX * 2,
    bandHeight * 0.72,
    900,
    Math.min(CALLOUT_MAX_FONT, height * 0.09)
  );
  const textHeight = section.lines.length * section.lineHeight;
  drawCenteredText(ctx, section, textColor, width / 2, bandY + (bandHeight - textHeight) / 2);

  return {
    imageUrl: canvas.toDataURL('image/png'),
    revisedPrompt: `Avatar callout overlay: "${text}"`,
  };
}

/**
 * Render one base image into N callout variants, position-aligned with `callouts`.
 *
 * A null slot means that overlay failed; callers keep the position so a failure maps back to
 * the callout that produced it rather than silently shifting the rest.
 */
export async function renderCalloutMatrix(
  baseImageUrl: string,
  callouts: string[],
  options?: Omit<CalloutOverlayConfig, 'baseImageUrl' | 'calloutText'>
): Promise<(GeneratedImageResult | null)[]> {
  const results: (GeneratedImageResult | null)[] = [];
  for (const callout of callouts) {
    results.push(await renderCalloutOverlay({ baseImageUrl, calloutText: callout, ...options }));
  }
  return results;
}
