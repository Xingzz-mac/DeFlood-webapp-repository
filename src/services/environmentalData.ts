import type {
  AggregatorStatus,
  EnvironmentalData,
  RefreshAttemptMetadata,
  RiverData,
  SourceMetadata,
  TerrainData,
  WeatherModelData,
} from './types'
import {
  AIFS_MODEL,
  ELEVATION_MAX_STALE_MS,
  IFS_MODEL,
  RIVER_MAX_STALE_MS,
  WEATHER_MAX_STALE_MS,
} from './config'
import { fetchAifs, fetchIfs, isWeatherModelUsable } from './ecmwf'
import {
  buildEnsembleAvailability,
  fetchRiverDischarge,
  isPrimaryRiverUsable,
} from './glofas'
import { fetchElevation } from './elevation'
import { coordFingerprint, readStaleCache, writeCache } from './cache'

export interface SourceSelection<T> {
  data: T
  acceptedFresh: boolean
  usedCache: boolean
}

function errorMetadata(coordinateFingerprint: string, error: string): SourceMetadata {
  return {
    status: 'error',
    retrievedAt: new Date().toISOString(),
    lastSuccessfulAt: null,
    cachedAt: null,
    ageMs: null,
    cached: false,
    coordinateFingerprint,
    error,
    refreshAttempt: null,
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
  const days: RiverData['days'] = []
  return {
    unit: 'm³/s',
    days,
    primaryValidDays: 0,
    primaryUsable: false,
    peakDischarge: null,
    peakDate: null,
    trend: 'unavailable',
    ensembleAvailability: buildEnsembleAvailability(days),
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

function riverUsable(data: RiverData | undefined): boolean {
  return Boolean(data && isPrimaryRiverUsable(data.days))
}

function terrainUsable(data: TerrainData | undefined): boolean {
  return typeof data?.elevation === 'number' && Number.isFinite(data.elevation)
}

export function sourceAgeMs(metadata: SourceMetadata, nowMs = Date.now()): number | null {
  if (!metadata.lastSuccessfulAt) return null
  const successfulAt = Date.parse(metadata.lastSuccessfulAt)
  if (!Number.isFinite(successfulAt)) return null
  return Math.max(0, nowMs - successfulAt)
}

export function isSourceWithinMaxStale(
  metadata: SourceMetadata,
  maxStaleMs: number,
  nowMs = Date.now(),
): boolean {
  const age = sourceAgeMs(metadata, nowMs)
  return age !== null && age <= maxStaleMs
}

function refreshAttempt(metadata: SourceMetadata): RefreshAttemptMetadata {
  return {
    status: metadata.status,
    retrievedAt: metadata.retrievedAt,
    error: metadata.error,
  }
}

function cachedMetadata(
  metadata: SourceMetadata,
  coordinateFingerprint: string,
  nowMs: number,
  degradedAttempt: RefreshAttemptMetadata | null,
): SourceMetadata {
  return {
    ...metadata,
    status: 'cached',
    ageMs: sourceAgeMs(metadata, nowMs),
    cached: true,
    coordinateFingerprint,
    refreshAttempt: degradedAttempt ?? metadata.refreshAttempt,
  }
}

function sameCoordinate(metadata: SourceMetadata, coordinateFingerprint: string): boolean {
  return metadata.coordinateFingerprint === coordinateFingerprint
}

export function selectWeatherSource(
  current: WeatherModelData,
  cached: WeatherModelData | undefined,
  coordinateFingerprint: string,
  nowMs = Date.now(),
): SourceSelection<WeatherModelData> {
  if (isWeatherModelUsable(current)) {
    return { data: current, acceptedFresh: true, usedCache: false }
  }
  if (
    cached
    && isWeatherModelUsable(cached)
    && sameCoordinate(cached.metadata, coordinateFingerprint)
    && isSourceWithinMaxStale(cached.metadata, WEATHER_MAX_STALE_MS, nowMs)
  ) {
    return {
      data: {
        ...cached,
        metadata: cachedMetadata(
          cached.metadata,
          coordinateFingerprint,
          nowMs,
          refreshAttempt(current.metadata),
        ),
      },
      acceptedFresh: false,
      usedCache: true,
    }
  }
  return { data: current, acceptedFresh: false, usedCache: false }
}

export function selectRiverSource(
  current: RiverData,
  cached: RiverData | undefined,
  coordinateFingerprint: string,
  nowMs = Date.now(),
): SourceSelection<RiverData> {
  if (riverUsable(current)) {
    return { data: current, acceptedFresh: true, usedCache: false }
  }
  if (
    cached
    && riverUsable(cached)
    && sameCoordinate(cached.metadata, coordinateFingerprint)
    && isSourceWithinMaxStale(cached.metadata, RIVER_MAX_STALE_MS, nowMs)
  ) {
    return {
      data: {
        ...cached,
        metadata: cachedMetadata(
          cached.metadata,
          coordinateFingerprint,
          nowMs,
          refreshAttempt(current.metadata),
        ),
      },
      acceptedFresh: false,
      usedCache: true,
    }
  }
  return { data: current, acceptedFresh: false, usedCache: false }
}

function selectTerrainSource(
  current: TerrainData,
  cached: TerrainData | undefined,
  coordinateFingerprint: string,
  nowMs = Date.now(),
): SourceSelection<TerrainData> {
  if (terrainUsable(current)) {
    return { data: current, acceptedFresh: true, usedCache: false }
  }
  if (
    cached
    && terrainUsable(cached)
    && sameCoordinate(cached.metadata, coordinateFingerprint)
    && isSourceWithinMaxStale(cached.metadata, ELEVATION_MAX_STALE_MS, nowMs)
  ) {
    return {
      data: {
        ...cached,
        metadata: cachedMetadata(
          cached.metadata,
          coordinateFingerprint,
          nowMs,
          refreshAttempt(current.metadata),
        ),
      },
      acceptedFresh: false,
      usedCache: true,
    }
  }
  return { data: current, acceptedFresh: false, usedCache: false }
}

function expiredMetadata(
  metadata: SourceMetadata,
  coordinateFingerprint: string,
  maxStaleMs: number,
  nowMs: number,
): SourceMetadata {
  return {
    ...metadata,
    status: 'unavailable',
    ageMs: sourceAgeMs(metadata, nowMs),
    cached: false,
    coordinateFingerprint,
    error: `Cached source exceeded its ${Math.round(maxStaleMs / 3_600_000)} hour maximum stale age`,
  }
}

function cachedWeatherOrExpired(
  cached: WeatherModelData,
  coordinateFingerprint: string,
  nowMs: number,
): WeatherModelData {
  if (
    isWeatherModelUsable(cached)
    && sameCoordinate(cached.metadata, coordinateFingerprint)
    && isSourceWithinMaxStale(cached.metadata, WEATHER_MAX_STALE_MS, nowMs)
  ) {
    return {
      ...cached,
      metadata: cachedMetadata(
        cached.metadata,
        coordinateFingerprint,
        nowMs,
        null,
      ),
    }
  }
  return {
    ...errorWeather(cached.label, cached.model, coordinateFingerprint, 'Cached weather is unusable or expired'),
    metadata: expiredMetadata(
      cached.metadata,
      coordinateFingerprint,
      WEATHER_MAX_STALE_MS,
      nowMs,
    ),
  }
}

function cachedRiverOrExpired(
  cached: RiverData,
  coordinateFingerprint: string,
  nowMs: number,
): RiverData {
  if (
    riverUsable(cached)
    && sameCoordinate(cached.metadata, coordinateFingerprint)
    && isSourceWithinMaxStale(cached.metadata, RIVER_MAX_STALE_MS, nowMs)
  ) {
    return {
      ...cached,
      metadata: cachedMetadata(
        cached.metadata,
        coordinateFingerprint,
        nowMs,
        null,
      ),
    }
  }
  return {
    ...errorRiver(coordinateFingerprint, 'Cached river forecast is unusable or expired'),
    metadata: expiredMetadata(
      cached.metadata,
      coordinateFingerprint,
      RIVER_MAX_STALE_MS,
      nowMs,
    ),
  }
}

function cachedTerrainOrExpired(
  cached: TerrainData,
  coordinateFingerprint: string,
  nowMs: number,
): TerrainData {
  if (
    terrainUsable(cached)
    && sameCoordinate(cached.metadata, coordinateFingerprint)
    && isSourceWithinMaxStale(cached.metadata, ELEVATION_MAX_STALE_MS, nowMs)
  ) {
    return {
      ...cached,
      metadata: cachedMetadata(
        cached.metadata,
        coordinateFingerprint,
        nowMs,
        null,
      ),
    }
  }
  return {
    ...errorTerrain(coordinateFingerprint, 'Cached elevation is unusable or expired'),
    metadata: expiredMetadata(
      cached.metadata,
      coordinateFingerprint,
      ELEVATION_MAX_STALE_MS,
      nowMs,
    ),
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
  if (
    isWeatherModelUsable(aifs)
    || isWeatherModelUsable(ifs)
    || riverUsable(river)
    || terrainUsable(terrain)
  ) {
    return 'partial'
  }
  return 'error'
}

function asCachedEnvironmental(
  data: EnvironmentalData,
  nowMs = Date.now(),
): EnvironmentalData | null {
  const coordinateFingerprint = data.fingerprint
  const aifs = cachedWeatherOrExpired(data.weatherModels.aifs, coordinateFingerprint, nowMs)
  const ifs = cachedWeatherOrExpired(data.weatherModels.ifs, coordinateFingerprint, nowMs)
  const river = cachedRiverOrExpired(data.river, coordinateFingerprint, nowMs)
  const terrain = cachedTerrainOrExpired(data.terrain, coordinateFingerprint, nowMs)
  const hasUsableCache = [aifs, ifs, river, terrain].some(source => source.metadata.cached)
  if (!hasUsableCache) return null
  return {
    ...data,
    weatherModels: { aifs, ifs },
    river,
    terrain,
    status: computeOverall(aifs, ifs, river, terrain),
    stale: true,
  }
}

function reasonMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

function stampCachedAt<T extends { metadata: SourceMetadata }>(data: T, cachedAt: string): T {
  return {
    ...data,
    metadata: {
      ...data.metadata,
      cachedAt,
    },
  }
}

export function getCachedEnvData(latitude: number, longitude: number): EnvironmentalData | null {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const cached = readStaleCache<EnvironmentalData>(latitude, longitude)
  if (!cached || cached.fingerprint !== coordinateFingerprint) return null
  return asCachedEnvironmental(cached)
}

export function loadCachedOrStale(latitude: number, longitude: number): EnvironmentalData | null {
  return getCachedEnvData(latitude, longitude)
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

  const nowMs = Date.now()
  const aifsSelection = selectWeatherSource(
    currentAifs,
    sameCoordinateCache?.weatherModels.aifs,
    coordinateFingerprint,
    nowMs,
  )
  const ifsSelection = selectWeatherSource(
    currentIfs,
    sameCoordinateCache?.weatherModels.ifs,
    coordinateFingerprint,
    nowMs,
  )
  const riverSelection = selectRiverSource(
    currentRiver,
    sameCoordinateCache?.river,
    coordinateFingerprint,
    nowMs,
  )
  const terrainSelection = selectTerrainSource(
    currentTerrain,
    sameCoordinateCache?.terrain,
    coordinateFingerprint,
    nowMs,
  )
  const selections = [aifsSelection, ifsSelection, riverSelection, terrainSelection]
  const hasFreshAccepted = selections.some(selection => selection.acceptedFresh)
  const cacheWrittenAt = new Date(nowMs).toISOString()

  const aifs = aifsSelection.acceptedFresh && hasFreshAccepted
    ? stampCachedAt(aifsSelection.data, cacheWrittenAt)
    : aifsSelection.data
  const ifs = ifsSelection.acceptedFresh && hasFreshAccepted
    ? stampCachedAt(ifsSelection.data, cacheWrittenAt)
    : ifsSelection.data
  const river = riverSelection.acceptedFresh && hasFreshAccepted
    ? stampCachedAt(riverSelection.data, cacheWrittenAt)
    : riverSelection.data
  const terrain = terrainSelection.acceptedFresh && hasFreshAccepted
    ? stampCachedAt(terrainSelection.data, cacheWrittenAt)
    : terrainSelection.data
  const data: EnvironmentalData = {
    location: { latitude, longitude },
    fingerprint: coordinateFingerprint,
    weatherModels: { aifs, ifs },
    river,
    terrain,
    retrievedAt: cacheWrittenAt,
    status: computeOverall(aifs, ifs, river, terrain),
    stale: selections.some(selection => selection.usedCache),
  }

  if (hasFreshAccepted) writeCache(latitude, longitude, data, undefined, cacheWrittenAt)
  return data
}
