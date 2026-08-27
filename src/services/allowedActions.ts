import type {
  AllowedAction,
  AllowedActionId,
  PlanningStatus,
  PriorityGroup,
} from './evacuationTypes'
import type { FloodHazardLevel } from './riskTypes'

export const ALLOWED_ACTION_REGISTRY: Readonly<Record<AllowedActionId, AllowedAction>> = {
  'monitor-risk': {
    id: 'monitor-risk',
    text: 'Continue monitoring the shared Flood Hazard and source updates.',
    category: 'monitoring',
  },
  'review-risk-evidence': {
    id: 'review-risk-evidence',
    text: 'Review unavailable or degraded risk evidence and retry source data when appropriate.',
    category: 'evidence',
  },
  'prioritize-vulnerable': {
    id: 'prioritize-vulnerable',
    text: 'Plan assistance for each recorded priority group without assuming the groups are mutually exclusive.',
    category: 'priority',
  },
  'review-evacuation-readiness': {
    id: 'review-evacuation-readiness',
    text: 'Review community evacuation readiness and reported resources.',
    category: 'readiness',
  },
  'verify-shelter': {
    id: 'verify-shelter',
    text: 'Verify shelter capacity and operational status with trusted local sources.',
    category: 'resources',
  },
  'seek-additional-shelter-support': {
    id: 'seek-additional-shelter-support',
    text: 'Plan how to seek additional shelter support for the confirmed capacity shortfall.',
    category: 'support',
  },
  'verify-transport-capacity': {
    id: 'verify-transport-capacity',
    text: 'Verify carrying capacity and availability for each recorded vehicle and boat type.',
    category: 'resources',
  },
  'verify-volunteer-availability': {
    id: 'verify-volunteer-availability',
    text: 'Verify how many trained volunteers are currently available for planning.',
    category: 'resources',
  },
  'prepare-support-request': {
    id: 'prepare-support-request',
    text: 'Prepare a draft support request for confirmed resource gaps; no request is sent automatically.',
    category: 'support',
  },
}

interface ActionEligibility {
  planningStatus: PlanningStatus
  hasPriorityGroups: boolean
  shelterInformationMissing: boolean
  transportCapacityUnknown: boolean
  volunteerAvailabilityMissing: boolean
  shelterShortageConfirmed: boolean
  confirmedResourceGap: boolean
}

export interface AllowedActionFacts {
  hazardLevel: FloodHazardLevel | null
  population: number | null
  shelterCapacity: number | null
  shelterCount: number | null
  shelterShortage: number | null
  shelterCoveragePercent: number | null
  vehicles: number | null
  boats: number | null
  volunteers: number | null
  priorityGroups: PriorityGroup[]
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function readableList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function pluralized(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}

function contextualAction(id: AllowedActionId, facts: AllowedActionFacts): AllowedAction {
  const registered = ALLOWED_ACTION_REGISTRY[id]
  let text = registered.text

  if (id === 'monitor-risk' && facts.hazardLevel) {
    text = `Continue monitoring the shared ${facts.hazardLevel} Flood Hazard and source updates.`
  }
  if (id === 'review-evacuation-readiness' && facts.population !== null) {
    text = `Review evacuation readiness and reported resources for ${formatNumber(facts.population)} residents.`
  }
  if (id === 'prioritize-vulnerable' && facts.priorityGroups.length > 0) {
    const groups = facts.priorityGroups.map(group => (
      `${formatNumber(group.count)} ${group.label.toLowerCase()}`
    ))
    text = `Plan assistance for the recorded priority groups: ${readableList(groups)}. These categories may overlap and must not be summed into a unique total.`
  }
  if (id === 'verify-shelter') {
    if (facts.shelterCount !== null && facts.shelterCapacity !== null) {
      text = `Verify operational status for ${pluralized(facts.shelterCount, 'recorded shelter')} with reported capacity of ${formatNumber(facts.shelterCapacity)} places using trusted local sources.`
    } else if (facts.shelterCount !== null) {
      text = `Verify operational status for ${pluralized(facts.shelterCount, 'recorded shelter')} with trusted local sources.`
    } else if (facts.shelterCapacity !== null) {
      text = `Verify the reported shelter capacity of ${formatNumber(facts.shelterCapacity)} places and shelter operational status with trusted local sources.`
    }
  }
  if (id === 'seek-additional-shelter-support' && facts.shelterShortage !== null) {
    text = `Plan additional shelter support for the confirmed shortfall of ${formatNumber(facts.shelterShortage)} places.`
  }
  if (id === 'verify-transport-capacity') {
    const inventory = [
      facts.vehicles !== null && facts.vehicles > 0
        ? pluralized(facts.vehicles, 'recorded vehicle')
        : null,
      facts.boats !== null && facts.boats > 0
        ? pluralized(facts.boats, 'recorded boat')
        : null,
    ].filter((detail): detail is string => detail !== null)
    if (inventory.length > 0) {
      text = `Verify carrying capacity and availability for the ${readableList(inventory)} before estimating transport capability.`
    }
  }
  if (id === 'prepare-support-request' && facts.shelterShortage !== null && facts.shelterShortage > 0) {
    text = `Prepare a draft support request that includes the confirmed shelter shortfall of ${formatNumber(facts.shelterShortage)} places; no request is sent automatically.`
  }

  return { ...registered, text }
}

export function selectAllowedActions(
  eligibility: ActionEligibility,
  facts: AllowedActionFacts,
): AllowedAction[] {
  const ids: AllowedActionId[] = ['monitor-risk', 'review-risk-evidence']
  if (eligibility.planningStatus === 'NOT_READY') {
    return ids.map(id => contextualAction(id, facts))
  }

  ids.push('review-evacuation-readiness')
  if (eligibility.planningStatus === 'PREPAREDNESS') {
    return ids.map(id => contextualAction(id, facts))
  }

  if (eligibility.hasPriorityGroups) ids.push('prioritize-vulnerable')
  if (eligibility.shelterInformationMissing) ids.push('verify-shelter')
  if (eligibility.transportCapacityUnknown) ids.push('verify-transport-capacity')
  if (eligibility.volunteerAvailabilityMissing) ids.push('verify-volunteer-availability')
  if (eligibility.planningStatus === 'URGENT_PLANNING') {
    if (eligibility.shelterShortageConfirmed) ids.push('seek-additional-shelter-support')
    if (eligibility.confirmedResourceGap) ids.push('prepare-support-request')
  }
  return ids.map(id => contextualAction(id, facts))
}

const URGENT_PRIORITY_ORDER: Readonly<Record<AllowedActionId, number>> = {
  'seek-additional-shelter-support': 100,
  'prioritize-vulnerable': 90,
  'verify-transport-capacity': 80,
  'prepare-support-request': 75,
  'verify-volunteer-availability': 70,
  'verify-shelter': 65,
  'monitor-risk': 40,
  'review-evacuation-readiness': 30,
  'review-risk-evidence': 20,
}

const READINESS_PRIORITY_ORDER: Readonly<Record<AllowedActionId, number>> = {
  'prioritize-vulnerable': 100,
  'verify-shelter': 90,
  'verify-transport-capacity': 80,
  'verify-volunteer-availability': 70,
  'review-evacuation-readiness': 60,
  'review-risk-evidence': 30,
  'monitor-risk': 20,
  'seek-additional-shelter-support': 0,
  'prepare-support-request': 0,
}

export function rankImmediatePlanningPriorities(
  actions: AllowedAction[],
  planningStatus: PlanningStatus,
): AllowedAction[] {
  const ranking = planningStatus === 'URGENT_PLANNING'
    ? URGENT_PRIORITY_ORDER
    : planningStatus === 'READINESS'
      ? READINESS_PRIORITY_ORDER
      : null
  if (!ranking) return actions.slice(0, 3)
  return [...actions]
    .sort((left, right) => ranking[right.id] - ranking[left.id])
    .slice(0, planningStatus === 'URGENT_PLANNING' ? 6 : 4)
}
