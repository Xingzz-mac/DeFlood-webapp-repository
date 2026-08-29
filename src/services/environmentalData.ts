import type {
  AggregatorStatus,
  EnvironmentalData,
  RefreshAttemptMetadata,
  RiverData,
  SourceMetadata,
  TerrainData,
  WeatherModelData,
  WeatherModelKey,
  WeatherModels,
} from './types'
import {
  ELEVATION_MAX_STALE_MS,
  RIVER_MAX_STALE_MS,
  WEATHER_MAX_STALE_MS,
} from './config'
import {
  fetchWeatherModel,
  isWeatherModelUsable,
  WEATHER_MODEL_DEFINITIONS,
  WEATHER_MODEL_KEYS,
} from './weatherModels'
import {
  buildEnsembleAvailability,
  fetchRiverDischarge,
  isPrimaryRiverUsable,
} from './glofas'
import { fetchElevation } from './elevation'
import { coordFingerprint, readStaleCache, writeCache } from './cache'
import { withRequestTimeout } from './requestTimeout'

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

function errorRiver(
  coordinateFingerprint: string,
  error: string,
  communityCoordinate: { latitude: number; longitude: number },
): RiverData {
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
    communityCoordinate,
    riverModelCoordinate: null,
    riverModelDistanceKm: null,
    riverLookupMode: 'UNAVAILABLE',
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
    status: 'expired',
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
    ...errorRiver(
      coordinateFingerprint,
      'Cached river forecast is unusable or expired',
      cached.communityCoordinate,
    ),
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
  weatherModels: WeatherModels,
  river: RiverData,
  terrain: TerrainData,
): AggregatorStatus {
  const statuses = [
    ...WEATHER_MODEL_KEYS.map(key => weatherModels[key].metadata.status),
    river.metadata.status,
    terrain.metadata.status,
  ]
  if (statuses.every(status => status === 'live')) return 'live'
  if (
    WEATHER_MODEL_KEYS.some(key => isWeatherModelUsable(weatherModels[key]))
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
  const weatherModels = Object.fromEntries(WEATHER_MODEL_KEYS.map(key => [
    key,
    cachedWeatherOrExpired(data.weatherModels[key], coordinateFingerprint, nowMs),
  ])) as WeatherModels
  const river = cachedRiverOrExpired(data.river, coordinateFingerprint, nowMs)
  const terrain = cachedTerrainOrExpired(data.terrain, coordinateFingerprint, nowMs)
  const hasUsableCache = [
    ...WEATHER_MODEL_KEYS.map(key => weatherModels[key]),
    river,
    terrain,
  ].some(source => source.metadata.cached)
  if (!hasUsableCache) return null
  return {
    ...data,
    weatherModels,
    river,
    terrain,
    status: computeOverall(weatherModels, river, terrain),
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

  const [weatherResults, otherResults] = await Promise.all([
    Promise.allSettled(WEATHER_MODEL_KEYS.map(key => {
      const definition = WEATHER_MODEL_DEFINITIONS[key]
      return withRequestTimeout(
        definition.timeoutLabel,
        sourceSignal => fetchWeatherModel(key, latitude, longitude, sourceSignal),
        signal,
      )
    })),
    Promise.allSettled([
      withRequestTimeout('Current GloFAS', sourceSignal => fetchRiverDischarge(latitude, longitude, sourceSignal), signal),
      withRequestTimeout('Elevation', sourceSignal => fetchElevation(latitude, longitude, sourceSignal), signal),
    ]),
  ])
  const [riverResult, elevationResult] = otherResults

  const currentWeatherModels = Object.fromEntries(WEATHER_MODEL_KEYS.map((key, index) => {
    const result = weatherResults[index]
    const definition = WEATHER_MODEL_DEFINITIONS[key]
    const current = result.status === 'fulfilled'
      ? result.value
      : errorWeather(
          definition.label,
          definition.model,
          coordinateFingerprint,
          reasonMessage(result.reason, `${definition.timeoutLabel} fetch failed`),
        )
    return [key, current]
  })) as WeatherModels
  const currentRiver = riverResult.status === 'fulfilled'
    ? riverResult.value
    : errorRiver(
        coordinateFingerprint,
        reasonMessage(riverResult.reason, 'GloFAS fetch failed'),
        { latitude, longitude },
      )
  const currentTerrain = elevationResult.status === 'fulfilled'
    ? elevationResult.value
    : errorTerrain(
        coordinateFingerprint,
        reasonMessage(elevationResult.reason, 'Elevation fetch failed'),
      )

  const nowMs = Date.now()
  const weatherSelections = Object.fromEntries(WEATHER_MODEL_KEYS.map(key => [
    key,
    selectWeatherSource(
      currentWeatherModels[key],
      sameCoordinateCache?.weatherModels[key],
      coordinateFingerprint,
      nowMs,
    ),
  ])) as Record<WeatherModelKey, SourceSelection<WeatherModelData>>
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
  const selections = [
    ...WEATHER_MODEL_KEYS.map(key => weatherSelections[key]),
    riverSelection,
    terrainSelection,
  ]
  const hasFreshAccepted = selections.some(selection => selection.acceptedFresh)
  const cacheWrittenAt = new Date(nowMs).toISOString()

  const weatherModels = Object.fromEntries(WEATHER_MODEL_KEYS.map(key => {
    const selection = weatherSelections[key]
    return [
      key,
      selection.acceptedFresh && hasFreshAccepted
        ? stampCachedAt(selection.data, cacheWrittenAt)
        : selection.data,
    ]
  })) as WeatherModels
  const river = riverSelection.acceptedFresh && hasFreshAccepted
    ? stampCachedAt(riverSelection.data, cacheWrittenAt)
    : riverSelection.data
  const terrain = terrainSelection.acceptedFresh && hasFreshAccepted
    ? stampCachedAt(terrainSelection.data, cacheWrittenAt)
    : terrainSelection.data
  const data: EnvironmentalData = {
    location: { latitude, longitude },
    fingerprint: coordinateFingerprint,
    weatherModels,
    river,
    terrain,
    retrievedAt: cacheWrittenAt,
    status: computeOverall(weatherModels, river, terrain),
    stale: selections.some(selection => selection.usedCache),
  }

  if (hasFreshAccepted) writeCache(latitude, longitude, data, undefined, cacheWrittenAt)
  return data
}
