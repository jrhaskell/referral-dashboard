import * as React from 'react'
import { useParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { DailyStackedChart } from '@/components/DailyStackedChart'
import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { DebugPanel } from '@/components/DebugPanel'
import { GroupSummaryCard } from '@/components/GroupSummaryCard'
import { KpiCard } from '@/components/KpiCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  getDailySeries,
  getRangeBounds,
  getReferralMetrics,
  type UserAgg,
  type DateRange,
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

  const summary = {
    signups: metrics.signups,
    kycUsers: metrics.kycUsers,
    usersWithRevenueTx: metrics.usersWithRevenueTx,
    volumeUsd: metrics.volumeUsd,
    feeUsd: metrics.feeUsd,
    conversionRate: metrics.conversionRate,
    feePerUser: metrics.feePerUser,
    kycRate: metrics.kycRate,
  }

  const [adStart, setAdStart] = React.useState('')
  const [adEnd, setAdEnd] = React.useState('')
  const [conversionStart, setConversionStart] = React.useState('')
  const [conversionEnd, setConversionEnd] = React.useState('')
  const [adSpendInput, setAdSpendInput] = React.useState('')

  React.useEffect(() => {
    setAdStart(dateRange.start)
    setAdEnd(dateRange.end)
    setConversionStart(dateRange.start)
    setConversionEnd(dateRange.end)
  }, [dateRange.start, dateRange.end])

  const adRange = normalizeRange(adStart, adEnd, dateRange)
  const conversionRange = normalizeRange(conversionStart, conversionEnd, dateRange)
  const adMetrics = getReferralMetrics(index, code, adRange)
  const conversionMetrics = getReferralMetrics(index, code, conversionRange)

  const adSpendValue = Number(adSpendInput)
  const hasSpend = adSpendInput !== '' && Number.isFinite(adSpendValue) && adSpendValue > 0
  const estimatedFee =
    adMetrics.signups * conversionMetrics.conversionRate * conversionMetrics.feePerUser
  const estimatedRoas = hasSpend ? estimatedFee / adSpendValue : null

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

  const allUsers = users
    .filter((user) => user.revenueTxCount > 0)
    .sort((a, b) => b.feeUsd - a.feeUsd)

  const topUsersForFlags = allUsers.slice(0, 5)

  const [txPage, setTxPage] = React.useState(0)
  const pageSize = 20
  const sortedTxs = React.useMemo(
    () => [...referral.topRevenueTxs].sort((a, b) => b.createdAt - a.createdAt),
    [referral.topRevenueTxs],
  )
  const pagedTxs = sortedTxs.slice(txPage * pageSize, (txPage + 1) * pageSize)

  const feeDistribution = buildFeeDistribution(users)

  const topUsersFeeShare = topUsersForFlags.reduce((sum, user) => sum + user.feeUsd, 0)
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
    const body = allUsers
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
    downloadFile(`referral-${code}-users.csv`, `${header}\n${body}`, 'text/csv')
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

      <GroupSummaryCard
        title="Referral summary"
        summary={summary}
        showSelectedCount={false}
        showConcentration={false}
        showFlags={false}
      />

      <Card>
        <CardHeader>
          <CardTitle>Ad insertion ROAS estimator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Ad start</p>
              <Input
                type="date"
                min={bounds.start}
                max={bounds.end}
                value={adStart}
                onChange={(event) => setAdStart(event.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ad end</p>
              <Input
                type="date"
                min={bounds.start}
                max={bounds.end}
                value={adEnd}
                onChange={(event) => setAdEnd(event.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ad spend (USD)</p>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={adSpendInput}
                onChange={(event) => setAdSpendInput(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Conversion window start</p>
              <Input
                type="date"
                min={bounds.start}
                max={bounds.end}
                value={conversionStart}
                onChange={(event) => setConversionStart(event.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conversion window end</p>
              <Input
                type="date"
                min={bounds.start}
                max={bounds.end}
                value={conversionEnd}
                onChange={(event) => setConversionEnd(event.target.value)}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Signups in ad window</p>
              <p className="text-lg font-semibold">{formatNumber(adMetrics.signups)}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Conversion rate</p>
              <p className="text-lg font-semibold">
                {formatPercent(conversionMetrics.conversionRate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fee per active user</p>
              <p className="text-lg font-semibold">{formatUsd(conversionMetrics.feePerUser)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated fee</p>
              <p className="text-lg font-semibold">{formatUsd(estimatedFee)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated ROAS</p>
              <p className="text-lg font-semibold">
                {hasSpend && estimatedRoas !== null ? estimatedRoas.toFixed(2) : '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" onClick={() => setAdSpendInput('')}>
              Clear spend
            </Button>
            <span>Estimated fee = signups × conversion rate × fee per active user</span>
          </div>
        </CardContent>
      </Card>

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
              <Tooltip formatter={(value: number | string | undefined) => formatUsd(Number(value ?? 0))} />
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
            <ComposedChart
              data={feeDistribution.data}
              margin={{ left: 8, right: 24, top: 16, bottom: 0 }}
              barCategoryGap="25%"
              barGap={2}
              barSize={9}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="bucketMid"
                scale="log"
                domain={[feeDistribution.minPosition, 'dataMax']}
                ticks={feeDistribution.ticks}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatFeeValue(Number(value))}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0]?.payload as { bucket?: string; users?: number }
                  return (
                    <div className="rounded-md border bg-popover p-2 text-xs shadow">
                      <div className="font-semibold">{row.bucket}</div>
                      <div className="text-muted-foreground">
                        Users: {formatNumber(Number(row.users ?? 0))}
                      </div>
                    </div>
                  )
                }}
              />
              {feeDistribution.averagePosition ? (
                <ReferenceLine
                  x={feeDistribution.averagePosition}
                  stroke="#0ea5e9"
                  strokeDasharray="4 4"
                  label={{
                    value: `Avg ${formatUsd(feeDistribution.average)}`,
                    position: 'top',
                    fill: '#0ea5e9',
                    fontSize: 12,
                  }}
                />
              ) : null}
              {feeDistribution.medianPosition ? (
                <ReferenceLine
                  x={feeDistribution.medianPosition}
                  stroke="#f97316"
                  strokeDasharray="4 4"
                  label={{
                    value: `Median ${formatUsd(feeDistribution.median)}`,
                    position: 'top',
                    fill: '#f97316',
                    fontSize: 12,
                  }}
                />
              ) : null}
              <Bar dataKey="users" fill="#6366f1" minPointSize={2} />
              <Line type="monotone" dataKey="users" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </ComposedChart>
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
          <DataTable columns={buildTopUsersColumns()} data={allUsers} enablePagination pageSize={20} />
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
  const fees = users
    .filter((user) => user.revenueTxCount > 0)
    .map((user) => user.feeUsd)
    .sort((a, b) => a - b)

  const maxFee = fees[fees.length - 1] ?? 0
  const bucketEdges = buildBucketEdges(maxFee)

  const counts = new Array(bucketEdges.length - 1).fill(0)
  fees.forEach((fee) => {
    const index = bucketEdges.findIndex((edge, idx) => {
      const nextEdge = bucketEdges[idx + 1]
      if (nextEdge === undefined) return false
      if (idx === bucketEdges.length - 2) return fee >= edge && fee <= nextEdge
      return fee >= edge && fee < nextEdge
    })
    if (index >= 0) counts[index] = (counts[index] ?? 0) + 1
  })

  const data = counts.map((count, index) => {
    const start = bucketEdges[index]
    const end = bucketEdges[index + 1]
    const startLabel = formatFeeValue(start)
    const endLabel = formatFeeValue(end)
    const label = `${startLabel}-${endLabel}`
    const bucketMid = start === 0 ? end / 2 : Math.sqrt(start * end)
    return { bucket: label, users: count, start, end, bucketMid }
  })

  const ticks = buildLogTicks(data)

  const average = fees.length ? fees.reduce((sum, fee) => sum + fee, 0) / fees.length : 0
  const median = fees.length
    ? fees.length % 2
      ? fees[Math.floor(fees.length / 2)]
      : (fees[fees.length / 2 - 1] + fees[fees.length / 2]) / 2
    : 0

  const minPosition = data[0]?.bucketMid ?? 0.1
  const averagePosition = fees.length ? Math.max(average, minPosition) : minPosition
  const medianPosition = fees.length ? Math.max(median, minPosition) : minPosition

  return {
    data,
    ticks,
    average,
    median,
    averagePosition,
    medianPosition,
    minPosition,
  }
}

function buildBucketEdges(maxFee: number) {
  const edges = [0]
  const bases = [1, 2, 5]
  let power = -1

  while (edges[edges.length - 1] < maxFee) {
    const scale = Math.pow(10, power)
    bases.forEach((base) => {
      const value = Number((base * scale).toFixed(8))
      if (value > edges[edges.length - 1]) edges.push(value)
    })
    power += 1
    if (power > 8) break
  }

  if (edges[edges.length - 1] < maxFee) {
    edges.push(maxFee)
  }

  return edges
}

function buildLogTicks(data: Array<{ bucketMid: number }>, maxTicks = 24) {
  if (!data.length) return []
  const lowCutoff = 5
  const lowTicks = data.filter((row) => row.bucketMid <= lowCutoff).map((row) => row.bucketMid)
  const remaining = data.filter((row) => row.bucketMid > lowCutoff).map((row) => row.bucketMid)
  const step = Math.max(1, Math.ceil(remaining.length / Math.max(1, maxTicks - lowTicks.length)))
  const highTicks = remaining.filter((_, index) => index % step === 0)
  return [...lowTicks, ...highTicks]
}

function normalizeRange(start: string, end: string, fallback: DateRange): DateRange {
  const startValue = start || fallback.start
  const endValue = end || fallback.end
  if (startValue > endValue) return { start: endValue, end: startValue }
  return { start: startValue, end: endValue }
}

function formatFeeValue(value: number) {
  if (value < 1) return value.toFixed(2)
  if (value < 10) return value.toFixed(1)
  if (value < 100) return value.toFixed(0)
  return Math.round(value).toString()
}
