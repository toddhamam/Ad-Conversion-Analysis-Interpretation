// Convertra VSL Brand Constants
// Matches the design system from CLAUDE.md and SalesLanding

export const COLORS = {
  // Primary Accent (Lime)
  lime: '#d4e157',
  limeSecondary: '#c0ca33',
  limeDark: '#9e9d24',
  limeGlow: 'rgba(212, 225, 87, 0.3)',
  limeSubtle: 'rgba(212, 225, 87, 0.15)',

  // Secondary Accent (Violet)
  violet: '#a855f7',
  violetBright: '#c4b5fd',
  violetDark: '#7c3aed',
  violetGlow: 'rgba(168, 85, 247, 0.15)',

  // Backgrounds
  bgPrimary: '#ffffff',
  bgSecondary: '#f8fafc',
  bgDark: '#0f172a',
  bgDarkSecondary: '#1e293b',

  // Text
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textLight: '#f8fafc',
  textLightMuted: 'rgba(248, 250, 252, 0.7)',

  // Borders
  borderPrimary: '#e2e8f0',
  borderViolet: 'rgba(168, 85, 247, 0.2)',
} as const;

export const GRADIENTS = {
  lime: 'linear-gradient(135deg, #d4e157 0%, #c0ca33 100%)',
  violet: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
  holographic: 'linear-gradient(135deg, #d4e157 0%, #a855f7 50%, #c4b5fd 100%)',
  dualGlow: 'linear-gradient(135deg, #d4e157 0%, #a855f7 100%)',
  darkRadial: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 100%)',
} as const;

export const FONTS = {
  primary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
} as const;

// Video configuration
export const VIDEO_CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 3290, // ~110 seconds
} as const;

// Scene timing (in frames at 30fps)
export const SCENES = {
  hook: { from: 0, duration: 180 },             // 0-6s
  painQuestion: { from: 180, duration: 240 },   // 6-14s   (+1s for tagline)
  theLoop: { from: 420, duration: 270 },         // 14-23s
  revelation: { from: 690, duration: 210 },      // 23-30s
  ciqReveal: { from: 900, duration: 270 },       // 30-39s  (key moment)
  extract: { from: 1170, duration: 220 },        // 39-46s  (ConversionIQ™)
  interpret: { from: 1390, duration: 220 },      // 46-54s  (ConversionIQ™)
  generate: { from: 1610, duration: 220 },       // 54-61s  (ConversionIQ™)
  repeat: { from: 1830, duration: 220 },         // 61-68s  (ConversionIQ™)
  results: { from: 2050, duration: 250 },        // 68-77s
  costOfWaiting: { from: 2300, duration: 450 },  // 77-92s  (urgency / risk reversal)
  enterprise: { from: 2750, duration: 210 },     // 92-99s
  cta: { from: 2960, duration: 330 },            // 99-110s
} as const;
