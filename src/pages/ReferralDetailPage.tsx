import * as React from 'react'
import { useParams } from 'react-router-dom'
import { format, subDays } from 'date-fns'
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
  type AnalyticsIndex,
  type Customer,
  type DateRange,
  type ReferralIndex,
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

  const propagationMap = React.useMemo(() => buildPropagationMap(index), [index])
  const descendantCache = React.useMemo(() => {
    const cache = new Map<string, DescendantStats>()
    index.referralCodes.forEach((meta) => {
      buildDescendantStats(meta.code, propagationMap, cache)
    })
    buildDescendantStats(code, propagationMap, cache)
    return cache
  }, [index, propagationMap, code])

  const propagationStats = React.useMemo(() => {
    const stats = descendantCache.get(code) ?? { total: 0, maxDepth: 0 }
    const totalSignups = sumSignups(referral)
    const propagationRate = totalSignups ? stats.total / totalSignups : 0
    return {
      directChildren: propagationMap.get(code)?.length ?? 0,
      totalDescendants: stats.total,
      maxDepth: stats.maxDepth,
      propagationRate,
    }
  }, [code, descendantCache, propagationMap, referral])

  const avgPropagationRate = React.useMemo(
    () => buildAveragePropagationRate(index, descendantCache),
    [index, descendantCache],
  )

  const propagationGraph = React.useMemo(
    () => buildPropagationGraph(code, propagationMap, index),
    [code, propagationMap, index],
  )

  const propagationRanking = React.useMemo(() => {
    const entries = Array.from(index.referralCodes.values()).map((meta) => {
      const stats = descendantCache.get(meta.code) ?? { total: 0, maxDepth: 0 }
      return { code: meta.code, total: stats.total, maxDepth: stats.maxDepth }
    })

    if (!entries.find((entry) => entry.code === code)) {
      const stats = descendantCache.get(code) ?? { total: 0, maxDepth: 0 }
      entries.push({ code, total: stats.total, maxDepth: stats.maxDepth })
    }

    entries.sort((a, b) => b.maxDepth - a.maxDepth || b.total - a.total)
    const rankIndex = entries.findIndex((entry) => entry.code === code)

    return {
      leaders: entries.slice(0, 5),
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      total: entries.length,
    }
  }, [index, descendantCache, code])

  const hasPropagationGraph = propagationGraph.edges.length > 0

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
  const [adSpendInput, setAdSpendInput] = React.useState('')
  const [lifetimeMonthsInput, setLifetimeMonthsInput] = React.useState('1')

  React.useEffect(() => {
    setAdStart(dateRange.start)
    setAdEnd(dateRange.end)
  }, [dateRange.start, dateRange.end])

  const adRange = normalizeRange(adStart, adEnd, dateRange)
  const adMetrics = getReferralMetrics(index, code, adRange)

  const arpuRange = buildLast30Range(adEnd, bounds.start, bounds.end)
  const arpuMetrics = getReferralMetrics(index, code, arpuRange)

  const adSpendValue = Number(adSpendInput)
  const hasSpend = adSpendInput !== '' && Number.isFinite(adSpendValue) && adSpendValue > 0
  const lifetimeMonthsValue = Number(lifetimeMonthsInput)
  const lifetimeMonths =
    Number.isFinite(lifetimeMonthsValue) && lifetimeMonthsValue > 0 ? lifetimeMonthsValue : 0
  const lifetimeArpu = arpuMetrics.feePerUser * lifetimeMonths
  const estimatorKycRate = metrics.kycRate
  const estimatedActiveUsers = adMetrics.signups * estimatorKycRate
  const estimatedFee = estimatedActiveUsers * lifetimeArpu

  const estimatedRoas = hasSpend && lifetimeMonths ? estimatedFee / adSpendValue : null

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

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Propagation rate"
          value={formatPercent(propagationStats.propagationRate)}
          helper={`Avg ${formatPercent(avgPropagationRate)}`}
        />
        <KpiCard title="Direct referral codes" value={formatNumber(propagationStats.directChildren)} />
        <KpiCard title="Total descendant codes" value={formatNumber(propagationStats.totalDescendants)} />
        <KpiCard
          title="Propagation depth"
          value={formatNumber(propagationStats.maxDepth)}
          helper={
            propagationRanking.rank
              ? `Rank ${propagationRanking.rank}/${propagationRanking.total}`
              : 'Rank —'
          }
        />
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
          <CardTitle>Nodes & relationships</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Shows referral codes created by users invited from {code}. Drag nodes to rearrange. Depth limited to 3 levels.
          </p>
          {hasPropagationGraph ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <PropagationGraph graph={propagationGraph} />
              <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
                <p className="font-medium text-muted-foreground">Longest relationships</p>
                {propagationRanking.leaders.length ? (
                  <ol className="space-y-2">
                    {propagationRanking.leaders.map((leader, index) => (
                      <li key={leader.code} className="flex items-center justify-between gap-2">
                        <span
                          className={
                            leader.code === code
                              ? 'truncate font-semibold text-primary'
                              : 'truncate text-foreground'
                          }
                        >
                          {index + 1}. {leader.code}
                        </span>
                        <span className="text-muted-foreground">
                          Depth {leader.maxDepth} · {formatNumber(leader.total)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-muted-foreground">No propagation chains yet.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No downstream referral codes created yet.</p>
          )}
        </CardContent>
      </Card>

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
              <p className="text-xs text-muted-foreground">Lifetime months</p>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={lifetimeMonthsInput}
                onChange={(event) => setLifetimeMonthsInput(event.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Signups in ad window</p>
              <p className="text-lg font-semibold">{formatNumber(adMetrics.signups)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ARPU avg (last 30d)</p>
              <p className="text-lg font-semibold">{formatUsd(arpuMetrics.feePerUser)}</p>
              <p className="text-xs text-muted-foreground">
                {arpuRange.start} → {arpuRange.end}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">KYC rate</p>
              <p className="text-lg font-semibold">{formatPercent(estimatorKycRate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated active users</p>
              <p className="text-lg font-semibold">{formatNumber(estimatedActiveUsers)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lifetime ARPU</p>
              <p className="text-lg font-semibold">{formatUsd(lifetimeArpu)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated fee</p>
              <p className="text-lg font-semibold">{formatUsd(estimatedFee)}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Estimated ROAS</p>
              <p className="text-lg font-semibold">
                {hasSpend && estimatedRoas !== null ? estimatedRoas.toFixed(2) : '—'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Button variant="outline" size="sm" onClick={() => setAdSpendInput('')}>
                Clear spend
              </Button>
              <span>Estimated fee = signups × KYC rate × ARPU(30d) × lifetime months</span>
            </div>
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

type PropagationChild = {
  code: string
  creatorId: string
  creatorLabel: string
}

type PropagationMap = Map<string, PropagationChild[]>

type DescendantStats = {
  total: number
  maxDepth: number
}

type GraphNode = {
  id: string
  label: string
  type: 'referral' | 'user'
  level: number
  x: number
  y: number
  value?: number
}

type GraphEdge = {
  id: string
  from: string
  to: string
}

type GraphLayout = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width: number
  height: number
}

type NodePosition = {
  x: number
  y: number
}

const GRAPH_NODE_SIZE = 104
const GRAPH_NODE_WIDTH = GRAPH_NODE_SIZE
const GRAPH_NODE_HEIGHT = GRAPH_NODE_SIZE
const GRAPH_COL_GAP = 70
const GRAPH_ROW_GAP = 36
const GRAPH_MAX_DEPTH = 3
const GRAPH_MAX_CHILDREN = 6
const GRAPH_MAX_NODES = 60
const GRAPH_SPRING_DISTANCE = GRAPH_NODE_SIZE + GRAPH_COL_GAP
const GRAPH_SPRING_STRENGTH = 0.12
const GRAPH_DRAG_FOLLOW = 0.35
const GRAPH_DRAG_SECONDARY_FOLLOW = 0.18
const GRAPH_COLLISION_DISTANCE = GRAPH_NODE_SIZE * 1.05
const GRAPH_COLLISION_STRENGTH = 0.65
const GRAPH_REPULSION_DISTANCE = GRAPH_NODE_SIZE * 1.6
const GRAPH_REPULSION_STRENGTH = 0.2

function PropagationGraph({ graph }: { graph: GraphLayout }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const settleRef = React.useRef<number | null>(null)
  const adjacency = React.useMemo(() => {
    const map = new Map<string, string[]>()
    graph.edges.forEach((edge) => {
      map.set(edge.from, [...(map.get(edge.from) ?? []), edge.to])
      map.set(edge.to, [...(map.get(edge.to) ?? []), edge.from])
    })
    return map
  }, [graph.edges])
  const nodeTypes = React.useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.type])),
    [graph.nodes],
  )

  const [positions, setPositions] = React.useState(() =>
    new Map(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }])),
  )
  const [dragState, setDragState] = React.useState<{
    id: string
    offsetX: number
    offsetY: number
  } | null>(null)

  React.useEffect(() => {
    if (settleRef.current) {
      cancelAnimationFrame(settleRef.current)
      settleRef.current = null
    }
    setPositions(new Map(graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }])))
  }, [graph.nodes])

  const applyEdgeSpring = React.useCallback(
    (next: Map<string, NodePosition>, fixedId?: string) => {
      graph.edges.forEach((edge) => {
        const from = next.get(edge.from)
        const to = next.get(edge.to)
        if (!from || !to) return
        const dx = to.x - from.x
        const dy = to.y - from.y
        const distance = Math.max(1, Math.hypot(dx, dy))
        const diff = distance - GRAPH_SPRING_DISTANCE
        const adjust = diff * GRAPH_SPRING_STRENGTH
        const shiftX = (dx / distance) * adjust
        const shiftY = (dy / distance) * adjust

        const fromFixed = fixedId && edge.from === fixedId
        const toFixed = fixedId && edge.to === fixedId

        if (!fromFixed) {
          next.set(edge.from, {
            x: Math.max(0, from.x + shiftX),
            y: Math.max(0, from.y + shiftY),
          })
        }
        if (!toFixed) {
          next.set(edge.to, {
            x: Math.max(0, to.x - shiftX),
            y: Math.max(0, to.y - shiftY),
          })
        }
      })
    },
    [graph.edges],
  )

  const applyRepulsion = React.useCallback(
    (next: Map<string, NodePosition>, fixedId?: string) => {
      const entries = Array.from(next.entries())
      for (let i = 0; i < entries.length; i += 1) {
        const [idA] = entries[i]
        for (let j = i + 1; j < entries.length; j += 1) {
          const [idB] = entries[j]
          const typeA = nodeTypes.get(idA)
          const typeB = nodeTypes.get(idB)
          if (!typeA || !typeB || typeA !== typeB) continue

          const posA = next.get(idA)
          const posB = next.get(idB)
          if (!posA || !posB) continue
          const dx = posB.x - posA.x
          const dy = posB.y - posA.y
          const distance = Math.max(1, Math.hypot(dx, dy))

          if (distance >= GRAPH_REPULSION_DISTANCE) continue

          const isCollision = distance < GRAPH_COLLISION_DISTANCE
          const targetDistance = isCollision ? GRAPH_COLLISION_DISTANCE : GRAPH_REPULSION_DISTANCE
          const overlap = targetDistance - distance
          const strength = isCollision ? GRAPH_COLLISION_STRENGTH : GRAPH_REPULSION_STRENGTH
          const push = (overlap / distance) * strength
          const pushX = (dx / distance) * push
          const pushY = (dy / distance) * push

          const aFixed = fixedId && idA === fixedId
          const bFixed = fixedId && idB === fixedId

          if (!aFixed) {
            const factor = bFixed ? 1 : 0.5
            next.set(idA, {
              x: Math.max(0, posA.x - pushX * factor),
              y: Math.max(0, posA.y - pushY * factor),
            })
          }
          if (!bFixed) {
            const factor = aFixed ? 1 : 0.5
            next.set(idB, {
              x: Math.max(0, posB.x + pushX * factor),
              y: Math.max(0, posB.y + pushY * factor),
            })
          }
        }
      }
    },
    [nodeTypes],
  )

  React.useEffect(() => {
    if (!dragState) return

    const handleMove = (event: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = event.clientX - rect.left - dragState.offsetX
      const y = event.clientY - rect.top - dragState.offsetY

      setPositions((prev) => {
        const next = new Map(prev)
        const current = next.get(dragState.id)
        if (!current) return prev

        const newPos = { x: Math.max(0, x), y: Math.max(0, y) }
        const deltaX = newPos.x - current.x
        const deltaY = newPos.y - current.y
        next.set(dragState.id, newPos)

        const neighbors = adjacency.get(dragState.id) ?? []
        neighbors.forEach((neighborId) => {
          const neighbor = next.get(neighborId)
          if (!neighbor) return
          next.set(neighborId, {
            x: Math.max(0, neighbor.x + deltaX * GRAPH_DRAG_FOLLOW),
            y: Math.max(0, neighbor.y + deltaY * GRAPH_DRAG_FOLLOW),
          })
        })

        const secondary = new Set<string>()
        neighbors.forEach((neighborId) => {
          ;(adjacency.get(neighborId) ?? []).forEach((childId) => {
            if (childId !== dragState.id && !neighbors.includes(childId)) {
              secondary.add(childId)
            }
          })
        })
        secondary.forEach((childId) => {
          const child = next.get(childId)
          if (!child) return
          next.set(childId, {
            x: Math.max(0, child.x + deltaX * GRAPH_DRAG_SECONDARY_FOLLOW),
            y: Math.max(0, child.y + deltaY * GRAPH_DRAG_SECONDARY_FOLLOW),
          })
        })

        applyEdgeSpring(next, dragState.id)
        applyRepulsion(next, dragState.id)
        return next
      })
    }

    const handleUp = () => {
      setDragState(null)
      if (settleRef.current) {
        cancelAnimationFrame(settleRef.current)
        settleRef.current = null
      }
      let frames = 14
      const settle = () => {
        frames -= 1
        setPositions((prev) => {
          const next = new Map(prev)
          applyEdgeSpring(next)
          applyRepulsion(next)
          return next
        })
        if (frames > 0) {
          settleRef.current = requestAnimationFrame(settle)
        } else {
          settleRef.current = null
        }
      }
      settleRef.current = requestAnimationFrame(settle)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragState, adjacency, applyEdgeSpring, applyRepulsion])

  const bounds = React.useMemo(() => {
    let maxX = 0
    let maxY = 0
    positions.forEach((pos) => {
      maxX = Math.max(maxX, pos.x)
      maxY = Math.max(maxY, pos.y)
    })
    return {
      width: Math.max(graph.width, maxX + GRAPH_NODE_WIDTH + GRAPH_COL_GAP),
      height: Math.max(graph.height, maxY + GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
    }
  }, [positions, graph.width, graph.height])

  const width = Math.max(640, bounds.width)
  const height = Math.max(220, bounds.height)

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    event.preventDefault()
    if (settleRef.current) {
      cancelAnimationFrame(settleRef.current)
      settleRef.current = null
    }
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const position = positions.get(nodeId)
    if (!position) return
    setDragState({
      id: nodeId,
      offsetX: event.clientX - rect.left - position.x,
      offsetY: event.clientY - rect.top - position.y,
    })
  }

  return (
    <div className="overflow-x-auto">
      <div
        ref={containerRef}
        className="relative"
        style={{ width, height, minHeight: 220, touchAction: 'none' }}
      >
        <svg className="absolute inset-0" width={width} height={height}>
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from)
            const to = positions.get(edge.to)
            if (!from || !to) return null
            const startX = from.x + GRAPH_NODE_WIDTH / 2
            const startY = from.y + GRAPH_NODE_HEIGHT / 2
            const endX = to.x + GRAPH_NODE_WIDTH / 2
            const endY = to.y + GRAPH_NODE_HEIGHT / 2
            return (
              <path
                key={edge.id}
                d={`M ${startX} ${startY} L ${endX} ${endY}`}
                stroke="#94a3b8"
                strokeWidth="1.2"
                fill="none"
              />
            )
          })}
        </svg>
        {graph.nodes.map((node) => {
          const isReferral = node.type === 'referral'
          const position = positions.get(node.id) ?? { x: node.x, y: node.y }
          return (
            <div
              key={node.id}
              title={node.label}
              onPointerDown={(event) => handlePointerDown(event, node.id)}
              className={`absolute flex select-none flex-col items-center justify-center rounded-full border text-center text-xs shadow-sm transition-shadow ${
                isReferral
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-muted-foreground/30 bg-muted/40 text-foreground'
              } cursor-grab active:cursor-grabbing`}
              style={{
                left: position.x,
                top: position.y,
                width: GRAPH_NODE_WIDTH,
                height: GRAPH_NODE_HEIGHT,
              }}
            >
              <div className="w-full truncate px-2 text-[11px] font-semibold leading-tight">
                {truncateLabel(node.label)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isReferral ? `Signups ${formatNumber(node.value ?? 0)}` : 'Creator'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildPropagationMap(index: AnalyticsIndex): PropagationMap {
  const map = new Map<string, PropagationChild[]>()
  index.referralCodes.forEach((meta) => {
    if (!meta.createdBy) return
    const creator = index.customersById.get(meta.createdBy)
    if (!creator) return
    const parentCode = creator.referral.trim()
    if (!parentCode) return
    const entry: PropagationChild = {
      code: meta.code,
      creatorId: meta.createdBy,
      creatorLabel: formatCreatorLabel(creator, meta.createdBy),
    }
    const next = map.get(parentCode) ?? []
    next.push(entry)
    map.set(parentCode, next)
  })
  return map
}

function buildDescendantStats(
  code: string,
  map: PropagationMap,
  cache: Map<string, DescendantStats>,
  stack: Set<string> = new Set(),
): DescendantStats {
  const cached = cache.get(code)
  if (cached) return cached
  if (stack.has(code)) {
    return { total: 0, maxDepth: 0 }
  }

  stack.add(code)
  const children = map.get(code) ?? []
  let total = 0
  let maxDepth = 0
  children.forEach((child) => {
    if (stack.has(child.code)) return
    const childStats = buildDescendantStats(child.code, map, cache, stack)
    total += 1 + childStats.total
    maxDepth = Math.max(maxDepth, 1 + childStats.maxDepth)
  })
  stack.delete(code)

  const stats = { total, maxDepth }
  cache.set(code, stats)
  return stats
}

function sumSignups(referral: ReferralIndex) {
  let total = 0
  referral.signupsByDate.forEach((value) => {
    total += value
  })
  return total
}

function buildAveragePropagationRate(index: AnalyticsIndex, cache: Map<string, DescendantStats>) {
  let totalDescendants = 0
  let totalSignups = 0

  index.referralCodes.forEach((meta) => {
    const referral = index.referrals.get(meta.code)
    if (!referral) return
    const signups = sumSignups(referral)
    if (!signups) return
    totalSignups += signups
    totalDescendants += cache.get(meta.code)?.total ?? 0
  })

  return totalSignups ? totalDescendants / totalSignups : 0
}

function buildPropagationGraph(
  rootCode: string,
  map: PropagationMap,
  index: AnalyticsIndex,
): GraphLayout {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeById = new Map<string, GraphNode>()
  const levelCounts = new Map<number, number>()

  const addNode = (id: string, label: string, type: GraphNode['type'], level: number, value?: number) => {
    if (nodeById.has(id)) return
    const levelIndex = levelCounts.get(level) ?? 0
    const x = level * (GRAPH_NODE_WIDTH + GRAPH_COL_GAP)
    const y = levelIndex * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP)
    const node: GraphNode = { id, label, type, level, x, y, value }
    nodeById.set(id, node)
    nodes.push(node)
    levelCounts.set(level, levelIndex + 1)
  }

  const rootReferral = index.referrals.get(rootCode)
  const rootId = `ref:${rootCode}`
  addNode(rootId, rootCode, 'referral', 0, rootReferral ? sumSignups(rootReferral) : 0)

  const queue: Array<{ code: string; depth: number }> = [{ code: rootCode, depth: 0 }]
  const visited = new Set<string>([rootCode])

  while (queue.length && nodes.length < GRAPH_MAX_NODES) {
    const current = queue.shift()
    if (!current || current.depth >= GRAPH_MAX_DEPTH) continue
    const children = map.get(current.code) ?? []
    if (!children.length) continue

    const sortedChildren = children
      .slice()
      .sort((a, b) => {
        const aReferral = index.referrals.get(a.code)
        const bReferral = index.referrals.get(b.code)
        const aSignups = aReferral ? sumSignups(aReferral) : 0
        const bSignups = bReferral ? sumSignups(bReferral) : 0
        return bSignups - aSignups
      })
      .slice(0, GRAPH_MAX_CHILDREN)

    sortedChildren.forEach((child) => {
      if (nodes.length >= GRAPH_MAX_NODES) return
      const referralLevel = current.depth * 2
      const userLevel = referralLevel + 1
      const childLevel = referralLevel + 2

      const parentId = `ref:${current.code}`
      const userId = `user:${child.creatorId}`
      const childId = `ref:${child.code}`

      addNode(userId, child.creatorLabel || child.creatorId, 'user', userLevel)
      const childReferral = index.referrals.get(child.code)
      addNode(childId, child.code, 'referral', childLevel, childReferral ? sumSignups(childReferral) : 0)

      edges.push({ id: `${parentId}-${userId}`, from: parentId, to: userId })
      edges.push({ id: `${userId}-${childId}`, from: userId, to: childId })

      if (!visited.has(child.code)) {
        visited.add(child.code)
        queue.push({ code: child.code, depth: current.depth + 1 })
      }
    })
  }

  const maxX = nodes.reduce((max, node) => Math.max(max, node.x), 0)
  const maxY = nodes.reduce((max, node) => Math.max(max, node.y), 0)
  const width = maxX + GRAPH_NODE_WIDTH + GRAPH_COL_GAP
  const height = maxY + GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP

  return { nodes, edges, width, height }
}

function formatCreatorLabel(creator: Customer | undefined, fallback: string) {
  if (creator?.email) return creator.email
  if (creator?.id) return creator.id
  return fallback
}

function truncateLabel(value: string, max = 18) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
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

function buildLast30Range(adEnd: string, min: string, max: string): DateRange {
  const endValue = adEnd || max
  const endDate = new Date(endValue)
  const startDate = subDays(endDate, 29)
  const startValue = format(startDate, 'yyyy-MM-dd')
  return {
    start: startValue < min ? min : startValue,
    end: endValue,
  }
}

function formatFeeValue(value: number) {
  if (value < 1) return value.toFixed(2)
  if (value < 10) return value.toFixed(1)
  if (value < 100) return value.toFixed(0)
  return Math.round(value).toString()
}
