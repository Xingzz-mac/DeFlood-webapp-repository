import { EVACUATION_AI_TIMEOUT_MS } from './evacuationConfig'
import type { CommunityData } from '../context/CommunityContext'
import type {
  AllowedAction,
  EvacuationPlanResult,
} from './evacuationTypes'
import type { RiskResult } from './riskTypes'

export const EVACUATION_CHAT_HISTORY_LIMIT = 10

export const EVACUATION_CHAT_RESPONSE_TYPES = [
  'GREETING',
  'STATUS',
  'ACTIONS',
  'FACTS',
  'MISSING_INFORMATION',
  'OUT_OF_SCOPE',
] as const

export type EvacuationChatResponseType = typeof EVACUATION_CHAT_RESPONSE_TYPES[number]

export const EVACUATION_CHAT_RESPONSE_LEADS: Readonly<Record<EvacuationChatResponseType, string>> = {
  GREETING: 'Hi! Ask me about the current flood situation, evacuation readiness, community resources, or what actions to take.',
  STATUS: 'Here is the current verified DeFlood information.',
  ACTIONS: 'Based on the current verified DeFlood data, these are the most relevant actions to start with.',
  FACTS: 'Here is the relevant verified DeFlood information.',
  MISSING_INFORMATION: 'DeFlood does not currently have enough verified information to answer that fully.',
  OUT_OF_SCOPE: 'I can help with the current DeFlood flood assessment, evacuation planning, community resources, and verified planning actions.',
}

export const EVACUATION_CHAT_THANKS_RESPONSE = "You're welcome. You can ask me about the current risk, resources, missing information, or recommended planning actions."
export const EVACUATION_CHAT_WORRIED_RESPONSE = 'I can help you focus on the verified situation. You can ask what the current Flood Hazard means, what actions are recommended, or what information is still missing.'
export const EVACUATION_CHAT_CONFUSION_RESPONSE = 'I can explain it simply. Ask me about the Flood Hazard, Data Confidence, river evidence, community resources, or what actions to take.'
export const EVACUATION_CHAT_FILLER_RESPONSE = "I'm here. You can ask about the current Flood Hazard, what to do next, community resources, or what's still unknown."
export const EVACUATION_CHAT_SO_RESPONSE = 'Go ahead — what would you like to know about the current DeFlood assessment?'

export interface EvacuationChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EvacuationChatSafeRisk {
  status: RiskResult['calculationStatus']
  hazardLevel: RiskResult['hazardLevel']
  hazardScore: RiskResult['hazardScore']
  confidenceScore: RiskResult['confidenceScore']
  confidenceLabel: 'Data Confidence (evidence quality, not flood probability)'
  supportingFacts: string[]
  unavailableFacts: string[]
}

export interface EvacuationChatShelterGrounding {
  reportedShelterCount: number | null
  reportedShelterCapacity: number | null
  operationalStatus: 'UNKNOWN'
  operationalStatusMeaning: 'Reported shelter inventory and capacity do not establish whether any shelter is operational.'
}

export interface EvacuationChatTrustedFact {
  id: string
  text: string
}

export interface EvacuationChatCommunity {
  population: number
  children: number
  elderly: number
  disabled: number
  otherVulnerable: number
  volunteers: number
  cars: number
  trucks: number
  boats: number
  shelters: number
  shelterCapacity: number
  water: string
  food: string
  medicine: string
  equipment: string
}

export interface EvacuationChatPayload {
  message: string
  conversationHistory: EvacuationChatHistoryMessage[]
  risk: EvacuationChatSafeRisk
  community: EvacuationChatCommunity
  evacuationPlan: EvacuationPlanResult
  shelterGrounding: EvacuationChatShelterGrounding
  trustedFacts: EvacuationChatTrustedFact[]
  allowedActions: Pick<AllowedAction, 'id' | 'text'>[]
}

export interface EvacuationChatResult {
  responseType?: EvacuationChatResponseType | null
  facts: EvacuationChatTrustedFact[]
  actions: AllowedAction[]
  missingInformation: string[]
  rejectedFactIds: string[]
  rejectedActionIds: string[]
}

export interface EvacuationChatLocalResponse {
  intent: 'GREETING' | 'THANKS' | 'WORRIED' | 'CONFUSION' | 'FILLER'
  content: string
}

interface EvacuationChatOptions {
  url?: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

export class EvacuationChatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvacuationChatError'
  }
}

export function capConversationHistory(
  history: EvacuationChatHistoryMessage[],
): EvacuationChatHistoryMessage[] {
  return history.slice(-EVACUATION_CHAT_HISTORY_LIMIT)
}

export function localEvacuationChatResponse(message: string): EvacuationChatLocalResponse | null {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)( there)?$/.test(normalized)) {
    return { intent: 'GREETING', content: EVACUATION_CHAT_RESPONSE_LEADS.GREETING }
  }
  if (/^(thanks|thank you|thanks so much|thank you so much)$/.test(normalized)) {
    return { intent: 'THANKS', content: EVACUATION_CHAT_THANKS_RESPONSE }
  }
  if (/^(?:(?:i'm|i am|i feel) (?:really )?(?:worried|scared|nervous|anxious)|this (?:is|feels) worrying)$/.test(normalized)) {
    return { intent: 'WORRIED', content: EVACUATION_CHAT_WORRIED_RESPONSE }
  }
  if (/^(?:(?:i'm|i am) confused|i (?:don't|do not) understand|what does this mean|can you explain this)$/.test(normalized)) {
    return { intent: 'CONFUSION', content: EVACUATION_CHAT_CONFUSION_RESPONSE }
  }
  if (normalized === 'so') {
    return { intent: 'FILLER', content: EVACUATION_CHAT_SO_RESPONSE }
  }
  if (/^(?:(?:a+h+)+|h+m+|u+h+|u+m+|o+h+|(?:so)+|ok(?:ay)?)$/.test(normalized)) {
    return { intent: 'FILLER', content: EVACUATION_CHAT_FILLER_RESPONSE }
  }
  return null
}

function allowedResponseType(value: unknown): EvacuationChatResponseType | null {
  return typeof value === 'string'
    && EVACUATION_CHAT_RESPONSE_TYPES.includes(value as EvacuationChatResponseType)
    ? value as EvacuationChatResponseType
    : null
}

export function resolveEvacuationChatResponseType(
  result: Pick<EvacuationChatResult, 'responseType' | 'facts' | 'actions' | 'missingInformation'>,
): EvacuationChatResponseType | null {
  const requested = allowedResponseType(result.responseType)
  const hasFacts = result.facts.length > 0
  const hasActions = result.actions.length > 0
  const hasMissingInformation = result.missingInformation.length > 0
  const hasGroundedContent = hasFacts || hasActions || hasMissingInformation

  if ((requested === 'GREETING' || requested === 'OUT_OF_SCOPE') && !hasGroundedContent) {
    return requested
  }
  if (requested === 'STATUS' && hasGroundedContent) return requested
  if (requested === 'ACTIONS' && hasActions) return requested
  if (requested === 'FACTS' && hasFacts) return requested
  if (requested === 'MISSING_INFORMATION' && hasMissingInformation) return requested

  if (hasFacts) return 'FACTS'
  if (hasActions) return 'ACTIONS'
  if (hasMissingInformation) return 'MISSING_INFORMATION'
  return null
}

function serializeRisk(risk: RiskResult): EvacuationChatSafeRisk {
  const supportingFacts = risk.contributingFactors.filter(fact => fact.trim() !== '')
  return {
    status: risk.calculationStatus,
    hazardScore: risk.hazardScore,
    hazardLevel: risk.hazardLevel,
    confidenceScore: risk.confidenceScore,
    confidenceLabel: 'Data Confidence (evidence quality, not flood probability)',
    supportingFacts,
    unavailableFacts: supportingFacts.length === 0
      ? ['Detailed supporting evidence is unavailable. Direct the user to View supporting data.']
      : [],
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function formatScore(value: number): string {
  return `${value.toFixed(1)} / 100`
}

export function buildEvacuationChatTrustedFacts(
  risk: RiskResult,
  community: CommunityData,
  plan: EvacuationPlanResult,
): EvacuationChatTrustedFact[] {
  const facts: EvacuationChatTrustedFact[] = []
  const add = (id: string, text: string) => facts.push({ id, text })

  add('risk.status', `Flood Hazard calculation status is ${risk.calculationStatus}.`)
  if (risk.hazardLevel !== null && risk.hazardScore !== null) {
    add(
      'risk.current-hazard',
      `Current Flood Hazard is ${risk.hazardLevel} with a hazard score of ${formatScore(risk.hazardScore)}.`,
    )
  }
  if (risk.calculationStatus === 'NOT_CALCULATED') {
    add('risk.data-confidence', 'Data Confidence is unavailable because Flood Hazard has not been calculated.')
  } else {
    add(
      'risk.data-confidence',
      `Current Data Confidence is ${formatScore(risk.confidenceScore)}. Data Confidence describes evidence quality, not flood probability.`,
    )
  }
  risk.contributingFactors
    .filter(fact => fact.trim() !== '')
    .slice(0, 5)
    .forEach((text, index) => add(`risk.supporting-${index + 1}`, text))

  const location = [community.name, community.township, community.region]
    .map(value => value.trim())
    .filter(value => value !== '')
    .join(', ')
  if (location) add('community.identity', `Current recorded community is ${location}.`)
  add('community.population', `Recorded community population is ${formatNumber(community.population)}.`)
  if (plan.priorityGroups.length > 0) {
    const groups = plan.priorityGroups
      .map(group => `${group.label}: ${formatNumber(group.count)}`)
      .join('; ')
    add(
      'community.priority-groups',
      `Recorded priority groups are ${groups}. These categories may overlap and must not be summed into a unique total.`,
    )
  }
  if (plan.volunteers !== null) {
    add('community.volunteers', `Recorded volunteer count is ${formatNumber(plan.volunteers)}; current availability is not established by this count.`)
  }

  if (plan.shelter.shelterCount !== null) {
    add('shelter.reported-count', `Reported shelter count is ${formatNumber(plan.shelter.shelterCount)}.`)
  }
  if (plan.shelter.reportedCapacity !== null) {
    add('shelter.reported-capacity', `Reported shelter capacity is ${formatNumber(plan.shelter.reportedCapacity)} places.`)
  }
  if (plan.shelter.coveragePercent !== null) {
    add('shelter.reported-coverage', `Reported shelter capacity coverage is ${plan.shelter.coveragePercent.toFixed(1)}% of the recorded population.`)
  }
  if (plan.shelter.shortageConfirmed && plan.shelter.shortage !== null) {
    add('shelter.confirmed-shortfall', `The reported shelter capacity has a confirmed shortfall of ${formatNumber(plan.shelter.shortage)} places.`)
  }
  add(
    'shelter.operational-status',
    'Shelter operational status is unknown. Reported shelter inventory and capacity do not establish whether any shelter is operational.',
  )

  const transportParts = [
    plan.transport.cars === null ? null : `${formatNumber(plan.transport.cars)} cars or pickups`,
    plan.transport.trucks === null ? null : `${formatNumber(plan.transport.trucks)} large vehicles`,
    plan.transport.boats === null ? null : `${formatNumber(plan.transport.boats)} boats`,
  ].filter((part): part is string => part !== null)
  if (transportParts.length > 0) {
    add('transport.reported-inventory', `Recorded transport inventory includes ${transportParts.join(', ')}.`)
  }
  add(
    'transport.capacity-status',
    'Transport carrying capacity and availability are unknown. Inventory counts do not establish people transportable, required trips, evacuation duration, or asset availability.',
  )

  add(
    'resources.reported-supplies',
    `Recorded supply statuses are water: ${community.water}; food: ${community.food}; medicine: ${community.medicine}; emergency equipment: ${community.equipment}.`,
  )
  add('planning.status', `Current deterministic evacuation planning status is ${plan.planningStatus.replace(/_/g, ' ')}.`)
  if (plan.missingInformation.length > 0) {
    add('planning.missing-information', `Current missing planning information: ${plan.missingInformation.join('; ')}.`)
  }
  if (plan.resourceWarnings.length > 0) {
    add('planning.resource-warnings', `Current verified resource warnings: ${plan.resourceWarnings.join(' ')}`)
  }
  return facts
}

export function buildEvacuationChatPayload(
  message: string,
  conversationHistory: EvacuationChatHistoryMessage[],
  risk: RiskResult,
  community: CommunityData,
  evacuationPlan: EvacuationPlanResult,
): EvacuationChatPayload {
  return {
    message: message.trim(),
    conversationHistory: capConversationHistory(conversationHistory),
    risk: serializeRisk(risk),
    community: {
      population: community.population,
      children: community.children,
      elderly: community.elderly,
      disabled: community.disabled,
      otherVulnerable: community.otherVulnerable,
      volunteers: community.volunteers,
      cars: community.cars,
      trucks: community.trucks,
      boats: community.boats,
      shelters: community.shelters,
      shelterCapacity: community.shelterCapacity,
      water: community.water,
      food: community.food,
      medicine: community.medicine,
      equipment: community.equipment,
    },
    evacuationPlan,
    shelterGrounding: {
      reportedShelterCount: evacuationPlan.shelter.shelterCount,
      reportedShelterCapacity: evacuationPlan.shelter.reportedCapacity,
      operationalStatus: 'UNKNOWN',
      operationalStatusMeaning: 'Reported shelter inventory and capacity do not establish whether any shelter is operational.',
    },
    trustedFacts: buildEvacuationChatTrustedFacts(risk, community, evacuationPlan),
    allowedActions: evacuationPlan.allowedActions.map(({ id, text }) => ({ id, text })),
  }
}

export function suggestedEvacuationChatQuestions(
  risk: RiskResult,
  plan: EvacuationPlanResult,
): string[] {
  const suggestions: string[] = []
  if (risk.calculationStatus === 'INCOMPLETE') {
    suggestions.push('What information is missing?', 'Why can’t flood hazard be calculated?')
  } else if (risk.calculationStatus === 'COMPLETE' && risk.hazardLevel) {
    suggestions.push(`Why is the flood hazard ${risk.hazardLevel}?`)
  }
  if (plan.shelter.reportedCapacity !== null && plan.shelter.population !== null) {
    suggestions.push('Do we have enough shelter capacity?')
  }
  if (plan.allowedActions.some(action => action.id === 'verify-transport-capacity')) {
    suggestions.push('What do we know about transport?')
  }
  if (plan.priorityGroups.length > 0) {
    suggestions.push('Which groups need priority planning?')
  }
  if (plan.missingInformation.length > 0 && risk.calculationStatus !== 'INCOMPLETE') {
    suggestions.push('What information is still missing?')
  }
  if (risk.calculationStatus !== 'NOT_CALCULATED' && risk.confidenceScore < 80) {
    suggestions.push('Why is Data Confidence lower?')
  }
  if (plan.immediatePriorities.length > 0 && risk.calculationStatus !== 'INCOMPLETE') {
    suggestions.push('What should I verify first?')
  }
  return [...new Set(suggestions)].slice(0, 6)
}

export function planningContextFingerprint(
  risk: RiskResult,
  community: CommunityData,
  plan: EvacuationPlanResult,
): string {
  return JSON.stringify({
    risk: {
      status: risk.calculationStatus,
      hazardLevel: risk.hazardLevel,
      hazardScore: risk.hazardScore,
      confidenceScore: risk.confidenceScore,
      contributingFactors: risk.contributingFactors,
      riverTrend: risk.riverTrend.label,
    },
    community,
    evacuationPlan: plan,
    trustedFacts: buildEvacuationChatTrustedFacts(risk, community, plan),
    allowedActions: plan.allowedActions.map(({ id, text }) => ({ id, text })),
  })
}

function configuredChatWebhookUrl(): string {
  const environment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return environment?.VITE_EVACUATION_CHAT_WEBHOOK_URL?.trim() ?? ''
}

function parseChatResponse(
  body: unknown,
  plan: EvacuationPlanResult,
  trustedFacts: EvacuationChatTrustedFact[],
): EvacuationChatResult {
  if (!body || typeof body !== 'object') {
    throw new EvacuationChatError('Chat workflow returned malformed JSON.')
  }
  const record = body as Record<string, unknown>
  if (record.factIds !== undefined && !Array.isArray(record.factIds)) {
    throw new EvacuationChatError('Chat workflow returned malformed fact IDs.')
  }
  if (record.actionIds !== undefined && !Array.isArray(record.actionIds)) {
    throw new EvacuationChatError('Chat workflow returned malformed action IDs.')
  }
  if (record.actions !== undefined && !Array.isArray(record.actions)) {
    throw new EvacuationChatError('Chat workflow returned malformed actions.')
  }
  const validation = record.validation && typeof record.validation === 'object'
    ? record.validation as Record<string, unknown>
    : {}
  const rejectedActionIds = Array.isArray(validation.rejectedActionIds)
    ? validation.rejectedActionIds.filter((id): id is string => typeof id === 'string')
    : []
  const trustedFactMap = new Map(trustedFacts.map(fact => [fact.id, fact]))
  const seenFacts = new Set<string>()
  const facts: EvacuationChatTrustedFact[] = []
  const rejectedFactIds: string[] = []
  for (const candidate of Array.isArray(record.factIds) ? record.factIds : []) {
    if (typeof candidate !== 'string' || seenFacts.has(candidate)) continue
    seenFacts.add(candidate)
    const trusted = trustedFactMap.get(candidate)
    if (trusted) facts.push(trusted)
    else rejectedFactIds.push(candidate)
  }

  const rejected = new Set(rejectedActionIds)
  const currentActions = new Map(plan.allowedActions.map(action => [action.id, action]))
  const seenActions = new Set<string>()
  const actions: AllowedAction[] = []
  const actionCandidates: unknown[] = [
    ...(Array.isArray(record.actionIds) ? record.actionIds : []),
    ...(Array.isArray(record.actions) ? record.actions : []),
  ]
  for (const candidate of actionCandidates) {
    const id = typeof candidate === 'string'
      ? candidate
      : candidate && typeof candidate === 'object'
        ? (candidate as Record<string, unknown>).id
        : null
    if (typeof id !== 'string' || rejected.has(id) || seenActions.has(id)) continue
    const trusted = currentActions.get(id as AllowedAction['id'])
    if (!trusted) continue
    actions.push(trusted)
    seenActions.add(id)
  }

  const currentMissing = new Set(plan.missingInformation)
  const seenMissing = new Set<string>()
  const missingInformation = (Array.isArray(record.missingInformation)
    ? record.missingInformation
    : [])
    .filter((item): item is string => typeof item === 'string')
    .filter(item => {
      if (!currentMissing.has(item) || seenMissing.has(item)) return false
      seenMissing.add(item)
      return true
    })

  const result: EvacuationChatResult = {
    responseType: allowedResponseType(record.responseType),
    facts,
    actions,
    missingInformation,
    rejectedFactIds,
    rejectedActionIds,
  }
  return { ...result, responseType: resolveEvacuationChatResponseType(result) }
}

export async function requestEvacuationChat(
  payload: EvacuationChatPayload,
  currentPlan: EvacuationPlanResult,
  options: EvacuationChatOptions = {},
): Promise<EvacuationChatResult> {
  const url = options.url?.trim() || configuredChatWebhookUrl()
  if (!url) throw new EvacuationChatError('Chat assistance is not configured.')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? EVACUATION_AI_TIMEOUT_MS)
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) throw new EvacuationChatError(`Chat workflow returned HTTP ${response.status}.`)
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new EvacuationChatError('Chat workflow returned malformed JSON.')
    }
    return parseChatResponse(body, currentPlan, payload.trustedFacts)
  } catch (error) {
    if (error instanceof EvacuationChatError) throw error
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new EvacuationChatError('Chat assistance timed out.')
    }
    throw new EvacuationChatError('Chat assistance is unavailable because the workflow could not be reached.')
  } finally {
    clearTimeout(timeoutId)
  }
}
