import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { FileDropzone } from '@/components/FileDropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import {
  addCustomer,
  addReferralCodeMeta,
  addRevenueTransaction,
  createAnalyticsIndex,
  deserializeIndex,
  type FileMeta,
  serializeIndex,
} from '@/lib/analytics'
import { useAnalytics } from '@/lib/analytics/context'
import { type CsvParseResult, parseCustomersCsv } from '@/lib/parsers/csv'
import { parseReferralCodesCsv, type ReferralCodesParseResult } from '@/lib/parsers/referralCodes'
import { parseTransactionsNdjson } from '@/lib/parsers/ndjson'
import { buildCacheKey, getSnapshot, saveSnapshot } from '@/lib/storage/indexeddb'
import { formatNumber } from '@/lib/utils'

export function ImportPage() {
  const navigate = useNavigate()
  const { setIndex } = useAnalytics()

  const [customersFile, setCustomersFile] = React.useState<File | null>(null)
  const [txFile, setTxFile] = React.useState<File | null>(null)
  const [referralCodesFile, setReferralCodesFile] = React.useState<File | null>(null)
  const [keepFullTx, setKeepFullTx] = React.useState(false)
  const [isBuilding, setIsBuilding] = React.useState(false)
  const [csvReport, setCsvReport] = React.useState<CsvParseResult | null>(null)
  const [referralReport, setReferralReport] = React.useState<ReferralCodesParseResult | null>(null)
  const [errors, setErrors] = React.useState<string[]>([])
  const [status, setStatus] = React.useState<string | null>(null)
  const [csvProgress, setCsvProgress] = React.useState({ rows: 0, bytes: 0 })
  const [referralProgress, setReferralProgress] = React.useState({ rows: 0, bytes: 0 })
  const [ndjsonProgress, setNdjsonProgress] = React.useState({ lines: 0, bytes: 0, revenue: 0 })

  const reset = () => {
    setCustomersFile(null)
    setTxFile(null)
    setReferralCodesFile(null)
    setKeepFullTx(false)
    setCsvReport(null)
    setReferralReport(null)
    setErrors([])
    setStatus(null)
    setCsvProgress({ rows: 0, bytes: 0 })
    setReferralProgress({ rows: 0, bytes: 0 })
    setNdjsonProgress({ lines: 0, bytes: 0, revenue: 0 })
    setIndex(null)
  }

  const buildDashboard = async () => {
    if (!customersFile || !txFile || !referralCodesFile) return
    setIsBuilding(true)
    setErrors([])
    setStatus('Checking cache…')

    const customersMeta: FileMeta = {
      name: customersFile.name,
      size: customersFile.size,
      lastModified: customersFile.lastModified,
    }
    const txMeta: FileMeta = {
      name: txFile.name,
      size: txFile.size,
      lastModified: txFile.lastModified,
    }
    const referralCodesMeta: FileMeta = {
      name: referralCodesFile.name,
      size: referralCodesFile.size,
      lastModified: referralCodesFile.lastModified,
    }

    const cacheKey = buildCacheKey(customersMeta, txMeta, referralCodesMeta)
    try {
      const cached = await getSnapshot(cacheKey)
      if (cached) {
        setStatus('Loaded cached snapshot.')
        const index = deserializeIndex(cached)
        setIndex(index)
        navigate('/home')
        return
      }
    } catch (error) {
      setErrors((prev) => [...prev, 'IndexedDB cache unavailable.'])
    }

    try {
      setStatus('Parsing referral codes CSV…')
      const referralResult = await parseReferralCodesCsv(referralCodesFile, (progress) => {
        setReferralProgress(progress)
      })
      setReferralReport(referralResult)
      if (referralResult.report.missingHeaders.length) {
        setErrors([
          'Missing required columns: ' + referralResult.report.missingHeaders.join(', '),
          ...referralResult.errors,
        ])
        setIsBuilding(false)
        return
      }

      setStatus('Parsing Customers CSV…')
      const csvResult = await parseCustomersCsv(customersFile, (progress) => {
        setCsvProgress(progress)
      })
      setCsvReport(csvResult)
      if (csvResult.report.missingHeaders.length) {
        setErrors([
          'Missing required columns: ' + csvResult.report.missingHeaders.join(', '),
          ...csvResult.errors,
        ])
        setIsBuilding(false)
        return
      }

      const index = createAnalyticsIndex({ keepFullTx, maxStoredTxs: 500 })
      index.metadata = {
        customersFile: customersMeta,
        txFile: txMeta,
        referralCodesFile: referralCodesMeta,
        generatedAt: Date.now(),
      }
      referralResult.codes.forEach((meta) => addReferralCodeMeta(index, meta))
      csvResult.customers.forEach((customer) => addCustomer(index, customer))

      setStatus('Streaming NDJSON transactions…')
      const ndjsonResult = await parseTransactionsNdjson(
        txFile,
        (tx) => addRevenueTransaction(index, tx),
        (progress) => {
          setNdjsonProgress({ lines: progress.lines, bytes: progress.bytes, revenue: progress.revenueTxCount })
          index.totals.txLines = progress.lines
        },
      )

      index.totals.txLines = ndjsonResult.lines
      setErrors((prev) => [...prev, ...referralResult.errors, ...csvResult.errors, ...ndjsonResult.errors])

      const snapshot = serializeIndex(index)
      await saveSnapshot(cacheKey, snapshot)

      setStatus('Index ready!')
      setIndex(index)
      navigate('/home')
    } catch (error) {
      setErrors((prev) => [...prev, 'Failed to build index.'])
    } finally {
      setIsBuilding(false)
    }
  }

  const csvProgressValue = customersFile
    ? Math.min(100, (csvProgress.bytes / customersFile.size) * 100)
    : 0
  const referralProgressValue = referralCodesFile
    ? Math.min(100, (referralProgress.bytes / referralCodesFile.size) * 100)
    : 0
  const ndjsonProgressValue = txFile ? Math.min(100, (ndjsonProgress.bytes / txFile.size) * 100) : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import data files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <FileDropzone
              label="Clientes.csv"
              description="Drag & drop the Customers CSV."
              accept=".csv"
              file={customersFile}
              onFile={setCustomersFile}
              disabled={isBuilding}
            />
            <FileDropzone
              label="txs-start-to-end.ndjson"
              description="Drag & drop the NDJSON transactions."
              accept=".ndjson,.json"
              file={txFile}
              onFile={setTxFile}
              disabled={isBuilding}
            />
            <FileDropzone
              label="Códigos com seus respectivos usos.csv"
              description="Drag & drop the referral codes CSV."
              accept=".csv"
              file={referralCodesFile}
              onFile={setReferralCodesFile}
              disabled={isBuilding}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4">
            <div>
              <p className="text-sm font-medium">Keep full tx list</p>
              <p className="text-xs text-muted-foreground">
                Store every revenue transaction for drilldown (memory heavy).
              </p>
            </div>
            <Switch checked={keepFullTx} onCheckedChange={(value) => setKeepFullTx(Boolean(value))} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={buildDashboard} disabled={!customersFile || !txFile || !referralCodesFile || isBuilding}>
              {isBuilding ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building dashboard
                </span>
              ) : (
                'Build dashboard'
              )}
            </Button>
            <Button variant="outline" onClick={reset} disabled={isBuilding}>
              Reset
            </Button>
            {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parsing progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Customers CSV parsed rows</span>
              <span>{formatNumber(csvProgress.rows)} rows</span>
            </div>
            <Progress value={csvProgressValue} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Referral codes CSV parsed rows</span>
              <span>{formatNumber(referralProgress.rows)} rows</span>
            </div>
            <Progress value={referralProgressValue} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>NDJSON parsed lines</span>
              <span>{formatNumber(ndjsonProgress.lines)} lines</span>
            </div>
            <Progress value={ndjsonProgressValue} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schema validation report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Customers CSV</p>
            {csvReport ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Columns detected: {csvReport.report.headers.join(', ') || 'None'}
                </p>
                {csvReport.report.missingHeaders.length ? (
                  <p className="text-xs text-destructive">
                    Missing columns: {csvReport.report.missingHeaders.join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-600">All required columns present.</p>
                )}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Sample values:</span>{' '}
                  {Object.entries(csvReport.report.sample)
                    .slice(0, 5)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' · ') || '—'}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Upload a Customers CSV to validate columns.</p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Referral codes CSV</p>
            {referralReport ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Columns detected: {referralReport.report.headers.join(', ') || 'None'}
                </p>
                {referralReport.report.missingHeaders.length ? (
                  <p className="text-xs text-destructive">
                    Missing columns: {referralReport.report.missingHeaders.join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-600">All required columns present.</p>
                )}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Sample values:</span>{' '}
                  {Object.entries(referralReport.report.sample)
                    .slice(0, 5)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' · ') || '—'}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Upload a referral codes CSV to validate columns.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {errors.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> Parsing errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
