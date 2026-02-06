import { eachDayOfInterval, format } from 'date-fns'

export type FileMeta = {
  name: string
  size: number
  lastModified: number
}

export type DateRange = {
  start: string
  end: string
}

export type Customer = {
  id: string
  email: string
  eoa: string
  smartWallet: string
  signupAt: number
  signupDate: string
  provider: string
  notusId?: string
  referral: string
}

export type RevenueTxLite = {
  hash?: string
  createdAt: number
  wallet: string
  feeUsd: number
  volumeUsd: number
  referral: string
}

export type DailyAgg = {
  date: string
  feeUsd: number
  volumeUsd: number
  revenueTxCount: number
}

export type FeeCategoryAgg = {
  feeUsd: number
  revenueTxCount: number
}

export type VolumeCategoryAgg = {
  volumeUsd: number
  revenueTxCount: number
}

export type TokenVolumeAgg = {
  volumeUsd: number
  txCount: number
}

export type TokenCategoryAgg = {
  volumeUsd: number
  txCount: number
}

export type SwapFlowAgg = {
  volumeUsd: number
  txCount: number
}

export type UserAgg = {
  wallet: string
  referral: string
  customerId: string
  signupAt?: number
  signupDate?: string
  kyc: boolean
  txCount: number
  revenueTxCount: number
  feeUsd: number
  volumeUsd: number
  firstRevenueTxAt?: number
  lastRevenueTxAt?: number
  retainedWithin30d: boolean
  timeToFirstTxMs?: number
}

export type ReferralIndex = {
  code: string
  signupsByDate: Map<string, number>
  kycByDate: Map<string, number>
  firstRevenueTxByDate: Map<string, number>
  daily: Map<string, DailyAgg>
  feeByCategory: Map<string, FeeCategoryAgg>
  feeByCategoryDaily: Map<string, Map<string, FeeCategoryAgg>>
  volumeByCategory: Map<string, VolumeCategoryAgg>
  volumeByCategoryDaily: Map<string, Map<string, VolumeCategoryAgg>>
  tokenVolumeBySymbol: Map<string, TokenVolumeAgg>
  tokenVolumeBySymbolDaily: Map<string, Map<string, TokenVolumeAgg>>
  tokenCategoryBySymbolDaily: Map<string, Map<string, Map<string, TokenCategoryAgg>>>
  swapFlowByPair: Map<string, SwapFlowAgg>
  swapFlowByPairDaily: Map<string, Map<string, SwapFlowAgg>>
  users: Map<string, UserAgg>
  topRevenueTxs: RevenueTxLite[]
  feeUsdTotal: number
  volumeUsdTotal: number
  revenueTxCount: number
}

export type ReferralCodeMeta = {
  code: string
  note: string
  uses: number
  maxUses: number | null
  isActive: boolean
  validFrom?: number
  validUntil?: number
  isExhausted: boolean
  createdAt?: number
  createdBy?: string
}

export type AnalyticsOptions = {
  keepFullTx: boolean
  maxStoredTxs: number
}

export type AnalyticsIndex = {
  customersByWallet: Map<string, Customer>
  customersById: Map<string, Customer>
  usersByWallet: Map<string, UserAgg>
  referrals: Map<string, ReferralIndex>
  referralCodes: Map<string, ReferralCodeMeta>
  ownerUsageDaily: Map<string, Map<string, DailyAgg>>
  customerUsageDaily: Map<string, Map<string, DailyAgg>>
  global: ReferralIndex
  totals: {
    customers: number
    kycUsers: number
    txLines: number
    revenueTxCount: number
    unattributedTxCount: number
  }
  options: AnalyticsOptions
  metadata?: {
    customersFile?: FileMeta
    txFile?: FileMeta
    txFiles?: FileMeta[]
    referralCodesFile?: FileMeta
    generatedAt: number
  }
}

export type ReferralMetrics = {
  code: string
  signups: number
  kycUsers: number
  usersWithRevenueTx: number
  firstRevenueTxUsers: number
  feeUsd: number
  volumeUsd: number
  conversionRate: number
  feePerUser: number
  retention30d: number
  timeToFirstTxMedianDays: number
  kycRate: number
}

export type AnalyticsSnapshot = {
  metadata?: AnalyticsIndex['metadata']
  options: AnalyticsOptions
  totals: AnalyticsIndex['totals']
  customers: Customer[]
  global: SerializedReferral
  referrals: SerializedReferral[]
  referralCodes?: ReferralCodeMeta[]
  ownerUsageDaily?: Array<{
    ownerId: string
    daily: Array<[string, DailyAgg]>
  }>
  customerUsageDaily?: Array<{
    customerId: string
    daily: Array<[string, DailyAgg]>
  }>
}

export type SerializedReferral = {
  code: string
  signupsByDate: Array<[string, number]>
  kycByDate: Array<[string, number]>
  firstRevenueTxByDate: Array<[string, number]>
  daily: Array<[string, DailyAgg]>
  feeByCategory: Array<[string, FeeCategoryAgg]>
  feeByCategoryDaily: Array<{ category: string; daily: Array<[string, FeeCategoryAgg]> }>
  volumeByCategory: Array<[string, VolumeCategoryAgg]>
  volumeByCategoryDaily: Array<{ category: string; daily: Array<[string, VolumeCategoryAgg]> }>
  tokenVolumeBySymbol: Array<[string, TokenVolumeAgg]>
  tokenVolumeBySymbolDaily: Array<{ symbol: string; daily: Array<[string, TokenVolumeAgg]> }>
  tokenCategoryBySymbolDaily: Array<{
    symbol: string
    daily: Array<{ date: string; categories: Array<[string, TokenCategoryAgg]> }>
  }>
  swapFlowByPair: Array<[string, SwapFlowAgg]>
  swapFlowByPairDaily: Array<{ pair: string; daily: Array<[string, SwapFlowAgg]> }>
  users: UserAgg[]
  topRevenueTxs: RevenueTxLite[]
  feeUsdTotal: number
  volumeUsdTotal: number
  revenueTxCount: number
}

const DAY_MS = 1000 * 60 * 60 * 24

export function toDateKey(timestamp: number) {
  if (!Number.isFinite(timestamp)) return 'Invalid'
  return format(new Date(timestamp), 'yyyy-MM-dd')
}

export function parseDateInput(value: string) {
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function normalizeWallet(value: string) {
  return value.trim().toLowerCase()
}

function createReferralIndex(code: string): ReferralIndex {
  return {
    code,
    signupsByDate: new Map(),
    kycByDate: new Map(),
    firstRevenueTxByDate: new Map(),
    daily: new Map(),
    feeByCategory: new Map(),
    feeByCategoryDaily: new Map(),
    volumeByCategory: new Map(),
    volumeByCategoryDaily: new Map(),
    tokenVolumeBySymbol: new Map(),
    tokenVolumeBySymbolDaily: new Map(),
    tokenCategoryBySymbolDaily: new Map(),
    swapFlowByPair: new Map(),
    swapFlowByPairDaily: new Map(),
    users: new Map(),
    topRevenueTxs: [],
    feeUsdTotal: 0,
    volumeUsdTotal: 0,
    revenueTxCount: 0,
  }
}

export function createAnalyticsIndex(options: AnalyticsOptions): AnalyticsIndex {
  return {
    customersByWallet: new Map(),
    customersById: new Map(),
    usersByWallet: new Map(),
    referrals: new Map(),
    referralCodes: new Map(),
    ownerUsageDaily: new Map(),
    customerUsageDaily: new Map(),
    global: createReferralIndex('all'),
    totals: {
      customers: 0,
      kycUsers: 0,
      txLines: 0,
      revenueTxCount: 0,
      unattributedTxCount: 0,
    },
    options,
  }
}

function getReferral(index: AnalyticsIndex, code: string) {
  const trimmed = code.trim() || 'Unassigned'
  const existing = index.referrals.get(trimmed)
  if (existing) return existing
  const created = createReferralIndex(trimmed)
  index.referrals.set(trimmed, created)
  return created
}

function incrementMap(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function ensureDaily(referral: ReferralIndex, date: string) {
  const existing = referral.daily.get(date)
  if (existing) return existing
  const created = { date, feeUsd: 0, volumeUsd: 0, revenueTxCount: 0 }
  referral.daily.set(date, created)
  return created
}

function ensureFeeCategory(referral: ReferralIndex, category: string) {
  const existing = referral.feeByCategory.get(category)
  if (existing) return existing
  const created = { feeUsd: 0, revenueTxCount: 0 }
  referral.feeByCategory.set(category, created)
  return created
}

function ensureFeeCategoryDaily(referral: ReferralIndex, category: string, date: string) {
  const categoryMap = referral.feeByCategoryDaily.get(category) ?? new Map<string, FeeCategoryAgg>()
  const existing = categoryMap.get(date)
  if (existing) return existing
  const created = { feeUsd: 0, revenueTxCount: 0 }
  categoryMap.set(date, created)
  referral.feeByCategoryDaily.set(category, categoryMap)
  return created
}

function ensureVolumeCategory(referral: ReferralIndex, category: string) {
  const existing = referral.volumeByCategory.get(category)
  if (existing) return existing
  const created = { volumeUsd: 0, revenueTxCount: 0 }
  referral.volumeByCategory.set(category, created)
  return created
}

function ensureVolumeCategoryDaily(referral: ReferralIndex, category: string, date: string) {
  const categoryMap = referral.volumeByCategoryDaily.get(category) ??
    new Map<string, VolumeCategoryAgg>()
  const existing = categoryMap.get(date)
  if (existing) return existing
  const created = { volumeUsd: 0, revenueTxCount: 0 }
  categoryMap.set(date, created)
  referral.volumeByCategoryDaily.set(category, categoryMap)
  return created
}

function ensureTokenVolume(referral: ReferralIndex, symbol: string) {
  const existing = referral.tokenVolumeBySymbol.get(symbol)
  if (existing) return existing
  const created = { volumeUsd: 0, txCount: 0 }
  referral.tokenVolumeBySymbol.set(symbol, created)
  return created
}

function ensureTokenVolumeDaily(referral: ReferralIndex, symbol: string, date: string) {
  const tokenMap = referral.tokenVolumeBySymbolDaily.get(symbol) ??
    new Map<string, TokenVolumeAgg>()
  const existing = tokenMap.get(date)
  if (existing) return existing
  const created = { volumeUsd: 0, txCount: 0 }
  tokenMap.set(date, created)
  referral.tokenVolumeBySymbolDaily.set(symbol, tokenMap)
  return created
}

function ensureTokenCategoryDaily(
  referral: ReferralIndex,
  symbol: string,
  date: string,
  category: string,
) {
  const tokenMap = referral.tokenCategoryBySymbolDaily.get(symbol) ??
    new Map<string, Map<string, TokenCategoryAgg>>()
  const dateMap = tokenMap.get(date) ?? new Map<string, TokenCategoryAgg>()
  const existing = dateMap.get(category)
  if (existing) return existing
  const created = { volumeUsd: 0, txCount: 0 }
  dateMap.set(category, created)
  tokenMap.set(date, dateMap)
  referral.tokenCategoryBySymbolDaily.set(symbol, tokenMap)
  return created
}

function ensureSwapFlow(referral: ReferralIndex, pair: string) {
  const existing = referral.swapFlowByPair.get(pair)
  if (existing) return existing
  const created = { volumeUsd: 0, txCount: 0 }
  referral.swapFlowByPair.set(pair, created)
  return created
}

function ensureSwapFlowDaily(referral: ReferralIndex, pair: string, date: string) {
  const pairMap = referral.swapFlowByPairDaily.get(pair) ?? new Map<string, SwapFlowAgg>()
  const existing = pairMap.get(date)
  if (existing) return existing
  const created = { volumeUsd: 0, txCount: 0 }
  pairMap.set(date, created)
  referral.swapFlowByPairDaily.set(pair, pairMap)
  return created
}

function ensureCustomerDaily(index: AnalyticsIndex, customerId: string, date: string) {
  const map = index.customerUsageDaily.get(customerId) ?? new Map<string, DailyAgg>()
  const existing = map.get(date)
  if (existing) return existing
  const created = { date, feeUsd: 0, volumeUsd: 0, revenueTxCount: 0 }
  map.set(date, created)
  index.customerUsageDaily.set(customerId, map)
  return created
}

function maybeStoreTx(referral: ReferralIndex, tx: RevenueTxLite, options: AnalyticsOptions) {
  referral.topRevenueTxs.push(tx)
  if (options.keepFullTx) return
  if (referral.topRevenueTxs.length > options.maxStoredTxs) {
    referral.topRevenueTxs.sort((a, b) => b.createdAt - a.createdAt)
    referral.topRevenueTxs = referral.topRevenueTxs.slice(0, options.maxStoredTxs)
  }
}

export function addCustomer(index: AnalyticsIndex, customer: Customer) {
  const referral = getReferral(index, customer.referral)
  index.customersByWallet.set(customer.smartWallet, customer)
  index.customersById.set(customer.id, customer)
  const userAgg: UserAgg = {
    wallet: customer.smartWallet,
    referral: customer.referral,
    customerId: customer.id,
    signupAt: customer.signupAt,
    signupDate: customer.signupDate,
    kyc: Boolean(customer.notusId),
    txCount: 0,
    revenueTxCount: 0,
    feeUsd: 0,
    volumeUsd: 0,
    retainedWithin30d: false,
  }
  referral.users.set(customer.smartWallet, userAgg)
  index.global.users.set(customer.smartWallet, userAgg)
  index.usersByWallet.set(customer.smartWallet, userAgg)

  if (customer.notusId) {
    index.totals.kycUsers += 1
  }
  if (customer.signupDate !== 'Invalid') {
    incrementMap(referral.signupsByDate, customer.signupDate)
    incrementMap(index.global.signupsByDate, customer.signupDate)
    if (customer.notusId) {
      incrementMap(referral.kycByDate, customer.signupDate)
      incrementMap(index.global.kycByDate, customer.signupDate)
    }
  }
  index.totals.customers += 1
}

export function addReferralCodeMeta(index: AnalyticsIndex, meta: ReferralCodeMeta) {
  const code = meta.code.trim()
  if (!code) return
  index.referralCodes.set(code, { ...meta, code })
}

export function addOwnerUsageDaily(
  index: AnalyticsIndex,
  ownerId: string,
  dateKey: string,
  feeUsd: number,
  volumeUsd: number,
) {
  if (!ownerId) return
  const dailyMap = index.ownerUsageDaily.get(ownerId) ?? new Map<string, DailyAgg>()
  const existing = dailyMap.get(dateKey)
  if (existing) {
    existing.feeUsd += feeUsd
    existing.volumeUsd += volumeUsd
    existing.revenueTxCount += 1
  } else {
    dailyMap.set(dateKey, {
      date: dateKey,
      feeUsd,
      volumeUsd,
      revenueTxCount: 1,
    })
  }
  index.ownerUsageDaily.set(ownerId, dailyMap)
}

export type ParsedRevenueTx = {
  wallet: string
  createdAt: number
  feeUsd: number
  volumeUsd: number
  category: string
  tokens?: Array<{ symbol: string; volumeUsd: number }>
  swapFlow?: { fromSymbol: string; toSymbol: string; volumeUsd: number }
  hash?: string
}

export function addRevenueTransaction(index: AnalyticsIndex, tx: ParsedRevenueTx) {
  index.totals.revenueTxCount += 1
  const customer = index.customersByWallet.get(tx.wallet)
  if (!customer) {
    index.totals.unattributedTxCount += 1
    return
  }
  const referral = getReferral(index, customer.referral)
  const dateKey = toDateKey(tx.createdAt)
  const category = tx.category || 'Unknown'

  const userAgg = referral.users.get(tx.wallet) ?? index.usersByWallet.get(tx.wallet)
  if (!userAgg) return

  userAgg.txCount += 1
  userAgg.revenueTxCount += 1
  userAgg.feeUsd += tx.feeUsd
  userAgg.volumeUsd += tx.volumeUsd
  userAgg.lastRevenueTxAt = tx.createdAt
  if (!userAgg.firstRevenueTxAt) {
    userAgg.firstRevenueTxAt = tx.createdAt
    userAgg.timeToFirstTxMs = userAgg.signupAt ? tx.createdAt - userAgg.signupAt : undefined
    incrementMap(referral.firstRevenueTxByDate, dateKey)
    incrementMap(index.global.firstRevenueTxByDate, dateKey)
  } else if (!userAgg.retainedWithin30d) {
    const diff = tx.createdAt - userAgg.firstRevenueTxAt
    if (diff <= 30 * DAY_MS) {
      userAgg.retainedWithin30d = true
    }
  }

  const daily = ensureDaily(referral, dateKey)
  daily.feeUsd += tx.feeUsd
  daily.volumeUsd += tx.volumeUsd
  daily.revenueTxCount += 1

  const categoryAgg = ensureFeeCategory(referral, category)
  categoryAgg.feeUsd += tx.feeUsd
  categoryAgg.revenueTxCount += 1

  const categoryDaily = ensureFeeCategoryDaily(referral, category, dateKey)
  categoryDaily.feeUsd += tx.feeUsd
  categoryDaily.revenueTxCount += 1

  const volumeCategoryAgg = ensureVolumeCategory(referral, category)
  volumeCategoryAgg.volumeUsd += tx.volumeUsd
  volumeCategoryAgg.revenueTxCount += 1

  const volumeCategoryDaily = ensureVolumeCategoryDaily(referral, category, dateKey)
  volumeCategoryDaily.volumeUsd += tx.volumeUsd
  volumeCategoryDaily.revenueTxCount += 1

  const globalDaily = ensureDaily(index.global, dateKey)
  globalDaily.feeUsd += tx.feeUsd
  globalDaily.volumeUsd += tx.volumeUsd
  globalDaily.revenueTxCount += 1

  const globalCategoryAgg = ensureFeeCategory(index.global, category)
  globalCategoryAgg.feeUsd += tx.feeUsd
  globalCategoryAgg.revenueTxCount += 1

  const globalCategoryDaily = ensureFeeCategoryDaily(index.global, category, dateKey)
  globalCategoryDaily.feeUsd += tx.feeUsd
  globalCategoryDaily.revenueTxCount += 1

  const globalVolumeCategoryAgg = ensureVolumeCategory(index.global, category)
  globalVolumeCategoryAgg.volumeUsd += tx.volumeUsd
  globalVolumeCategoryAgg.revenueTxCount += 1

  const globalVolumeCategoryDaily = ensureVolumeCategoryDaily(index.global, category, dateKey)
  globalVolumeCategoryDaily.volumeUsd += tx.volumeUsd
  globalVolumeCategoryDaily.revenueTxCount += 1

  if (tx.tokens?.length) {
    tx.tokens.forEach((token) => {
      if (!token.symbol || !token.volumeUsd) return
      const tokenAgg = ensureTokenVolume(referral, token.symbol)
      tokenAgg.volumeUsd += token.volumeUsd
      tokenAgg.txCount += 1
      const tokenDaily = ensureTokenVolumeDaily(referral, token.symbol, dateKey)
      tokenDaily.volumeUsd += token.volumeUsd
      tokenDaily.txCount += 1

      const tokenCategoryDaily = ensureTokenCategoryDaily(referral, token.symbol, dateKey, category)
      tokenCategoryDaily.volumeUsd += token.volumeUsd
      tokenCategoryDaily.txCount += 1

      const globalTokenAgg = ensureTokenVolume(index.global, token.symbol)
      globalTokenAgg.volumeUsd += token.volumeUsd
      globalTokenAgg.txCount += 1
      const globalTokenDaily = ensureTokenVolumeDaily(index.global, token.symbol, dateKey)
      globalTokenDaily.volumeUsd += token.volumeUsd
      globalTokenDaily.txCount += 1

      const globalTokenCategoryDaily = ensureTokenCategoryDaily(index.global, token.symbol, dateKey, category)
      globalTokenCategoryDaily.volumeUsd += token.volumeUsd
      globalTokenCategoryDaily.txCount += 1
    })
  }

  if (tx.swapFlow?.fromSymbol && tx.swapFlow?.toSymbol && tx.swapFlow.volumeUsd > 0) {
    const pairKey = `${tx.swapFlow.fromSymbol}→${tx.swapFlow.toSymbol}`
    const pairAgg = ensureSwapFlow(referral, pairKey)
    pairAgg.volumeUsd += tx.swapFlow.volumeUsd
    pairAgg.txCount += 1
    const pairDaily = ensureSwapFlowDaily(referral, pairKey, dateKey)
    pairDaily.volumeUsd += tx.swapFlow.volumeUsd
    pairDaily.txCount += 1

    const globalPairAgg = ensureSwapFlow(index.global, pairKey)
    globalPairAgg.volumeUsd += tx.swapFlow.volumeUsd
    globalPairAgg.txCount += 1
    const globalPairDaily = ensureSwapFlowDaily(index.global, pairKey, dateKey)
    globalPairDaily.volumeUsd += tx.swapFlow.volumeUsd
    globalPairDaily.txCount += 1
  }

  const customerDaily = ensureCustomerDaily(index, customer.id, dateKey)
  customerDaily.feeUsd += tx.feeUsd
  customerDaily.volumeUsd += tx.volumeUsd
  customerDaily.revenueTxCount += 1

  referral.feeUsdTotal += tx.feeUsd
  referral.volumeUsdTotal += tx.volumeUsd
  referral.revenueTxCount += 1

  index.global.feeUsdTotal += tx.feeUsd
  index.global.volumeUsdTotal += tx.volumeUsd
  index.global.revenueTxCount += 1

  const txLite: RevenueTxLite = {
    hash: tx.hash,
    createdAt: tx.createdAt,
    wallet: tx.wallet,
    feeUsd: tx.feeUsd,
    volumeUsd: tx.volumeUsd,
    referral: customer.referral,
  }
  maybeStoreTx(referral, txLite, index.options)
}

export function getRangeBounds(index: AnalyticsIndex): DateRange | null {
  const dates = new Set<string>()
  index.global.daily.forEach((_, date) => dates.add(date))
  index.global.signupsByDate.forEach((_, date) => dates.add(date))
  const sorted = Array.from(dates).sort()
  if (!sorted.length) return null
  return { start: sorted[0], end: sorted[sorted.length - 1] }
}

function isDateInRange(date: string, range: DateRange) {
  return date >= range.start && date <= range.end
}

function sumMapByRange(map: Map<string, number>, range: DateRange) {
  let total = 0
  map.forEach((value, date) => {
    if (isDateInRange(date, range)) total += value
  })
  return total
}

function sumDailyByRange(map: Map<string, DailyAgg>, range: DateRange) {
  let feeUsd = 0
  let volumeUsd = 0
  let revenueTxCount = 0
  map.forEach((value, date) => {
    if (!isDateInRange(date, range)) return
    feeUsd += value.feeUsd
    volumeUsd += value.volumeUsd
    revenueTxCount += value.revenueTxCount
  })
  return { feeUsd, volumeUsd, revenueTxCount }
}

export function getReferralMetrics(index: AnalyticsIndex, code: string, range: DateRange): ReferralMetrics {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const signups = sumMapByRange(referral.signupsByDate, range)
  const kycUsers = sumMapByRange(referral.kycByDate, range)
  const firstRevenueTxUsers = sumMapByRange(referral.firstRevenueTxByDate, range)
  const dailyTotals = sumDailyByRange(referral.daily, range)

  let usersWithRevenueTx = 0
  let retainedUsers = 0
  const timeToFirstValues: number[] = []
  const rangeStartMs = new Date(range.start).getTime()
  const rangeEndMs = new Date(range.end).getTime() + DAY_MS - 1

  referral.users.forEach((user) => {
    if (!user.firstRevenueTxAt || !user.lastRevenueTxAt) return
    if (user.firstRevenueTxAt > rangeEndMs) return
    if (user.lastRevenueTxAt < rangeStartMs) return
    usersWithRevenueTx += 1
    const firstDate = toDateKey(user.firstRevenueTxAt)
    if (isDateInRange(firstDate, range)) {
      if (user.retainedWithin30d) retainedUsers += 1
      if (user.timeToFirstTxMs !== undefined) timeToFirstValues.push(user.timeToFirstTxMs / DAY_MS)
    }
  })

  timeToFirstValues.sort((a, b) => a - b)
  const medianIndex = Math.floor(timeToFirstValues.length / 2)
  const timeToFirstTxMedianDays = timeToFirstValues.length
    ? timeToFirstValues.length % 2
      ? timeToFirstValues[medianIndex]
      : (timeToFirstValues[medianIndex - 1] + timeToFirstValues[medianIndex]) / 2
    : 0

  const conversionRate = signups ? usersWithRevenueTx / signups : 0
  const feePerUser = usersWithRevenueTx ? dailyTotals.feeUsd / usersWithRevenueTx : 0
  const retention30d = usersWithRevenueTx ? retainedUsers / usersWithRevenueTx : 0
  const kycRate = signups ? kycUsers / signups : 0

  return {
    code: referral.code,
    signups,
    kycUsers,
    usersWithRevenueTx,
    firstRevenueTxUsers,
    feeUsd: dailyTotals.feeUsd,
    volumeUsd: dailyTotals.volumeUsd,
    conversionRate,
    feePerUser,
    retention30d,
    timeToFirstTxMedianDays,
    kycRate,
  }
}

export function getDailySeries(index: AnalyticsIndex, code: string, range: DateRange) {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const start = new Date(range.start)
  const end = new Date(range.end)
  const series = eachDayOfInterval({ start, end }).map((day) => {
    const dateKey = format(day, 'yyyy-MM-dd')
    const daily = referral.daily.get(dateKey)
    return {
      date: dateKey,
      feeUsd: daily?.feeUsd ?? 0,
      volumeUsd: daily?.volumeUsd ?? 0,
      revenueTxCount: daily?.revenueTxCount ?? 0,
      signups: referral.signupsByDate.get(dateKey) ?? 0,
      firstRevenueTxUsers: referral.firstRevenueTxByDate.get(dateKey) ?? 0,
    }
  })
  return series
}

export type FeeCategoryBreakdown = {
  category: string
  feeUsd: number
  revenueTxCount: number
}

export function getFeeCategoryBreakdown(index: AnalyticsIndex, code: string, range: DateRange) {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const totals = new Map<string, FeeCategoryAgg>()
  referral.feeByCategoryDaily.forEach((dailyMap, category) => {
    let feeUsd = 0
    let revenueTxCount = 0
    dailyMap.forEach((value, date) => {
      if (!isDateInRange(date, range)) return
      feeUsd += value.feeUsd
      revenueTxCount += value.revenueTxCount
    })
    if (feeUsd > 0) {
      totals.set(category, { feeUsd, revenueTxCount })
    }
  })
  return Array.from(totals.entries())
    .map(([category, value]) => ({ category, feeUsd: value.feeUsd, revenueTxCount: value.revenueTxCount }))
    .sort((a, b) => b.feeUsd - a.feeUsd)
}

const VOLUME_CATEGORY_ORDER = [
  'Swap',
  'Crypto Deposits',
  'Crypto Withdraw',
  'Liquidity Pool',
  'On Ramp Transfers',
  'Off Ramp',
]

function normalizeVolumeCategory(category: string) {
  const normalized = category.trim().toUpperCase()
  if (normalized === 'SWAP' || normalized === 'CROSS_SWAP') return 'Swap'
  if (normalized === 'CRYPTO_DEPOSIT') return 'Crypto Deposits'
  if (normalized === 'CRYPTO_WITHDRAW') return 'Crypto Withdraw'
  if (normalized.startsWith('LIQUIDITY_POOL')) return 'Liquidity Pool'
  if (normalized === 'ON_RAMP') return 'On Ramp Transfers'
  if (normalized === 'OFF_RAMP') return 'Off Ramp'
  return ''
}

export type VolumeCategoryBreakdown = {
  category: string
  volumeUsd: number
  revenueTxCount: number
}

export type VolumeCategoryDailySeries = {
  data: Array<Record<string, number | string>>
  keys: string[]
}

export type TokenVolumeBreakdown = {
  symbol: string
  volumeUsd: number
  txCount: number
}

export type TokenTransactionSummary = {
  symbol: string
  txCount: number
  volumeUsd: number
  categories: Array<{ category: string; txCount: number; volumeUsd: number }>
}

export type SwapFlowLink = {
  source: string
  target: string
  volumeUsd: number
  txCount: number
}

export type SwapSankeyData = {
  nodes: Array<{ name: string }>
  links: Array<{ source: number; target: number; value: number; txCount: number }>
}

export function getVolumeCategoryBreakdown(index: AnalyticsIndex, code: string, range: DateRange) {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const totals = new Map<string, VolumeCategoryAgg>()
  referral.volumeByCategoryDaily.forEach((dailyMap, category) => {
    let volumeUsd = 0
    let revenueTxCount = 0
    dailyMap.forEach((value, date) => {
      if (!isDateInRange(date, range)) return
      volumeUsd += value.volumeUsd
      revenueTxCount += value.revenueTxCount
    })
    if (volumeUsd > 0) {
      totals.set(category, { volumeUsd, revenueTxCount })
    }
  })

  const grouped = new Map<string, VolumeCategoryAgg>()
  totals.forEach((value, category) => {
    const label = normalizeVolumeCategory(category)
    if (!label) return
    const existing = grouped.get(label) ?? { volumeUsd: 0, revenueTxCount: 0 }
    existing.volumeUsd += value.volumeUsd
    existing.revenueTxCount += value.revenueTxCount
    grouped.set(label, existing)
  })

  const ordered = VOLUME_CATEGORY_ORDER.map((label) => ({
    category: label,
    volumeUsd: grouped.get(label)?.volumeUsd ?? 0,
    revenueTxCount: grouped.get(label)?.revenueTxCount ?? 0,
  }))

  return ordered
}

export function getVolumeCategoryDailySeries(
  index: AnalyticsIndex,
  code: string,
  range: DateRange,
): VolumeCategoryDailySeries {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const days = eachDayOfInterval({ start: new Date(range.start), end: new Date(range.end) }).map((day) =>
    format(day, 'yyyy-MM-dd'),
  )

  const data = days.map((date) => ({ date, total: 0 }))
  const rowByDate = new Map(data.map((row) => [row.date as string, row]))
  const totalsByCategory = new Map<string, number>()

  referral.volumeByCategoryDaily.forEach((dailyMap, category) => {
    const label = normalizeVolumeCategory(category)
    if (!label) return
    dailyMap.forEach((value, date) => {
      if (!isDateInRange(date, range)) return
      const row = rowByDate.get(date)
      if (!row) return
      const current = Number(row[label] ?? 0)
      row[label] = current + value.volumeUsd
      row.total = Number(row.total ?? 0) + value.volumeUsd
      totalsByCategory.set(label, (totalsByCategory.get(label) ?? 0) + value.volumeUsd)
    })
  })

  const keys = [...VOLUME_CATEGORY_ORDER]

  return { data, keys }
}

export function getTokenVolumeBreakdown(index: AnalyticsIndex, code: string, range: DateRange) {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const totals = new Map<string, TokenVolumeAgg>()
  referral.tokenVolumeBySymbolDaily.forEach((dailyMap, symbol) => {
    let volumeUsd = 0
    let txCount = 0
    dailyMap.forEach((value, date) => {
      if (!isDateInRange(date, range)) return
      volumeUsd += value.volumeUsd
      txCount += value.txCount
    })
    if (volumeUsd > 0) {
      totals.set(symbol, { volumeUsd, txCount })
    }
  })

  return Array.from(totals.entries())
    .map(([symbol, value]) => ({ symbol, volumeUsd: value.volumeUsd, txCount: value.txCount }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
}

export function getTopTokenByVolume(index: AnalyticsIndex, code: string, range: DateRange) {
  const breakdown = getTokenVolumeBreakdown(index, code, range)
  return breakdown.length ? breakdown[0] : null
}

export function getTopTokenTransactions(
  index: AnalyticsIndex,
  code: string,
  range: DateRange,
  limit = 10,
): TokenTransactionSummary[] {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const totals = new Map<
    string,
    { txCount: number; volumeUsd: number; categories: Map<string, TokenCategoryAgg> }
  >()

  referral.tokenCategoryBySymbolDaily.forEach((dateMap, symbol) => {
    dateMap.forEach((categoryMap, date) => {
      if (!isDateInRange(date, range)) return
      const entry = totals.get(symbol) ?? { txCount: 0, volumeUsd: 0, categories: new Map() }
      categoryMap.forEach((value, category) => {
        entry.txCount += value.txCount
        entry.volumeUsd += value.volumeUsd
        const existing = entry.categories.get(category) ?? { txCount: 0, volumeUsd: 0 }
        existing.txCount += value.txCount
        existing.volumeUsd += value.volumeUsd
        entry.categories.set(category, existing)
      })
      totals.set(symbol, entry)
    })
  })

  const sorted = Array.from(totals.entries())
    .map(([symbol, value]) => ({
      symbol,
      txCount: value.txCount,
      volumeUsd: value.volumeUsd,
      categories: Array.from(value.categories.entries())
        .map(([category, agg]) => ({ category, txCount: agg.txCount, volumeUsd: agg.volumeUsd }))
        .sort((a, b) => b.txCount - a.txCount || b.volumeUsd - a.volumeUsd),
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || b.txCount - a.txCount)

  return sorted.slice(0, limit)
}

export function getSwapFlowLinks(index: AnalyticsIndex, code: string, range: DateRange, limit = 20) {
  const referral = code === 'all' ? index.global : getReferral(index, code)
  const totals = new Map<string, SwapFlowAgg>()
  referral.swapFlowByPairDaily.forEach((dailyMap, pair) => {
    let volumeUsd = 0
    let txCount = 0
    dailyMap.forEach((value, date) => {
      if (!isDateInRange(date, range)) return
      volumeUsd += value.volumeUsd
      txCount += value.txCount
    })
    if (volumeUsd > 0) totals.set(pair, { volumeUsd, txCount })
  })

  return Array.from(totals.entries())
    .map(([pair, value]) => {
      const [source, target] = pair.split('→')
      return { source, target, volumeUsd: value.volumeUsd, txCount: value.txCount }
    })
    .filter((entry) => entry.source && entry.target)
    .sort((a, b) => b.volumeUsd - a.volumeUsd || b.txCount - a.txCount)
    .slice(0, limit)
}

export function getSwapFlowSankeyData(
  index: AnalyticsIndex,
  code: string,
  range: DateRange,
  limit = 24,
): SwapSankeyData {
  const links = getSwapFlowLinks(index, code, range, limit)
  const nodeWeights = new Map<string, number>()
  const nodeOrder = new Set<string>()

  links.forEach((link) => {
    const source = `${link.source} (out)`
    const target = `${link.target} (in)`
    nodeWeights.set(source, (nodeWeights.get(source) ?? 0) + link.volumeUsd)
    nodeWeights.set(target, (nodeWeights.get(target) ?? 0) + link.volumeUsd)
    nodeOrder.add(source)
    nodeOrder.add(target)
  })

  const orderedNodes = Array.from(nodeOrder)
    .sort((a, b) => (nodeWeights.get(b) ?? 0) - (nodeWeights.get(a) ?? 0))
    .map((name) => ({ name }))

  const nodeIndex = new Map<string, number>()
  orderedNodes.forEach((node, index) => nodeIndex.set(node.name, index))

  const sankeyLinks = links.map((link) => {
    const source = `${link.source} (out)`
    const target = `${link.target} (in)`
    return {
      source: nodeIndex.get(source) ?? 0,
      target: nodeIndex.get(target) ?? 0,
      value: link.volumeUsd,
      txCount: link.txCount,
    }
  })

  return { nodes: orderedNodes, links: sankeyLinks }
}

export function getReferralList(index: AnalyticsIndex) {
  return Array.from(index.referrals.keys()).sort()
}

export function serializeIndex(index: AnalyticsIndex): AnalyticsSnapshot {
  return {
    metadata: index.metadata,
    options: index.options,
    totals: index.totals,
    customers: Array.from(index.customersByWallet.values()),
    global: {
      code: index.global.code,
      signupsByDate: Array.from(index.global.signupsByDate.entries()),
      kycByDate: Array.from(index.global.kycByDate.entries()),
      firstRevenueTxByDate: Array.from(index.global.firstRevenueTxByDate.entries()),
      daily: Array.from(index.global.daily.entries()),
      feeByCategory: Array.from(index.global.feeByCategory.entries()),
      feeByCategoryDaily: Array.from(index.global.feeByCategoryDaily.entries()).map(([category, daily]) => ({
        category,
        daily: Array.from(daily.entries()),
      })),
      volumeByCategory: Array.from(index.global.volumeByCategory.entries()),
      volumeByCategoryDaily: Array.from(index.global.volumeByCategoryDaily.entries()).map(
        ([category, daily]) => ({
          category,
          daily: Array.from(daily.entries()),
        }),
      ),
      tokenVolumeBySymbol: Array.from(index.global.tokenVolumeBySymbol.entries()),
      tokenVolumeBySymbolDaily: Array.from(index.global.tokenVolumeBySymbolDaily.entries()).map(
        ([symbol, daily]) => ({
          symbol,
          daily: Array.from(daily.entries()),
        }),
      ),
      tokenCategoryBySymbolDaily: Array.from(index.global.tokenCategoryBySymbolDaily.entries()).map(
        ([symbol, daily]) => ({
          symbol,
          daily: Array.from(daily.entries()).map(([date, categories]) => ({
            date,
            categories: Array.from(categories.entries()),
          })),
        }),
      ),
      swapFlowByPair: Array.from(index.global.swapFlowByPair.entries()),
      swapFlowByPairDaily: Array.from(index.global.swapFlowByPairDaily.entries()).map(([pair, daily]) => ({
        pair,
        daily: Array.from(daily.entries()),
      })),
      users: Array.from(index.global.users.values()),
      topRevenueTxs: index.global.topRevenueTxs,
      feeUsdTotal: index.global.feeUsdTotal,
      volumeUsdTotal: index.global.volumeUsdTotal,
      revenueTxCount: index.global.revenueTxCount,
    },
    referrals: Array.from(index.referrals.values()).map((referral) => ({
      code: referral.code,
      signupsByDate: Array.from(referral.signupsByDate.entries()),
      kycByDate: Array.from(referral.kycByDate.entries()),
      firstRevenueTxByDate: Array.from(referral.firstRevenueTxByDate.entries()),
      daily: Array.from(referral.daily.entries()),
      feeByCategory: Array.from(referral.feeByCategory.entries()),
      feeByCategoryDaily: Array.from(referral.feeByCategoryDaily.entries()).map(([category, daily]) => ({
        category,
        daily: Array.from(daily.entries()),
      })),
      volumeByCategory: Array.from(referral.volumeByCategory.entries()),
      volumeByCategoryDaily: Array.from(referral.volumeByCategoryDaily.entries()).map(
        ([category, daily]) => ({
          category,
          daily: Array.from(daily.entries()),
        }),
      ),
      tokenVolumeBySymbol: Array.from(referral.tokenVolumeBySymbol.entries()),
      tokenVolumeBySymbolDaily: Array.from(referral.tokenVolumeBySymbolDaily.entries()).map(
        ([symbol, daily]) => ({
          symbol,
          daily: Array.from(daily.entries()),
        }),
      ),
      tokenCategoryBySymbolDaily: Array.from(referral.tokenCategoryBySymbolDaily.entries()).map(
        ([symbol, daily]) => ({
          symbol,
          daily: Array.from(daily.entries()).map(([date, categories]) => ({
            date,
            categories: Array.from(categories.entries()),
          })),
        }),
      ),
      swapFlowByPair: Array.from(referral.swapFlowByPair.entries()),
      swapFlowByPairDaily: Array.from(referral.swapFlowByPairDaily.entries()).map(([pair, daily]) => ({
        pair,
        daily: Array.from(daily.entries()),
      })),
      users: Array.from(referral.users.values()),
      topRevenueTxs: referral.topRevenueTxs,
      feeUsdTotal: referral.feeUsdTotal,
      volumeUsdTotal: referral.volumeUsdTotal,
      revenueTxCount: referral.revenueTxCount,
    })),
    referralCodes: Array.from(index.referralCodes.values()),
    ownerUsageDaily: Array.from(index.ownerUsageDaily.entries()).map(([ownerId, daily]) => ({
      ownerId,
      daily: Array.from(daily.entries()),
    })),
    customerUsageDaily: Array.from(index.customerUsageDaily.entries()).map(([customerId, daily]) => ({
      customerId,
      daily: Array.from(daily.entries()),
    })),
  }
}

export function deserializeIndex(snapshot: AnalyticsSnapshot): AnalyticsIndex {
  const index = createAnalyticsIndex(snapshot.options)
  snapshot.customers.forEach((customer) => {
    index.customersByWallet.set(customer.smartWallet, customer)
    index.customersById.set(customer.id, customer)
  })

  const global = createReferralIndex(snapshot.global.code)
  snapshot.global.signupsByDate.forEach(([date, value]) => global.signupsByDate.set(date, value))
  snapshot.global.kycByDate.forEach(([date, value]) => global.kycByDate.set(date, value))
  snapshot.global.firstRevenueTxByDate.forEach(([date, value]) =>
    global.firstRevenueTxByDate.set(date, value),
  )
  snapshot.global.daily.forEach(([date, value]) => global.daily.set(date, value))
  snapshot.global.feeByCategory.forEach(([category, value]) => global.feeByCategory.set(category, value))
  snapshot.global.feeByCategoryDaily.forEach((entry) =>
    global.feeByCategoryDaily.set(entry.category, new Map(entry.daily)),
  )
  snapshot.global.volumeByCategory?.forEach(([category, value]) =>
    global.volumeByCategory.set(category, value),
  )
  snapshot.global.volumeByCategoryDaily?.forEach((entry) =>
    global.volumeByCategoryDaily.set(entry.category, new Map(entry.daily)),
  )
  snapshot.global.tokenVolumeBySymbol?.forEach(([symbol, value]) =>
    global.tokenVolumeBySymbol.set(symbol, value),
  )
  snapshot.global.tokenVolumeBySymbolDaily?.forEach((entry) =>
    global.tokenVolumeBySymbolDaily.set(entry.symbol, new Map(entry.daily)),
  )
  snapshot.global.tokenCategoryBySymbolDaily?.forEach((entry) => {
    const dateMap = new Map<string, Map<string, TokenCategoryAgg>>()
    entry.daily.forEach((dailyEntry) => {
      dateMap.set(dailyEntry.date, new Map(dailyEntry.categories))
    })
    global.tokenCategoryBySymbolDaily.set(entry.symbol, dateMap)
  })
  snapshot.global.swapFlowByPair?.forEach(([pair, value]) => global.swapFlowByPair.set(pair, value))
  snapshot.global.swapFlowByPairDaily?.forEach((entry) =>
    global.swapFlowByPairDaily.set(entry.pair, new Map(entry.daily)),
  )
  snapshot.global.users.forEach((user) => global.users.set(user.wallet, user))
  global.topRevenueTxs = snapshot.global.topRevenueTxs
  global.feeUsdTotal = snapshot.global.feeUsdTotal
  global.volumeUsdTotal = snapshot.global.volumeUsdTotal
  global.revenueTxCount = snapshot.global.revenueTxCount
  index.global = global

  snapshot.referrals.forEach((referral) => {
    const created = createReferralIndex(referral.code)
    referral.signupsByDate.forEach(([date, value]) => created.signupsByDate.set(date, value))
    referral.kycByDate.forEach(([date, value]) => created.kycByDate.set(date, value))
    referral.firstRevenueTxByDate.forEach(([date, value]) =>
      created.firstRevenueTxByDate.set(date, value),
    )
    referral.daily.forEach(([date, value]) => created.daily.set(date, value))
    referral.feeByCategory.forEach(([category, value]) => created.feeByCategory.set(category, value))
    referral.feeByCategoryDaily.forEach((entry) =>
      created.feeByCategoryDaily.set(entry.category, new Map(entry.daily)),
    )
    referral.volumeByCategory?.forEach(([category, value]) => created.volumeByCategory.set(category, value))
    referral.volumeByCategoryDaily?.forEach((entry) =>
      created.volumeByCategoryDaily.set(entry.category, new Map(entry.daily)),
    )
    referral.tokenVolumeBySymbol?.forEach(([symbol, value]) => created.tokenVolumeBySymbol.set(symbol, value))
    referral.tokenVolumeBySymbolDaily?.forEach((entry) =>
      created.tokenVolumeBySymbolDaily.set(entry.symbol, new Map(entry.daily)),
    )
    referral.tokenCategoryBySymbolDaily?.forEach((entry) => {
      const dateMap = new Map<string, Map<string, TokenCategoryAgg>>()
      entry.daily.forEach((dailyEntry) => {
        dateMap.set(dailyEntry.date, new Map(dailyEntry.categories))
      })
      created.tokenCategoryBySymbolDaily.set(entry.symbol, dateMap)
    })
    referral.swapFlowByPair?.forEach(([pair, value]) => created.swapFlowByPair.set(pair, value))
    referral.swapFlowByPairDaily?.forEach((entry) =>
      created.swapFlowByPairDaily.set(entry.pair, new Map(entry.daily)),
    )
    referral.users.forEach((user) => created.users.set(user.wallet, user))
    referral.users.forEach((user) => index.usersByWallet.set(user.wallet, user))
    created.topRevenueTxs = referral.topRevenueTxs
    created.feeUsdTotal = referral.feeUsdTotal
    created.volumeUsdTotal = referral.volumeUsdTotal
    created.revenueTxCount = referral.revenueTxCount
    index.referrals.set(referral.code, created)
  })

  if (snapshot.referralCodes) {
    index.referralCodes = new Map(snapshot.referralCodes.map((meta) => [meta.code, meta]))
  }
  if (snapshot.ownerUsageDaily) {
    index.ownerUsageDaily = new Map(
      snapshot.ownerUsageDaily.map((entry) => [entry.ownerId, new Map(entry.daily)]),
    )
  }
  if (snapshot.customerUsageDaily) {
    index.customerUsageDaily = new Map(
      snapshot.customerUsageDaily.map((entry) => [entry.customerId, new Map(entry.daily)]),
    )
  }
  index.metadata = snapshot.metadata
  index.totals = snapshot.totals
  return index
}
