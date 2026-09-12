import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DevelopmentScenarioSelector from './DevelopmentScenarioSelector'
import { DEMO_SCENARIO_BANNER } from '../services/demoScenarios'

const scenario = vi.hoisted(() => ({ enabled: true, demoActive: true, activeScenario: 'demo-high', setScenario: vi.fn() }))
vi.mock('../context/RiskScenarioContext', () => ({ useRiskScenario: () => scenario }))

describe('assessment mode role permissions', () => {
  afterEach(() => vi.clearAllMocks())
  it.each(['leader', 'mayor', 'assistant', 'ngo', 'government'] as const)('limits scenario editing for %s while preserving demo disclosure', async role => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<DevelopmentScenarioSelector role={role} />) })
    expect(JSON.stringify(renderer.toJSON())).toContain(DEMO_SCENARIO_BANNER)
    const selects = renderer.root.findAllByType('select')
    if (['leader', 'mayor', 'assistant'].includes(role)) {
      expect(selects).toHaveLength(1)
      await act(async () => selects[0].props.onChange({ target: { value: 'demo-low' } }))
      expect(scenario.setScenario).toHaveBeenCalledWith('demo-low')
    } else {
      expect(selects).toHaveLength(0)
      expect(JSON.stringify(renderer.toJSON())).toContain('Read-only')
      expect(JSON.stringify(renderer.toJSON())).toContain('Demo — HIGH')
      expect(scenario.setScenario).not.toHaveBeenCalled()
    }
    await act(async () => renderer.unmount())
  })
})
