import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GroupConcentration, GroupSummary } from '@/lib/analytics/groupQueries'
import { formatNumber, formatPercent, formatUsd } from '@/lib/utils'

export function GroupSummaryCard({
  summary,
  selectedCount,
  concentration,
  flags,
}: {
  summary: GroupSummary
  selectedCount: number
  concentration: GroupConcentration
  flags: string[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Group summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Referrals selected</p>
            <p className="text-lg font-semibold">{formatNumber(selectedCount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total signups</p>
            <p className="text-lg font-semibold">{formatNumber(summary.signups)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Users with revenue tx</p>
            <p className="text-lg font-semibold">{formatNumber(summary.usersWithRevenueTx)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total fee USD</p>
            <p className="text-lg font-semibold">{formatUsd(summary.feeUsd)}</p>
          </div>
        </div>

        <div className="grid gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">KYC users</p>
            <p className="text-lg font-semibold">{formatNumber(summary.kycUsers)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total volume USD</p>
            <p className="text-lg font-semibold">{formatUsd(summary.volumeUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Conversion rate</p>
            <p className="text-lg font-semibold">{formatPercent(summary.conversionRate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fee per active user</p>
            <p className="text-lg font-semibold">{formatUsd(summary.feePerUser)}</p>
          </div>
        </div>

        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Top 1 fee share</p>
            <p className="text-lg font-semibold">{formatPercent(concentration.top1Share)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Top 3 fee share</p>
            <p className="text-lg font-semibold">{formatPercent(concentration.top3Share)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">KYC rate</p>
            <p className="text-lg font-semibold">{formatPercent(summary.kycRate)}</p>
          </div>
        </div>

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
      </CardContent>
    </Card>
  )
}
