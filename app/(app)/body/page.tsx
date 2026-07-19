'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { MeasurementForm } from '@/components/body/measurement-form'
import { CsvImport } from '@/components/body/csv-import'
import { AiScan } from '@/components/body/ai-scan'
import { BodyCharts } from '@/components/body/body-charts'
import { BodyMeasurement } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { getAppDate, getAppWeekStart } from '@/lib/date/app-date'
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react'

export default function BodyPage() {
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [showForm, setShowForm] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    const res = await fetch(`/api/body?days=${days}`)
    if (res.ok) setMeasurements(await res.json())
  }, [days])

  useEffect(() => { load() }, [load])

  async function deleteMeasurement(id: string) {
    await fetch(`/api/body?id=${id}`, { method: 'DELETE' })
    load()
  }

  const latest = measurements[measurements.length - 1]

  // ── Weekly weigh-in flag ──────────────────────────────────────────────────
  // Derived from the already-loaded `measurements` (no extra fetch). True when
  // at least one measurement with weight_kg falls between Monday-of-this-week
  // and today inclusive. The 30-day default window for `days` always covers a
  // full ISO week, so this stays correct regardless of the chart-range toggle.
  const weighedThisWeek = useMemo(() => {
    const monday = getAppWeekStart(getAppDate()) // Monday of this week, Europe/Rome (D002)
    return measurements.some(
      (m) =>
        m.date >= monday &&
        m.weight_kg != null &&
        Number(m.weight_kg) > 0
    )
  }, [measurements])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Corpo</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Aggiungi
        </Button>
      </div>

      {/* Weekly weigh-in streak indicator */}
      {weighedThisWeek ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Pesata settimanale completata</span>
        </div>
      ) : (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>Ricordati di pesarti questa settimana per la streak</span>
        </div>
      )}

      {/* Latest stats */}
      {latest && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground">
              Ultimo aggiornamento – {formatDate(latest.date)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              {latest.weight_kg && (
                <div>
                  <p className="text-2xl font-bold">{latest.weight_kg}</p>
                  <p className="text-xs text-muted-foreground">kg</p>
                </div>
              )}
              {latest.body_fat_pct && (
                <div>
                  <p className="text-2xl font-bold">{latest.body_fat_pct}%</p>
                  <p className="text-xs text-muted-foreground">grasso</p>
                </div>
              )}
              {latest.muscle_mass_kg && (
                <div>
                  <p className="text-2xl font-bold">{latest.muscle_mass_kg}</p>
                  <p className="text-xs text-muted-foreground">kg muscolo</p>
                </div>
              )}
              {latest.bmi && (
                <div>
                  <p className="text-2xl font-bold">{latest.bmi}</p>
                  <p className="text-xs text-muted-foreground">BMI</p>
                </div>
              )}
              {latest.bmr && (
                <div>
                  <p className="text-2xl font-bold">{latest.bmr}</p>
                  <p className="text-xs text-muted-foreground">BMR kcal</p>
                </div>
              )}
              {latest.visceral_fat && (
                <div>
                  <p className="text-2xl font-bold">{latest.visceral_fat}</p>
                  <p className="text-xs text-muted-foreground">grasso visc.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <MeasurementForm onSuccess={() => { setShowForm(false); load() }} />
      )}

      <AiScan onSuccess={load} />

      <CsvImport onSuccess={load} />

      {/* Charts */}
      {measurements.length > 1 && (
        <>
          <div className="flex items-center gap-2">
            {[30, 60, 90, 180].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'outline'}
                onClick={() => setDays(d)}
                className="text-xs px-3"
              >
                {d}gg
              </Button>
            ))}
          </div>
          <BodyCharts data={measurements} />
        </>
      )}

      {/* History list */}
      {measurements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Storico</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {[...measurements].reverse().map((m) => (
                <div key={m.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">{formatDate(m.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.weight_kg && `${m.weight_kg} kg`}
                      {m.body_fat_pct && ` · ${m.body_fat_pct}% grasso`}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMeasurement(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {measurements.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nessuna misurazione ancora.</p>
          <p className="text-sm mt-1">Aggiungi manualmente o importa da FitDays.</p>
        </div>
      )}
    </div>
  )
}
