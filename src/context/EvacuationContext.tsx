import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useCommunity } from './CommunityContext'
import { useRisk } from './RiskContext'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import type { EvacuationPlanResult } from '../services/evacuationTypes'

const EvacuationContext = createContext<EvacuationPlanResult | null>(null)

export function EvacuationProvider({ children }: { children: ReactNode }) {
  const { community } = useCommunity()
  const risk = useRisk()
  const plan = useMemo(
    () => calculateEvacuationPlan(community, risk),
    [community, risk],
  )
  return <EvacuationContext.Provider value={plan}>{children}</EvacuationContext.Provider>
}

export function useEvacuationPlan(): EvacuationPlanResult {
  const context = useContext(EvacuationContext)
  if (!context) throw new Error('useEvacuationPlan must be used within EvacuationProvider')
  return context
}
