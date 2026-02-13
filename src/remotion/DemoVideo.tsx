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
  staticFile,
} from 'remotion';
import { COLORS, GRADIENTS, FONTS, DEMO_CONFIG, DEMO_SCENES, DEMO_VIDEO_CONFIG } from './brand';

// Volume envelope for demo video — dips during video playback
function musicVolume(globalFrame: number): number {
  return interpolate(
    globalFrame,
    [0, 30, 200, 240, 2370, 2420, 2480, 2570],
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

// ─── Scene Components ─────────────────────────────────────────────

// Scene 1: Demo Intro — "Think that sounds too good?" + 3-2-1 countdown
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

// Scene 2: Demo Playback — full video with synced countdown timer
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

// Scene 3: Demo Complete — victory reveal after timer hits zero
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

// ─── Main Composition ─────────────────────────────────────────────

export const DemoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bgDark }}>
      {/* Background Music */}
      <Sequence from={0} durationInFrames={DEMO_VIDEO_CONFIG.durationInFrames}>
        <Audio
          src={staticFile('vsl-background-music.mp3')}
          volume={(f) => musicVolume(f)}
        />
      </Sequence>

      {/* Scene 1: Demo Intro — "Think that sounds too good?" + 3-2-1 countdown */}
      <Sequence from={DEMO_SCENES.intro.from} durationInFrames={DEMO_SCENES.intro.duration}>
        <DemoIntroScene />
      </Sequence>

      {/* Scene 2: Demo Playback — full video with countdown timer */}
      <Sequence from={DEMO_SCENES.playback.from} durationInFrames={DEMO_SCENES.playback.duration}>
        <DemoPlaybackScene />
      </Sequence>

      {/* Scene 3: Demo Complete — "Published from scratch" reveal */}
      <Sequence from={DEMO_SCENES.complete.from} durationInFrames={DEMO_SCENES.complete.duration}>
        <DemoCompleteScene />
      </Sequence>
    </AbsoluteFill>
  );
};
