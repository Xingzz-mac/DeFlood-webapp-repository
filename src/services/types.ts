export type SourceStatus =
  | 'live'
  | 'cached'
  | 'unavailable'
  | 'error'
  | 'incomplete'

export type RiverTrend = 'rising' | 'stable' | 'falling' | 'unavailable'

export interface SourceMetadata {
  status: SourceStatus
  retrievedAt: string
  lastSuccessfulAt: string | null
  cached: boolean
  fingerprint: string
  error: string | null
}

export interface PrecipitationHorizon {
  hours: number
  total: number | null
  expectedHours: number
  validHours: number
  coverage: number
}

export interface WeatherModelData {
  label: string
  model: string
  horizons: PrecipitationHorizon[]
  series: { time: string; value: number | null }[]
  metadata: SourceMetadata
}

export interface RiverDay {
  date: string
  discharge: number | null
  mean: number | null
  median: number | null
  maximum: number | null
  p25: number | null
  p75: number | null
}

export interface RiverData {
  days: RiverDay[]
  peakDischarge: number | null
  peakDate: string | null
  trend: RiverTrend
  metadata: SourceMetadata
}

export interface TerrainData {
  elevation: number | null
  metadata: SourceMetadata
}

export type AggregatorStatus = 'live' | 'partial' | 'error'

export interface EnvironmentalData {
  location: { latitude: number; longitude: number }
  fingerprint: string
  weatherModels: { aifs: WeatherModelData; ifs: WeatherModelData }
  river: RiverData
  terrain: TerrainData
  retrievedAt: string
  status: AggregatorStatus
  stale: boolean
}
