import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

export const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatUsd(value: number) {
  return usdFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatNumber(value: number) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${(value * 100).toFixed(1)}%`
}

export function formatDateTime(value?: number) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function formatDate(value?: number) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export function downloadFile(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function toCsvRow(values: Array<string | number | undefined>) {
  return values
    .map((value) => {
      if (value === undefined || value === null) return ''
      const stringValue = String(value)
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    })
    .join(',')
}
