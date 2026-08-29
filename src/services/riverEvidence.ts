import { coordFingerprint } from './cache'
import { RIVER_MAX_STALE_MS } from './config'
import {
  fetchRiverDischargeCandidates,
  isPrimaryRiverUsable,
  buildEnsembleAvailability,
} from './glofas'
import {
  fetchHistoricalBaseline,
  fetchHistoricalBaselines,
  historicalErrorBaseline,
  monthFromForecastDate,
  readHistoricalBaseline,
} from './historicalGlofas'
import { withRequestTimeout } from './requestTimeout'
import {
  haversineDistanceKm,
  nearbyRiverCandidates,
  RIVER_MAX_SEARCH_DISTANCE_KM,
  selectNearestAlignedRiverCandidate,
} from './riverSpatial'
import type { HistoricalBaseline } from './riskTypes'
import type { GeographicCoordinate, RiverData } from './types'

export const RIVER_SPATIAL_CACHE_SCHEMA_VERSION = 2

export interface RiverEvidenceSelection {
  river: RiverData
  historicalBaseline: HistoricalBaseline
}

export interface RiverEvidenceDependencies {
  fetchNearbyCurrent: typeof fetchRiverDischargeCandidates
  fetchOneHistorical: typeof fetchHistoricalBaseline
  fetchManyHistorical: typeof fetchHistoricalBaselines
  readHistorical: typeof readHistoricalBaseline
}

const DEFAULT_DEPENDENCIES: RiverEvidenceDependencies = {
  fetchNearbyCurrent: fetchRiverDischargeCandidates,
  fetchOneHistorical: fetchHistoricalBaseline,
  fetchManyHistorical: fetchHistoricalBaselines,
  readHistorical: readHistoricalBaseline,
}

interface RiverSpatialCacheEntry {
  schemaVersion: number
  communityFingerprint: string
  modelFingerprint: string
  riverLookupMode: 'EXACT_QUERY' | 'NEARBY_SEARCH'
  calendarMonth: number
  storedAt: string
  selection: RiverEvidenceSelection
}

function availableStorage(storage?: Storage): Storage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

function spatialCacheIndexKey(communityFingerprint: string, calendarMonth: number): string {
  return `deflood-river-spatial-index:v${RIVER_SPATIAL_CACHE_SCHEMA_VERSION}:${communityFingerprint}:month-${String(calendarMonth).padStart(2, '0')}`
}

export function riverSpatialCacheKey(
  communityFingerprint: string,
  modelFingerprint: string,
  lookupMode: 'EXACT_QUERY' | 'NEARBY_SEARCH',
  calendarMonth: number,
): string {
  return `deflood-river-spatial:v${RIVER_SPATIAL_CACHE_SCHEMA_VERSION}:${communityFingerprint}:${modelFingerprint}:${lookupMode}:month-${String(calendarMonth).padStart(2, '0')}`
}

export function writeRiverEvidenceSelection(
  selection: RiverEvidenceSelection,
  storage?: Storage,
  storedAt = new Date().toISOString(),
): void {
  const modelCoordinate = selection.river.riverModelCoordinate
  if (
    !modelCoordinate
    || selection.river.riverLookupMode === 'UNAVAILABLE'
    || !isPrimaryRiverUsable(selection.river.days)
    || selection.historicalBaseline.status !== 'available'
  ) return
  const communityFingerprint = coordFingerprint(
    selection.river.communityCoordinate.latitude,
    selection.river.communityCoordinate.longitude,
  )
  const modelFingerprint = coordFingerprint(modelCoordinate.latitude, modelCoordinate.longitude)
  if (selection.historicalBaseline.coordinateFingerprint !== modelFingerprint) return
  const key = riverSpatialCacheKey(
    communityFingerprint,
    modelFingerprint,
    selection.river.riverLookupMode,
    selection.historicalBaseline.calendarMonth,
  )
  const entry: RiverSpatialCacheEntry = {
    schemaVersion: RIVER_SPATIAL_CACHE_SCHEMA_VERSION,
    communityFingerprint,
    modelFingerprint,
    riverLookupMode: selection.river.riverLookupMode,
    calendarMonth: selection.historicalBaseline.calendarMonth,
    storedAt,
    selection,
  }
  try {
    const target = availableStorage(storage)
    if (!target) return
    target.setItem(key, JSON.stringify(entry))
    target.setItem(
      spatialCacheIndexKey(communityFingerprint, entry.calendarMonth),
      key,
    )
  } catch {
    // River evidence caching is best effort.
  }
}

export function readRiverEvidenceSelection(
  communityCoordinate: GeographicCoordinate,
  calendarMonth: number,
  storage?: Storage,
  nowMs = Date.now(),
): RiverEvidenceSelection | null {
  const communityFingerprint = coordFingerprint(
    communityCoordinate.latitude,
    communityCoordinate.longitude,
  )
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const key = target.getItem(spatialCacheIndexKey(communityFingerprint, calendarMonth))
    if (!key) return null
    const raw = target.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as RiverSpatialCacheEntry
    const storedAtMs = Date.parse(entry.storedAt)
    const lastSuccessfulAtMs = entry.selection.river.metadata.lastSuccessfulAt
      ? Date.parse(entry.selection.river.metadata.lastSuccessfulAt)
      : Number.NaN
    const modelCoordinate = entry.selection.river.riverModelCoordinate
    if (
      entry.schemaVersion !== RIVER_SPATIAL_CACHE_SCHEMA_VERSION
      || entry.communityFingerprint !== communityFingerprint
      || entry.calendarMonth !== calendarMonth
      || !Number.isFinite(storedAtMs)
      || !Number.isFinite(lastSuccessfulAtMs)
      || nowMs - lastSuccessfulAtMs > RIVER_MAX_STALE_MS
      || !modelCoordinate
      || entry.modelFingerprint !== coordFingerprint(modelCoordinate.latitude, modelCoordinate.longitude)
      || entry.selection.historicalBaseline.coordinateFingerprint !== entry.modelFingerprint
      || entry.selection.historicalBaseline.status !== 'available'
      || !isPrimaryRiverUsable(entry.selection.river.days)
      || entry.selection.river.riverLookupMode !== entry.riverLookupMode
      || (
        entry.riverLookupMode === 'NEARBY_SEARCH'
        && haversineDistanceKm(communityCoordinate, modelCoordinate) > RIVER_MAX_SEARCH_DISTANCE_KM
      )
    ) return null
    return {
      river: {
        ...entry.selection.river,
        metadata: {
          ...entry.selection.river.metadata,
          status: 'cached',
          cached: true,
          cachedAt: entry.storedAt,
          ageMs: Math.max(0, nowMs - lastSuccessfulAtMs),
        },
      },
      historicalBaseline: {
        ...entry.selection.historicalBaseline,
        cached: true,
        cachedAt: entry.storedAt,
      },
    }
  } catch {
    return null
  }
}

function unavailableRiver(
  exactRiver: RiverData,
  communityCoordinate: GeographicCoordinate,
): RiverData {
  const days = exactRiver.days.map(day => ({
    ...day,
    discharge: null,
  }))
  return {
    ...exactRiver,
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
    metadata: {
      ...exactRiver.metadata,
      status: 'unavailable',
      lastSuccessfulAt: null,
      cached: false,
      cachedAt: null,
      ageMs: null,
      error: 'No usable GloFAS river point was found within the nearby search radius.',
    },
  }
}

function forecastDateFrom(rivers: RiverData[]): string | null {
  return rivers.flatMap(river => river.days.map(day => day.date))
    .find(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) ?? null
}

async function historicalForCoordinate(
  coordinate: GeographicCoordinate,
  forecastDate: string,
  dependencies: RiverEvidenceDependencies,
  signal?: AbortSignal,
  storage?: Storage,
): Promise<HistoricalBaseline> {
  const month = monthFromForecastDate(forecastDate)
  if (month === null) throw new Error('Cannot determine forecast calendar month')
  return dependencies.readHistorical(coordinate.latitude, coordinate.longitude, month, storage)
    ?? dependencies.fetchOneHistorical(
      coordinate.latitude,
      coordinate.longitude,
      forecastDate,
      signal,
    )
}

export async function resolveRiverEvidence(
  communityCoordinate: GeographicCoordinate,
  exactRiver: RiverData,
  signal?: AbortSignal,
  storage?: Storage,
  dependencies: RiverEvidenceDependencies = DEFAULT_DEPENDENCIES,
): Promise<RiverEvidenceSelection> {
  const exactForecastDate = forecastDateFrom([exactRiver])
  const exactModelCoordinate = exactRiver.riverModelCoordinate
  let forecastDate = exactForecastDate
  let lastHistoricalError: unknown = null

  if (exactRiver.primaryUsable && exactModelCoordinate && exactForecastDate) {
    try {
      const historicalBaseline = await historicalForCoordinate(
        exactModelCoordinate,
        exactForecastDate,
        dependencies,
        signal,
        storage,
      )
      if (
        historicalBaseline.status === 'available'
        && historicalBaseline.coordinateFingerprint
          === coordFingerprint(exactModelCoordinate.latitude, exactModelCoordinate.longitude)
      ) {
        const selection = { river: exactRiver, historicalBaseline }
        writeRiverEvidenceSelection(selection, storage)
        return selection
      }
    } catch (error) {
      lastHistoricalError = error
    }
  }

  const requestedCandidates = nearbyRiverCandidates(communityCoordinate)
  let nearbyRivers: RiverData[] = []
  try {
    nearbyRivers = await withRequestTimeout(
      'Nearby current GloFAS search',
      requestSignal => dependencies.fetchNearbyCurrent(
        requestedCandidates,
        communityCoordinate,
        requestSignal,
      ),
      signal,
    )
  } catch {
    // A cached aligned selection may still be usable below.
  }
  forecastDate = forecastDate ?? forecastDateFrom(nearbyRivers)
  const usableNearby = nearbyRivers.filter(river => (
    river.primaryUsable && river.riverModelCoordinate !== null
  ))

  if (forecastDate && usableNearby.length > 0) {
    const calendarMonth = monthFromForecastDate(forecastDate)
    if (calendarMonth !== null) {
      const coordinatesByFingerprint = new Map<string, GeographicCoordinate>()
      usableNearby.forEach(river => {
        const coordinate = river.riverModelCoordinate!
        coordinatesByFingerprint.set(
          coordFingerprint(coordinate.latitude, coordinate.longitude),
          coordinate,
        )
      })
      const historicalByFingerprint = new Map<string, HistoricalBaseline>()
      const missingCoordinates: GeographicCoordinate[] = []
      coordinatesByFingerprint.forEach((coordinate, fingerprint) => {
        const cached = dependencies.readHistorical(
          coordinate.latitude,
          coordinate.longitude,
          calendarMonth,
          storage,
        )
        if (cached) historicalByFingerprint.set(fingerprint, cached)
        else missingCoordinates.push(coordinate)
      })
      if (missingCoordinates.length > 0) {
        try {
          const fetched = await dependencies.fetchManyHistorical(
            missingCoordinates,
            forecastDate,
            signal,
          )
          fetched.forEach(baseline => {
            historicalByFingerprint.set(baseline.coordinateFingerprint, baseline)
          })
        } catch (error) {
          lastHistoricalError = error
        }
      }
      const selected = selectNearestAlignedRiverCandidate(
        communityCoordinate,
        usableNearby.flatMap((river, requestIndex) => {
          const coordinate = river.riverModelCoordinate
          if (!coordinate) return []
          const baseline = historicalByFingerprint.get(
            coordFingerprint(coordinate.latitude, coordinate.longitude),
          )
          return baseline ? [{ river, historicalBaseline: baseline, requestIndex }] : []
        }),
      )
      if (selected) {
        const selection = {
          river: selected.river,
          historicalBaseline: selected.historicalBaseline,
        }
        writeRiverEvidenceSelection(selection, storage)
        return selection
      }
    }
  }

  const fallbackMonth = forecastDate ? monthFromForecastDate(forecastDate) : null
  if (fallbackMonth !== null) {
    const cached = readRiverEvidenceSelection(
      communityCoordinate,
      fallbackMonth,
      storage,
    )
    if (cached) return cached
  }
  const calendarMonth = fallbackMonth ?? new Date().getUTCMonth() + 1
  const errorMessage = lastHistoricalError instanceof Error
    ? lastHistoricalError.message
    : 'No aligned current and historical GloFAS evidence is available'
  return {
    river: unavailableRiver(exactRiver, communityCoordinate),
    historicalBaseline: historicalErrorBaseline(
      communityCoordinate.latitude,
      communityCoordinate.longitude,
      calendarMonth,
      errorMessage,
    ),
  }
}
