import type { TerrainData, SourceMetadata } from './types'
import { ELEVATION_BASE } from './config'
import { coordFingerprint } from './cache'

interface ElevationResponse {
  elevation?: number[]
  error?: boolean
  reason?: string
}

function buildMetadata(
  status: SourceMetadata['status'],
  coordinateFingerprint: string,
  error: string | null = null,
): SourceMetadata {
  const now = new Date().toISOString()
  return {
    status,
    retrievedAt: now,
    lastSuccessfulAt: status === 'live' ? now : null,
    cachedAt: null,
    ageMs: status === 'live' ? 0 : null,
    cached: false,
    coordinateFingerprint,
    error,
    refreshAttempt: null,
  }
}

export async function fetchElevation(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<TerrainData> {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  })
  const res = await fetch(`${ELEVATION_BASE}?${params}`, { signal })
  if (!res.ok) throw new Error(`Elevation API returned ${res.status}`)
  const data: ElevationResponse = await res.json()
  if (data.error) throw new Error(data.reason ?? 'Elevation API error')

  const raw = data.elevation?.[0] ?? null
  const elevation = raw !== null && Number.isFinite(raw) ? raw : null
  const status: SourceMetadata['status'] = elevation !== null ? 'live' : 'unavailable'
  const metadata = buildMetadata(
    status,
    coordinateFingerprint,
    elevation !== null ? null : 'No finite elevation value returned',
  )

  return { unit: 'm', elevation, metadata }
}
