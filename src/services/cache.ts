import { ENV_CACHE_SCHEMA_VERSION, ENV_CACHE_TTL_MS } from './config'

export function coordFingerprint(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Coordinates must be finite numbers')
  }
  const normalize = (value: number) => {
    const rounded = Math.round(value * 10_000) / 10_000
    return Object.is(rounded, -0) ? 0 : rounded
  }
  return `${normalize(latitude).toFixed(4)},${normalize(longitude).toFixed(4)}`
}

export interface CacheEntry<T> {
  schemaVersion: number
  fingerprint: string
  data: T
  storedAt: string
}

export function environmentalCacheKey(fingerprint: string): string {
  return `deflood-env-data:v${ENV_CACHE_SCHEMA_VERSION}:${fingerprint}`
}

function availableStorage(storage?: Storage): Storage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function readCache<T>(
  latitude: number,
  longitude: number,
  storage?: Storage,
  nowMs = Date.now(),
): T | null {
  const fp = coordFingerprint(latitude, longitude)
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const raw = target.getItem(environmentalCacheKey(fp))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (entry.schemaVersion !== ENV_CACHE_SCHEMA_VERSION) return null
    if (entry.fingerprint !== fp) return null
    const storedAt = Date.parse(entry.storedAt)
    if (!Number.isFinite(storedAt)) return null
    const age = nowMs - storedAt
    if (age > ENV_CACHE_TTL_MS) return null
    return entry.data
  } catch {
    return null
  }
}

export function readStaleCache<T>(
  latitude: number,
  longitude: number,
  storage?: Storage,
): T | null {
  const fp = coordFingerprint(latitude, longitude)
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const raw = target.getItem(environmentalCacheKey(fp))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry<T>
    if (entry.schemaVersion !== ENV_CACHE_SCHEMA_VERSION) return null
    if (entry.fingerprint !== fp) return null
    return entry.data
  } catch {
    return null
  }
}

export function writeCache<T>(
  latitude: number,
  longitude: number,
  data: T,
  storage?: Storage,
  storedAt = new Date().toISOString(),
): void {
  const fp = coordFingerprint(latitude, longitude)
  const entry: CacheEntry<T> = {
    schemaVersion: ENV_CACHE_SCHEMA_VERSION,
    fingerprint: fp,
    data,
    storedAt,
  }
  try {
    const target = availableStorage(storage)
    if (!target) return
    target.setItem(environmentalCacheKey(fp), JSON.stringify(entry))
  } catch {
    // ignore
  }
}
