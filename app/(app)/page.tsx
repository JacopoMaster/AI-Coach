'use client'

import { useState, useEffect } from 'react'
import { BodyMeasurement, WorkoutSession, DietLog, DietPlan } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate, today } from '@/lib/utils'
import Link from 'next/link'
import {
  Activity,
  Dumbbell,
  Salad,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from 'lucide-react'

export default function DashboardPage() {
  const [latestMeasurement, setLatestMeasurement] = useState<BodyMeasurement | null>(null)
  const [prevMeasurement, setPrevMeasurement] = useState<BodyMeasurement | null>(null)
  const [lastSession, setLastSession] = useState<(WorkoutSession & { plan_day?: { day_name: string } }) | null>(null)
  const [weekLogs, setWeekLogs] = useState<DietLog[]>([])
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null)

  useEffect(() => {
    async function loadAll() {
      const [bodyRes, sessionsRes, dietWeekRes, dietPlanRes] = await Promise.all([
        fetch('/api/body?days=60'),
        fetch('/api/workouts?type=sessions&days=7'),
        fetch('/api/diet?type=logs&days=7'),
        fetch('/api/diet?type=plan'),
      ])

      if (bodyRes.ok) {
        const measurements: BodyMeasurement[] = await bodyRes.json()
        if (measurements.length > 0) setLatestMeasurement(measurements[measurements.length - 1])
        if (measurements.length > 1) setPrevMeasurement(measurements[measurements.length - 2])
      }

      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json()
        if (sessions.length > 0) setLastSession(sessions[0])
      }

      if (dietWeekRes.ok) setWeekLogs(await dietWeekRes.json())
      if (dietPlanRes.ok) setDietPlan(await dietPlanRes.json())
    }

    loadAll()
  }, [])

  const weightTrend =
    latestMeasurement?.weight_kg && prevMeasurement?.weight_kg
      ? latestMeasurement.weight_kg - prevMeasurement.weight_kg
      : null

  // --- Weekly balance logic ---

  // Monday of the current ISO week (Mon = start, Sun = end)
  const mondayStr = (() => {
    const now = new Date()
    const dow = now.getDay()                    // 0=Sun … 6=Sat
    const daysFromMon = dow === 0 ? 6 : dow - 1 // Sun wraps to 6
    const mon = new Date(now)
    mon.setDate(now.getDate() - daysFromMon)
    return mon.toISOString().split('T')[0]
  })()

  // How many days have elapsed since Monday (Mon=1 … Sun=7)
  const daysElapsed = (() => {
    const dow = new Date().getDay()
    return dow === 0 ? 7 : dow
  })()

  // Keep only logs that fall within the current week (Mon–today)
  const currentWeekLogs = weekLogs.filter((l) => l.date >= mondayStr)

  // Totals consumed this week
  const totals = currentWeekLogs.length > 0
    ? {
        calories: currentWeekLogs.reduce((s, l) => s + (l.calories  || 0), 0),
        protein:  currentWeekLogs.reduce((s, l) => s + (l.protein_g || 0), 0),
        carbs:    currentWeekLogs.reduce((s, l) => s + (l.carbs_g   || 0), 0),
        fat:      currentWeekLogs.reduce((s, l) => s + (l.fat_g     || 0), 0),
      }
    : null

  // Weekly budget = daily target × 7
  const weeklyTarget = dietPlan
    ? {
        calories: (dietPlan.calories   || 0) * 7,
        protein:  (dietPlan.protein_g  || 0) * 7,
        carbs:    (dietPlan.carbs_g    || 0) * 7,
        fat:      (dietPlan.fat_g      || 0) * 7,
      }
    : null

  function pct(value: number, target: number) {
    return Math.min(100, Math.round((value / target) * 100))
  }

  // Color the calorie bar based on how close to budget
  function calorieBarColor(value: number, target: number) {
    const ratio = value / target
    if (ratio >= 1.0) return 'bg-red-500'
    if (ratio >= 0.88) return 'bg-yellow-500'
    return 'bg-primary'
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{formatDate(today())}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/coach">
            <MessageSquare className="h-4 w-4" />
            Coach
          </Link>
        </Button>
      </div>

      {/* Weight widget */}
      <Link href="/body">
        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm text-muted-foreground">Peso attuale</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {latestMeasurement ? (
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold">{latestMeasurement.weight_kg} <span className="text-base font-normal text-muted-foreground">kg</span></p>
                  <p className="text-xs text-muted-foreground">{formatDate(latestMeasurement.date)}</p>
                </div>
                <div className="text-right">
                  {weightTrend !== null && (
                    <div className={`flex items-center gap-1 text-sm font-medium ${
                      weightTrend < 0 ? 'text-green-500' : weightTrend > 0 ? 'text-orange-500' : 'text-muted-foreground'
                    }`}>
                      {weightTrend < 0 ? <TrendingDown className="h-4 w-4" /> :
                       weightTrend > 0 ? <TrendingUp className="h-4 w-4" /> :
                       <Minus className="h-4 w-4" />}
                      {weightTrend > 0 ? '+' : ''}{weightTrend.toFixed(1)} kg
                    </div>
                  )}
                  {latestMeasurement.body_fat_pct && (
                    <p className="text-sm text-muted-foreground">{latestMeasurement.body_fat_pct}% grasso</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nessuna misurazione. Aggiungine una!</p>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Last workout */}
      <Link href="/workouts">
        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm text-muted-foreground">Ultimo allenamento</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {lastSession ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{lastSession.plan_day?.day_name || 'Sessione libera'}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(lastSession.date)}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nessuna sessione recente.</p>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Weekly calorie balance */}
      <Link href="/diet">
        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Salad className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm text-muted-foreground">Bilancio Settimanale</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                giorno {daysElapsed}/7 · {currentWeekLogs.length} log
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {totals ? (
              <div className="space-y-3">
                {/* Calorie headline: consumed / weekly budget */}
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-bold">
                    {totals.calories.toLocaleString()}
                    {weeklyTarget && (
                      <span className="text-base font-normal text-muted-foreground">
                        {' '}/ {weeklyTarget.calories.toLocaleString()} kcal
                      </span>
                    )}
                    {!weeklyTarget && (
                      <span className="text-base font-normal text-muted-foreground"> kcal</span>
                    )}
                  </p>
                  {weeklyTarget && (
                    <p className={`text-xs font-medium ${
                      totals.calories > weeklyTarget.calories
                        ? 'text-red-500'
                        : 'text-green-500'
                    }`}>
                      {totals.calories > weeklyTarget.calories ? '−' : '+'}
                      {Math.abs(weeklyTarget.calories - totals.calories).toLocaleString()} kcal{' '}
                      {totals.calories > weeklyTarget.calories ? 'sforato' : 'rimanenti'}
                    </p>
                  )}
                </div>

                {/* Calorie progress bar */}
                {weeklyTarget && (
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${calorieBarColor(totals.calories, weeklyTarget.calories)}`}
                      style={{ width: `${pct(totals.calories, weeklyTarget.calories)}%` }}
                    />
                  </div>
                )}

                {/* Macro rows */}
                <div className="space-y-1.5">
                  {(
                    [
                      { label: 'Proteine',    key: 'protein' as const, wTarget: weeklyTarget?.protein,  color: 'bg-blue-500'   },
                      { label: 'Carboidrati', key: 'carbs'   as const, wTarget: weeklyTarget?.carbs,    color: 'bg-yellow-500' },
                      { label: 'Grassi',      key: 'fat'     as const, wTarget: weeklyTarget?.fat,      color: 'bg-orange-500' },
                    ]
                  ).map(({ label, key, wTarget, color }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-20 text-xs text-muted-foreground shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-full transition-all`}
                          style={{ width: wTarget ? `${pct(totals[key], wTarget)}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs font-medium w-20 text-right tabular-nums">
                        {totals[key]}g{wTarget ? ` / ${wTarget}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nessun log questa settimana.</p>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Coach CTA */}
      <Link href="/coach">
        <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-primary/30">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Parla con il Coach</p>
              <p className="text-xs text-muted-foreground">
                Analisi, consigli e modifiche alla tua scheda
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
