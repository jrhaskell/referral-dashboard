import type { AnalyticsSnapshot, FileMeta } from '@/lib/analytics'

const DB_NAME = 'referral-analytics'
const STORE_NAME = 'snapshots'
const DB_VERSION = 1

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function buildCacheKey(customers: FileMeta, txs: FileMeta) {
  return `${customers.name}:${customers.size}:${customers.lastModified}__${txs.name}:${txs.size}:${txs.lastModified}`
}

export async function getSnapshot(key: string): Promise<AnalyticsSnapshot | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve((request.result as AnalyticsSnapshot) ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function saveSnapshot(key: string, snapshot: AnalyticsSnapshot) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(snapshot, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function clearSnapshots() {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
