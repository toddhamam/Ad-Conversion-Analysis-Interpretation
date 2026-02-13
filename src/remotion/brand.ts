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
  durationInFrames: 5860, // ~195 seconds (~3:15)
} as const;

// Demo reel configuration — adjust playbackRate to control speed
export const DEMO_CONFIG = {
  videoDuration: 141,  // 2:21 native video length in seconds
  playbackRate: 2,     // Speed multiplier (1 = real-time, 2 = 2x speed, etc.)
  // Computed: playback frames = 142 * 30 / 2 = 2130
} as const;

// Demo-only video configuration (standalone demo reel)
export const DEMO_VIDEO_CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 2570, // 240 + 2130 + 200 = ~85.7 seconds
} as const;

// Scene timing for standalone demo video (frames start at 0)
export const DEMO_SCENES = {
  intro: { from: 0, duration: 240 },        // 0-8s (countdown 3-2-1)
  playback: { from: 240, duration: 2130 },   // 8-79s (full video at 2x)
  complete: { from: 2370, duration: 200 },    // 79-86s (victory reveal)
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
  demoIntro: { from: 2050, duration: 240 },      // 68-76s  (intro + 3,2,1 countdown)
  demoPlayback: { from: 2290, duration: 2130 },  // 76-147s (full video at 2x, 141s native)
  demoComplete: { from: 4420, duration: 200 },   // 147-154s (completion reveal)
  results: { from: 4620, duration: 250 },        // 154-162s
  costOfWaiting: { from: 4870, duration: 450 },  // 162-177s
  enterprise: { from: 5320, duration: 210 },     // 177-184s
  cta: { from: 5530, duration: 330 },            // 184-195s
} as const;
