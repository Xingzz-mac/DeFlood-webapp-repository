export type SourceStatus =
  | 'live'
  | 'cached'
  | 'expired'
  | 'unavailable'
  | 'error'
  | 'incomplete'

export type WeatherModelKey = 'aifs' | 'ifs' | 'gfs' | 'ukmo'

export type RiverTrend = 'rising' | 'stable' | 'falling' | 'unavailable'

export type RiverLookupMode = 'EXACT_QUERY' | 'NEARBY_SEARCH' | 'UNAVAILABLE'

export interface GeographicCoordinate {
  latitude: number
  longitude: number
}

export interface RefreshAttemptMetadata {
  status: SourceStatus
  retrievedAt: string
  error: string | null
}

export interface SourceMetadata {
  status: SourceStatus
  retrievedAt: string
  lastSuccessfulAt: string | null
  cachedAt: string | null
  ageMs: number | null
  cached: boolean
  coordinateFingerprint: string
  error: string | null
  refreshAttempt: RefreshAttemptMetadata | null
}

export interface PrecipitationHorizon {
  hours: number
  total: number | null
  expectedHours: number
  validHours: number
  coverage: number
  complete: boolean
}

export interface WeatherModelData {
  label: string
  model: string
  unit: 'mm'
  horizons: PrecipitationHorizon[]
  series: { time: string; value: number | null }[]
  metadata: SourceMetadata
}

export type WeatherModels = Record<WeatherModelKey, WeatherModelData>

export interface RiverDay {
  date: string
  discharge: number | null
  mean: number | null
  median: number | null
  maximum: number | null
  p25: number | null
  p75: number | null
}

export interface EnsembleFieldAvailability {
  available: boolean
  complete: boolean
  validDays: number
  expectedDays: number
}

export interface RiverEnsembleAvailability {
  mean: EnsembleFieldAvailability
  median: EnsembleFieldAvailability
  maximum: EnsembleFieldAvailability
  p25: EnsembleFieldAvailability
  p75: EnsembleFieldAvailability
}

export interface RiverData {
  unit: 'm³/s'
  recentDays?: RiverDay[]
  days: RiverDay[]
  primaryValidDays: number
  primaryUsable: boolean
  peakDischarge: number | null
  peakDate: string | null
  trend: RiverTrend
  ensembleAvailability: RiverEnsembleAvailability
  communityCoordinate: GeographicCoordinate
  riverModelCoordinate: GeographicCoordinate | null
  riverModelDistanceKm: number | null
  riverLookupMode: RiverLookupMode
  metadata: SourceMetadata
}

export interface TerrainData {
  unit: 'm'
  elevation: number | null
  metadata: SourceMetadata
}

export type AggregatorStatus = 'live' | 'partial' | 'error'

export interface EnvironmentalData {
  location: { latitude: number; longitude: number }
  fingerprint: string
  weatherModels: WeatherModels
  river: RiverData
  terrain: TerrainData
  retrievedAt: string
  status: AggregatorStatus
  stale: boolean
}
