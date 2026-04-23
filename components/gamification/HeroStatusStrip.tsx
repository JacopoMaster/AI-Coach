'use client'

// Hero Status Strip — the top-of-dashboard card that anchors the whole
// gamification layer. Shows: tier title, level, EXP bar + progress,
// three stat indicators (Forza/Resistenza/Agilità), resonance multiplier,
// and the rotating Core Drill avatar.
//
// Midnight Arcade palette: ink-black base, thin borders, JetBrains Mono
// for numerics, per-stat accent glow (crimson / cyan / gold).

import Link from 'next/link'
import { Umbrella } from 'lucide-react'
import { useSpiralState } from '@/hooks/use-spiral-state'
import { SpiralDrill } from './SpiralDrill'

const STAT_CONFIG = [
  {
    key: 'forza' as const,
    label: 'FOR',
    fullLabel: 'Forza',
    accent: 'rgb(239, 68, 68)', // crimson
    accentBg: 'rgba(239, 68, 68, 0.12)',
  },
  {
    key: 'resistenza' as const,
    label: 'RES',
    fullLabel: 'Resistenza',
    accent: 'rgb(34, 211, 238)', // cyan
    accentBg: 'rgba(34, 211, 238, 0.12)',
  },
  {
    key: 'agilita' as const,
    label: 'AGI',
    fullLabel: 'Agilità',
    accent: 'rgb(250, 204, 21)', // gold
    accentBg: 'rgba(250, 204, 21, 0.12)',
  },
]

/** Compact "2.4K" formatter for stat totals that can climb high. */
function compactNum(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  if (n < 1_000_000) return Math.floor(n / 1000) + 'K'
  return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
}

export function HeroStatusStrip() {
  const { data, isLoading } = useSpiralState()

  if (isLoading || !data) {
    return <HeroStatusSkeleton />
  }

  const { user_stats, title, tier, progress, exp_for_next_level, stat_totals, on_vacation, active_recent_24h } = data
  const level = user_stats?.level ?? 1
  const expTotal = Number(user_stats?.exp_total ?? 0)
  const resonance = Number(user_stats?.resonance_mult ?? 1)
  const streak = user_stats?.perfect_week_streak ?? 0

  return (
    <Link href="/workouts" className="block">
      <div
        className="
          relative overflow-hidden rounded-lg
          border border-white/10
          bg-gradient-to-br from-[#0a0a0f] via-[#111118] to-[#0a0a0f]
          p-4
          shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_30px_-12px_rgba(0,0,0,0.8)]
        "
      >
        {/* Background grid tint */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="relative flex items-start gap-4">
          {/* Avatar column */}
          <div className="shrink-0">
            <SpiralDrill tier={tier} resonance={resonance} active={active_recent_24h} size={72} />
          </div>

          {/* Info column */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Title row */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Lv
              </span>
              <span
                className="text-2xl leading-none font-semibold text-white tabular-nums"
                style={{ fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)' }}
              >
                {level}
              </span>
              <span className="truncate text-sm font-medium text-zinc-300">
                {title}
              </span>
              {on_vacation && (
                <span
                  className="ml-auto flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400"
                  title="Modalità Episodio in Spiaggia attiva"
                >
                  <Umbrella className="h-3 w-3" />
                  Ferie
                </span>
              )}
            </div>

            {/* EXP bar — progress within current level, not cumulative */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <span>Spiral Energy</span>
                <span
                  className="tabular-nums text-zinc-400"
                  style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
                >
                  {compactNum(Math.round(progress * exp_for_next_level))} /{' '}
                  {compactNum(exp_for_next_level)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900/80 ring-1 ring-inset ring-white/5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background:
                      'linear-gradient(90deg, rgba(34,197,94,0.9) 0%, rgba(16,185,129,0.9) 50%, rgba(251,191,36,0.9) 100%)',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                  }}
                />
              </div>
            </div>

            {/* Resonance + streak micro-row */}
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <span className="flex items-center gap-1">
                <span>Res</span>
                <span
                  className="text-zinc-200 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
                >
                  ×{resonance.toFixed(2)}
                </span>
              </span>
              {streak > 0 && (
                <span className="flex items-center gap-1">
                  <span>Streak</span>
                  <span
                    className="text-zinc-200 tabular-nums"
                    style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
                  >
                    {streak}w
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {STAT_CONFIG.map(({ key, label, fullLabel, accent, accentBg }) => {
            const value = stat_totals[key]
            return (
              <div
                key={key}
                className="
                  group relative overflow-hidden rounded-md
                  border border-white/5
                  bg-black/40 px-3 py-2
                "
                style={{
                  boxShadow: `inset 0 0 12px ${accentBg}`,
                }}
              >
                {/* Spiral indicator dot */}
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className="text-[9px] uppercase tracking-[0.2em]"
                    style={{ color: accent, opacity: 0.85 }}
                    aria-label={fullLabel}
                  >
                    {label}
                  </span>
                  <SpiralDot color={accent} active={value > 0} />
                </div>
                <div
                  className="text-lg leading-none font-semibold tabular-nums"
                  style={{
                    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
                    color: accent,
                    textShadow: `0 0 10px ${accentBg}`,
                  }}
                >
                  {compactNum(value)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Link>
  )
}

// Small spinning spiral mark used in each stat cell.
function SpiralDot({ color, active }: { color: string; active: boolean }) {
  return (
    <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden>
      <path
        d="M 0 -3 A 3 3 0 1 1 -0.01 -3 M 0 -2 A 2 2 0 1 0 0.01 -2"
        fill="none"
        stroke={color}
        strokeOpacity={active ? 0.9 : 0.35}
        strokeWidth="0.8"
        style={
          active
            ? {
                transformOrigin: '0px 0px',
                transformBox: 'fill-box',
                animation: 'spiral-dot-spin 4s linear infinite',
              }
            : undefined
        }
      />
      <style jsx>{`
        @keyframes spiral-dot-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </svg>
  )
}

function HeroStatusSkeleton() {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0f] p-4">
      <div className="flex items-start gap-4">
        <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-full bg-zinc-900" />
        <div className="flex-1 space-y-3">
          <div className="h-5 w-2/3 animate-pulse rounded bg-zinc-900" />
          <div className="h-1.5 w-full animate-pulse rounded-full bg-zinc-900" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-900" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-zinc-900" />
        ))}
      </div>
    </div>
  )
}
