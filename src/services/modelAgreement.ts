import {
  AGREEMENT_HORIZON_WEIGHTS,
  AGREEMENT_RAIN_FLOOR_MM,
  AGREEMENT_SCORE_ANCHORS,
} from './riskConfig'
import type {
  AgreementLabel,
  ModelAgreement,
  ModelAgreementStatus,
  WeatherConsensus,
} from './riskTypes'
import type { WeatherModelKey, WeatherModels } from './types'
import {
  isWeatherHorizonUsable,
  isWeatherModelUsable,
  WEATHER_MODEL_KEYS,
} from './weatherModels'
import { interpolateAnchors, roundScore } from './riskScoring'

const HORIZONS = [24, 48, 72] as const

function totalFor(models: WeatherModels, key: WeatherModelKey, hours: number): number | null {
  if (!isWeatherModelUsable(models[key]) || !isWeatherHorizonUsable(models[key], hours)) {
    return null
  }
  return models[key].horizons.find(horizon => horizon.hours === hours)?.total ?? null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function consensusValue(values: number[]): number | null {
  if (values.length === 0) return null
  if (values.length === 1) return values[0]
  if (values.length === 2) return (values[0] + values[1]) / 2
  return median(values)
}

function agreementStatus(usableModelCount: number): ModelAgreementStatus {
  if (usableModelCount === 4) return 'FOUR_USABLE_MODELS'
  if (usableModelCount === 3) return 'THREE_USABLE_MODELS'
  if (usableModelCount === 2) return 'TWO_USABLE_MODELS'
  if (usableModelCount === 1) return 'SINGLE_USABLE_MODEL'
  return 'NO_USABLE_MODELS'
}

function agreementLabel(score: number): AgreementLabel {
  if (score >= 85) return 'Strong'
  if (score >= 65) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Poor'
}

function usableKeys(models: WeatherModels): WeatherModelKey[] {
  return WEATHER_MODEL_KEYS.filter(key => isWeatherModelUsable(models[key]))
}

export function calculateModelAgreement(models: WeatherModels): ModelAgreement {
  const globallyUsable = usableKeys(models)
  const usableModelCount = globallyUsable.length
  const totalConfiguredModelCount = WEATHER_MODEL_KEYS.length
  const status = agreementStatus(usableModelCount)

  if (usableModelCount === 0) {
    return {
      status,
      score: null,
      label: 'Unavailable — no usable weather models',
      weightedDifference: null,
      usableModelCount,
      totalConfiguredModelCount,
      coveredHorizonWeight: 0,
      horizons: [],
    }
  }
  if (usableModelCount === 1) {
    return {
      status,
      score: null,
      label: 'Unavailable — single usable weather model',
      weightedDifference: null,
      usableModelCount,
      totalConfiguredModelCount,
      coveredHorizonWeight: 0,
      horizons: [],
    }
  }

  const horizons = HORIZONS.flatMap(hours => {
    const modelTotals = globallyUsable.flatMap(key => {
      const total = totalFor(models, key, hours)
      return total === null ? [] : [{ key, total }]
    })
    if (modelTotals.length < 2) return []
    const consensus = consensusValue(modelTotals.map(model => model.total)) as number
    const meanAbsoluteDeviation = modelTotals.reduce(
      (sum, model) => sum + Math.abs(model.total - consensus),
      0,
    ) / modelTotals.length
    const differenceRatio = meanAbsoluteDeviation
      / Math.max(consensus, AGREEMENT_RAIN_FLOOR_MM)
    return [{
      hours,
      modelTotals,
      modelCount: modelTotals.length,
      consensus,
      meanAbsoluteDeviation,
      differenceRatio,
      score: roundScore(interpolateAnchors(differenceRatio, AGREEMENT_SCORE_ANCHORS)),
      weight: AGREEMENT_HORIZON_WEIGHTS[hours],
    }]
  })
  const coveredHorizonWeight = horizons.reduce((sum, horizon) => sum + horizon.weight, 0)
  const score = roundScore(horizons.reduce(
    (sum, horizon) => sum + horizon.score * horizon.weight,
    0,
  ))
  const weightedDifference = horizons.reduce(
    (sum, horizon) => sum + horizon.differenceRatio * horizon.weight,
    0,
  )

  return {
    status,
    score,
    label: agreementLabel(score),
    weightedDifference,
    usableModelCount,
    totalConfiguredModelCount,
    coveredHorizonWeight,
    horizons,
  }
}

export function buildWeatherConsensus(models: WeatherModels): WeatherConsensus {
  const globallyUsable = usableKeys(models)
  const source = globallyUsable.length >= 2
    ? 'multi-model'
    : globallyUsable[0] ?? 'unavailable'

  return {
    source,
    usableModelCount: globallyUsable.length,
    totalConfiguredModelCount: WEATHER_MODEL_KEYS.length,
    horizons: HORIZONS.map(hours => {
      const modelTotals = globallyUsable.flatMap(key => {
        const total = totalFor(models, key, hours)
        return total === null ? [] : [{ key, total }]
      })
      return {
        hours,
        value: consensusValue(modelTotals.map(model => model.total)),
        modelCount: modelTotals.length,
        modelKeys: modelTotals.map(model => model.key),
      }
    }),
  }
}
