'use client'

import { useState, useEffect } from 'react'
import { WorkoutSession, SessionSet } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { normalizeSets, summarizeExercise } from '@/lib/workouts/tonnage'

type SessionExerciseRow = {
  id: string
  plan_exercise?: { name: string }
  sets: SessionSet[] | null
  sets_done: number | null
  reps_done: string | null
  weight_kg: number | null
  notes: string | null
}

export default function SessionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.sessionId as string
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [session, setSession] = useState<
    | (WorkoutSession & {
        plan_day?: { day_name: string }
        exercises?: SessionExerciseRow[]
      })
    | null
  >(null)

  useEffect(() => {
    fetch('/api/workouts?type=sessions&days=365')
      .then((r) => r.json())
      .then((data) => {
        setSessions(data)
        const found = data.find((s: WorkoutSession) => s.id === sessionId)
        setSession(found || null)
      })
  }, [sessionId])

  async function deleteSession() {
    await fetch(`/api/workouts?session=${sessionId}`, { method: 'DELETE' })
    router.push('/workouts')
  }

  if (!session) {
    return (
      <div className="p-4 text-center py-12 text-muted-foreground">
        Sessione non trovata.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{session.plan_day?.day_name || 'Sessione libera'}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(session.date)}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={deleteSession} className="text-destructive">
          <Trash2 className="h-5 w-5" />
        </Button>
      </div>

      {session.overall_notes && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm italic text-muted-foreground">{session.overall_notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Esercizi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {session.exercises?.map((ex) => {
              const sets = normalizeSets(ex.sets)
              return (
                <div key={ex.id} className="px-6 py-3">
                  <p className="font-medium text-sm">{ex.plan_exercise?.name || 'Esercizio'}</p>
                  {sets ? (
                    <div className="mt-1 space-y-0.5 font-mono tabular-nums text-xs text-muted-foreground">
                      {sets.map((s, i) => (
                        <p key={i}>
                          Serie {i + 1}: {s.weight}kg × {s.reps}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground font-mono tabular-nums">
                      {summarizeExercise(ex)}
                    </p>
                  )}
                  {ex.notes && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">{ex.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
