import { Check } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { formatNumber, formatPercent, formatUsd } from '@/lib/utils'
import type { ReferralMetrics } from '@/lib/analytics'

export function ComparePanel({
  referrals,
  metrics,
  selected,
  onSelect,
}: {
  referrals: string[]
  metrics: Record<string, ReferralMetrics>
  selected: string[]
  onSelect: (next: string[]) => void
}) {
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onSelect(selected.filter((item) => item !== code))
      return
    }
    if (selected.length >= 5) return
    onSelect([...selected, code])
  }

  const selectedMetrics = selected.map((code) => metrics[code]).filter(Boolean)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Compare referrals (2-5)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {referrals.map((code) => (
            <label
              key={code}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs"
            >
              <Checkbox checked={selected.includes(code)} onCheckedChange={() => toggle(code)} />
              <span className="flex-1 text-sm font-medium">{code}</span>
              {selected.includes(code) ? <Check className="h-4 w-4 text-primary" /> : null}
            </label>
          ))}
        </div>
        {selectedMetrics.length ? (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Metric</th>
                  {selectedMetrics.map((metric) => (
                    <th key={metric.code} className="p-2">
                      {metric.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-2 text-muted-foreground">Signups</td>
                  {selectedMetrics.map((metric) => (
                    <td key={metric.code} className="p-2">
                      {formatNumber(metric.signups)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 text-muted-foreground">Users with revenue tx</td>
                  {selectedMetrics.map((metric) => (
                    <td key={metric.code} className="p-2">
                      {formatNumber(metric.usersWithRevenueTx)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 text-muted-foreground">Conversion rate</td>
                  {selectedMetrics.map((metric) => (
                    <td key={metric.code} className="p-2">
                      {formatPercent(metric.conversionRate)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 text-muted-foreground">Fee USD</td>
                  {selectedMetrics.map((metric) => (
                    <td key={metric.code} className="p-2">
                      {formatUsd(metric.feeUsd)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="p-2 text-muted-foreground">Fee per user</td>
                  {selectedMetrics.map((metric) => (
                    <td key={metric.code} className="p-2">
                      {formatUsd(metric.feePerUser)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 text-muted-foreground">Retention 30d</td>
                  {selectedMetrics.map((metric) => (
                    <td key={metric.code} className="p-2">
                      {formatPercent(metric.retention30d)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Select at least two codes to compare.</p>
        )}
      </CardContent>
    </Card>
  )
}
