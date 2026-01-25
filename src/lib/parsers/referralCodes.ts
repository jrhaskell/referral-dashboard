import Papa, { type ParseResult } from 'papaparse'

import type { ReferralCodeMeta } from '@/lib/analytics'
import type { CsvProgress, CsvSchemaReport } from '@/lib/parsers/csv'

export type ReferralCodesParseResult = {
  codes: ReferralCodeMeta[]
  report: CsvSchemaReport
  errors: string[]
  rows: number
}

const REQUIRED_HEADERS = [
  'Código',
  'Nota',
  'Usos',
  'Máximo de usos',
  'Ativo',
  'Válido a partir de',
  'Válido até',
  'Esgotado',
  'Criado em',
  'Criado por',
]

const COLUMN_INDEX = {
  code: 0,
  note: 1,
  uses: 2,
  maxUses: 3,
  active: 4,
  validFrom: 5,
  validUntil: 6,
  exhausted: 7,
  createdAt: 8,
  createdBy: 9,
}

const normalizeValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()

const parseOptionalNumber = (value: string) => {
  const cleaned = value.replace(/[^0-9.-]/g, '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed)
}

const parseBoolean = (value: string) => {
  const normalized = normalizeValue(value)
  if (!normalized) return false
  if (['sim', 'yes', 'true', '1'].includes(normalized)) return true
  if (['nao', 'no', 'false', '0'].includes(normalized)) return false
  return false
}

const parseOptionalDate = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const timestamp = new Date(trimmed).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

const buildSample = (headers: string[], row: string[]) =>
  Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '')]))

export async function parseReferralCodesCsv(
  file: File,
  onProgress?: (progress: CsvProgress) => void,
): Promise<ReferralCodesParseResult> {
  return new Promise((resolve, reject) => {
    const codes: ReferralCodeMeta[] = []
    const errors: string[] = []
    let headers: string[] = []
    let sample: Record<string, string> = {}
    let missingHeaders: string[] = []
    let rows = 0
    let headerCaptured = false
    let hasSample = false

    const pushError = (message: string) => {
      if (errors.length < 50) errors.push(message)
    }

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      worker: true,
      chunk: (results: ParseResult<string[]>) => {
        results.data.forEach((row) => {
          if (!headerCaptured) {
            headers = row.map((value) => String(value ?? '').trim())
            missingHeaders = headers.length < REQUIRED_HEADERS.length ? REQUIRED_HEADERS : []
            headerCaptured = true
            return
          }

          rows += 1
          if (!hasSample && headers.length) {
            sample = buildSample(headers, row)
            hasSample = true
          }

          const code = String(row[COLUMN_INDEX.code] ?? '').trim()
          if (!code) {
            pushError(`Row ${rows}: missing code.`)
            return
          }

          const uses = parseOptionalNumber(String(row[COLUMN_INDEX.uses] ?? '')) ?? 0
          const rawMaxUses = parseOptionalNumber(String(row[COLUMN_INDEX.maxUses] ?? ''))
          const maxUses = rawMaxUses && rawMaxUses > 0 ? rawMaxUses : null

          const meta: ReferralCodeMeta = {
            code,
            note: String(row[COLUMN_INDEX.note] ?? '').trim(),
            uses,
            maxUses,
            isActive: parseBoolean(String(row[COLUMN_INDEX.active] ?? '')),
            validFrom: parseOptionalDate(String(row[COLUMN_INDEX.validFrom] ?? '')),
            validUntil: parseOptionalDate(String(row[COLUMN_INDEX.validUntil] ?? '')),
            isExhausted: parseBoolean(String(row[COLUMN_INDEX.exhausted] ?? '')),
            createdAt: parseOptionalDate(String(row[COLUMN_INDEX.createdAt] ?? '')),
            createdBy: String(row[COLUMN_INDEX.createdBy] ?? '').trim() || undefined,
          }

          codes.push(meta)
        })

        onProgress?.({ rows, bytes: results.meta.cursor ?? 0 })
      },
      complete: () => {
        resolve({
          codes,
          errors,
          rows,
          report: { headers, missingHeaders, sample },
        })
      },
      error: (error: Error) => {
        reject(error)
      },
    })
  })
}
