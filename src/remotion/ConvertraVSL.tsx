import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Img,
  staticFile,
} from 'remotion';
import { COLORS, GRADIENTS, FONTS, SCENES, DEMO_CONFIG, VIDEO_CONFIG } from './brand';

// Music file duration in frames (~133 seconds at 30fps)
const MUSIC_DURATION_FRAMES = 3990;

// Volume envelope based on global frame position
// Dips during demo playback so focus is on the video
function musicVolume(globalFrame: number): number {
  return interpolate(
    globalFrame,
    [0, 45, 2050, 2290, 4420, 4620, 5770, 5860],
    [0, 0.25, 0.25, 0.08, 0.08, 0.25, 0.25, 0],
    { extrapolateRight: 'clamp' },
  );
}

// ─── Animation Helpers ────────────────────────────────────────────

function fadeIn(frame: number, start: number, duration = 20): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function fadeOut(frame: number, start: number, duration = 20): number {
  return interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function slideUp(frame: number, start: number, duration = 25): number {
  return interpolate(frame, [start, start + duration], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

function scaleIn(frame: number, fps: number, delay = 0): number {
  return spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 100 } });
}

// ─── Scene Components ─────────────────────────────────────────────

// Scene 1: Hook - "While your competitors wait on designers..."
function HookScene() {
  const frame = useCurrentFrame();

  const textOpacity = fadeIn(frame, 15, 25);
  const textY = slideUp(frame, 15, 25);
  const sceneOpacity = frame > 150 ? fadeOut(frame, 150, 30) : 1;

  // Subtle floating orb
  const orbX = interpolate(frame, [0, 180], [0, 30], { extrapolateRight: 'clamp' });
  const orbY = interpolate(frame, [0, 180], [0, -15], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background orbs */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: COLORS.limeGlow,
          filter: 'blur(120px)',
          top: '20%',
          right: '15%',
          transform: `translate(${orbX}px, ${orbY}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: COLORS.violetGlow,
          filter: 'blur(100px)',
          bottom: '20%',
          left: '10%',
          transform: `translate(${-orbX}px, ${-orbY}px)`,
        }}
      />

      <div
        style={{
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          textAlign: 'center',
          padding: '0 100px',
        }}
      >
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 72,
            fontWeight: 600,
            color: COLORS.textLight,
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          While your{' '}
          <span style={{ color: COLORS.lime }}>competitors</span> wait
          on designers, media buyers, and other human bottlenecks...
        </p>
      </div>
    </AbsoluteFill>
  );
}

// Scene 2: CIQ Velocity Reveal - "ConversionIQ™ is already testing 50 creatives"
function PainQuestionScene() {
  const frame = useCurrentFrame();

  const line1Opacity = fadeIn(frame, 10, 20);
  const line1Y = slideUp(frame, 10, 20);
  const numberOpacity = fadeIn(frame, 50, 20);
  const numberScale = interpolate(frame, [50, 80], [0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.5)),
  });
  const line2Opacity = fadeIn(frame, 90, 20);
  const line2Y = slideUp(frame, 90, 20);
  const taglineOpacity = fadeIn(frame, 140, 25);
  const sceneOpacity = frame > 210 ? fadeOut(frame, 210, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', padding: '0 80px' }}>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 62,
            fontWeight: 600,
            color: COLORS.textLight,
            lineHeight: 1.5,
            margin: 0,
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
          }}
        >
          ConversionIQ™ is already launching, testing, and scaling
        </p>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 130,
            fontWeight: 700,
            background: GRADIENTS.dualGlow,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: '20px 0',
            opacity: numberOpacity,
            transform: `scale(${numberScale})`,
          }}
        >
          dozens of creatives
        </p>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 62,
            fontWeight: 600,
            color: COLORS.textLight,
            lineHeight: 1.5,
            margin: 0,
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          — before your morning standup.
        </p>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 56,
            fontWeight: 700,
            color: COLORS.textLight,
            letterSpacing: 6,
            margin: '32px 0 0 0',
            opacity: taglineOpacity,
          }}
        >
          Creative velocity. Unlimited. Autonomous.
        </p>
      </div>
    </AbsoluteFill>
  );
}

// SVG line icons for the loop scene
const LoopIcons = {
  launch: (color: string) => (
    <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  clock: (color: string) => (
    <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  question: (color: string) => (
    <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r="0.5" fill={color} stroke="none" />
    </svg>
  ),
  refresh: (color: string) => (
    <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  burn: (color: string) => (
    <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1 3-2 5-2 8a4 4 0 0 0 8 0c0-2-1-3-2-4" />
      <path d="M12 22c-4 0-6-2.5-6-6 0-2.5 1.5-4 3-5.5" />
      <path d="M14 22c2-1 4-3.5 4-6" />
    </svg>
  ),
  arrow: (color: string) => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

// Scene 3: The Loop - The creative bottleneck
function TheLoopScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = fadeIn(frame, 5, 20);
  const headerY = slideUp(frame, 5, 20);

  const steps = [
    { label: 'Brief the team', icon: LoopIcons.launch },
    { label: 'Wait for design', icon: LoopIcons.clock },
    { label: 'Review & revise', icon: LoopIcons.refresh },
    { label: 'Finally launch', icon: LoopIcons.question },
    { label: 'One ad. Repeat.', icon: LoopIcons.burn },
  ];

  const sceneOpacity = frame > 240 ? fadeOut(frame, 240, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', width: '100%', padding: '0 40px' }}>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 72,
            fontWeight: 600,
            color: COLORS.textLightMuted,
            marginBottom: 70,
            opacity: headerOpacity,
            transform: `translateY(${headerY}px)`,
          }}
        >
          You're stuck in the{' '}
          <span style={{ color: COLORS.lime }}>creative bottleneck</span>
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
          }}
        >
          {steps.map((step, i) => {
            const stepDelay = 40 + i * 28;
            const stepScale = scaleIn(frame, fps, stepDelay);
            const isActive =
              frame > stepDelay + 30 &&
              Math.floor((frame - stepDelay) / 40) % 2 === 0;

            const iconColor = isActive ? COLORS.lime : 'rgba(248, 250, 252, 0.5)';

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 24,
                    opacity: stepScale,
                    transform: `scale(${stepScale})`,
                  }}
                >
                  <div
                    style={{
                      width: 220,
                      height: 220,
                      borderRadius: 32,
                      background: isActive
                        ? 'rgba(212, 225, 87, 0.1)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: `2px solid ${isActive ? 'rgba(212, 225, 87, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {step.icon(iconColor)}
                  </div>
                  <span
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 36,
                      fontWeight: 500,
                      color: isActive ? COLORS.textLight : COLORS.textLightMuted,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {step.label}
                  </span>
                </div>

                {i < steps.length - 1 && (
                  <div
                    style={{
                      opacity: fadeIn(frame, stepDelay + 20, 15),
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {LoopIcons.arrow('rgba(148, 163, 184, 0.4)')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {frame > 180 && (
          <p
            style={{
              fontFamily: FONTS.primary,
              fontSize: 56,
              fontWeight: 600,
              color: 'rgba(239, 68, 68, 0.9)',
              marginTop: 60,
              opacity: fadeIn(frame, 180, 20),
              transform: `translateY(${slideUp(frame, 180, 20)}px)`,
            }}
          >
            Days per creative. Sound familiar?
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
}

// Scene 4: Revelation - "What if creative testing ran itself?"
function RevelationScene() {
  const frame = useCurrentFrame();

  const line1Opacity = fadeIn(frame, 10, 25);
  const line1Y = slideUp(frame, 10, 25);
  const line2Opacity = fadeIn(frame, 60, 25);
  const line2Y = slideUp(frame, 60, 25);
  const highlightOpacity = fadeIn(frame, 100, 25);
  const sceneOpacity = frame > 180 ? fadeOut(frame, 180, 30) : 1;

  // Particles converging to represent automation
  const particleCount = 12;
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = interpolate(frame, [30, 120], [300, 80], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    const x = Math.cos(angle + frame * 0.01) * radius;
    const y = Math.sin(angle + frame * 0.01) * radius;
    return { x, y, delay: i * 3 };
  });

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Automation particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: i % 2 === 0 ? COLORS.lime : COLORS.violet,
            left: '50%',
            top: '50%',
            transform: `translate(${p.x}px, ${p.y}px)`,
            opacity: fadeIn(frame, p.delay + 20, 15) * 0.6,
            boxShadow: `0 0 16px ${i % 2 === 0 ? COLORS.limeGlow : COLORS.violetGlow}`,
          }}
        />
      ))}

      <div style={{ textAlign: 'center', padding: '0 80px', zIndex: 1 }}>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 64,
            fontWeight: 600,
            color: COLORS.textLight,
            lineHeight: 1.5,
            margin: 0,
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
          }}
        >
          What if{' '}
          <span style={{ color: COLORS.lime }}>creative testing</span>{' '}
          ran itself?
        </p>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 58,
            fontWeight: 500,
            color: COLORS.textLightMuted,
            lineHeight: 1.5,
            margin: '20px 0 0 0',
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          At any scale. Fully autonomous.
        </p>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 72,
            fontWeight: 700,
            color: COLORS.textLight,
            lineHeight: 1.5,
            margin: '28px 0 0 0',
            opacity: highlightOpacity,
          }}
        >
          Meet ConversionIQ™.
        </p>
      </div>
    </AbsoluteFill>
  );
}

// Scene 5: ConversionIQ™ Reveal
function CIQRevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 20, fps, config: { damping: 10, stiffness: 80 } });
  const taglineOpacity = fadeIn(frame, 70, 25);
  const taglineY = slideUp(frame, 70, 25);

  // Pulsing glow
  const glowIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.7],
  );

  const sceneOpacity = frame > 240 ? fadeOut(frame, 240, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Center glow */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.limeGlow} 0%, transparent 70%)`,
          opacity: glowIntensity,
          filter: 'blur(60px)',
        }}
      />

      <div
        style={{
          textAlign: 'center',
          transform: `scale(${logoScale})`,
          opacity: logoScale,
          zIndex: 1,
        }}
      >
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 36,
            fontWeight: 500,
            color: COLORS.textLightMuted,
            letterSpacing: 8,
            textTransform: 'uppercase',
            margin: '0 0 28px 0',
          }}
        >
          Introducing Our Agentic Technology
        </p>
        <h2
          style={{
            fontFamily: FONTS.primary,
            fontSize: 130,
            fontWeight: 700,
            background: GRADIENTS.dualGlow,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          ConversionIQ™
        </h2>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 38,
            fontWeight: 400,
            color: COLORS.textLightMuted,
            margin: '28px 0 0 0',
            opacity: taglineOpacity,
            maxWidth: 1100,
          }}
        >
          The autonomous creative intelligence engine that launches, tests,
          and scales your winning ads — at a velocity no human team can match.
        </p>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 160,
          textAlign: 'center',
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
        }}
      >
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 52,
            fontWeight: 600,
            color: COLORS.textLight,
            letterSpacing: 4,
          }}
        >
          Extract &middot; Interpret &middot; Generate &middot; Repeat
        </p>
      </div>
    </AbsoluteFill>
  );
}

// SVG line art icons for mechanism steps
const MechanismIcons = {
  extract: (color: string) => (
    <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <line x1="10" y1="6.5" x2="14" y2="6.5" opacity="0.4" />
      <line x1="10" y1="17.5" x2="14" y2="17.5" opacity="0.4" />
      <line x1="6.5" y1="10" x2="6.5" y2="14" opacity="0.4" />
      <line x1="17.5" y1="10" x2="17.5" y2="14" opacity="0.4" />
    </svg>
  ),
  interpret: (color: string) => (
    <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <path d="M8 11h6" />
      <path d="M11 8v6" />
      <circle cx="11" cy="11" r="3" opacity="0.3" />
    </svg>
  ),
  generate: (color: string) => (
    <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  repeat: (color: string) => (
    <svg width="130" height="130" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
};

// Shared mechanism step component
function MechanismStep({
  stepNumber,
  title,
  description,
  accentColor,
  icon,
}: {
  stepNumber: string;
  title: string;
  description: string;
  accentColor: string;
  icon: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeOpacity = fadeIn(frame, 5, 15);
  const cardScale = spring({ frame: frame - 10, fps, config: { damping: 12, stiffness: 100 } });
  const textOpacity = fadeIn(frame, 30, 20);
  const textY = slideUp(frame, 30, 20);
  const descOpacity = fadeIn(frame, 55, 25);
  const descY = slideUp(frame, 55, 25);
  const sceneOpacity = frame > 190 ? fadeOut(frame, 190, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bgPrimary,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Subtle background accent */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
          filter: 'blur(80px)',
          top: '10%',
          right: '10%',
        }}
      />

      {/* ConversionIQ™ persistent badge */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: badgeOpacity,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.primary,
            fontSize: 30,
            fontWeight: 600,
            background: GRADIENTS.dualGlow,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: 4,
          }}
        >
          ConversionIQ™ Engine
        </span>
        <div
          style={{
            width: 80,
            height: 3,
            background: GRADIENTS.dualGlow,
            borderRadius: 2,
            margin: '12px auto 0',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 100,
          padding: '0 100px',
          maxWidth: 1800,
        }}
      >
        {/* Step icon / number */}
        <div
          style={{
            opacity: cardScale,
            transform: `scale(${cardScale})`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 340,
              height: 340,
              borderRadius: 44,
              background: COLORS.bgSecondary,
              border: `2px solid ${accentColor}30`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 20px 60px ${accentColor}15`,
            }}
          >
            <div style={{ marginBottom: 16 }}>{icon}</div>
            <span
              style={{
                fontFamily: FONTS.primary,
                fontSize: 28,
                fontWeight: 600,
                color: accentColor,
                letterSpacing: 5,
                textTransform: 'uppercase',
              }}
            >
              Step {stepNumber}
            </span>
          </div>
        </div>

        {/* Text content */}
        <div>
          <h3
            style={{
              fontFamily: FONTS.primary,
              fontSize: 96,
              fontWeight: 700,
              color: COLORS.textPrimary,
              margin: '0 0 24px 0',
              opacity: textOpacity,
              transform: `translateY(${textY}px)`,
            }}
          >
            {title}
          </h3>
          <p
            style={{
              fontFamily: FONTS.primary,
              fontSize: 42,
              fontWeight: 400,
              color: COLORS.textSecondary,
              lineHeight: 1.6,
              margin: 0,
              maxWidth: 950,
              opacity: descOpacity,
              transform: `translateY(${descY}px)`,
            }}
          >
            {description}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Scene 10a: Demo Intro — "Don't believe us?" + 3, 2, 1 countdown
function DemoIntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text stagger
  const line1Opacity = fadeIn(frame, 10, 20);
  const line1Y = slideUp(frame, 10, 20);
  const line2Opacity = fadeIn(frame, 50, 20);
  const line2Y = slideUp(frame, 50, 20);

  // Countdown: 3 → 2 → 1
  const countdownStart = 130;
  const countdownInterval = 30; // ~1s per number
  const countdownNumber =
    frame < countdownStart ? null :
    frame < countdownStart + countdownInterval ? 3 :
    frame < countdownStart + countdownInterval * 2 ? 2 :
    frame < countdownStart + countdownInterval * 3 ? 1 : null;

  const countdownScale = countdownNumber !== null
    ? spring({
        frame: frame - (countdownStart + (3 - countdownNumber) * countdownInterval),
        fps,
        config: { damping: 8, stiffness: 120 },
      })
    : 0;

  // Pulsing ring behind countdown number
  const ringPulse = countdownNumber !== null
    ? interpolate(
        Math.sin((frame - countdownStart) * 0.15),
        [-1, 1],
        [0.3, 0.8],
      )
    : 0;

  // Flash to white at the very end as transition to video
  const flashOpacity = frame > 225
    ? interpolate(frame, [225, 240], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background glow orbs */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: COLORS.violetGlow,
          filter: 'blur(120px)',
          top: '15%',
          right: '20%',
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: COLORS.limeGlow,
          filter: 'blur(100px)',
          bottom: '20%',
          left: '15%',
          opacity: 0.4,
        }}
      />

      {/* Pre-countdown text */}
      {frame < countdownStart + 10 && (
        <div style={{ textAlign: 'center', padding: '0 80px', zIndex: 1 }}>
          <p
            style={{
              fontFamily: FONTS.primary,
              fontSize: 72,
              fontWeight: 600,
              color: COLORS.textLight,
              margin: '0 0 28px 0',
              opacity: line1Opacity * (frame > countdownStart ? fadeOut(frame, countdownStart, 10) : 1),
              transform: `translateY(${line1Y}px)`,
            }}
          >
            Think that sounds{' '}
            <span style={{ color: COLORS.lime }}>too good</span> to be true?
          </p>
          <p
            style={{
              fontFamily: FONTS.primary,
              fontSize: 56,
              fontWeight: 500,
              color: COLORS.textLightMuted,
              margin: 0,
              opacity: line2Opacity * (frame > countdownStart ? fadeOut(frame, countdownStart, 10) : 1),
              transform: `translateY(${line2Y}px)`,
            }}
          >
            Watch it happen.{' '}
            <span style={{ fontWeight: 700, color: COLORS.textLight }}>In real time.</span>
          </p>
        </div>
      )}

      {/* Countdown numbers */}
      {countdownNumber !== null && (
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          {/* Pulsing ring */}
          <div
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: '50%',
              border: `3px solid rgba(212, 225, 87, ${ringPulse * 0.4})`,
              boxShadow: `0 0 ${40 * ringPulse}px ${COLORS.limeGlow}`,
            }}
          />
          <span
            style={{
              fontFamily: FONTS.primary,
              fontSize: 200,
              fontWeight: 700,
              background: GRADIENTS.dualGlow,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              transform: `scale(${countdownScale})`,
              opacity: countdownScale,
            }}
          >
            {countdownNumber}
          </span>
        </div>
      )}

      {/* White flash transition */}
      <AbsoluteFill
        style={{
          background: '#ffffff',
          opacity: flashOpacity,
          zIndex: 10,
        }}
      />
    </AbsoluteFill>
  );
}

// Scene 10b: Demo Playback — full video with synced countdown timer
function DemoPlaybackScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Compute video time remaining (synced to playback rate) with milliseconds
  const elapsedVideoSeconds = (frame * DEMO_CONFIG.playbackRate) / fps;
  const remainingSeconds = Math.max(0, DEMO_CONFIG.videoDuration - elapsedVideoSeconds);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = Math.floor(remainingSeconds % 60);
  const milliseconds = Math.floor((remainingSeconds % 1) * 100);
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;

  // Fade in from the white flash
  const fadeFromFlash = frame < 15
    ? interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
    : 1;

  // Top bar fade in
  const topBarOpacity = fadeIn(frame, 10, 20);

  // Timer glow intensifies under 30s remaining (video time)
  const timerUrgent = remainingSeconds < 30;
  const timerGlow = timerUrgent
    ? interpolate(Math.sin(frame * 0.15), [-1, 1], [0.4, 0.8])
    : 0.2;

  // Scene fade out at the end
  const sceneOpacity = frame > 2100 ? fadeOut(frame, 2100, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bgDark,
        opacity: sceneOpacity * fadeFromFlash,
      }}
    >
      {/* Full-screen video */}
      <Video
        src={staticFile('vsl-broll.mp4')}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: COLORS.bgDark,
        }}
        volume={0}
        playbackRate={DEMO_CONFIG.playbackRate}
      />

      {/* Subtle vignette at top/bottom for overlay readability */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.6) 0%, transparent 12%, transparent 88%, rgba(15, 23, 42, 0.6) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Bottom bar — LIVE DEMO badge + ConversionIQ™ */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '28px 40px',
          opacity: topBarOpacity,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Live indicator dot */}
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
            }}
          />
          <span
            style={{
              fontFamily: FONTS.primary,
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.textLight,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            Live Demo
          </span>
          <span
            style={{
              fontFamily: FONTS.primary,
              fontSize: 20,
              fontWeight: 400,
              color: COLORS.textLightMuted,
              marginLeft: 8,
            }}
          >
            Launching high-converting creatives in real time
          </span>
        </div>

        {/* ConversionIQ™ badge */}
        <span
          style={{
            fontFamily: FONTS.primary,
            fontSize: 20,
            fontWeight: 600,
            background: GRADIENTS.dualGlow,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: 2,
          }}
        >
          ConversionIQ™
        </span>
      </div>

      {/* Countdown timer — top center, big and bold */}
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: topBarOpacity,
        }}
      >
        <div
          style={{
            padding: '12px 48px',
            borderRadius: 16,
            background: 'rgba(15, 23, 42, 0.85)',
            border: `1px solid rgba(212, 225, 87, ${timerUrgent ? 0.5 : 0.25})`,
            boxShadow: `0 0 ${timerUrgent ? 30 : 15}px rgba(212, 225, 87, ${timerGlow})`,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.primary,
              fontSize: 64,
              fontWeight: 700,
              color: timerUrgent ? COLORS.lime : COLORS.limeSecondary,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 2,
              textShadow: `0 0 ${timerUrgent ? 20 : 8}px ${COLORS.limeGlow}`,
            }}
          >
            {timeDisplay}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Scene 10c: Demo Complete — "BOOM" reveal after timer hits zero
function DemoCompleteScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Format the video duration as M:SS
  const mins = Math.floor(DEMO_CONFIG.videoDuration / 60);
  const secs = Math.floor(DEMO_CONFIG.videoDuration % 60);
  const timeString = `${mins} minutes and ${secs} seconds`;

  // Checkmark scale-in
  const checkScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 8, stiffness: 100 },
  });

  // Text stagger
  const headlineOpacity = fadeIn(frame, 15, 20);
  const headlineY = slideUp(frame, 15, 20);
  const timeOpacity = fadeIn(frame, 40, 20);
  const timeY = slideUp(frame, 40, 20);
  const subOpacity = fadeIn(frame, 70, 20);
  const subY = slideUp(frame, 70, 20);
  const badgeOpacity = fadeIn(frame, 100, 20);

  // Scene fade out
  const sceneOpacity = frame > 170 ? fadeOut(frame, 170, 30) : 1;

  // Background pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.6],
  );

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Lime glow burst behind checkmark */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.limeGlow} 0%, transparent 60%)`,
          opacity: glowIntensity,
          filter: 'blur(60px)',
        }}
      />

      <div style={{ textAlign: 'center', padding: '0 80px', zIndex: 1 }}>
        {/* Animated checkmark */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: COLORS.lime,
            boxShadow: `0 0 40px ${COLORS.limeGlow}`,
            transform: `scale(${checkScale})`,
            opacity: checkScale,
            marginBottom: 40,
          }}
        >
          <svg
            width="60"
            height="60"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.bgDark}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Headline */}
        <h2
          style={{
            fontFamily: FONTS.primary,
            fontSize: 82,
            fontWeight: 700,
            color: COLORS.textLight,
            lineHeight: 1.3,
            margin: '0 0 20px 0',
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
          }}
        >
          Brand-new high-converting creatives.
          <br />
          <span style={{ color: COLORS.lime }}>Published from scratch.</span>
        </h2>

        {/* Time callout */}
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 56,
            fontWeight: 700,
            color: COLORS.lime,
            margin: '0 0 20px 0',
            opacity: timeOpacity,
            transform: `translateY(${timeY}px)`,
            textShadow: `0 0 20px ${COLORS.limeGlow}`,
          }}
        >
          In exactly {timeString}. Ready to go live.
        </p>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 38,
            fontWeight: 400,
            color: COLORS.textLightMuted,
            margin: '0 0 40px 0',
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          No designers. No media buyers. No bottleneck.
        </p>

        {/* ConversionIQ™ badge */}
        <div
          style={{
            display: 'inline-block',
            padding: '18px 52px',
            borderRadius: 100,
            background: 'rgba(255, 255, 255, 0.06)',
            border: `1px solid rgba(212, 225, 87, 0.3)`,
            boxShadow: `0 0 20px ${COLORS.limeGlow}`,
            opacity: badgeOpacity,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.primary,
              fontSize: 30,
              fontWeight: 600,
              color: COLORS.lime,
              letterSpacing: 4,
            }}
          >
            Powered by ConversionIQ™
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Scene 11: Results - Animated metrics
function ResultsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = fadeIn(frame, 5, 20);
  const headerY = slideUp(frame, 5, 20);

  const metrics = [
    { value: 47, suffix: '%', label: 'Reduced CPA', color: COLORS.lime },
    { value: 3.2, suffix: 'x', label: 'ROAS Improvement', color: COLORS.violet },
    { value: 80, suffix: '%', label: 'Less Creative Waste', color: COLORS.lime },
  ];

  const sceneOpacity = frame > 220 ? fadeOut(frame, 220, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bgPrimary,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', width: '100%', padding: '0 60px' }}>
        <h3
          style={{
            fontFamily: FONTS.primary,
            fontSize: 30,
            fontWeight: 600,
            color: COLORS.textMuted,
            letterSpacing: 5,
            textTransform: 'uppercase',
            marginBottom: 16,
            opacity: headerOpacity,
            transform: `translateY(${headerY}px)`,
          }}
        >
          Proven Results
        </h3>
        <h2
          style={{
            fontFamily: FONTS.primary,
            fontSize: 64,
            fontWeight: 700,
            color: COLORS.textPrimary,
            marginBottom: 80,
            opacity: headerOpacity,
            transform: `translateY(${headerY}px)`,
          }}
        >
          Performance That{' '}
          <span
            style={{
              background: GRADIENTS.dualGlow,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Compounds
          </span>
        </h2>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 60,
          }}
        >
          {metrics.map((metric, i) => {
            const delay = 40 + i * 30;
            const cardScale = spring({
              frame: frame - delay,
              fps,
              config: { damping: 12, stiffness: 100 },
            });

            // Animated counter
            const counterProgress = interpolate(
              frame,
              [delay + 10, delay + 60],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
            );
            const displayValue = metric.suffix === 'x'
              ? (metric.value * counterProgress).toFixed(1)
              : Math.round(metric.value * counterProgress);

            return (
              <div
                key={i}
                style={{
                  opacity: cardScale,
                  transform: `scale(${cardScale})`,
                }}
              >
                <div
                  style={{
                    width: 420,
                    padding: '70px 50px',
                    borderRadius: 28,
                    background: COLORS.bgPrimary,
                    border: `1px solid ${COLORS.borderPrimary}`,
                    boxShadow: `0 10px 40px ${metric.color === COLORS.lime ? COLORS.limeGlow : COLORS.violetGlow}`,
                    textAlign: 'center',
                  }}
                >
                  <p
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 96,
                      fontWeight: 700,
                      color: metric.color,
                      margin: '0 0 16px 0',
                      lineHeight: 1,
                    }}
                  >
                    {displayValue}
                    {metric.suffix}
                  </p>
                  <p
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 28,
                      fontWeight: 500,
                      color: COLORS.textSecondary,
                      margin: 0,
                    }}
                  >
                    {metric.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Scene 11: Cost of Waiting — urgency / risk reversal
function CostOfWaitingScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Header animations
  const headerOpacity = fadeIn(frame, 5, 20);
  const headerY = slideUp(frame, 5, 20);
  const subtitleOpacity = fadeIn(frame, 25, 20);
  const subtitleY = slideUp(frame, 25, 20);

  // Warning colors
  const red = '#ef4444';
  const redGlow = 'rgba(239, 68, 68, 0.25)';
  const redSubtle = 'rgba(239, 68, 68, 0.08)';
  const amber = '#f59e0b';

  // Cost items with staggered reveals — generous spacing for readability
  const costs = [
    { amount: 100, prefix: '$', suffix: 'K+', period: '/year', label: 'Blind Creative Testing', desc: '60–70% of ad spend wasted on creatives that never convert', delay: 70 },
    { amount: 90, prefix: '$', suffix: 'K', period: '/year', label: 'Overpriced Media Buyers', desc: '$8–12K/month on gut instinct when data has the answers', delay: 140 },
    { amount: 62, prefix: '$', suffix: 'K', period: '/year', label: 'Creative Fatigue & Decay', desc: 'CPA spikes 30–50% before anyone catches it', delay: 210 },
  ];

  // Total reveal — dramatic entrance after all cards have settled
  const totalDelay = 290;
  const totalScale = spring({ frame: frame - totalDelay, fps, config: { damping: 10, stiffness: 80 } });
  const totalCountProgress = interpolate(
    frame,
    [totalDelay + 10, totalDelay + 50],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
  );
  const totalValue = Math.round(275 * totalCountProgress);

  // Pulsing red glow on total
  const totalPulse = interpolate(Math.sin(frame * 0.12), [-1, 1], [0.4, 1]);

  // Background "bleeding" particles
  const particleSeeds = Array.from({ length: 20 }, (_, i) => ({
    x: ((i * 137.5) % 100),
    y: ((i * 73.1) % 100),
    size: 3 + (i % 4) * 2,
    speed: 0.3 + (i % 3) * 0.2,
    delay: i * 4,
  }));

  const sceneOpacity = frame > 420 ? fadeOut(frame, 420, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Animated background particles — falling "money drain" effect */}
      {particleSeeds.map((p, i) => {
        const yOffset = ((frame * p.speed + p.delay * 10) % 120) - 10;
        const particleOpacity = fadeIn(frame, p.delay, 20) *
          interpolate(yOffset, [0, 50, 110], [0, 0.5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: i % 3 === 0 ? red : amber,
              left: `${p.x}%`,
              top: `${yOffset}%`,
              opacity: particleOpacity * 0.35,
              filter: `blur(${p.size > 5 ? 2 : 1}px)`,
            }}
          />
        );
      })}

      {/* Subtle red vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, ${redSubtle} 100%)`,
          opacity: fadeIn(frame, 30, 40),
        }}
      />

      <div style={{ textAlign: 'center', width: '100%', padding: '0 60px', zIndex: 1 }}>
        {/* Header */}
        <h2
          style={{
            fontFamily: FONTS.primary,
            fontSize: 88,
            fontWeight: 700,
            color: COLORS.textLight,
            margin: '0 0 12px 0',
            opacity: headerOpacity,
            transform: `translateY(${headerY}px)`,
          }}
        >
          The Cost of{' '}
          <span style={{ color: red }}>Waiting</span>
        </h2>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 40,
            fontWeight: 400,
            color: COLORS.textLightMuted,
            margin: '0 0 56px 0',
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
          }}
        >
          Every month without ConversionIQ™, you're{' '}
          <span style={{ color: amber, fontWeight: 600 }}>bleeding budget</span>
        </p>

        {/* Cost cards row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 40,
            marginBottom: 50,
          }}
        >
          {costs.map((cost, i) => {
            const cardScale = spring({
              frame: frame - cost.delay,
              fps,
              config: { damping: 12, stiffness: 100 },
            });

            // Animated counter
            const counterProgress = interpolate(
              frame,
              [cost.delay + 10, cost.delay + 40],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
            );
            const displayAmount = Math.round(cost.amount * counterProgress);

            // Subtle glow pulse per card
            const cardPulse = interpolate(
              Math.sin((frame - cost.delay) * 0.1),
              [-1, 1],
              [0.5, 1],
            );

            return (
              <div
                key={i}
                style={{
                  opacity: cardScale,
                  transform: `scale(${cardScale})`,
                }}
              >
                <div
                  style={{
                    width: 480,
                    padding: '48px 40px',
                    borderRadius: 24,
                    background: 'rgba(239, 68, 68, 0.04)',
                    border: `1px solid rgba(239, 68, 68, ${0.15 + cardPulse * 0.1})`,
                    boxShadow: `0 8px 32px rgba(239, 68, 68, ${0.06 * cardPulse})`,
                    textAlign: 'center',
                  }}
                >
                  {/* Amount with counter animation */}
                  <p
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 80,
                      fontWeight: 700,
                      color: red,
                      margin: '0 0 6px 0',
                      lineHeight: 1,
                    }}
                  >
                    {cost.prefix}{displayAmount}{cost.suffix}
                    <span
                      style={{
                        fontSize: 34,
                        fontWeight: 500,
                        color: COLORS.textLightMuted,
                      }}
                    >
                      {cost.period}
                    </span>
                  </p>

                  {/* Label */}
                  <p
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 34,
                      fontWeight: 600,
                      color: COLORS.textLight,
                      margin: '18px 0 12px 0',
                    }}
                  >
                    {cost.label}
                  </p>

                  {/* Description */}
                  <p
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 28,
                      fontWeight: 400,
                      color: COLORS.textLightMuted,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {cost.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total — dramatic reveal */}
        <div
          style={{
            opacity: totalScale,
            transform: `scale(${totalScale})`,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '36px 88px',
              borderRadius: 24,
              background: `linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%)`,
              border: `2px solid rgba(239, 68, 68, ${0.3 + totalPulse * 0.2})`,
              boxShadow: `0 0 ${40 * totalPulse}px ${redGlow}, 0 12px 40px rgba(0, 0, 0, 0.3)`,
            }}
          >
            <p
              style={{
                fontFamily: FONTS.primary,
                fontSize: 30,
                fontWeight: 500,
                color: COLORS.textLightMuted,
                margin: '0 0 10px 0',
                letterSpacing: 4,
                textTransform: 'uppercase',
              }}
            >
              Hidden cost of the status quo
            </p>
            <p
              style={{
                fontFamily: FONTS.primary,
                fontSize: 104,
                fontWeight: 700,
                color: red,
                margin: '0 0 10px 0',
                lineHeight: 1,
                textShadow: `0 0 30px ${redGlow}`,
              }}
            >
              ${totalValue}K+
              <span
                style={{
                  fontSize: 44,
                  fontWeight: 500,
                  color: COLORS.textLightMuted,
                }}
              >
                {' '}per year
              </span>
            </p>
            <p
              style={{
                fontFamily: FONTS.primary,
                fontSize: 30,
                fontWeight: 400,
                color: amber,
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              Before counting the revenue left on the table
            </p>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Scene 12: Enterprise Positioning
function EnterpriseScene() {
  const frame = useCurrentFrame();

  const line1Opacity = fadeIn(frame, 10, 25);
  const line1Y = slideUp(frame, 10, 25);
  const line2Opacity = fadeIn(frame, 50, 25);
  const line2Y = slideUp(frame, 50, 25);

  const pillars = [
    { label: 'Bespoke Implementation', delay: 70 },
    { label: 'White Glove Management', delay: 90 },
    { label: 'Dedicated Partnership', delay: 110 },
  ];

  const sceneOpacity = frame > 180 ? fadeOut(frame, 180, 30) : 1;

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        opacity: sceneOpacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ textAlign: 'center', padding: '0 80px' }}>
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 56,
            fontWeight: 500,
            color: COLORS.textLightMuted,
            margin: '0 0 24px 0',
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
          }}
        >
          This isn't software you figure out.
        </p>
        <h2
          style={{
            fontFamily: FONTS.primary,
            fontSize: 96,
            fontWeight: 700,
            color: COLORS.textLight,
            margin: '0 0 80px 0',
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          It's an{' '}
          <span
            style={{
              background: GRADIENTS.dualGlow,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            automated partnership
          </span>
          .
        </h2>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 48,
          }}
        >
          {pillars.map((pillar, i) => {
            const pillarOpacity = fadeIn(frame, pillar.delay, 20);
            const pillarY = slideUp(frame, pillar.delay, 20);

            return (
              <div
                key={i}
                style={{
                  opacity: pillarOpacity,
                  transform: `translateY(${pillarY}px)`,
                }}
              >
                <div
                  style={{
                    padding: '44px 64px',
                    borderRadius: 20,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <p
                    style={{
                      fontFamily: FONTS.primary,
                      fontSize: 40,
                      fontWeight: 600,
                      color: COLORS.textLight,
                      margin: 0,
                    }}
                  >
                    {pillar.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// Scene 12: Final CTA
function CTAScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 10, fps, config: { damping: 12, stiffness: 80 } });
  const ctaOpacity = fadeIn(frame, 50, 25);
  const ctaY = slideUp(frame, 50, 25);
  const taglineOpacity = fadeIn(frame, 90, 25);
  const subOpacity = fadeIn(frame, 120, 25);
  const subY = slideUp(frame, 120, 25);

  // Pulsing CTA button glow
  const pulseIntensity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.4, 1],
  );

  return (
    <AbsoluteFill
      style={{
        background: GRADIENTS.darkRadial,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.violetGlow} 0%, transparent 70%)`,
          filter: 'blur(100px)',
          opacity: 0.5,
        }}
      />

      <div style={{ textAlign: 'center', zIndex: 1, padding: '0 80px' }}>
        {/* Logo */}
        <div
          style={{
            opacity: logoScale,
            transform: `scale(${logoScale})`,
            marginBottom: 24,
          }}
        >
          <Img
            src={staticFile('convertra-logo.png')}
            style={{
              height: 110,
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
            }}
          />
        </div>

        {/* Positioning line */}
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: 'uppercase',
            background: GRADIENTS.dualGlow,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: '0 0 60px 0',
            opacity: logoScale,
          }}
        >
          Autonomous Creative Velocity at Scale
        </p>

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            marginBottom: 56,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '40px 110px',
              background: COLORS.lime,
              borderRadius: 20,
              boxShadow: `0 0 ${50 * pulseIntensity}px ${COLORS.limeGlow}`,
            }}
          >
            <p
              style={{
                fontFamily: FONTS.primary,
                fontSize: 56,
                fontWeight: 700,
                color: COLORS.textPrimary,
                margin: 0,
              }}
            >
              Book Your Live Demo
            </p>
          </div>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 40,
            fontWeight: 500,
            color: COLORS.textLightMuted,
            margin: '0 0 24px 0',
            opacity: taglineOpacity,
          }}
        >
          Limited availability. Bespoke implementation only.
        </p>

        <p
          style={{
            fontFamily: FONTS.primary,
            fontSize: 36,
            fontWeight: 400,
            color: COLORS.textMuted,
            margin: 0,
            fontStyle: 'italic',
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          Scale creative testing on autopilot. That's ConversionIQ™.
        </p>
      </div>
    </AbsoluteFill>
  );
}

// ─── Main Composition ─────────────────────────────────────────────

export const ConvertraVSL: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bgDark }}>
      {/* Background Music — first pass */}
      <Sequence from={0} durationInFrames={MUSIC_DURATION_FRAMES}>
        <Audio
          src={staticFile('vsl-background-music.mp3')}
          volume={(f) => musicVolume(f)}
        />
      </Sequence>

      {/* Background Music — second pass (seamless loop) */}
      <Sequence from={MUSIC_DURATION_FRAMES} durationInFrames={VIDEO_CONFIG.durationInFrames - MUSIC_DURATION_FRAMES}>
        <Audio
          src={staticFile('vsl-background-music.mp3')}
          volume={(f) => musicVolume(f + MUSIC_DURATION_FRAMES)}
        />
      </Sequence>

      {/* Scene 1: Hook */}
      <Sequence from={SCENES.hook.from} durationInFrames={SCENES.hook.duration}>
        <HookScene />
      </Sequence>

      {/* Scene 2: Pain Question */}
      <Sequence from={SCENES.painQuestion.from} durationInFrames={SCENES.painQuestion.duration}>
        <PainQuestionScene />
      </Sequence>

      {/* Scene 3: The Loop */}
      <Sequence from={SCENES.theLoop.from} durationInFrames={SCENES.theLoop.duration}>
        <TheLoopScene />
      </Sequence>

      {/* Scene 4: Revelation */}
      <Sequence from={SCENES.revelation.from} durationInFrames={SCENES.revelation.duration}>
        <RevelationScene />
      </Sequence>

      {/* Scene 5: ConversionIQ™ Reveal */}
      <Sequence from={SCENES.ciqReveal.from} durationInFrames={SCENES.ciqReveal.duration}>
        <CIQRevealScene />
      </Sequence>

      {/* Scene 6: Extract */}
      <Sequence from={SCENES.extract.from} durationInFrames={SCENES.extract.duration}>
        <MechanismStep
          stepNumber="1"
          title="Extract"
          description="ConversionIQ™ continuously ingests every data point across your ad channels — Meta, Google, TikTok, programmatic — building a real-time intelligence layer that powers autonomous creative decisions at scale."
          accentColor={COLORS.lime}
          icon={MechanismIcons.extract(COLORS.lime)}
        />
      </Sequence>

      {/* Scene 7: Interpret */}
      <Sequence from={SCENES.interpret.from} durationInFrames={SCENES.interpret.duration}>
        <MechanismStep
          stepNumber="2"
          title="Interpret"
          description="This is what makes ConversionIQ™ different. It doesn't just show you what happened — it reveals WHY. Deep-level analysis of conversion triggers, emotional patterns, and the visual elements actually driving results."
          accentColor={COLORS.violet}
          icon={MechanismIcons.interpret(COLORS.violet)}
        />
      </Sequence>

      {/* Scene 8: Generate */}
      <Sequence from={SCENES.generate.from} durationInFrames={SCENES.generate.duration}>
        <MechanismStep
          stepNumber="3"
          title="Generate"
          description="ConversionIQ™ autonomously engineers new ad creatives — copy, visuals, and targeting — from proven conversion patterns. Not templates. Not best guesses. Real intelligence, at scale."
          accentColor={COLORS.lime}
          icon={MechanismIcons.generate(COLORS.lime)}
        />
      </Sequence>

      {/* Scene 9: Repeat */}
      <Sequence from={SCENES.repeat.from} durationInFrames={SCENES.repeat.duration}>
        <MechanismStep
          stepNumber="4"
          title="Repeat"
          description="Every creative tested makes the next one smarter. ConversionIQ™ compounds its advantage with each conversion — accelerating your creative velocity while your competitors stay stuck in the bottleneck."
          accentColor={COLORS.violet}
          icon={MechanismIcons.repeat(COLORS.violet)}
        />
      </Sequence>

      {/* Scene 10a: Demo Intro — "Don't believe us?" + countdown */}
      <Sequence from={SCENES.demoIntro.from} durationInFrames={SCENES.demoIntro.duration}>
        <DemoIntroScene />
      </Sequence>

      {/* Scene 10b: Demo Playback — full video with countdown timer */}
      <Sequence from={SCENES.demoPlayback.from} durationInFrames={SCENES.demoPlayback.duration}>
        <DemoPlaybackScene />
      </Sequence>

      {/* Scene 10c: Demo Complete — "Published from scratch" reveal */}
      <Sequence from={SCENES.demoComplete.from} durationInFrames={SCENES.demoComplete.duration}>
        <DemoCompleteScene />
      </Sequence>

      {/* Scene 11: Results */}
      <Sequence from={SCENES.results.from} durationInFrames={SCENES.results.duration}>
        <ResultsScene />
      </Sequence>

      {/* Scene 11: Cost of Waiting */}
      <Sequence from={SCENES.costOfWaiting.from} durationInFrames={SCENES.costOfWaiting.duration}>
        <CostOfWaitingScene />
      </Sequence>

      {/* Scene 12: Enterprise Positioning */}
      <Sequence from={SCENES.enterprise.from} durationInFrames={SCENES.enterprise.duration}>
        <EnterpriseScene />
      </Sequence>

      {/* Scene 13: CTA */}
      <Sequence from={SCENES.cta.from} durationInFrames={SCENES.cta.duration}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};
