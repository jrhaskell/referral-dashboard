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
import { SwapSankey } from '@/components/SwapSankey'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type DateRange,
  getDailySeries,
  getRangeBounds,
  getReferralList,
  getReferralMetrics,
  getSwapFlowSankeyData,
  getTopTokenTransactions,
  serializeIndex,
  type ReferralMetrics,
  type ReferralIndex,
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
  const lifetimeRange = bounds ?? range

  const referralCodes = React.useMemo(() => getReferralList(index), [index])
  const metricsByCode = React.useMemo(() => {
    const entries = referralCodes.map((code) => [code, getReferralMetrics(index, code, range)])
    return Object.fromEntries(entries) as Record<string, ReferralMetrics>
  }, [index, referralCodes, range])

  const avgLifetimeByCode = React.useMemo(() => {
    const entries = referralCodes.map((code) => {
      const referral = index.referrals.get(code)
      return [code, referral ? getAverageLifetimeDays(referral) : 0]
    })
    return Object.fromEntries(entries) as Record<string, number>
  }, [index, referralCodes])

  const lifetimeMetricsByCode = React.useMemo(() => {
    const entries = referralCodes.map((code) => [code, getReferralMetrics(index, code, lifetimeRange)])
    return Object.fromEntries(entries) as Record<string, ReferralMetrics>
  }, [index, referralCodes, lifetimeRange])

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
  const swapSankey = React.useMemo(
    () => getSwapFlowSankeyData(index, 'all', range, 24),
    [index, range],
  )
  const topTokenTransactions = React.useMemo(
    () => getTopTokenTransactions(index, 'all', range, 10),
    [index, range],
  )
  const [selectedTxTypes, setSelectedTxTypes] = React.useState<Set<string>>(() => new Set())
  const [hasInitializedTxTypes, setHasInitializedTxTypes] = React.useState(false)
  const tokenTypeTotals = React.useMemo(() => {
    const totals = new Map<string, number>()
    topTokenTransactions.forEach((entry) => {
      entry.categories.forEach((category) => {
        totals.set(category.category, (totals.get(category.category) ?? 0) + category.txCount)
      })
    })
    return totals
  }, [topTokenTransactions])

  const topTokenTypeSummary = React.useMemo(
    () => Array.from(tokenTypeTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [tokenTypeTotals],
  )

  const tokenTypeTotal = React.useMemo(() => {
    let total = 0
    tokenTypeTotals.forEach((value) => {
      total += value
    })
    return total
  }, [tokenTypeTotals])

  React.useEffect(() => {
    if (!hasInitializedTxTypes && topTokenTypeSummary.length) {
      setSelectedTxTypes(new Set(topTokenTypeSummary.map(([category]) => category)))
      setHasInitializedTxTypes(true)
    }
  }, [hasInitializedTxTypes, topTokenTypeSummary])

  const filteredTopTokens = React.useMemo(() => {
    if (!selectedTxTypes.size) return []
    return topTokenTransactions
      .map((entry) => {
        const categories = entry.categories.filter((category) => selectedTxTypes.has(category.category))
        if (!categories.length) return null
        const txCount = categories.reduce((sum, category) => sum + category.txCount, 0)
        const volumeUsd = categories.reduce((sum, category) => sum + category.volumeUsd, 0)
        return { ...entry, categories, txCount, volumeUsd }
      })
      .filter((entry): entry is (typeof topTokenTransactions)[number] => Boolean(entry))
      .sort((a, b) => b.volumeUsd - a.volumeUsd || b.txCount - a.txCount)
  }, [topTokenTransactions, selectedTxTypes])

  const handleToggleTxType = (category: string) => {
    setSelectedTxTypes((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

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
    const filename = `leaderboard-${format(new Date(), 'yyyy-MM-dd')}.csv`
    downloadFile(filename, `${header}\n${body}`, 'text/csv')
  }

  const exportSnapshot = () => {
    const snapshot = serializeIndex(index)
    const filename = `referral-snapshot-${format(new Date(), 'yyyy-MM-dd')}.json`
    downloadFile(filename, JSON.stringify(snapshot, null, 2), 'application/json')
  }

  const leaderboardColumns = (variant: 'revenue' | 'quality' | 'conversion' | 'kyc') => {
    const columns = [
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
        accessorFn: (row: ReferralMetrics) => {
          if (variant === 'quality') return row.feePerUser
          if (variant === 'kyc') return row.kycRate
          if (variant === 'revenue') return lifetimeMetricsByCode[row.code]?.conversionRate ?? 0
          return row.conversionRate
        },
        header: variant === 'quality' ? 'Fee / User' : variant === 'kyc' ? 'KYC Rate' : 'Conversion',
        cell: ({ row }: any) => {
          if (variant === 'quality') return formatUsd(row.original.feePerUser)
          if (variant === 'kyc') return formatPercent(row.original.kycRate)
          const value =
            variant === 'revenue'
              ? lifetimeMetricsByCode[row.original.code]?.conversionRate ?? 0
              : row.original.conversionRate
          return formatPercent(value)
        },
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
        accessorFn: (row: ReferralMetrics) => {
          if (variant === 'quality') return row.retention30d
          if (variant === 'kyc') return row.conversionRate
          if (variant === 'revenue') {
            return lifetimeMetricsByCode[row.code]?.timeToFirstTxMedianDays ?? 0
          }
          return row.timeToFirstTxMedianDays
        },
        cell: ({ row }: any) => {
          if (variant === 'quality') return formatPercent(row.original.retention30d)
          if (variant === 'kyc') return formatPercent(row.original.conversionRate)
          const value =
            variant === 'revenue'
              ? lifetimeMetricsByCode[row.original.code]?.timeToFirstTxMedianDays ?? 0
              : row.original.timeToFirstTxMedianDays
          return `${value.toFixed(1)}d`
        },
      },
    ]

    if (variant === 'revenue') {
      columns.splice(4, 0, {
        id: 'estimatedFee',
        header: 'Estimated fee',
        accessorFn: (row: ReferralMetrics) => {
          const arpu = arpuByCode[row.code]?.feePerUser ?? 0
          const conversionRate = lifetimeMetricsByCode[row.code]?.conversionRate ?? 0
          return row.signups * conversionRate * arpu
        },
        cell: ({ row }: any) => {
          const arpu = arpuByCode[row.original.code]?.feePerUser ?? 0
          const conversionRate = lifetimeMetricsByCode[row.original.code]?.conversionRate ?? 0
          return formatUsd(row.original.signups * conversionRate * arpu)
        },
      })
      columns.splice(6, 0, {
        id: 'kycRate',
        header: 'KYC rate',
        accessorFn: (row: ReferralMetrics) => row.kycRate,
        cell: ({ row }: any) => formatPercent(row.original.kycRate),
      })
      columns.push({
        id: 'avgLifetimeDays',
        header: 'Avg lifetime (days)',
        accessorFn: (row: ReferralMetrics) => avgLifetimeByCode[row.code] ?? 0,
        cell: ({ row }: any) => `${(avgLifetimeByCode[row.original.code] ?? 0).toFixed(1)}d`,
      })
    }

    return columns
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Top tokens by transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {filteredTopTokens.length ? (
            <div className="space-y-2">
              {topTokenTypeSummary.length ? (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {topTokenTypeSummary.map(([category]) => {
                    const isSelected = selectedTxTypes.has(category)
                    const share = tokenTypeTotal ? (tokenTypeTotals.get(category) ?? 0) / tokenTypeTotal : 0
                    return (
                      <Button
                        key={category}
                        size="sm"
                        variant={isSelected ? 'secondary' : 'outline'}
                        onClick={() => handleToggleTxType(category)}
                        className="h-7 gap-2"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: getTransactionTypeColor(category) }}
                        />
                        <span>{formatTransactionType(category)}</span>
                        <span className="text-muted-foreground">{formatPercent(share)}</span>
                      </Button>
                    )
                  })}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => {
                      setSelectedTxTypes(new Set(topTokenTypeSummary.map(([category]) => category)))
                      setHasInitializedTxTypes(true)
                    }}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => {
                      setSelectedTxTypes(new Set())
                      setHasInitializedTxTypes(true)
                    }}
                  >
                    None
                  </Button>
                </div>
              ) : null}
              <div className="grid grid-cols-[minmax(0,1fr)_120px_100px] text-xs font-medium text-muted-foreground">
                <span>Token</span>
                <span className="text-right">Tx count</span>
                <span className="text-right">Volume USD</span>
              </div>
              <div className="space-y-2">
                {filteredTopTokens.map((entry) => (
                  <div key={entry.symbol} className="space-y-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_120px_100px] items-center text-xs">
                      <span className="truncate font-medium">{entry.symbol}</span>
                      <span className="text-right">{formatNumber(entry.txCount)}</span>
                      <span className="text-right">{formatUsd(entry.volumeUsd)}</span>
                    </div>
                    {entry.categories.length ? (
                      <div className="flex h-4.5 w-full overflow-hidden rounded-full bg-muted">
                        {(() => {
                          const primary = entry.categories.slice(0, 5)
                          const remainder = entry.categories.slice(5)
                          const remainderCount = remainder.reduce((sum, item) => sum + item.txCount, 0)
                          const segments = remainderCount
                            ? [...primary, { category: 'Other types', txCount: remainderCount, volumeUsd: 0 }]
                            : primary

                          return segments
                            .filter((segment) => segment.txCount > 0)
                            .map((segment) => {
                              const percent = entry.txCount ? segment.txCount / entry.txCount : 0
                              return (
                                <div
                                  key={`${entry.symbol}-${segment.category}`}
                                  className="flex items-center justify-center text-[9px] font-semibold text-white"
                                  style={{
                                    width: `${Math.max(0, Math.min(1, percent)) * 100}%`,
                                    backgroundColor:
                                      segment.category === 'Other types'
                                        ? '#94a3b8'
                                        : getTransactionTypeColor(segment.category),
                                  }}
                                  title={`${formatTransactionType(segment.category)} ${formatPercent(percent)}`}
                                >
                                  {percent >= 0.12 ? formatPercent(percent) : ''}
                                </div>
                              )
                            })
                        })()}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">—</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No token data in this range.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Swap flow (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          <SwapSankey data={swapSankey} height={420} />
        </CardContent>
      </Card>

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

function getAverageLifetimeDays(referral: ReferralIndex) {
  let total = 0
  let count = 0
  referral.users.forEach((user) => {
    if (!user.firstRevenueTxAt || !user.lastRevenueTxAt) return
    const diffMs = Math.max(0, user.lastRevenueTxAt - user.firstRevenueTxAt)
    total += diffMs / 86400000
    count += 1
  })
  return count ? total / count : 0
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

const transactionTypeColors = ['#0ea5e9', '#22c55e', '#f97316', '#6366f1', '#e11d48', '#14b8a6', '#f59e0b']
const transactionTypeColorMap: Record<string, string> = {
  SWAP: '#0ea5e9',
  CROSS_SWAP: '#38bdf8',
  CRYPTO_DEPOSIT: '#22c55e',
  CRYPTO_WITHDRAW: '#16a34a',
  ON_RAMP: '#f97316',
  OFF_RAMP: '#f59e0b',
  LIQUIDITY_POOL_ADD: '#6366f1',
  LIQUIDITY_POOL_WITHDRAW: '#8b5cf6',
  LIQUIDITY_POOL_COLLECT_FEE: '#e11d48',
}

function formatTransactionType(label: string) {
  return label
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getTransactionTypeColor(label: string) {
  const key = label.trim().toUpperCase()
  if (transactionTypeColorMap[key]) return transactionTypeColorMap[key]
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 997
  }
  return transactionTypeColors[hash % transactionTypeColors.length]
}
