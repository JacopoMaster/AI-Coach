'use client'

import { useState, useEffect } from 'react'
import { WorkoutSession } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'

export default function SessionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.sessionId as string
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [session, setSession] = useState<(WorkoutSession & { plan_day?: { day_name: string }, exercises?: Array<{ id: string, plan_exercise?: { name: string }, sets_done: number | null, reps_done: string | null, weight_kg: number | null, notes: string | null, rpe: number | null }> }) | null>(null)

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
            {session.exercises?.map((ex) => (
              <div key={ex.id} className="px-6 py-3">
                <p className="font-medium text-sm">{ex.plan_exercise?.name || 'Esercizio'}</p>
                <p className="text-xs text-muted-foreground">
                  {ex.sets_done && `${ex.sets_done}×`}{ex.reps_done}
                  {ex.weight_kg && ` @ ${ex.weight_kg}kg`}
                  {ex.rpe && ` · RPE ${ex.rpe}`}
                </p>
                {ex.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{ex.notes}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
