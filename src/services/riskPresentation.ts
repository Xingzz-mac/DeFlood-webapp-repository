import type { RiskResult } from './riskTypes'

type PresentableRisk = Pick<
  RiskResult,
  'calculationStatus' | 'hazardLevel' | 'rainfallSeverity' | 'contributingFactors'
>

export type FloodAssessmentPresentationMode =
  | 'NOT_CALCULATED'
  | 'ASSESSMENT_UNAVAILABLE'
  | 'LIMITED'
  | 'COMPLETE'

export interface FloodAssessmentPresentation {
  mode: FloodAssessmentPresentationMode
  label: string
}

export function floodAssessmentPresentation(
  risk: Pick<RiskResult, 'calculationStatus' | 'hazardLevel' | 'rainfallSeverity'>,
): FloodAssessmentPresentation {
  if (risk.calculationStatus === 'NOT_CALCULATED') {
    return { mode: 'NOT_CALCULATED', label: 'NOT CALCULATED' }
  }
  if (risk.calculationStatus === 'INCOMPLETE') {
    return risk.rainfallSeverity === null
      ? { mode: 'ASSESSMENT_UNAVAILABLE', label: 'ASSESSMENT UNAVAILABLE' }
      : { mode: 'LIMITED', label: 'LIMITED FLOOD ASSESSMENT' }
  }
  return { mode: 'COMPLETE', label: risk.hazardLevel ?? 'ASSESSMENT UNAVAILABLE' }
}

export function riskMeaning(risk: PresentableRisk): string {
  if (risk.calculationStatus === 'NOT_CALCULATED') {
    return 'Flood Hazard is waiting for environmental evidence for the saved community.'
  }
  if (risk.calculationStatus === 'INCOMPLETE') {
    return risk.rainfallSeverity === null
      ? 'Flood assessment is unavailable because usable core rainfall evidence is not currently available.'
      : 'DeFlood cannot calculate the full Flood Hazard because required modeled river evidence or historical river context is unavailable.'
  }
  const strongestFactor = risk.contributingFactors[0]
  if (risk.hazardLevel === 'LOW') {
    return strongestFactor
      ? `Current evidence suggests LOW flood hazard. ${strongestFactor}`
      : 'Current evidence suggests LOW flood hazard.'
  }
  if (risk.hazardLevel === 'MEDIUM') {
    return strongestFactor
      ? `Current evidence suggests MEDIUM flood hazard. ${strongestFactor}`
      : 'Current evidence suggests MEDIUM flood hazard and supports readiness planning.'
  }
  return strongestFactor
    ? `Current evidence indicates HIGH flood hazard. ${strongestFactor}`
    : 'Current evidence indicates HIGH flood hazard and supports urgent evacuation planning.'
}

export function riskNextStep(risk: PresentableRisk): string {
  if (risk.calculationStatus !== 'COMPLETE') {
    return 'Review missing evidence or retry unavailable sources.'
  }
  if (risk.hazardLevel === 'LOW') return 'Continue monitoring and review preparedness.'
  return 'Review evacuation readiness and community resources.'
}
