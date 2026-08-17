import type { TerrainData } from './types'

const ELEVATION_BASE = 'https://api.open-meteo.com/v1/elevation'

interface ElevationResponse {
  elevation?: number[]
  error?: boolean
  reason?: string
}

export async function fetchElevation(
  latitude: number,
  longitude: number,
): Promise<TerrainData> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  })
  const res = await fetch(`${ELEVATION_BASE}?${params}`)
  if (!res.ok) throw new Error(`Elevation API returned ${res.status}`)
  const data: ElevationResponse = await res.json()
  if (data.error) throw new Error(data.reason ?? 'Elevation API error')
  const elev = data.elevation?.[0] ?? null
  return { elevation: elev, status: 'ok' }
}
