import { EVACUATION_AI_TIMEOUT_MS } from './evacuationConfig'
import type { CommunityData } from '../context/CommunityContext'
import type {
  AllowedAction,
  EvacuationPlanResult,
} from './evacuationTypes'
import type { RiskResult } from './riskTypes'

export const EVACUATION_CHAT_HISTORY_LIMIT = 10

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

export interface EvacuationChatPayload {
  message: string
  conversationHistory: EvacuationChatHistoryMessage[]
  risk: EvacuationChatSafeRisk
  community: CommunityData
  evacuationPlan: EvacuationPlanResult
  shelterGrounding: EvacuationChatShelterGrounding
  allowedActions: Pick<AllowedAction, 'id' | 'text'>[]
}

export interface EvacuationChatResult {
  answer: string
  actions: AllowedAction[]
  missingInformation: string[]
  rejectedActionIds: string[]
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
    community: { ...community },
    evacuationPlan,
    shelterGrounding: {
      reportedShelterCount: evacuationPlan.shelter.shelterCount,
      reportedShelterCapacity: evacuationPlan.shelter.reportedCapacity,
      operationalStatus: 'UNKNOWN',
      operationalStatusMeaning: 'Reported shelter inventory and capacity do not establish whether any shelter is operational.',
    },
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
      level: risk.hazardLevel,
      score: risk.hazardScore,
      confidence: Math.round(risk.confidenceScore),
      engineVersion: risk.engineVersion,
    },
    community: {
      name: community.name,
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
    plan: {
      status: plan.planningStatus,
      shortage: plan.shelter.shortage,
      missingInformation: plan.missingInformation,
      allowedActions: plan.allowedActions.map(action => [action.id, action.text]),
    },
  })
}

function configuredChatWebhookUrl(): string {
  const environment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return environment?.VITE_EVACUATION_CHAT_WEBHOOK_URL?.trim() ?? ''
}

function parseChatResponse(body: unknown, plan: EvacuationPlanResult): EvacuationChatResult {
  if (!body || typeof body !== 'object') {
    throw new EvacuationChatError('Chat workflow returned malformed JSON.')
  }
  const record = body as Record<string, unknown>
  if (typeof record.answer !== 'string' || record.answer.trim() === '') {
    throw new EvacuationChatError('Chat workflow returned an empty answer.')
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
  const rejected = new Set(rejectedActionIds)
  const currentActions = new Map(plan.allowedActions.map(action => [action.id, action]))
  const seenActions = new Set<string>()
  const actions: AllowedAction[] = []
  for (const candidate of Array.isArray(record.actions) ? record.actions : []) {
    if (!candidate || typeof candidate !== 'object') continue
    const id = (candidate as Record<string, unknown>).id
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

  return {
    answer: record.answer.trim(),
    actions,
    missingInformation,
    rejectedActionIds,
  }
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
    return parseChatResponse(body, currentPlan)
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
