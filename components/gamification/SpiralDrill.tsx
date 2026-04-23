'use client'

// SpiralDrill — the evolving Core Drill avatar.
// Pure SVG + CSS animations. Props drive rotation speed (resonance), tier
// variant, and an optional green Spiral-Energy pulse when the user has
// logged something in the last 24h.
//
// This iteration ships tiers 1..4. Tiers 5..10 land in Step 3 alongside
// the full palette restyle.

import { useMemo } from 'react'

export interface SpiralDrillProps {
  tier: number           // 1..10 — only 1..4 rendered here; higher tiers fall back to 4
  resonance: number      // 1.00..3.00 — drives rotation speed
  active?: boolean       // pulse green halo if true
  size?: number          // px, default 80
}

function durationFromResonance(resonance: number): number {
  // At x1 resonance: 8s per rotation (calm idle).
  // At x3 resonance: 3s per rotation (visibly energized).
  const clamped = Math.max(1, Math.min(3, resonance))
  return 8 - (clamped - 1) * 2.5
}

export function SpiralDrill({ tier, resonance, active = false, size = 80 }: SpiralDrillProps) {
  const duration = durationFromResonance(resonance)
  const drillTier = Math.min(Math.max(1, tier), 4)

  // Unique IDs so multiple avatars on the page don't collide on SVG defs.
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), [])
  const bodyGrad = `drill-body-${uid}`
  const tipGrad = `drill-tip-${uid}`
  const glowFilter = `drill-glow-${uid}`

  return (
    <div
      className="spiral-drill"
      style={
        {
          '--drill-duration': `${duration}s`,
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      <svg viewBox="-50 -50 100 100" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c7d2fe" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
          <linearGradient id={tipGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <filter id={glowFilter} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Halo ring (static base) */}
        <circle
          cx="0"
          cy="0"
          r="44"
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth="1"
        />

        {/* Active-pulse ring — only animates if `active` */}
        {active && (
          <circle
            cx="0"
            cy="0"
            r="42"
            fill="none"
            stroke="rgb(34, 197, 94)"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            className="spiral-drill-pulse"
          />
        )}

        {/* Rotating group */}
        <g className="spiral-drill-spin" filter={`url(#${glowFilter})`}>
          {drillTier === 1 && <Tier1 bodyGrad={bodyGrad} tipGrad={tipGrad} />}
          {drillTier === 2 && <Tier2 bodyGrad={bodyGrad} tipGrad={tipGrad} />}
          {drillTier === 3 && <Tier3 bodyGrad={bodyGrad} tipGrad={tipGrad} />}
          {drillTier === 4 && <Tier4 bodyGrad={bodyGrad} tipGrad={tipGrad} />}
        </g>
      </svg>

      <style jsx>{`
        .spiral-drill {
          position: relative;
          display: inline-block;
        }
        .spiral-drill :global(.spiral-drill-spin) {
          transform-origin: 0px 0px;
          transform-box: fill-box;
          animation: spiral-drill-rotate var(--drill-duration) linear infinite;
        }
        .spiral-drill :global(.spiral-drill-pulse) {
          transform-origin: 0px 0px;
          transform-box: fill-box;
          animation: spiral-drill-halo 2.2s ease-in-out infinite;
        }
        @keyframes spiral-drill-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes spiral-drill-halo {
          0%,
          100% {
            stroke-opacity: 0.25;
            transform: scale(0.96);
          }
          50% {
            stroke-opacity: 0.75;
            transform: scale(1.04);
          }
        }
      `}</style>
    </div>
  )
}

// ── Tier variants ───────────────────────────────────────────────────────────
// Viewbox is -50..50 on both axes. The drill points UP (tip at y=-40) so
// rotation makes visual sense as "spinning around its axis".

interface TierProps {
  bodyGrad: string
  tipGrad: string
}

function Tier1({ bodyGrad, tipGrad }: TierProps) {
  return (
    <g>
      {/* Simple conical tip */}
      <path d="M 0 -35 L 10 0 L -10 0 Z" fill={`url(#${tipGrad})`} />
      {/* Short body */}
      <rect x="-8" y="0" width="16" height="12" rx="1" fill={`url(#${bodyGrad})`} />
      {/* Spiral line hint */}
      <path d="M -6 3 Q 0 0 6 3" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" fill="none" />
    </g>
  )
}

function Tier2({ bodyGrad, tipGrad }: TierProps) {
  return (
    <g>
      <path d="M 0 -38 L 12 2 L -12 2 Z" fill={`url(#${tipGrad})`} />
      <rect x="-10" y="2" width="20" height="14" rx="1.5" fill={`url(#${bodyGrad})`} />
      {/* Three flutes */}
      <path
        d="M -10 6 Q 0 3 10 6 M -10 10 Q 0 7 10 10 M -10 14 Q 0 11 10 14"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="0.8"
        fill="none"
      />
      {/* Collar */}
      <rect x="-11" y="15" width="22" height="2" fill="#475569" />
    </g>
  )
}

function Tier3({ bodyGrad, tipGrad }: TierProps) {
  return (
    <g>
      {/* Sharper tip */}
      <path d="M 0 -42 L 14 4 L -14 4 Z" fill={`url(#${tipGrad})`} />
      <path
        d="M 0 -42 L 0 4"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="0.5"
      />
      {/* Body */}
      <rect x="-12" y="4" width="24" height="18" rx="2" fill={`url(#${bodyGrad})`} />
      {/* Deeper spiral flutes */}
      <path
        d="M -12 8 Q 0 5 12 8 M -12 13 Q 0 10 12 13 M -12 18 Q 0 15 12 18"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
        fill="none"
      />
      {/* Base collar with rivets */}
      <rect x="-13" y="20" width="26" height="3" fill="#334155" />
      <circle cx="-9" cy="21.5" r="0.8" fill="#f1f5f9" />
      <circle cx="0" cy="21.5" r="0.8" fill="#f1f5f9" />
      <circle cx="9" cy="21.5" r="0.8" fill="#f1f5f9" />
    </g>
  )
}

function Tier4({ bodyGrad, tipGrad }: TierProps) {
  return (
    <g>
      <path d="M 0 -46 L 16 6 L -16 6 Z" fill={`url(#${tipGrad})`} />
      <path
        d="M 0 -46 L 0 6"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.6"
      />
      {/* Tip inner highlight */}
      <path d="M 0 -40 L 6 2 L -6 2 Z" fill="rgba(255,255,255,0.15)" />
      {/* Body with mechanical segments */}
      <rect x="-14" y="6" width="28" height="8" rx="2" fill={`url(#${bodyGrad})`} />
      <rect x="-14" y="14" width="28" height="2" fill="#1e293b" />
      <rect x="-14" y="16" width="28" height="8" rx="2" fill={`url(#${bodyGrad})`} />
      {/* Deep spiral grooves */}
      <path
        d="M -14 9 Q 0 6 14 9 M -14 19 Q 0 16 14 19"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1"
        fill="none"
      />
      {/* Reinforced collar + rivets */}
      <rect x="-16" y="22" width="32" height="4" fill="#1e293b" />
      <circle cx="-12" cy="24" r="1" fill="#fbbf24" />
      <circle cx="-4" cy="24" r="1" fill="#fbbf24" />
      <circle cx="4" cy="24" r="1" fill="#fbbf24" />
      <circle cx="12" cy="24" r="1" fill="#fbbf24" />
    </g>
  )
}
