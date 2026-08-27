import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DevelopmentScenarioSelector from '../components/DevelopmentScenarioSelector'
import { calculateRisk } from '../services/riskEngine'
import type { RiskScenario } from '../services/riskScenarios'
import type { EvacuationPlanResult } from '../services/evacuationTypes'
import { CommunityProvider, useCommunity } from './CommunityContext'
import { EvacuationProvider, useEvacuationPlan } from './EvacuationContext'
import { useRisk, type RiskContextValue } from './RiskContext'
import {
  RiskScenarioStateProvider,
  useRiskScenario,
} from './RiskScenarioContext'

function liveRisk(): RiskContextValue {
  return {
    ...calculateRisk({ environmental: null, historicalBaseline: null, nowMs: 0 }),
    environmentalData: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() { return values.size },
  } as Storage & {
    setItem: ReturnType<typeof vi.fn>
  }
}

describe('development risk scenarios', () => {
  const originalStorage = globalThis.localStorage

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalStorage,
      configurable: true,
      writable: true,
    })
  })

  it('defaults to Live Data and returns the exact live RiskProvider value', async () => {
    const live = liveRisk()
    let selected: RiskContextValue | null = null
    let activeScenario: RiskScenario | null = null
    function Consumer() {
      selected = useRisk()
      activeScenario = useRiskScenario().activeScenario
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <RiskScenarioStateProvider liveRisk={live} developmentEnabled>
          <Consumer />
        </RiskScenarioStateProvider>,
      )
    })

    expect(activeScenario).toBe('live')
    expect(selected).toBe(live)
    await act(async () => renderer?.unmount())
  })

  it('feeds Demo HIGH into Stage 3 while retaining CommunityContext resources and writes no caches', async () => {
    const storage = memoryStorage({
      'deflood-community-data': JSON.stringify({ population: 2000, shelterCapacity: 1200 }),
    })
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    })
    const live = liveRisk()
    let selectScenario: ((scenario: RiskScenario) => void) | null = null
    let selected: RiskContextValue | null = null
    let communityPopulation: number | null = null
    let plan: EvacuationPlanResult | null = null
    function Consumer() {
      selectScenario = useRiskScenario().setScenario
      selected = useRisk()
      communityPopulation = useCommunity().community.population
      plan = useEvacuationPlan()
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <CommunityProvider>
          <RiskScenarioStateProvider liveRisk={live} developmentEnabled>
            <EvacuationProvider>
              <Consumer />
            </EvacuationProvider>
          </RiskScenarioStateProvider>
        </CommunityProvider>,
      )
    })
    storage.setItem.mockClear()

    await act(async () => {
      selectScenario?.('demo-high')
    })

    const currentRisk = selected as RiskContextValue | null
    const currentPlan = plan as EvacuationPlanResult | null
    expect(currentRisk?.calculationStatus).toBe('COMPLETE')
    expect(currentRisk?.hazardLevel).toBe('HIGH')
    expect(currentPlan?.planningStatus).toBe('URGENT_PLANNING')
    expect(communityPopulation).toBe(2000)
    expect(currentPlan?.shelter.population).toBe(2000)
    expect(currentPlan?.shelter.reportedCapacity).toBe(1200)
    expect(currentPlan?.shelter.shortage).toBe(800)
    expect(currentPlan?.allowedActions.map(action => action.id)).toContain('seek-additional-shelter-support')
    expect(storage.setItem).not.toHaveBeenCalled()
    await act(async () => renderer?.unmount())
  })

  it('cannot activate a demo scenario when development mode is disabled', async () => {
    const live = liveRisk()
    let selectScenario: ((scenario: RiskScenario) => void) | null = null
    let selected: RiskContextValue | null = null
    let activeScenario: RiskScenario | null = null
    function Consumer() {
      const control = useRiskScenario()
      selectScenario = control.setScenario
      activeScenario = control.activeScenario
      selected = useRisk()
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <RiskScenarioStateProvider liveRisk={live} developmentEnabled={false}>
          <DevelopmentScenarioSelector />
          <Consumer />
        </RiskScenarioStateProvider>,
      )
    })
    await act(async () => {
      selectScenario?.('demo-high')
    })

    expect(activeScenario).toBe('live')
    expect(selected).toBe(live)
    expect((renderer as ReturnType<typeof create> | null)?.toJSON()).toBeNull()
    await act(async () => renderer?.unmount())
  })

  it('shows an unavoidable warning whenever a development demo is active', async () => {
    let selectScenario: ((scenario: RiskScenario) => void) | null = null
    function Controller() {
      selectScenario = useRiskScenario().setScenario
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <RiskScenarioStateProvider liveRisk={liveRisk()} developmentEnabled>
          <DevelopmentScenarioSelector />
          <Controller />
        </RiskScenarioStateProvider>,
      )
    })
    expect(JSON.stringify((renderer as ReturnType<typeof create> | null)?.toJSON())).toContain('Live Data')
    expect(JSON.stringify((renderer as ReturnType<typeof create> | null)?.toJSON())).not.toContain('DEMO SCENARIO — Not live flood data')

    await act(async () => {
      selectScenario?.('demo-incomplete')
    })
    expect(JSON.stringify((renderer as ReturnType<typeof create> | null)?.toJSON())).toContain('DEMO SCENARIO — Not live flood data')
    await act(async () => renderer?.unmount())
  })
})
