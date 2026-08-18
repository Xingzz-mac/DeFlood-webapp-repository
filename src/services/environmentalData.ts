import type {
  EnvironmentalData,
  WeatherModelData,
  RiverData,
  TerrainData,
  SourceMetadata,
  AggregatorStatus,
} from './types'
import { fetchAifs, fetchIfs } from './ecmwf'
import { fetchRiverDischarge } from './glofas'
import { fetchElevation } from './elevation'
import { coordFingerprint, readCache, readStaleCache, writeCache } from './cache'

function errorWeather(label: string, model: string, fingerprint: string, error: string): WeatherModelData {
  return {
    label,
    model,
    horizons: [24, 48, 72].map(h => ({
      hours: h,
      total: null,
      expectedHours: h,
      validHours: 0,
      coverage: 0,
    })),
    series: [],
    metadata: {
      status: 'error',
      retrievedAt: new Date().toISOString(),
      lastSuccessfulAt: null,
      cached: false,
      fingerprint,
      error,
    },
  }
}

function errorRiver(fingerprint: string, error: string): RiverData {
  return {
    days: [],
    peakDischarge: null,
    peakDate: null,
    trend: 'unavailable',
    metadata: {
      status: 'error',
      retrievedAt: new Date().toISOString(),
      lastSuccessfulAt: null,
      cached: false,
      fingerprint,
      error,
    },
  }
}

function errorTerrain(fingerprint: string, error: string): TerrainData {
  return {
    elevation: null,
    metadata: {
      status: 'error',
      retrievedAt: new Date().toISOString(),
      lastSuccessfulAt: null,
      cached: false,
      fingerprint,
      error,
    },
  }
}

function computeOverall(
  aifs: WeatherModelData,
  ifs: WeatherModelData,
  river: RiverData,
  terrain: TerrainData,
): AggregatorStatus {
  const statuses: SourceMetadata['status'][] = [
    aifs.metadata.status,
    ifs.metadata.status,
    river.metadata.status,
    terrain.metadata.status,
  ]
  const liveCount = statuses.filter(s => s === 'live').length
  if (liveCount === 0) return 'error'
  if (liveCount === statuses.length) return 'live'
  return 'partial'
}

export function getCachedEnvData(latitude: number, longitude: number): EnvironmentalData | null {
  return readCache<EnvironmentalData>(latitude, longitude)
}

export function loadCachedOrStale(latitude: number, longitude: number): EnvironmentalData | null {
  return readStaleCache<EnvironmentalData>(latitude, longitude)
}

export async function fetchEnvironmentalData(
  latitude: number,
  longitude: number,
): Promise<EnvironmentalData> {
  const fingerprint = coordFingerprint(latitude, longitude)

  const [aifsResult, ifsResult, riverResult, elevResult] = await Promise.allSettled([
    fetchAifs(latitude, longitude),
    fetchIfs(latitude, longitude),
    fetchRiverDischarge(latitude, longitude),
    fetchElevation(latitude, longitude),
  ])

  let aifs: WeatherModelData
  if (aifsResult.status === 'fulfilled') aifs = aifsResult.value
  else aifs = errorWeather('ECMWF AIFS — AI Forecast', 'ecmwf_aifs025', fingerprint, aifsResult.reason instanceof Error ? aifsResult.reason.message : 'AIFS fetch failed')

  let ifs: WeatherModelData
  if (ifsResult.status === 'fulfilled') ifs = ifsResult.value
  else ifs = errorWeather('ECMWF IFS — Physics-Based Forecast', 'ecmwf_ifs025', fingerprint, ifsResult.reason instanceof Error ? ifsResult.reason.message : 'IFS fetch failed')

  let river: RiverData
  if (riverResult.status === 'fulfilled') river = riverResult.value
  else river = errorRiver(fingerprint, riverResult.reason instanceof Error ? riverResult.reason.message : 'GloFAS fetch failed')

  let terrain: TerrainData
  if (elevResult.status === 'fulfilled') terrain = elevResult.value
  else terrain = errorTerrain(fingerprint, elevResult.reason instanceof Error ? elevResult.reason.message : 'Elevation fetch failed')

  const status = computeOverall(aifs, ifs, river, terrain)

  const data: EnvironmentalData = {
    location: { latitude, longitude },
    fingerprint,
    weatherModels: { aifs, ifs },
    river,
    terrain,
    retrievedAt: new Date().toISOString(),
    status,
    stale: false,
  }

  // Only cache live or partial results — never error-only results
  if (status !== 'error') {
    writeCache(latitude, longitude, data)
  }

  return data
}
