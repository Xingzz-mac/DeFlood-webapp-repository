import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { RiskViewProvider, useLiveRisk, type RiskContextValue } from './RiskContext'
import {
  resolveRiskScenario,
  type RiskScenario,
} from '../services/riskScenarios'

interface RiskScenarioContextValue {
  enabled: boolean
  activeScenario: RiskScenario
  demoActive: boolean
  setScenario: (scenario: RiskScenario) => void
}

const RiskScenarioContext = createContext<RiskScenarioContextValue | null>(null)

interface RiskScenarioStateProviderProps {
  children: ReactNode
  liveRisk: RiskContextValue
  developmentEnabled: boolean
}

export function RiskScenarioStateProvider({
  children,
  liveRisk,
  developmentEnabled,
}: RiskScenarioStateProviderProps) {
  const [requestedScenario, setRequestedScenario] = useState<RiskScenario>('live')
  const activeScenario = developmentEnabled ? requestedScenario : 'live'
  const selectedRisk = resolveRiskScenario(liveRisk, activeScenario, developmentEnabled)
  const selectedValue: RiskContextValue = selectedRisk === liveRisk
    ? liveRisk
    : {
        ...liveRisk,
        ...selectedRisk,
        loading: false,
        error: null,
      }
  const control = useMemo<RiskScenarioContextValue>(() => ({
    enabled: developmentEnabled,
    activeScenario,
    demoActive: activeScenario !== 'live',
    setScenario: scenario => {
      if (developmentEnabled) setRequestedScenario(scenario)
    },
  }), [activeScenario, developmentEnabled])

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
      developmentEnabled={import.meta.env.DEV}
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
