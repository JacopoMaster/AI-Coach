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
  const [todayDiet, setTodayDiet] = useState<DietLog | null>(null)
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null)

  useEffect(() => {
    async function loadAll() {
      const [bodyRes, sessionsRes, dietTodayRes, dietPlanRes] = await Promise.all([
        fetch('/api/body?days=60'),
        fetch('/api/workouts?type=sessions&days=7'),
        fetch('/api/diet?type=today'),
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

      if (dietTodayRes.ok) setTodayDiet(await dietTodayRes.json())
      if (dietPlanRes.ok) setDietPlan(await dietPlanRes.json())
    }

    loadAll()
  }, [])

  const weightTrend =
    latestMeasurement?.weight_kg && prevMeasurement?.weight_kg
      ? latestMeasurement.weight_kg - prevMeasurement.weight_kg
      : null

  const caloriePct =
    dietPlan?.calories && todayDiet?.calories
      ? Math.min(100, Math.round((todayDiet.calories / dietPlan.calories) * 100))
      : null

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

      {/* Today's diet */}
      <Link href="/diet">
        <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Salad className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm text-muted-foreground">Dieta oggi</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {todayDiet ? (
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold">
                    {todayDiet.calories || 0} <span className="text-base font-normal text-muted-foreground">kcal</span>
                  </p>
                  {caloriePct !== null && (
                    <p className="text-sm text-muted-foreground">{caloriePct}% obiettivo</p>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>P: {todayDiet.protein_g || 0}g</span>
                  <span>C: {todayDiet.carbs_g || 0}g</span>
                  <span>G: {todayDiet.fat_g || 0}g</span>
                </div>
                {dietPlan?.calories && (
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${caloriePct}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nessun log per oggi. Aggiungilo!</p>
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
