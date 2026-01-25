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
}

export type SerializedReferral = {
  code: string
  signupsByDate: Array<[string, number]>
  kycByDate: Array<[string, number]>
  firstRevenueTxByDate: Array<[string, number]>
  daily: Array<[string, DailyAgg]>
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

  const globalDaily = ensureDaily(index.global, dateKey)
  globalDaily.feeUsd += tx.feeUsd
  globalDaily.volumeUsd += tx.volumeUsd
  globalDaily.revenueTxCount += 1

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
  index.metadata = snapshot.metadata
  index.totals = snapshot.totals
  return index
}
