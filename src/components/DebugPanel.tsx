import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'
import type { AnalyticsIndex } from '@/lib/analytics'

export function DebugPanel({ index }: { index: AnalyticsIndex }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Debug panel</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
        <div>
          <span className="font-semibold text-foreground">Customers loaded:</span>{' '}
          {formatNumber(index.totals.customers)}
        </div>
        <div>
          <span className="font-semibold text-foreground">Tx lines parsed:</span>{' '}
          {formatNumber(index.totals.txLines)}
        </div>
        <div>
          <span className="font-semibold text-foreground">Revenue tx:</span>{' '}
          {formatNumber(index.totals.revenueTxCount)}
        </div>
        <div>
          <span className="font-semibold text-foreground">Unattributed tx:</span>{' '}
          {formatNumber(index.totals.unattributedTxCount)}
        </div>
        <div>
          <span className="font-semibold text-foreground">Referrals count:</span>{' '}
          {formatNumber(index.referrals.size)}
        </div>
      </CardContent>
    </Card>
  )
}
