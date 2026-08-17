import type { WeatherModelData, SourceStatus } from './types'

const ECMWF_BASE = 'https://api.open-meteo.com/v1/ecmwf'

const AIFS_MODEL = 'ecmwf_aifs025'
const IFS_MODEL = 'ecmwf_ifs025'

interface EcmwfResponse {
  hourly?: {
    time?: string[]
    precipitation_ecmwf_aifs025?: (number | null)[]
    precipitation_ecmwf_ifs025?: (number | null)[]
  }
  error?: boolean
  reason?: string
}

function sumFirst(values: (number | null)[], hours: number): number | null {
  const slice = values.slice(0, hours)
  if (slice.length < hours || slice.every(v => v === null)) return null
  return slice.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}

async function fetchBoth(
  latitude: number,
  longitude: number,
): Promise<{ aifs: (number | null)[]; ifs: (number | null)[] }> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'precipitation',
    models: `${AIFS_MODEL},${IFS_MODEL}`,
    forecast_days: '4',
  })
  const res = await fetch(`${ECMWF_BASE}?${params}`)
  if (!res.ok) throw new Error(`ECMWF API returned ${res.status}`)
  const data: EcmwfResponse = await res.json()
  if (data.error) throw new Error(data.reason ?? 'ECMWF API error')
  return {
    aifs: data.hourly?.precipitation_ecmwf_aifs025 ?? [],
    ifs: data.hourly?.precipitation_ecmwf_ifs025 ?? [],
  }
}

function buildModel(
  label: string,
  precip: (number | null)[],
): WeatherModelData {
  const allNull = precip.length === 0 || precip.every(v => v === null)
  const status: SourceStatus = allNull ? 'demo' : 'ok'
  return {
    label,
    precipitation24h: allNull ? null : sumFirst(precip, 24),
    precipitation48h: allNull ? null : sumFirst(precip, 48),
    precipitation72h: allNull ? null : sumFirst(precip, 72),
    status,
  }
}

export async function fetchEcmwf(
  latitude: number,
  longitude: number,
): Promise<{ aifs: WeatherModelData; ifs: WeatherModelData }> {
  const { aifs, ifs } = await fetchBoth(latitude, longitude)
  return {
    aifs: buildModel('ECMWF AIFS — AI Forecast', aifs),
    ifs: buildModel('ECMWF IFS — Physics-Based Forecast', ifs),
  }
}
