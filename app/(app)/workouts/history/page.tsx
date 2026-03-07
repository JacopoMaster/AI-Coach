'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Archive,
  Calendar,
  Dumbbell,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanExercise {
  name: string
  sets: number
  reps: string
  weight_kg: number | null
  order: number
}

interface PlanDay {
  day_name: string
  day_order: number
  exercises: PlanExercise[]
}

interface MesocycleHistory {
  id: string
  name: string
  status: 'completed' | 'archived'
  start_date: string
  end_date: string | null
  duration_weeks: 6 | 8
  notes: string | null
  created_at: string
  plan: {
    name: string
    notes: string | null
    days: PlanDay[]
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveDuration(meso: MesocycleHistory): string {
  if (!meso.end_date) return `${meso.duration_weeks} sett. (pianificate)`
  const start = new Date(meso.start_date)
  const end = new Date(meso.end_date)
  const weeks = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7))
  return `${weeks} sett. (${meso.duration_weeks} pianificate)`
}

// ─── Meso card ────────────────────────────────────────────────────────────────

function MesoCard({ meso }: { meso: MesocycleHistory }) {
  const [planOpen, setPlanOpen] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const isCompleted = meso.status === 'completed'

  return (
    <Card className={cn(
      'overflow-hidden',
      isCompleted ? 'border-green-500/20' : 'border-muted'
    )}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{meso.name}</CardTitle>
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                isCompleted
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
              )}>
                {isCompleted ? 'Completato' : 'Archiviato'}
              </span>
            </div>
          </div>
          {isCompleted
            ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            : <Archive className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
        </div>

        {/* Date range + duration */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Calendar className="h-3 w-3 shrink-0" />
          <span>
            {formatDate(meso.start_date)}
            {meso.end_date ? ` → ${formatDate(meso.end_date)}` : ' → in corso'}
          </span>
          <span className="mx-1">·</span>
          <span>{effectiveDuration(meso)}</span>
        </div>

        {/* Plan name */}
        {meso.plan && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Scheda: <span className="text-foreground">{meso.plan.name}</span>
          </p>
        )}
      </CardHeader>

      {/* ── Expand plan ────────────────────────────────────────────────────── */}
      {meso.plan && (
        <>
          <div className="px-6 pb-3">
            <button
              onClick={() => { setPlanOpen(!planOpen); setExpandedDay(null) }}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Dumbbell className="h-3 w-3" />
              {planOpen ? 'Nascondi scheda' : 'Visualizza scheda'}
              {planOpen
                ? <ChevronUp className="h-3 w-3" />
                : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>

          {planOpen && (
            <CardContent className="p-0 border-t">
              {/* Read-only plan view */}
              <div className="divide-y">
                {meso.plan.days.map((day) => (
                  <div key={day.day_name}>
                    <button
                      className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-accent transition-colors"
                      onClick={() => setExpandedDay(expandedDay === day.day_name ? null : day.day_name)}
                    >
                      <span className="text-sm font-medium">{day.day_name}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-xs">{day.exercises.length} esercizi</span>
                        {expandedDay === day.day_name
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </div>
                    </button>

                    {expandedDay === day.day_name && (
                      <div className="px-6 pb-3 space-y-2 bg-muted/30">
                        {day.exercises.map((ex, i) => (
                          <div key={i} className="flex items-center justify-between text-sm py-0.5">
                            <span className="text-foreground">{ex.name}</span>
                            <span className="text-muted-foreground text-xs">
                              {ex.sets}×{ex.reps}
                              {ex.weight_kg ? ` @ ${ex.weight_kg}kg` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </>
      )}
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutsHistoryPage() {
  const [mesocycles, setMesocycles] = useState<MesocycleHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workouts?type=meso_history')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMesocycles(data) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2">
          <Link href="/workouts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Storico mesocicli</h1>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && mesocycles.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Archive className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Nessun mesociclo completato.</p>
            <p className="text-xs text-muted-foreground mt-1">
              I mesocicli completati appariranno qui.
            </p>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!loading && mesocycles.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {mesocycles.length} mesocicl{mesocycles.length === 1 ? 'o' : 'i'} completat{mesocycles.length === 1 ? 'o' : 'i'}
          </p>
          <div className="space-y-3">
            {mesocycles.map((meso) => (
              <MesoCard key={meso.id} meso={meso} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
