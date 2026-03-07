'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { today } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface Props {
  onSuccess: () => void
}

export function MeasurementForm({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    date: today(),
    weight_kg: '',
    body_fat_pct: '',
    muscle_mass_kg: '',
    water_pct: '',
    bone_mass_kg: '',
    bmi: '',
    bmr: '',
    visceral_fat: '',
    metabolic_age: '',
    notes: '',
  })

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : k === 'date' || k === 'notes' ? v : Number(v)])
    )

    const res = await fetch('/api/body', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setLoading(false)
    if (res.ok) onSuccess()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Nuova Misurazione</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Data</Label>
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Peso (kg)</Label>
              <Input type="number" step="0.1" placeholder="75.0" value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Grasso (%)</Label>
              <Input type="number" step="0.1" placeholder="15.0" value={form.body_fat_pct} onChange={(e) => set('body_fat_pct', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Massa muscolare (kg)</Label>
              <Input type="number" step="0.1" placeholder="60.0" value={form.muscle_mass_kg} onChange={(e) => set('muscle_mass_kg', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Acqua (%)</Label>
              <Input type="number" step="0.1" placeholder="60.0" value={form.water_pct} onChange={(e) => set('water_pct', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Massa ossea (kg)</Label>
              <Input type="number" step="0.01" placeholder="3.0" value={form.bone_mass_kg} onChange={(e) => set('bone_mass_kg', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>BMI</Label>
              <Input type="number" step="0.1" placeholder="22.0" value={form.bmi} onChange={(e) => set('bmi', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>BMR (kcal)</Label>
              <Input type="number" placeholder="1800" value={form.bmr} onChange={(e) => set('bmr', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Grasso viscerale</Label>
              <Input type="number" placeholder="8" value={form.visceral_fat} onChange={(e) => set('visceral_fat', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Età metabolica</Label>
              <Input type="number" placeholder="28" value={form.metabolic_age} onChange={(e) => set('metabolic_age', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Note</Label>
              <Textarea placeholder="Note opzionali..." value={form.notes} onChange={(e) => set('notes', e.target.value)} className="h-20" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Salva Misurazione
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
