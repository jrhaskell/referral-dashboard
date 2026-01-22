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
    if (type !== 'SWAP' && type !== 'CROSS_SWAP') return
    const feeRaw = data?.collectedFee?.amountIn?.usd
    const feeUsd = Number(feeRaw)
    if (!feeUsd || Number.isNaN(feeUsd) || feeUsd <= 0) return

    const receivedUsd = Number(data?.receivedAmount?.amountIn?.usd)
    const sentUsd = Number(data?.sentAmount?.amountIn?.usd)
    const volumeUsd = receivedUsd && !Number.isNaN(receivedUsd) ? receivedUsd : sentUsd
    if (!volumeUsd || Number.isNaN(volumeUsd)) {
      pushError(`Line ${lines}: missing volume usd.`)
      return
    }

    const sentBy = data?.sentBy
    if (!sentBy) {
      pushError(`Line ${lines}: missing sentBy wallet.`)
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
      wallet: normalizeWallet(String(sentBy)),
      createdAt,
      feeUsd,
      volumeUsd,
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
