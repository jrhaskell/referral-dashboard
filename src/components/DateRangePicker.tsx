import { format, subDays } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DateRange } from '@/lib/analytics'

export function DateRangePicker({
  range,
  min,
  max,
  onChange,
}: {
  range: DateRange
  min: string
  max: string
  onChange: (range: DateRange) => void
}) {
  const setPreset = (days: number) => {
    const endDate = new Date(range.end)
    const start = format(subDays(endDate, days - 1), 'yyyy-MM-dd')
    onChange({ start: start < min ? min : start, end: range.end })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setPreset(7)}>
          Last 7d
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPreset(30)}>
          Last 30d
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPreset(90)}>
          Last 90d
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Input
          type="date"
          value={range.start}
          min={min}
          max={range.end}
          onChange={(event) => onChange({ start: event.target.value, end: range.end })}
        />
        <span className="text-muted-foreground">to</span>
        <Input
          type="date"
          value={range.end}
          min={range.start}
          max={max}
          onChange={(event) => onChange({ start: range.start, end: event.target.value })}
        />
      </div>
    </div>
  )
}
