'use client'

import { useState, useEffect, useCallback } from 'react'
import { DietPlan } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, today } from '@/lib/utils'
import NutritionTracker from '@/components/diet/nutrition-tracker'

export default function DietPage() {
  const [plan, setPlan] = useState<DietPlan | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/diet?type=plan')
    if (res.ok) setPlan(await res.json())
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dieta</h1>
          <p className="text-xs text-muted-foreground">{formatDate(today())}</p>
        </div>
      </div>

      {/* Nutrition tracker con progress bar + lista voci + modal */}
      <NutritionTracker plan={plan} />

      {/* Piano attivo */}
      {plan && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Piano: {plan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-2xl font-bold font-mono tabular-nums">{plan.calories ?? '—'}</p>
                <p className="text-xs text-muted-foreground">kcal obiettivo</p>
              </div>
              <div className="space-y-1 font-mono tabular-nums">
                <p className="flex justify-between">
                  <span className="text-muted-foreground font-sans">Proteine</span>
                  <span className="text-resistenza">{plan.protein_g ?? '—'}g</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground font-sans">Carboidrati</span>
                  <span className="text-agilita">{plan.carbs_g ?? '—'}g</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground font-sans">Grassi</span>
                  <span className="text-forza">{plan.fat_g ?? '—'}g</span>
                </p>
              </div>
            </div>
            {plan.notes && <p className="text-xs text-muted-foreground mt-3">{plan.notes}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
