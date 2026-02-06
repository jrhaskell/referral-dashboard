import { normalizeWallet, type ParsedRevenueTx } from '@/lib/analytics'

export type NdjsonParseResult = {
  lines: number
  revenueTxCount: number
  errors: string[]
}

export type NdjsonProgress = {
  lines: number
  bytes: number
  revenueTxCount: number
}

const EXCLUDED_TOKENS = new Set(['uxlink'])
const COMPLETED_STATUSES = new Set(['COMPLETED', 'SUCCESS'])

function pickUsd(candidates: Array<unknown>) {
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

function hasExcludedToken(data: Record<string, any>) {
  const candidates = [
    data?.sentAmount?.token?.symbol,
    data?.sentAmount?.token?.name,
    data?.sentAmount?.cryptoCurrency?.symbol,
    data?.sentAmount?.cryptoCurrency?.name,
    data?.receivedAmount?.token?.symbol,
    data?.receivedAmount?.token?.name,
    data?.receivedAmount?.cryptoCurrency?.symbol,
    data?.receivedAmount?.cryptoCurrency?.name,
    data?.sentCryptoCurrency?.symbol,
    data?.sentCryptoCurrency?.name,
    data?.receivedCryptoCurrency?.symbol,
    data?.receivedCryptoCurrency?.name,
    data?.collectedFee?.token?.symbol,
    data?.collectedFee?.token?.name,
    data?.collectedFee?.cryptoCurrency?.symbol,
    data?.collectedFee?.cryptoCurrency?.name,
  ]

  return candidates.some(
    (value) => typeof value === 'string' && EXCLUDED_TOKENS.has(value.toLowerCase()),
  )
}

function sumTokenUsd(tokens: unknown) {
  if (!Array.isArray(tokens)) return 0
  let total = 0
  tokens.forEach((token) => {
    const value = Number((token as any)?.amountIn?.usd)
    if (Number.isFinite(value) && value > 0) total += value
  })
  return total
}

function extractTokens(data: Record<string, any>, tokensVolumeUsd: number, type: unknown) {
  const tokens = data?.tokens
  if (Array.isArray(tokens) && tokens.length) {
    const list = tokens
      .map((token) => {
        const symbol =
          token?.token?.symbol ?? token?.cryptoCurrency?.symbol ?? token?.token?.name ?? token?.cryptoCurrency?.name
        const volumeUsd = Number(token?.amountIn?.usd)
        if (!symbol || !Number.isFinite(volumeUsd) || volumeUsd <= 0) return null
        return { symbol: String(symbol).trim().toUpperCase(), volumeUsd }
      })
      .filter((token): token is { symbol: string; volumeUsd: number } => Boolean(token))
    return list.length ? list : undefined
  }

  const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : ''
  const isSwap = normalizedType === 'SWAP' || normalizedType === 'CROSS_SWAP'

  const fallbackSymbol = isSwap
    ? data?.receivedAmount?.token?.symbol ??
      data?.receivedAmount?.cryptoCurrency?.symbol ??
      data?.receivedCryptoCurrency?.symbol ??
      data?.sentAmount?.token?.symbol ??
      data?.sentAmount?.cryptoCurrency?.symbol ??
      data?.sentCryptoCurrency?.symbol
    : data?.sentAmount?.token?.symbol ??
      data?.sentAmount?.cryptoCurrency?.symbol ??
      data?.receivedAmount?.token?.symbol ??
      data?.receivedAmount?.cryptoCurrency?.symbol ??
      data?.sentCryptoCurrency?.symbol ??
      data?.receivedCryptoCurrency?.symbol

  if (fallbackSymbol && tokensVolumeUsd > 0) {
    return [{ symbol: String(fallbackSymbol).trim().toUpperCase(), volumeUsd: tokensVolumeUsd }]
  }
  return undefined
}

function extractSwapFlow(data: Record<string, any>, type: unknown) {
  const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : ''
  if (normalizedType !== 'SWAP' && normalizedType !== 'CROSS_SWAP') return undefined

  const fromSymbol =
    data?.sentAmount?.token?.symbol ??
    data?.sentAmount?.cryptoCurrency?.symbol ??
    data?.sentCryptoCurrency?.symbol ??
    data?.sentAmount?.token?.name ??
    data?.sentAmount?.cryptoCurrency?.name

  const toSymbol =
    data?.receivedAmount?.token?.symbol ??
    data?.receivedAmount?.cryptoCurrency?.symbol ??
    data?.receivedCryptoCurrency?.symbol ??
    data?.receivedAmount?.token?.name ??
    data?.receivedAmount?.cryptoCurrency?.name

  if (!fromSymbol || !toSymbol) return undefined
  const volumeUsd = pickUsd([
    data?.sentAmount?.amountIn?.usd,
    data?.receivedAmount?.amountIn?.usd,
    data?.sentFiatAmount?.amountIn?.usd,
    data?.receivedFiatAmount?.amountIn?.usd,
  ])
  if (!volumeUsd) return undefined

  const from = String(fromSymbol).trim().toUpperCase()
  const to = String(toSymbol).trim().toUpperCase()
  if (!from || !to || from === to) return undefined
  return { fromSymbol: from, toSymbol: to, volumeUsd }
}

export async function parseTransactionsNdjson(
  file: File,
  onRevenueTx: (tx: ParsedRevenueTx) => void,
  onProgress?: (progress: NdjsonProgress) => void,
): Promise<NdjsonParseResult> {
  const decoder = new TextDecoder()
  const reader = file.stream().getReader()
  let buffer = ''
  let lines = 0
  let revenueTxCount = 0
  const errors: string[] = []
  let bytes = 0

  const pushError = (message: string) => {
    if (errors.length < 50) errors.push(message)
  }

  const parseLine = (line: string) => {
    lines += 1
    let data: Record<string, any>
    try {
      data = JSON.parse(line)
    } catch (error) {
      pushError(`Line ${lines}: invalid JSON.`)
      return
    }

    const type = data.type
    const status = data?.status
    if (status && !COMPLETED_STATUSES.has(String(status))) return
    if (hasExcludedToken(data)) return
    const baseVolumeUsd = pickUsd([
      data?.receivedAmount?.amountIn?.usd,
      data?.sentAmount?.amountIn?.usd,
      data?.sentFiatAmount?.amountIn?.usd,
      data?.receivedFiatAmount?.amountIn?.usd,
    ])
    const tokensVolumeUsd = sumTokenUsd(data?.tokens)
    const volumeUsd = baseVolumeUsd || tokensVolumeUsd
    if (!volumeUsd) {
      pushError(`Line ${lines}: missing volume usd.`)
      return
    }

    const feeUsd = pickUsd([data?.collectedFee?.amountIn?.usd])
    const tokens = extractTokens(data, volumeUsd, type)
    const swapFlow = extractSwapFlow(data, type)

    const wallet = data?.sentBy ?? data?.receivedBy ?? data?.wallet ?? data?.owner ?? data?.user
    if (!wallet) {
      pushError(`Line ${lines}: missing wallet.`)
      return
    }

    const createdAtRaw = data?.createdAt
    const createdAt = createdAtRaw ? new Date(createdAtRaw).getTime() : 0
    if (!createdAt) {
      pushError(`Line ${lines}: invalid createdAt.`)
      return
    }

    const hash = data?.transactionHash?.hash ?? data?.mainUserOpHash ?? undefined

    revenueTxCount += 1
    onRevenueTx({
      wallet: normalizeWallet(String(wallet)),
      createdAt,
      feeUsd,
      volumeUsd,
      category: typeof type === 'string' && type.trim() ? type.trim() : 'Unknown',
      tokens,
      swapFlow,
      hash,
    })
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      bytes += value.length
      buffer += decoder.decode(value, { stream: true })
      const split = buffer.split('\n')
      buffer = split.pop() ?? ''
      split.forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        parseLine(trimmed)
      })
      onProgress?.({ lines, bytes, revenueTxCount })
    }
  }

  buffer += decoder.decode()
  const remaining = buffer.trim()
  if (remaining) {
    parseLine(remaining)
  }

  onProgress?.({ lines, bytes: file.size, revenueTxCount })

  return { lines, revenueTxCount, errors }
}
