---
name: vsl
description: Create or edit Remotion VSL (Video Sales Letter) videos. Use for adding scenes, modifying copy/timing, adjusting animations, or building a new VSL from scratch.
---

# Remotion VSL Skill

You are helping create or edit a Remotion-powered VSL (Video Sales Letter). The user's request is: $ARGUMENTS

## Current State

**Scene timing** (frames at 30fps):
!`grep -A 20 'export const SCENES' src/remotion/brand.ts`

**Video config**:
!`grep -A 5 'export const VIDEO_CONFIG' src/remotion/brand.ts`

## Architecture

| File | Purpose |
|------|---------|
| `src/remotion/brand.ts` | Brand constants (COLORS, GRADIENTS, FONTS), VIDEO_CONFIG, SCENES timing |
| `src/remotion/ConvertraVSL.tsx` | Main composition — all scene components, animation helpers, audio, Sequence layout |
| `src/remotion/Root.tsx` | Remotion composition registration (`registerRoot`) |
| `remotion.config.ts` | CLI entry point (`./src/remotion/Root.tsx`) |
| `src/pages/SalesLanding.tsx` | Embeds VSL via `@remotion/player` Player component with poster |
| `public/vsl-background-music.mp3` | Background music audio file |
| `public/convertra-logo.png` | Brand logo (used in CTA scene) |

## Remotion Imports

```typescript
import {
  AbsoluteFill,      // Full-screen container for scenes
  Audio,             // Background music with volume control
  Sequence,          // Scene timing — from (start frame) + durationInFrames
  useCurrentFrame,   // Current frame number within the Sequence
  useVideoConfig,    // Video fps, width, height
  interpolate,       // Linear/eased interpolation between values
  spring,            // Physics-based spring animation
  Easing,            // Easing curves (out, cubic, back)
  Img,               // Image component (use for logos/assets)
  staticFile,        // Reference files in public/ directory
} from 'remotion';
```

## Animation Helpers

These are defined at the top of `ConvertraVSL.tsx` and shared across all scenes:

```typescript
// Fade in: opacity 0 → 1
fadeIn(frame: number, start: number, duration = 20): number

// Fade out: opacity 1 → 0
fadeOut(frame: number, start: number, duration = 20): number

// Slide up: translateY 40px → 0px (with cubic easing)
slideUp(frame: number, start: number, duration = 25): number

// Spring scale: scale 0 → 1 (physics-based bounce)
scaleIn(frame: number, fps: number, delay = 0): number
```

**Usage**:
```tsx
const opacity = fadeIn(frame, 15, 25);     // Start at frame 15, take 25 frames
const y = slideUp(frame, 15, 25);          // Same timing for coordinated entrance
// Apply: style={{ opacity, transform: `translateY(${y}px)` }}
```

## Scene Component Template

Every scene follows this pattern:

```tsx
function MyScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Element animations (stagger with different start frames)
  const titleOpacity = fadeIn(frame, 10, 25);
  const titleY = slideUp(frame, 10, 25);
  const subtitleOpacity = fadeIn(frame, 40, 25);
  const subtitleY = slideUp(frame, 40, 25);

  // Scene exit fade (start 30 frames before scene ends)
  const sceneOpacity = frame > 180 ? fadeOut(frame, 180, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,  // or COLORS.bgPrimary for light
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', padding: '0 80px' }}>
        <h2 style={{
          fontFamily: FONTS.primary,
          fontSize: 88,
          fontWeight: 700,
          color: COLORS.textLight,           // or COLORS.textPrimary for light bg
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}>
          Scene Title
        </h2>
        <p style={{
          fontFamily: FONTS.primary,
          fontSize: 40,
          fontWeight: 400,
          color: COLORS.textLightMuted,      // or COLORS.textSecondary for light bg
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
        }}>
          Subtitle text here
        </p>
      </div>
    </AbsoluteFill>
  );
}
```

## Brand Constants Quick Reference

### Colors
- **Lime accent**: `COLORS.lime` (#d4e157), `COLORS.limeSecondary`, `COLORS.limeGlow`
- **Violet accent**: `COLORS.violet` (#a855f7), `COLORS.violetBright`, `COLORS.violetGlow`
- **Dark backgrounds**: `COLORS.bgDark` (#0f172a), `COLORS.bgDarkSecondary`
- **Light backgrounds**: `COLORS.bgPrimary` (#ffffff), `COLORS.bgSecondary`
- **Light text**: `COLORS.textLight`, `COLORS.textLightMuted` (for dark backgrounds)
- **Dark text**: `COLORS.textPrimary`, `COLORS.textSecondary`, `COLORS.textMuted` (for light backgrounds)

### Gradients
- **Dark scene background**: `GRADIENTS.darkRadial`
- **Lime-to-violet**: `GRADIENTS.dualGlow` (use for gradient text, glowing elements)
- **Lime only**: `GRADIENTS.lime`
- **Violet only**: `GRADIENTS.violet`

### Typography
- **Font**: `FONTS.primary` (system font stack)
- **Headline sizes**: 72-130px
- **Body sizes**: 34-56px
- **Label/caption sizes**: 26-36px
- **All text uses inline styles** (no CSS classes in Remotion)

## Common Patterns

### Gradient Text
```tsx
<span style={{
  background: GRADIENTS.dualGlow,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}}>
  Gradient Text
</span>
```

### Staggered Card Reveals
```tsx
const items = ['Card 1', 'Card 2', 'Card 3'];
{items.map((item, i) => {
  const delay = 40 + i * 30;  // 30-frame stagger
  const cardScale = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 100 } });
  return (
    <div key={i} style={{ opacity: cardScale, transform: `scale(${cardScale})` }}>
      {item}
    </div>
  );
})}
```

### Animated Counter
```tsx
const counterProgress = interpolate(
  frame, [startFrame, startFrame + 50], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
);
const displayValue = Math.round(targetValue * counterProgress);
```

### Pulsing Glow
```tsx
const pulse = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.4, 1]);
// Apply: boxShadow: `0 0 ${50 * pulse}px ${COLORS.limeGlow}`
```

### Particle Background
```tsx
const particles = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const radius = interpolate(frame, [30, 120], [300, 80], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
});
```

### Scene Exit Fade
```tsx
// Always fade out in the last ~1 second of the scene
// If scene duration is 210 frames, start fade at frame 180
const sceneOpacity = frame > 180 ? fadeOut(frame, 180, 30) : 1;
// Apply to the root AbsoluteFill: style={{ opacity: sceneOpacity }}
```

## Reusable Component: MechanismStep

For step-by-step process scenes (like Extract/Interpret/Generate/Repeat):

```tsx
<MechanismStep
  stepNumber="1"
  title="Extract"
  description="Description of what this step does..."
  accentColor={COLORS.lime}       // or COLORS.violet
  icon={MechanismIcons.extract(COLORS.lime)}
/>
```

Layout: Left icon card (340x340) + Right title/description, with "ConversionIQ Engine" badge at top.

## Adding a New Scene — Checklist

1. **Create the scene function** in `ConvertraVSL.tsx` following the template above
2. **Add scene timing** to `SCENES` in `brand.ts`:
   ```typescript
   newScene: { from: previousEnd, duration: 210 },  // 7 seconds at 30fps
   ```
3. **Cascade downstream scenes** — shift all subsequent `from` values by your new duration
4. **Update `VIDEO_CONFIG.durationInFrames`** — add the new scene's frame count
5. **Add the Sequence** in the main `ConvertraVSL` component:
   ```tsx
   <Sequence from={SCENES.newScene.from} durationInFrames={SCENES.newScene.duration}>
     <MyScene />
   </Sequence>
   ```
6. **Update audio fade-out** — adjust the fade-out keyframes in the `<Audio>` volume function to match new total duration
7. **Test**: `npx remotion studio` — scrub through the video to verify timing and transitions

## Editing Existing Scenes

1. **Read the scene** in `ConvertraVSL.tsx` — find the function by scene name
2. **Modify copy/styles** — change text content, font sizes, colors, layout
3. **Adjust timing** if needed — update `SCENES` in `brand.ts` and cascade changes
4. **Test**: `npx remotion studio`

## Sales Landing Integration

The VSL is embedded using `@remotion/player`:

```tsx
import { Player } from '@remotion/player';
import { ConvertraVSL } from '../remotion/ConvertraVSL';
import { VIDEO_CONFIG } from '../remotion/brand';

<Player
  component={ConvertraVSL}
  durationInFrames={VIDEO_CONFIG.durationInFrames}
  fps={VIDEO_CONFIG.fps}
  compositionWidth={VIDEO_CONFIG.width}
  compositionHeight={VIDEO_CONFIG.height}
  controls
  renderPoster={({ width, height }) => <VSLPoster width={width} height={height} />}
  posterFillMode="player-size"
  showPosterWhenUnplayed
/>
```

The `VSLPoster` component renders a branded thumbnail shown before the user clicks play.

## Dev Commands

```bash
npx remotion studio                                              # Preview in browser
npx remotion render src/remotion/Root.tsx ConvertraVSL out/vsl.mp4  # Render to MP4
npm run dev                                                       # Test in app context
```

## Important Notes

- **Frame math**: 30 fps — 1 second = 30 frames, 7 seconds = 210 frames
- **No CSS files**: All styling is inline (Remotion requirement)
- **Scene-relative frames**: `useCurrentFrame()` returns frames relative to the Sequence start, not absolute video position
- **Always clamp interpolation**: Use `extrapolateLeft: 'clamp'` and `extrapolateRight: 'clamp'`
- **React 19 compatibility**: `.npmrc` has `legacy-peer-deps=true` for Remotion
- **Video does not loop**: Plays once and stops on CTA scene
- **Assets in `public/`**: Use `staticFile('filename')` to reference them
