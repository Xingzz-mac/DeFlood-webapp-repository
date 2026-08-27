import type { RiskResult } from './riskTypes'

type PresentableRisk = Pick<RiskResult, 'calculationStatus' | 'hazardLevel' | 'contributingFactors'>

export function riskMeaning(risk: PresentableRisk): string {
  if (risk.calculationStatus === 'NOT_CALCULATED') {
    return 'Flood Hazard is waiting for environmental evidence for the saved community.'
  }
  if (risk.calculationStatus === 'INCOMPLETE') {
    return 'Risk cannot be fully calculated because required rainfall or historical river evidence is unavailable.'
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
