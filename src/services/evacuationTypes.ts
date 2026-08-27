import type { CalculationStatus, FloodHazardLevel, TrendLabel } from './riskTypes'

export type PlanningStatus = 'NOT_READY' | 'PREPAREDNESS' | 'READINESS' | 'URGENT_PLANNING'
export type AllowedActionCategory = 'monitoring' | 'evidence' | 'readiness' | 'priority' | 'resources' | 'support'
export type AllowedActionId =
  | 'monitor-risk'
  | 'review-risk-evidence'
  | 'prioritize-vulnerable'
  | 'review-evacuation-readiness'
  | 'verify-shelter'
  | 'seek-additional-shelter-support'
  | 'verify-transport-capacity'
  | 'verify-volunteer-availability'
  | 'prepare-support-request'

export interface AllowedAction {
  id: AllowedActionId
  text: string
  category: AllowedActionCategory
}

export type PriorityGroupId = 'peopleWithDisabilities' | 'elderly' | 'children' | 'otherVulnerable'

export interface PriorityGroup {
  id: PriorityGroupId
  label: string
  count: number
}

export interface ShelterPlanning {
  population: number | null
  reportedCapacity: number | null
  shelterCount: number | null
  shortage: number | null
  coveragePercent: number | null
  shortageConfirmed: boolean
  operationalStatusKnown: false
}

export interface TransportPlanning {
  cars: number | null
  trucks: number | null
  vehicles: number | null
  boats: number | null
  vehicleCapacityKnown: false
  boatCapacityKnown: false
  notes: string[]
}

export interface EvacuationPlanResult {
  planningStatus: PlanningStatus
  riskStatus: CalculationStatus
  hazardLevel: FloodHazardLevel | null
  hazardScore: number | null
  dataConfidence: number | null
  priorityGroups: PriorityGroup[]
  shelter: ShelterPlanning
  transport: TransportPlanning
  volunteers: number | null
  resourceWarnings: string[]
  missingInformation: string[]
  immediatePriorities: AllowedAction[]
  allowedActions: AllowedAction[]
  explanations: string[]
  confirmedResourceGap: boolean
}

export interface EvacuationCommunityInput {
  population: number | null | undefined
  children: number | null | undefined
  elderly: number | null | undefined
  disabled: number | null | undefined
  otherVulnerable: number | null | undefined
  volunteers: number | null | undefined
  cars: number | null | undefined
  trucks: number | null | undefined
  boats: number | null | undefined
  shelters: number | null | undefined
  shelterCapacity: number | null | undefined
  water: string | null | undefined
  food: string | null | undefined
  medicine: string | null | undefined
  equipment: string | null | undefined
}

export interface EvacuationRiskInput {
  calculationStatus: CalculationStatus
  hazardLevel: FloodHazardLevel | null
  hazardScore: number | null
  confidenceScore: number
  contributingFactors: string[]
  riverTrend: { label: TrendLabel | null }
}

export interface EvacuationAiPayload {
  riskLevel: FloodHazardLevel | null
  riskStatus: CalculationStatus
  hazardScore: number | null
  dataConfidence: number | null
  population: number | null
  elderly: number | null
  children: number | null
  peopleWithDisabilities: number | null
  boats: number | null
  vehicles: number | null
  shelterCapacity: number | null
  shelterShortage: number | null
  riverTrend: TrendLabel | null
  allowedActions: Pick<AllowedAction, 'id' | 'text'>[]
}

export interface EvacuationAiResult {
  actions: AllowedAction[]
  summary: string
  rejectedActionIds: string[]
}
