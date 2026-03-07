'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { BodyMeasurement } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  data: BodyMeasurement[]
}

function formatDate(d: string) {
  const date = new Date(d)
  return `${date.getDate()}/${date.getMonth() + 1}`
}

export function BodyCharts({ data }: Props) {
  const chartData = data.map((m) => ({
    date: formatDate(m.date),
    weight: m.weight_kg,
    fat: m.body_fat_pct,
    muscle: m.muscle_mass_kg,
  }))

  const chartProps = {
    margin: { top: 4, right: 4, bottom: 0, left: -20 },
  }

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: 'hsl(240 10% 3.9%)',
      border: '1px solid hsl(240 3.7% 15.9%)',
      borderRadius: '0.5rem',
      fontSize: '12px',
    },
    labelStyle: { color: 'hsl(0 0% 98%)' },
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Peso (kg)</CardTitle>
        </CardHeader>
        <CardContent className="h-40 p-2 pr-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(240 5% 64.9%)" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(240 5% 64.9%)" domain={['auto', 'auto']} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="weight" stroke="hsl(0 0% 98%)" strokeWidth={2} dot={false} name="Peso" unit=" kg" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composizione corporea (%)</CardTitle>
        </CardHeader>
        <CardContent className="h-40 p-2 pr-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(240 5% 64.9%)" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(240 5% 64.9%)" domain={['auto', 'auto']} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="fat" stroke="#f97316" strokeWidth={2} dot={false} name="Grasso" unit="%" />
              <Line type="monotone" dataKey="muscle" stroke="#22c55e" strokeWidth={2} dot={false} name="Muscolo" unit=" kg" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
