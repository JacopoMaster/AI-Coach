'use client'

import { useState, useEffect, useCallback } from 'react'
import { DietPlan, DietLog } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { today, formatDate } from '@/lib/utils'
import { Loader2, Salad } from 'lucide-react'

function MacroBar({
  label,
  value,
  target,
  color,
}: {
  label: string
  value: number
  target: number
  color: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {value}g <span className="text-muted-foreground">/ {target}g ({pct}%)</span>
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function DietPage() {
  const [plan, setPlan] = useState<DietPlan | null>(null)
  const [todayLog, setTodayLog] = useState<DietLog | null>(null)
  const [recentLogs, setRecentLogs] = useState<DietLog[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const [planRes, todayRes, logsRes] = await Promise.all([
      fetch('/api/diet?type=plan'),
      fetch('/api/diet?type=today'),
      fetch('/api/diet?type=logs&days=7'),
    ])
    if (planRes.ok) setPlan(await planRes.json())
    if (todayRes.ok) {
      const data = await todayRes.json()
      setTodayLog(data)
      if (data) {
        setForm({
          calories: String(data.calories || ''),
          protein_g: String(data.protein_g || ''),
          carbs_g: String(data.carbs_g || ''),
          fat_g: String(data.fat_g || ''),
          notes: data.notes || '',
        })
      }
    }
    if (logsRes.ok) setRecentLogs(await logsRes.json())
  }, [])

  useEffect(() => { load() }, [load])

  async function saveLog(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    await fetch('/api/diet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'log',
        date: today(),
        calories: form.calories ? parseInt(form.calories) : null,
        protein_g: form.protein_g ? parseInt(form.protein_g) : null,
        carbs_g: form.carbs_g ? parseInt(form.carbs_g) : null,
        fat_g: form.fat_g ? parseInt(form.fat_g) : null,
        notes: form.notes || null,
      }),
    })

    setSaving(false)
    setShowForm(false)
    load()
  }

  const caloriesPct = plan?.calories && todayLog?.calories
    ? Math.min(100, Math.round((todayLog.calories / plan.calories) * 100))
    : 0

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dieta</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {todayLog ? 'Modifica oggi' : 'Log oggi'}
        </Button>
      </div>

      {/* Today's log */}
      {todayLog ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Oggi – {formatDate(today())}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Calories */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{todayLog.calories || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {plan?.calories ? `di ${plan.calories} kcal obiettivo` : 'kcal'}
                </p>
              </div>
              {plan?.calories && (
                <div className="text-right">
                  <p className="text-sm font-medium">{caloriesPct}%</p>
                </div>
              )}
            </div>

            {plan && (
              <div className="space-y-2">
                <MacroBar label="Proteine" value={todayLog.protein_g || 0} target={plan.protein_g || 0} color="#22c55e" />
                <MacroBar label="Carboidrati" value={todayLog.carbs_g || 0} target={plan.carbs_g || 0} color="#f59e0b" />
                <MacroBar label="Grassi" value={todayLog.fat_g || 0} target={plan.fat_g || 0} color="#f97316" />
              </div>
            )}

            {!plan && (todayLog.protein_g || todayLog.carbs_g || todayLog.fat_g) && (
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="font-bold">{todayLog.protein_g || 0}g</p>
                  <p className="text-xs text-muted-foreground">proteine</p>
                </div>
                <div>
                  <p className="font-bold">{todayLog.carbs_g || 0}g</p>
                  <p className="text-xs text-muted-foreground">carboidrati</p>
                </div>
                <div>
                  <p className="font-bold">{todayLog.fat_g || 0}g</p>
                  <p className="text-xs text-muted-foreground">grassi</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Salad className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessun log per oggi.</p>
          </CardContent>
        </Card>
      )}

      {/* Log form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{todayLog ? 'Modifica log di oggi' : 'Log di oggi'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveLog} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Calorie (kcal)</Label>
                  <Input
                    type="number"
                    placeholder={plan?.calories ? String(plan.calories) : '2000'}
                    value={form.calories}
                    onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Proteine (g)</Label>
                  <Input
                    type="number"
                    placeholder={plan?.protein_g ? String(plan.protein_g) : '150'}
                    value={form.protein_g}
                    onChange={(e) => setForm((f) => ({ ...f, protein_g: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Carboidrati (g)</Label>
                  <Input
                    type="number"
                    placeholder={plan?.carbs_g ? String(plan.carbs_g) : '200'}
                    value={form.carbs_g}
                    onChange={(e) => setForm((f) => ({ ...f, carbs_g: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Grassi (g)</Label>
                  <Input
                    type="number"
                    placeholder={plan?.fat_g ? String(plan.fat_g) : '70'}
                    value={form.fat_g}
                    onChange={(e) => setForm((f) => ({ ...f, fat_g: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Note</Label>
                  <Textarea
                    placeholder="Pasti del giorno..."
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="h-20"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                Salva
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Active plan targets */}
      {plan && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Piano: {plan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-2xl font-bold">{plan.calories || '—'}</p>
                <p className="text-xs text-muted-foreground">kcal obiettivo</p>
              </div>
              <div className="space-y-1">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Proteine</span>
                  <span>{plan.protein_g || '—'}g</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Carboidrati</span>
                  <span>{plan.carbs_g || '—'}g</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Grassi</span>
                  <span>{plan.fat_g || '—'}g</span>
                </p>
              </div>
            </div>
            {plan.notes && <p className="text-xs text-muted-foreground mt-3">{plan.notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Recent logs */}
      {recentLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ultimi 7 giorni</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-6 py-3 text-sm">
                  <span className="text-muted-foreground">{formatDate(log.date)}</span>
                  <div className="text-right">
                    <p className="font-medium">{log.calories || '—'} kcal</p>
                    <p className="text-xs text-muted-foreground">
                      P:{log.protein_g || '—'}g C:{log.carbs_g || '—'}g G:{log.fat_g || '—'}g
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
