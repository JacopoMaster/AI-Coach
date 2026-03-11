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
                <p className="text-2xl font-bold">{plan.calories ?? '—'}</p>
                <p className="text-xs text-muted-foreground">kcal obiettivo</p>
              </div>
              <div className="space-y-1">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Proteine</span>
                  <span>{plan.protein_g ?? '—'}g</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Carboidrati</span>
                  <span>{plan.carbs_g ?? '—'}g</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Grassi</span>
                  <span>{plan.fat_g ?? '—'}g</span>
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
