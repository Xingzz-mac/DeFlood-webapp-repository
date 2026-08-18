import type {
  EnvironmentalData,
  WeatherModelData,
  RiverData,
  TerrainData,
  SourceMetadata,
  AggregatorStatus,
} from './types'
import { AIFS_MODEL, IFS_MODEL } from './config'
import { fetchAifs, fetchIfs } from './ecmwf'
import { fetchRiverDischarge } from './glofas'
import { fetchElevation } from './elevation'
import { coordFingerprint, readCache, readStaleCache, writeCache } from './cache'

function errorMetadata(coordinateFingerprint: string, error: string): SourceMetadata {
  return {
    status: 'error',
    retrievedAt: new Date().toISOString(),
    lastSuccessfulAt: null,
    cached: false,
    coordinateFingerprint,
    error,
  }
}

function errorWeather(
  label: string,
  model: string,
  coordinateFingerprint: string,
  error: string,
): WeatherModelData {
  return {
    label,
    model,
    unit: 'mm',
    horizons: [24, 48, 72].map(hours => ({
      hours,
      total: null,
      expectedHours: hours,
      validHours: 0,
      coverage: 0,
      complete: false,
    })),
    series: [],
    metadata: errorMetadata(coordinateFingerprint, error),
  }
}

function errorRiver(coordinateFingerprint: string, error: string): RiverData {
  return {
    unit: 'm³/s',
    days: [],
    peakDischarge: null,
    peakDate: null,
    trend: 'unavailable',
    metadata: errorMetadata(coordinateFingerprint, error),
  }
}

function errorTerrain(coordinateFingerprint: string, error: string): TerrainData {
  return {
    unit: 'm',
    elevation: null,
    metadata: errorMetadata(coordinateFingerprint, error),
  }
}

function weatherUsable(data: WeatherModelData | undefined): data is WeatherModelData {
  return Boolean(data?.series.some(point => point.value !== null))
}

function riverUsable(data: RiverData | undefined): data is RiverData {
  return Boolean(data?.days.some(day => [
    day.discharge,
    day.mean,
    day.median,
    day.maximum,
    day.p25,
    day.p75,
  ].some(value => value !== null)))
}

function terrainUsable(data: TerrainData | undefined): data is TerrainData {
  return typeof data?.elevation === 'number' && Number.isFinite(data.elevation)
}

function cachedMetadata(
  metadata: SourceMetadata,
  coordinateFingerprint: string,
  error: string | null,
): SourceMetadata {
  return {
    ...metadata,
    status: 'cached',
    retrievedAt: new Date().toISOString(),
    cached: true,
    coordinateFingerprint,
    error,
  }
}

function asCachedEnvironmental(data: EnvironmentalData, stale: boolean): EnvironmentalData {
  const coordinateFingerprint = data.fingerprint
  const aifs = weatherUsable(data.weatherModels.aifs)
    ? {
        ...data.weatherModels.aifs,
        metadata: cachedMetadata(
          data.weatherModels.aifs.metadata,
          coordinateFingerprint,
          data.weatherModels.aifs.metadata.error,
        ),
      }
    : data.weatherModels.aifs
  const ifs = weatherUsable(data.weatherModels.ifs)
    ? {
        ...data.weatherModels.ifs,
        metadata: cachedMetadata(
          data.weatherModels.ifs.metadata,
          coordinateFingerprint,
          data.weatherModels.ifs.metadata.error,
        ),
      }
    : data.weatherModels.ifs
  const river = riverUsable(data.river)
    ? {
        ...data.river,
        metadata: cachedMetadata(data.river.metadata, coordinateFingerprint, data.river.metadata.error),
      }
    : data.river
  const terrain = terrainUsable(data.terrain)
    ? {
        ...data.terrain,
        metadata: cachedMetadata(data.terrain.metadata, coordinateFingerprint, data.terrain.metadata.error),
      }
    : data.terrain

  return {
    ...data,
    weatherModels: { aifs, ifs },
    river,
    terrain,
    status: computeOverall(aifs, ifs, river, terrain),
    stale: stale || data.stale,
  }
}

function computeOverall(
  aifs: WeatherModelData,
  ifs: WeatherModelData,
  river: RiverData,
  terrain: TerrainData,
): AggregatorStatus {
  const statuses = [
    aifs.metadata.status,
    ifs.metadata.status,
    river.metadata.status,
    terrain.metadata.status,
  ]
  if (statuses.every(status => status === 'live')) return 'live'
  if (weatherUsable(aifs) || weatherUsable(ifs) || riverUsable(river) || terrainUsable(terrain)) {
    return 'partial'
  }
  return 'error'
}

function reasonMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

function currentOrCachedWeather(
  current: WeatherModelData,
  cached: WeatherModelData | undefined,
  coordinateFingerprint: string,
): WeatherModelData {
  if (current.metadata.status !== 'error' && current.metadata.status !== 'unavailable') return current
  if (!weatherUsable(cached)) return current
  return {
    ...cached,
    metadata: cachedMetadata(cached.metadata, coordinateFingerprint, current.metadata.error),
  }
}

function currentOrCachedRiver(
  current: RiverData,
  cached: RiverData | undefined,
  coordinateFingerprint: string,
): RiverData {
  if (current.metadata.status !== 'error' && current.metadata.status !== 'unavailable') return current
  if (!riverUsable(cached)) return current
  return {
    ...cached,
    metadata: cachedMetadata(cached.metadata, coordinateFingerprint, current.metadata.error),
  }
}

function currentOrCachedTerrain(
  current: TerrainData,
  cached: TerrainData | undefined,
  coordinateFingerprint: string,
): TerrainData {
  if (current.metadata.status !== 'error' && current.metadata.status !== 'unavailable') return current
  if (!terrainUsable(cached)) return current
  return {
    ...cached,
    metadata: cachedMetadata(cached.metadata, coordinateFingerprint, current.metadata.error),
  }
}

export function getCachedEnvData(latitude: number, longitude: number): EnvironmentalData | null {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const cached = readCache<EnvironmentalData>(latitude, longitude)
  if (!cached || cached.fingerprint !== coordinateFingerprint) return null
  return asCachedEnvironmental(cached, false)
}

export function loadCachedOrStale(latitude: number, longitude: number): EnvironmentalData | null {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const cached = readStaleCache<EnvironmentalData>(latitude, longitude)
  if (!cached || cached.fingerprint !== coordinateFingerprint) return null
  return asCachedEnvironmental(cached, true)
}

export async function fetchEnvironmentalData(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EnvironmentalData> {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const cached = readStaleCache<EnvironmentalData>(latitude, longitude)
  const sameCoordinateCache = cached?.fingerprint === coordinateFingerprint ? cached : null

  const [aifsResult, ifsResult, riverResult, elevationResult] = await Promise.allSettled([
    fetchAifs(latitude, longitude, signal),
    fetchIfs(latitude, longitude, signal),
    fetchRiverDischarge(latitude, longitude, signal),
    fetchElevation(latitude, longitude, signal),
  ])

  const currentAifs = aifsResult.status === 'fulfilled'
    ? aifsResult.value
    : errorWeather(
        'ECMWF AIFS — AI Forecast',
        AIFS_MODEL,
        coordinateFingerprint,
        reasonMessage(aifsResult.reason, 'AIFS fetch failed'),
      )
  const currentIfs = ifsResult.status === 'fulfilled'
    ? ifsResult.value
    : errorWeather(
        'ECMWF IFS — Physics-Based Forecast',
        IFS_MODEL,
        coordinateFingerprint,
        reasonMessage(ifsResult.reason, 'IFS fetch failed'),
      )
  const currentRiver = riverResult.status === 'fulfilled'
    ? riverResult.value
    : errorRiver(
        coordinateFingerprint,
        reasonMessage(riverResult.reason, 'GloFAS fetch failed'),
      )
  const currentTerrain = elevationResult.status === 'fulfilled'
    ? elevationResult.value
    : errorTerrain(
        coordinateFingerprint,
        reasonMessage(elevationResult.reason, 'Elevation fetch failed'),
      )

  const aifs = currentOrCachedWeather(
    currentAifs,
    sameCoordinateCache?.weatherModels.aifs,
    coordinateFingerprint,
  )
  const ifs = currentOrCachedWeather(
    currentIfs,
    sameCoordinateCache?.weatherModels.ifs,
    coordinateFingerprint,
  )
  const river = currentOrCachedRiver(
    currentRiver,
    sameCoordinateCache?.river,
    coordinateFingerprint,
  )
  const terrain = currentOrCachedTerrain(
    currentTerrain,
    sameCoordinateCache?.terrain,
    coordinateFingerprint,
  )
  const status = computeOverall(aifs, ifs, river, terrain)
  const stale = [aifs, ifs, river, terrain].some(source => source.metadata.cached)
  const data: EnvironmentalData = {
    location: { latitude, longitude },
    fingerprint: coordinateFingerprint,
    weatherModels: { aifs, ifs },
    river,
    terrain,
    retrievedAt: new Date().toISOString(),
    status,
    stale,
  }

  const hasFreshSuccess = [currentAifs, currentIfs, currentRiver, currentTerrain]
    .some(source => source.metadata.status === 'live' || source.metadata.status === 'incomplete')
  if (hasFreshSuccess) writeCache(latitude, longitude, data)

  return data
}
