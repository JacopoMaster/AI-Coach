'use client'

// Giga Drill Break — full-screen cutscene played when a new tonnage PR is
// detected during a workout save (or fired manually from a dev button).
//
// Two driving modes:
//   1. Bus mode  — no props. Listens to spiral-events.ts; mounted once in
//                  the app layout.
//   2. Manual    — `payload` + `onComplete` props. Used by the Dev Tools
//                  panel in Settings to preview/test the animation.
//
// 5-phase orchestration (~4.5s):
//   • PHASE 1  (0.0 – 0.6s)  freeze: backdrop, white flash, grid, radial halo
//   • PHASE 2  (0.4 – 1.5s)  drill SLAMS into frame from off-axis
//   • PHASE 3  (0.85 – 1.4s) screen shake on impact, title pops
//   • PHASE 4  (1.65 – 3.5s) drill barber-pole grooves keep "drilling", stats reveal
//   • PHASE 5  (3.5 – 4.5s)  drill drifts, overlay fades via AnimatePresence
//
// Mobile-perf notes (post-feedback):
//   • No 2D rotate on the drill SVG anymore. The "spinning" effect is faked
//     by translating the groove pattern along the cone's longitudinal axis
//     inside a clip-path — pure SVG, no whole-element transform.
//   • Title shadow uses a single chained `filter: drop-shadow(...)` instead
//     of stacked `text-shadow` + `-webkit-text-stroke`, which on Android
//     Chrome was rendering as visible bounding-box artifacts.
//   • `will-change: transform, opacity` on heavy motion containers so the
//     compositor promotes them to GPU layers.
//   • Backdrop blur softened from `md` to `sm`.

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import {
  type GigaDrillPayload,
  subscribeSpiralEvents,
} from '@/lib/gamification/spiral-events'

const DEFAULT_DURATION_MS = 4500

interface GigaDrillCutsceneProps {
  /** When provided, runs the cutscene with this data and ignores the bus.
   *  Used by the Dev Tools panel for previews. */
  payload?: GigaDrillPayload
  /** Fires once the cutscene's auto-dismiss timer elapses. */
  onComplete?: () => void
  /** Override the auto-dismiss in milliseconds (default 4500). */
  durationMs?: number
}

export function GigaDrillCutscene({
  payload: externalPayload,
  onComplete,
  durationMs = DEFAULT_DURATION_MS,
}: GigaDrillCutsceneProps = {}) {
  const [internalPayload, setInternalPayload] = useState<GigaDrillPayload | null>(
    null
  )
  const activePayload = externalPayload ?? internalPayload

  useEffect(() => {
    if (externalPayload !== undefined) return
    return subscribeSpiralEvents((event) => {
      if (event.type !== 'giga_drill') return
      setInternalPayload(event.data)
    })
  }, [externalPayload])

  useEffect(() => {
    if (!activePayload) return
    const t = setTimeout(() => {
      setInternalPayload(null)
      onComplete?.()
    }, durationMs)
    return () => clearTimeout(t)
  }, [activePayload, durationMs, onComplete])

  return (
    <AnimatePresence>
      {activePayload && <Overlay payload={activePayload} />}
    </AnimatePresence>
  )
}

const willChangeTransform = { willChange: 'transform, opacity' as const }

function Overlay({ payload }: { payload: GigaDrillPayload }) {
  const improvementPct = Math.round(payload.improvement_pct * 1000) / 10

  return (
    <motion.div
      key="giga-drill-cutscene"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={willChangeTransform}
      aria-live="assertive"
      role="alert"
    >
      {/* ── PHASE 1 — backdrop + freeze flash ──────────────────────────── */}
      {/* `backdrop-blur-sm` (4px) instead of `md` (12px) — much cheaper on
       *  mobile GPUs and 95%-opaque black already does most of the work. */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" />

      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(250,204,21,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(250,204,21,0.10) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.55] }}
        transition={{ duration: 0.7, times: [0, 0.3, 1] }}
      />
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0] }}
        transition={{ duration: 0.5, times: [0, 0.2, 1], ease: 'easeOut' }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, rgba(250,204,21,0.45) 0%, rgba(34,197,94,0.18) 25%, rgba(239,68,68,0.18) 45%, transparent 65%)',
          ...willChangeTransform,
        }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 0.85], scale: [0.4, 1, 1] }}
        transition={{ duration: 1.4, delay: 0.3, ease: 'easeOut' }}
      />

      {/* ── SCREEN SHAKE wrapper — drops the rotate axis (was adding visual
       *  noise on small screens) and keeps only translational impact. */}
      <motion.div
        className="relative z-10 flex h-full w-full items-center justify-center"
        style={willChangeTransform}
        animate={{
          x: [0, -10, 9, -8, 7, -5, 4, -2, 1, 0, 0, 0],
          y: [0, 5, -5, 4, -4, 3, -2, 2, -1, 0, 0, 0],
        }}
        transition={{
          duration: 0.55,
          delay: 0.85,
          times: [0, 0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88, 0.94, 1],
          ease: 'easeOut',
        }}
      >
        {/* ── PHASE 2 — drill slam-in. NO 2D rotation on the SVG itself
         *  (was making it look like a steering wheel). Tilt only. The
         *  illusion of rotation lives inside DrillSVG via translated
         *  grooves under a clip-path. */}
        <motion.div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={willChangeTransform}
          initial={{ opacity: 0, scale: 0.15, x: 320, y: -260, rotate: 135 }}
          animate={{
            opacity: [0, 1, 1, 1, 0.9],
            scale: [0.15, 1.7, 1.35, 1.35, 1.4],
            x: [320, 0, 0, 0, 60],
            y: [-260, 0, 0, 0, -20],
            // Land at -25° and STAY there — no continuous spin.
            rotate: [135, -25, -25, -25, -25],
          }}
          transition={{
            duration: 4.0,
            delay: 0.4,
            times: [0, 0.25, 0.4, 0.85, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <DrillSVG />
        </motion.div>

        {/* ── PHASE 3 — title slam ──────────────────────────────────────── */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
          <motion.h1
            className="text-5xl font-black uppercase leading-none tracking-[0.15em] text-white sm:text-7xl md:text-8xl"
            // Single chained `drop-shadow` filter — Android Chrome handles
            // these cleanly. The previous `text-shadow` × 4 + `WebkitText-
            // Stroke` combo was painting visible bounding boxes on some
            // devices because the layered shadows over-saturated the alpha
            // channel and the stroke clipped per-glyph.
            style={{
              filter:
                'drop-shadow(0 0 18px rgba(250,204,21,0.95)) drop-shadow(0 0 36px rgba(34,197,94,0.6))',
              ...willChangeTransform,
            }}
            initial={{ scale: 0.2, letterSpacing: '0em', opacity: 0, y: -20 }}
            animate={{
              scale: [0.2, 1.25, 0.95, 1],
              letterSpacing: ['0em', '0.25em', '0.13em', '0.15em'],
              opacity: [0, 1, 1, 1],
              y: [-20, 0, 0, 0],
            }}
            transition={{
              duration: 1.0,
              delay: 0.6,
              times: [0, 0.55, 0.8, 1],
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            Giga Drill Break!
          </motion.h1>

          <motion.div
            className="font-mono text-xs uppercase tracking-[0.4em] text-agilita sm:text-sm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 1, 1, 0.85], y: 0 }}
            transition={{ duration: 0.5, delay: 1.3 }}
          >
            ⚡ Nuovo Record di Tonnellaggio ⚡
          </motion.div>

          {/* ── PHASE 4 — exercise + improvement reveal ──────────────────── */}
          <motion.div
            className="mt-4 flex flex-col items-center gap-3"
            style={willChangeTransform}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 1.65, ease: 'easeOut' }}
          >
            <div className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-400">
              {payload.exercise_name}
            </div>
            <motion.div
              className="font-mono text-6xl font-black tabular-nums sm:text-7xl"
              style={{
                color: 'rgb(34, 197, 94)',
                filter:
                  'drop-shadow(0 0 22px rgba(34,197,94,0.85)) drop-shadow(0 0 44px rgba(250,204,21,0.4))',
              }}
              initial={{ scale: 0.7 }}
              animate={{ scale: [0.7, 1.2, 0.95, 1] }}
              transition={{
                duration: 0.6,
                delay: 1.75,
                times: [0, 0.55, 0.8, 1],
              }}
            >
              +{improvementPct.toFixed(1)}%
            </motion.div>
            <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 sm:text-sm">
              <span className="tabular-nums">
                {Math.round(payload.from_tonnage)} kg
              </span>
              <span className="text-agilita">→</span>
              <span className="tabular-nums text-zinc-200">
                {Math.round(payload.to_tonnage)} kg
              </span>
            </div>
            {payload.bonus_exp > 0 && (
              <motion.div
                className="mt-2 rounded-full border border-emerald-400/60 bg-emerald-400/10 px-4 py-1 font-mono text-sm font-semibold tabular-nums text-emerald-400 sm:text-base"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 2.05 }}
                style={{
                  boxShadow:
                    '0 0 18px rgba(16,185,129,0.55), inset 0 0 12px rgba(16,185,129,0.2)',
                }}
              >
                +{payload.bonus_exp} EXP
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 240px 100px rgba(0,0,0,0.95)',
        }}
      />
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DrillSVG — sideways cone with grooves that scroll along the longitudinal
// axis under a clip-path. The illusion of rotation comes purely from the
// inline CSS @keyframes inside the SVG, not from any whole-element rotate.
// ─────────────────────────────────────────────────────────────────────────────

const GROOVE_SPACING = 50
const GROOVE_COUNT = 18 // cone is ~580 wide → 12 inside + 6 buffer for seamless loop

function DrillSVG() {
  return (
    <svg
      width="640"
      height="200"
      viewBox="0 0 640 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-[0_0_50px_rgba(250,204,21,0.7)]"
      aria-hidden
    >
      <defs>
        <clipPath id="cone-clip">
          <path d="M 0 100 L 580 22 L 580 178 Z" />
        </clipPath>
        <linearGradient id="drillBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="80%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#450a0a" />
        </linearGradient>
        <linearGradient id="drillHilight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </linearGradient>
        {/* Inline style — scoped to this SVG. The keyframe translates the
         *  groove group by exactly one spacing, so the loop is seamless:
         *  groove[N] lands on the previous slot of groove[N-1] every cycle. */}
        <style>{`
          @keyframes drill-grooves-scroll {
            from { transform: translate3d(0, 0, 0); }
            to   { transform: translate3d(-${GROOVE_SPACING}px, 0, 0); }
          }
          .drill-grooves {
            animation: drill-grooves-scroll 0.32s linear infinite;
            will-change: transform;
          }
        `}</style>
      </defs>

      {/* Main cone body */}
      <path
        d="M 0 100 L 580 22 L 580 178 Z"
        fill="url(#drillBody)"
        stroke="#450a0a"
        strokeWidth="2"
      />

      {/* Animated grooves, clipped to cone outline. Movement is along the
       *  cone's longitudinal axis (right→left) — the 2D analogue of the
       *  drill rotating around its own length, like a barber pole. */}
      <g clipPath="url(#cone-clip)">
        <g className="drill-grooves">
          {Array.from({ length: GROOVE_COUNT }, (_, i) => {
            const x = -GROOVE_SPACING + i * GROOVE_SPACING
            // Each groove is a quadratic curve from above the cone to below
            // it; clipping confines the visible portion to the cone shape,
            // and the slight horizontal offset between top/bottom endpoints
            // gives the wrap-around suggestion you see on real drill bits.
            return (
              <path
                key={i}
                d={`M ${x - 14} -10 Q ${x} 100 ${x + 14} 210`}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth="6"
                fill="none"
              />
            )
          })}
        </g>
      </g>

      {/* Bright top-edge highlight — sits above the grooves */}
      <path
        d="M 0 100 L 580 22 L 580 32 L 0 104 Z"
        fill="url(#drillHilight)"
        opacity="0.6"
      />

      {/* Base mount */}
      <rect
        x="570"
        y="20"
        width="56"
        height="160"
        rx="6"
        fill="#1f2937"
        stroke="#fde047"
        strokeWidth="2.5"
      />
      <rect
        x="582"
        y="40"
        width="32"
        height="120"
        rx="3"
        fill="#0a0a0f"
        stroke="#fde047"
        strokeWidth="1"
        opacity="0.7"
      />

      {/* Pulsing tip glow — pure SMIL, no JS overhead */}
      <circle cx="0" cy="100" r="18" fill="#fef9c3" opacity="0.95">
        <animate
          attributeName="opacity"
          values="0.95;0.3;0.95"
          dur="0.4s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="r"
          values="18;26;18"
          dur="0.4s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}
