import React from 'react';
import {
  AbsoluteFill,
  Composition,
  interpolate,
  registerRoot,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export interface MotionCardProps {
  templateId: string;
  kind: 'intro' | 'outro';
  text: string;
  width: number;
  height: number;
  durationInFrames: number;
  backgroundColor?: string;
  textColor?: string;
}

const PALETTES: Record<
  string,
  {
    bg: string;
    fg: string;
    accent: string;
    accent2: string;
    glow: string;
    label: string;
  }
> = {
  highlights: {
    bg: '#070612',
    fg: '#ffffff',
    accent: '#ff2fd6',
    accent2: '#18d7ff',
    glow: 'rgba(255,47,214,0.45)',
    label: 'HIGHLIGHT',
  },
  suspense: {
    bg: '#080607',
    fg: '#ffffff',
    accent: '#ff3b3b',
    accent2: '#f6c14b',
    glow: 'rgba(255,59,59,0.38)',
    label: 'NEXT',
  },
  cinematic: {
    bg: '#050505',
    fg: '#f7f0df',
    accent: '#d6a84f',
    accent2: '#5aa7ff',
    glow: 'rgba(214,168,79,0.32)',
    label: 'CINEMATIC',
  },
  vlog: {
    bg: '#071014',
    fg: '#ffffff',
    accent: '#ffb84d',
    accent2: '#5df2c2',
    glow: 'rgba(255,184,77,0.3)',
    label: 'VLOG',
  },
};

function clampText(text: string): string {
  return text.replace(/\s+/g, ' ').trim() || 'SmartVideoMixer';
}

function MotionCard(rawProps: Record<string, unknown>) {
  const props = rawProps as unknown as MotionCardProps;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const palette = PALETTES[props.templateId] || PALETTES.highlights;
  const isPortrait = props.height > props.width;
  const title = clampText(props.text);
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 95 } });
  const exit = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleY = interpolate(enter, [0, 1], [70, 0]);
  const titleScale = interpolate(enter, [0, 1], [0.9, 1]);
  const sweep = interpolate(frame, [0, durationInFrames], [-props.width * 0.4, props.width * 1.2]);

  const fontSize = Math.round((isPortrait ? props.width : props.height) * 0.09);
  const safeWidth = Math.round(props.width * 0.84);
  const titleMaxWidth = isPortrait ? safeWidth : Math.round(props.width * 0.72);
  const bg = props.backgroundColor || palette.bg;
  const fg = props.textColor || palette.fg;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        color: fg,
        fontFamily:
          '"Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif',
        overflow: 'hidden',
        opacity: exit,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 25% 25%, ${palette.glow}, transparent 36%),
            radial-gradient(circle at 78% 72%, ${palette.accent2}33, transparent 30%),
            linear-gradient(135deg, ${bg}, #030306 70%)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: isPortrait ? '7% 6%' : '8% 7%',
          border: `1px solid ${palette.accent}66`,
          boxShadow: `0 0 60px ${palette.glow}`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: isPortrait ? '10%' : '11%',
          left: isPortrait ? '9%' : '8%',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontSize: Math.round(fontSize * 0.22),
          letterSpacing: 4,
          color: `${fg}cc`,
          opacity: interpolate(enter, [0, 1], [0, 1]),
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 70,
            height: 3,
            background: palette.accent,
            boxShadow: `0 0 24px ${palette.accent}`,
          }}
        />
        {props.kind === 'intro' ? palette.label : 'END CARD'}
      </div>

      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: props.width * 0.46,
            height: isPortrait ? 18 : 12,
            left: sweep - i * props.width * 0.26,
            top: `${24 + i * 18}%`,
            background: i % 2 === 0 ? palette.accent : palette.accent2,
            opacity: 0.16,
            transform: 'skewX(-18deg)',
            filter: 'blur(0.2px)',
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: isPortrait ? '9%' : '10%',
          right: isPortrait ? '9%' : '10%',
          top: isPortrait ? '38%' : '35%',
          transform: `translateY(${titleY}px) scale(${titleScale})`,
          opacity: interpolate(enter, [0, 0.7, 1], [0, 0.85, 1]),
        }}
      >
        <div
          style={{
            maxWidth: titleMaxWidth,
            fontSize,
            lineHeight: 1.05,
            fontWeight: 900,
            textShadow: `0 14px 44px ${palette.glow}, 0 2px 0 #000`,
            wordBreak: 'break-word',
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: Math.round(fontSize * 0.28),
            height: 5,
            width: interpolate(progress, [0, 0.9], [0, titleMaxWidth * 0.55], {
              extrapolateRight: 'clamp',
            }),
            background: `linear-gradient(90deg, ${palette.accent}, ${palette.accent2})`,
            boxShadow: `0 0 26px ${palette.glow}`,
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: isPortrait ? '9%' : '8%',
          right: isPortrait ? '9%' : '8%',
          bottom: isPortrait ? '9%' : '10%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: Math.round(fontSize * 0.18),
          color: `${fg}99`,
        }}
      >
        <span>SMART VIDEO MIXER</span>
        <span>{String(Math.round(progress * 100)).padStart(2, '0')}</span>
      </div>
    </AbsoluteFill>
  );
}

function RemotionRoot() {
  const defaultProps: MotionCardProps = {
    templateId: 'highlights',
    kind: 'intro',
    text: '精彩集锦',
    width: 1080,
    height: 1920,
    durationInFrames: 45,
  };

  return (
    <Composition
      id="MotionCard"
      component={MotionCard}
      durationInFrames={45}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const cardProps = props as unknown as MotionCardProps;
        return {
          durationInFrames: cardProps.durationInFrames,
          fps: 30,
          width: cardProps.width,
          height: cardProps.height,
        };
      }}
    />
  );
}

registerRoot(RemotionRoot);
