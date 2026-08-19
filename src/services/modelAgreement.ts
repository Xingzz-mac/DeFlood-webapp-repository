import { isWeatherModelUsable } from './ecmwf'
import {
  AGREEMENT_HORIZON_WEIGHTS,
  AGREEMENT_RAIN_FLOOR_MM,
  AGREEMENT_SCORE_ANCHORS,
} from './riskConfig'
import type { ModelAgreement, WeatherConsensus } from './riskTypes'
import type { WeatherModelData } from './types'
import { interpolateAnchors, roundScore } from './riskScoring'

const HORIZONS = [24, 48, 72] as const

function totalFor(model: WeatherModelData, hours: number): number | null {
  const total = model.horizons.find(horizon => horizon.hours === hours)?.total
  return typeof total === 'number' && Number.isFinite(total) ? total : null
}

export function calculateModelAgreement(
  aifs: WeatherModelData,
  ifs: WeatherModelData,
): ModelAgreement {
  if (!isWeatherModelUsable(aifs) || !isWeatherModelUsable(ifs)) {
    return {
      score: null,
      label: 'Unavailable — single weather model',
      weightedDifference: null,
      horizons: [],
    }
  }

  const values = HORIZONS.map(hours => ({
    hours,
    aifs: totalFor(aifs, hours),
    ifs: totalFor(ifs, hours),
  }))
  if (values.some(value => value.aifs === null || value.ifs === null)) {
    return {
      score: null,
      label: 'Unavailable — incomplete horizons',
      weightedDifference: null,
      horizons: [],
    }
  }

  const horizons = values.map(value => {
    const aifsValue = value.aifs as number
    const ifsValue = value.ifs as number
    const mean = (aifsValue + ifsValue) / 2
    const differenceRatio = Math.abs(aifsValue - ifsValue)
      / Math.max(mean, AGREEMENT_RAIN_FLOOR_MM)
    return {
      hours: value.hours,
      aifs: aifsValue,
      ifs: ifsValue,
      differenceRatio,
      weight: AGREEMENT_HORIZON_WEIGHTS[value.hours],
    }
  })
  const weightedDifference = horizons.reduce(
    (sum, horizon) => sum + horizon.differenceRatio * horizon.weight,
    0,
  )
  const label = weightedDifference <= 0.15
    ? 'Strong'
    : weightedDifference <= 0.3
      ? 'Moderate'
      : weightedDifference <= 0.5
        ? 'Weak'
        : 'Poor'

  return {
    score: roundScore(interpolateAnchors(weightedDifference, AGREEMENT_SCORE_ANCHORS)),
    label,
    weightedDifference,
    horizons,
  }
}

export function buildWeatherConsensus(
  aifs: WeatherModelData,
  ifs: WeatherModelData,
): WeatherConsensus {
  const aifsUsable = isWeatherModelUsable(aifs)
  const ifsUsable = isWeatherModelUsable(ifs)
  const source = aifsUsable && ifsUsable
    ? 'aifs+ifs'
    : aifsUsable
      ? 'aifs'
      : ifsUsable
        ? 'ifs'
        : 'unavailable'

  return {
    source,
    horizons: HORIZONS.map(hours => {
      const aifsTotal = aifsUsable ? totalFor(aifs, hours) : null
      const ifsTotal = ifsUsable ? totalFor(ifs, hours) : null
      const value = aifsTotal !== null && ifsTotal !== null
        ? (aifsTotal + ifsTotal) / 2
        : aifsTotal ?? ifsTotal
      return { hours, value }
    }),
  }
}
