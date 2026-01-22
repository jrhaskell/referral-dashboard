import * as React from 'react'
import { Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ReferralMultiSelectProps = {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  onSelectAll: () => void
  onClear: () => void
  onQuickSelect?: () => void
  quickSelectLabel?: string
  className?: string
}

export function ReferralMultiSelect({
  options,
  selected,
  onChange,
  onSelectAll,
  onClear,
  onQuickSelect,
  quickSelectLabel,
  className,
}: ReferralMultiSelectProps) {
  const [query, setQuery] = React.useState('')
  const [manualInput, setManualInput] = React.useState('')
  const [manualNote, setManualNote] = React.useState<string | null>(null)
  const selectedSet = React.useMemo(() => new Set(selected), [selected])

  const optionMap = React.useMemo(() => {
    const entries = options.map((option) => [option.toLowerCase(), option] as const)
    return new Map(entries)
  }, [options])

  const filtered = React.useMemo(() => {
    if (!query) return options
    const lower = query.toLowerCase()
    return options.filter((option) => option.toLowerCase().includes(lower))
  }, [options, query])

  const toggle = (code: string) => {
    if (selectedSet.has(code)) {
      onChange(selected.filter((item) => item !== code))
    } else {
      onChange([...selected, code])
    }
  }

  const addManualList = () => {
    const tokens = manualInput
      .split(/[\s,;]+/)
      .map((token) => token.trim())
      .filter(Boolean)
    if (!tokens.length) return
    const next = new Set(selected)
    const unknown: string[] = []

    tokens.forEach((token) => {
      const normalized = optionMap.get(token.toLowerCase())
      if (normalized) {
        next.add(normalized)
      } else {
        unknown.push(token)
      }
    })

    onChange(Array.from(next))
    setManualInput('')
    if (unknown.length) {
      setManualNote(
        `Ignored ${unknown.length} unknown code${unknown.length > 1 ? 's' : ''}: ${unknown
          .slice(0, 5)
          .join(', ')}`,
      )
    } else {
      setManualNote('Added referrals from list.')
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Referral group selection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search referral codes"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onSelectAll}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
          {onQuickSelect ? (
            <Button variant="outline" size="sm" onClick={onQuickSelect}>
              {quickSelectLabel ?? 'Quick select'}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {selected.length ? (
            selected.map((code) => (
              <Badge key={code} variant="secondary" className="flex items-center gap-1">
                {code}
                <button type="button" onClick={() => toggle(code)} className="text-muted-foreground">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No referrals selected yet.</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground">Paste referral list</p>
          <textarea
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder="MYC12 BNADA RAMON"
            className="min-h-[90px] w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={addManualList}>
              Add list
            </Button>
            <span className="text-xs text-muted-foreground">
              Separate codes with spaces, commas, or new lines.
            </span>
          </div>
          {manualNote ? <p className="text-xs text-muted-foreground">{manualNote}</p> : null}
        </div>

        <div className="max-h-56 overflow-auto rounded-lg border">
          <ul className="divide-y">
            {filtered.length ? (
              filtered.map((code) => (
                <li key={code} className="flex items-center gap-2 px-3 py-2">
                  <Checkbox checked={selectedSet.has(code)} onCheckedChange={() => toggle(code)} />
                  <button
                    type="button"
                    className={cn('text-sm', selectedSet.has(code) && 'font-semibold text-primary')}
                    onClick={() => toggle(code)}
                  >
                    {code}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-xs text-muted-foreground">No matches found.</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
