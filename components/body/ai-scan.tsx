'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BodyMeasurement } from '@/lib/types'
import { Camera, Loader2, CheckCircle2, XCircle, ScanLine } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface AiScanProps {
  onSuccess: () => void
}

type ScanState = 'idle' | 'preview' | 'analyzing' | 'result' | 'error'

interface MetricItem {
  label: string
  value: number | null | undefined
  unit: string
}

export function AiScan({ onSuccess }: AiScanProps) {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<BodyMeasurement | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setScanState('preview')
    setResult(null)
    setErrorMsg('')
  }

  async function analyzeImage() {
    if (!selectedFile) return
    setScanState('analyzing')

    const formData = new FormData()
    formData.append('image', selectedFile)

    try {
      const res = await fetch('/api/body/scan', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore durante l\'analisi')
      setResult(data as BodyMeasurement)
      setScanState('result')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Errore sconosciuto')
      setScanState('error')
    }
  }

  function reset() {
    setScanState('idle')
    setPreviewUrl(null)
    setSelectedFile(null)
    setResult(null)
    setErrorMsg('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDone() {
    onSuccess()
    reset()
  }

  const metrics: MetricItem[] = result
    ? [
        { label: 'Peso', value: result.weight_kg, unit: 'kg' },
        { label: 'BMI', value: result.bmi, unit: '' },
        { label: 'Grasso', value: result.body_fat_pct, unit: '%' },
        { label: 'Muscolo', value: result.muscle_mass_kg, unit: 'kg' },
        { label: 'Acqua', value: result.water_pct, unit: '%' },
        { label: 'Gr. visc.', value: result.visceral_fat, unit: '' },
        { label: 'BMR', value: result.bmr, unit: 'kcal' },
        { label: 'Età corp.', value: result.metabolic_age, unit: 'anni' },
      ].filter((m) => m.value != null)
    : []

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Scan AI bilancia</span>
          <span className="text-xs text-muted-foreground ml-auto">FitDays</span>
        </div>

        {/* ── IDLE ─────────────────────────────────────────────────────────── */}
        {scanState === 'idle' && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              Scatta foto o carica screenshot
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              L&apos;AI legge automaticamente tutti i valori dalla share card FitDays
            </p>
          </>
        )}

        {/* ── PREVIEW / ANALYZING ──────────────────────────────────────────── */}
        {(scanState === 'preview' || scanState === 'analyzing') && previewUrl && (
          <div className="space-y-3">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Anteprima immagine bilancia"
                className="w-full max-h-52 object-contain rounded-lg border bg-muted"
              />
              {scanState === 'analyzing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-lg">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-xs font-medium">Analisi AI in corso...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={reset}
                disabled={scanState === 'analyzing'}
              >
                Annulla
              </Button>
              <Button
                className="flex-1"
                onClick={analyzeImage}
                disabled={scanState === 'analyzing'}
              >
                {scanState === 'analyzing' ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analisi...</>
                ) : (
                  'Analizza'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── RESULT ───────────────────────────────────────────────────────── */}
        {scanState === 'result' && result && (
          <div className="space-y-3">
            {/* Success badge */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Dati salvati — {formatDate(result.date)}
              </span>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-4 gap-2">
              {metrics.map(({ label, value, unit }) => (
                <div
                  key={label}
                  className="bg-muted rounded-lg p-2 text-center"
                >
                  <p className="text-sm font-bold leading-tight">
                    {value}{unit}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Nuova scan
              </Button>
              <Button className="flex-1" onClick={handleDone}>
                Aggiorna grafici
              </Button>
            </div>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {scanState === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-destructive">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-sm leading-relaxed">{errorMsg}</span>
            </div>
            <Button variant="outline" className="w-full" onClick={reset}>
              Riprova
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
