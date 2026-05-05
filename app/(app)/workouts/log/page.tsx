'use client'

import { useState, useEffect } from 'react'
import { WorkoutPlan, WorkoutPlanDay, ExerciseProgression, SessionSet } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { today } from '@/lib/utils'
import { enqueue, SYNC_TAG } from '@/lib/offline/sync-queue'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Check, Loader2, Plus, Minus } from 'lucide-react'
import { fireCutscene, firePerfectWeek } from '@/lib/gamification/spiral-events'
import type { Reward } from '@/lib/gamification/types'
import type { CutscenePayload } from '@/components/gamification/UniversalCutscene'

// Per-set draft state — strings so empty inputs don't coerce to NaN.
type SetDraft = { reps: string; weight: string }

type ExerciseLog = {
  plan_exercise_id: string
  name: string
  sets: SetDraft[]
  notes: string
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

// Drain gamification cutscenes from the server: posts the freshly-earned
// `Reward` to /api/gamification/pending-events, gets back an ordered
// CutscenePayload[] (PR → Achievements → Level Up), and feeds it to the
// CutsceneHost queue one item at a time via fireCutscene. The host's FIFO
// serializes them so two simultaneous events never overlap.
async function drainPendingEvents(reward: Reward): Promise<void> {
  try {
    const res = await fetch('/api/gamification/pending-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reward }),
    })
    if (!res.ok) return
    const json = (await res.json()) as { events?: CutscenePayload[] }
    for (const evt of json.events ?? []) fireCutscene(evt)
  } catch {
    // Drain is best-effort — the workout save already succeeded.
  }
}

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

// Build the initial per-set drafts for an exercise based on its plan
// definition + any active mesocycle progression target. Returns one
// SetDraft per planned set, prefilled with the target weight/reps.
function buildInitialSets(
  planSets: number,
  defaultReps: string,
  defaultWeight: string
): SetDraft[] {
  const count = Math.max(1, Math.floor(planSets) || 1)
  return Array.from({ length: count }, () => ({
    reps: defaultReps,
    weight: defaultWeight,
  }))
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
      // Target reps: progression target → plan range low end → plan reps verbatim.
      const targetRepsRaw = prog?.target_reps != null ? String(prog.target_reps) : ex.reps
      const repsLowEnd = (() => {
        const m = String(targetRepsRaw).match(/\d+/)
        return m ? m[0] : ''
      })()
      const targetWeight =
        prog?.target_weight_kg != null
          ? String(prog.target_weight_kg)
          : ex.weight_kg != null
          ? String(ex.weight_kg)
          : ''
      const setCount = prog?.target_sets ?? ex.sets ?? 3
      return {
        plan_exercise_id: ex.id,
        name: ex.name,
        sets: buildInitialSets(setCount, repsLowEnd, targetWeight),
        notes: '',
      }
    })
    setExerciseLogs(logs)
    setCurrentExIdx(0)
    setLoadingDayId(null)
    setStep('log-exercises')
  }

  function updateSetField(setIdx: number, field: keyof SetDraft, value: string) {
    setExerciseLogs((prev) => {
      const next = [...prev]
      const ex = { ...next[currentExIdx] }
      const sets = ex.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s))
      ex.sets = sets
      next[currentExIdx] = ex
      return next
    })
  }

  function addSet() {
    setExerciseLogs((prev) => {
      const next = [...prev]
      const ex = { ...next[currentExIdx] }
      const last = ex.sets[ex.sets.length - 1]
      // Pre-fill the new row with the previous set's values — almost always
      // what the user wants on a straight-set scheme.
      ex.sets = [...ex.sets, last ? { ...last } : { reps: '', weight: '' }]
      next[currentExIdx] = ex
      return next
    })
  }

  function removeSet(setIdx: number) {
    setExerciseLogs((prev) => {
      const next = [...prev]
      const ex = { ...next[currentExIdx] }
      if (ex.sets.length <= 1) return prev
      ex.sets = ex.sets.filter((_, i) => i !== setIdx)
      next[currentExIdx] = ex
      return next
    })
  }

  function updateNotes(value: string) {
    setExerciseLogs((prev) => {
      const next = [...prev]
      next[currentExIdx] = { ...next[currentExIdx], notes: value }
      return next
    })
  }

  function copyFromLastTime(prevPerf: LastPerf) {
    setExerciseLogs((prev) => {
      const next = [...prev]
      const ex = { ...next[currentExIdx] }
      const setCount = prevPerf.sets_done
        ? Math.max(1, parseInt(prevPerf.sets_done, 10) || ex.sets.length)
        : ex.sets.length
      const repsLowEnd = (() => {
        const m = (prevPerf.reps_done || '').match(/\d+/)
        return m ? m[0] : ''
      })()
      ex.sets = Array.from({ length: setCount }, () => ({
        reps: repsLowEnd,
        weight: prevPerf.weight_kg || '',
      }))
      next[currentExIdx] = ex
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
    const exercises = exerciseLogs.map((log) => {
      const cleanSets: SessionSet[] = log.sets
        .map((s) => ({
          reps: s.reps ? parseInt(s.reps, 10) : NaN,
          weight: s.weight ? parseFloat(s.weight) : NaN,
        }))
        .filter((s) => Number.isFinite(s.reps) && Number.isFinite(s.weight))
      return {
        plan_exercise_id: log.plan_exercise_id || null,
        sets: cleanSets,
        notes: log.notes || null,
      }
    })

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
        // Drain server-side gamification events into the CutsceneHost queue
        // BEFORE we navigate away. The host is mounted at layout level so
        // events fired here keep playing on the next route.
        try {
          const json = (await res.json()) as { reward?: Reward | null }
          const reward = json?.reward

          // Perfect Week is a flash, not a cutscene — fire it independently
          // so it doesn't get serialized behind a Level Up.
          const pw = (reward as unknown as { perfect_week?: { streak: number; resonance_mult: number } } | null)?.perfect_week
          if (pw) firePerfectWeek(pw)

          // Anything else (PR, achievements, level up) flows through the
          // pending-events endpoint and is queued in order via fireCutscene.
          // The CutsceneHost's FIFO queue serializes them — no overlap.
          if (reward) await drainPendingEvents(reward)
        } catch {
          // Response wasn't JSON or drain failed — saving itself still
          // succeeded; the user just won't see post-workout cutscenes.
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
                    onClick={() => copyFromLastTime(prevPerf)}
                  >
                    Copia da ultima volta
                  </button>
                )}
              </div>
            )}

            {/* Per-set table */}
            <div className="space-y-2">
              <div className="grid grid-cols-[3rem_1fr_1fr_2rem] items-center gap-2 px-1 text-xs uppercase tracking-wide text-muted-foreground">
                <span>Serie</span>
                <span>Peso (kg)</span>
                <span>Reps</span>
                <span />
              </div>
              {log.sets.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[3rem_1fr_1fr_2rem] items-center gap-2"
                >
                  <span className="text-sm font-mono tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={s.weight}
                    onChange={(e) => updateSetField(i, 'weight', e.target.value)}
                    placeholder="0"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={s.reps}
                    onChange={(e) => updateSetField(i, 'reps', e.target.value)}
                    placeholder="0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSet(i)}
                    disabled={log.sets.length <= 1}
                    aria-label="Rimuovi serie"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addSet}
              >
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi serie
              </Button>
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
                onChange={(e) => updateNotes(e.target.value)}
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
            {exerciseLogs.map((log, i) => {
              const filled = log.sets.filter((s) => s.weight && s.reps)
              return (
                <div key={i} className="px-6 py-3">
                  <p className="font-medium text-sm">{log.name}</p>
                  {filled.length > 0 ? (
                    <p className="text-xs text-muted-foreground font-mono tabular-nums">
                      {filled
                        .map((s) => `${s.weight}kg × ${s.reps}`)
                        .join(' · ')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Nessuna serie loggata</p>
                  )}
                  {log.notes && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">{log.notes}</p>
                  )}
                </div>
              )
            })}
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
