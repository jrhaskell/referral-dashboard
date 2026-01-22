import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber, formatUsd } from '@/lib/utils'
import type { DailyMetric } from '@/lib/analytics/buildDailySeries'

const DEFAULT_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#22c55e',
  '#f97316',
  '#e11d48',
  '#14b8a6',
  '#facc15',
  '#a855f7',
  '#64748b',
]

export type DailyStackedChartProps = {
  title: string
  metric: DailyMetric
  data: Array<Record<string, number | string>>
  keys: string[]
  topN?: number
  topNOptions?: number[]
  onTopNChange?: (value: number) => void
  lineKey?: string
}

export function DailyStackedChart({
  title,
  metric,
  data,
  keys,
  topN,
  topNOptions,
  onTopNChange,
  lineKey = 'totalLine',
}: DailyStackedChartProps) {
  const totalSum = data.reduce((sum, item) => sum + (Number(item.total) || 0), 0)

  const valueFormatter = metric === 'feeUsd' ? formatUsd : formatNumber

  if (!data.length || totalSum === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available in this range.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        {topNOptions && onTopNChange ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Top codes</span>
            <Select
              value={String(topN ?? topNOptions[0])}
              onValueChange={(value) => onTopNChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[84px]">
                <SelectValue placeholder="Top N" />
              </SelectTrigger>
              <SelectContent>
                {topNOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => format(new Date(value), 'MM-dd')}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => valueFormatter(Number(value))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => valueFormatter(Number(value))}
            />
            <Tooltip
              formatter={(value: number) => valueFormatter(Number(value))}
              labelFormatter={(label) => format(new Date(label), 'yyyy-MM-dd')}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as Record<string, number | string>
                const total = row?.total ? Number(row.total) : 0
                const entries = keys.map((key) => ({ key, value: Number(row?.[key] ?? 0) }))
                return (
                  <div className="rounded-md border bg-popover p-3 text-xs shadow">
                    <div className="mb-2 font-semibold">{format(new Date(label ?? ''), 'yyyy-MM-dd')}</div>
                    <div className="mb-2 text-[11px] text-muted-foreground">
                      Total: {valueFormatter(total)}
                    </div>
                    <div className="space-y-1">
                      {entries.map((entry) => (
                        <div key={entry.key} className="flex items-center justify-between gap-3">
                          <span className="truncate">{entry.key}</span>
                          <span className="font-medium">{valueFormatter(entry.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }}
            />
            <Legend verticalAlign="top" height={36} />
            {keys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                yAxisId="left"
                stackId="stack"
                fill={key === 'OTHER' ? '#94a3b8' : DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
            <Line
              type="monotone"
              yAxisId="right"
              dataKey={lineKey}
              stroke="#111827"
              strokeWidth={2}
              dot={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
