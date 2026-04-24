'use client'

// Hero Status Strip — the top-of-dashboard card that anchors the whole
// gamification layer. Shows: tier title, level, EXP bar + progress,
// three stat indicators (Forza/Resistenza/Agilità), resonance multiplier,
// and the rotating Core Drill avatar.
//
// Midnight Arcade palette: ink-black base, thin borders, JetBrains Mono
// for numerics, per-stat accent glow (crimson / cyan / gold).

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Sparkles, Umbrella } from 'lucide-react'
import { useSpiralState } from '@/hooks/use-spiral-state'
import { subscribeSpiralEvents } from '@/lib/gamification/spiral-events'
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

const PERFECT_FLASH_MS = 4000

export function HeroStatusStrip() {
  const { data, isLoading } = useSpiralState()
  const [perfectFlash, setPerfectFlash] = useState<{ streak: number } | null>(null)
  const prevStreakRef = useRef<number | null>(null)

  // Detect Perfect Week streak bumps from stats refreshes — works whether the
  // backend emits an explicit reward or just updates user_stats.
  useEffect(() => {
    const currentStreak = data?.user_stats?.perfect_week_streak ?? null
    const prev = prevStreakRef.current
    if (
      currentStreak != null &&
      prev != null &&
      currentStreak > prev
    ) {
      setPerfectFlash({ streak: currentStreak })
    }
    prevStreakRef.current = currentStreak
  }, [data?.user_stats?.perfect_week_streak])

  // One-shot server marker: `/api/stats` sets `perfect_week` the first time
  // the lazy tick confirms a perfect week. Key on `week_start` so the same
  // event never re-fires the flash within a session.
  const lastPwWeekRef = useRef<string | null>(null)
  useEffect(() => {
    const pw = data?.perfect_week
    if (!pw) return
    if (lastPwWeekRef.current === pw.week_start) return
    lastPwWeekRef.current = pw.week_start
    setPerfectFlash({ streak: pw.streak })
  }, [data?.perfect_week])

  // Also react to explicit perfect_week events fired from POST handlers.
  useEffect(() => {
    return subscribeSpiralEvents((event) => {
      if (event.type === 'perfect_week') {
        setPerfectFlash({ streak: event.data.streak })
      }
    })
  }, [])

  // Auto-dismiss the flash after a few seconds.
  useEffect(() => {
    if (!perfectFlash) return
    const t = setTimeout(() => setPerfectFlash(null), PERFECT_FLASH_MS)
    return () => clearTimeout(t)
  }, [perfectFlash])

  if (isLoading || !data) {
    return <HeroStatusSkeleton />
  }

  const { user_stats, title, progress, exp_for_next_level, stat_totals, on_vacation } = data
  const level = user_stats?.level ?? 1
  const resonance = Number(user_stats?.resonance_mult ?? 1)
  const streak = user_stats?.perfect_week_streak ?? 0

  return (
    <Link href="/status" className="block" aria-label="Apri lo stato della spirale">
      <div
        className="
          relative overflow-hidden rounded-lg
          border border-white/10
          bg-gradient-to-br from-[#0a0a0f] via-[#111118] to-[#0a0a0f]
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

        {/* Perfect Week golden halo — pulses behind the whole card when a
         *  new Perfect Week lands. Sits above the grid, below content. */}
        <AnimatePresence>
          {perfectFlash && (
            <motion.div
              key="pw-halo"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 35%, rgba(250,204,21,0.35) 0%, rgba(250,204,21,0.12) 35%, transparent 70%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.8, 0.5] }}
              exit={{ opacity: 0 }}
              transition={{ duration: PERFECT_FLASH_MS / 1000, times: [0, 0.15, 0.6, 1] }}
            />
          )}
        </AnimatePresence>

        {/* Top-right detail affordance — replaces the old inline chevron so
         *  the title row stays clean and the whole card reads as a hero. */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-zinc-400 backdrop-blur-sm">
          Dettagli
          <ChevronRight className="h-3 w-3" aria-hidden />
        </div>

        {/* Top-left vacation badge — visible only on opt-in. */}
        {on_vacation && (
          <span
            className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 backdrop-blur-sm"
            title="Modalità Episodio in Spiaggia attiva"
          >
            <Umbrella className="h-3 w-3" />
            Ferie
          </span>
        )}

        {/* Vertical stack — drill hero up top, stats stacked + centered below. */}
        <div className="relative flex flex-col items-center">
          {/* Drill — full-width, already internally centered by SpiralDrill. */}
          <div className="w-full">
            <SpiralDrill level={level} />
          </div>

          {/* Centered info column. Padding holds the card breathable. */}
          <div className="flex w-full flex-col items-center gap-5 px-5 pb-5 pt-2">

            {/* Level + Title — stacked, centered. */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Lv
                </span>
                <span className="font-mono text-4xl leading-none font-semibold tabular-nums text-white">
                  {level}
                </span>
              </div>
              <span className="text-center text-sm font-medium tracking-tight text-zinc-300">
                {title}
              </span>
            </div>

            {/* EXP bar — progress within current level. */}
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <span>Spiral Energy</span>
                <span className="font-mono tabular-nums text-zinc-400">
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

            {/* Resonance + streak — centered row. */}
            <div className="flex items-center justify-center gap-5 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <motion.span
                className="flex items-center gap-1"
                animate={
                  perfectFlash
                    ? {
                        color: ['rgb(113,113,122)', 'rgb(250,204,21)', 'rgb(113,113,122)'],
                        textShadow: [
                          '0 0 0 rgba(250,204,21,0)',
                          '0 0 10px rgba(250,204,21,0.8)',
                          '0 0 0 rgba(250,204,21,0)',
                        ],
                      }
                    : undefined
                }
                transition={{ duration: 1.6, repeat: 1 }}
              >
                <span>Res</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  ×{resonance.toFixed(2)}
                </span>
              </motion.span>
              {streak > 0 && (
                <span className="flex items-center gap-1">
                  <span>Streak</span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {streak}w
                  </span>
                </span>
              )}
            </div>

            {/* Perfect Week badge — lives on its own centered line so it
             *  never competes with the Res/Streak metrics for space. */}
            <AnimatePresence>
              {perfectFlash && (
                <motion.span
                  key="pw-badge"
                  className="flex items-center gap-1 rounded-full border border-agilita/70 bg-agilita/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-agilita"
                  style={{ boxShadow: '0 0 14px hsl(var(--accent-agilita) / 0.5)' }}
                  initial={{ opacity: 0, scale: 0.6, y: 6 }}
                  animate={{ opacity: 1, scale: [0.6, 1.15, 1], y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -4 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Sparkles className="h-3 w-3" />
                  Perfect Week
                  <span className="tabular-nums">{perfectFlash.streak}w</span>
                </motion.span>
              )}
            </AnimatePresence>

            {/* Stat grid — 3 cells, centered, consistent widths. */}
            <div className="grid w-full grid-cols-3 gap-2">
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
                      className="font-mono text-lg leading-none font-semibold tabular-nums"
                      style={{
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
