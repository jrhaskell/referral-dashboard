import * as React from 'react'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { KpiCard } from '@/components/KpiCard'
import { SwapSankey } from '@/components/SwapSankey'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type DateRange, getRangeBounds, getSwapFlowSankeyData } from '@/lib/analytics'
import { useAnalytics } from '@/lib/analytics/context'
import { formatPercent, formatUsd } from '@/lib/utils'

const PIE_COLORS = ['#6366f1', '#22c55e', '#0ea5e9', '#f97316', '#e11d48', '#a855f7', '#14b8a6', '#facc15', '#64748b']

export function TopAumPage() {
  const { index, dateRange, setDateRange } = useAnalytics()
  const [topCount, setTopCount] = React.useState('50')
  const [query, setQuery] = React.useState('')

  if (!index) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading AUM analytics…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Import data to view AUM analytics.</p>
        </CardContent>
      </Card>
    )
  }

  const topLimit = Math.max(5, Number(topCount) || 50)
  const bounds = getRangeBounds(index)
  const range: DateRange = bounds && dateRange ? dateRange : { start: '', end: '' }

  const aumWallets = React.useMemo(() => {
    const list: Array<{ wallet: string; aumUsd: number }> = []
    index.aumByWallet.forEach((value, wallet) => {
      list.push({ wallet, aumUsd: value })
    })
    list.sort((a, b) => b.aumUsd - a.aumUsd)
    return list
  }, [index])

  const totalAum = React.useMemo(
    () => aumWallets.reduce((sum, entry) => sum + entry.aumUsd, 0),
    [aumWallets],
  )

  const swapSankey = React.useMemo(() => {
    if (!bounds || !dateRange) return null
    return getSwapFlowSankeyData(index, 'all', range, 24)
  }, [index, bounds, dateRange, range])

  const portfolioSeries = React.useMemo(() => {
    const totals = new Map<string, number>()
    const topWallets = aumWallets.slice(0, topLimit).map((entry) => entry.wallet)
    topWallets.forEach((wallet) => {
      const tokens = index.aumTokensByWallet.get(wallet) ?? []
      tokens.forEach((token) => {
        const label = token.chain ? `${token.symbol} • ${token.chain}` : token.symbol
        totals.set(label, (totals.get(label) ?? 0) + token.balanceUsd)
      })
    })
    const entries = Array.from(totals.entries()).map(([name, value]) => ({ name, value }))
    entries.sort((a, b) => b.value - a.value)
    const top = entries.slice(0, 8)
    const rest = entries.slice(8)
    if (rest.length) {
      const otherTotal = rest.reduce((sum, item) => sum + item.value, 0)
      top.push({ name: 'Other', value: otherTotal })
    }
    return top
  }, [aumWallets, topLimit, index])

  const portfolioTotal = React.useMemo(
    () => portfolioSeries.reduce((sum, entry) => sum + entry.value, 0),
    [portfolioSeries],
  )

  const rows = React.useMemo(() => {
    const filtered = aumWallets.slice(0, topLimit)
    return filtered
      .map((entry, idx) => {
        const user = index.usersByWallet.get(entry.wallet)
        const referral = user?.referral ?? 'Unassigned'
        const feeUsd = user?.feeUsd ?? 0
        const volumeUsd = user?.volumeUsd ?? 0
        const tokens = index.aumTokensByWallet.get(entry.wallet) ?? []
        const topHoldings = tokens
          .slice(0, 4)
          .map((token) => `${token.symbol} ${formatPercent(entry.aumUsd ? token.balanceUsd / entry.aumUsd : 0)}`)
          .join(' · ')
        return {
          rank: idx + 1,
          wallet: entry.wallet,
          referral,
          aumUsd: entry.aumUsd,
          feeUsd,
          volumeUsd,
          topHoldings: topHoldings || '—',
        }
      })
      .filter((row) => {
        if (!query.trim()) return true
        const haystack = `${row.wallet} ${row.referral}`.toLowerCase()
        return haystack.includes(query.trim().toLowerCase())
      })
  }, [aumWallets, topLimit, index, query])

  const totalTopAum = rows.reduce((sum, row) => sum + row.aumUsd, 0)
  const totalTopFee = rows.reduce((sum, row) => sum + row.feeUsd, 0)

  const columns = [
    {
      accessorKey: 'rank',
      header: '#',
    },
    {
      accessorKey: 'wallet',
      header: 'Wallet',
      cell: ({ row }: any) => (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{row.original.wallet}</span>
        </div>
      ),
    },
    {
      accessorKey: 'referral',
      header: 'Referral',
    },
    {
      accessorKey: 'aumUsd',
      header: 'AUM USD',
      cell: ({ row }: any) => formatUsd(row.original.aumUsd),
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
      accessorKey: 'topHoldings',
      header: 'Top holdings',
    },
  ]

  return (
    <div className="space-y-6">
      {bounds && dateRange ? (
        <DateRangePicker range={dateRange} min={bounds.start} max={bounds.end} onChange={setDateRange} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Top AUM users</h2>
          <p className="text-sm text-muted-foreground">
            Analyze top portfolio holders and compare revenue impact.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard title="Top AUM total" value={formatUsd(totalTopAum)} />
        <KpiCard title="Top AUM share" value={formatPercent(totalAum ? totalTopAum / totalAum : 0)} />
        <KpiCard title="Top AUM fee" value={formatUsd(totalTopFee)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Top AUM list</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search wallet or referral"
              className="h-8 w-60"
            />
            <Select value={topCount} onValueChange={setTopCount}>
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="Top" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="25">Top 25</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
                <SelectItem value="200">Top 200</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={rows} enablePagination pageSize={25} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio mix (Top {topLimit})</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {portfolioSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={portfolioSeries}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {portfolioSeries.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | string | undefined) => {
                    const numeric = Number(value ?? 0)
                    const percent = portfolioTotal ? numeric / portfolioTotal : 0
                    return `${formatUsd(numeric)} · ${formatPercent(percent)}`
                  }}
                  labelFormatter={(label) => `Token ${label}`}
                />
                <Legend
                  verticalAlign="bottom"
                  height={40}
                  formatter={(value, entry) => {
                    const numeric = Number((entry as any)?.payload?.value ?? 0)
                    const percent = portfolioTotal ? numeric / portfolioTotal : 0
                    return `${value} ${formatPercent(percent)}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No portfolio data for this selection.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Swap flow (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          {swapSankey ? (
            <SwapSankey data={swapSankey} height={420} />
          ) : (
            <p className="text-xs text-muted-foreground">No swap data in this range.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
