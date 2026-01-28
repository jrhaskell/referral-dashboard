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
  hasReferralCode: boolean
  feeUsd: number
  volumeUsd: number
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

  const codesByOwner = React.useMemo(() => buildCodesByOwner(index), [index])

  const rows = React.useMemo(
    () => buildCustomerRows(index, range, codesByOwner),
    [index, range, codesByOwner],
  )

  const filteredRows = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (onlyWithFee && row.feeUsd <= FEE_THRESHOLD) return false
      if (onlyWithoutCode && row.hasReferralCode) return false

      if (!normalized) return true
      const haystack = [row.label, row.id, row.referralUsed].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [rows, query, onlyWithFee, onlyWithoutCode])

  const totals = React.useMemo(() => {
    const feeCustomers = filteredRows.filter((row) => row.feeUsd > 0).length
    const withoutCode = filteredRows.filter((row) => !row.hasReferralCode).length
    const feeWithoutCode = filteredRows.filter(
      (row) => row.feeUsd > 0 && !row.hasReferralCode,
    ).length
    const totalFee = filteredRows.reduce((sum, row) => sum + row.feeUsd, 0)
    return { feeCustomers, withoutCode, feeWithoutCode, totalFee }
  }, [filteredRows])

  const referralVolumeSeries = React.useMemo(() => {
    const totalsByReferral = new Map<string, number>()
    filteredRows.forEach((row) => {
      const key = row.referralUsed?.trim() ? row.referralUsed.trim() : 'No referral'
      totalsByReferral.set(key, (totalsByReferral.get(key) ?? 0) + row.volumeUsd)
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
      'Has Referral Code',
      'Codes Owned',
      'Fee USD',
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
          row.hasReferralCode ? 'yes' : 'no',
          row.codesOwned,
          row.feeUsd,
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
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatUsd(row.original.feeUsd),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatUsd(row.original.volumeUsd),
    },
    {
      accessorKey: 'codesOwned',
      header: 'Codes owned',
      cell: ({ row }: { row: { original: CustomerRow } }) => formatNumber(row.original.codesOwned),
    },
    {
      accessorKey: 'hasReferralCode',
      header: 'Has referral code',
      cell: ({ row }: { row: { original: CustomerRow } }) =>
        row.original.hasReferralCode ? 'Yes' : 'No',
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Volume by referral used</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {referralVolumeSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={referralVolumeSeries}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {referralVolumeSeries.map((entry, index) => (
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
              <p className="text-sm text-muted-foreground">No referral volume data for this filter.</p>
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

function buildCustomerRows(index: AnalyticsIndex, range: DateRange, codesByOwner: Map<string, string[]>) {
  return Array.from(index.customersById.values()).map((customer) => {
    const usageDaily = index.customerUsageDaily.get(customer.id)
    const usage = summarizeUsageByRange(usageDaily, range)
    const codes = codesByOwner.get(customer.id) ?? []
    return {
      id: customer.id,
      label: customer.email || customer.id,
      signupDate: customer.signupDate,
      referralUsed: customer.referral,
      codesOwned: codes.length,
      hasReferralCode: codes.length > 0,
      feeUsd: usage.feeUsd,
      volumeUsd: usage.volumeUsd,
      lastRevenueDate: usage.lastDate,
    }
  })
}
