import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { RiskViewProvider, useLiveRisk, type RiskContextValue } from './RiskContext'
import {
  DEMO_SCENARIOS,
  type DemoScenarioDefinition,
  type RiskScenario,
} from '../services/demoScenarios'

interface RiskScenarioContextValue {
  enabled: boolean
  activeScenario: RiskScenario
  demoActive: boolean
  selectedDemo: DemoScenarioDefinition | null
  setScenario: (scenario: RiskScenario) => void
}

const RiskScenarioContext = createContext<RiskScenarioContextValue | null>(null)

interface RiskScenarioStateProviderProps {
  children: ReactNode
  liveRisk: RiskContextValue
  demoEnabled: boolean
}

export function RiskScenarioStateProvider({
  children,
  liveRisk,
  demoEnabled,
}: RiskScenarioStateProviderProps) {
  const [requestedScenario, setRequestedScenario] = useState<RiskScenario>('live')
  const activeScenario = demoEnabled ? requestedScenario : 'live'
  const selectedDemo = activeScenario === 'live' ? null : DEMO_SCENARIOS[activeScenario]
  const selectedValue: RiskContextValue = selectedDemo === null
    ? liveRisk
    : {
        ...liveRisk,
        ...selectedDemo.result,
        assessmentProvenance: 'DEMO',
        environmentalData: selectedDemo.environmentalData,
        loading: false,
        error: null,
        refresh: () => undefined,
      }
  const control = useMemo<RiskScenarioContextValue>(() => ({
    enabled: demoEnabled,
    activeScenario,
    demoActive: activeScenario !== 'live',
    selectedDemo,
    setScenario: scenario => {
      if (demoEnabled) setRequestedScenario(scenario)
    },
  }), [activeScenario, demoEnabled, selectedDemo])

  return (
    <RiskScenarioContext.Provider value={control}>
      <RiskViewProvider value={selectedValue}>{children}</RiskViewProvider>
    </RiskScenarioContext.Provider>
  )
}

export function RiskScenarioProvider({ children }: { children: ReactNode }) {
  const liveRisk = useLiveRisk()
  return (
    <RiskScenarioStateProvider
      liveRisk={liveRisk}
      demoEnabled
    >
      {children}
    </RiskScenarioStateProvider>
  )
}

export function useRiskScenario(): RiskScenarioContextValue {
  const context = useContext(RiskScenarioContext)
  if (!context) throw new Error('useRiskScenario must be used within RiskScenarioProvider')
  return context
}

export function useRiskScenarioOptional(): RiskScenarioContextValue {
  const context = useContext(RiskScenarioContext)
  return context ?? {
    enabled: false,
    activeScenario: 'live',
    demoActive: false,
    selectedDemo: null,
    setScenario: () => undefined,
  }
}
