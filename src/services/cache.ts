import { ENV_CACHE_SCHEMA_VERSION, ENV_CACHE_TTL_MS } from './config'

export function coordFingerprint(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`
}

export interface CacheEntry<T> {
  schemaVersion: number
  fingerprint: string
  data: T
  storedAt: string
}

function cacheKey(fingerprint: string): string {
  return `deflood-env-data:v${ENV_CACHE_SCHEMA_VERSION}:${fingerprint}`
}

export function readCache<T>(latitude: number, longitude: number): T | null {
  const fp = coordFingerprint(latitude, longitude)
  try {
    const raw = localStorage.getItem(cacheKey(fp))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (entry.schemaVersion !== ENV_CACHE_SCHEMA_VERSION) return null
    if (entry.fingerprint !== fp) return null
    const age = Date.now() - new Date(entry.storedAt).getTime()
    if (age > ENV_CACHE_TTL_MS) return null
    return entry.data
  } catch {
    return null
  }
}

export function readStaleCache<T>(latitude: number, longitude: number): T | null {
  const fp = coordFingerprint(latitude, longitude)
  try {
    const raw = localStorage.getItem(cacheKey(fp))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (entry.schemaVersion !== ENV_CACHE_SCHEMA_VERSION) return null
    if (entry.fingerprint !== fp) return null
    return entry.data
  } catch {
    return null
  }
}

export function writeCache<T>(latitude: number, longitude: number, data: T): void {
  const fp = coordFingerprint(latitude, longitude)
  const entry: CacheEntry<T> = {
    schemaVersion: ENV_CACHE_SCHEMA_VERSION,
    fingerprint: fp,
    data,
    storedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(cacheKey(fp), JSON.stringify(entry))
  } catch {
    // ignore
  }
}
