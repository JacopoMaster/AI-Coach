'use client'

// Giga Drill Break — full-screen cutscene played when a new tonnage PR
// is detected during a workout save. Orchestrates four framer-motion phases:
//   1. Freeze     (0.0 – 0.5s)  · dark backdrop + grid flash
//   2. Drill      (0.5 – 1.5s)  · "GIGA DRILL BREAK" title + drill impalement
//   3. Reveal     (1.5 – 2.5s)  · exercise name + improvement %
//   4. Fade out   (2.5 – 3.0s)  · overlay unmounts via AnimatePresence
//
// Mounts once in the app layout. Reads events from spiral-events.ts.

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import {
  type GigaDrillPayload,
  subscribeSpiralEvents,
} from '@/lib/gamification/spiral-events'

const TOTAL_DURATION_MS = 3000

export function GigaDrillCutscene() {
  const [payload, setPayload] = useState<GigaDrillPayload | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeSpiralEvents((event) => {
      if (event.type !== 'giga_drill') return
      setPayload(event.data)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!payload) return
    const t = setTimeout(() => setPayload(null), TOTAL_DURATION_MS)
    return () => clearTimeout(t)
  }, [payload])

  return (
    <AnimatePresence>
      {payload && <Overlay payload={payload} />}
    </AnimatePresence>
  )
}

function Overlay({ payload }: { payload: GigaDrillPayload }) {
  const improvementPct = Math.round(payload.improvement_pct * 1000) / 10 // e.g. 12.4

  return (
    <motion.div
      key="giga-drill-cutscene"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      aria-live="assertive"
      role="alert"
    >
      {/* ── PHASE 1 — backdrop + freeze flash ──────────────────────────── */}
      <motion.div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      {/* Grid pattern — cyber JRPG feel */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(250,204,21,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(250,204,21,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.6] }}
        transition={{ duration: 0.6, times: [0, 0.3, 1] }}
      />
      {/* White flash at t≈0.1 */}
      <motion.div
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.7, 0] }}
        transition={{ duration: 0.45, times: [0, 0.25, 1], ease: 'easeOut' }}
      />

      {/* Radial glow — gold/crimson halo at center */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, rgba(250,204,21,0.35) 0%, rgba(239,68,68,0.15) 30%, transparent 60%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.35, ease: 'easeOut' }}
      />

      {/* ── PHASE 2 — drill impalement across the viewport ─────────────── */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.2, rotate: 135 }}
        animate={{
          opacity: [0, 1, 1, 0.85],
          scale: [0.2, 1.6, 1.25, 1.25],
          rotate: [135, -35, -35, -35],
        }}
        transition={{
          duration: 1.4,
          delay: 0.35,
          times: [0, 0.35, 0.6, 1],
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <DrillSVG />
      </motion.div>

      {/* ── PHASE 2 — title "GIGA DRILL BREAK" ─────────────────────────── */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 px-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        <motion.h1
          className="text-4xl font-black uppercase leading-none tracking-[0.15em] text-white sm:text-6xl md:text-7xl"
          style={{
            textShadow:
              '0 0 20px rgba(250,204,21,0.8), 0 0 40px rgba(239,68,68,0.6), 0 4px 0 rgba(0,0,0,0.9)',
            WebkitTextStroke: '1px rgba(250,204,21,0.4)',
          }}
          initial={{ scale: 0.3, letterSpacing: '0em', opacity: 0 }}
          animate={{
            scale: [0.3, 1.15, 1],
            letterSpacing: ['0em', '0.2em', '0.15em'],
            opacity: [0, 1, 1],
          }}
          transition={{
            duration: 0.9,
            delay: 0.5,
            times: [0, 0.7, 1],
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          Giga Drill Break
        </motion.h1>

        {/* Italian flavor subtitle — short punch */}
        <motion.div
          className="font-mono text-xs uppercase tracking-[0.35em] text-agilita"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.1 }}
        >
          Record di Tonnellaggio Frantumato
        </motion.div>

        {/* ── PHASE 3 — exercise + improvement ─────────────────────────── */}
        <motion.div
          className="mt-4 flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.5, ease: 'easeOut' }}
        >
          <div className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-400">
            {payload.exercise_name}
          </div>
          <motion.div
            className="font-mono text-5xl font-bold tabular-nums text-forza sm:text-6xl"
            style={{
              textShadow: '0 0 28px rgba(239,68,68,0.65), 0 0 60px rgba(239,68,68,0.3)',
            }}
            initial={{ scale: 0.8 }}
            animate={{ scale: [0.8, 1.1, 1] }}
            transition={{ duration: 0.45, delay: 1.6, times: [0, 0.7, 1] }}
          >
            +{improvementPct.toFixed(1)}%
          </motion.div>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
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
              className="mt-1 font-mono text-sm font-semibold tabular-nums text-emerald-400"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 1.9 }}
              style={{ textShadow: '0 0 14px rgba(16,185,129,0.7)' }}
            >
              +{payload.bonus_exp} EXP
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* Edge vignette — black borders that pulse to frame the action */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 200px 80px rgba(0,0,0,0.9)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      />
    </motion.div>
  )
}

// Simplified spiral drill — a rotated cone with spiral grooves.
// Kept inline so the cutscene stays self-contained.
function DrillSVG() {
  return (
    <svg
      width="560"
      height="180"
      viewBox="0 0 560 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-[0_0_40px_rgba(250,204,21,0.55)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="drillBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="80%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#450a0a" />
        </linearGradient>
        <linearGradient id="drillHilight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Main cone, tip at left */}
      <path
        d="M 0 90 L 510 20 L 510 160 Z"
        fill="url(#drillBody)"
        stroke="#450a0a"
        strokeWidth="2"
      />

      {/* Spiral grooves — diagonal lines that suggest rotation */}
      {[
        [120, 38, 150, 142],
        [200, 48, 230, 132],
        [280, 56, 310, 124],
        [360, 62, 390, 118],
        [440, 70, 470, 110],
      ].map(([x1, y1, x2, y2], i) => (
        <path
          key={i}
          d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} 90 ${x2} ${y2}`}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="3"
          fill="none"
        />
      ))}

      {/* Bright highlight on the upper edge */}
      <path
        d="M 0 90 L 510 20 L 510 30 L 0 94 Z"
        fill="url(#drillHilight)"
        opacity="0.55"
      />

      {/* Base mount behind the cone */}
      <rect
        x="500"
        y="18"
        width="50"
        height="144"
        rx="6"
        fill="#1f2937"
        stroke="#fde047"
        strokeWidth="2"
      />

      {/* Tip glow */}
      <circle cx="0" cy="90" r="14" fill="#fef9c3" opacity="0.9">
        <animate
          attributeName="opacity"
          values="0.9;0.4;0.9"
          dur="0.6s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}
