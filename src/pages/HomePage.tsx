import * as React from 'react'
import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ComparePanel } from '@/components/ComparePanel'
import { DailyStackedChart } from '@/components/DailyStackedChart'
import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { DebugPanel } from '@/components/DebugPanel'
import { KpiCard } from '@/components/KpiCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type DateRange,
  getDailySeries,
  getRangeBounds,
  getReferralList,
  getReferralMetrics,
  serializeIndex,
  type ReferralMetrics,
} from '@/lib/analytics'
import { buildDailyStackedSeries } from '@/lib/analytics/buildDailySeries'
import { useAnalytics } from '@/lib/analytics/context'
import { downloadFile, formatNumber, formatPercent, formatUsd, toCsvRow } from '@/lib/utils'

export function HomePage() {
  const { index, dateRange, setDateRange } = useAnalytics()
  if (!index || !dateRange) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading dashboard…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Import data to begin analysis.</p>
        </CardContent>
      </Card>
    )
  }

  const bounds = getRangeBounds(index)
  const range: DateRange = bounds ? dateRange : { start: dateRange.start, end: dateRange.end }

  const referralCodes = React.useMemo(() => getReferralList(index), [index])
  const metricsByCode = React.useMemo(() => {
    const entries = referralCodes.map((code) => [code, getReferralMetrics(index, code, range)])
    return Object.fromEntries(entries) as Record<string, ReferralMetrics>
  }, [index, referralCodes, range])

  const arpuRange = React.useMemo(() => {
    if (!bounds) return range
    return buildLast30Range(range.end, bounds.start, bounds.end)
  }, [bounds, range])

  const arpuByCode = React.useMemo(() => {
    const entries = referralCodes.map((code) => [code, getReferralMetrics(index, code, arpuRange)])
    return Object.fromEntries(entries) as Record<string, ReferralMetrics>
  }, [index, referralCodes, arpuRange])

  const globalMetrics = getReferralMetrics(index, 'all', range)
  const dailySeries = getDailySeries(index, 'all', range)

  const [compareSelection, setCompareSelection] = React.useState<string[]>([])
  const [signupsTopN, setSignupsTopN] = React.useState(8)
  const [feeTopN, setFeeTopN] = React.useState(8)

  const dailySignupsSeries = React.useMemo(
    () =>
      buildDailyStackedSeries({
        index,
        range,
        referralCodes,
        metric: 'signups',
        topN: signupsTopN,
        totalMode: 'global',
        lineMode: 'cumulative',
      }),
    [index, range, referralCodes, signupsTopN],
  )

  const dailyFeeSeries = React.useMemo(
    () =>
      buildDailyStackedSeries({
        index,
        range,
        referralCodes,
        metric: 'feeUsd',
        topN: feeTopN,
        totalMode: 'global',
        lineMode: 'cumulative',
      }),
    [index, range, referralCodes, feeTopN],
  )

  const exportLeaderboard = () => {
    const rows = referralCodes.map((code) => metricsByCode[code])
    const header = toCsvRow([
      'Referral',
      'Signups',
      'KYC Users',
      'Users With Revenue',
      'Fee USD',
      'Volume USD',
      'Conversion Rate',
      'Fee Per User',
      'Retention 30d',
      'Median Time To First Tx (days)',
    ])
    const body = rows
      .map((row) =>
        toCsvRow([
          row.code,
          row.signups,
          row.kycUsers,
          row.usersWithRevenueTx,
          row.feeUsd,
          row.volumeUsd,
          row.conversionRate,
          row.feePerUser,
          row.retention30d,
          row.timeToFirstTxMedianDays,
        ]),
      )
      .join('\n')
    downloadFile('leaderboard.csv', `${header}\n${body}`, 'text/csv')
  }

  const exportSnapshot = () => {
    const snapshot = serializeIndex(index)
    downloadFile('referral-snapshot.json', JSON.stringify(snapshot, null, 2), 'application/json')
  }

  const leaderboardColumns = (variant: 'revenue' | 'quality' | 'conversion' | 'kyc') => [
    {
      accessorKey: 'code',
      header: 'Referral',
      cell: ({ row }: any) => (
        <Link className="font-semibold text-primary" to={`/referral-detail/${row.original.code}`}>
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'signups',
      header: 'Signups',
      cell: ({ row }: any) => formatNumber(row.original.signups),
    },
    {
      accessorKey: 'usersWithRevenueTx',
      header: 'Users w/ Revenue',
      cell: ({ row }: any) => formatNumber(row.original.usersWithRevenueTx),
    },
    {
      accessorKey: variant === 'kyc' ? 'kycUsers' : 'feeUsd',
      header: variant === 'kyc' ? 'KYC Users' : 'Fee USD',
      cell: ({ row }: any) =>
        variant === 'kyc' ? formatNumber(row.original.kycUsers) : formatUsd(row.original.feeUsd),
    },
    {
      id: 'arpu30d',
      accessorFn: (row: ReferralMetrics) => arpuByCode[row.code]?.feePerUser ?? 0,
      header: 'ARPU 30d',
      cell: ({ row }: any) => formatUsd(arpuByCode[row.original.code]?.feePerUser ?? 0),
    },
    {
      accessorKey: variant === 'quality' ? 'feePerUser' : variant === 'kyc' ? 'kycRate' : 'conversionRate',
      header: variant === 'quality' ? 'Fee / User' : variant === 'kyc' ? 'KYC Rate' : 'Conversion',
      cell: ({ row }: any) =>
        variant === 'quality'
          ? formatUsd(row.original.feePerUser)
          : variant === 'kyc'
            ? formatPercent(row.original.kycRate)
            : formatPercent(row.original.conversionRate),
    },
    {
      accessorKey:
        variant === 'quality'
          ? 'retention30d'
          : variant === 'kyc'
            ? 'conversionRate'
            : 'timeToFirstTxMedianDays',
      header:
        variant === 'quality'
          ? 'Retention 30d'
          : variant === 'kyc'
            ? 'Conversion'
            : 'Median time to first tx',
      cell: ({ row }: any) =>
        variant === 'quality'
          ? formatPercent(row.original.retention30d)
          : variant === 'kyc'
            ? formatPercent(row.original.conversionRate)
            : `${row.original.timeToFirstTxMedianDays.toFixed(1)}d`,
    },
  ]

  const getSorted = (variant: 'revenue' | 'quality' | 'conversion' | 'kyc') => {
    const rows = referralCodes.map((code) => metricsByCode[code])
    switch (variant) {
      case 'quality':
        return rows.slice().sort((a, b) => b.feePerUser - a.feePerUser)
      case 'conversion':
        return rows.slice().sort((a, b) => b.conversionRate - a.conversionRate)
      case 'kyc':
        return rows.slice().sort((a, b) => b.kycRate - a.kycRate)
      default:
        return rows.slice().sort((a, b) => b.feeUsd - a.feeUsd)
    }
  }

  return (
    <div className="space-y-6">
      {bounds ? (
        <DateRangePicker
          range={range}
          min={bounds.start}
          max={bounds.end}
          onChange={setDateRange}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <KpiCard title="Signups" value={formatNumber(globalMetrics.signups)} />
        <KpiCard title="KYC Users" value={formatNumber(globalMetrics.kycUsers)} />
        <KpiCard
          title="Users with revenue"
          value={formatNumber(globalMetrics.usersWithRevenueTx)}
        />
        <KpiCard title="Volume USD" value={formatUsd(globalMetrics.volumeUsd)} />
        <KpiCard title="Fee USD" value={formatUsd(globalMetrics.feeUsd)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daily performance</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportLeaderboard}>
              Export leaderboard CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportSnapshot}>
              Export snapshot JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailySeries} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="fee" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number | string | undefined, name?: string | number) => {
                  const numeric = Number(value ?? 0)
                  if (name === 'feeUsd') return formatUsd(numeric)
                  return formatNumber(numeric)
                }}
              />
              <Area type="monotone" dataKey="feeUsd" stroke="#6366f1" fill="url(#fee)" />
              <Line type="monotone" dataKey="signups" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line
                type="monotone"
                dataKey="firstRevenueTxUsers"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <DailyStackedChart
          title="Daily signups by referral"
          metric="signups"
          data={dailySignupsSeries.data}
          keys={dailySignupsSeries.keys}
          topN={signupsTopN}
          topNOptions={[4, 8, 12]}
          onTopNChange={setSignupsTopN}
        />
        <DailyStackedChart
          title="Daily fee USD by referral"
          metric="feeUsd"
          data={dailyFeeSeries.data}
          keys={dailyFeeSeries.keys}
          topN={feeTopN}
          topNOptions={[4, 8, 12]}
          onTopNChange={setFeeTopN}
        />
      </div>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="conversion">Conversion</TabsTrigger>
          <TabsTrigger value="kyc">KYC</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue">
          <DataTable columns={leaderboardColumns('revenue')} data={getSorted('revenue')} />
        </TabsContent>
        <TabsContent value="quality">
          <DataTable columns={leaderboardColumns('quality')} data={getSorted('quality')} />
        </TabsContent>
        <TabsContent value="conversion">
          <DataTable columns={leaderboardColumns('conversion')} data={getSorted('conversion')} />
        </TabsContent>
        <TabsContent value="kyc">
          <DataTable columns={leaderboardColumns('kyc')} data={getSorted('kyc')} />
        </TabsContent>
      </Tabs>

      <ComparePanel
        referrals={referralCodes}
        metrics={metricsByCode}
        selected={compareSelection}
        onSelect={setCompareSelection}
      />

      <DebugPanel index={index} />
    </div>
  )
}

function buildLast30Range(endDate: string, min: string, max: string): DateRange {
  const endValue = endDate || max
  const end = new Date(endValue)
  const startValue = format(subDays(end, 29), 'yyyy-MM-dd')
  return {
    start: startValue < min ? min : startValue,
    end: endValue,
  }
}
