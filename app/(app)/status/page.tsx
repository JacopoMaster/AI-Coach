// Status page — full read-only view of the gamification layer.
// Three sections: Riepilogo Spirale · Timeline EXP · Catalogo Achievements.
// Server component: all data fetched in parallel, no client-side state needed.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  expForNextLevel,
  progressToNextLevel,
  stageFromLevel,
  tierFromLevel,
  titleFromLevel,
  totalExpForLevel,
} from '@/lib/gamification/exp-curve'
import type {
  Achievement,
  ExpHistoryEntry,
  UserAchievement,
  UserStats,
} from '@/lib/gamification/types'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Lock, Radio } from 'lucide-react'
import { SourceIcon, AchievementIcon } from '@/components/gamification/StatusIcons'

export const dynamic = 'force-dynamic'

const RARITY_ACCENT: Record<Achievement['rarity'], {
  border: string
  text: string
  glow: string
  label: string
}> = {
  common:    { border: 'border-zinc-500/60',   text: 'text-zinc-200',       glow: '0 0 14px rgba(161,161,170,0.25)', label: 'Comune' },
  uncommon:  { border: 'border-resistenza/70', text: 'text-resistenza',     glow: '0 0 18px hsl(var(--accent-resistenza) / 0.35)', label: 'Non Comune' },
  rare:      { border: 'border-agilita/70',    text: 'text-agilita',        glow: '0 0 18px hsl(var(--accent-agilita) / 0.35)', label: 'Raro' },
  legendary: { border: 'border-forza/80',      text: 'text-forza',          glow: '0 0 22px hsl(var(--accent-forza) / 0.45)', label: 'Leggendario' },
}

const STAGE_LABEL: Record<ReturnType<typeof stageFromLevel>, string> = {
  terrestrial: 'Terrestre',
  atmospheric: 'Atmosferico',
  orbital:     'Orbitale',
  celestial:   'Celeste',
  galactic:    'Galattico',
  tengen_toppa:'Tengen Toppa',
}

const STAT_COLOR: Record<'forza' | 'resistenza' | 'agilita', string> = {
  forza: 'text-forza',
  resistenza: 'text-resistenza',
  agilita: 'text-agilita',
}

const SOURCE_LABEL: Record<ExpHistoryEntry['source'], string> = {
  workout_session:  'Sessione',
  diet_log:         'Pasto',
  weight_log:       'Pesata',
  body_measurement: 'Misurazione',
  weekly_checkin:   'Check-in',
  meso_complete:    'Mesociclo',
  giga_drill_break: 'Giga Drill Break',
  perfect_week:     'Perfect Week',
  achievement:      'Achievement',
}

function relativeDate(iso: string): string {
  const now = new Date()
  const then = new Date(iso)
  const midnight = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const days = Math.round((midnight(now).getTime() - midnight(then).getTime()) / 86_400_000)
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  if (days < 7) return `${days} giorni fa`
  return then.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function compactNum(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  if (n < 1_000_000) return Math.floor(n / 1000) + 'K'
  return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
}

export default async function StatusPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [statsRes, expRes, catalogRes, unlocksRes] = await Promise.all([
    supabase.from('user_stats').select('*').eq('user_id', user.id).single<UserStats>(),
    supabase
      .from('exp_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('achievements').select('*').order('rarity', { ascending: true }),
    supabase.from('user_achievements').select('*').eq('user_id', user.id),
  ])

  const stats = statsRes.data
  const entries = (expRes.data ?? []) as ExpHistoryEntry[]
  const catalog = (catalogRes.data ?? []) as Achievement[]
  const unlocks = (unlocksRes.data ?? []) as UserAchievement[]

  const unlockedMap = new Map<string, string>()
  for (const u of unlocks) unlockedMap.set(u.achievement_code, u.unlocked_at)

  const level = stats?.level ?? 1
  const expTotal = Number(stats?.exp_total ?? 0)
  const progress = progressToNextLevel(expTotal)
  const expForNext = expForNextLevel(level)
  const expIntoLevel = expTotal - totalExpForLevel(level)
  const stage = stageFromLevel(level)
  const tier = tierFromLevel(level)
  const title = titleFromLevel(level)
  const resonance = Number(stats?.resonance_mult ?? 1)
  const streak = stats?.perfect_week_streak ?? 0
  const longest = stats?.longest_streak ?? 0
  const pierced = stats?.pierced_the_heavens ?? false

  // Rarity order for grid display (legendary last — climax).
  const rarityOrder: Achievement['rarity'][] = ['common', 'uncommon', 'rare', 'legendary']
  const sorted = [...catalog].sort((a, b) => {
    const ra = rarityOrder.indexOf(a.rarity)
    const rb = rarityOrder.indexOf(b.rarity)
    if (ra !== rb) return ra - rb
    // Within a rarity: unlocked first, then catalog order (code).
    const ua = unlockedMap.has(a.code) ? 0 : 1
    const ub = unlockedMap.has(b.code) ? 0 : 1
    if (ua !== ub) return ua - ub
    return a.code.localeCompare(b.code)
  })

  const unlockedCount = unlocks.length
  const totalCount = catalog.length

  return (
    <div className="p-4 space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/40 text-zinc-400 transition hover:border-white/20 hover:text-white"
          aria-label="Torna alla dashboard"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Fase 3</span>
          <h1 className="text-lg font-semibold tracking-tight text-white">Stato Spirale</h1>
        </div>
      </div>

      {/* ── 1. Riepilogo Spirale ─────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>Riepilogo Spirale</SectionLabel>

        <div
          className="
            relative overflow-hidden rounded-lg
            border border-white/10
            bg-gradient-to-br from-[#0a0a0f] via-[#111118] to-[#0a0a0f]
            p-4
          "
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          <div className="relative space-y-4">
            {/* Level + title */}
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Lv</span>
              <span className="font-mono text-4xl font-semibold leading-none tabular-nums text-white">
                {level}
              </span>
              <span className="truncate text-sm font-medium text-zinc-300">{title}</span>
            </div>

            {/* EXP bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <span>Spiral Energy</span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {compactNum(Math.max(0, Math.round(expIntoLevel)))} /{' '}
                  {compactNum(expForNext)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900/80 ring-1 ring-inset ring-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background:
                      'linear-gradient(90deg, rgba(34,197,94,0.9) 0%, rgba(16,185,129,0.9) 50%, rgba(251,191,36,0.9) 100%)',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                  }}
                />
              </div>
              <div className="text-[10px] text-zinc-500">
                EXP totali:{' '}
                <span className="font-mono tabular-nums text-zinc-300">
                  {expTotal.toLocaleString('it-IT')}
                </span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Risonanza"
                value={`×${resonance.toFixed(2)}`}
                accent="text-agilita"
                hint="moltiplicatore EXP"
                icon={<Radio className="h-3 w-3" />}
              />
              <Metric
                label="Streak"
                value={`${streak}w`}
                accent="text-resistenza"
                hint={`best ${longest}w`}
              />
              <Metric
                label="Tier Drill"
                value={`${tier}/11`}
                accent="text-white"
                hint="core drill"
              />
              <Metric
                label="Stage"
                value={STAGE_LABEL[stage]}
                accent={pierced ? 'text-forza' : 'text-white'}
                hint={pierced ? 'Cielo trafitto' : 'spirale'}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Timeline EXP ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>
          Timeline EXP
          <span className="ml-2 font-mono text-[10px] tracking-[0.15em] text-zinc-500">
            ultimi {entries.length}
          </span>
        </SectionLabel>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Ancora nessuna energia accumulata.<br />
                Registra una sessione o un pasto per avviare la spirale.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ol className="relative space-y-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
            {entries.map((e, idx) => (
              <li
                key={e.id}
                className={
                  'relative flex items-start gap-3 px-3 py-3 transition-colors hover:bg-white/[0.02]' +
                  (idx !== entries.length - 1 ? ' border-b border-white/5' : '')
                }
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-zinc-300">
                  <SourceIcon source={e.source} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-200">
                      {SOURCE_LABEL[e.source] ?? e.source}
                    </span>
                    <span
                      className={
                        'font-mono text-sm tabular-nums ' +
                        (e.delta >= 0 ? 'text-emerald-400' : 'text-red-400')
                      }
                    >
                      {e.delta >= 0 ? '+' : ''}
                      {e.delta} EXP
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>{relativeDate(e.created_at)}</span>
                    {Number(e.multiplier) > 1 && (
                      <>
                        <span>·</span>
                        <span className="font-mono tabular-nums text-agilita/80">
                          ×{Number(e.multiplier).toFixed(2)}
                        </span>
                      </>
                    )}
                    {e.stat_tagged && e.stat_tagged !== 'all' && STAT_COLOR[e.stat_tagged] && (
                      <>
                        <span>·</span>
                        <span className={`uppercase tracking-[0.15em] ${STAT_COLOR[e.stat_tagged]}`}>
                          {e.stat_tagged}
                        </span>
                      </>
                    )}
                  </div>
                  {e.rationale && (
                    <p className="mt-1 truncate text-[11px] text-zinc-400">{e.rationale}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── 3. Catalogo Achievements ─────────────────────────────────── */}
      <section className="space-y-2">
        <SectionLabel>
          Achievements
          <span className="ml-2 font-mono text-[10px] tracking-[0.15em] text-zinc-500">
            {unlockedCount}/{totalCount}
          </span>
        </SectionLabel>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sorted.map((a) => {
            const unlocked = unlockedMap.has(a.code)
            const rarity = RARITY_ACCENT[a.rarity]
            const displayHidden = a.hidden && !unlocked
            return (
              <div
                key={a.code}
                className={
                  'relative overflow-hidden rounded-lg border p-3 transition-colors ' +
                  (unlocked
                    ? `bg-black/50 ${rarity.border}`
                    : 'border-white/10 bg-black/30 opacity-60 grayscale')
                }
                style={unlocked ? { boxShadow: `inset 0 0 16px rgba(0,0,0,0.6), ${rarity.glow}` } : undefined}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ' +
                      (unlocked ? rarity.border + ' ' + rarity.text : 'border-white/10 text-zinc-500')
                    }
                  >
                    {displayHidden ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <AchievementIcon icon={a.icon} className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={
                        'truncate text-[11px] uppercase tracking-[0.15em] ' +
                        (unlocked ? rarity.text : 'text-zinc-500')
                      }
                    >
                      {rarity.label}
                    </div>
                    <div
                      className={
                        'truncate text-sm font-semibold ' +
                        (unlocked ? 'text-white' : 'text-zinc-400')
                      }
                    >
                      {displayHidden ? '???' : a.name}
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-[11px] leading-snug text-zinc-400">
                  {displayHidden ? 'Trofeo nascosto. Continua a salire nella spirale.' : a.description}
                </p>

                <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="font-mono tabular-nums">
                    {a.exp_reward > 0 ? `+${a.exp_reward} EXP` : ''}
                  </span>
                  {unlocked && (
                    <span className="tabular-nums">
                      {relativeDate(unlockedMap.get(a.code)!)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-baseline px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
      {children}
    </h2>
  )
}

function Metric({
  label,
  value,
  accent,
  hint,
  icon,
}: {
  label: string
  value: string
  accent: string
  hint?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-white/5 bg-black/40 px-3 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 font-mono text-base font-semibold leading-none tabular-nums ${accent}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-zinc-500">{hint}</div>}
    </div>
  )
}
