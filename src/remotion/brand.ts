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
  durationInFrames: 2810, // ~94 seconds
} as const;

// Scene timing (in frames at 30fps)
export const SCENES = {
  hook: { from: 0, duration: 180 },             // 0-6s
  painQuestion: { from: 180, duration: 210 },   // 6-13s
  theLoop: { from: 390, duration: 270 },         // 13-22s
  revelation: { from: 660, duration: 210 },      // 22-29s
  ciqReveal: { from: 870, duration: 270 },       // 29-38s  (key moment)
  extract: { from: 1140, duration: 220 },        // 38-45s  (ConversionIQ™)
  interpret: { from: 1360, duration: 220 },      // 45-53s  (ConversionIQ™)
  generate: { from: 1580, duration: 220 },       // 53-60s  (ConversionIQ™)
  repeat: { from: 1800, duration: 220 },         // 60-67s  (ConversionIQ™)
  results: { from: 2020, duration: 250 },        // 67-76s
  enterprise: { from: 2270, duration: 210 },     // 76-83s
  cta: { from: 2480, duration: 330 },            // 83-94s
} as const;
