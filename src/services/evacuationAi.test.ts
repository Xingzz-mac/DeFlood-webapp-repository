import { describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { ALLOWED_ACTION_REGISTRY } from './allowedActions'
import { buildEvacuationAiPayload, requestEvacuationAiPlan } from './evacuationAi'
import { calculateEvacuationPlan } from './evacuationEngine'
import type { EvacuationRiskInput } from './evacuationTypes'

const community: CommunityData = {
  name: 'Sensitive Test Community',
  township: 'Sensitive Township',
  region: 'Sensitive Region',
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
  leader: 'PRIVATE LEADER NAME',
  mayor: 'PRIVATE MAYOR NAME',
  assistant: 'PRIVATE ASSISTANT NAME',
  phone: 'PRIVATE PHONE NUMBER',
  latitude: 16.54321,
  longitude: 95.12345,
  locationSource: 'gps',
  locationAccuracy: 12.5,
  locationUpdatedAt: '2026-08-27T12:00:00.000Z',
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
      dataProvenance: 'USER_CONFIRMED',
      riskLevel: 'HIGH',
      population: 1000,
      children: 120,
      elderly: 80,
      peopleWithDisabilities: 30,
      otherVulnerable: 20,
      volunteers: 25,
      cars: 10,
      trucks: 3,
      shelterCapacity: 800,
      shelterCount: 2,
      shelterShortage: 200,
      vehicles: 13,
      boats: 4,
      water: 'Adequate',
      food: 'Adequate',
      medicine: 'Adequate',
      equipment: 'Adequate',
    })
    expect(payload.allowedActions).toEqual(plan.allowedActions.map(({ id, text }) => ({ id, text })))
    const requestBody = fetcher.mock.calls[0]?.[1]?.body
    expect(typeof requestBody).toBe('string')
    const posted = JSON.parse(requestBody as string)
    expect(posted).not.toHaveProperty('leader')
    expect(posted).not.toHaveProperty('mayor')
    expect(posted).not.toHaveProperty('assistant')
    expect(posted).not.toHaveProperty('phone')
    expect(posted).not.toHaveProperty('latitude')
    expect(posted).not.toHaveProperty('longitude')
    expect(posted).not.toHaveProperty('locationAccuracy')
    expect(posted).not.toHaveProperty('locationUpdatedAt')
    expect(posted).not.toHaveProperty('locationSource')
    expect(JSON.stringify(posted)).not.toContain('PRIVATE LEADER NAME')
    expect(JSON.stringify(posted)).not.toContain('PRIVATE PHONE NUMBER')
    expect(posted).toMatchObject({
      population: 1000,
      children: 120,
      elderly: 80,
      peopleWithDisabilities: 30,
      otherVulnerable: 20,
      volunteers: 25,
      shelterCount: 2,
      shelterCapacity: 800,
      cars: 10,
      trucks: 3,
      boats: 4,
      vehicles: 13,
    })
  })

  it('sends sample provenance and sample-qualified actions without adding PII', () => {
    const samplePlan = calculateEvacuationPlan(community, risk, 'SAMPLE')
    const payload = buildEvacuationAiPayload(samplePlan, community, risk)
    const serialized = JSON.stringify(payload)

    expect(payload.dataProvenance).toBe('SAMPLE')
    expect(payload.shelterShortage).toBe(plan.shelter.shortage)
    expect(payload.allowedActions.map(action => action.id)).toEqual(plan.allowedActions.map(action => action.id))
    expect(payload.allowedActions.map(action => action.text).join(' ')).toContain('sample shortfall')
    expect(payload.allowedActions.map(action => action.text).join(' ')).not.toContain('confirmed shortfall')
    expect(serialized).not.toContain('PRIVATE LEADER NAME')
    expect(serialized).not.toContain('PRIVATE PHONE NUMBER')
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
