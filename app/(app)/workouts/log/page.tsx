'use client'

import { useState, useEffect } from 'react'
import { WorkoutPlan, WorkoutPlanDay, ExerciseProgression } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { today } from '@/lib/utils'
import { enqueue, SYNC_TAG } from '@/lib/offline/sync-queue'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react'
import { fireGigaDrill, firePerfectWeek } from '@/lib/gamification/spiral-events'
import type { Reward } from '@/lib/gamification/types'

type ExerciseLog = {
  plan_exercise_id: string
  name: string
  sets_done: string
  reps_done: string
  weight_kg: string
  notes: string
  rpe: string
}

type WorkoutDraft = {
  selectedDay: WorkoutPlanDay
  exerciseLogs: ExerciseLog[]
  currentExIdx: number
  overallNotes: string
  step: 'log-exercises' | 'summary'
}

type LastPerf = { sets_done: string; reps_done: string; weight_kg: string }

const DRAFT_PREFIX = 'workout_draft_'

async function fetchSessionMeta(ids: string): Promise<{
  notes: Record<string, string>
  perf: Record<string, LastPerf>
  progressionMap: Record<string, ExerciseProgression>
}> {
  const [notes, perf, meso] = await Promise.all([
    fetch(`/api/workouts?type=previous_notes&exercise_ids=${ids}`).then((r) => r.json()),
    fetch(`/api/workouts?type=previous_performance&exercise_ids=${ids}`).then((r) => r.json()),
    fetch('/api/workouts?type=mesocycle').then((r) => r.json()),
  ])
  const progressionMap: Record<string, ExerciseProgression> = {}
  if (meso?.progressions) {
    for (const p of meso.progressions) progressionMap[p.plan_exercise_id] = p
  }
  return { notes: notes || {}, perf: perf || {}, progressionMap }
}

export default function WorkoutLogPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [selectedDay, setSelectedDay] = useState<WorkoutPlanDay | null>(null)
  const [step, setStep] = useState<'select-day' | 'log-exercises' | 'summary'>('select-day')
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([])
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [overallNotes, setOverallNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [previousNotes, setPreviousNotes] = useState<Record<string, string>>({})
  const [progressions, setProgressions] = useState<Record<string, ExerciseProgression>>({})
  const [lastPerformance, setLastPerformance] = useState<Record<string, LastPerf>>({})
  const [loadingDayId, setLoadingDayId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'warning' | 'error' } | null>(
    null
  )

  // Restore any existing draft on mount (skip if day_id param — plan effect handles it)
  useEffect(() => {
    const dayId = new URLSearchParams(window.location.search).get('day_id')
    if (dayId) return
    const draftKey = Object.keys(localStorage).find((k) => k.startsWith(DRAFT_PREFIX))
    if (!draftKey) return
    try {
      const draft: WorkoutDraft = JSON.parse(localStorage.getItem(draftKey) || '')
      setSelectedDay(draft.selectedDay)
      setExerciseLogs(draft.exerciseLogs)
      setCurrentExIdx(draft.currentExIdx)
      setOverallNotes(draft.overallNotes)
      setStep(draft.step)

      const ids = (draft.selectedDay.exercises || []).map((ex) => ex.id).join(',')
      if (ids) {
        fetchSessionMeta(ids).then(({ notes, perf, progressionMap }) => {
          setPreviousNotes(notes)
          setLastPerformance(perf)
          setProgressions(progressionMap)
        })
      }
    } catch {
      localStorage.removeItem(draftKey)
    }
  }, [])

  // Persist draft to localStorage whenever workout state changes
  useEffect(() => {
    if (!selectedDay || step === 'select-day') return
    const draft: WorkoutDraft = {
      selectedDay,
      exerciseLogs,
      currentExIdx,
      overallNotes,
      step: step as 'log-exercises' | 'summary',
    }
    localStorage.setItem(`${DRAFT_PREFIX}${selectedDay.id}`, JSON.stringify(draft))
  }, [selectedDay, exerciseLogs, currentExIdx, overallNotes, step])

  useEffect(() => {
    fetch('/api/workouts?type=plan')
      .then((r) => r.json())
      .then(async (data) => {
        setPlan(data)
        const dayId = new URLSearchParams(window.location.search).get('day_id')
        if (dayId && data?.days) {
          const matchedDay = data.days.find((d: WorkoutPlanDay) => d.id === dayId)
          if (matchedDay) await selectDay(matchedDay)
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function selectDay(day: WorkoutPlanDay) {
    if (loadingDayId) return

    // Check for an existing draft for this day
    const draftKey = `${DRAFT_PREFIX}${day.id}`
    const raw = localStorage.getItem(draftKey)
    if (raw) {
      try {
        const draft: WorkoutDraft = JSON.parse(raw)
        setSelectedDay(draft.selectedDay)
        setExerciseLogs(draft.exerciseLogs)
        setCurrentExIdx(draft.currentExIdx)
        setOverallNotes(draft.overallNotes)
        setStep(draft.step)

        const ids = (day.exercises || []).map((ex) => ex.id).join(',')
        if (ids) {
          fetchSessionMeta(ids).then(({ notes, perf, progressionMap }) => {
            setPreviousNotes(notes)
            setLastPerformance(perf)
            setProgressions(progressionMap)
          })
        }
        return
      } catch {
        localStorage.removeItem(draftKey)
      }
    }

    // No draft — fetch meta first, then initialize logs with progression targets
    setLoadingDayId(day.id)
    const ids = (day.exercises || []).map((ex) => ex.id).join(',')

    let progressionMap: Record<string, ExerciseProgression> = {}
    let prevNotes: Record<string, string> = {}
    let prevPerf: Record<string, LastPerf> = {}

    if (ids) {
      const result = await fetchSessionMeta(ids)
      prevNotes = result.notes
      prevPerf = result.perf
      progressionMap = result.progressionMap
    }

    setPreviousNotes(prevNotes)
    setLastPerformance(prevPerf)
    setProgressions(progressionMap)
    setSelectedDay(day)

    const logs = (day.exercises || []).map((ex) => {
      const prog = progressionMap[ex.id]
      return {
        plan_exercise_id: ex.id,
        name: ex.name,
        sets_done: prog?.target_sets != null ? String(prog.target_sets) : String(ex.sets),
        reps_done: prog?.target_reps != null ? String(prog.target_reps) : ex.reps,
        weight_kg:
          prog?.target_weight_kg != null
            ? String(prog.target_weight_kg)
            : ex.weight_kg
            ? String(ex.weight_kg)
            : '',
        notes: '',
        rpe: '',
      }
    })
    setExerciseLogs(logs)
    setCurrentExIdx(0)
    setLoadingDayId(null)
    setStep('log-exercises')
  }

  function updateLog(field: keyof ExerciseLog, value: string) {
    setExerciseLogs((prev) => {
      const next = [...prev]
      next[currentExIdx] = { ...next[currentExIdx], [field]: value }
      return next
    })
  }

  async function queueOffline(body: string) {
    await enqueue({ endpoint: '/api/workouts', method: 'POST', body })
    // Ask the browser to replay the queue as soon as connectivity returns.
    // iOS Safari doesn't expose SyncManager — the in-app replay hook handles
    // that case on the next page load.
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'SyncManager' in window
    ) {
      try {
        const reg = await navigator.serviceWorker.ready
        // SyncManager types aren't in the default DOM lib yet.
        await (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } })
          .sync?.register(SYNC_TAG)
      } catch {
        // Registration failure is non-fatal; fallback replay will pick it up.
      }
    }
  }

  function finishSuccess() {
    if (selectedDay) localStorage.removeItem(`${DRAFT_PREFIX}${selectedDay.id}`)
    router.push('/workouts')
  }

  async function saveSession() {
    setSaving(true)
    const exercises = exerciseLogs.map((log) => ({
      plan_exercise_id: log.plan_exercise_id || null,
      sets_done: log.sets_done ? parseInt(log.sets_done) : null,
      reps_done: log.reps_done || null,
      weight_kg: log.weight_kg ? parseFloat(log.weight_kg) : null,
      notes: log.notes || null,
      rpe: log.rpe ? parseInt(log.rpe) : null,
    }))

    const body = JSON.stringify({
      action: 'log_session',
      date: today(),
      plan_day_id: selectedDay?.id || null,
      overall_notes: overallNotes || null,
      exercises,
    })

    const OFFLINE_MSG =
      'Rete assente. Allenamento salvato offline, verrà sincronizzato appena possibile.'

    // Fast-fail: the browser already knows we're offline — skip the wasted
    // fetch attempt and go straight to the queue.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueOffline(body)
      setSaving(false)
      setToast({ msg: OFFLINE_MSG, tone: 'warning' })
      setTimeout(finishSuccess, 1200)
      return
    }

    try {
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (res.ok) {
        // Parse reward payload before navigation so any cutscene has its
        // trigger data queued to the (layout-mounted) overlay host.
        try {
          const json = (await res.json()) as { reward?: Reward | null }
          const reward = json?.reward
          if (reward?.giga_drill) {
            fireGigaDrill(reward.giga_drill)
          }
          // Perfect Week marker — the server currently publishes this via
          // perfect_week_streak bumps in user_stats; when the backend adds an
          // explicit reward.perfect_week field, surface the toast immediately.
          const pw = (reward as unknown as { perfect_week?: { streak: number; resonance_mult: number } } | null)?.perfect_week
          if (pw) firePerfectWeek(pw)
        } catch {
          // Response wasn't JSON or was empty — saving still succeeded.
        }
        setSaving(false)
        finishSuccess()
        return
      }

      // 5xx: treat as transient — queue and redirect like offline success.
      if (res.status >= 500) {
        await queueOffline(body)
        setSaving(false)
        setToast({
          msg: 'Server non raggiungibile. Salvato offline, riproverò più tardi.',
          tone: 'warning',
        })
        setTimeout(finishSuccess, 1200)
        return
      }

      // 4xx: genuine client error — don't silently queue garbage.
      setSaving(false)
      setToast({ msg: 'Errore nel salvataggio. Controlla i dati.', tone: 'error' })
      setTimeout(() => setToast(null), 3000)
    } catch {
      // `fetch` threw → network layer is gone (DNS, captive portal, airplane).
      await queueOffline(body)
      setSaving(false)
      setToast({ msg: OFFLINE_MSG, tone: 'warning' })
      setTimeout(finishSuccess, 1200)
    }
  }

  if (!plan) {
    return (
      <div className="p-4 text-center py-12 text-muted-foreground">
        <p>Nessuna scheda attiva.</p>
      </div>
    )
  }

  if (step === 'select-day') {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Seleziona giorno</h1>
        </div>
        <div className="space-y-2">
          {plan.days?.map((day) => (
            <Card
              key={day.id}
              className={`transition-colors ${
                loadingDayId ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-accent'
              }`}
              onClick={() => selectDay(day)}
            >
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{day.day_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {day.exercises?.length || 0} esercizi
                  </p>
                </div>
                {loadingDayId === day.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'log-exercises') {
    const log = exerciseLogs[currentExIdx]
    const total = exerciseLogs.length
    const isLast = currentExIdx === total - 1
    const prog = progressions[log.plan_exercise_id]
    const prevPerf = lastPerformance[log.plan_exercise_id]

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              currentExIdx > 0 ? setCurrentExIdx((i) => i - 1) : setStep('select-day')
            }
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">{selectedDay?.day_name}</p>
            <h1 className="text-lg font-bold">{log.name}</h1>
          </div>
          <span className="ml-auto text-sm text-muted-foreground">
            {currentExIdx + 1}/{total}
          </span>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {exerciseLogs.map((_, i) => (
            <button
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= currentExIdx ? 'bg-primary' : 'bg-muted'
              }`}
              onClick={() => setCurrentExIdx(i)}
            />
          ))}
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Target badge + copy button */}
            {(prog || prevPerf) && (
              <div className="flex items-center justify-between">
                {prog ? (
                  <span className="text-xs font-medium text-primary">
                    🎯 Target:{' '}
                    {prog.target_weight_kg != null ? `${prog.target_weight_kg}kg × ` : ''}
                    {prog.target_sets != null && prog.target_reps != null
                      ? `${prog.target_sets}×${prog.target_reps}`
                      : prog.target_sets != null
                      ? `${prog.target_sets} serie`
                      : ''}
                  </span>
                ) : (
                  <span />
                )}
                {prevPerf && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      if (prevPerf.sets_done) updateLog('sets_done', prevPerf.sets_done)
                      if (prevPerf.reps_done) updateLog('reps_done', prevPerf.reps_done)
                      if (prevPerf.weight_kg) updateLog('weight_kg', prevPerf.weight_kg)
                    }}
                  >
                    Copia da ultima volta
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Serie eseguite</Label>
                <Input
                  type="number"
                  value={log.sets_done}
                  onChange={(e) => updateLog('sets_done', e.target.value)}
                  placeholder="3"
                />
              </div>
              <div className="space-y-1">
                <Label>Ripetizioni</Label>
                <Input
                  value={log.reps_done}
                  onChange={(e) => updateLog('reps_done', e.target.value)}
                  placeholder="8-12"
                />
              </div>
              <div className="space-y-1">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={log.weight_kg}
                  onChange={(e) => updateLog('weight_kg', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>RPE (1-10)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={log.rpe}
                  onChange={(e) => updateLog('rpe', e.target.value)}
                  placeholder="7"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note esercizio</Label>
              {previousNotes[log.plan_exercise_id] && (
                <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="mt-0.5 shrink-0">📝</span>
                  <span className="italic">
                    Ultima volta: {previousNotes[log.plan_exercise_id]}
                  </span>
                </div>
              )}
              <Textarea
                value={log.notes}
                onChange={(e) => updateLog('notes', e.target.value)}
                placeholder="Form, sensazioni, difficoltà..."
                className="h-20"
              />
            </div>
          </CardContent>
        </Card>

        {isLast ? (
          <Button className="w-full" onClick={() => setStep('summary')}>
            Riepilogo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="w-full" onClick={() => setCurrentExIdx((i) => i + 1)}>
            Prossimo esercizio
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  // Summary step
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStep('log-exercises')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Riepilogo sessione</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{selectedDay?.day_name}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {exerciseLogs.map((log, i) => (
              <div key={i} className="px-6 py-3">
                <p className="font-medium text-sm">{log.name}</p>
                <p className="text-xs text-muted-foreground">
                  {log.sets_done}×{log.reps_done}
                  {log.weight_kg && ` @ ${log.weight_kg}kg`}
                  {log.rpe && ` · RPE ${log.rpe}`}
                </p>
                {log.notes && (
                  <p className="text-xs text-muted-foreground italic mt-0.5">{log.notes}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1">
        <Label>Note generali sessione</Label>
        <Textarea
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
          placeholder="Come è andata la sessione?"
          className="h-24"
        />
      </div>

      <Button className="w-full" onClick={saveSession} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Check className="h-4 w-4" />}
        Salva Sessione
      </Button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-50 max-w-sm w-[calc(100%-2rem)] rounded-md px-4 py-3 text-sm shadow-lg ${
            toast.tone === 'warning'
              ? 'bg-amber-500/95 text-amber-950'
              : toast.tone === 'error'
              ? 'bg-red-500/95 text-red-50'
              : 'bg-emerald-500/95 text-emerald-50'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
