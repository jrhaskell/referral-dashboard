import * as React from 'react'
import { subDays, format } from 'date-fns'

import { type AnalyticsIndex, type DateRange, getRangeBounds } from '@/lib/analytics'

type AnalyticsContextValue = {
  index: AnalyticsIndex | null
  setIndex: (index: AnalyticsIndex | null) => void
  dateRange: DateRange | null
  setDateRange: (range: DateRange) => void
}

const AnalyticsContext = React.createContext<AnalyticsContextValue | undefined>(undefined)

function buildDefaultRange(index: AnalyticsIndex): DateRange | null {
  const bounds = getRangeBounds(index)
  if (!bounds) return null
  const endDate = new Date(bounds.end)
  const startDate = subDays(endDate, 30)
  const start = format(startDate, 'yyyy-MM-dd')
  return {
    start: start < bounds.start ? bounds.start : start,
    end: bounds.end,
  }
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [index, setIndexState] = React.useState<AnalyticsIndex | null>(null)
  const [dateRange, setDateRangeState] = React.useState<DateRange | null>(null)

  const setIndex = React.useCallback((next: AnalyticsIndex | null) => {
    setIndexState(next)
    if (next) {
      const nextRange = buildDefaultRange(next)
      if (nextRange) setDateRangeState(nextRange)
    } else {
      setDateRangeState(null)
    }
  }, [])

  const setDateRange = React.useCallback((range: DateRange) => {
    setDateRangeState(range)
  }, [])

  const value = React.useMemo(
    () => ({ index, setIndex, dateRange, setDateRange }),
    [index, setIndex, dateRange, setDateRange],
  )

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>
}

export function useAnalytics() {
  const context = React.useContext(AnalyticsContext)
  if (!context) {
    throw new Error('useAnalytics must be used within AnalyticsProvider')
  }
  return context
}
