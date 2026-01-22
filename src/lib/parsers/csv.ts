import Papa from 'papaparse'
import { z } from 'zod'

import { type Customer, normalizeWallet, parseDateInput, toDateKey } from '@/lib/analytics'

export type CsvSchemaReport = {
  headers: string[]
  missingHeaders: string[]
  sample: Record<string, string>
}

export type CsvParseResult = {
  customers: Customer[]
  report: CsvSchemaReport
  errors: string[]
  rows: number
}

export type CsvProgress = {
  rows: number
  bytes: number
}

const REQUIRED_HEADERS = [
  'ID',
  'E-mail',
  'EOA',
  'Smart Wallet',
  'Cadastrado em',
  'Provedor de acesso',
  'Referral',
]

const customerRowSchema = z
  .object({
    ID: z.string().min(1),
    'Smart Wallet': z.string().min(1),
    Referral: z.string().min(1),
    'Cadastrado em': z.string().min(1),
  })
  .passthrough()

export async function parseCustomersCsv(
  file: File,
  onProgress?: (progress: CsvProgress) => void,
): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    const customers: Customer[] = []
    const errors: string[] = []
    let headers: string[] = []
    let sample: Record<string, string> = {}
    let missingHeaders: string[] = []
    let rows = 0

    const pushError = (message: string) => {
      if (errors.length < 50) errors.push(message)
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      chunk: (results) => {
        if (!headers.length) {
          headers = results.meta.fields ?? []
          missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header))
          if (results.data[0]) {
            sample = Object.fromEntries(
              Object.entries(results.data[0]).map(([key, value]) => [key, value ?? '']),
            )
          }
        }

        results.data.forEach((row) => {
          rows += 1
          const validation = customerRowSchema.safeParse(row)
          if (!validation.success) {
            pushError(`Row ${rows}: missing required fields.`)
            return
          }
          const safeRow = validation.data
          const id = safeRow.ID.trim()
          const smartWalletRaw = safeRow['Smart Wallet'].trim()
          const referral = safeRow.Referral.trim()
          const signupRaw = safeRow['Cadastrado em'].trim()
          const signupAt = parseDateInput(signupRaw)
          if (!signupAt) {
            pushError(`Row ${rows}: invalid signup date.`)
          }

          const customer: Customer = {
            id,
            email: (safeRow['E-mail'] ?? '').trim(),
            eoa: (safeRow['EOA'] ?? '').trim(),
            smartWallet: normalizeWallet(smartWalletRaw),
            signupAt,
            signupDate: signupAt ? toDateKey(signupAt) : 'Invalid',
            provider: (safeRow['Provedor de acesso'] ?? '').trim(),
            notusId: (safeRow['Notus Individual ID'] ?? '').trim() || undefined,
            referral,
          }
          customers.push(customer)
        })

        onProgress?.({ rows, bytes: results.meta.cursor ?? 0 })
      },
      complete: () => {
        resolve({
          customers,
          errors,
          rows,
          report: { headers, missingHeaders, sample },
        })
      },
      error: (error) => {
        reject(error)
      },
    })
  })
}
