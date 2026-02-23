import * as React from 'react'
import { format } from 'date-fns'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { KpiCard } from '@/components/KpiCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getRangeBounds, type AnalyticsIndex, type DailyAgg, type DateRange } from '@/lib/analytics'
import { useAnalytics } from '@/lib/analytics/context'
import { downloadFile, formatNumber, formatUsd, toCsvRow } from '@/lib/utils'

type CustomerRow = {
  id: string
  label: string
  signupDate: string
  referralUsed: string
  codesOwned: number
  ownedCodes: string
  hasReferralCode: boolean
  codeUses: number
  codeMaxUses: number | null
  realConversion: number
  feeUsd: number
  volumeUsd: number
  aumUsd: number
  lastRevenueDate?: string
}

const FEE_THRESHOLD = 10
const PIE_COLORS = ['#6366f1', '#22c55e', '#0ea5e9', '#f97316', '#e11d48', '#a855f7', '#14b8a6', '#facc15', '#64748b']

const isDateInRange = (date: string, range: DateRange) =>
  date >= range.start && date <= range.end

const summarizeUsageByRange = (dailyMap: Map<string, DailyAgg> | undefined, range: DateRange) => {
  if (!dailyMap) return { feeUsd: 0, volumeUsd: 0, lastDate: undefined }
  let feeUsd = 0
  let volumeUsd = 0
  let lastDate: string | undefined
  dailyMap.forEach((value, date) => {
    if (!isDateInRange(date, range)) return
    feeUsd += value.feeUsd
    volumeUsd += value.volumeUsd
    if (!lastDate || date > lastDate) lastDate = date
  })
  return { feeUsd, volumeUsd, lastDate }
}

export function ClientsPage() {
  const { index, dateRange, setDateRange } = useAnalytics()

  if (!index || !dateRange) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading client analytics…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Import data to view client analytics.</p>
        </CardContent>
      </Card>
    )
  }

  const bounds = getRangeBounds(index)
  const range: DateRange = bounds ? dateRange : { start: dateRange.start, end: dateRange.end }

  const [query, setQuery] = React.useState('')
  const [onlyWithFee, setOnlyWithFee] = React.useState(true)
  const [onlyWithoutCode, setOnlyWithoutCode] = React.useState(true)
  const [aumMin, setAumMin] = React.useState('')
  const [aumMax, setAumMax] = React.useState('')

  const codesByOwner = React.useMemo(() => buildCodesByOwner(index), [index])
  const usesByCode = React.useMemo(() => buildUsesByCode(index), [index])
  const maxUsesByCode = React.useMemo(() => buildMaxUsesByCode(index), [index])
  const realConversionByCode = React.useMemo(
    () => buildRealConversionByCode(index, range),
    [index, range],
  )

  const rows = React.useMemo(
    () =>
      buildCustomerRows(index, range, codesByOwner, usesByCode, maxUsesByCode, realConversionByCode),
    [index, range, codesByOwner, usesByCode, maxUsesByCode, realConversionByCode],
  )

  const filteredRows = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const minAum = Number(aumMin)
    const maxAum = Number(aumMax)
    return rows.filter((row) => {
      if (onlyWithFee && row.feeUsd <= FEE_THRESHOLD) return false
      if (onlyWithoutCode && row.hasReferralCode) return false
      if (Number.isFinite(minAum) && aumMin !== '' && row.aumUsd < minAum) return false
      if (Number.isFinite(maxAum) && aumMax !== '' && row.aumUsd > maxAum) return false

      if (!normalized) return true
      const haystack = [row.label, row.id, row.referralUsed].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [rows, query, onlyWithFee, onlyWithoutCode, aumMin, aumMax])

  const totals = React.useMemo(() => {
    const feeCustomers = filteredRows.filter((row) => row.feeUsd > 0).length
    const withoutCode = filteredRows.filter((row) => !row.hasReferralCode).length
    const feeWithoutCode = filteredRows.filter(
      (row) => row.feeUsd > 0 && !row.hasReferralCode,
    ).length
    const totalFee = filteredRows.reduce((sum, row) => sum + row.feeUsd, 0)
    const codesCreated = filteredRows.reduce((sum, row) => sum + row.codesOwned, 0)
    return { feeCustomers, withoutCode, feeWithoutCode, totalFee, codesCreated }
  }, [filteredRows])

  const referralAumSeries = React.useMemo(() => {
    const totalsByReferral = new Map<string, number>()
    filteredRows.forEach((row) => {
      const key = row.referralUsed?.trim() ? row.referralUsed.trim() : 'No referral'
      totalsByReferral.set(key, (totalsByReferral.get(key) ?? 0) + row.aumUsd)
    })
    const entries = Array.from(totalsByReferral.entries()).map(([name, value]) => ({ name, value }))
    entries.sort((a, b) => b.value - a.value)
    const top = entries.slice(0, 8)
    const rest = entries.slice(8)
    if (rest.length) {
      const otherTotal = rest.reduce((sum, item) => sum + item.value, 0)
      top.push({ name: 'Other', value: otherTotal })
    }
    return top
  }, [filteredRows])

  const referralFeeSeries = React.useMemo(() => {
    const totalsByReferral = new Map<string, number>()
    filteredRows.forEach((row) => {
      const key = row.referralUsed?.trim() ? row.referralUsed.trim() : 'No referral'
      totalsByReferral.set(key, (totalsByReferral.get(key) ?? 0) + row.feeUsd)
    })
    const entries = Array.from(totalsByReferral.entries()).map(([name, value]) => ({ name, value }))
    entries.sort((a, b) => b.value - a.value)
    const top = entries.slice(0, 8)
    const rest = entries.slice(8)
    if (rest.length) {
      const otherTotal = rest.reduce((sum, item) => sum + item.value, 0)
      top.push({ name: 'Other', value: otherTotal })
    }
    return top
  }, [filteredRows])

  const exportCsv = () => {
    const header = toCsvRow([
      'Customer ID',
      'Label',
      'Registered',
      'Referral Used',
      'Referral Code(s)',
      'Code Uses',
      'Max Uses',
      'Real Conversion',
      'Fee USD',
      'AUM USD',
      'Volume USD',
      'Last Revenue Date',
    ])
    const body = filteredRows
      .map((row) =>
        toCsvRow([
          row.id,
          row.label,
          row.signupDate,
          row.referralUsed,
          row.ownedCodes || 'No',
          row.codeUses,
          row.codeMaxUses ?? '',
          row.realConversion,
          row.feeUsd,
          row.aumUsd,
          row.volumeUsd,
          row.lastRevenueDate ?? '',
        ]),
      )
      .join('\n')
    const filename = `clients-${format(new Date(), 'yyyy-MM-dd')}.csv`
    downloadFile(filename, `${header}\n${body}`, 'text/csv')
  }

  const columns = [
    {
      accessorKey: 'label',
      header: 'Client',
      cell: ({ row }: { row: { original: CustomerRow } }) => (
        <div>
          <p className="font-medium">{row.original.label}</p>
          <p className="text-xs text-muted-foreground">{row.original.id}</p>
        </div>
      ),
    },
    {
      accessorKey: 'referralUsed',
      header: 'Referral used',
      cell: ({ row }: { row: { original: CustomerRow } }) => row.original.referralUsed || '—',
    },
    {
      accessorKey: 'ownedCodes',
      header: 'Referral code',
      cell: ({ row }: { row: { original: CustomerRow } }) => row.original.ownedCodes || 'No',
    },
    {
      accessorKey: 'codeUses',
      header: 'Code uses',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatNumber(row.original.codeUses),
    },
    {
      accessorKey: 'codeMaxUses',
      header: 'Max uses',
      cell: ({ row }: { row: { original: CustomerRow } }) =>
        row.original.codeMaxUses === null ? '—' : formatNumber(row.original.codeMaxUses),
    },
    {
      accessorKey: 'realConversion',
      header: 'Real conversion',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatNumber(row.original.realConversion),
    },
    {
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatUsd(row.original.feeUsd),
    },
    {
      accessorKey: 'aumUsd',
      header: 'AUM USD',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatUsd(row.original.aumUsd),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatUsd(row.original.volumeUsd),
    },
    {
      accessorKey: 'signupDate',
      header: 'Registered',
      cell: ({ row }: { row: { original: CustomerRow } }) =>
        row.original.signupDate && row.original.signupDate !== 'Invalid'
          ? row.original.signupDate
          : '—',
    },
    {
      accessorKey: 'lastRevenueDate',
      header: 'Last revenue',
      cell: ({ row }: { row: { original: CustomerRow } }) => row.original.lastRevenueDate ?? '—',
    },
  ]

  return (
    <div className="space-y-6">
      {bounds ? (
        <DateRangePicker range={range} min={bounds.start} max={bounds.end} onChange={setDateRange} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Clients in view" value={formatNumber(filteredRows.length)} />
        <KpiCard title="Fee clients" value={formatNumber(totals.feeCustomers)} />
        <KpiCard title="Without code" value={formatNumber(totals.withoutCode)} />
        <KpiCard title="Fee without code" value={formatNumber(totals.feeWithoutCode)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtered summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Total clients (filtered)</p>
            <p className="text-2xl font-semibold">{formatNumber(filteredRows.length)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Codes created (filtered)</p>
            <p className="text-2xl font-semibold">{formatNumber(totals.codesCreated)}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Total fee (filtered)</p>
            <p className="text-2xl font-semibold">{formatUsd(totals.totalFee)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AUM by referral used</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {referralAumSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={referralAumSeries}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {referralAumSeries.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string | undefined) => formatUsd(Number(value ?? 0))}
                    labelFormatter={(label) => `Referral ${label}`}
                  />
                  <Legend verticalAlign="bottom" height={40} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No referral AUM data for this filter.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fee by referral used</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {referralFeeSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={referralFeeSeries}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {referralFeeSeries.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string | undefined) => formatUsd(Number(value ?? 0))}
                    labelFormatter={(label) => `Referral ${label}`}
                  />
                  <Legend verticalAlign="bottom" height={40} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No referral fee data for this filter.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Client referral ownership</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client or referral"
              className="h-8 w-64"
            />
            <Input
              value={aumMin}
              onChange={(event) => setAumMin(event.target.value)}
              placeholder="AUM min"
              className="h-8 w-28"
              inputMode="decimal"
            />
            <Input
              value={aumMax}
              onChange={(event) => setAumMax(event.target.value)}
              placeholder="AUM max"
              className="h-8 w-28"
              inputMode="decimal"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={onlyWithFee} onCheckedChange={(value) => setOnlyWithFee(Boolean(value))} />
              Fee &gt; {formatNumber(FEE_THRESHOLD)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={onlyWithoutCode}
                onCheckedChange={(value) => setOnlyWithoutCode(Boolean(value))}
              />
              No referral code
            </div>
            <div className="text-xs text-muted-foreground">Total fee: {formatUsd(totals.totalFee)}</div>
          </div>
          <DataTable columns={columns} data={filteredRows} enablePagination pageSize={30} />
        </CardContent>
      </Card>
    </div>
  )
}

function buildCodesByOwner(index: AnalyticsIndex) {
  const map = new Map<string, string[]>()
  index.referralCodes.forEach((meta) => {
    if (!meta.createdBy) return
    const list = map.get(meta.createdBy) ?? []
    list.push(meta.code)
    map.set(meta.createdBy, list)
  })
  return map
}

function buildUsesByCode(index: AnalyticsIndex) {
  const map = new Map<string, number>()
  index.referralCodes.forEach((meta) => {
    map.set(meta.code, meta.uses)
  })
  return map
}

function buildMaxUsesByCode(index: AnalyticsIndex) {
  const map = new Map<string, number | null>()
  index.referralCodes.forEach((meta) => {
    map.set(meta.code, meta.maxUses ?? null)
  })
  return map
}

function buildCustomerRows(
  index: AnalyticsIndex,
  range: DateRange,
  codesByOwner: Map<string, string[]>,
  usesByCode: Map<string, number>,
  maxUsesByCode: Map<string, number | null>,
  realConversionByCode: Map<string, number>,
) {
  return Array.from(index.customersById.values()).map((customer) => {
    const usageDaily = index.customerUsageDaily.get(customer.id)
    const usage = summarizeUsageByRange(usageDaily, range)
    const codes = codesByOwner.get(customer.id) ?? []
    const aumUsd = index.aumByWallet.get(customer.smartWallet) ?? 0
    const ownedCodes = codes.join(', ')
    const codeUses = codes.reduce((sum, code) => sum + (usesByCode.get(code) ?? 0), 0)
    const maxUsesList = codes
      .map((code) => maxUsesByCode.get(code))
      .filter((value): value is number => typeof value === 'number')
    const codeMaxUses = maxUsesList.length ? maxUsesList.reduce((sum, value) => sum + value, 0) : null
    const realConversion = codes.reduce(
      (sum, code) => sum + (realConversionByCode.get(code) ?? 0),
      0,
    )
    return {
      id: customer.id,
      label: customer.email || customer.id,
      signupDate: customer.signupDate,
      referralUsed: customer.referral,
      codesOwned: codes.length,
      ownedCodes,
      hasReferralCode: codes.length > 0,
      codeUses,
      codeMaxUses,
      realConversion,
      feeUsd: usage.feeUsd,
      aumUsd,
      volumeUsd: usage.volumeUsd,
      lastRevenueDate: usage.lastDate,
    }
  })
}

function buildRealConversionByCode(index: AnalyticsIndex, range: DateRange) {
  const totals = new Map<string, number>()
  const startMs = new Date(range.start).getTime()
  const endMs = new Date(range.end).getTime() + 86400000 - 1

  index.customersById.forEach((customer) => {
    const code = customer.referral
    if (!code) return
    const usage = index.customerUsageDaily.get(customer.id)
    if (!usage) return
    let feeUsd = 0
    usage.forEach((value, date) => {
      if (!isDateInRange(date, range)) return
      feeUsd += value.feeUsd
    })
    if (feeUsd > 5) {
      totals.set(code, (totals.get(code) ?? 0) + 1)
    }
  })

  return totals
}
