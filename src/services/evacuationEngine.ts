import { rankImmediatePlanningPriorities, selectAllowedActions } from './allowedActions'
import type {
  EvacuationCommunityInput,
  EvacuationPlanResult,
  EvacuationRiskInput,
  PlanningStatus,
  PriorityGroup,
} from './evacuationTypes'

function nonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function planningStatusFor(risk: EvacuationRiskInput): PlanningStatus {
  if (risk.calculationStatus !== 'COMPLETE' || risk.hazardLevel === null) return 'NOT_READY'
  if (risk.hazardLevel === 'LOW') return 'PREPAREDNESS'
  if (risk.hazardLevel === 'MEDIUM') return 'READINESS'
  return 'URGENT_PLANNING'
}

function priorityGroupsFor(community: EvacuationCommunityInput): PriorityGroup[] {
  const groups: { id: PriorityGroup['id']; label: string; value: number | null | undefined }[] = [
    { id: 'peopleWithDisabilities', label: 'People with disabilities', value: community.disabled },
    { id: 'elderly', label: 'Elderly residents', value: community.elderly },
    { id: 'children', label: 'Children', value: community.children },
    { id: 'otherVulnerable', label: 'Other vulnerable residents', value: community.otherVulnerable },
  ]
  return groups.flatMap(group => {
    const count = nonNegative(group.value)
    return count !== null && count > 0 ? [{ id: group.id, label: group.label, count }] : []
  })
}

function supplyGap(label: string, value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return ['limited', 'critical', 'none'].includes(normalized)
    ? `Reported ${label} supply is ${normalized}.`
    : null
}

export function calculateEvacuationPlan(
  community: EvacuationCommunityInput,
  risk: EvacuationRiskInput,
): EvacuationPlanResult {
  const planningStatus = planningStatusFor(risk)
  const population = nonNegative(community.population)
  const reportedCapacity = nonNegative(community.shelterCapacity)
  const shelterCount = nonNegative(community.shelters)
  const shortage = population === null || reportedCapacity === null
    ? null
    : Math.max(population - reportedCapacity, 0)
  const coveragePercent = population === null || reportedCapacity === null
    ? null
    : population === 0
      ? 100
      : Math.min(100, (reportedCapacity / population) * 100)
  const shortageConfirmed = shortage !== null && shortage > 0

  const cars = nonNegative(community.cars)
  const trucks = nonNegative(community.trucks)
  const boats = nonNegative(community.boats)
  const vehicles = cars === null || trucks === null ? null : cars + trucks
  const vehicleCapacityUnknown = vehicles !== null && vehicles > 0
  const boatCapacityUnknown = boats !== null && boats > 0
  const transportCapacityUnknown = vehicleCapacityUnknown || boatCapacityUnknown
  const volunteers = nonNegative(community.volunteers)
  const priorityGroups = priorityGroupsFor(community)

  const missingInformation: string[] = ['Shelter operational status']
  if (population === null) missingInformation.push('Community population')
  if (reportedCapacity === null) missingInformation.push('Shelter capacity')
  if (shelterCount === null) missingInformation.push('Shelter inventory')
  if (cars === null || trucks === null) missingInformation.push('Vehicle inventory')
  if (boats === null) missingInformation.push('Boat inventory')
  if (vehicleCapacityUnknown) missingInformation.push('Vehicle carrying capacity')
  if (boatCapacityUnknown) missingInformation.push('Boat carrying capacity')
  if (volunteers === null) missingInformation.push('Volunteer availability')
  const supplyFields = [
    ['Drinking water supply status', community.water],
    ['Food supply status', community.food],
    ['Medicine supply status', community.medicine],
    ['Emergency equipment status', community.equipment],
  ] as const
  for (const [label, value] of supplyFields) {
    if (typeof value !== 'string' || value.trim() === '') missingInformation.push(label)
  }

  const resourceWarnings: string[] = []
  if (shortageConfirmed) {
    resourceWarnings.push(`Reported shelter capacity is short by ${shortage.toLocaleString()} places.`)
  }
  if (transportCapacityUnknown) {
    resourceWarnings.push('Transport capacity cannot be assessed from vehicle and boat counts alone.')
  }
  if (volunteers === 0) resourceWarnings.push('No available volunteers are recorded in Community Information.')
  const supplyWarnings = [
    supplyGap('drinking water', community.water),
    supplyGap('food', community.food),
    supplyGap('medicine', community.medicine),
    supplyGap('emergency equipment', community.equipment),
  ].filter((warning): warning is string => warning !== null)
  resourceWarnings.push(...supplyWarnings)

  const confirmedResourceGap = shortageConfirmed || volunteers === 0 || supplyWarnings.length > 0
  const allowedActions = selectAllowedActions(
    {
      planningStatus,
      hasPriorityGroups: priorityGroups.length > 0,
      shelterInformationMissing: reportedCapacity === null || missingInformation.includes('Shelter operational status'),
      transportCapacityUnknown: transportCapacityUnknown || cars === null || trucks === null || boats === null,
      volunteerAvailabilityMissing: volunteers === null,
      shelterShortageConfirmed: shortageConfirmed,
      confirmedResourceGap,
    },
    {
      hazardLevel: risk.calculationStatus === 'COMPLETE' ? risk.hazardLevel : null,
      population,
      shelterCapacity: reportedCapacity,
      shelterCount,
      shelterShortage: shortage,
      shelterCoveragePercent: coveragePercent,
      vehicles,
      boats,
      volunteers,
      priorityGroups,
    },
  )
  const immediatePriorities = rankImmediatePlanningPriorities(allowedActions, planningStatus)

  const explanations = planningStatus === 'NOT_READY'
    ? [
        risk.calculationStatus === 'INCOMPLETE'
          ? 'A complete evacuation recommendation cannot be generated because core Flood Hazard evidence is incomplete.'
          : 'Evacuation planning is not ready until Flood Hazard has been calculated.',
        'Only monitoring and risk-evidence review actions are enabled.',
      ]
    : planningStatus === 'PREPAREDNESS'
      ? [
          'Current Flood Hazard is LOW, so evacuation is not recommended by this prototype.',
          'Continue monitoring and review preparedness information.',
        ]
      : planningStatus === 'READINESS'
        ? [
            'Current Flood Hazard is MEDIUM, so readiness and resource verification are recommended.',
            'This is decision support, not an official evacuation order.',
          ]
        : [
            'Current Flood Hazard is HIGH. Urgent evacuation planning is recommended.',
            'This is decision support, not a mandatory or official evacuation order.',
          ]

  return {
    planningStatus,
    riskStatus: risk.calculationStatus,
    hazardLevel: risk.calculationStatus === 'COMPLETE' ? risk.hazardLevel : null,
    hazardScore: risk.calculationStatus === 'COMPLETE' ? risk.hazardScore : null,
    dataConfidence: risk.calculationStatus === 'NOT_CALCULATED' ? null : risk.confidenceScore,
    priorityGroups,
    shelter: {
      population,
      reportedCapacity,
      shelterCount,
      shortage,
      coveragePercent,
      shortageConfirmed,
      operationalStatusKnown: false,
    },
    transport: {
      cars,
      trucks,
      vehicles,
      boats,
      vehicleCapacityKnown: false,
      boatCapacityKnown: false,
      notes: transportCapacityUnknown
        ? ['Inventory counts do not establish carrying capacity, trip count, duration, or availability.']
        : ['No transport capacity calculation is made from inventory counts.'],
    },
    volunteers,
    resourceWarnings,
    missingInformation,
    immediatePriorities,
    allowedActions,
    explanations,
    confirmedResourceGap,
  }
}
