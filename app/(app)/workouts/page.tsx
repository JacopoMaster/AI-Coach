'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { WorkoutPlan, WorkoutSession, Mesocycle, ExerciseProgression, SessionExercise } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExerciseChart } from '@/components/workouts/exercise-chart'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Play, ChevronDown, ChevronUp, Dumbbell, Trophy, History, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MesocycleData {
  mesocycle: Mesocycle & { current_week: number }
  progressions: ExerciseProgression[]
}

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [mesoData, setMesoData] = useState<MesocycleData | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  // Chart: exerciseId of the currently open inline chart (one at a time)
  const [chartExerciseId, setChartExerciseId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [planRes, sessionsRes, mesoRes] = await Promise.all([
      fetch('/api/workouts?type=plan'),
      fetch('/api/workouts?type=sessions&days=30'),
      fetch('/api/workouts?type=mesocycle'),
    ])
    if (planRes.ok) setPlan(await planRes.json())
    if (sessionsRes.ok) setSessions(await sessionsRes.json())
    if (mesoRes.ok) {
      const data = await mesoRes.json()
      if (data) setMesoData(data)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Map plan_exercise_id → most recent session exercise
  const lastLogByExercise = useMemo(() => {
    const map: Record<string, SessionExercise> = {}
    for (const session of sessions) {
      for (const ex of (session.exercises || [])) {
        if (ex.plan_exercise_id && !map[ex.plan_exercise_id]) {
          map[ex.plan_exercise_id] = ex
        }
      }
    }
    return map
  }, [sessions])

  // Map plan_exercise_id → progression for current week
  const progressionByExercise = useMemo(() => {
    const map: Record<string, ExerciseProgression> = {}
    for (const p of (mesoData?.progressions || [])) {
      map[p.plan_exercise_id] = p
    }
    return map
  }, [mesoData])

  const meso = mesoData?.mesocycle
  const progressPct = meso
    ? Math.round((meso.current_week / meso.duration_weeks) * 100)
    : 0

  function toggleChart(exerciseId: string) {
    setChartExerciseId((prev) => prev === exerciseId ? null : exerciseId)
  }

  return (
    <div className="p-4 space-y-4">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Allenamenti</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/workouts/history">
              <History className="h-4 w-4 mr-1" />
              Storico
            </Link>
          </Button>
          {plan && (
            <Button asChild size="sm">
              <Link href="/workouts/log">
                <Play className="h-4 w-4" />
                Inizia
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Mesocycle banner ─────────────────────────────────────────────────── */}
      {meso && (
        <Card className="border-forza/40 bg-forza/[0.04]">
          <CardContent className="pt-4 pb-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-forza" />
                <span className="text-sm font-semibold text-forza">{meso.name}</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground font-mono tabular-nums">
                Settimana {meso.current_week}/{meso.duration_weeks}
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden ring-1 ring-inset ring-white/5">
              <div
                className="h-full rounded-full transition-all bg-resistenza"
                style={{
                  width: `${progressPct}%`,
                  boxShadow: '0 0 8px hsl(var(--accent-resistenza) / 0.5)',
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right font-mono tabular-nums">{progressPct}% completato</p>
          </CardContent>
        </Card>
      )}

      {/* ── Active Plan ──────────────────────────────────────────────────────── */}
      {plan ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                Attiva
              </span>
            </div>
            {plan.notes && <p className="text-sm text-muted-foreground">{plan.notes}</p>}
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {plan.days?.map((day) => (
                <div key={day.id}>
                  {/* Day toggle */}
                  <button
                    className="w-full flex items-center justify-between px-6 py-3 hover:bg-accent transition-colors"
                    onClick={() => {
                      setExpandedDay(expandedDay === day.id ? null : day.id)
                      setChartExerciseId(null)
                    }}
                  >
                    <span className="font-medium text-sm">{day.day_name}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-xs">{day.exercises?.length || 0} esercizi</span>
                      {expandedDay === day.id
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>

                  {/* Exercises */}
                  {expandedDay === day.id && (
                    <div className="px-6 pb-3 space-y-3">
                      {day.exercises?.map((ex) => {
                        const prog = progressionByExercise[ex.id]
                        const lastLog = lastLogByExercise[ex.id]
                        const chartOpen = chartExerciseId === ex.id

                        return (
                          <div key={ex.id} className="text-sm">
                            {/* Exercise row */}
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{ex.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-xs font-mono tabular-nums">
                                  {ex.sets}×{ex.reps}
                                  {ex.weight_kg && ` @ ${ex.weight_kg}kg`}
                                </span>
                                {/* Chart toggle button */}
                                <button
                                  onClick={() => toggleChart(ex.id)}
                                  className={cn(
                                    'p-1 rounded transition-colors',
                                    chartOpen
                                      ? 'text-primary bg-primary/10'
                                      : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                                  )}
                                  title="Mostra grafico progressione"
                                >
                                  <LineChart className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Weekly target */}
                            {prog && (
                              <div className="flex items-center justify-between mt-0.5 text-xs">
                                <span className="text-resistenza font-medium">
                                  <span className="font-sans">Target sett. </span>
                                  <span className="font-mono tabular-nums">
                                    {meso?.current_week}:{' '}
                                    {prog.target_sets && prog.target_reps
                                      ? `${prog.target_sets}×${prog.target_reps}`
                                      : '—'}
                                    {prog.target_weight_kg ? ` @ ${prog.target_weight_kg}kg` : ''}
                                  </span>
                                </span>
                                {lastLog && (
                                  <span className="text-muted-foreground">
                                    <span className="font-sans">Ultimo: </span>
                                    <span className="font-mono tabular-nums">
                                      {lastLog.sets_done ?? '—'}×{lastLog.reps_done ?? '—'}
                                      {lastLog.weight_kg ? ` @ ${lastLog.weight_kg}kg` : ''}
                                      {lastLog.rpe ? ` RPE ${lastLog.rpe}` : ''}
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Inline progression chart */}
                            {chartOpen && (
                              <div className="mt-2 border rounded-lg p-2 bg-muted/30">
                                <ExerciseChart
                                  exerciseId={ex.id}
                                  exerciseName={ex.name}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Dumbbell className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Nessuna scheda attiva.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Chiedi al Coach di creare una scheda per te!
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Recent sessions ──────────────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sessioni recenti</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/workouts/${s.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{formatDate(s.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {(s as WorkoutSession & { plan_day?: { day_name: string } }).plan_day?.day_name || 'Sessione libera'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(s as WorkoutSession & { exercises?: unknown[] }).exercises?.length || 0} esercizi
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
