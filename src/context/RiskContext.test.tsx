import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityProvider } from './CommunityContext'
import { RiskProvider, useRisk } from './RiskContext'

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

  it('creates one shared environmental-data hook instance for multiple consumers', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    function Consumer() {
      useRisk()
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <CommunityProvider>
          <RiskProvider>
            <Consumer />
            <Consumer />
          </RiskProvider>
        </CommunityProvider>,
      )
    })

    expect(useEnvironmentalDataMock).toHaveBeenCalledTimes(1)
    await act(async () => renderer?.unmount())
  })
})
