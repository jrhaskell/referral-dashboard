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
  addOwnerUsageDaily,
  addReferralCodeMeta,
  addRevenueTransaction,
  createAnalyticsIndex,
  deserializeIndex,
  toDateKey,
  type FileMeta,
  serializeIndex,
} from '@/lib/analytics'
import { useAnalytics } from '@/lib/analytics/context'
import { type CsvParseResult, parseCustomersCsv } from '@/lib/parsers/csv'
import { parseReferralCodesCsv, type ReferralCodesParseResult } from '@/lib/parsers/referralCodes'
import { parseTransactionsNdjson } from '@/lib/parsers/ndjson'
import { buildCacheKey, getSnapshot, saveSnapshot } from '@/lib/storage/indexeddb'
import { formatNumber } from '@/lib/utils'

type DataManifest = {
  customersCsv?: string | null
  referralCodesCsv?: string | null
  ndjsonFiles?: string[] | null
}

const DATA_BASE_PATH = `${import.meta.env.BASE_URL}data/`

export function ImportPage() {
  const navigate = useNavigate()
  const { setIndex } = useAnalytics()

  const [customersFile, setCustomersFile] = React.useState<File | null>(null)
  const [txFiles, setTxFiles] = React.useState<File[]>([])
  const [referralCodesFile, setReferralCodesFile] = React.useState<File | null>(null)
  const [keepFullTx, setKeepFullTx] = React.useState(false)
  const [isBuilding, setIsBuilding] = React.useState(false)
  const [isLoadingDataFolder, setIsLoadingDataFolder] = React.useState(false)
  const [csvReport, setCsvReport] = React.useState<CsvParseResult | null>(null)
  const [referralReport, setReferralReport] = React.useState<ReferralCodesParseResult | null>(null)
  const [errors, setErrors] = React.useState<string[]>([])
  const [status, setStatus] = React.useState<string | null>(null)
  const [dataManifest, setDataManifest] = React.useState<DataManifest | null>(null)
  const [dataFolderStatus, setDataFolderStatus] = React.useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading',
  )
  const [dataFolderMessage, setDataFolderMessage] = React.useState<string | null>(null)
  const [csvProgress, setCsvProgress] = React.useState({ rows: 0, bytes: 0 })
  const [referralProgress, setReferralProgress] = React.useState({ rows: 0, bytes: 0 })
  const [ndjsonProgress, setNdjsonProgress] = React.useState({ lines: 0, bytes: 0, revenue: 0 })

  const reset = () => {
    setCustomersFile(null)
    setTxFiles([])
    setReferralCodesFile(null)
    setKeepFullTx(false)
    setCsvReport(null)
    setReferralReport(null)
    setErrors([])
    setStatus(null)
    setDataFolderMessage(null)
    setCsvProgress({ rows: 0, bytes: 0 })
    setReferralProgress({ rows: 0, bytes: 0 })
    setNdjsonProgress({ lines: 0, bytes: 0, revenue: 0 })
    setIndex(null)
  }

  const ndjsonTotalBytes = React.useMemo(
    () => txFiles.reduce((total, file) => total + file.size, 0),
    [txFiles],
  )

  const getFileLabel = React.useCallback((file: File) => {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    return relativePath || file.name
  }, [])

  const sortFiles = React.useCallback(
    (files: File[]) => [...files].sort((a, b) => getFileLabel(a).localeCompare(getFileLabel(b))),
    [getFileLabel],
  )

  const handleTxFiles = React.useCallback(
    (files: File[]) => {
      setTxFiles(sortFiles(files))
      setNdjsonProgress({ lines: 0, bytes: 0, revenue: 0 })
    },
    [sortFiles],
  )

  const dataManifestSummary = React.useMemo(() => {
    if (!dataManifest) return null
    const summary: string[] = []
    if (dataManifest.customersCsv) summary.push('Customers CSV')
    if (dataManifest.referralCodesCsv) summary.push('Referral codes CSV')
    if (dataManifest.ndjsonFiles?.length) {
      summary.push(`${dataManifest.ndjsonFiles.length} NDJSON file${dataManifest.ndjsonFiles.length > 1 ? 's' : ''}`)
    }
    return summary.join(' · ')
  }, [dataManifest])

  React.useEffect(() => {
    let isActive = true

    const loadManifest = async () => {
      setDataFolderStatus('loading')
      setDataFolderMessage(null)
      try {
        const response = await fetch(`${DATA_BASE_PATH}manifest.json`, { cache: 'no-store' })
        if (!response.ok) {
          if (response.status === 404) {
            if (isActive) setDataFolderStatus('empty')
            return
          }
          throw new Error('manifest-unavailable')
        }
        const manifest = (await response.json()) as DataManifest
        const normalized: DataManifest = {
          customersCsv: manifest.customersCsv?.trim() || null,
          referralCodesCsv: manifest.referralCodesCsv?.trim() || null,
          ndjsonFiles: Array.isArray(manifest.ndjsonFiles)
            ? manifest.ndjsonFiles.map((entry) => entry.trim()).filter(Boolean)
            : [],
        }
        const hasData =
          Boolean(normalized.customersCsv) ||
          Boolean(normalized.referralCodesCsv) ||
          Boolean(normalized.ndjsonFiles?.length)
        if (!hasData) {
          if (isActive) setDataFolderStatus('empty')
          return
        }
        if (isActive) {
          setDataManifest(normalized)
          setDataFolderStatus('ready')
        }
      } catch (error) {
        if (isActive) {
          setDataFolderStatus('error')
          setDataFolderMessage('Unable to read data/manifest.json.')
        }
      }
    }

    loadManifest()
    return () => {
      isActive = false
    }
  }, [])

  const fetchManifestFile = async (path: string) => {
    const trimmed = path.replace(/^\/+/, '')
    const encoded = encodeURI(trimmed)
    const response = await fetch(`${DATA_BASE_PATH}${encoded}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${trimmed}`)
    }
    const blob = await response.blob()
    const lastModifiedHeader = response.headers.get('last-modified')
    const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader).getTime() : 0
    return new File([blob], trimmed, { type: blob.type, lastModified })
  }

  const loadDataFolder = async () => {
    if (!dataManifest) return
    setIsLoadingDataFolder(true)
    setErrors([])
    setDataFolderMessage(null)
    setStatus('Loading data folder…')
    try {
      const missing: string[] = []
      const nextCustomersPath = dataManifest.customersCsv
      const nextReferralPath = dataManifest.referralCodesCsv
      const nextNdjsonPaths = dataManifest.ndjsonFiles ?? []

      if (nextCustomersPath) {
        setCustomersFile(await fetchManifestFile(nextCustomersPath))
      } else {
        missing.push('Customers CSV')
      }

      if (nextReferralPath) {
        setReferralCodesFile(await fetchManifestFile(nextReferralPath))
      } else {
        missing.push('Referral codes CSV')
      }

      if (nextNdjsonPaths.length) {
        const fetched: File[] = []
        for (const path of nextNdjsonPaths) {
          fetched.push(await fetchManifestFile(path))
        }
        handleTxFiles(fetched)
      } else {
        missing.push('NDJSON files')
      }

      if (missing.length) {
        setDataFolderMessage(`Missing ${missing.join(', ')} in the manifest.`)
      } else {
        setStatus('Data folder files loaded.')
      }
    } catch (error) {
      setDataFolderMessage('Failed to load files from the data folder.')
    } finally {
      setIsLoadingDataFolder(false)
    }
  }

  const buildDashboard = async () => {
    if (!customersFile || !txFiles.length || !referralCodesFile) return
    setIsBuilding(true)
    setErrors([])
    setStatus('Checking cache…')

    const customersMeta: FileMeta = {
      name: customersFile.name,
      size: customersFile.size,
      lastModified: customersFile.lastModified,
    }
    const txMetas: FileMeta[] = txFiles.map((file) => ({
      name: getFileLabel(file),
      size: file.size,
      lastModified: file.lastModified,
    }))
    const referralCodesMeta: FileMeta = {
      name: referralCodesFile.name,
      size: referralCodesFile.size,
      lastModified: referralCodesFile.lastModified,
    }

    const cacheKey = buildCacheKey(customersMeta, txMetas, referralCodesMeta)
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
        txFile: txMetas.length === 1 ? txMetas[0] : undefined,
        txFiles: txMetas,
        referralCodesFile: referralCodesMeta,
        generatedAt: Date.now(),
      }
      referralResult.codes.forEach((meta) => addReferralCodeMeta(index, meta))
      csvResult.customers.forEach((customer) => addCustomer(index, customer))

      const ownerWallets = new Map<string, string>()
      referralResult.codes.forEach((meta) => {
        if (!meta.createdBy) return
        const owner = index.customersById.get(meta.createdBy)
        if (!owner) return
        if (owner.smartWallet) ownerWallets.set(owner.smartWallet, meta.createdBy)
        if (owner.eoa) ownerWallets.set(owner.eoa, meta.createdBy)
      })

      setStatus('Streaming NDJSON transactions…')
      let ndjsonLines = 0
      let ndjsonRevenue = 0
      let ndjsonBytes = 0
      const ndjsonErrors: string[] = []

      for (const file of txFiles) {
        const ndjsonResult = await parseTransactionsNdjson(
          file,
          (tx) => {
            addRevenueTransaction(index, tx)
            const ownerId = ownerWallets.get(tx.wallet)
            if (ownerId) {
              const dateKey = toDateKey(tx.createdAt)
              addOwnerUsageDaily(index, ownerId, dateKey, tx.feeUsd, tx.volumeUsd)
            }
          },
          (progress) => {
            setNdjsonProgress({
              lines: ndjsonLines + progress.lines,
              bytes: ndjsonBytes + progress.bytes,
              revenue: ndjsonRevenue + progress.revenueTxCount,
            })
            index.totals.txLines = ndjsonLines + progress.lines
          },
        )

        ndjsonLines += ndjsonResult.lines
        ndjsonRevenue += ndjsonResult.revenueTxCount
        ndjsonBytes += file.size
        ndjsonErrors.push(...ndjsonResult.errors)
      }

      index.totals.txLines = ndjsonLines
      setNdjsonProgress({ lines: ndjsonLines, bytes: ndjsonBytes, revenue: ndjsonRevenue })
      setErrors((prev) => [...prev, ...referralResult.errors, ...csvResult.errors, ...ndjsonErrors])

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
  const ndjsonProgressValue =
    txFiles.length && ndjsonTotalBytes
      ? Math.min(100, (ndjsonProgress.bytes / ndjsonTotalBytes) * 100)
      : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import data files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {dataFolderStatus === 'ready' ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Data folder detected</p>
                <p className="text-xs text-muted-foreground">
                  {dataManifestSummary ?? 'Manifest loaded from public/data.'}
                </p>
                {dataFolderMessage ? (
                  <p className="text-xs text-muted-foreground">{dataFolderMessage}</p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadDataFolder}
                disabled={isBuilding || isLoadingDataFolder}
              >
                {isLoadingDataFolder ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  </span>
                ) : (
                  'Load data folder'
                )}
              </Button>
            </div>
          ) : dataFolderStatus === 'empty' ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">Data folder is empty</p>
              <p>Add files to public/data (NDJSON can live in monthly subfolders) or upload below.</p>
            </div>
          ) : dataFolderStatus === 'error' ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">Data folder unavailable</p>
              <p>{dataFolderMessage ?? 'Upload files below or fix public/data/manifest.json.'}</p>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
              Checking data folder…
            </div>
          )}
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
              label="NDJSON transactions"
              description="Drag & drop one or more monthly NDJSON files."
              accept=".ndjson,.json"
              files={txFiles}
              onFiles={handleTxFiles}
              multiple
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
            <Button
              onClick={buildDashboard}
              disabled={!customersFile || !txFiles.length || !referralCodesFile || isBuilding}
            >
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
