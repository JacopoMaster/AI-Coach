'use client'

// UniversalCutscene — full-screen "Giga Drill" visual used as the base for
// every gamification cutscene (Level Up, Achievement, PR / Giga Drill).
//
// All the heavy-lifting SVG / Framer Motion logic was prototyped in
// `temp-animation.tsx` and is preserved here verbatim — only the wrapping
// component shape changed:
//   • removed the demo `App` + tier-button grid
//   • renamed `GigaDrillBreak` → `UniversalCutscene`
//   • takes a typed `payload` instead of loose `show / message / level` props
//   • `ReformedBlock` now reads `title` and `subtitle` from the payload
//
// Phase timeline (~7.8s):
//   rise (0)    → drilling (.7) → shatter (3.2) → pierce (3.7)
//   → fall (4.4) → reform (5.4) → text (6.0) → done (7.8) → onComplete()

import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, type Easing, motion } from 'framer-motion'

/* ═══════════════════════════════════════════════════════════
   PUBLIC TYPES
   ═══════════════════════════════════════════════════════════ */

export type CutsceneType = 'level_up' | 'achievement' | 'giga_drill'

export interface CutscenePayload {
  type: CutsceneType
  title: string
  subtitle: string
  level: number
  /** Optional accent override — when set, replaces the tier's aura color
   *  for the overlay glow / borders / text shadows. */
  colorOverride?: string
}

interface UniversalCutsceneProps {
  payload: CutscenePayload
  onComplete: () => void
}

/* ═══════════════════════════════════════════════════════════
   GEOMETRY  — see temp-animation.tsx for the full derivation
   ═══════════════════════════════════════════════════════════ */

const widthPct = 70
const heightPct = 35
const bottomYPct = 50
const leftXPct = (100 - widthPct) / 2

const BLOCK = {
  widthPct,
  heightPct,
  bottomYPct,
  topYPct: bottomYPct - heightPct,
  leftXPct,
  rightXPct: leftXPct + widthPct,
}

const DRILL_HEIGHT_PCT = 50
const DRILL_WIDTH_PCT = 30

const DRILL_DOCKED_TOP_PCT = BLOCK.bottomYPct
const DRILL_START_TOP_PCT = 110
const DRILL_EXIT_TOP_PCT = -DRILL_HEIGHT_PCT - 10

/* ═══════════════════════════════════════════════════════════
   TIER SYSTEM
   ═══════════════════════════════════════════════════════════ */

interface Aura {
  color: string
  opacity: number
  size: number
}

interface Tier {
  id: number
  minLevel: number
  label: string
  bodyGrad: string
  grooveBase: string
  grooveMid: string
  grooveHi: string
  rim: string
  tipGlow: string | null
  speed: number
  aura: Aura | null
  crossStars: number
  particles: number
  rays: number
  shockRing: boolean
  lightning: boolean
  cosmic: boolean
  megaForm: boolean
  shadowColor: string | null
  sparkColor: string
}

const TIERS: Tier[] = [
  { id: 1, minLevel: 1, label: 'Standard Drill', bodyGrad: 'steel', grooveBase: '#0a0a0a', grooveMid: '#6a6a6a', grooveHi: '#f0f0f0', rim: '#2b2b2b', tipGlow: null, speed: 0.6, aura: null, crossStars: 0, particles: 0, rays: 0, shockRing: false, lightning: false, cosmic: false, megaForm: false, shadowColor: null, sparkColor: '#ffaa44' },
  { id: 2, minLevel: 5, label: 'Polished Steel', bodyGrad: 'steel-bright', grooveBase: '#0a0a0a', grooveMid: '#8a8a8a', grooveHi: '#ffffff', rim: '#3a3a3a', tipGlow: '#d0e8ff', speed: 0.55, aura: { color: '#c8d8f0', opacity: 0.25, size: 1.05 }, crossStars: 0, particles: 0, rays: 0, shockRing: false, lightning: false, cosmic: false, megaForm: false, shadowColor: null, sparkColor: '#d0e8ff' },
  { id: 3, minLevel: 15, label: 'Bronze Awakening', bodyGrad: 'bronze', grooveBase: '#3a1e00', grooveMid: '#c07820', grooveHi: '#ffd080', rim: '#5a2f08', tipGlow: '#ffa040', speed: 0.5, aura: { color: '#ff9040', opacity: 0.35, size: 1.12 }, crossStars: 1, particles: 3, rays: 0, shockRing: false, lightning: false, cosmic: false, megaForm: false, shadowColor: 'rgba(255, 144, 64, 0.45)', sparkColor: '#ffa040' },
  { id: 4, minLevel: 30, label: 'Golden Fury', bodyGrad: 'gold', grooveBase: '#6b4a00', grooveMid: '#d4a017', grooveHi: '#fff4a3', rim: '#8b6508', tipGlow: '#fff080', speed: 0.45, aura: { color: '#ffcc40', opacity: 0.45, size: 1.18 }, crossStars: 2, particles: 6, rays: 4, shockRing: false, lightning: false, cosmic: false, megaForm: false, shadowColor: 'rgba(255, 204, 64, 0.6)', sparkColor: '#fff080' },
  { id: 5, minLevel: 50, label: 'Crimson Gold', bodyGrad: 'crimson-gold', grooveBase: '#4a0a00', grooveMid: '#e04010', grooveHi: '#ffd060', rim: '#8b0508', tipGlow: '#ff6020', speed: 0.38, aura: { color: '#ff4020', opacity: 0.55, size: 1.25 }, crossStars: 4, particles: 10, rays: 6, shockRing: true, lightning: false, cosmic: false, megaForm: false, shadowColor: 'rgba(255, 64, 32, 0.65)', sparkColor: '#ff6020' },
  { id: 6, minLevel: 70, label: 'Inferno Core', bodyGrad: 'inferno', grooveBase: '#2a0000', grooveMid: '#ff1020', grooveHi: '#ffe040', rim: '#5a0008', tipGlow: '#ff2000', speed: 0.32, aura: { color: '#ff1040', opacity: 0.65, size: 1.32 }, crossStars: 6, particles: 14, rays: 8, shockRing: true, lightning: false, cosmic: false, megaForm: false, shadowColor: 'rgba(255, 32, 0, 0.75)', sparkColor: '#ff2000' },
  { id: 7, minLevel: 85, label: 'Void Piercer', bodyGrad: 'violet', grooveBase: '#1a0030', grooveMid: '#c020ff', grooveHi: '#ffa0ff', rim: '#3a0050', tipGlow: '#ff40ff', speed: 0.28, aura: { color: '#d040ff', opacity: 0.7, size: 1.4 }, crossStars: 7, particles: 18, rays: 10, shockRing: true, lightning: false, cosmic: false, megaForm: false, shadowColor: 'rgba(208, 64, 255, 0.8)', sparkColor: '#ff40ff' },
  { id: 8, minLevel: 95, label: 'Lightning Drill', bodyGrad: 'lightning', grooveBase: '#001830', grooveMid: '#00d0ff', grooveHi: '#e0ffff', rim: '#003050', tipGlow: '#00ffff', speed: 0.22, aura: { color: '#00d0ff', opacity: 0.8, size: 1.48 }, crossStars: 8, particles: 22, rays: 12, shockRing: true, lightning: true, cosmic: false, megaForm: false, shadowColor: 'rgba(0, 208, 255, 0.9)', sparkColor: '#00ffff' },
  { id: 9, minLevel: 99, label: 'Critical Mass', bodyGrad: 'white-hot', grooveBase: '#402020', grooveMid: '#ffffff', grooveHi: '#ffffff', rim: '#606060', tipGlow: '#ffffff', speed: 0.16, aura: { color: '#ffffff', opacity: 0.95, size: 1.58 }, crossStars: 10, particles: 28, rays: 16, shockRing: true, lightning: true, cosmic: false, megaForm: false, shadowColor: 'rgba(255, 255, 255, 1)', sparkColor: '#ffffff' },
  { id: 10, minLevel: 100, label: 'PIERCE THE HEAVENS', bodyGrad: 'cosmic', grooveBase: '#000020', grooveMid: '#ff00ff', grooveHi: '#ffff00', rim: '#4000a0', tipGlow: '#ffffff', speed: 0.1, aura: { color: '#ff00ff', opacity: 1, size: 1.7 }, crossStars: 12, particles: 40, rays: 20, shockRing: true, lightning: true, cosmic: true, megaForm: false, shadowColor: 'rgba(255, 0, 255, 1)', sparkColor: '#ff00ff' },
  { id: 11, minLevel: 150, label: 'SUPER TENGEN TOPPA', bodyGrad: 'galaxy', grooveBase: '#ffffff', grooveMid: '#ffffff', grooveHi: '#ffffff', rim: '#ffffff', tipGlow: '#ffffff', speed: 0.06, aura: { color: '#ffffff', opacity: 1, size: 2.0 }, crossStars: 16, particles: 60, rays: 32, shockRing: true, lightning: true, cosmic: true, megaForm: true, shadowColor: 'rgba(255, 255, 255, 1)', sparkColor: '#fff080' },
]

function getTier(level: number): Tier {
  let t = TIERS[0]
  for (const tier of TIERS) if (level >= tier.minLevel) t = tier
  return t
}

type Phase =
  | 'idle'
  | 'rise'
  | 'drilling'
  | 'shatter'
  | 'pierce'
  | 'fall'
  | 'reform'
  | 'text'
  | 'done'

/* ═══════════════════════════════════════════════════════════
   UNIVERSAL CUTSCENE
   ═══════════════════════════════════════════════════════════ */

export function UniversalCutscene({ payload, onComplete }: UniversalCutsceneProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const tier = useMemo(() => getTier(payload.level), [payload.level])

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('rise'), 0),
      setTimeout(() => setPhase('drilling'), 700),
      setTimeout(() => setPhase('shatter'), 3200),
      setTimeout(() => setPhase('pierce'), 3700),
      setTimeout(() => setPhase('fall'), 4400),
      setTimeout(() => setPhase('reform'), 5400),
      setTimeout(() => setPhase('text'), 6000),
      setTimeout(() => {
        setPhase('done')
        onComplete()
      }, 7800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  const accentColor = payload.colorOverride ?? tier.aura?.color ?? '#00f0ff'
  const accentColor2 = tier.grooveHi || '#ff00ff'
  const shakeIntensity = tier.megaForm ? 1.5 : tier.id >= 9 ? 1.2 : tier.id >= 6 ? 0.8 : 0.5
  const screenShake = phase === 'shatter'

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            overflow: 'hidden',
            background: tier.megaForm
              ? 'rgba(5, 0, 25, 0.94)'
              : tier.cosmic
                ? 'rgba(8, 0, 20, 0.93)'
                : 'rgba(5, 5, 15, 0.92)',
            fontFamily: 'system-ui, sans-serif',
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            x: screenShake
              ? [0, -8 * shakeIntensity, 10 * shakeIntensity, -6 * shakeIntensity, 8 * shakeIntensity, -3 * shakeIntensity, 0]
              : 0,
            y: screenShake
              ? [0, 6 * shakeIntensity, -8 * shakeIntensity, 4 * shakeIntensity, -6 * shakeIntensity, 2 * shakeIntensity, 0]
              : 0,
          }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.3 },
            x: { duration: 0.5, ease: 'easeInOut' },
            y: { duration: 0.5, ease: 'easeInOut' },
          }}
          aria-live="assertive"
          role="alert"
        >
          <CyberGrid color={accentColor} />
          {tier.cosmic && <CosmicBackdrop megaForm={tier.megaForm} />}
          {tier.crossStars > 0 && (
            <BackgroundStars
              count={tier.crossStars}
              color={tier.megaForm ? '#fff080' : accentColor2}
            />
          )}

          <AnimatePresence>
            {(phase === 'rise' || phase === 'drilling') && (
              <BlockSolid
                key="block-intact"
                accentColor={accentColor}
                accentColor2={accentColor2}
                drilling={phase === 'drilling'}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === 'drilling' && <Sparks key="sparks" color={tier.sparkColor} />}
          </AnimatePresence>

          <AnimatePresence>
            {(phase === 'shatter' || phase === 'pierce' || phase === 'fall') && (
              <BlockShards
                key="shards"
                phase={phase}
                accentColor={accentColor}
                accentColor2={accentColor2}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(phase === 'reform' || phase === 'text') && (
              <ReformedBlock
                key="block-reformed"
                phase={phase}
                title={payload.title}
                subtitle={payload.subtitle}
                tier={tier}
                accentColorOverride={payload.colorOverride}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(phase === 'rise' ||
              phase === 'drilling' ||
              phase === 'shatter' ||
              phase === 'pierce') && (
              <DrillProjectile key="drill" phase={phase} tier={tier} />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === 'shatter' && (
              <motion.div
                key="flash"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 50% ${BLOCK.bottomYPct}%, ${accentColor}cc 0%, transparent 50%)`,
                  zIndex: 8,
                  pointerEvents: 'none',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.4 }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ═══════════════════════════════════════════════════════════
   DRILL PROJECTILE
   ═══════════════════════════════════════════════════════════ */

function DrillProjectile({ phase, tier }: { phase: Phase; tier: Tier }) {
  const targetTop =
    phase === 'rise' || phase === 'drilling' || phase === 'shatter'
      ? `${DRILL_DOCKED_TOP_PCT}%`
      : phase === 'pierce'
        ? `${DRILL_EXIT_TOP_PCT}%`
        : `${DRILL_START_TOP_PCT}%`

  const duration =
    phase === 'rise' ? 0.7 : phase === 'drilling' ? 0 : phase === 'shatter' ? 0 : phase === 'pierce' ? 0.7 : 0

  const dropShadow = tier.shadowColor
    ? tier.megaForm
      ? `drop-shadow(0 0 10px ${tier.shadowColor}) drop-shadow(0 0 25px ${tier.shadowColor}) drop-shadow(0 0 50px #ffcc40)`
      : `drop-shadow(0 0 12px ${tier.shadowColor}) drop-shadow(0 0 28px ${tier.shadowColor})`
    : 'drop-shadow(0 0 8px rgba(0, 240, 255, 0.5))'

  const baseShakeClass = tier.megaForm
    ? 'drill-shake-mega'
    : tier.id >= 9
      ? 'drill-shake-chromatic'
      : ''
  const drillingShakeClass = phase === 'drilling' ? 'drill-drilling-shake' : ''

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: '50%',
        marginLeft: `-${DRILL_WIDTH_PCT / 2}%`,
        width: `${DRILL_WIDTH_PCT}%`,
        height: `${DRILL_HEIGHT_PCT}%`,
        zIndex: 6,
        filter: dropShadow,
      }}
      initial={{ top: `${DRILL_START_TOP_PCT}%` }}
      animate={{ top: targetTop }}
      transition={{
        duration,
        ease:
          phase === 'rise'
            ? [0.4, 0, 0.3, 1]
            : phase === 'pierce'
              ? [0.7, 0, 0.4, 1]
              : 'linear',
      }}
    >
      <style>{`
        @keyframes drill-chromatic-shake {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-1px, 0.5px); }
          50%      { transform: translate(1px, -0.5px); }
          75%      { transform: translate(-0.5px, 1px); }
        }
        @keyframes drill-mega-shake {
          0%, 100% { transform: translate(0, 0) scale(1); }
          20%      { transform: translate(-1.5px, 0.8px) scale(1.01); }
          40%      { transform: translate(1.2px, -0.6px) scale(1); }
          60%      { transform: translate(-0.8px, 1.2px) scale(1.015); }
          80%      { transform: translate(1px, 0.5px) scale(1); }
        }
        @keyframes drill-drilling {
          0%   { transform: translate(0, 0); }
          10%  { transform: translate(-2.5px, 1px); }
          20%  { transform: translate(2px, -1.5px); }
          30%  { transform: translate(-2px, 2px); }
          40%  { transform: translate(2.5px, -1px); }
          50%  { transform: translate(-1.5px, -2px); }
          60%  { transform: translate(2px, 1.5px); }
          70%  { transform: translate(-2.5px, -0.5px); }
          80%  { transform: translate(1.5px, 2px); }
          90%  { transform: translate(-1px, -1.5px); }
          100% { transform: translate(0, 0); }
        }
        .drill-shake-chromatic { animation: drill-chromatic-shake 0.08s steps(2) infinite; }
        .drill-shake-mega { animation: drill-mega-shake 0.2s ease-in-out infinite; }
        .drill-drilling-shake { animation: drill-drilling 0.12s linear infinite; }
      `}</style>
      <div
        className={`${baseShakeClass} ${drillingShakeClass}`}
        style={{ width: '100%', height: '100%' }}
      >
        <SpiralDrillSVG tier={tier} />
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SPIRAL DRILL SVG
   ═══════════════════════════════════════════════════════════ */

function SpiralDrillSVG({ tier }: { tier: Tier }) {
  const TIP_X = 0
  const TIP_Y = 0
  const BASE_Y = 280
  const BASE_HALF_WIDTH = 78
  const CY_FX = 140

  const bodyFill = `url(#bodyGrad_${tier.bodyGrad}_${tier.id})`

  const strands = useMemo(() => {
    const turns = 14
    const totalHeight = BASE_Y - TIP_Y
    const step = totalHeight / turns
    const arr: string[] = []
    for (let i = 0; i < turns; i++) {
      const yTop = TIP_Y + i * step
      const yBot = yTop + step
      const wTop = ((yTop - TIP_Y) / totalHeight) * BASE_HALF_WIDTH
      const wBot = ((yBot - TIP_Y) / totalHeight) * BASE_HALF_WIDTH
      arr.push(`M ${TIP_X - wTop} ${yTop} L ${TIP_X + wBot} ${yBot}`)
    }
    return arr
  }, [])

  const sid = `sd-${tier.id}`

  const gradients: Array<[string, [string, string, string, string, string]]> = [
    ['steel', ['#3a3a3a', '#b8b8b8', '#f0f0f0', '#9a9a9a', '#252525']],
    ['steel-bright', ['#4a5566', '#d0ddee', '#ffffff', '#a8b5c6', '#2a3540']],
    ['bronze', ['#3a1e00', '#a86018', '#ffc070', '#8a4810', '#2a1000']],
    ['gold', ['#5a3f00', '#c99511', '#fff3b0', '#c99511', '#3a2800']],
    ['crimson-gold', ['#3a0000', '#d03010', '#ffd060', '#a02008', '#2a0000']],
    ['inferno', ['#2a0000', '#d01020', '#ffe040', '#b00818', '#1a0000']],
    ['violet', ['#1a0030', '#8020c0', '#ffa0ff', '#6010a0', '#10001a']],
    ['lightning', ['#001830', '#00a0d0', '#e0ffff', '#0080b0', '#000a1a']],
    ['white-hot', ['#606060', '#f0f0f0', '#ffffff', '#e0e0e0', '#505050']],
    ['cosmic', ['#200040', '#ff00ff', '#ffff00', '#00ffff', '#200040']],
    ['galaxy', ['#000020', '#ff00ff', '#ffffff', '#00ffff', '#200040']],
  ]

  return (
    <>
      <style>{`
        @keyframes ${sid}-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -36; } }
        @keyframes ${sid}-flow-fast { from { stroke-dashoffset: -18; } to { stroke-dashoffset: -54; } }
        @keyframes ${sid}-shine { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.55; } }
        @keyframes ${sid}-aura { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.7; } }
        @keyframes ${sid}-tip-star { from { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.15); } to { transform: rotate(360deg) scale(1); } }
        @keyframes ${sid}-orbit-a { from { transform: rotate(0deg) translateX(22px) rotate(0deg); } to { transform: rotate(360deg) translateX(22px) rotate(-360deg); } }
        @keyframes ${sid}-orbit-b { from { transform: rotate(90deg) translateX(32px) rotate(-90deg); } to { transform: rotate(450deg) translateX(32px) rotate(-450deg); } }
        @keyframes ${sid}-ray-pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.9; } }
        @keyframes ${sid}-kinetic-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ${sid}-shock-expand { 0% { r: 40; opacity: 0.8; stroke-width: 4; } 100% { r: 130; opacity: 0; stroke-width: 1; } }
        @keyframes ${sid}-lightning { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
        @keyframes ${sid}-particle { 0%, 100% { opacity: 0; transform: scale(0.5); } 50% { opacity: 1; transform: scale(1.2); } }
        .${sid}-strand-main { animation: ${sid}-flow ${tier.speed}s linear infinite; }
        .${sid}-strand-hl   { animation: ${sid}-flow-fast ${tier.speed}s linear infinite; }
        .${sid}-shine       { animation: ${sid}-shine 1.8s ease-in-out infinite; }
        .${sid}-aura        { animation: ${sid}-aura 2.2s ease-in-out infinite; transform-origin: center; }
        .${sid}-tip-star    { animation: ${sid}-tip-star 2s ease-in-out infinite; }
        .${sid}-orbit-a     { animation: ${sid}-orbit-a 3s linear infinite; }
        .${sid}-orbit-b     { animation: ${sid}-orbit-b 4.5s linear infinite; }
        .${sid}-kinetic     { animation: ${sid}-kinetic-rotate 3s linear infinite; }
        .${sid}-shock       { animation: ${sid}-shock-expand 1.8s ease-out infinite; }
        .${sid}-lightning   { animation: ${sid}-lightning 0.15s steps(2) infinite; }
      `}</style>

      <svg
        viewBox="-100 0 200 320"
        preserveAspectRatio="xMidYMin meet"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {gradients.map(([name, colors]) => (
            <linearGradient
              key={name}
              id={`bodyGrad_${name}_${tier.id}`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor={colors[0]} />
              <stop offset="30%" stopColor={colors[1]} />
              <stop offset="50%" stopColor={colors[2]} />
              <stop offset="70%" stopColor={colors[3]} />
              <stop offset="100%" stopColor={colors[4]} />
            </linearGradient>
          ))}
          <clipPath id={`drillCone_${tier.id}`}>
            <path
              d={`M ${TIP_X} ${TIP_Y} L ${TIP_X + BASE_HALF_WIDTH} ${BASE_Y} L ${TIP_X - BASE_HALF_WIDTH} ${BASE_Y} Z`}
            />
          </clipPath>
          <linearGradient id={`shineGrad_${tier.id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="40%" stopColor="white" stopOpacity="0.9" />
            <stop offset="60%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          {tier.aura && (
            <radialGradient id={`auraGrad_${tier.id}`}>
              <stop offset="0%" stopColor={tier.aura.color} stopOpacity={tier.aura.opacity} />
              <stop offset="50%" stopColor={tier.aura.color} stopOpacity={tier.aura.opacity * 0.4} />
              <stop offset="100%" stopColor={tier.aura.color} stopOpacity="0" />
            </radialGradient>
          )}
        </defs>

        {tier.aura && (
          <ellipse
            className={`${sid}-aura`}
            cx={0}
            cy={CY_FX}
            rx={100 * tier.aura.size * 0.7}
            ry={180 * tier.aura.size * 0.7}
            fill={`url(#auraGrad_${tier.id})`}
            opacity={tier.aura.opacity}
          />
        )}
        {tier.rays > 0 && (
          <KineticRays
            count={tier.rays}
            color={tier.aura ? tier.aura.color : '#ffffff'}
            length={tier.megaForm ? 60 : 30}
            cx={0}
            cy={CY_FX}
            sid={sid}
          />
        )}
        {tier.shockRing && tier.aura && (
          <circle
            cx={0}
            cy={CY_FX}
            r="100"
            fill="none"
            stroke={tier.aura.color}
            strokeWidth="2"
            opacity="0.6"
            className={`${sid}-shock`}
          />
        )}
        {tier.lightning && tier.aura && (
          <Lightning color={tier.aura.color} sid={sid} cx={0} cyTop={TIP_Y} />
        )}
        {tier.particles > 0 && (
          <Particles count={tier.particles} color={tier.grooveHi} cx={0} cy={CY_FX} sid={sid} />
        )}

        <ellipse cx={TIP_X} cy={BASE_Y} rx={BASE_HALF_WIDTH} ry="14" fill={tier.rim} />
        <ellipse cx={TIP_X} cy={BASE_Y - 2} rx={BASE_HALF_WIDTH} ry="12" fill={bodyFill} />
        <path
          d={`M ${TIP_X} ${TIP_Y} L ${TIP_X + BASE_HALF_WIDTH} ${BASE_Y} L ${TIP_X - BASE_HALF_WIDTH} ${BASE_Y} Z`}
          fill={bodyFill}
          stroke={tier.rim}
          strokeWidth="1.5"
        />

        <g clipPath={`url(#drillCone_${tier.id})`}>
          {strands.map((d, i) => (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke="rgba(0,0,0,0.55)"
                strokeWidth="7"
                strokeLinecap="round"
                transform="translate(0 2.5)"
              />
              <path
                d={d}
                fill="none"
                stroke={tier.grooveBase}
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d={d}
                fill="none"
                stroke={tier.grooveMid}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="30 6"
                className={`${sid}-strand-main`}
              />
              <path
                d={d}
                fill="none"
                stroke={tier.grooveHi}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="20 16"
                className={`${sid}-strand-hl`}
                opacity="0.9"
              />
            </g>
          ))}
          <rect
            x={-45}
            y="0"
            width="35"
            height="320"
            fill={`url(#shineGrad_${tier.id})`}
            className={`${sid}-shine`}
            style={{ mixBlendMode: 'screen' }}
          />
        </g>

        <path
          d={`M ${TIP_X} ${TIP_Y} L ${TIP_X + BASE_HALF_WIDTH} ${BASE_Y} L ${TIP_X + 30} ${BASE_Y} Z`}
          fill="black"
          opacity={tier.id >= 9 ? 0.1 : 0.3}
          pointerEvents="none"
        />

        {tier.tipGlow && (
          <>
            <g style={{ transformOrigin: `0px ${TIP_Y}px` }} className={`${sid}-tip-star`}>
              <CrossStar
                cx={0}
                cy={TIP_Y}
                size={
                  tier.megaForm
                    ? 22
                    : tier.id >= 10
                      ? 18
                      : tier.id >= 8
                        ? 14
                        : tier.id >= 7
                          ? 10
                          : tier.id >= 3
                            ? 6
                            : 4
                }
                color="#ffffff"
              />
            </g>
            {tier.id >= 7 && (
              <g style={{ transformOrigin: `0px ${TIP_Y}px` }}>
                <g style={{ transformOrigin: `0px ${TIP_Y}px` }} className={`${sid}-orbit-a`}>
                  <CrossStar cx={0} cy={TIP_Y} size={tier.megaForm ? 6 : 4} color="#fff4a3" />
                </g>
                <g style={{ transformOrigin: `0px ${TIP_Y}px` }} className={`${sid}-orbit-b`}>
                  <CrossStar cx={0} cy={TIP_Y} size={tier.megaForm ? 5 : 3} color="#ffffff" />
                </g>
              </g>
            )}
          </>
        )}

        <path
          d={`M ${TIP_X} ${TIP_Y} L ${TIP_X - BASE_HALF_WIDTH} ${BASE_Y}`}
          fill="none"
          stroke={tier.grooveHi}
          strokeWidth="1.2"
          opacity="0.6"
        />
      </svg>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   Effects
   ═══════════════════════════════════════════════════════════ */

function CrossStar({
  cx,
  cy,
  size,
  color,
}: {
  cx: number
  cy: number
  size: number
  color: string
}) {
  const s = size
  return (
    <g transform={`translate(${cx} ${cy})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <path
        d={`M 0 ${-s} L ${s * 0.12} ${-s * 0.12} L ${s} 0 L ${s * 0.12} ${s * 0.12} L 0 ${s} L ${-s * 0.12} ${s * 0.12} L ${-s} 0 L ${-s * 0.12} ${-s * 0.12} Z`}
        fill={color}
      />
      <path
        d={`M 0 ${-s * 0.5} L ${s * 0.05} ${-s * 0.05} L ${s * 0.5} 0 L ${s * 0.05} ${s * 0.05} L 0 ${s * 0.5} L ${-s * 0.05} ${s * 0.05} L ${-s * 0.5} 0 L ${-s * 0.05} ${-s * 0.05} Z`}
        fill="white"
        opacity="0.9"
      />
    </g>
  )
}

function Particles({
  count,
  color,
  cx,
  cy,
  sid,
}: {
  count: number
  color: string
  cx: number
  cy: number
  sid: string
}) {
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const seed = ((i * 9301 + 49297) % 233280) / 233280
        const r = 100 * (0.7 + seed * 0.4)
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r * 0.9
        const delay = (i / count) * 2
        const size = 1 + seed * 2
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={size}
            fill={color}
            style={{ animation: `${sid}-particle 2.4s ease-in-out ${delay}s infinite` }}
          />
        )
      })}
    </g>
  )
}

function KineticRays({
  count,
  color,
  cx,
  cy,
  length,
  sid,
}: {
  count: number
  color: string
  cx: number
  cy: number
  length: number
  sid: string
}) {
  return (
    <g className={`${sid}-kinetic`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360
        return (
          <line
            key={i}
            x1={cx}
            y1={cy - 130}
            x2={cx}
            y2={cy - 130 - length}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.8"
            transform={`rotate(${angle} ${cx} ${cy})`}
            style={{
              animation: `${sid}-ray-pulse 1.2s ease-in-out ${(i / count) * 0.8}s infinite`,
            }}
          />
        )
      })}
    </g>
  )
}

function Lightning({
  color,
  sid,
  cx,
  cyTop,
}: {
  color: string
  sid: string
  cx: number
  cyTop: number
}) {
  const bolts = [
    `M ${cx} ${cyTop} L ${cx - 20} ${cyTop + 60} L ${cx + 10} ${cyTop + 100} L ${cx - 15} ${cyTop + 150} L ${cx + 20} ${cyTop + 200}`,
    `M ${cx} ${cyTop} L ${cx + 25} ${cyTop + 70} L ${cx - 5} ${cyTop + 110} L ${cx + 30} ${cyTop + 160} L ${cx + 5} ${cyTop + 220}`,
    `M ${cx} ${cyTop} L ${cx - 30} ${cyTop + 55} L ${cx} ${cyTop + 100} L ${cx - 25} ${cyTop + 140} L ${cx - 5} ${cyTop + 190}`,
  ]
  return (
    <g className={`${sid}-lightning`}>
      {bolts.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2 + (i % 2)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      ))}
    </g>
  )
}

function BackgroundStars({ count, color }: { count: number; color: string }) {
  const stars = useMemo(() => {
    const positions = [
      { x: 8, y: 15 }, { x: 92, y: 22 }, { x: 15, y: 78 }, { x: 88, y: 85 },
      { x: 25, y: 35 }, { x: 78, y: 45 }, { x: 12, y: 55 }, { x: 90, y: 60 },
      { x: 35, y: 12 }, { x: 65, y: 88 }, { x: 5, y: 40 }, { x: 95, y: 70 },
      { x: 42, y: 8 }, { x: 58, y: 92 }, { x: 22, y: 92 }, { x: 78, y: 8 },
    ]
    const arr: Array<{ x: number; y: number; size: number; delay: number; duration: number }> = []
    for (let i = 0; i < Math.min(count, positions.length); i++) {
      arr.push({
        ...positions[i],
        size: 6 + (i % 4) * 2,
        delay: (i * 0.2) % 1.6,
        duration: 1.6 + (i % 3) * 0.4,
      })
    }
    return arr
  }, [count])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
      <style>{`
        @keyframes bg-star-twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50%      { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
      >
        {stars.map((s, i) => {
          const sz = s.size / 10
          return (
            <g
              key={i}
              transform={`translate(${s.x} ${s.y})`}
              style={{
                animation: `bg-star-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
                transformOrigin: `${s.x}px ${s.y}px`,
                transformBox: 'fill-box',
              }}
            >
              <path
                d={`M 0 ${-sz} L ${sz * 0.12} ${-sz * 0.12} L ${sz} 0 L ${sz * 0.12} ${sz * 0.12} L 0 ${sz} L ${-sz * 0.12} ${sz * 0.12} L ${-sz} 0 L ${-sz * 0.12} ${-sz * 0.12} Z`}
                fill={color}
                style={{ filter: `drop-shadow(0 0 2px ${color})` }}
              />
              <path
                d={`M 0 ${-sz * 0.5} L ${sz * 0.05} ${-sz * 0.05} L ${sz * 0.5} 0 L ${sz * 0.05} ${sz * 0.05} L 0 ${sz * 0.5} L ${-sz * 0.05} ${sz * 0.05} L ${-sz * 0.5} 0 L ${-sz * 0.05} ${-sz * 0.05} Z`}
                fill="white"
                opacity="0.9"
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CosmicBackdrop({ megaForm }: { megaForm: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
      <style>{`
        @keyframes cosmic-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes cosmic-bg-drift {
          0%, 100% { background-position: 0% 50%, 100% 50%, 50% 0%; }
          50%      { background-position: 100% 50%, 0% 50%, 50% 100%; }
        }
        .cosmic-bg-mega {
          position: absolute; inset: 0;
          background:
            radial-gradient(circle at 30% 30%, rgba(255,204,64,0.18) 0%, transparent 40%),
            radial-gradient(circle at 70% 70%, rgba(255,64,255,0.18) 0%, transparent 40%),
            radial-gradient(circle at 50% 50%, rgba(64,160,255,0.12) 0%, transparent 60%);
          background-size: 200% 200%, 200% 200%, 200% 200%;
          animation: cosmic-bg-drift 8s ease-in-out infinite;
        }
        .cosmic-galaxy-band { animation: cosmic-spin 20s linear infinite; transform-origin: center; }
      `}</style>
      {megaForm && <div className="cosmic-bg-mega" />}
      <svg
        viewBox="-100 -100 200 200"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      >
        <defs>
          <linearGradient id="galaxyBand" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="#ff00ff" stopOpacity={megaForm ? '0.4' : '0.3'} />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="cosmic-galaxy-band" style={{ transformOrigin: '0px 0px' }}>
          <ellipse cx="0" cy="0" rx="160" ry="22" fill="url(#galaxyBand)" opacity="0.5" />
          <ellipse cx="0" cy="0" rx="140" ry="16" fill="url(#galaxyBand)" opacity="0.4" transform="rotate(30)" />
          <ellipse cx="0" cy="0" rx="150" ry="20" fill="url(#galaxyBand)" opacity="0.3" transform="rotate(-45)" />
        </g>
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   STONE BLOCK
   ═══════════════════════════════════════════════════════════ */

interface MainCrack {
  main: string
  branches: string[]
  delay: number
  duration: number
}

interface SecondaryCrack {
  main: string
  delay: number
  duration: number
}

interface RockSpot {
  x: number
  y: number
  r: number
  op: number
}

function BlockSolid({
  accentColor,
  accentColor2,
  drilling,
}: {
  accentColor: string
  accentColor2: string
  drilling: boolean
}) {
  const { mainCracks, secondaryCracks, rockSpots } = useMemo(() => {
    const main: MainCrack[] = []
    const secondary: SecondaryCrack[] = []
    const spots: RockSpot[] = []

    const startX = 200
    const startY = 200

    const numMain = 7
    for (let i = 0; i < numMain; i++) {
      const angleDeg = -160 + (i / (numMain - 1)) * 140
      const angle = (angleDeg * Math.PI) / 180

      const len = 280
      const segments = 6
      let path = `M ${startX} ${startY}`
      let cx = startX
      let cy = startY

      for (let j = 1; j <= segments; j++) {
        const segLen = len * (j / segments)
        const jitter = ((i * 7 + j * 13) % 28) - 14
        const a = angle + jitter * 0.025
        cx = startX + Math.cos(a) * segLen
        cy = startY + Math.sin(a) * segLen
        path += ` L ${cx.toFixed(1)} ${cy.toFixed(1)}`
      }

      const branches: string[] = []
      for (let b = 0; b < 3; b++) {
        const branchAngle = angle + (b - 1) * 0.55
        const branchStart = len * (0.3 + b * 0.2)
        const bx = startX + Math.cos(angle) * branchStart
        const by = startY + Math.sin(angle) * branchStart
        const blen = 35 + ((i * 11 + b * 9) % 35)
        const bx2 = bx + Math.cos(branchAngle) * blen
        const by2 = by + Math.sin(branchAngle) * blen
        branches.push(`M ${bx.toFixed(1)} ${by.toFixed(1)} L ${bx2.toFixed(1)} ${by2.toFixed(1)}`)
      }

      main.push({
        main: path,
        branches,
        delay: 0.2 + i * 0.18,
        duration: 0.4,
      })
    }

    const numSecondary = 14
    for (let i = 0; i < numSecondary; i++) {
      const sx = 30 + ((i * 47) % 340)
      const sy = 20 + ((i * 53) % 160)
      const dx = startX - sx
      const dy = startY - sy
      const baseAngle = Math.atan2(dy, dx)
      const dispersion = (((i * 19) % 20) - 10) * 0.05
      const angle = baseAngle + dispersion + Math.PI

      const len = 35 + ((i * 13) % 30)
      const segments = 3
      let path = `M ${sx} ${sy}`
      let cx = sx
      let cy = sy
      for (let j = 1; j <= segments; j++) {
        const segLen = len * (j / segments)
        const jitter = ((i * 7 + j * 11) % 16) - 8
        const a = angle + jitter * 0.04
        cx = sx + Math.cos(a) * segLen
        cy = sy + Math.sin(a) * segLen
        path += ` L ${cx.toFixed(1)} ${cy.toFixed(1)}`
      }

      secondary.push({
        main: path,
        delay: 1.5 + i * 0.06,
        duration: 0.25,
      })
    }

    for (let i = 0; i < 35; i++) {
      const sx = (i * 73) % 400
      const sy = (i * 53) % 200
      const sr = 1.5 + ((i * 7) % 30) / 10
      const op = 0.15 + ((i * 11) % 20) / 100
      spots.push({ x: sx, y: sy, r: sr, op })
    }

    return { mainCracks: main, secondaryCracks: secondary, rockSpots: spots }
  }, [])

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${BLOCK.leftXPct}%`,
        top: `${BLOCK.topYPct}%`,
        width: `${BLOCK.widthPct}%`,
        height: `${BLOCK.heightPct}%`,
        zIndex: 4,
        pointerEvents: 'none',
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="rockBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a6f60" />
            <stop offset="40%" stopColor="#4a4138" />
            <stop offset="80%" stopColor="#2e2820" />
            <stop offset="100%" stopColor="#1a1612" />
          </linearGradient>

          <linearGradient id="rockBevelTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a8d7a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#9a8d7a" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="rockBevelBottom" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="400" height="200" fill="url(#rockBody)" />

        {rockSpots.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#000" opacity={s.op} />
        ))}

        <rect x="0" y="0" width="400" height="22" fill="url(#rockBevelTop)" />
        <rect x="0" y="178" width="400" height="22" fill="url(#rockBevelBottom)" />

        <g stroke="#000" strokeWidth="0.7" fill="none" opacity="0.45">
          <path d="M 30 50 Q 80 60 130 45 T 220 55" />
          <path d="M 250 30 Q 290 70 320 50 T 380 80" />
          <path d="M 50 160 Q 90 140 130 155" />
          <path d="M 280 170 Q 320 150 360 165" />
          <path d="M 100 100 Q 150 110 200 95" />
          <path d="M 220 130 Q 270 140 310 125" />
        </g>

        <rect
          x="2"
          y="2"
          width="396"
          height="196"
          fill="none"
          stroke={accentColor}
          strokeWidth="2"
          style={{ filter: `drop-shadow(0 0 6px ${accentColor})` }}
        />

        {[
          { x: 2, y: 2, dx: 1, dy: 1 },
          { x: 398, y: 2, dx: -1, dy: 1 },
          { x: 2, y: 198, dx: 1, dy: -1 },
          { x: 398, y: 198, dx: -1, dy: -1 },
        ].map((c, i) => (
          <g key={i} stroke={accentColor2} strokeWidth="2.5" fill="none">
            <line x1={c.x} y1={c.y} x2={c.x + c.dx * 18} y2={c.y} />
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + c.dy * 18} />
          </g>
        ))}

        {drilling && (
          <g>
            {mainCracks.map((c, i) => (
              <g key={`m-${i}`}>
                <motion.path
                  d={c.main}
                  fill="none"
                  stroke="#000"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.85 }}
                  transition={{ duration: c.duration, delay: c.delay, ease: 'easeOut' }}
                />
                <motion.path
                  d={c.main}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: c.duration, delay: c.delay + 0.05, ease: 'easeOut' }}
                  style={{ filter: `drop-shadow(0 0 2px ${accentColor})` }}
                />
                {c.branches.map((b, j) => (
                  <g key={`b-${j}`}>
                    <motion.path
                      d={b}
                      fill="none"
                      stroke="#000"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      opacity="0.6"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.7 }}
                      transition={{ duration: c.duration * 0.7, delay: c.delay + 0.15, ease: 'easeOut' }}
                    />
                    <motion.path
                      d={b}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1"
                      strokeLinecap="round"
                      opacity="0.8"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.9 }}
                      transition={{ duration: c.duration * 0.7, delay: c.delay + 0.2, ease: 'easeOut' }}
                    />
                  </g>
                ))}
              </g>
            ))}

            {secondaryCracks.map((c, i) => (
              <g key={`s-${i}`}>
                <motion.path
                  d={c.main}
                  fill="none"
                  stroke="#000"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.6"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.6 }}
                  transition={{ duration: c.duration, delay: c.delay, ease: 'easeOut' }}
                />
                <motion.path
                  d={c.main}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="0.8"
                  strokeLinecap="round"
                  opacity="0.7"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.8 }}
                  transition={{ duration: c.duration, delay: c.delay + 0.04, ease: 'easeOut' }}
                />
              </g>
            ))}

            <motion.circle
              cx="200"
              cy="200"
              r="6"
              fill="#ffffff"
              animate={{
                scale: [0, 3, 0],
                opacity: [1, 0, 0],
              }}
              transition={{
                duration: 0.6,
                repeat: 4,
                repeatType: 'loop',
                ease: 'easeOut',
              }}
              style={{ transformOrigin: '200px 200px' }}
            />
          </g>
        )}
      </svg>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SPARKS
   ═══════════════════════════════════════════════════════════ */

function Sparks({ color }: { color: string }) {
  const sparks = useMemo(() => {
    const arr: Array<{
      id: number
      angle: number
      distance: number
      size: number
      delay: number
      duration: number
    }> = []
    const count = 18
    for (let i = 0; i < count; i++) {
      const seed = ((i * 9301 + 49297) % 233280) / 233280
      const angleDet = (i / count) * Math.PI * 2 + seed * 0.5
      const distance = 30 + seed * 50
      arr.push({
        id: i,
        angle: angleDet,
        distance,
        size: 1 + seed * 2,
        delay: (i * 0.04) % 0.5,
        duration: 0.3 + seed * 0.4,
      })
    }
    return arr
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: `${BLOCK.bottomYPct}%`,
        width: 0,
        height: 0,
        zIndex: 7,
        pointerEvents: 'none',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          left: '-100px',
          top: '-50px',
          width: '200px',
          height: '150px',
          overflow: 'visible',
        }}
        viewBox="0 0 200 150"
      >
        <defs>
          <radialGradient id="sparkGrad">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>

        <motion.circle
          cx="100"
          cy="50"
          r="8"
          fill="url(#sparkGrad)"
          animate={{
            scale: [1, 1.5, 1, 1.3, 1],
            opacity: [0.8, 1, 0.7, 1, 0.8],
          }}
          transition={{ duration: 0.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '100px 50px' }}
        />

        {sparks.map((s, idx) => {
          const dx = Math.cos(s.angle) * s.distance
          const dy = Math.sin(s.angle) * s.distance * 0.6 + s.distance * 0.4

          return (
            <motion.g
              key={`${idx}-${s.id}`}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{
                x: [0, dx, dx * 1.2],
                y: [0, dy, dy + 30],
                opacity: [0, 1, 0],
                scale: [0.5, 1, 0.3],
              }}
              transition={{
                duration: s.duration,
                delay: s.delay,
                repeat: Infinity,
                repeatDelay: 0.15,
                times: [0, 0.4, 1],
                ease: 'easeOut',
              }}
            >
              <circle
                cx="100"
                cy="50"
                r={s.size}
                fill="#ffffff"
                style={{ filter: `drop-shadow(0 0 3px ${color})` }}
              />
              <line
                x1="100"
                y1="50"
                x2={100 - Math.cos(s.angle) * s.size * 4}
                y2={50 - Math.sin(s.angle) * 0.6 * s.size * 4}
                stroke={color}
                strokeWidth={s.size * 0.5}
                strokeLinecap="round"
                opacity="0.8"
              />
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   BLOCK SHARDS
   ═══════════════════════════════════════════════════════════ */

interface Shard {
  id: number
  points: string
  highlightPoints: string
  centerX: number
  centerY: number
  flyAngle: number
  flyDistance: number
  rotationDelta: number
  tumbleX: number
  tumbleY: number
  fallExtra: number
  fallSpin: number
  delay: number
}

function BlockShards({
  phase,
  accentColor,
}: {
  phase: Phase
  accentColor: string
  accentColor2: string
}) {
  const shards = useMemo(() => generateBlockShards(), [])

  return (
    <div
      style={{
        position: 'absolute',
        left: `${BLOCK.leftXPct}%`,
        top: `${BLOCK.topYPct}%`,
        width: `${BLOCK.widthPct}%`,
        height: `${BLOCK.heightPct}%`,
        zIndex: 5,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="rockShardFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a6f60" />
            <stop offset="50%" stopColor="#4a4138" />
            <stop offset="100%" stopColor="#1a1612" />
          </linearGradient>
        </defs>

        {shards.map((s) => {
          const explodeX = Math.cos(s.flyAngle) * s.flyDistance
          const explodeY = Math.sin(s.flyAngle) * s.flyDistance

          const fallX = explodeX * 1.4
          const fallY = explodeY + 250 + s.fallExtra

          let animate: Record<string, number>
          let duration: number
          let ease: Easing | Easing[]

          if (phase === 'shatter') {
            animate = {
              x: explodeX,
              y: explodeY,
              rotate: s.rotationDelta,
              rotateX: s.tumbleX * 0.5,
              rotateY: s.tumbleY * 0.5,
              opacity: 1,
              scale: 1,
            }
            duration = 0.5
            ease = [0.15, 0.65, 0.4, 1]
          } else if (phase === 'pierce') {
            animate = {
              x: explodeX * 1.2,
              y: explodeY + 80,
              rotate: s.rotationDelta + s.fallSpin * 0.3,
              rotateX: s.tumbleX * 0.7,
              rotateY: s.tumbleY * 0.7,
              opacity: 0.9,
              scale: 0.95,
            }
            duration = 0.7
            ease = [0.4, 0.1, 0.7, 1]
          } else if (phase === 'fall') {
            animate = {
              x: fallX,
              y: fallY,
              rotate: s.rotationDelta + s.fallSpin,
              rotateX: s.tumbleX,
              rotateY: s.tumbleY,
              opacity: 0,
              scale: 0.7,
            }
            duration = 1.2
            ease = [0.4, 0, 0.7, 1]
          } else {
            animate = { x: 0, y: 0, opacity: 0 }
            duration = 0
            ease = 'linear'
          }

          return (
            <motion.g
              key={s.id}
              initial={{ x: 0, y: 0, rotate: 0, rotateX: 0, rotateY: 0, opacity: 0, scale: 1 }}
              animate={animate}
              transition={{
                duration,
                ease,
                delay: phase === 'shatter' ? s.delay : 0,
              }}
              style={{
                originX: `${s.centerX}px`,
                originY: `${s.centerY}px`,
                transformBox: 'fill-box',
              }}
            >
              <polygon points={s.points} fill="rgba(0, 0, 0, 0.6)" transform="translate(2, 3)" />
              <polygon
                points={s.points}
                fill="url(#rockShardFill)"
                stroke="#1a1612"
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <polyline
                points={s.highlightPoints}
                fill="none"
                stroke={accentColor}
                strokeWidth="0.6"
                strokeLinecap="round"
                opacity="0.7"
                style={{ filter: `drop-shadow(0 0 1px ${accentColor})` }}
              />
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}

function generateBlockShards(): Shard[] {
  const shards: Shard[] = []
  let id = 0
  const cols = 5
  const rows = 3
  const cellW = 400 / cols
  const cellH = 200 / rows

  const kickX = 200
  const kickY = 200

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ccx = c * cellW + cellW / 2
      const ccy = r * cellH + cellH / 2

      const seed = id
      const jx = (n: number) => ((seed * (n + 7)) % 13) - 6
      const jy = (n: number) => ((seed * (n + 11)) % 13) - 6

      const points: Array<[number, number]> = [
        [c * cellW + jx(1), r * cellH + jy(2)],
        [c * cellW + cellW * 0.5 + jx(3), r * cellH + jy(4)],
        [c * cellW + cellW + jx(5), r * cellH + jy(6)],
        [c * cellW + cellW + jx(7), r * cellH + cellH + jy(8)],
        [c * cellW + cellW * 0.5 + jx(9), r * cellH + cellH + jy(10)],
        [c * cellW + jx(11), r * cellH + cellH + jy(12)],
      ]

      const dx = ccx - kickX
      const dy = ccy - kickY
      const flyAngle = Math.atan2(dy, dx)
      const distFromKick = Math.sqrt(dx * dx + dy * dy)
      const flyDistance = 60 + (200 - Math.min(distFromKick, 200)) * 0.5

      shards.push(buildBlockShard(id++, points, flyAngle, flyDistance, seed))
    }
  }

  return shards
}

function buildBlockShard(
  id: number,
  pointsArray: Array<[number, number]>,
  flyAngle: number,
  flyDistance: number,
  seed: number
): Shard {
  let sx = 0
  let sy = 0
  for (const p of pointsArray) {
    sx += p[0]
    sy += p[1]
  }
  const cx = sx / pointsArray.length
  const cy = sy / pointsArray.length

  const pointsStr = pointsArray.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const highlightPoints = pointsArray
    .slice(0, 3)
    .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ')

  return {
    id,
    points: pointsStr,
    highlightPoints,
    centerX: cx,
    centerY: cy,
    flyAngle,
    flyDistance,
    rotationDelta: ((seed * 137) % 540) - 270,
    tumbleX: ((seed * 41) % 360) - 180,
    tumbleY: ((seed * 67) % 360) - 180,
    fallExtra: (seed * 23) % 80,
    fallSpin: ((seed * 53) % 540) - 270,
    delay: (seed % 5) * 0.02,
  }
}

/* ═══════════════════════════════════════════════════════════
   REFORMED BLOCK  (renders title + subtitle from the payload)
   ═══════════════════════════════════════════════════════════ */

function ReformedBlock({
  phase,
  title,
  subtitle,
  tier,
  accentColorOverride,
}: {
  phase: Phase
  title: string
  subtitle: string
  tier: Tier
  accentColorOverride?: string
}) {
  const accentColor = accentColorOverride ?? tier.aura?.color ?? '#00f0ff'
  const accentColor2 = tier.grooveHi || '#ff00ff'
  const isEpic = tier.id >= 10

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${BLOCK.leftXPct}%`,
        top: `${BLOCK.topYPct}%`,
        width: `${BLOCK.widthPct}%`,
        height: `${BLOCK.heightPct}%`,
        zIndex: 7,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      <svg
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="reformedBlockFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.18" />
            <stop offset="50%" stopColor={accentColor2} stopOpacity="0.1" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="394"
          height="194"
          fill="url(#reformedBlockFill)"
          stroke={accentColor}
          strokeWidth="2.5"
          style={{ filter: `drop-shadow(0 0 14px ${accentColor})` }}
        />

        <motion.line
          x1="3"
          x2="397"
          y1="40"
          y2="40"
          stroke={accentColor2}
          strokeWidth="1"
          opacity="0.6"
          animate={{ y1: [40, 160, 40], y2: [40, 160, 40] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />

        {[
          { x: 3, y: 3, dx: 1, dy: 1 },
          { x: 397, y: 3, dx: -1, dy: 1 },
          { x: 3, y: 197, dx: 1, dy: -1 },
          { x: 397, y: 197, dx: -1, dy: -1 },
        ].map((c, i) => (
          <g key={i} stroke={accentColor2} strokeWidth="2.5" fill="none">
            <line x1={c.x} y1={c.y} x2={c.x + c.dx * 18} y2={c.y} />
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + c.dy * 18} />
          </g>
        ))}
      </svg>

      <AnimatePresence>
        {phase === 'text' && (
          <motion.div
            key="message"
            style={{
              position: 'relative',
              zIndex: 1,
              textAlign: 'center',
              padding: '0 1rem',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div
              style={{
                fontSize: '9px',
                color: accentColor2,
                letterSpacing: '0.4em',
                marginBottom: '8px',
                textTransform: 'uppercase',
                fontWeight: 400,
                textShadow: `0 0 10px ${accentColor2}`,
              }}
            >
              {subtitle}
            </div>
            <div
              style={{
                fontSize: 'clamp(18px, 6vw, 30px)',
                fontWeight: isEpic ? 600 : 200,
                color: isEpic ? '#ffffff' : accentColor,
                letterSpacing: '0.12em',
                textShadow: `0 0 20px ${accentColor}, 0 0 40px ${accentColor}80`,
                textTransform: 'uppercase',
                lineHeight: 1.1,
                ...(isEpic && {
                  background: `linear-gradient(90deg, ${accentColor}, ${accentColor2}, ${accentColor})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }),
              }}
            >
              {title}
            </div>
            <motion.div
              style={{
                marginTop: '10px',
                height: '1px',
                background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CYBER GRID
   ═══════════════════════════════════════════════════════════ */

function CyberGrid({ color }: { color?: string }) {
  const c = color || '#00f0ff'
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `linear-gradient(${c}10 1px, transparent 1px), linear-gradient(90deg, ${c}10 1px, transparent 1px)`,
        backgroundSize: '30px 30px',
        maskImage: 'radial-gradient(circle at center, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 30%, transparent 80%)',
        zIndex: 1,
      }}
    />
  )
}
