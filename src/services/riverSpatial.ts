import type { GeographicCoordinate, RiverData } from './types'
import type { HistoricalBaseline } from './riskTypes'
import { coordFingerprint } from './cache'

export const RIVER_SEARCH_STEP_DEGREES = 0.05
export const RIVER_MAX_SEARCH_DISTANCE_KM = 15

const NEARBY_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [RIVER_SEARCH_STEP_DEGREES, 0],
  [-RIVER_SEARCH_STEP_DEGREES, 0],
  [0, RIVER_SEARCH_STEP_DEGREES],
  [0, -RIVER_SEARCH_STEP_DEGREES],
  [RIVER_SEARCH_STEP_DEGREES, RIVER_SEARCH_STEP_DEGREES],
  [RIVER_SEARCH_STEP_DEGREES, -RIVER_SEARCH_STEP_DEGREES],
  [-RIVER_SEARCH_STEP_DEGREES, RIVER_SEARCH_STEP_DEGREES],
  [-RIVER_SEARCH_STEP_DEGREES, -RIVER_SEARCH_STEP_DEGREES],
  [RIVER_SEARCH_STEP_DEGREES * 2, 0],
  [-RIVER_SEARCH_STEP_DEGREES * 2, 0],
  [0, RIVER_SEARCH_STEP_DEGREES * 2],
  [0, -RIVER_SEARCH_STEP_DEGREES * 2],
]

function validCoordinate(coordinate: GeographicCoordinate): boolean {
  return Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
}

export function haversineDistanceKm(
  first: GeographicCoordinate,
  second: GeographicCoordinate,
): number {
  const radiusKm = 6371.0088
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(second.latitude - first.latitude)
  const longitudeDelta = radians(second.longitude - first.longitude)
  const firstLatitude = radians(first.latitude)
  const secondLatitude = radians(second.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude)
      * Math.sin(longitudeDelta / 2) ** 2
  return 2 * radiusKm * Math.asin(Math.sqrt(haversine))
}

export function nearbyRiverCandidates(
  communityCoordinate: GeographicCoordinate,
): GeographicCoordinate[] {
  return NEARBY_OFFSETS.map(([latitudeOffset, longitudeOffset]) => ({
    latitude: communityCoordinate.latitude + latitudeOffset,
    longitude: communityCoordinate.longitude + longitudeOffset,
  })).filter(candidate => (
    validCoordinate(candidate)
    && haversineDistanceKm(communityCoordinate, candidate) <= RIVER_MAX_SEARCH_DISTANCE_KM
  ))
}

export interface AlignedRiverCandidate {
  river: RiverData
  historicalBaseline: HistoricalBaseline
  requestIndex: number
}

export function riverModelWithinMaximumDistance(river: RiverData): boolean {
  const modelCoordinate = river.riverModelCoordinate
  if (!modelCoordinate || river.riverLookupMode === 'UNAVAILABLE') return false
  return haversineDistanceKm(river.communityCoordinate, modelCoordinate)
    <= RIVER_MAX_SEARCH_DISTANCE_KM
}

export function historicalMatchesRiverModel(
  river: RiverData,
  historicalBaseline: HistoricalBaseline | null,
): boolean {
  const modelCoordinate = river.riverModelCoordinate
  const historicalCoordinate = historicalBaseline?.returnedModelCoordinate
  if (
    !modelCoordinate
    || !historicalCoordinate
    || historicalBaseline?.status !== 'available'
  ) return false
  const historicalFingerprint = coordFingerprint(
    historicalCoordinate.latitude,
    historicalCoordinate.longitude,
  )
  return historicalBaseline.coordinateFingerprint === historicalFingerprint
    && historicalFingerprint
      === coordFingerprint(modelCoordinate.latitude, modelCoordinate.longitude)
}

export function isAlignedRiverEvidence(candidate: AlignedRiverCandidate): boolean {
  return candidate.river.primaryUsable
    && riverModelWithinMaximumDistance(candidate.river)
    && historicalMatchesRiverModel(candidate.river, candidate.historicalBaseline)
}

export function selectNearestAlignedRiverCandidate(
  communityCoordinate: GeographicCoordinate,
  candidates: AlignedRiverCandidate[],
): AlignedRiverCandidate | null {
  return candidates.filter(isAlignedRiverEvidence).flatMap(candidate => {
    const modelCoordinate = candidate.river.riverModelCoordinate
    if (!modelCoordinate) return []
    const distanceKm = haversineDistanceKm(communityCoordinate, modelCoordinate)
    return distanceKm <= RIVER_MAX_SEARCH_DISTANCE_KM
      ? [{ candidate, distanceKm }]
      : []
  }).sort((first, second) => (
    first.distanceKm - second.distanceKm
      || first.candidate.requestIndex - second.candidate.requestIndex
  ))[0]?.candidate ?? null
}

export function riverSpatialQualityFactor(river: RiverData): number {
  if (
    river.riverLookupMode === 'UNAVAILABLE'
    || river.riverModelDistanceKm === null
    || !Number.isFinite(river.riverModelDistanceKm)
    || river.riverModelDistanceKm < 0
  ) return 0
  if (river.riverModelDistanceKm === 0) return 1
  if (river.riverModelDistanceKm <= 5) return 0.95
  if (river.riverModelDistanceKm <= 10) return 0.85
  if (river.riverModelDistanceKm <= RIVER_MAX_SEARCH_DISTANCE_KM) return 0.7
  return 0
}

export function riverModelLocationText(river: RiverData): string {
  if (river.riverLookupMode === 'EXACT_QUERY' && river.riverModelDistanceKm !== null) {
    return `River model location: GloFAS grid point ${river.riverModelDistanceKm.toFixed(1)} km from the community. The exact community query returned this modeled grid location.`
  }
  if (river.riverLookupMode === 'NEARBY_SEARCH' && river.riverModelDistanceKm !== null) {
    return `River model location: nearest usable GloFAS point found by nearby search, ${river.riverModelDistanceKm.toFixed(1)} km from the community.`
  }
  return 'No usable GloFAS river point was found within the nearby search radius.'
}
