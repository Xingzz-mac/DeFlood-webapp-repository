import type { CommunityData } from '../context/CommunityContext'
import { floodAssessmentPresentation } from '../services/riskPresentation'
import { RIVER_MAX_SEARCH_DISTANCE_KM } from '../services/riverSpatial'
import type { RiskResult } from '../services/riskTypes'
import type { EnvironmentalData, GeographicCoordinate, RiverLookupMode } from '../services/types'

export interface FloodMapPoint {
  coordinate: GeographicCoordinate
  label: string
}

export interface FloodMapRiverPoint extends FloodMapPoint {
  lookupMode: Exclude<RiverLookupMode, 'UNAVAILABLE'>
  distanceKm: number | null
  provenanceText: string
}

export interface FloodMapViewModel {
  hasSavedCoordinate: boolean
  center: GeographicCoordinate | null
  communityPoint: FloodMapPoint | null
  riverPoint: FloodMapRiverPoint | null
  evidenceLine: [GeographicCoordinate, GeographicCoordinate] | null
  searchRadiusKm: number
  riverUnavailableMessage: string | null
  presentation: ReturnType<typeof floodAssessmentPresentation>
  hazardScore: number | null
  confidenceScore: number | null
  rainfallSeverity: number | null
  usableWeatherModels: number
  totalWeatherModels: number
  agreementLabel: string
  currentDischarge: number | null
  dischargeUnit: string
  riverTrend: string | null
  riverPercentile: number | null
}

type FloodMapRisk = Pick<
  RiskResult,
  | 'calculationStatus'
  | 'hazardLevel'
  | 'hazardScore'
  | 'confidenceScore'
  | 'rainfallSeverity'
  | 'weatherConsensus'
  | 'modelAgreement'
  | 'riverTrend'
  | 'riverPercentile'
>

function validCoordinate(coordinate: GeographicCoordinate): boolean {
  return Number.isFinite(coordinate.latitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && Number.isFinite(coordinate.longitude)
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
}

function riverProvenanceText(
  lookupMode: Exclude<RiverLookupMode, 'UNAVAILABLE'>,
  distanceKm: number | null,
): string {
  const distance = distanceKm === null ? 'an unavailable distance' : `${distanceKm.toFixed(1)} km`
  return lookupMode === 'EXACT_QUERY'
    ? `The exact community query returned this GloFAS grid point, ${distance} from the community.`
    : `Nearest usable GloFAS point found by nearby search, ${distance} from the community.`
}

export function buildFloodMapViewModel(
  community: Pick<CommunityData, 'name' | 'latitude' | 'longitude'>,
  risk: FloodMapRisk,
  environmentalData: EnvironmentalData | null,
): FloodMapViewModel {
  const coordinate = { latitude: community.latitude, longitude: community.longitude }
  const hasSavedCoordinate = validCoordinate(coordinate)
  const communityPoint = hasSavedCoordinate
    ? { coordinate, label: 'Assessment location' }
    : null
  const river = environmentalData?.river ?? null
  const hasUsableRiverPoint = Boolean(
    river?.primaryUsable
      && river.riverLookupMode !== 'UNAVAILABLE'
      && river.riverModelCoordinate
      && validCoordinate(river.riverModelCoordinate),
  )
  const riverPoint = hasUsableRiverPoint && river?.riverModelCoordinate
    ? {
        coordinate: river.riverModelCoordinate,
        label: 'GloFAS modeled river point',
        lookupMode: river.riverLookupMode as Exclude<RiverLookupMode, 'UNAVAILABLE'>,
        distanceKm: river.riverModelDistanceKm,
        provenanceText: riverProvenanceText(
          river.riverLookupMode as Exclude<RiverLookupMode, 'UNAVAILABLE'>,
          river.riverModelDistanceKm,
        ),
      }
    : null
  const currentDischarge = river?.days.find(day => day.discharge !== null)?.discharge ?? null

  return {
    hasSavedCoordinate,
    center: hasSavedCoordinate ? coordinate : null,
    communityPoint,
    riverPoint,
    evidenceLine: communityPoint && riverPoint
      ? [communityPoint.coordinate, riverPoint.coordinate]
      : null,
    searchRadiusKm: RIVER_MAX_SEARCH_DISTANCE_KM,
    riverUnavailableMessage: riverPoint
      ? null
      : 'No representative GloFAS river point was found within the nearby search radius.',
    presentation: floodAssessmentPresentation(risk),
    hazardScore: risk.hazardScore,
    confidenceScore: risk.calculationStatus === 'NOT_CALCULATED' ? null : risk.confidenceScore,
    rainfallSeverity: risk.rainfallSeverity,
    usableWeatherModels: risk.weatherConsensus.usableModelCount,
    totalWeatherModels: risk.weatherConsensus.totalConfiguredModelCount,
    agreementLabel: risk.modelAgreement.label,
    currentDischarge,
    dischargeUnit: river?.unit ?? 'm³/s',
    riverTrend: risk.riverTrend.label,
    riverPercentile: risk.riverPercentile,
  }
}
