import * as React from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAnalytics } from '@/lib/analytics/context'
import { formatDate, formatNumber, formatUsd } from '@/lib/utils'
import { normalizeWallet } from '@/lib/analytics'

export function WalletLookupPage() {
  const { index } = useAnalytics()
  const [query, setQuery] = React.useState('')
  const [resultKey, setResultKey] = React.useState('')

  if (!index) return null

  const customer = resultKey ? index.customersById.get(resultKey) : undefined
  const walletLookup = resultKey ? index.usersByWallet.get(normalizeWallet(resultKey)) : undefined
  const resolvedCustomer = customer ?? index.customersByWallet.get(normalizeWallet(resultKey))
  const user = walletLookup ?? (resolvedCustomer ? index.usersByWallet.get(resolvedCustomer.smartWallet) : undefined)

  const handleSearch = () => {
    setResultKey(query.trim())
  }

  const timeline = user?.firstRevenueTxAt && user?.lastRevenueTxAt
    ? [
        { date: formatDate(user.firstRevenueTxAt), value: user.feeUsd },
        { date: formatDate(user.lastRevenueTxAt), value: user.feeUsd },
      ]
    : []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wallet / customer lookup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by smart wallet or customer ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button onClick={handleSearch}>Search</Button>
        </CardContent>
      </Card>

      {resultKey && user && resolvedCustomer ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Customer profile</CardTitle>
              <Badge variant={resolvedCustomer.notusId ? 'default' : 'secondary'}>
                {resolvedCustomer.notusId ? 'KYC' : 'No KYC'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Customer ID</span>
                <p className="font-medium">{resolvedCustomer.id}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Referral</span>
                <p className="font-medium">{resolvedCustomer.referral}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Signup date</span>
                <p className="font-medium">{formatDate(resolvedCustomer.signupAt)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Smart wallet</span>
                <p className="font-mono text-xs">{resolvedCustomer.smartWallet}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>User totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tx count</span>
                <span>{formatNumber(user.revenueTxCount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee USD</span>
                <span>{formatUsd(user.feeUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Volume USD</span>
                <span>{formatUsd(user.volumeUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">First tx</span>
                <span>{formatDate(user.firstRevenueTxAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last tx</span>
                <span>{formatDate(user.lastRevenueTxAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time to first tx</span>
                <span>
                  {user.timeToFirstTxMs ? `${(user.timeToFirstTxMs / 86400000).toFixed(1)}d` : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Mini timeline</CardTitle>
            </CardHeader>
            <CardContent className="h-48">
              {timeline.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => formatUsd(Number(value))} />
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No revenue timeline data stored.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : resultKey ? (
        <Card>
          <CardHeader>
            <CardTitle>No results</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Try a different wallet or customer ID.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
