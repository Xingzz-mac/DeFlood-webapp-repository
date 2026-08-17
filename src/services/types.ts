export type RiverTrend = 'rising' | 'stable' | 'falling'

export type SourceStatus = 'ok' | 'error' | 'loading' | 'demo'

export interface WeatherModelData {
  label: string
  precipitation24h: number | null
  precipitation48h: number | null
  precipitation72h: number | null
  status: SourceStatus
}

export interface RiverData {
  discharge: number | null
  mean: number | null
  median: number | null
  maximum: number | null
  p25: number | null
  p75: number | null
  trend: RiverTrend
  status: SourceStatus
}

export interface TerrainData {
  elevation: number | null
  status: SourceStatus
}

export interface EnvironmentalData {
  location: {
    latitude: number
    longitude: number
  }
  weatherModels: {
    aifs: WeatherModelData
    ifs: WeatherModelData
  }
  river: RiverData
  terrain: TerrainData
  lastUpdated: string | null
  status: 'live' | 'demo' | 'partial' | 'error'
}
