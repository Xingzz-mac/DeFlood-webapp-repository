import type { EnvironmentalData, WeatherModelData, RiverData, TerrainData, SourceStatus } from './types'
import { fetchEcmwf } from './ecmwf'
import { fetchRiverDischarge } from './glofas'
import { fetchElevation } from './elevation'

const CACHE_KEY = 'deflood-env-data'
const ONE_HOUR_MS = 60 * 60 * 1000

export function getCachedEnvData(): EnvironmentalData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as EnvironmentalData
    if (!parsed.lastUpdated) return null
    const age = Date.now() - new Date(parsed.lastUpdated).getTime()
    if (age > ONE_HOUR_MS) return null
    return parsed
  } catch {
    return null
  }
}

function cacheEnvData(data: EnvironmentalData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export function loadCachedOrStale(): EnvironmentalData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as EnvironmentalData
  } catch {
    return null
  }
}

function errorWeather(label: string): WeatherModelData {
  return { label, precipitation24h: null, precipitation48h: null, precipitation72h: null, status: 'error' }
}

function errorRiver(): RiverData {
  return {
    discharge: null, mean: null, median: null,
    maximum: null, p25: null, p75: null, trend: 'stable', status: 'error',
  }
}

function errorTerrain(): TerrainData {
  return { elevation: null, status: 'error' }
}

function computeOverall(
  aifs: WeatherModelData, ifs: WeatherModelData,
  river: RiverData, terrain: TerrainData,
): 'live' | 'demo' | 'partial' | 'error' {
  const statuses: SourceStatus[] = [aifs.status, ifs.status, river.status, terrain.status]
  const okCount = statuses.filter(s => s === 'ok').length
  const errorCount = statuses.filter(s => s === 'error').length
  if (errorCount === statuses.length) return 'error'
  if (okCount === statuses.length) return 'live'
  if (okCount > 0) return 'partial'
  return 'demo'
}

export async function fetchEnvironmentalData(
  latitude: number,
  longitude: number,
): Promise<EnvironmentalData> {
  const [ecmwfResult, riverResult, elevResult] = await Promise.allSettled([
    fetchEcmwf(latitude, longitude),
    fetchRiverDischarge(latitude, longitude),
    fetchElevation(latitude, longitude),
  ])

  let aifs: WeatherModelData
  let ifs: WeatherModelData
  if (ecmwfResult.status === 'fulfilled') {
    aifs = ecmwfResult.value.aifs
    ifs = ecmwfResult.value.ifs
  } else {
    aifs = errorWeather('ECMWF AIFS — AI Forecast')
    ifs = errorWeather('ECMWF IFS — Physics-Based Forecast')
  }

  let river: RiverData
  if (riverResult.status === 'fulfilled') {
    river = riverResult.value
  } else {
    river = errorRiver()
  }

  let terrain: TerrainData
  if (elevResult.status === 'fulfilled') {
    terrain = elevResult.value
  } else {
    terrain = errorTerrain()
  }

  const data: EnvironmentalData = {
    location: { latitude, longitude },
    weatherModels: { aifs, ifs },
    river,
    terrain,
    lastUpdated: new Date().toISOString(),
    status: computeOverall(aifs, ifs, river, terrain),
  }

  cacheEnvData(data)
  return data
}
