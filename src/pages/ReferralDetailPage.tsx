import * as React from 'react'
import { useParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { DailyStackedChart } from '@/components/DailyStackedChart'
import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { DebugPanel } from '@/components/DebugPanel'
import { KpiCard } from '@/components/KpiCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getDailySeries,
  getRangeBounds,
  getReferralMetrics,
  type UserAgg,
} from '@/lib/analytics'
import { buildDailyStackedSeries } from '@/lib/analytics/buildDailySeries'
import { useAnalytics } from '@/lib/analytics/context'
import { downloadFile, formatDate, formatNumber, formatPercent, formatUsd, toCsvRow } from '@/lib/utils'

export function ReferralDetailPage() {
  const { code } = useParams()
  const { index, dateRange, setDateRange } = useAnalytics()
  if (!index || !dateRange || !code) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading referral…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Import data to view referral insights.</p>
        </CardContent>
      </Card>
    )
  }

  const referral = index.referrals.get(code)
  const bounds = getRangeBounds(index)

  if (!referral || !bounds) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral not found</CardTitle>
        </CardHeader>
      </Card>
    )
  }

  const metrics = getReferralMetrics(index, code, dateRange)
  const dailySeries = getDailySeries(index, code, dateRange)
  const users = Array.from(referral.users.values())

  const dailySignupSeries = React.useMemo(
    () =>
      buildDailyStackedSeries({
        index,
        range: dateRange,
        referralCodes: [code],
        metric: 'signups',
        topN: 1,
        lineMode: 'cumulative',
      }),
    [index, dateRange, code],
  )

  const dailyFeeSeries = React.useMemo(
    () =>
      buildDailyStackedSeries({
        index,
        range: dateRange,
        referralCodes: [code],
        metric: 'feeUsd',
        topN: 1,
        lineMode: 'cumulative',
      }),
    [index, dateRange, code],
  )

  const usersWith2PlusTx = users.filter((user) => user.revenueTxCount >= 2).length

  const topUsers = users
    .filter((user) => user.revenueTxCount > 0)
    .sort((a, b) => b.feeUsd - a.feeUsd)
    .slice(0, 20)

  const [txPage, setTxPage] = React.useState(0)
  const pageSize = 20
  const sortedTxs = React.useMemo(
    () => [...referral.topRevenueTxs].sort((a, b) => b.createdAt - a.createdAt),
    [referral.topRevenueTxs],
  )
  const pagedTxs = sortedTxs.slice(txPage * pageSize, (txPage + 1) * pageSize)

  const feeDistribution = buildFeeDistribution(users)

  const topUsersFeeShare = topUsers.reduce((sum, user) => sum + user.feeUsd, 0)
  const feeConcentration = referral.feeUsdTotal ? topUsersFeeShare / referral.feeUsdTotal : 0

  const signupValues = Array.from(referral.signupsByDate.values())
  const signupMedian = signupValues.length
    ? signupValues.slice().sort((a, b) => a - b)[Math.floor(signupValues.length / 2)]
    : 0
  const signupMax = signupValues.length ? Math.max(...signupValues) : 0

  const flags = [
    metrics.signups > 50 && metrics.conversionRate < 0.1
      ? 'High signups with low conversion.'
      : null,
    feeConcentration > 0.6 ? 'Fee concentrated in top users.' : null,
    metrics.kycRate < 0.3 ? 'Low KYC rate.' : null,
    signupMax > signupMedian * 3 && signupMax > 10 ? 'Signup spike anomaly detected.' : null,
  ].filter(Boolean) as string[]

  const exportTopUsers = () => {
    const header = toCsvRow([
      'Wallet',
      'Fee USD',
      'Volume USD',
      'Tx Count',
      'First Tx At',
      'Time to First Tx (days)',
    ])
    const body = topUsers
      .map((user) =>
        toCsvRow([
          user.wallet,
          user.feeUsd,
          user.volumeUsd,
          user.revenueTxCount,
          user.firstRevenueTxAt ? new Date(user.firstRevenueTxAt).toISOString() : '',
          user.timeToFirstTxMs ? (user.timeToFirstTxMs / 86400000).toFixed(1) : '',
        ]),
      )
      .join('\n')
    downloadFile(`referral-${code}-top-users.csv`, `${header}\n${body}`, 'text/csv')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Referral {code}</h2>
          <p className="text-sm text-muted-foreground">Decision funnel, daily revenue, and top users.</p>
        </div>
        <Badge variant="outline">Users: {formatNumber(users.length)}</Badge>
      </div>

      <DateRangePicker range={dateRange} min={bounds.start} max={bounds.end} onChange={setDateRange} />

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Signups" value={formatNumber(metrics.signups)} />
        <KpiCard title="KYC Users" value={formatNumber(metrics.kycUsers)} />
        <KpiCard title="Users with revenue" value={formatNumber(metrics.usersWithRevenueTx)} />
        <KpiCard title="Retention 30d" value={formatPercent(metrics.retention30d)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funnel health</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Signups</p>
            <p className="text-lg font-semibold">{formatNumber(metrics.signups)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">KYC</p>
            <p className="text-lg font-semibold">{formatNumber(metrics.kycUsers)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Revenue users</p>
            <p className="text-lg font-semibold">{formatNumber(metrics.usersWithRevenueTx)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Users with 2+ tx</p>
            <p className="text-lg font-semibold">{formatNumber(usersWith2PlusTx)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fee & volume by day</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailySeries} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="fee-detail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="volume-detail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatUsd(Number(value))} />
              <Area type="monotone" dataKey="feeUsd" stroke="#0ea5e9" fill="url(#fee-detail)" />
              <Area type="monotone" dataKey="volumeUsd" stroke="#22c55e" fill="url(#volume-detail)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <DailyStackedChart
          title="Daily signups"
          metric="signups"
          data={dailySignupSeries.data}
          keys={dailySignupSeries.keys}
        />
        <DailyStackedChart
          title="Daily fee USD"
          metric="feeUsd"
          data={dailyFeeSeries.data}
          keys={dailyFeeSeries.keys}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fee per user distribution</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={feeDistribution} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="users" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Top users</CardTitle>
          <Button size="sm" variant="outline" onClick={exportTopUsers}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable columns={buildTopUsersColumns()} data={topUsers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Showing {referral.topRevenueTxs.length} transactions{' '}
            {index.options.keepFullTx ? 'stored in memory.' : '(limited list).'}
          </p>
          <DataTable columns={buildTxColumns()} data={pagedTxs} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {txPage + 1} of {Math.max(1, Math.ceil(sortedTxs.length / pageSize))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTxPage((prev) => Math.max(0, prev - 1))}
                disabled={txPage === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setTxPage((prev) =>
                    Math.min(prev + 1, Math.max(0, Math.ceil(sortedTxs.length / pageSize) - 1)),
                  )
                }
                disabled={txPage + 1 >= Math.ceil(sortedTxs.length / pageSize)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto flags</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.length ? (
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No anomalies detected in the current range.</p>
          )}
        </CardContent>
      </Card>

      <DebugPanel index={index} />
    </div>
  )
}

function buildTopUsersColumns() {
  return [
    {
      accessorKey: 'wallet',
      header: 'Wallet',
      cell: ({ row }: any) => (
        <span className="font-mono text-xs">{row.original.wallet}</span>
      ),
    },
    {
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: any) => formatUsd(row.original.feeUsd),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: any) => formatUsd(row.original.volumeUsd),
    },
    {
      accessorKey: 'revenueTxCount',
      header: 'Tx count',
      cell: ({ row }: any) => formatNumber(row.original.revenueTxCount),
    },
    {
      accessorKey: 'firstRevenueTxAt',
      header: 'First tx',
      cell: ({ row }: any) => formatDate(row.original.firstRevenueTxAt),
    },
    {
      accessorKey: 'timeToFirstTxMs',
      header: 'Time to first tx',
      cell: ({ row }: any) =>
        row.original.timeToFirstTxMs
          ? `${(row.original.timeToFirstTxMs / 86400000).toFixed(1)}d`
          : '—',
    },
  ]
}

function buildTxColumns() {
  return [
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }: any) => formatDate(row.original.createdAt),
    },
    {
      accessorKey: 'wallet',
      header: 'Wallet',
      cell: ({ row }: any) => (
        <span className="font-mono text-xs">{row.original.wallet}</span>
      ),
    },
    {
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: any) => formatUsd(row.original.feeUsd),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: any) => formatUsd(row.original.volumeUsd),
    },
    {
      accessorKey: 'hash',
      header: 'Hash',
      cell: ({ row }: any) => (
        <span className="font-mono text-xs">{row.original.hash ?? '—'}</span>
      ),
    },
  ]
}

function buildFeeDistribution(users: UserAgg[]) {
  const thresholds = [50, 200, 500, 1000, 5000]
  const labels = ['0-50', '50-200', '200-500', '500-1k', '1k-5k', '5k+']
  const counts = new Array(labels.length).fill(0)

  users.forEach((user) => {
    const fee = user.feeUsd
    const bucketIndex = thresholds.findIndex((limit) => fee < limit)
    const index = bucketIndex === -1 ? labels.length - 1 : bucketIndex
    counts[index] = (counts[index] ?? 0) + 1
  })

  return labels.map((label, idx) => ({
    bucket: label,
    users: counts[idx] ?? 0,
  }))
}
