import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityProvider, useCommunity } from './CommunityContext'
import { RiskProvider, useLiveRisk, useRisk, type RiskContextValue } from './RiskContext'
import { EvacuationProvider, useEvacuationPlan } from './EvacuationContext'
import { RiskScenarioProvider } from './RiskScenarioContext'
import EvacuationChat from '../components/EvacuationChat'

const useEnvironmentalDataMock = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useEnvironmentalData', () => ({
  useEnvironmentalData: useEnvironmentalDataMock,
}))

describe('RiskProvider environmental ownership', () => {
  beforeEach(() => {
    useEnvironmentalDataMock.mockReset()
    useEnvironmentalDataMock.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      stale: false,
      refresh: vi.fn(),
    })
  })

  it('keeps one environmental-data hook instance for risk and evacuation consumers', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let liveRisk: RiskContextValue | null = null
    let selectedRisk: RiskContextValue | null = null
    function Consumer() {
      liveRisk = useLiveRisk()
      selectedRisk = useRisk()
      return null
    }
    function PlanningConsumer() {
      useEvacuationPlan()
      return null
    }
    function ChatConsumer() {
      const risk = useRisk()
      const plan = useEvacuationPlan()
      const { community } = useCommunity()
      return <EvacuationChat risk={risk} plan={plan} community={community} />
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <CommunityProvider>
          <RiskProvider>
            <RiskScenarioProvider>
              <EvacuationProvider>
                <Consumer />
                <Consumer />
                <PlanningConsumer />
                <ChatConsumer />
              </EvacuationProvider>
            </RiskScenarioProvider>
          </RiskProvider>
        </CommunityProvider>,
      )
    })

    expect(useEnvironmentalDataMock).toHaveBeenCalledTimes(1)
    expect(selectedRisk).toBe(liveRisk)
    await act(async () => renderer?.unmount())
  })
})
