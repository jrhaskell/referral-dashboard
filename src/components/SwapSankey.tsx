import * as React from 'react'
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts'

import type { SwapSankeyData } from '@/lib/analytics'
import { formatPercent, formatUsd } from '@/lib/utils'

const sankeyColors = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
]

function baseTokenName(name: string) {
  return name.replace(/\s+\((out|in)\)$/i, '')
}

function getTokenColor(token: string) {
  let hash = 0
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) % 997
  }
  return sankeyColors[hash % sankeyColors.length]
}

type SwapSankeyProps = {
  data: SwapSankeyData
  height?: number
  legendLimit?: number
  emptyMessage?: string
}

export function SwapSankey({
  data,
  height = 360,
  legendLimit = 10,
  emptyMessage = 'No swap data in this range.',
}: SwapSankeyProps) {
  const totalFlow = React.useMemo(
    () => data.links.reduce((sum, link) => sum + Number(link.value ?? 0), 0),
    [data.links],
  )

  const legend = React.useMemo(() => {
    const totals = new Map<string, number>()
    let total = 0
    data.links.forEach((link) => {
      const sourceIndex = typeof link.source === 'number' ? link.source : -1
      const sourceName = data.nodes[sourceIndex]?.name
      if (!sourceName) return
      const base = baseTokenName(sourceName)
      const value = Number(link.value ?? 0)
      if (!base || !value) return
      totals.set(base, (totals.get(base) ?? 0) + value)
      total += value
    })

    const items = Array.from(totals.entries())
      .map(([token, value]) => ({ token, value, percent: total ? value / total : 0 }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, legendLimit)

    return { items, total }
  }, [data, legendLimit])

  const SankeyNode = React.useCallback(
    ({ x, y, width, height: nodeHeight, payload }: any) => {
      const name = typeof payload?.name === 'string' ? payload.name : ''
      const base = baseTokenName(name)
      const color = getTokenColor(base)
      const isRight = x > 220
      const labelX = isRight ? x + width + 6 : x - 6
      const anchor = isRight ? 'start' : 'end'
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={nodeHeight}
            fill={color}
            stroke="#0f172a"
            strokeWidth={0.5}
            rx={2}
          />
          <text x={labelX} y={y + nodeHeight / 2} textAnchor={anchor} dominantBaseline="middle" fontSize={11}>
            {base}
          </text>
        </g>
      )
    },
    [],
  )

  const SankeyLink = React.useCallback(
    ({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceControlX,
      targetControlX,
      linkWidth,
      strokeWidth,
      payload,
      index,
    }: any) => {
      if ([sourceX, sourceY, targetX, targetY].some((value) => typeof value !== 'number')) return null
      const sourceName =
        typeof payload?.source?.name === 'string'
          ? baseTokenName(payload.source.name)
        : typeof payload?.source === 'number'
            ? baseTokenName(data.nodes[payload.source]?.name ?? '')
            : ''
      const targetName =
        typeof payload?.target?.name === 'string'
          ? baseTokenName(payload.target.name)
          : typeof payload?.target === 'number'
            ? baseTokenName(data.nodes[payload.target]?.name ?? '')
            : ''
      const sourceColor = getTokenColor(sourceName)
      const targetColor = getTokenColor(targetName)
      const gradientId = `swap-flow-${index}`
      const thickness = Math.max(1, Number(linkWidth ?? strokeWidth ?? 1))
      const deltaX = targetX - sourceX
      const curvature = 0.5
      const resolvedSourceControlX =
        typeof sourceControlX === 'number' ? sourceControlX : sourceX + deltaX * curvature
      const resolvedTargetControlX =
        typeof targetControlX === 'number' ? targetControlX : targetX - deltaX * curvature
      const path = `M${sourceX},${sourceY}C${resolvedSourceControlX},${sourceY} ${resolvedTargetControlX},${targetY} ${targetX},${targetY}`

      return (
        <g>
          <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
              <stop offset="0%" stopColor={sourceColor} stopOpacity={0.55} />
              <stop offset="100%" stopColor={targetColor} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <path d={path} stroke={`url(#${gradientId})`} strokeWidth={thickness} fill="none" />
        </g>
      )
    },
    [data.nodes],
  )

  if (!data.links.length) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="space-y-3">
      {legend.items.length ? (
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {legend.items.map((item) => (
            <span key={item.token} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getTokenColor(item.token) }} />
              <span>{item.token}</span>
              <span>{formatPercent(item.percent)}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            nodePadding={16}
            nodeWidth={12}
            node={SankeyNode}
            link={<SankeyLink />}
            margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const entry = payload[0]?.payload as any
                const value = Number(payload[0]?.value ?? entry?.value ?? 0)
                const percent = totalFlow ? value / totalFlow : 0
                const sourceName =
                  typeof entry?.source?.name === 'string'
                    ? baseTokenName(entry.source.name)
                    : typeof entry?.source === 'number'
                      ? baseTokenName(data.nodes[entry.source]?.name ?? '')
                      : ''
                const targetName =
                  typeof entry?.target?.name === 'string'
                    ? baseTokenName(entry.target.name)
                    : typeof entry?.target === 'number'
                      ? baseTokenName(data.nodes[entry.target]?.name ?? '')
                      : ''
                const label =
                  sourceName && targetName
                    ? `${sourceName} → ${targetName}`
                    : typeof entry?.name === 'string'
                      ? baseTokenName(entry.name)
                      : 'Swap flow'

                return (
                  <div className="rounded-md border bg-popover p-2 text-xs shadow">
                    <div className="font-semibold">{label}</div>
                    <div className="text-muted-foreground">
                      {formatUsd(value)} · {formatPercent(percent)}
                    </div>
                  </div>
                )
              }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
