import { eachDayOfInterval, format } from 'date-fns'

import type { AnalyticsIndex, DateRange } from '@/lib/analytics'

export type DailyMetric = 'signups' | 'feeUsd'

export type DailyStackedSeries = {
  data: Array<Record<string, number | string>>
  keys: string[]
}

export type TotalMode = 'selection' | 'global'
export type LineMode = 'daily' | 'cumulative'

type BuildDailyStackedSeriesInput = {
  index: AnalyticsIndex
  range: DateRange
  referralCodes: string[]
  metric: DailyMetric
  topN: number
  totalMode?: TotalMode
  lineMode?: LineMode
}

export function buildDailyStackedSeries({
  index,
  range,
  referralCodes,
  metric,
  topN,
  totalMode = 'selection',
  lineMode = 'daily',
}: BuildDailyStackedSeriesInput): DailyStackedSeries {
  if (!referralCodes.length) return { data: [], keys: [] }

  const days = eachDayOfInterval({ start: new Date(range.start), end: new Date(range.end) }).map((day) =>
    format(day, 'yyyy-MM-dd'),
  )

  const totalsByCode = new Map<string, number>()
  referralCodes.forEach((code) => {
    const referral = index.referrals.get(code)
    if (!referral) return
    let total = 0
    days.forEach((date) => {
      if (metric === 'signups') {
        total += referral.signupsByDate.get(date) ?? 0
      } else {
        total += referral.daily.get(date)?.feeUsd ?? 0
      }
    })
    totalsByCode.set(code, total)
  })

  const ranked = Array.from(totalsByCode.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code)

  const topCodes = ranked.slice(0, Math.max(1, topN))
  const otherCodes = ranked.slice(topCodes.length)
  const otherTotal = otherCodes.reduce((sum, code) => sum + (totalsByCode.get(code) ?? 0), 0)
  const includeOther = otherTotal > 0

  const keys = includeOther ? [...topCodes, 'OTHER'] : [...topCodes]

  let runningTotal = 0

  const data = days.map((date) => {
    const row: Record<string, number | string> = { date, total: 0, totalLine: 0 }
    let total = 0
    let otherSum = 0

    topCodes.forEach((code) => {
      const referral = index.referrals.get(code)
      const value =
        metric === 'signups'
          ? referral?.signupsByDate.get(date) ?? 0
          : referral?.daily.get(date)?.feeUsd ?? 0
      row[code] = value
      total += value
    })

    otherCodes.forEach((code) => {
      const referral = index.referrals.get(code)
      const value =
        metric === 'signups'
          ? referral?.signupsByDate.get(date) ?? 0
          : referral?.daily.get(date)?.feeUsd ?? 0
      otherSum += value
    })

    if (includeOther) {
      row.OTHER = otherSum
      total += otherSum
    }

    const globalTotal =
      metric === 'signups'
        ? index.global.signupsByDate.get(date) ?? 0
        : index.global.daily.get(date)?.feeUsd ?? 0

    const dailyTotal = totalMode === 'global' ? globalTotal : total
    row.total = dailyTotal
    runningTotal += dailyTotal
    row.totalLine = lineMode === 'cumulative' ? runningTotal : dailyTotal

    return row
  })

  return { data, keys }
}
