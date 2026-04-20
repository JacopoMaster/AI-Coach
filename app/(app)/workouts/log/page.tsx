'use client'

import { useState, useEffect } from 'react'
import { WorkoutPlan, WorkoutPlanDay, ExerciseProgression } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { today } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react'

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

  // Restore any existing draft on mount
  useEffect(() => {
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
      .then(setPlan)
  }, [])

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

    const res = await fetch('/api/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'log_session',
        date: today(),
        plan_day_id: selectedDay?.id || null,
        overall_notes: overallNotes || null,
        exercises,
      }),
    })

    setSaving(false)
    if (res.ok) {
      if (selectedDay) localStorage.removeItem(`${DRAFT_PREFIX}${selectedDay.id}`)
      router.push('/workouts')
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
    </div>
  )
}
