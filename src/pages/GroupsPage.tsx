import * as React from 'react'
import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'

import { DailyStackedChart } from '@/components/DailyStackedChart'
import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { GroupSummaryCard } from '@/components/GroupSummaryCard'
import { KpiCard } from '@/components/KpiCard'
import { ReferralMultiSelect } from '@/components/ReferralMultiSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getRangeBounds,
  getReferralList,
  type DateRange,
  type ReferralMetrics,
} from '@/lib/analytics'
import {
  buildGroupStackedSeries,
  buildGroupTotalSeries,
  getGroupConcentration,
  getGroupLeaderboard,
  getGroupSummary,
} from '@/lib/analytics/groupQueries'
import { useAnalytics } from '@/lib/analytics/context'
import { formatNumber, formatPercent, formatUsd } from '@/lib/utils'

type GroupMode = 'totals' | 'compare'

type GroupLeaderboardRow = ReferralMetrics & {
  isTotal?: boolean
}

type SavedGroup = {
  id: string
  name: string
  codes: string[]
}

const STORAGE_KEY = 'referral-groups'

function loadSavedGroups(): SavedGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as SavedGroup[]
  } catch (error) {
    return []
  }
}

function persistSavedGroups(groups: SavedGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

export function GroupsPage() {
  const { index, dateRange, setDateRange } = useAnalytics()

  const normalizeRange = React.useCallback(
    (start: string, end: string, fallback: DateRange): DateRange => {
      const startValue = start || fallback.start
      const endValue = end || fallback.end
      if (startValue > endValue) return { start: endValue, end: startValue }
      return { start: startValue, end: endValue }
    },
    [],
  )

  const buildLast30Range = React.useCallback((endDate: string, min: string, max: string) => {
    const endValue = endDate || max
    const end = new Date(endValue)
    const startValue = format(subDays(end, 29), 'yyyy-MM-dd')
    return {
      start: startValue < min ? min : startValue,
      end: endValue,
    }
  }, [])


  if (!index || !dateRange) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading groups…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Import data to build referral groups.</p>
        </CardContent>
      </Card>
    )
  }

  const bounds = getRangeBounds(index)
  const range: DateRange = bounds ? dateRange : { start: dateRange.start, end: dateRange.end }
  const boundsStart = bounds?.start ?? range.start
  const boundsEnd = bounds?.end ?? range.end

  const referralCodes = React.useMemo(() => getReferralList(index), [index])

  const [selectedCodes, setSelectedCodes] = React.useState<string[]>([])
  const [mode, setMode] = React.useState<GroupMode>('compare')
  const [signupsTopN, setSignupsTopN] = React.useState(8)
  const [feeTopN, setFeeTopN] = React.useState(8)
  const [groupName, setGroupName] = React.useState('')
  const [savedGroups, setSavedGroups] = React.useState<SavedGroup[]>(() => loadSavedGroups())
  const [leaderboardQuery, setLeaderboardQuery] = React.useState('')
  const [adStart, setAdStart] = React.useState('')
  const [adEnd, setAdEnd] = React.useState('')
  const [adSpendInput, setAdSpendInput] = React.useState('')
  const [lifetimeMonthsInput, setLifetimeMonthsInput] = React.useState('1')

  React.useEffect(() => {
    persistSavedGroups(savedGroups)
  }, [savedGroups])

  React.useEffect(() => {
    setAdStart(range.start)
    setAdEnd(range.end)
  }, [range.start, range.end])

  const allMetrics = React.useMemo(
    () => getGroupLeaderboard(index, range, referralCodes) as GroupLeaderboardRow[],
    [index, range, referralCodes],
  )

  const selectedMetrics = React.useMemo(
    () => getGroupLeaderboard(index, range, selectedCodes) as GroupLeaderboardRow[],
    [index, range, selectedCodes],
  )

  const filteredMetrics = React.useMemo(() => {
    if (!leaderboardQuery) return selectedMetrics
    const lower = leaderboardQuery.toLowerCase()
    return selectedMetrics.filter((metric) => metric.code.toLowerCase().includes(lower))
  }, [selectedMetrics, leaderboardQuery])

  const summary = React.useMemo(
    () => getGroupSummary(index, range, selectedCodes),
    [index, range, selectedCodes],
  )
  const lifetimeRange = bounds ?? range
  const lifetimeSummary = React.useMemo(
    () => getGroupSummary(index, lifetimeRange, selectedCodes),
    [index, lifetimeRange, selectedCodes],
  )

  const adRange = normalizeRange(adStart, adEnd, range)
  const adSummary = React.useMemo(
    () => getGroupSummary(index, adRange, selectedCodes),
    [index, adRange, selectedCodes],
  )

  const arpuRange = buildLast30Range(adEnd, boundsStart, boundsEnd)
  const arpuSummary = React.useMemo(
    () => getGroupSummary(index, arpuRange, selectedCodes),
    [index, arpuRange, selectedCodes],
  )

  const leaderboardArpuRange = React.useMemo(
    () => buildLast30Range(range.end, boundsStart, boundsEnd),
    [buildLast30Range, range.end, boundsStart, boundsEnd],
  )
  const leaderboardArpuMetrics = React.useMemo(() => {
    const metrics = getGroupLeaderboard(index, leaderboardArpuRange, selectedCodes)
    return Object.fromEntries(metrics.map((metric) => [metric.code, metric])) as Record<
      string,
      ReferralMetrics
    >
  }, [index, leaderboardArpuRange, selectedCodes])

  const totalArpuFeePerUser = React.useMemo(() => {
    if (!filteredMetrics.length) return 0
    const metrics = filteredMetrics
      .map((metric) => leaderboardArpuMetrics[metric.code])
      .filter((metric): metric is ReferralMetrics => Boolean(metric))
    const totalFee = metrics.reduce((sum, metric) => sum + metric.feeUsd, 0)
    const totalUsers = metrics.reduce((sum, metric) => sum + metric.usersWithRevenueTx, 0)
    return totalUsers ? totalFee / totalUsers : 0
  }, [filteredMetrics, leaderboardArpuMetrics])

  const leaderboardTotals = React.useMemo<GroupLeaderboardRow | null>(() => {
    if (!filteredMetrics.length) return null
    const signups = filteredMetrics.reduce((sum, metric) => sum + metric.signups, 0)
    const kycUsers = filteredMetrics.reduce((sum, metric) => sum + metric.kycUsers, 0)
    const usersWithRevenueTx = filteredMetrics.reduce(
      (sum, metric) => sum + metric.usersWithRevenueTx,
      0,
    )
    const volumeUsd = filteredMetrics.reduce((sum, metric) => sum + metric.volumeUsd, 0)
    const feeUsd = filteredMetrics.reduce((sum, metric) => sum + metric.feeUsd, 0)
    const firstRevenueTxUsers = filteredMetrics.reduce(
      (sum, metric) => sum + metric.firstRevenueTxUsers,
      0,
    )
    const conversionRate = signups ? usersWithRevenueTx / signups : 0
    const feePerUser = usersWithRevenueTx ? feeUsd / usersWithRevenueTx : 0
    const kycRate = signups ? kycUsers / signups : 0
    return {
      code: 'Total',
      signups,
      kycUsers,
      usersWithRevenueTx,
      firstRevenueTxUsers,
      feeUsd,
      volumeUsd,
      conversionRate,
      feePerUser,
      retention30d: 0,
      timeToFirstTxMedianDays: 0,
      kycRate,
      isTotal: true,
    }
  }, [filteredMetrics])

  const leaderboardRows = React.useMemo(() => {
    if (!filteredMetrics.length) return []
    return leaderboardTotals ? [...filteredMetrics, leaderboardTotals] : filteredMetrics
  }, [filteredMetrics, leaderboardTotals])

  const adSpendValue = Number(adSpendInput)
  const hasSpend = adSpendInput !== '' && Number.isFinite(adSpendValue) && adSpendValue > 0
  const lifetimeMonthsValue = Number(lifetimeMonthsInput)
  const lifetimeMonths =
    Number.isFinite(lifetimeMonthsValue) && lifetimeMonthsValue > 0 ? lifetimeMonthsValue : 0
  const lifetimeArpu = arpuSummary.feePerUser * lifetimeMonths
  const estimatorConversionRate = lifetimeSummary.conversionRate
  const estimatedActiveUsers = adSummary.signups * estimatorConversionRate
  const estimatedFee = estimatedActiveUsers * lifetimeArpu
  const estimatedRoas = hasSpend && lifetimeMonths ? estimatedFee / adSpendValue : null


  const concentration = React.useMemo(() => getGroupConcentration(selectedMetrics), [selectedMetrics])

  const flags = React.useMemo(() => {
    if (!selectedCodes.length) return []
    const next: string[] = []
    if (summary.signups > 50 && summary.conversionRate < 0.1) {
      next.push('High signups, low conversion.')
    }
    if (concentration.top3Share > 0.7) {
      next.push('Fee concentrated in few referrals.')
    }
    if (summary.kycRate < 0.3) {
      next.push('KYC rate low.')
    }
    return next
  }, [summary, concentration, selectedCodes.length])

  const top20ByFee = React.useMemo(
    () =>
      allMetrics
        .slice()
        .sort((a, b) => b.feeUsd - a.feeUsd)
        .slice(0, 20)
        .map((metric) => metric.code),
    [allMetrics],
  )

  const dailySignupsSeries = React.useMemo(() => {
    if (!selectedCodes.length) return { data: [], keys: [] }
    if (mode === 'totals') {
      return buildGroupTotalSeries(index, range, selectedCodes, 'signups')
    }
    return buildGroupStackedSeries(index, range, selectedCodes, 'signups', signupsTopN, 'cumulative')
  }, [index, range, selectedCodes, mode, signupsTopN])

  const dailyFeeSeries = React.useMemo(() => {
    if (!selectedCodes.length) return { data: [], keys: [] }
    if (mode === 'totals') {
      return buildGroupTotalSeries(index, range, selectedCodes, 'feeUsd')
    }
    return buildGroupStackedSeries(index, range, selectedCodes, 'feeUsd', feeTopN, 'cumulative')
  }, [index, range, selectedCodes, mode, feeTopN])

  const renderLeaderboardValue = (value: React.ReactNode, isTotal?: boolean) =>
    isTotal ? <span className="font-semibold">{value}</span> : value

  const leaderboardColumns = () => [
    {
      accessorKey: 'code',
      header: 'Referral',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        row.original.isTotal ? (
          <span className="font-semibold">{row.original.code}</span>
        ) : (
          <Link className="font-semibold text-primary" to={`/referral-detail/${row.original.code}`}>
            {row.original.code}
          </Link>
        ),
    },
    {
      accessorKey: 'signups',
      header: 'Signups',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatNumber(row.original.signups), row.original.isTotal),
    },
    {
      accessorKey: 'kycUsers',
      header: 'KYC',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatNumber(row.original.kycUsers), row.original.isTotal),
    },
    {
      accessorKey: 'usersWithRevenueTx',
      header: 'Users w/ revenue',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatNumber(row.original.usersWithRevenueTx), row.original.isTotal),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatUsd(row.original.volumeUsd), row.original.isTotal),
    },
    {
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatUsd(row.original.feeUsd), row.original.isTotal),
    },
    {
      id: 'arpu30d',
      accessorFn: (row: GroupLeaderboardRow) =>
        row.isTotal ? totalArpuFeePerUser : leaderboardArpuMetrics[row.code]?.feePerUser ?? 0,
      header: 'ARPU 30d',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) => {
        const arpuValue = row.original.isTotal
          ? totalArpuFeePerUser
          : leaderboardArpuMetrics[row.original.code]?.feePerUser ?? 0
        return renderLeaderboardValue(formatUsd(arpuValue), row.original.isTotal)
      },
    },
    {
      accessorKey: 'conversionRate',
      header: 'Conversion',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatPercent(row.original.conversionRate), row.original.isTotal),
    },
    {
      accessorKey: 'feePerUser',
      header: 'Fee / user',
      cell: ({ row }: { row: { original: GroupLeaderboardRow } }) =>
        renderLeaderboardValue(formatUsd(row.original.feePerUser), row.original.isTotal),
    },
  ]

  const handleSaveGroup = () => {
    if (!groupName.trim() || !selectedCodes.length) return
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const nextGroup: SavedGroup = {
      id,
      name: groupName.trim(),
      codes: selectedCodes,
    }
    setSavedGroups((prev) => [nextGroup, ...prev])
    setGroupName('')
  }

  const handleLoadGroup = (group: SavedGroup) => {
    setSelectedCodes(group.codes)
  }

  const handleDeleteGroup = (id: string) => {
    setSavedGroups((prev) => prev.filter((group) => group.id !== id))
  }

  return (
    <div className="space-y-6">
      {bounds ? (
        <DateRangePicker range={range} min={bounds.start} max={bounds.end} onChange={setDateRange} />
      ) : null}

      <ReferralMultiSelect
        options={referralCodes}
        selected={selectedCodes}
        onChange={setSelectedCodes}
        onSelectAll={() => setSelectedCodes(referralCodes)}
        onClear={() => setSelectedCodes([])}
        onQuickSelect={() => setSelectedCodes(top20ByFee)}
        quickSelectLabel="Top 20 by fee"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saved groups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Group name"
              className="w-64"
            />
            <Button onClick={handleSaveGroup} disabled={!groupName.trim() || !selectedCodes.length}>
              Save group
            </Button>
          </div>
          {savedGroups.length ? (
            <div className="space-y-2 text-sm">
              {savedGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.codes.join(', ')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleLoadGroup(group)}>
                      Load
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteGroup(group.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No saved groups yet.</p>
          )}
        </CardContent>
      </Card>

      {selectedCodes.length ? (
        <>
          <Tabs value={mode} onValueChange={(value) => setMode(value as GroupMode)}>
            <TabsList>
              <TabsTrigger value="totals">Group totals</TabsTrigger>
              <TabsTrigger value="compare">Compare within group</TabsTrigger>
            </TabsList>
          </Tabs>

          <GroupSummaryCard
            summary={summary}
            selectedCount={selectedCodes.length}
            concentration={concentration}
            flags={flags}
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
                    min={boundsStart}
                    max={boundsEnd}
                    value={adStart}
                    onChange={(event) => setAdStart(event.target.value)}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ad end</p>
                  <Input
                    type="date"
                    min={boundsStart}
                    max={boundsEnd}
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
                  <p className="text-lg font-semibold">{formatNumber(adSummary.signups)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ARPU avg (last 30d)</p>
                  <p className="text-lg font-semibold">{formatUsd(arpuSummary.feePerUser)}</p>
                  <p className="text-xs text-muted-foreground">
                    {arpuRange.start} → {arpuRange.end}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Conversion rate</p>
                  <p className="text-lg font-semibold">{formatPercent(estimatorConversionRate)}</p>
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
                  <span>Estimated fee = signups × conversion rate × ARPU(30d) × lifetime months</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-5">
            <KpiCard title="Signups" value={formatNumber(summary.signups)} />
            <KpiCard title="KYC Users" value={formatNumber(summary.kycUsers)} />
            <KpiCard title="Users with revenue" value={formatNumber(summary.usersWithRevenueTx)} />
            <KpiCard title="Volume USD" value={formatUsd(summary.volumeUsd)} />
            <KpiCard title="Fee USD" value={formatUsd(summary.feeUsd)} />
          </div>

          <div className="space-y-4">
            <DailyStackedChart
              title={mode === 'totals' ? 'Daily group signups' : 'Daily signups by referral'}
              metric="signups"
              data={dailySignupsSeries.data}
              keys={dailySignupsSeries.keys}
              topN={mode === 'compare' ? signupsTopN : undefined}
              topNOptions={mode === 'compare' ? [4, 8, 12] : undefined}
              onTopNChange={mode === 'compare' ? setSignupsTopN : undefined}
            />
            <DailyStackedChart
              title={mode === 'totals' ? 'Daily group fee USD' : 'Daily fee USD by referral'}
              metric="feeUsd"
              data={dailyFeeSeries.data}
              keys={dailyFeeSeries.keys}
              topN={mode === 'compare' ? feeTopN : undefined}
              topNOptions={mode === 'compare' ? [4, 8, 12] : undefined}
              onTopNChange={mode === 'compare' ? setFeeTopN : undefined}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Group leaderboard</CardTitle>
              <Input
                value={leaderboardQuery}
                onChange={(event) => setLeaderboardQuery(event.target.value)}
                placeholder="Search referrals"
                className="h-8 w-48"
              />
            </CardHeader>
            <CardContent>
                <DataTable
                  columns={leaderboardColumns()}
                  data={leaderboardRows}
                  enablePagination
                  pageSize={30}
                />

            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Select referrals to begin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Pick multiple referral codes to view grouped KPIs, charts, and leaderboard insights.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
