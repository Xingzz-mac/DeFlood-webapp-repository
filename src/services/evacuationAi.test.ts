import { describe, expect, it, vi } from 'vitest'
import { ALLOWED_ACTION_REGISTRY } from './allowedActions'
import { buildEvacuationAiPayload, requestEvacuationAiPlan } from './evacuationAi'
import { calculateEvacuationPlan } from './evacuationEngine'
import type { EvacuationCommunityInput, EvacuationRiskInput } from './evacuationTypes'

const community: EvacuationCommunityInput = {
  population: 1000,
  children: 120,
  elderly: 80,
  disabled: 30,
  otherVulnerable: 20,
  volunteers: 25,
  cars: 10,
  trucks: 3,
  boats: 4,
  shelters: 2,
  shelterCapacity: 800,
  water: 'Adequate',
  food: 'Adequate',
  medicine: 'Adequate',
  equipment: 'Adequate',
}
const risk: EvacuationRiskInput = {
  calculationStatus: 'COMPLETE',
  hazardLevel: 'HIGH',
  hazardScore: 80,
  confidenceScore: 75,
  contributingFactors: ['Heavy accumulated rainfall is forecast.'],
  riverTrend: { label: 'rising' },
}
const plan = calculateEvacuationPlan(community, risk)

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

describe('optional evacuation AI workflow', () => {
  it('uses only valid final output.actions from a valid response', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      output: {
        summary: 'Untrusted wording',
        actions: [
          ALLOWED_ACTION_REGISTRY['review-evacuation-readiness'],
          ALLOWED_ACTION_REGISTRY['verify-transport-capacity'],
        ],
      },
      validation: { rejectedActionIds: [] },
    }))
    const result = await requestEvacuationAiPlan(plan, community, risk, { url: 'https://example.test/webhook', fetcher })
    expect(result.actions.map(action => action.id)).toEqual([
      'review-evacuation-readiness',
      'verify-transport-capacity',
    ])
    const payload = buildEvacuationAiPayload(plan, community, risk)
    expect(payload).toMatchObject({
      riskLevel: 'HIGH',
      population: 1000,
      shelterCapacity: 800,
      shelterShortage: 200,
      vehicles: 13,
      boats: 4,
    })
    expect(payload.allowedActions).toEqual(plan.allowedActions.map(({ id, text }) => ({ id, text })))
  })

  it('does not display rejected or unregistered action IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      output: {
        actions: [
          { id: 'verify-shelter', text: 'Changed text' },
          { id: 'invent-route', text: 'Use a specific route' },
        ],
      },
      validation: { rejectedActionIds: ['invent-route'] },
    }))
    const result = await requestEvacuationAiPlan(plan, community, risk, { url: 'https://example.test/webhook', fetcher })
    expect(result.actions).toEqual([
      plan.allowedActions.find(action => action.id === 'verify-shelter'),
    ])
    expect(result.rejectedActionIds).toEqual(['invent-route'])
  })

  it('rejects malformed response JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad json') },
    } as unknown as Response)
    await expect(requestEvacuationAiPlan(plan, community, risk, {
      url: 'https://example.test/webhook',
      fetcher,
    })).rejects.toThrow('malformed JSON')
  })

  it('rejects a response with missing actions', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ output: {}, validation: {} }))
    await expect(requestEvacuationAiPlan(plan, community, risk, {
      url: 'https://example.test/webhook',
      fetcher,
    })).rejects.toThrow('missing validated actions')
  })

  it('keeps the deterministic planner usable when the network fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'))
    await expect(requestEvacuationAiPlan(plan, community, risk, {
      url: 'https://example.test/webhook',
      fetcher,
    })).rejects.toThrow('workflow could not be reached')
    expect(plan.allowedActions.length).toBeGreaterThan(0)
    expect(plan.shelter.shortage).toBe(200)
  })

  it('times out without modifying the deterministic plan', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })) as typeof fetch
    const request = requestEvacuationAiPlan(plan, community, risk, {
      url: 'https://example.test/webhook',
      fetcher,
      timeoutMs: 100,
    })
    const timeoutExpectation = expect(request).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation
    expect(plan.hazardLevel).toBe('HIGH')
    vi.useRealTimers()
  })

  it('ignores AI attempts to overwrite deterministic facts', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      output: {
        summary: 'Population is 999999 and shelter shortage is zero. Mandatory evacuation ordered.',
        resourceWarnings: [],
        missingInformation: [],
        actions: [ALLOWED_ACTION_REGISTRY['prepare-support-request']],
      },
      validation: { rejectedActionIds: [] },
    }))
    const result = await requestEvacuationAiPlan(plan, community, risk, { url: 'https://example.test/webhook', fetcher })
    expect(result.summary).not.toContain('999999')
    expect(result.summary).not.toContain('Mandatory evacuation')
    expect(plan.shelter.shortage).toBe(200)
    expect(plan.missingInformation).toContain('Shelter operational status')
  })
})
