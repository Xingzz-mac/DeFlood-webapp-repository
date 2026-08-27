import { ALLOWED_ACTION_REGISTRY } from './allowedActions'
import { EVACUATION_AI_TIMEOUT_MS } from './evacuationConfig'
import type {
  AllowedAction,
  EvacuationAiPayload,
  EvacuationAiResult,
  EvacuationCommunityInput,
  EvacuationPlanResult,
  EvacuationRiskInput,
} from './evacuationTypes'

interface EvacuationAiOptions {
  url?: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

export class EvacuationAiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvacuationAiError'
  }
}

function nonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function buildEvacuationAiPayload(
  plan: EvacuationPlanResult,
  community: EvacuationCommunityInput,
  risk: EvacuationRiskInput,
): EvacuationAiPayload {
  return {
    riskLevel: plan.hazardLevel,
    riskStatus: plan.riskStatus,
    hazardScore: plan.hazardScore,
    dataConfidence: plan.dataConfidence,
    population: plan.shelter.population,
    elderly: nonNegative(community.elderly),
    children: nonNegative(community.children),
    peopleWithDisabilities: nonNegative(community.disabled),
    boats: plan.transport.boats,
    vehicles: plan.transport.vehicles,
    shelterCapacity: plan.shelter.reportedCapacity,
    shelterShortage: plan.shelter.shortage,
    riverTrend: risk.riverTrend.label,
    allowedActions: plan.allowedActions.map(({ id, text }) => ({ id, text })),
  }
}

function configuredWebhookUrl(): string {
  const environment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return environment?.VITE_EVACUATION_WEBHOOK_URL?.trim() ?? ''
}

function parseValidatedResponse(body: unknown, plan: EvacuationPlanResult): EvacuationAiResult {
  if (!body || typeof body !== 'object') throw new EvacuationAiError('AI workflow returned malformed JSON.')
  const record = body as Record<string, unknown>
  const output = record.output
  if (!output || typeof output !== 'object') throw new EvacuationAiError('AI workflow response is missing output.')
  const actions = (output as Record<string, unknown>).actions
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new EvacuationAiError('AI workflow response is missing validated actions.')
  }
  const validation = record.validation && typeof record.validation === 'object'
    ? record.validation as Record<string, unknown>
    : {}
  const rejectedActionIds = Array.isArray(validation.rejectedActionIds)
    ? validation.rejectedActionIds.filter((id): id is string => typeof id === 'string')
    : []
  const rejected = new Set(rejectedActionIds)
  const allowed = new Map(plan.allowedActions.map(action => [action.id, action]))
  const selected: AllowedAction[] = []
  const seen = new Set<string>()
  for (const candidate of actions) {
    if (!candidate || typeof candidate !== 'object') continue
    const id = (candidate as Record<string, unknown>).id
    if (typeof id !== 'string' || rejected.has(id) || seen.has(id)) continue
    const trusted = allowed.get(id as AllowedAction['id'])
    if (!trusted || !ALLOWED_ACTION_REGISTRY[trusted.id]) continue
    selected.push(trusted)
    seen.add(id)
  }
  if (selected.length === 0) {
    throw new EvacuationAiError('AI workflow did not return any trusted allowed actions.')
  }
  return {
    actions: selected,
    summary: `AI assistance organized ${selected.length} verified planning action${selected.length === 1 ? '' : 's'}. Deterministic risk and community facts remain authoritative.`,
    rejectedActionIds,
  }
}

export async function requestEvacuationAiPlan(
  plan: EvacuationPlanResult,
  community: EvacuationCommunityInput,
  risk: EvacuationRiskInput,
  options: EvacuationAiOptions = {},
): Promise<EvacuationAiResult> {
  const url = options.url?.trim() || configuredWebhookUrl()
  if (!url) throw new EvacuationAiError('AI assistance is not configured.')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? EVACUATION_AI_TIMEOUT_MS)
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildEvacuationAiPayload(plan, community, risk)),
      signal: controller.signal,
    })
    if (!response.ok) throw new EvacuationAiError(`AI workflow returned HTTP ${response.status}.`)
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new EvacuationAiError('AI workflow returned malformed JSON.')
    }
    return parseValidatedResponse(body, plan)
  } catch (error) {
    if (error instanceof EvacuationAiError) throw error
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new EvacuationAiError('AI assistance timed out.')
    }
    throw new EvacuationAiError('AI assistance is unavailable because the workflow could not be reached.')
  } finally {
    clearTimeout(timeoutId)
  }
}
