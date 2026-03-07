'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
  onSuccess: () => void
}

// FitDays CSV format parser
function parseFitDaysCSV(text: string) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''))

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/['"]/g, ''))
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = cols[i] || '' })

    const parseNum = (v: string) => v ? parseFloat(v) : null
    const parseIntSafe = (v: string) => v ? Number.parseInt(v, 10) : null

    return {
      date: row['date'] || row['时间'] || row['time'] || '',
      weight_kg: parseNum(row['weight(kg)'] || row['weight'] || row['体重(kg)'] || ''),
      body_fat_pct: parseNum(row['body fat(%)'] || row['fat(%)'] || row['体脂率(%)'] || ''),
      muscle_mass_kg: parseNum(row['muscle mass(kg)'] || row['muscle(kg)'] || row['肌肉量(kg)'] || ''),
      water_pct: parseNum(row['water(%)'] || row['body water(%)'] || row['水分率(%)'] || ''),
      bone_mass_kg: parseNum(row['bone mass(kg)'] || row['bone(kg)'] || row['骨量(kg)'] || ''),
      bmi: parseNum(row['bmi'] || ''),
      bmr: parseIntSafe(row['bmr(kcal)'] || row['bmr'] || row['基础代谢(kcal)'] || ''),
      visceral_fat: parseIntSafe(row['visceral fat'] || row['visceral fat grade'] || row['内脏脂肪'] || ''),
      metabolic_age: parseIntSafe(row['metabolic age'] || row['代谢年龄'] || ''),
    }
  }).filter((r) => r.date)
}

export function CsvImport({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setImported(null)

    try {
      const text = await file.text()
      const records = parseFitDaysCSV(text)

      if (records.length === 0) {
        setError('Nessun record trovato. Verifica il formato CSV FitDays.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Import fallito')
      }

      const data = await res.json()
      setImported(Array.isArray(data) ? data.length : records.length)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Import CSV FitDays</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="block cursor-pointer">
          <input
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="hidden"
            disabled={loading}
          />
          <div className="flex items-center justify-center gap-2 border-2 border-dashed border-muted rounded-lg p-6 hover:border-primary transition-colors">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {loading ? 'Import in corso...' : 'Seleziona CSV da FitDays'}
            </span>
          </div>
        </label>
        {imported !== null && (
          <div className="flex items-center gap-2 mt-3 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            {imported} misurazioni importate con successo
          </div>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
