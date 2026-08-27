export const ECMWF_BASE = 'https://api.open-meteo.com/v1/ecmwf'
export const FLOOD_BASE = 'https://flood-api.open-meteo.com/v1/flood'
export const ELEVATION_BASE = 'https://api.open-meteo.com/v1/elevation'

export const AIFS_MODEL = 'ecmwf_aifs025'
export const IFS_MODEL = 'ecmwf_ifs025'

export const FORECAST_HOURS = 96
export const RIVER_FORECAST_DAYS = 7

export const MIN_COVERAGE_PCT = 90
export const REQUIRED_WEATHER_HORIZONS = [24, 72] as const

export const WEATHER_MAX_STALE_MS = 6 * 60 * 60 * 1000
export const RIVER_MAX_STALE_MS = 12 * 60 * 60 * 1000
export const ELEVATION_MAX_STALE_MS = 30 * 24 * 60 * 60 * 1000

export const ENV_CACHE_TTL_MS = 60 * 60 * 1000
export const ENV_CACHE_SCHEMA_VERSION = 4

export const GEO_TIMEOUT_MS = 12_000
export const ENVIRONMENTAL_REQUEST_TIMEOUT_MS = 12_000
