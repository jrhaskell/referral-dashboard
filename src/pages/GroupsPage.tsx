import * as React from 'react'
import { Link } from 'react-router-dom'

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

  const referralCodes = React.useMemo(() => getReferralList(index), [index])

  const [selectedCodes, setSelectedCodes] = React.useState<string[]>([])
  const [mode, setMode] = React.useState<GroupMode>('compare')
  const [signupsTopN, setSignupsTopN] = React.useState(8)
  const [feeTopN, setFeeTopN] = React.useState(8)
  const [groupName, setGroupName] = React.useState('')
  const [savedGroups, setSavedGroups] = React.useState<SavedGroup[]>(() => loadSavedGroups())
  const [leaderboardQuery, setLeaderboardQuery] = React.useState('')

  React.useEffect(() => {
    persistSavedGroups(savedGroups)
  }, [savedGroups])

  const allMetrics = React.useMemo(
    () => getGroupLeaderboard(index, range, referralCodes),
    [index, range, referralCodes],
  )

  const selectedMetrics = React.useMemo(
    () => getGroupLeaderboard(index, range, selectedCodes),
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

  const leaderboardColumns = () => [
    {
      accessorKey: 'code',
      header: 'Referral',
      cell: ({ row }: { row: { original: ReferralMetrics } }) => (
        <Link className="font-semibold text-primary" to={`/referrals/${row.original.code}`}>
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'signups',
      header: 'Signups',
      cell: ({ row }: { row: { original: ReferralMetrics } }) => formatNumber(row.original.signups),
    },
    {
      accessorKey: 'kycUsers',
      header: 'KYC',
      cell: ({ row }: { row: { original: ReferralMetrics } }) => formatNumber(row.original.kycUsers),
    },
    {
      accessorKey: 'usersWithRevenueTx',
      header: 'Users w/ revenue',
      cell: ({ row }: { row: { original: ReferralMetrics } }) =>
        formatNumber(row.original.usersWithRevenueTx),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: { row: { original: ReferralMetrics } }) => formatUsd(row.original.volumeUsd),
    },
    {
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: { row: { original: ReferralMetrics } }) => formatUsd(row.original.feeUsd),
    },
    {
      accessorKey: 'conversionRate',
      header: 'Conversion',
      cell: ({ row }: { row: { original: ReferralMetrics } }) =>
        formatPercent(row.original.conversionRate),
    },
    {
      accessorKey: 'feePerUser',
      header: 'Fee / user',
      cell: ({ row }: { row: { original: ReferralMetrics } }) => formatUsd(row.original.feePerUser),
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
                data={filteredMetrics}
                enablePagination
                pageSize={10}
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
