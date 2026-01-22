import type { AnalyticsIndex, DateRange, ReferralMetrics } from '@/lib/analytics'
import { getReferralMetrics } from '@/lib/analytics'
import { buildDailyStackedSeries } from '@/lib/analytics/buildDailySeries'

export type GroupSummary = {
  signups: number
  kycUsers: number
  usersWithRevenueTx: number
  volumeUsd: number
  feeUsd: number
  conversionRate: number
  feePerUser: number
  kycRate: number
}

export type GroupConcentration = {
  top1Share: number
  top3Share: number
}

export type GroupLeaderboardRow = ReferralMetrics

export type GroupDailySeries = ReturnType<typeof buildDailyStackedSeries>

export function getGroupReferralMetrics(
  index: AnalyticsIndex,
  range: DateRange,
  code: string,
): ReferralMetrics {
  return getReferralMetrics(index, code, range)
}

export function getGroupLeaderboard(index: AnalyticsIndex, range: DateRange, codes: string[]) {
  return codes.map((code) => getGroupReferralMetrics(index, range, code))
}

export function getGroupSummary(index: AnalyticsIndex, range: DateRange, codes: string[]): GroupSummary {
  const metrics = codes.map((code) => getGroupReferralMetrics(index, range, code))
  const signups = metrics.reduce((sum, metric) => sum + metric.signups, 0)
  const kycUsers = metrics.reduce((sum, metric) => sum + metric.kycUsers, 0)
  const usersWithRevenueTx = metrics.reduce((sum, metric) => sum + metric.usersWithRevenueTx, 0)
  const volumeUsd = metrics.reduce((sum, metric) => sum + metric.volumeUsd, 0)
  const feeUsd = metrics.reduce((sum, metric) => sum + metric.feeUsd, 0)
  const conversionRate = signups ? usersWithRevenueTx / signups : 0
  const feePerUser = usersWithRevenueTx ? feeUsd / usersWithRevenueTx : 0
  const kycRate = signups ? kycUsers / signups : 0
  return { signups, kycUsers, usersWithRevenueTx, volumeUsd, feeUsd, conversionRate, feePerUser, kycRate }
}

export function getGroupConcentration(metrics: ReferralMetrics[]): GroupConcentration {
  const sorted = metrics.slice().sort((a, b) => b.feeUsd - a.feeUsd)
  const totalFee = metrics.reduce((sum, metric) => sum + metric.feeUsd, 0)
  const top1 = sorted[0]?.feeUsd ?? 0
  const top3 = sorted.slice(0, 3).reduce((sum, metric) => sum + metric.feeUsd, 0)
  const top1Share = totalFee ? top1 / totalFee : 0
  const top3Share = totalFee ? top3 / totalFee : 0
  return { top1Share, top3Share }
}

export function buildGroupStackedSeries(
  index: AnalyticsIndex,
  range: DateRange,
  codes: string[],
  metric: 'signups' | 'feeUsd',
  topN: number,
  lineMode: 'daily' | 'cumulative',
) {
  return buildDailyStackedSeries({
    index,
    range,
    referralCodes: codes,
    metric,
    topN,
    totalMode: 'selection',
    lineMode,
  })
}

export function buildGroupTotalSeries(
  index: AnalyticsIndex,
  range: DateRange,
  codes: string[],
  metric: 'signups' | 'feeUsd',
) {
  const stacked = buildDailyStackedSeries({
    index,
    range,
    referralCodes: codes,
    metric,
    topN: codes.length || 1,
    totalMode: 'selection',
    lineMode: 'daily',
  })

  const data = stacked.data.map((row) => {
    const total = Number(row.total) || 0
    return {
      date: row.date,
      Group: total,
      total,
      totalLine: total,
    }
  })

  return { data, keys: ['Group'] }
}
