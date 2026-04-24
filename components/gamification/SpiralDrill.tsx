'use client'

/**
 * SpiralDrill — Gurren Lagann × Kill la Kill (v7, fixed)
 * 11 TIER di escalation distribuiti fino a Lv 200.
 * T11 = Super Tengen Toppa Gurren Lagann.
 *
 * Driven solely by the `level` prop. The tier is derived from `level` via
 * `getTier`; no internal state.
 */

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
  labelColor: string
}

const TIERS: Tier[] = [
  { id: 1, minLevel: 1, label: "Lo Scavabuchi",
    bodyGrad: "steel", grooveBase: "#0a0a0a", grooveMid: "#6a6a6a", grooveHi: "#f0f0f0",
    rim: "#2b2b2b", tipGlow: null, speed: 0.6,
    aura: null, crossStars: 0, particles: 0, rays: 0,
    shockRing: false, lightning: false, cosmic: false, megaForm: false,
    shadowColor: null, labelColor: "text-zinc-400",
  },
  { id: 2, minLevel: 10, label: "Ereditiere della Volontà",
    bodyGrad: "steel-bright", grooveBase: "#0a0a0a", grooveMid: "#8a8a8a", grooveHi: "#ffffff",
    rim: "#3a3a3a", tipGlow: "#d0e8ff", speed: 0.55,
    aura: { color: "#c8d8f0", opacity: 0.25, size: 1.05 },
    crossStars: 0, particles: 0, rays: 0,
    shockRing: false, lightning: false, cosmic: false, megaForm: false,
    shadowColor: null, labelColor: "text-slate-300",
  },
  { id: 3, minLevel: 25, label: "Membro della Brigata Dai-Gurren",
    bodyGrad: "bronze", grooveBase: "#3a1e00", grooveMid: "#c07820", grooveHi: "#ffd080",
    rim: "#5a2f08", tipGlow: "#ffa040", speed: 0.5,
    aura: { color: "#ff9040", opacity: 0.35, size: 1.12 },
    crossStars: 1, particles: 3, rays: 0,
    shockRing: false, lightning: false, cosmic: false, megaForm: false,
    shadowColor: "rgba(255, 144, 64, 0.45)", labelColor: "text-orange-400",
  },
  { id: 4, minLevel: 45, label: "Leader della Resistenza",
    bodyGrad: "gold", grooveBase: "#6b4a00", grooveMid: "#d4a017", grooveHi: "#fff4a3",
    rim: "#8b6508", tipGlow: "#fff080", speed: 0.45,
    aura: { color: "#ffcc40", opacity: 0.45, size: 1.18 },
    crossStars: 2, particles: 6, rays: 4,
    shockRing: false, lightning: false, cosmic: false, megaForm: false,
    shadowColor: "rgba(255, 204, 64, 0.6)", labelColor: "text-amber-400",
  },
  { id: 5, minLevel: 65, label: "Spirito Indomabile",
    bodyGrad: "crimson-gold", grooveBase: "#4a0a00", grooveMid: "#e04010", grooveHi: "#ffd060",
    rim: "#8b0508", tipGlow: "#ff6020", speed: 0.38,
    aura: { color: "#ff4020", opacity: 0.55, size: 1.25 },
    crossStars: 4, particles: 10, rays: 6,
    shockRing: true, lightning: false, cosmic: false, megaForm: false,
    shadowColor: "rgba(255, 64, 32, 0.65)", labelColor: "text-red-400",
  },
  { id: 6, minLevel: 85, label: "Perforatore dei Cieli",
    bodyGrad: "inferno", grooveBase: "#2a0000", grooveMid: "#ff1020", grooveHi: "#ffe040",
    rim: "#5a0008", tipGlow: "#ff2000", speed: 0.32,
    aura: { color: "#ff1040", opacity: 0.65, size: 1.32 },
    crossStars: 6, particles: 14, rays: 8,
    shockRing: true, lightning: false, cosmic: false, megaForm: false,
    shadowColor: "rgba(255, 32, 0, 0.75)", labelColor: "text-red-500",
  },
  { id: 7, minLevel: 95, label: "Eroe della Galassia",
    bodyGrad: "violet", grooveBase: "#1a0030", grooveMid: "#c020ff", grooveHi: "#ffa0ff",
    rim: "#3a0050", tipGlow: "#ff40ff", speed: 0.28,
    aura: { color: "#d040ff", opacity: 0.7, size: 1.4 },
    crossStars: 7, particles: 18, rays: 10,
    shockRing: true, lightning: false, cosmic: false, megaForm: false,
    shadowColor: "rgba(208, 64, 255, 0.8)", labelColor: "text-fuchsia-400",
  },
  { id: 8, minLevel: 100, label: "Massa Critica",
    bodyGrad: "lightning", grooveBase: "#001830", grooveMid: "#00d0ff", grooveHi: "#e0ffff",
    rim: "#003050", tipGlow: "#00ffff", speed: 0.22,
    aura: { color: "#00d0ff", opacity: 0.8, size: 1.48 },
    crossStars: 8, particles: 22, rays: 12,
    shockRing: true, lightning: true, cosmic: false, megaForm: false,
    shadowColor: "rgba(0, 208, 255, 0.9)", labelColor: "text-cyan-300",
  },
  { id: 9, minLevel: 125, label: "Signore della Spirale",
    bodyGrad: "white-hot", grooveBase: "#402020", grooveMid: "#ffffff", grooveHi: "#ffffff",
    rim: "#606060", tipGlow: "#ffffff", speed: 0.16,
    aura: { color: "#ffffff", opacity: 0.95, size: 1.58 },
    crossStars: 10, particles: 28, rays: 16,
    shockRing: true, lightning: true, cosmic: false, megaForm: false,
    shadowColor: "rgba(255, 255, 255, 1)", labelColor: "text-white",
  },
  { id: 10, minLevel: 175, label: "Tengen Toppa",
    bodyGrad: "cosmic", grooveBase: "#000020", grooveMid: "#ff00ff", grooveHi: "#ffff00",
    rim: "#4000a0", tipGlow: "#ffffff", speed: 0.1,
    aura: { color: "#ff00ff", opacity: 1, size: 1.7 },
    crossStars: 12, particles: 40, rays: 20,
    shockRing: true, lightning: true, cosmic: true, megaForm: false,
    shadowColor: "rgba(255, 0, 255, 1)",
    labelColor: "text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-yellow-300 to-cyan-400",
  },
  { id: 11, minLevel: 200, label: "Super Tengen Toppa Gurren Lagann",
    bodyGrad: "galaxy", grooveBase: "#ffffff", grooveMid: "#ffffff", grooveHi: "#ffffff",
    rim: "#ffffff", tipGlow: "#ffffff", speed: 0.06,
    aura: { color: "#ffffff", opacity: 1, size: 2.0 },
    crossStars: 16, particles: 60, rays: 32,
    shockRing: true, lightning: true, cosmic: true, megaForm: true,
    shadowColor: "rgba(255, 255, 255, 1)",
    labelColor: "text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-white to-yellow-200",
  },
]

function getTier(level: number): Tier {
  let t = TIERS[0]
  for (const tier of TIERS) if (level >= tier.minLevel) t = tier
  return t
}

// ─── Sotto-componenti ────────────────────────────────────────────────────────

interface CrossStarProps {
  cx: number
  cy: number
  size: number
  color: string
  delay?: number
  duration?: number
}

function CrossStar({ cx, cy, size, color, delay = 0, duration = 2 }: CrossStarProps) {
  const s = size
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      style={{
        animation: `cross-twinkle ${duration}s ease-in-out ${delay}s infinite`,
        transformOrigin: `${cx}px ${cy}px`,
      }}
    >
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

interface ParticlesProps {
  count: number
  color: string
  cxCenter?: number
  cyCenter?: number
  radius?: number
}

function Particles({ count, color, cxCenter = 100, cyCenter = 160, radius = 120 }: ParticlesProps) {
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const seed = ((i * 9301 + 49297) % 233280) / 233280 // pseudo-random deterministico
        const r = radius * (0.7 + seed * 0.4)
        const x = cxCenter + Math.cos(angle) * r
        const y = cyCenter + Math.sin(angle) * r * 0.9
        const delay = (i / count) * 2
        const size = 1 + seed * 2
        return (
          <circle
            key={i}
            cx={x} cy={y} r={size}
            fill={color}
            style={{ animation: `particle-float 2.4s ease-in-out ${delay}s infinite` }}
          />
        )
      })}
    </g>
  )
}

interface KineticRaysProps {
  count: number
  color: string
  cxCenter?: number
  cyCenter?: number
  length?: number
}

function KineticRays({ count, color, cxCenter = 100, cyCenter = 160, length = 40 }: KineticRaysProps) {
  return (
    <g className="kinetic-rotate" style={{ transformOrigin: `${cxCenter}px ${cyCenter}px` }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360
        return (
          <line
            key={i}
            x1={cxCenter} y1={cyCenter - 140}
            x2={cxCenter} y2={cyCenter - 140 - length}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.8"
            transform={`rotate(${angle} ${cxCenter} ${cyCenter})`}
            style={{ animation: `ray-pulse 1.2s ease-in-out ${(i / count) * 0.8}s infinite` }}
          />
        )
      })}
    </g>
  )
}

interface ShockRingProps {
  color: string
  cxCenter?: number
  cyCenter?: number
}

function ShockRing({ color, cxCenter = 100, cyCenter = 160 }: ShockRingProps) {
  return (
    <circle
      cx={cxCenter} cy={cyCenter} r="100"
      fill="none"
      stroke={color}
      strokeWidth="2"
      opacity="0.6"
      style={{ animation: "shock-expand 1.8s ease-out infinite" }}
    />
  )
}

function Lightning({ color }: { color: string }) {
  const bolts = [
    "M 100 30 L 80 60 L 110 80 L 85 120 L 120 150",
    "M 100 30 L 125 65 L 95 90 L 130 130 L 105 170",
    "M 100 30 L 70 50 L 100 85 L 75 110 L 95 150",
  ]
  return (
    <g style={{ animation: "lightning-flicker 0.15s steps(2) infinite" }}>
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

function CosmicBackground() {
  // posizioni deterministiche per stelle
  const stars = Array.from({ length: 25 }).map((_, i) => {
    const s1 = ((i * 7919) % 200)
    const s2 = ((i * 6571) % 320)
    const s3 = ((i * 4127) % 100) / 100
    return { x: s1, y: s2, r: 0.5 + s3 * 1.5, op: 0.3 + s3 * 0.7, delay: s3 * 2 }
  })
  return (
    <g>
      <g style={{ transformOrigin: "100px 160px", animation: "cosmic-spin 8s linear infinite" }}>
        <ellipse cx="100" cy="160" rx="160" ry="30" fill="url(#galaxyGrad)" opacity="0.6" />
        <ellipse cx="100" cy="160" rx="140" ry="20" fill="url(#galaxyGrad)" opacity="0.5" transform="rotate(30 100 160)" />
        <ellipse cx="100" cy="160" rx="150" ry="25" fill="url(#galaxyGrad)" opacity="0.4" transform="rotate(-45 100 160)" />
      </g>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x} cy={s.y} r={s.r}
          fill="white"
          opacity={s.op}
          style={{ animation: `star-twinkle ${1 + (i % 3) * 0.6}s ease-in-out ${s.delay}s infinite` }}
        />
      ))}
    </g>
  )
}

function GalaxyGears() {
  const galaxies = [
    { cx: -10, cy: 50, r: 22, dur: 12, color: "#ffcc40", reverse: false },
    { cx: 210, cy: 80, r: 18, dur: 9, color: "#ff40ff", reverse: true },
    { cx: -30, cy: 200, r: 26, dur: 14, color: "#40a0ff", reverse: false },
    { cx: 230, cy: 220, r: 20, dur: 11, color: "#ff6040", reverse: true },
    { cx: 100, cy: -30, r: 24, dur: 10, color: "#ffffff", reverse: false },
    { cx: -20, cy: 310, r: 16, dur: 8, color: "#a0ff40", reverse: true },
  ]
  return (
    <g>
      {galaxies.map((g, i) => (
        <g
          key={i}
          style={{
            transformOrigin: `${g.cx}px ${g.cy}px`,
            animation: `galaxy-spin ${g.dur}s linear infinite${g.reverse ? " reverse" : ""}`,
          }}
        >
          <ellipse cx={g.cx} cy={g.cy} rx={g.r} ry={g.r * 0.35} fill={g.color} opacity="0.5" />
          <ellipse cx={g.cx} cy={g.cy} rx={g.r * 0.85} ry={g.r * 0.25} fill={g.color} opacity="0.7" transform={`rotate(30 ${g.cx} ${g.cy})`} />
          <ellipse cx={g.cx} cy={g.cy} rx={g.r * 0.7} ry={g.r * 0.2} fill="white" opacity="0.6" transform={`rotate(-45 ${g.cx} ${g.cy})`} />
          <circle cx={g.cx} cy={g.cy} r={g.r * 0.2} fill="white" />
          <circle cx={g.cx} cy={g.cy} r={g.r * 0.4} fill={g.color} opacity="0.4" />
        </g>
      ))}
    </g>
  )
}

function MegaCross() {
  return (
    <g style={{ transformOrigin: "100px 160px", animation: "mega-cross-pulse 2.4s ease-in-out infinite" }}>
      <rect x="-80" y="150" width="360" height="20" fill="url(#megaCrossGrad)" opacity="0.8" />
      <rect x="90" y="-60" width="20" height="440" fill="url(#megaCrossGrad)" opacity="0.8" />
      <circle cx="100" cy="160" r="30" fill="white" opacity="0.9" />
      <circle cx="100" cy="160" r="60" fill="url(#megaCrossGrad)" opacity="0.6" />
    </g>
  )
}

function GalaxyBelt() {
  const count = 24
  return (
    <g style={{ transformOrigin: "100px 160px", animation: "galaxy-belt-spin 20s linear infinite" }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const r = 170
        const x = 100 + Math.cos(angle) * r
        const y = 160 + Math.sin(angle) * r * 0.95
        const size = 1.5 + (i % 3)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={size * 2} fill="#ffcc40" opacity="0.3" />
            <circle cx={x} cy={y} r={size} fill="white" />
          </g>
        )
      })}
    </g>
  )
}

function SpaceDistortion() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <ellipse
          key={i}
          cx="100" cy="160"
          rx={80 + i * 25}
          ry={140 + i * 20}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.5"
          opacity={0.3 - i * 0.05}
          style={{
            animation: `distortion-wave 3s ease-in-out ${i * 0.3}s infinite`,
            transformOrigin: "100px 160px",
          }}
        />
      ))}
    </g>
  )
}

// ─── Principale ──────────────────────────────────────────────────────────────

interface SpiralDrillProps {
  level?: number
}

export function SpiralDrill({ level = 1 }: SpiralDrillProps) {
  const tier = getTier(level)

  const TIP_Y = 20
  const BASE_Y = 300
  const BASE_HALF_WIDTH = 78
  const CX = 100

  const bodyGradientId = `bodyGrad_${tier.bodyGrad}`
  const bodyFill = `url(#${bodyGradientId})`

  const buildStrands = () => {
    const turns = 14
    const totalHeight = BASE_Y - TIP_Y
    const step = totalHeight / turns
    const strands: string[] = []
    for (let i = 0; i < turns; i++) {
      const yTop = TIP_Y + i * step
      const yBot = yTop + step
      const wTop = ((yTop - TIP_Y) / totalHeight) * BASE_HALF_WIDTH
      const wBot = ((yBot - TIP_Y) / totalHeight) * BASE_HALF_WIDTH
      strands.push(`M ${CX - wTop} ${yTop} L ${CX + wBot} ${yBot}`)
    }
    return strands
  }
  const strands = buildStrands()

  const crossStarPositions = [
    { cx: 40, cy: 60, size: 12, delay: 0 },
    { cx: 170, cy: 90, size: 10, delay: 0.4 },
    { cx: 25, cy: 180, size: 14, delay: 0.8 },
    { cx: 175, cy: 220, size: 11, delay: 0.2 },
    { cx: 60, cy: 280, size: 13, delay: 0.6 },
    { cx: 155, cy: 45, size: 9, delay: 1.0 },
    { cx: 45, cy: 130, size: 8, delay: 1.2 },
    { cx: 180, cy: 160, size: 12, delay: 0.3 },
    { cx: 20, cy: 240, size: 10, delay: 0.9 },
    { cx: 165, cy: 270, size: 11, delay: 0.5 },
    { cx: 100, cy: 0, size: 16, delay: 0.1 },
    { cx: 10, cy: 100, size: 9, delay: 1.3 },
    { cx: 220, cy: 140, size: 14, delay: 0.7 },
    { cx: -10, cy: 60, size: 12, delay: 0.15 },
    { cx: 215, cy: 300, size: 15, delay: 1.1 },
    { cx: 130, cy: -20, size: 13, delay: 0.55 },
  ].slice(0, tier.crossStars)

  const dropShadow = tier.shadowColor
    ? tier.megaForm
      ? `drop-shadow(0 0 10px ${tier.shadowColor}) drop-shadow(0 0 30px ${tier.shadowColor}) drop-shadow(0 0 60px #ffcc40)`
      : `drop-shadow(0 0 6px ${tier.shadowColor}) drop-shadow(0 0 18px ${tier.shadowColor})`
    : "none"

  // Inietto la velocità delle strand via blocco <style> scoped, non via custom prop
  const strandStyle = `
    .strand-main-${tier.id} { animation: strand-flow ${tier.speed}s linear infinite; }
    .strand-hl-${tier.id}   { animation: strand-flow-fast ${tier.speed}s linear infinite; }
  `

  const tiltClass = tier.megaForm
    ? "drill-tilt-mega"
    : tier.id >= 9
    ? "drill-tilt-shake"
    : "drill-tilt"

  const containerBg = tier.megaForm
    ? `radial-gradient(circle at 30% 30%, rgba(255,204,64,0.25) 0%, transparent 40%),
       radial-gradient(circle at 70% 70%, rgba(255,64,255,0.25) 0%, transparent 40%),
       radial-gradient(circle at 50% 50%, rgba(64,160,255,0.15) 0%, transparent 60%),
       linear-gradient(180deg, #000015 0%, #1a0030 50%, #000015 100%)`
    : tier.aura
    ? `radial-gradient(circle at 50% 75%, ${tier.aura.color}20 0%, transparent 60%)`
    : "transparent"

  return (
    <>
      <style>{`
        @keyframes strand-flow {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -36; }
        }
        @keyframes strand-flow-fast {
          from { stroke-dashoffset: -18; }
          to   { stroke-dashoffset: -54; }
        }
        @keyframes shine-pulse {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 0.55; }
        }
        @keyframes aura-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.08); opacity: 0.7; }
        }
        @keyframes cross-twinkle {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        @keyframes particle-float {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50%      { opacity: 1; transform: scale(1.2); }
        }
        @keyframes ray-pulse {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 0.9; }
        }
        @keyframes shock-expand {
          0%   { r: 40; opacity: 0.8; stroke-width: 4; }
          100% { r: 130; opacity: 0; stroke-width: 1; }
        }
        @keyframes lightning-flicker {
          0%, 100% { opacity: 0; }
          50%      { opacity: 1; }
        }
        @keyframes cosmic-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 1; }
        }
        @keyframes chromatic-shake {
          0%, 100% { transform: translate(0, 0) rotate(30deg); }
          25%      { transform: translate(-1px, 0.5px) rotate(30deg); }
          50%      { transform: translate(1px, -0.5px) rotate(30deg); }
          75%      { transform: translate(-0.5px, 1px) rotate(30deg); }
        }
        @keyframes kinetic-rotate-kf {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .kinetic-rotate {
          animation: kinetic-rotate-kf 3s linear infinite;
        }
        @keyframes galaxy-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes galaxy-belt-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes mega-cross-pulse {
          0%, 100% { opacity: 0.8; transform: scale(1) rotate(0deg); }
          50%      { opacity: 1; transform: scale(1.05) rotate(2deg); }
        }
        @keyframes distortion-wave {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50%      { transform: scale(1.05); opacity: 0.05; }
        }
        @keyframes mega-tilt-shake {
          0%, 100% { transform: translate(0, 0) rotate(30deg) scale(1); }
          20%      { transform: translate(-1.5px, 0.8px) rotate(30.3deg) scale(1.01); }
          40%      { transform: translate(1.2px, -0.6px) rotate(29.7deg) scale(1); }
          60%      { transform: translate(-0.8px, 1.2px) rotate(30.2deg) scale(1.015); }
          80%      { transform: translate(1px, 0.5px) rotate(29.8deg) scale(1); }
        }
        @keyframes bg-drift {
          0%, 100% { background-position: 0% 50%, 100% 50%, 50% 0%, 0 0; }
          50%      { background-position: 100% 50%, 0% 50%, 50% 100%, 0 0; }
        }
        .spiral-shine { animation: shine-pulse 1.8s ease-in-out infinite; }
        .aura-node { animation: aura-pulse 2.2s ease-in-out infinite; transform-origin: center; }
        /* Pivot moved from center-bottom to center so the 30deg tilt rotates
         * around the SVG geometric middle — the bottom pivot drifted mass
         * to the upper-right and broke justify-center in the parent. */
        .drill-tilt {
          transform: rotate(30deg);
          transform-origin: center;
        }
        .drill-tilt-shake {
          animation: chromatic-shake 0.08s steps(2) infinite;
          transform-origin: center;
        }
        .drill-tilt-mega {
          animation: mega-tilt-shake 0.2s ease-in-out infinite;
          transform-origin: center;
        }
        ${strandStyle}
      `}</style>

      <div
        className="h-[30rem] w-full flex items-center justify-center relative rounded-xl overflow-hidden"
        style={{
          background: containerBg,
          backgroundSize: tier.megaForm ? "200% 200%, 200% 200%, 200% 200%, 100% 100%" : "auto",
          animation: tier.megaForm ? "bg-drift 8s ease-in-out infinite" : "none",
        }}
      >
        <svg
          viewBox="-60 -60 320 440"
          className={`w-96 h-auto ${tiltClass}`}
          style={{ filter: dropShadow }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="bodyGrad_steel" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3a3a3a" /><stop offset="30%" stopColor="#b8b8b8" />
              <stop offset="50%" stopColor="#f0f0f0" /><stop offset="70%" stopColor="#9a9a9a" />
              <stop offset="100%" stopColor="#252525" />
            </linearGradient>
            <linearGradient id="bodyGrad_steel-bright" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4a5566" /><stop offset="30%" stopColor="#d0ddee" />
              <stop offset="50%" stopColor="#ffffff" /><stop offset="70%" stopColor="#a8b5c6" />
              <stop offset="100%" stopColor="#2a3540" />
            </linearGradient>
            <linearGradient id="bodyGrad_bronze" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3a1e00" /><stop offset="30%" stopColor="#a86018" />
              <stop offset="50%" stopColor="#ffc070" /><stop offset="70%" stopColor="#8a4810" />
              <stop offset="100%" stopColor="#2a1000" />
            </linearGradient>
            <linearGradient id="bodyGrad_gold" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5a3f00" /><stop offset="30%" stopColor="#c99511" />
              <stop offset="50%" stopColor="#fff3b0" /><stop offset="70%" stopColor="#c99511" />
              <stop offset="100%" stopColor="#3a2800" />
            </linearGradient>
            <linearGradient id="bodyGrad_crimson-gold" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3a0000" /><stop offset="30%" stopColor="#d03010" />
              <stop offset="50%" stopColor="#ffd060" /><stop offset="70%" stopColor="#a02008" />
              <stop offset="100%" stopColor="#2a0000" />
            </linearGradient>
            <linearGradient id="bodyGrad_inferno" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2a0000" /><stop offset="30%" stopColor="#d01020" />
              <stop offset="50%" stopColor="#ffe040" /><stop offset="70%" stopColor="#b00818" />
              <stop offset="100%" stopColor="#1a0000" />
            </linearGradient>
            <linearGradient id="bodyGrad_violet" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1a0030" /><stop offset="30%" stopColor="#8020c0" />
              <stop offset="50%" stopColor="#ffa0ff" /><stop offset="70%" stopColor="#6010a0" />
              <stop offset="100%" stopColor="#10001a" />
            </linearGradient>
            <linearGradient id="bodyGrad_lightning" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#001830" /><stop offset="30%" stopColor="#00a0d0" />
              <stop offset="50%" stopColor="#e0ffff" /><stop offset="70%" stopColor="#0080b0" />
              <stop offset="100%" stopColor="#000a1a" />
            </linearGradient>
            <linearGradient id="bodyGrad_white-hot" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#606060" /><stop offset="30%" stopColor="#f0f0f0" />
              <stop offset="50%" stopColor="#ffffff" /><stop offset="70%" stopColor="#e0e0e0" />
              <stop offset="100%" stopColor="#505050" />
            </linearGradient>
            <linearGradient id="bodyGrad_cosmic" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#200040" /><stop offset="25%" stopColor="#ff00ff" />
              <stop offset="50%" stopColor="#ffff00" /><stop offset="75%" stopColor="#00ffff" />
              <stop offset="100%" stopColor="#200040" />
            </linearGradient>
            <linearGradient id="bodyGrad_galaxy" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000020" />
              <stop offset="20%" stopColor="#ff00ff" />
              <stop offset="40%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#ffff80" />
              <stop offset="60%" stopColor="#ffffff" />
              <stop offset="80%" stopColor="#00ffff" />
              <stop offset="100%" stopColor="#200040" />
            </linearGradient>

            <linearGradient id="galaxyGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="#ff00ff" stopOpacity="0.7" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>

            <radialGradient id="megaCrossGrad">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="30%" stopColor="#fff080" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#ffcc40" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffcc40" stopOpacity="0" />
            </radialGradient>

            <clipPath id="drillCone">
              <path d={`M ${CX} ${TIP_Y} L ${CX + BASE_HALF_WIDTH} ${BASE_Y} L ${CX - BASE_HALF_WIDTH} ${BASE_Y} Z`} />
            </clipPath>

            <linearGradient id="shineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="40%" stopColor="white" stopOpacity="0.9" />
              <stop offset="60%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>

            {tier.aura && (
              <radialGradient id="auraGrad">
                <stop offset="0%" stopColor={tier.aura.color} stopOpacity={tier.aura.opacity} />
                <stop offset="50%" stopColor={tier.aura.color} stopOpacity={tier.aura.opacity * 0.4} />
                <stop offset="100%" stopColor={tier.aura.color} stopOpacity="0" />
              </radialGradient>
            )}
          </defs>

          {/* Sfondi esclusivi tier alti */}
          {tier.megaForm && (
            <>
              <MegaCross />
              <SpaceDistortion />
              <GalaxyBelt />
              <GalaxyGears />
            </>
          )}
          {tier.cosmic && !tier.megaForm && <CosmicBackground />}

          {/* Aura */}
          {tier.aura && (
            <ellipse
              className="aura-node"
              cx={CX} cy="160"
              rx={100 * tier.aura.size}
              ry={180 * tier.aura.size}
              fill="url(#auraGrad)"
              opacity={tier.aura.opacity}
            />
          )}

          {tier.rays > 0 && (
            <KineticRays
              count={tier.rays}
              color={tier.aura ? tier.aura.color : "#ffffff"}
              length={tier.megaForm ? 70 : 40}
            />
          )}
          {tier.shockRing && tier.aura && <ShockRing color={tier.aura.color} />}
          {tier.lightning && tier.aura && <Lightning color={tier.aura.color} />}
          {tier.particles > 0 && <Particles count={tier.particles} color={tier.grooveHi} />}

          {/* Trivella */}
          <ellipse cx={CX} cy={BASE_Y} rx={BASE_HALF_WIDTH} ry="14" fill={tier.rim} />
          <ellipse cx={CX} cy={BASE_Y - 2} rx={BASE_HALF_WIDTH} ry="12" fill={bodyFill} />
          <path
            d={`M ${CX} ${TIP_Y} L ${CX + BASE_HALF_WIDTH} ${BASE_Y} L ${CX - BASE_HALF_WIDTH} ${BASE_Y} Z`}
            fill={bodyFill}
            stroke={tier.rim}
            strokeWidth="1.5"
          />

          <g clipPath="url(#drillCone)">
            {strands.map((d, i) => (
              <g key={i}>
                <path d={d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="7" strokeLinecap="round" transform="translate(0 2.5)" />
                <path d={d} fill="none" stroke={tier.grooveBase} strokeWidth="6" strokeLinecap="round" />
                <path d={d} fill="none" stroke={tier.grooveMid} strokeWidth="5" strokeLinecap="round" strokeDasharray="30 6" className={`strand-main-${tier.id}`} />
                <path d={d} fill="none" stroke={tier.grooveHi} strokeWidth="2" strokeLinecap="round" strokeDasharray="20 16" className={`strand-hl-${tier.id}`} opacity="0.9" />
              </g>
            ))}
            <rect x="55" y="0" width="35" height="320" fill="url(#shineGrad)" className="spiral-shine" style={{ mixBlendMode: "screen" }} />
          </g>

          <path
            d={`M ${CX} ${TIP_Y} L ${CX + BASE_HALF_WIDTH} ${BASE_Y} L ${CX + 30} ${BASE_Y} Z`}
            fill="black"
            opacity={tier.id >= 9 ? 0.1 : 0.3}
            pointerEvents="none"
          />

          {tier.tipGlow && (
            <>
              <circle cx={CX} cy={TIP_Y} r={tier.megaForm ? 20 : tier.id >= 7 ? 14 : 10} fill={tier.tipGlow} opacity="0.9">
                <animate
                  attributeName="r"
                  values={tier.megaForm ? "15;28;15" : tier.id >= 7 ? "10;20;10" : "8;14;8"}
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <circle cx={CX} cy={TIP_Y} r="4" fill="white" />
              {tier.id >= 8 && (
                <ellipse
                  cx={CX}
                  cy={TIP_Y - (tier.megaForm ? 40 : 20)}
                  rx={tier.megaForm ? 10 : 6}
                  ry={tier.megaForm ? 50 : 25}
                  fill={tier.tipGlow}
                  opacity="0.6"
                >
                  <animate
                    attributeName="ry"
                    values={tier.megaForm ? "40;70;40" : "20;35;20"}
                    dur="0.8s"
                    repeatCount="indefinite"
                  />
                </ellipse>
              )}
              {tier.megaForm && (
                <>
                  <ellipse cx={CX} cy={TIP_Y - 80} rx="4" ry="80" fill="white" opacity="0.7">
                    <animate attributeName="ry" values="60;100;60" dur="1s" repeatCount="indefinite" />
                  </ellipse>
                  <CrossStar cx={CX} cy={TIP_Y - 30} size={22} color="#fff080" delay={0} duration={1.2} />
                </>
              )}
            </>
          )}

          <path
            d={`M ${CX} ${TIP_Y} L ${CX - BASE_HALF_WIDTH} ${BASE_Y}`}
            fill="none"
            stroke={tier.grooveHi}
            strokeWidth="1.2"
            opacity="0.6"
          />

          {crossStarPositions.map((star, i) => (
            <CrossStar
              key={i}
              cx={star.cx}
              cy={star.cy}
              size={star.size * (tier.megaForm ? 1.3 : 1)}
              color={tier.megaForm ? "#fff080" : tier.grooveHi}
              delay={star.delay}
              duration={1.8 + (i % 3) * 0.3}
            />
          ))}
        </svg>
      </div>
    </>
  )
}
