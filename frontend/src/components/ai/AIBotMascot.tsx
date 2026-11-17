// src/components/ai/AIBotMascot.tsx
import { useId } from 'react';
import { motion } from 'framer-motion';
import type { AssistantVisualState } from '../../services/aiAssistant.service';

export interface AIBotMascotProps {
  /** Visual state driving animations */
  state?: AssistantVisualState;
  /** Real-time normalized audio amplitude (0..1) from mic or WebAudio TTS AnalyserNode */
  audioLevel?: number;
  /** Pixel width & height of the square mascot canvas */
  size?: number;
  /** Additional wrapper classes */
  className?: string;
}

/**
 * Custom 100% Transparent Vector SVG + Framer Motion Mascot (`AIBotMascot.tsx`).
 *
 * Faithfully recreates the AutoFinex cyan-to-violet glowing speech-bubble robot
 * badge (orbital arc + dots, 4-point gradient sparkle star, glossy speech-bubble
 * body + tail, deep navy visor, glowing `^ ^` curved happy eyes) with zero white
 * background and 60fps state + live WebAudio amplitude reactivity.
 */
export function AIBotMascot({
  state = 'idle',
  audioLevel = 0,
  size = 56,
  className = '',
}: AIBotMascotProps) {
  const rawId = useId().replace(/:/g, '');
  const ids = {
    bodyGrad: `af-body-${rawId}`,
    ribbonGrad: `af-ribbon-${rawId}`,
    visorGrad: `af-visor-${rawId}`,
    orbitTopGrad: `af-orb-top-${rawId}`,
    orbitBotGrad: `af-orb-bot-${rawId}`,
    starGrad: `af-star-${rawId}`,
    eyeGlow: `af-eyeglow-${rawId}`,
    softDrop: `af-drop-${rawId}`,
  };

  const clampedLevel = Math.min(1, Math.max(0, audioLevel));
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';

  // Live reactive scale when speaking or listening
  const liveScale = isSpeaking
    ? 1 + clampedLevel * 0.085
    : isListening
      ? 1 + clampedLevel * 0.055
      : 1;

  // 5-bar mini voice equalizer heights inside lower visor during `speaking` / `listening`
  const eqMultipliers = [0.55, 0.9, 1.0, 0.85, 0.5];

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Reactive outer aura halo for Speaking / Listening / Thinking */}
      {(isSpeaking || isListening || isThinking) && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: isListening
              ? 'radial-gradient(circle, rgba(6,182,212,0.38) 0%, rgba(59,130,246,0.14) 55%, rgba(0,0,0,0) 75%)'
              : 'radial-gradient(circle, rgba(56,189,248,0.42) 0%, rgba(139,92,246,0.22) 55%, rgba(0,0,0,0) 76%)',
          }}
          animate={
            isThinking
              ? { scale: [0.92, 1.14, 0.92], opacity: [0.45, 0.85, 0.45] }
              : {
                  scale: 0.96 + clampedLevel * 0.34,
                  opacity: 0.45 + clampedLevel * 0.55,
                }
          }
          transition={
            isThinking
              ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.08, ease: 'linear' }
          }
        />
      )}

      <motion.svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
        animate={
          isSpeaking || isListening
            ? {
                scale: liveScale,
                y: isSpeaking ? -clampedLevel * 2.5 : 0,
                rotate: isListening ? [-1.2, 1.2, -1.2] : 0,
              }
            : isThinking
              ? { y: [0, -3.5, 0], scale: [1, 1.03, 1] }
              : { y: [0, -3.2, 0] }
        }
        transition={
          isSpeaking || isListening
            ? {
                scale: { duration: 0.075, ease: 'easeOut' },
                y: { duration: 0.075, ease: 'easeOut' },
                rotate: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
              }
            : {
                duration: isThinking ? 1.3 : 3.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }
        }
      >
        <defs>
          {/* Main Speech-Bubble Head Gradient: Electric Cyan -> Royal Blue -> Radiant Violet */}
          <linearGradient id={ids.bodyGrad} x1="48" y1="58" x2="154" y2="162" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00F0FF" />
            <stop offset="36%" stopColor="#1A9BFF" />
            <stop offset="70%" stopColor="#5B54FA" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>

          {/* Glossy Cyan-Blue Fold Highlight across lower speech tail */}
          <linearGradient id={ids.ribbonGrad} x1="65" y1="168" x2="132" y2="112" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.95" />
            <stop offset="52%" stopColor="#00E5FF" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.15" />
          </linearGradient>

          {/* Deep Space Navy Visor Gradient */}
          <linearGradient id={ids.visorGrad} x1="72" y1="74" x2="136" y2="134" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#040B24" />
            <stop offset="55%" stopColor="#0A1538" />
            <stop offset="100%" stopColor="#161445" />
          </linearGradient>

          {/* Top Orbital Arc Gradient */}
          <linearGradient id={ids.orbitTopGrad} x1="44" y1="84" x2="115" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#1D7FF6" />
          </linearGradient>

          {/* Bottom Orbital Arc Gradient */}
          <linearGradient id={ids.orbitBotGrad} x1="42" y1="104" x2="76" y2="162" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1A82F8" />
            <stop offset="100%" stopColor="#9353F8" />
          </linearGradient>

          {/* 4-Point Sparkle Star Gradient (Violet -> Cyan-Blue) */}
          <linearGradient id={ids.starGrad} x1="124" y1="34" x2="164" y2="76" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9B6BFF" />
            <stop offset="50%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#00B8FF" />
          </linearGradient>

          {/* Luminous Ice-Cyan Eye Glow */}
          <filter id={ids.eyeGlow} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Subtle Transparent Drop Shadow (zero opaque box) */}
          <filter id={ids.softDrop} x="-20%" y="-20%" width="140%" height="145%">
            <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#1E3A8A" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* Orbital Ring Group (animates smoothly in Thinking / Speaking / Idle) */}
        <motion.g
          style={{ originX: '103px', originY: '108px' }}
          animate={
            isThinking
              ? { rotate: [0, 14, -8, 0], scale: [1, 1.03, 1] }
              : isListening
                ? { rotate: [-3, 3, -3] }
                : { rotate: [0, 2.5, 0] }
          }
          transition={{
            duration: isThinking ? 1.6 : 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* Upper-left sweeping arc */}
          <path
            d="M 48 81 A 66 66 0 0 1 112 38"
            stroke={`url(#${ids.orbitTopGrad})`}
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          {/* Left middle dot */}
          <circle cx="44" cy="95" r="5.5" fill="#1884F7" />
          {/* Lower-left sweeping arc */}
          <path
            d="M 43 109 A 66 66 0 0 0 68 159"
            stroke={`url(#${ids.orbitBotGrad})`}
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          {/* Top-right orbital dot */}
          <circle cx="126" cy="44" r="6" fill="#2183F6" />
        </motion.g>

        {/* Top-Right 4-Point Sparkle Star */}
        <motion.path
          d="M 146 33 C 148 47 152 51 166 53 C 152 55 148 59 146 73 C 144 59 140 55 126 53 C 140 51 144 47 146 33 Z"
          fill={`url(#${ids.starGrad})`}
          style={{ originX: '146px', originY: '53px' }}
          animate={
            isThinking
              ? { rotate: [0, 90, 180], scale: [0.92, 1.18, 0.92] }
              : isSpeaking
                ? { scale: 1 + clampedLevel * 0.22, rotate: [0, 8, -8, 0] }
                : { scale: [0.95, 1.08, 0.95], opacity: [0.9, 1, 0.9] }
          }
          transition={
            isThinking
              ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
          }
        />

        {/* Speech-Bubble Robot Head + Tail */}
        <g filter={`url(#${ids.softDrop})`}>
          {/* Outer glowing gradient shell with bottom-left speech tail */}
          <path
            d="M 103 58 C 134 58 154 78 154 108 C 154 137 133 156 102 156 C 97 156 93 156 89 155 L 69 172 C 66.5 174 63 171.6 64 168.4 L 71 148 C 58 139 51 125 51 108 C 51 78 72 58 103 58 Z"
            fill={`url(#${ids.bodyGrad})`}
          />

          {/* Glossy translucent cyan fold sweeping up from speech tail */}
          <path
            d="M 64.5 169.5 L 72 146 C 81 135 94 128 116 128 L 89 155 L 67.5 172 C 65.5 173.2 63.8 171.4 64.5 169.5 Z"
            fill={`url(#${ids.ribbonGrad})`}
          />

          {/* Subtle top-left rim sheen */}
          <path
            d="M 57 98 C 59 74 79 61 104 61 C 118 61 130 65 139 73 C 128 67 115 65 101 66 C 77 67 61 81 57 98 Z"
            fill="#FFFFFF"
            fillOpacity="0.28"
          />

          {/* Dark Navy Rounded Visor */}
          <rect
            x="64"
            y="74"
            width="79"
            height="60"
            rx="27"
            fill={`url(#${ids.visorGrad})`}
            stroke="#38BDF8"
            strokeOpacity="0.24"
            strokeWidth="1.5"
          />

          {/* Happy Curved Glowing `^ ^` Eyes */}
          <motion.g
            filter={`url(#${ids.eyeGlow})`}
            style={{ originX: '103.5px', originY: '101px' }}
            animate={
              isSpeaking
                ? { scaleY: 1 + clampedLevel * 0.18 }
                : isListening
                  ? { scaleY: 1.08 }
                  : { scaleY: [1, 1, 0.12, 1, 1] }
            }
            transition={
              isSpeaking || isListening
                ? { duration: 0.08 }
                : {
                    duration: 4.4,
                    times: [0, 0.46, 0.49, 0.52, 1],
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
          >
            {/* Left `^` eye */}
            <path
              d="M 78 105 Q 87.5 90 97 105"
              stroke="#DCFFFF"
              strokeWidth="6.2"
              strokeLinecap="round"
              fill="none"
            />
            {/* Right `^` eye */}
            <path
              d="M 110 105 Q 119.5 90 129 105"
              stroke="#DCFFFF"
              strokeWidth="6.2"
              strokeLinecap="round"
              fill="none"
            />
          </motion.g>

          {/* Lower Visor Voice Equalizer Bars (Speaking / Listening) */}
          {(isSpeaking || isListening) && (
            <g transform="translate(89.5, 120)">
              {eqMultipliers.map((mult, i) => {
                const activeH = Math.max(
                  3,
                  Math.min(13, 3 + clampedLevel * 12 * mult)
                );
                return (
                  <rect
                    key={i}
                    x={i * 6.2}
                    y={-activeH / 2}
                    width="3.4"
                    height={activeH}
                    rx="1.7"
                    fill={i % 2 === 0 ? '#38BDF8' : '#A78BFA'}
                    opacity={0.85}
                  />
                );
              })}
            </g>
          )}

          {/* Lower Visor Thinking Dots */}
          {isThinking && (
            <g transform="translate(93, 120)">
              {[0, 1, 2].map((idx) => (
                <motion.circle
                  key={idx}
                  cx={idx * 10.5}
                  cy={0}
                  r="2.6"
                  fill="#67E8F9"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -2.5, 0] }}
                  transition={{
                    duration: 0.75,
                    delay: idx * 0.16,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </g>
          )}
        </g>
      </motion.svg>
    </div>
  );
}

