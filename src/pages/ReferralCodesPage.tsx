import * as React from 'react'
import { eachDayOfInterval, format } from 'date-fns'
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
import { Link } from 'react-router-dom'

import { DailyStackedChart } from '@/components/DailyStackedChart'
import { DataTable } from '@/components/DataTable'
import { DateRangePicker } from '@/components/DateRangePicker'
import { KpiCard } from '@/components/KpiCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  getRangeBounds,
  getReferralMetrics,
  type AnalyticsIndex,
  type DailyAgg,
  type DateRange,
  type ReferralCodeMeta,
} from '@/lib/analytics'
import { useAnalytics } from '@/lib/analytics/context'
import { downloadFile, formatDate, formatNumber, formatPercent, formatUsd, toCsvRow } from '@/lib/utils'

const DAY_MS = 1000 * 60 * 60 * 24

const parseFilterNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/,/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const parseFilterPercent = (value: string) => {
  const parsed = parseFilterNumber(value)
  if (parsed === null) return null
  return parsed > 1 ? parsed / 100 : parsed
}

const matchesRange = (value: number, min: number | null, max: number | null) => {
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

const matchesOptionalRange = (
  value: number | null,
  min: number | null,
  max: number | null,
) => {
  if (value === null) return min === null && max === null
  return matchesRange(value, min, max)
}

const isDateInRange = (date: string, range: DateRange) =>
  date >= range.start && date <= range.end

const sumOwnerUsageByRange = (dailyMap: Map<string, DailyAgg> | undefined, range: DateRange) => {
  if (!dailyMap) return 0
  let total = 0
  dailyMap.forEach((value, date) => {
    if (isDateInRange(date, range)) total += value.feeUsd
  })
  return total
}

type ReferralCodeRow = {


  code: string
  note: string
  uses: number
  maxUses: number | null
  usageRate: number | null
  isActive: boolean
  isExhausted: boolean
  validFrom?: number
  validUntil?: number
  createdAt?: number
  createdBy?: string
  ownerLabel: string
  ownerType: string
  status: string
  isLive: boolean
  signups: number
  usersWithRevenueTx: number
  feeUsd: number
  volumeUsd: number
  conversionRate: number
  feePerUser: number
}

export function ReferralCodesPage() {
  const { index, dateRange, setDateRange } = useAnalytics()

  const [codeFilter, setCodeFilter] = React.useState('')
  const [ownerPresence, setOwnerPresence] = React.useState('all')
  const [noteFilter, setNoteFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [activeOnly, setActiveOnly] = React.useState(false)
  const [usesMin, setUsesMin] = React.useState('')
  const [usesMax, setUsesMax] = React.useState('')
  const [maxUsesMin, setMaxUsesMin] = React.useState('')
  const [maxUsesMax, setMaxUsesMax] = React.useState('')
  const [usageRateMin, setUsageRateMin] = React.useState('')
  const [usageRateMax, setUsageRateMax] = React.useState('')
  const [signupsMin, setSignupsMin] = React.useState('')
  const [signupsMax, setSignupsMax] = React.useState('')
  const [feeMin, setFeeMin] = React.useState('')
  const [feeMax, setFeeMax] = React.useState('')
  const [ownerUsageMin, setOwnerUsageMin] = React.useState('')
  const [ownerUsageMax, setOwnerUsageMax] = React.useState('')
  const [arpuMin, setArpuMin] = React.useState('')
  const [arpuMax, setArpuMax] = React.useState('')
  const [conversionMin, setConversionMin] = React.useState('')
  const [conversionMax, setConversionMax] = React.useState('')
  const [createdFrom, setCreatedFrom] = React.useState('')
  const [createdTo, setCreatedTo] = React.useState('')
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null)

  if (!index || !dateRange) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading referral codes…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Import data to view referral code insights.</p>
        </CardContent>
      </Card>
    )
  }

  const bounds = getRangeBounds(index)
  const range = bounds ? dateRange : { start: dateRange.start, end: dateRange.end }

  const referralCodes = React.useMemo(() => Array.from(index.referralCodes.values()), [index])

  const rows = React.useMemo(() => {
    const now = Date.now()
    return referralCodes.map((meta) => buildReferralRow(meta, index, range, now))
  }, [referralCodes, index, range])

  const ownerUsageFeeById = React.useMemo(() => {
    const map = new Map<string, number>()
    referralCodes.forEach((meta) => {
      if (!meta.createdBy || map.has(meta.createdBy)) return
      const dailyMap = index.ownerUsageDaily.get(meta.createdBy)
      map.set(meta.createdBy, sumOwnerUsageByRange(dailyMap, range))
    })
    return map
  }, [referralCodes, index, range])

  const filteredRows = React.useMemo(() => {
    const normalizedCode = codeFilter.trim().toLowerCase()
    const normalizedNote = noteFilter.trim().toLowerCase()

    const usesMinValue = parseFilterNumber(usesMin)
    const usesMaxValue = parseFilterNumber(usesMax)
    const maxUsesMinValue = parseFilterNumber(maxUsesMin)
    const maxUsesMaxValue = parseFilterNumber(maxUsesMax)
    const usageRateMinValue = parseFilterPercent(usageRateMin)
    const usageRateMaxValue = parseFilterPercent(usageRateMax)
    const signupsMinValue = parseFilterNumber(signupsMin)
    const signupsMaxValue = parseFilterNumber(signupsMax)
    const feeMinValue = parseFilterNumber(feeMin)
    const feeMaxValue = parseFilterNumber(feeMax)
    const ownerUsageMinValue = parseFilterNumber(ownerUsageMin)
    const ownerUsageMaxValue = parseFilterNumber(ownerUsageMax)
    const arpuMinValue = parseFilterNumber(arpuMin)
    const arpuMaxValue = parseFilterNumber(arpuMax)
    const conversionMinValue = parseFilterPercent(conversionMin)
    const conversionMaxValue = parseFilterPercent(conversionMax)
    const createdFromValue = createdFrom ? new Date(createdFrom).getTime() : null
    const createdToValue = createdTo ? new Date(createdTo).getTime() + DAY_MS - 1 : null

    return rows.filter((row) => {
      if (activeOnly && !row.isLive) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (ownerPresence === 'with' && !row.createdBy) return false
      if (ownerPresence === 'without' && row.createdBy) return false

      if (normalizedCode && !row.code.toLowerCase().includes(normalizedCode)) return false
      if (normalizedNote && !row.note.toLowerCase().includes(normalizedNote)) return false

      if (!matchesRange(row.uses, usesMinValue, usesMaxValue)) return false
      if (!matchesOptionalRange(row.maxUses, maxUsesMinValue, maxUsesMaxValue)) return false
      if (!matchesOptionalRange(row.usageRate, usageRateMinValue, usageRateMaxValue)) return false
      if (!matchesRange(row.signups, signupsMinValue, signupsMaxValue)) return false
      if (!matchesRange(row.feeUsd, feeMinValue, feeMaxValue)) return false

      const ownerUsageFee = row.createdBy ? (ownerUsageFeeById.get(row.createdBy) ?? 0) : 0
      if (!matchesRange(ownerUsageFee, ownerUsageMinValue, ownerUsageMaxValue)) return false

      if (!matchesRange(row.feePerUser, arpuMinValue, arpuMaxValue)) return false
      if (!matchesRange(row.conversionRate, conversionMinValue, conversionMaxValue)) return false

      if (createdFromValue && (!row.createdAt || row.createdAt < createdFromValue)) return false
      if (createdToValue && (!row.createdAt || row.createdAt > createdToValue)) return false

      return true
    })
  }, [
    rows,
    ownerUsageFeeById,
    codeFilter,
    ownerPresence,
    noteFilter,
    statusFilter,
    activeOnly,
    usesMin,
    usesMax,
    maxUsesMin,
    maxUsesMax,
    usageRateMin,
    usageRateMax,
    signupsMin,
    signupsMax,
    feeMin,
    feeMax,
    ownerUsageMin,
    ownerUsageMax,
    arpuMin,
    arpuMax,
    conversionMin,
    conversionMax,
    createdFrom,
    createdTo,
  ])

  const globalMetrics = React.useMemo(
    () => getReferralMetrics(index, 'all', range),
    [index, range],
  )

  const totals = React.useMemo(() => {
    const signups = filteredRows.reduce((sum, row) => sum + row.signups, 0)
    const usersWithRevenueTx = filteredRows.reduce((sum, row) => sum + row.usersWithRevenueTx, 0)
    const feeUsd = filteredRows.reduce((sum, row) => sum + row.feeUsd, 0)
    const activeCodes = filteredRows.filter((row) => row.isLive).length
    const signupShare = globalMetrics.signups ? signups / globalMetrics.signups : 0
    const feeShare = globalMetrics.feeUsd ? feeUsd / globalMetrics.feeUsd : 0
    const arpu = usersWithRevenueTx ? feeUsd / usersWithRevenueTx : 0

    return { signups, feeUsd, activeCodes, signupShare, feeShare, arpu }
  }, [filteredRows, globalMetrics])

  const createdSeries = React.useMemo(() => {
    if (!bounds) return []
    const start = new Date(range.start)
    const end = new Date(range.end)
    const startMs = start.getTime()
    const endMs = end.getTime() + DAY_MS - 1
    const counts = new Map<string, number>()

    filteredRows.forEach((row) => {
      if (!row.createdAt) return
      if (row.createdAt < startMs || row.createdAt > endMs) return
      const dateKey = format(new Date(row.createdAt), 'yyyy-MM-dd')
      counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1)
    })

    let runningTotal = 0
    return eachDayOfInterval({ start, end }).map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd')
      const created = counts.get(dateKey) ?? 0
      runningTotal += created
      return {
        date: dateKey,
        created,
        createdTotal: runningTotal,
      }
    })
  }, [filteredRows, range, bounds])

  const usesSeries = React.useMemo(() => {
    if (!bounds) return []
    const start = new Date(range.start)
    const end = new Date(range.end)
    const startMs = start.getTime()
    const endMs = end.getTime() + DAY_MS - 1
    const sums = new Map<string, number>()

    filteredRows.forEach((row) => {
      if (!row.createdAt) return
      if (row.createdAt < startMs || row.createdAt > endMs) return
      const dateKey = format(new Date(row.createdAt), 'yyyy-MM-dd')
      sums.set(dateKey, (sums.get(dateKey) ?? 0) + row.uses)
    })

    let runningTotal = 0
    return eachDayOfInterval({ start, end }).map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd')
      const uses = sums.get(dateKey) ?? 0
      runningTotal += uses
      return {
        date: dateKey,
        uses,
        usesTotal: runningTotal,
      }
    })
  }, [filteredRows, range, bounds])

  const ownerFeeSummary = React.useMemo(() => {
    const map = new Map<
      string,
      {
        ownerLabel: string
        ownerType: string
        codeFeeUsd: number
        ownerFeeUsd: number
        codes: number
      }
    >()

    filteredRows.forEach((row) => {
      const ownerId = row.createdBy ?? 'none'
      const ownerFeeUsd = row.createdBy ? (ownerUsageFeeById.get(row.createdBy) ?? 0) : 0
      const current =
        map.get(ownerId) ??
        ({
          ownerLabel: row.ownerLabel,
          ownerType: row.ownerType,
          codeFeeUsd: 0,
          ownerFeeUsd,
          codes: 0,
        } as {
          ownerLabel: string
          ownerType: string
          codeFeeUsd: number
          ownerFeeUsd: number
          codes: number
        })
      current.codeFeeUsd += row.feeUsd
      current.codes += 1
      map.set(ownerId, current)
    })

    return { map }
  }, [filteredRows, ownerUsageFeeById])

  const ownerUsageSeries = React.useMemo(() => {
    if (!bounds) return { data: [], keys: [] as string[] }

    const ownerMap = new Map<string, string>()
    filteredRows.forEach((row) => {
      if (!row.createdBy) return
      if (!ownerMap.has(row.createdBy)) ownerMap.set(row.createdBy, row.ownerLabel)
    })

    const ownerTotals = Array.from(ownerMap.entries()).map(([ownerId, label]) => ({
      ownerId,
      label,
      total: ownerUsageFeeById.get(ownerId) ?? 0,
    }))
    ownerTotals.sort((a, b) => b.total - a.total)

    const topOwners = ownerTotals.slice(0, 6)
    const restOwners = ownerTotals.slice(6)

    const usedLabels = new Map<string, number>()
    const labelMap = new Map<string, string>()
    topOwners.forEach((owner) => {
      const base = owner.label || owner.ownerId
      const count = usedLabels.get(base) ?? 0
      usedLabels.set(base, count + 1)
      const label = count ? `${base} (${owner.ownerId.slice(0, 4)})` : base
      labelMap.set(owner.ownerId, label)
    })

    const keys = topOwners
      .map((owner) => labelMap.get(owner.ownerId))
      .filter((value): value is string => Boolean(value))

    const includeOther = restOwners.some((owner) => owner.total > 0)
    if (includeOther) keys.push('OTHER')

    const start = new Date(range.start)
    const end = new Date(range.end)
    const data = eachDayOfInterval({ start, end }).map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd')
      const row: Record<string, number | string> = {
        date: dateKey,
        total: 0,
        totalLine: 0,
      }

      let total = 0
      topOwners.forEach((owner) => {
        const label = labelMap.get(owner.ownerId)
        if (!label) return
        const dailyMap = index.ownerUsageDaily.get(owner.ownerId)
        const value = dailyMap?.get(dateKey)?.feeUsd ?? 0
        row[label] = value
        total += value
      })

      if (includeOther) {
        const otherTotal = restOwners.reduce((sum, owner) => {
          const dailyMap = index.ownerUsageDaily.get(owner.ownerId)
          return sum + (dailyMap?.get(dateKey)?.feeUsd ?? 0)
        }, 0)
        row.OTHER = otherTotal
        total += otherTotal
      }

      row.total = total
      row.totalLine = total
      return row
    })

    return { data, keys }
  }, [bounds, filteredRows, ownerUsageFeeById, index, range])

  const handleCopyCodes = async () => {
    const codes = filteredRows.map((row) => row.code).join('\n')
    if (!codes) {
      setCopyStatus('No codes to copy')
      return
    }

    if (!navigator.clipboard) {
      setCopyStatus('Clipboard unavailable')
      return
    }

    try {
      await navigator.clipboard.writeText(codes)
      setCopyStatus(`Copied ${formatNumber(filteredRows.length)} codes`)
    } catch (error) {
      setCopyStatus('Copy failed')
    }

    window.setTimeout(() => setCopyStatus(null), 2000)
  }

  const handleExport = () => {
    const header = toCsvRow([
      'Code',
      'Note',
      'Uses',
      'Max Uses',
      'Usage Rate',
      'Active',
      'Exhausted',
      'Valid From',
      'Valid Until',
      'Created At',
      'Created By',
      'Owner Label',
      'Owner Type',
      'Status',
      'Signups',
      'Users With Revenue',
      'Fee USD',
      'Volume USD',
      'Owner Code Fee USD',
      'Owner Usage Fee USD',
      'Conversion Rate',
      'ARPU',
    ])

    const rows = filteredRows.map((row) => {
      const ownerKey = row.createdBy ?? 'none'
      const ownerSummary = ownerFeeSummary.map.get(ownerKey)
      return toCsvRow([
        row.code,
        row.note,
        row.uses,
        row.maxUses ?? '',
        row.usageRate ?? '',
        row.isActive,
        row.isExhausted,
        row.validFrom ? new Date(row.validFrom).toISOString() : '',
        row.validUntil ? new Date(row.validUntil).toISOString() : '',
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
        row.createdBy ?? '',
        row.ownerLabel,
        row.ownerType,
        row.status,
        row.signups,
        row.usersWithRevenueTx,
        row.feeUsd,
        row.volumeUsd,
        ownerSummary?.codeFeeUsd ?? 0,
        ownerSummary?.ownerFeeUsd ?? 0,
        row.conversionRate,
        row.feePerUser,
      ])
    })

    const filename = `referral-codes-${format(new Date(), 'yyyy-MM-dd')}.csv`
    downloadFile(filename, `${header}\n${rows.join('\n')}`, 'text/csv')
  }

  const handleClearFilters = () => {
    setCodeFilter('')
    setOwnerPresence('all')
    setNoteFilter('')
    setStatusFilter('all')
    setActiveOnly(false)
    setUsesMin('')
    setUsesMax('')
    setMaxUsesMin('')
    setMaxUsesMax('')
    setUsageRateMin('')
    setUsageRateMax('')
    setSignupsMin('')
    setSignupsMax('')
    setFeeMin('')
    setFeeMax('')
    setOwnerUsageMin('')
    setOwnerUsageMax('')
    setArpuMin('')
    setArpuMax('')
    setConversionMin('')
    setConversionMax('')
    setCreatedFrom('')
    setCreatedTo('')
  }

  const columns = () => [
    {
      accessorKey: 'code',
      header: 'Referral',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => (
        <Link className="font-semibold text-primary" to={`/referral-detail/${row.original.code}`}>
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: 'ownerLabel',
      header: 'Owner',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => (
        <div>
          <p className="font-medium">{row.original.ownerLabel}</p>
          <p className="text-xs text-muted-foreground">{row.original.ownerType}</p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => (
        <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
      ),
    },
    {
      accessorKey: 'uses',
      header: 'Uses',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => formatNumber(row.original.uses),
    },
    {
      accessorKey: 'maxUses',
      header: 'Max uses',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) =>
        row.original.maxUses ? formatNumber(row.original.maxUses) : '∞',
    },
    {
      id: 'usageRate',
      accessorFn: (row: ReferralCodeRow) => row.usageRate ?? 0,
      header: 'Usage rate',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) =>
        row.original.usageRate !== null ? formatPercent(row.original.usageRate) : '—',
    },
    {
      accessorKey: 'signups',
      header: 'Signups',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => formatNumber(row.original.signups),
    },
    {
      accessorKey: 'feeUsd',
      header: 'Fee USD',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => formatUsd(row.original.feeUsd),
    },
    {
      accessorKey: 'volumeUsd',
      header: 'Volume USD',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => formatUsd(row.original.volumeUsd),
    },
    {
      id: 'ownerCodeFeeUsd',
      accessorFn: (row: ReferralCodeRow) => {
        const ownerKey = row.createdBy ?? 'none'
        return ownerFeeSummary.map.get(ownerKey)?.codeFeeUsd ?? 0
      },
      header: 'Owner code fee',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => {
        const ownerKey = row.original.createdBy ?? 'none'
        return formatUsd(ownerFeeSummary.map.get(ownerKey)?.codeFeeUsd ?? 0)
      },
    },
    {
      id: 'ownerUsageFeeUsd',
      accessorFn: (row: ReferralCodeRow) => {
        const ownerKey = row.createdBy ?? 'none'
        return ownerFeeSummary.map.get(ownerKey)?.ownerFeeUsd ?? 0
      },
      header: 'Owner usage fee',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => {
        const ownerKey = row.original.createdBy ?? 'none'
        return formatUsd(ownerFeeSummary.map.get(ownerKey)?.ownerFeeUsd ?? 0)
      },
    },
    {
      accessorKey: 'feePerUser',
      header: 'ARPU',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => formatUsd(row.original.feePerUser),
    },
    {
      accessorKey: 'conversionRate',
      header: 'Conversion',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) =>
        formatPercent(row.original.conversionRate),
    },
    {
      accessorKey: 'note',
      header: 'Note',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => (
        <span className="block max-w-[240px] truncate text-xs text-muted-foreground">
          {row.original.note || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }: { row: { original: ReferralCodeRow } }) => formatDate(row.original.createdAt),
    },
  ]

  return (
    <div className="space-y-6">
      {bounds ? (
        <DateRangePicker range={range} min={bounds.start} max={bounds.end} onChange={setDateRange} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Codes in view"
          value={formatNumber(filteredRows.length)}
          helper={`of ${formatNumber(rows.length)} total`}
        />
        <KpiCard
          title="Active codes"
          value={formatNumber(totals.activeCodes)}
          helper={filteredRows.length ? formatPercent(totals.activeCodes / filteredRows.length) : '0%'}
        />
        <KpiCard
          title="Signups from codes"
          value={formatNumber(totals.signups)}
          helper={formatPercent(totals.signupShare)}
        />
        <KpiCard
          title="Fee from codes"
          value={formatUsd(totals.feeUsd)}
          helper={formatPercent(totals.feeShare)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New codes created</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={createdSeries} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
              <defs>
                <linearGradient id="codes-created" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(value) => value.slice(5)} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatNumber(Number(value ?? 0))}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatNumber(Number(value ?? 0))}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value: number | string | undefined, name) => [
                  formatNumber(Number(value ?? 0)),
                  name === 'createdTotal' ? 'Sum' : 'Created',
                ]}
                labelFormatter={(label) => `Date ${label}`}
              />
              <Area yAxisId="left" type="monotone" dataKey="created" stroke="#6366f1" fill="url(#codes-created)" />
              <Line yAxisId="right" type="monotone" dataKey="createdTotal" stroke="#f97316" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uses by code creation date</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usesSeries} margin={{ left: 8, right: 16, top: 16, bottom: 0 }}>
                <defs>
                  <linearGradient id="codes-uses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(value) => value.slice(5)} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => formatNumber(Number(value ?? 0))}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => formatNumber(Number(value ?? 0))}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value: number | string | undefined, name) => [
                    formatNumber(Number(value ?? 0)),
                    name === 'usesTotal' ? 'Sum uses' : 'Uses',
                  ]}
                  labelFormatter={(label) => `Date ${label}`}
                />
                <Area yAxisId="left" type="monotone" dataKey="uses" stroke="#22c55e" fill="url(#codes-uses)" />
                <Line yAxisId="right" type="monotone" dataKey="usesTotal" stroke="#0f766e" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <DailyStackedChart
          title="Owner usage fee by day"
          metric="feeUsd"
          data={ownerUsageSeries.data}
          keys={ownerUsageSeries.keys}
          lineKey="totalLine"
        />


      <Card>
        <CardHeader>
          <CardTitle>Referral code analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Code</p>
              <Input
                value={codeFilter}
                onChange={(event) => setCodeFilter(event.target.value)}
                placeholder="Code"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Owner</p>
              <Select value={ownerPresence} onValueChange={setOwnerPresence}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Any owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any owner</SelectItem>
                  <SelectItem value="with">Has owner</SelectItem>
                  <SelectItem value="without">No owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Note</p>
              <Input
                value={noteFilter}
                onChange={(event) => setNoteFilter(event.target.value)}
                placeholder="Note contains"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Exhausted">Exhausted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Created date</p>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={createdFrom}
                  onChange={(event) => setCreatedFrom(event.target.value)}
                  className="h-8"
                />
                <Input
                  type="date"
                  value={createdTo}
                  onChange={(event) => setCreatedTo(event.target.value)}
                  className="h-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Active only</p>
              <div className="flex items-center gap-2">
                <Switch checked={activeOnly} onCheckedChange={(value) => setActiveOnly(Boolean(value))} />
                <span className="text-xs text-muted-foreground">Hide inactive</span>
              </div>
            </div>
            <RangeFilter label="Uses" minValue={usesMin} maxValue={usesMax} onMinChange={setUsesMin} onMaxChange={setUsesMax} />
            <RangeFilter
              label="Max uses"
              minValue={maxUsesMin}
              maxValue={maxUsesMax}
              onMinChange={setMaxUsesMin}
              onMaxChange={setMaxUsesMax}
            />
            <RangeFilter
              label="Usage rate (%)"
              minValue={usageRateMin}
              maxValue={usageRateMax}
              onMinChange={setUsageRateMin}
              onMaxChange={setUsageRateMax}
              step="0.1"
            />
            <RangeFilter
              label="Signups"
              minValue={signupsMin}
              maxValue={signupsMax}
              onMinChange={setSignupsMin}
              onMaxChange={setSignupsMax}
            />
            <RangeFilter
              label="Fee USD"
              minValue={feeMin}
              maxValue={feeMax}
              onMinChange={setFeeMin}
              onMaxChange={setFeeMax}
              step="0.01"
            />
            <RangeFilter
              label="Owner usage fee"
              minValue={ownerUsageMin}
              maxValue={ownerUsageMax}
              onMinChange={setOwnerUsageMin}
              onMaxChange={setOwnerUsageMax}
              step="0.01"
            />
            <RangeFilter
              label="ARPU"
              minValue={arpuMin}
              maxValue={arpuMax}
              onMinChange={setArpuMin}
              onMaxChange={setArpuMax}
              step="0.01"
            />
            <RangeFilter
              label="Conversion (%)"
              minValue={conversionMin}
              maxValue={conversionMax}
              onMinChange={setConversionMin}
              onMaxChange={setConversionMax}
              step="0.1"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleClearFilters}>
                Clear filters
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyCodes}>
                Copy codes
              </Button>
              <Button size="sm" variant="outline" onClick={handleExport}>
                Export CSV
              </Button>
              {copyStatus ? <span className="text-xs text-muted-foreground">{copyStatus}</span> : null}
            </div>
            <Badge variant="outline">ARPU avg: {formatUsd(totals.arpu)}</Badge>
          </div>
          <DataTable
            columns={columns()}
            data={filteredRows}
            enablePagination
            pageSize={30}
            className="overflow-x-auto"
          />
        </CardContent>
      </Card>
    </div>
  )
}

type RangeFilterProps = {
  label: string
  minValue: string
  maxValue: string
  onMinChange: (value: string) => void
  onMaxChange: (value: string) => void
  step?: string
}

function RangeFilter({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  step = '1',
}: RangeFilterProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        <Input
          type="number"
          min="0"
          step={step}
          value={minValue}
          onChange={(event) => onMinChange(event.target.value)}
          placeholder="Min"
          className="h-8"
        />
        <Input
          type="number"
          min="0"
          step={step}
          value={maxValue}
          onChange={(event) => onMaxChange(event.target.value)}
          placeholder="Max"
          className="h-8"
        />
      </div>
    </div>
  )
}

function buildReferralRow(
  meta: ReferralCodeMeta,
  index: AnalyticsIndex,
  range: DateRange,
  now: number,
): ReferralCodeRow {
  const metrics = getReferralMetrics(index, meta.code, range)
  const owner = meta.createdBy ? index.customersById.get(meta.createdBy) : undefined
  const ownerLabel = owner?.email || meta.createdBy || 'No owner'
  const ownerType = owner ? 'Customer' : meta.createdBy ? 'External' : 'Campaign'
  const usageRate = meta.maxUses ? meta.uses / meta.maxUses : null

  const status = buildStatus(meta, now)
  const isLive = status === 'Active'
  return {
    code: meta.code,
    note: meta.note,
    uses: meta.uses,
    maxUses: meta.maxUses,
    usageRate,
    isActive: meta.isActive,
    isExhausted: meta.isExhausted,
    validFrom: meta.validFrom,
    validUntil: meta.validUntil,
    createdAt: meta.createdAt,
    createdBy: meta.createdBy,
    ownerLabel,
    ownerType,
    status,
    isLive,
    signups: metrics.signups,
    usersWithRevenueTx: metrics.usersWithRevenueTx,
    feeUsd: metrics.feeUsd,
    volumeUsd: metrics.volumeUsd,
    conversionRate: metrics.conversionRate,
    feePerUser: metrics.feePerUser,
  }
}

function buildStatus(meta: ReferralCodeMeta, now: number) {
  if (!meta.isActive) return 'Inactive'
  if (meta.isExhausted) return 'Exhausted'
  if (meta.validFrom && meta.validFrom > now) return 'Scheduled'
  if (meta.validUntil && meta.validUntil < now) return 'Expired'
  return 'Active'
}

function statusVariant(status: string) {
  if (status === 'Active') return 'default'
  if (status === 'Scheduled') return 'secondary'
  return 'muted'
}
