export type AumWalletEntry = {
  wallet: string
  totalUsd: number
  tokens?: AumToken[]
}

export type AumToken = {
  symbol: string
  name?: string
  chain?: string
  protocolGroup?: string | null
  balanceUsd: number
}

export type AumSnapshotData = {
  snapshot: {
    timestamp?: string
    snapshotDate?: string
    totalUsd?: number
    totalWallets?: number
    walletsWithBalance?: number
    byChain?: Record<string, number>
    byCategory?: Record<string, number>
    byProtocolGroup?: Record<string, number>
  }
  wallets: AumWalletEntry[]
}

function parseNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export async function parseAumReport(file: File): Promise<AumSnapshotData> {
  const text = await file.text()
  const data = JSON.parse(text) as Record<string, any>

  const walletsRaw = Array.isArray(data.wallets) ? data.wallets : []
  const wallets: AumWalletEntry[] = walletsRaw
    .map((entry: any) => ({
      wallet: String(entry?.address ?? '').trim(),
      totalUsd: parseNumber(entry?.totalUsd),
      tokens: Array.isArray(entry?.tokens)
        ? entry.tokens
            .map((token: any) => {
              const symbol = String(token?.symbol ?? token?.name ?? '').trim()
              const balanceUsd = parseNumber(token?.balanceUsd)
              if (!symbol || balanceUsd <= 0) return null
              return {
                symbol,
                name: token?.name,
                chain: token?.chain,
                protocolGroup: token?.protocolGroup ?? null,
                balanceUsd,
              }
            })
            .filter((token: AumToken | null): token is AumToken => Boolean(token))
            .sort((a: AumToken, b: AumToken) => b.balanceUsd - a.balanceUsd)
            .slice(0, 12)
        : undefined,
    }))
    .filter((entry) => entry.wallet && entry.totalUsd > 0)

  return {
    snapshot: {
      timestamp: data.timestamp,
      snapshotDate: data.snapshotDate,
      totalUsd: parseNumber(data.totalUsd),
      totalWallets: parseNumber(data.totalWallets),
      walletsWithBalance: parseNumber(data.walletsWithBalance),
      byChain: data.byChain ?? undefined,
      byCategory: data.byCategory ?? undefined,
      byProtocolGroup: data.byProtocolGroup ?? undefined,
    },
    wallets,
  }
}
