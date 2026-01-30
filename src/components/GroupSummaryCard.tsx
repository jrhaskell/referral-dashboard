import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GroupConcentration, GroupSummary } from '@/lib/analytics/groupQueries'
import { formatNumber, formatPercent, formatUsd } from '@/lib/utils'

type SummaryItem = {
  label: string
  value: string
}

export function GroupSummaryCard({
  summary,
  selectedCount,
  concentration,
  flags = [],
  title = 'Group summary',
  showSelectedCount = true,
  showConcentration = true,
  showFlags = true,
}: {
  summary: GroupSummary
  selectedCount?: number
  concentration?: GroupConcentration
  flags?: string[]
  title?: string
  showSelectedCount?: boolean
  showConcentration?: boolean
  showFlags?: boolean
}) {
  const safeConcentration = concentration ?? { top1Share: 0, top3Share: 0 }
  const primaryItems: SummaryItem[] = [
    ...(showSelectedCount
      ? [{ label: 'Referrals selected', value: formatNumber(selectedCount ?? 0) }]
      : []),
    { label: 'Total signups', value: formatNumber(summary.signups) },
    { label: 'Users with revenue tx', value: formatNumber(summary.usersWithRevenueTx) },
    { label: 'Total fee USD', value: formatUsd(summary.feeUsd) },
  ]

  const secondaryItems: SummaryItem[] = [
    { label: 'KYC users', value: formatNumber(summary.kycUsers) },
    { label: 'Total volume USD', value: formatUsd(summary.volumeUsd) },
    { label: 'Conversion rate', value: formatPercent(summary.conversionRate) },
    ...(summary.avgLifetimeDays !== undefined
      ? [{ label: 'Avg lifetime (days)', value: formatNumber(summary.avgLifetimeDays) }]
      : []),
    { label: 'Fee per active user', value: formatUsd(summary.feePerUser) },
  ]

  const concentrationItems: SummaryItem[] = [
    ...(showConcentration
      ? [
          { label: 'Top 1 fee share', value: formatPercent(safeConcentration.top1Share) },
          { label: 'Top 3 fee share', value: formatPercent(safeConcentration.top3Share) },
        ]
      : []),
    { label: 'KYC rate', value: formatPercent(summary.kycRate) },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`grid gap-4 text-sm ${summary.avgLifetimeDays !== undefined ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}
        >
          {primaryItems.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 text-sm md:grid-cols-4">
          {secondaryItems.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 text-sm md:grid-cols-3">
          {concentrationItems.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        {showFlags ? (
          <div>
            <p className="text-xs uppercase text-muted-foreground">Insights</p>
            {flags.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No major flags detected.</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
