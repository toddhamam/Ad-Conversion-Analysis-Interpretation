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

interface TextSection {
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

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const HORIZONTAL_PADDING_RATIO = 0.08; // 8% of width on each side
const MIN_FONT_SIZE = 36;
const BANNER_VERTICAL_PADDING = 0.03; // 3% of height above/below banner text

// ---------------------------------------------------------------------------
// Text Layout Engine
// ---------------------------------------------------------------------------

function wrapText(
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

function fitText(
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

function fillBackground(
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

function drawCenteredText(
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
        .map(id => TEXT_AD_STYLES.find(s => s.id === id))
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
// Helpers
// ---------------------------------------------------------------------------

export function getStyleById(id: string): TextAdStyle | undefined {
  return TEXT_AD_STYLES.find(s => s.id === id);
}

export function getDefaultStyleId(): string {
  return 'clean-orange';
}
