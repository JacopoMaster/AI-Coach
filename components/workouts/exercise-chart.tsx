'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { Loader2 } from 'lucide-react'

interface ChartPoint {
  label: string
  date: string
  actual: number
  target: number | null
  rpe: number | null
}

interface Props {
  exerciseId: string
  exerciseName: string
}

// Shared dark-mode chart style — mirrors body-charts.tsx
const GRID_COLOR = 'hsl(240 3.7% 15.9%)'
const AXIS_COLOR = 'hsl(240 5% 64.9%)'
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'hsl(240 10% 3.9%)',
    border: '1px solid hsl(240 3.7% 15.9%)',
    borderRadius: '0.5rem',
    fontSize: '12px',
  },
  labelStyle: { color: 'hsl(0 0% 98%)' },
}

export function ExerciseChart({ exerciseId, exerciseName }: Props) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/workouts?type=exercise_progress&exercise_id=${exerciseId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error)
        setData(res.chart_data || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [exerciseId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-xs">Caricamento dati...</span>
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-xs text-destructive text-center py-4">
        Errore: {error}
      </p>
    )
  }

  if (data.length < 2) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Dati insufficienti — sono necessarie almeno 2 sessioni per visualizzare il grafico.
      </p>
    )
  }

  const hasTargets = data.some((d) => d.target != null)

  // Y-axis domain with a bit of padding
  const allValues = data.flatMap((d) => [d.actual, d.target].filter((v): v is number => v != null))
  const minVal = Math.max(0, Math.floor(Math.min(...allValues) - 5))
  const maxVal = Math.ceil(Math.max(...allValues) + 5)

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-muted-foreground font-medium px-1">{exerciseName} — progressione peso</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              stroke={AXIS_COLOR}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9 }}
              stroke={AXIS_COLOR}
              domain={[minVal, maxVal]}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: number, name: string) => [`${value} kg`, name]}
            />
            {hasTargets && (
              <Legend
                wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
              />
            )}

            {/* Target line — dashed, secondary colour */}
            {hasTargets && (
              <Line
                type="monotone"
                dataKey="target"
                name="Target"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            )}

            {/* Actual line — solid, primary */}
            <Line
              type="monotone"
              dataKey="actual"
              name="Effettivo"
              stroke="hsl(0 0% 98%)"
              strokeWidth={2}
              dot={{ r: 2, fill: 'hsl(0 0% 98%)' }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
