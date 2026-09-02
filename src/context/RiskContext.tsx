import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useCommunity } from './CommunityContext'
import { useEnvironmentalData } from '../hooks/useEnvironmentalData'
import { resolveRiverEvidence, type RiverEvidenceSelection } from '../services/riverEvidence'
import { calculateRisk } from '../services/riskEngine'
import { calculateRiskWithCache } from '../services/riskCache'
import { RISK_RECALCULATION_INTERVAL_MS } from '../services/riskConfig'
import type { RiskResult } from '../services/riskTypes'
import type { EnvironmentalData } from '../services/types'

export interface RiskContextValue extends RiskResult {
  assessmentProvenance?: 'LIVE' | 'DEMO'
  environmentalData: EnvironmentalData | null
  loading: boolean
  error: string | null
  refresh: () => void
}

const RiskContext = createContext<RiskContextValue | null>(null)
const RiskViewContext = createContext<RiskContextValue | null>(null)

export function RiskProvider({ children }: { children: ReactNode }) {
  const { community } = useCommunity()
  const environmental = useEnvironmentalData(community.latitude, community.longitude)
  const [riverSelection, setRiverSelection] = useState<RiverEvidenceSelection | null>(null)
  const [riverSelectionLoading, setRiverSelectionLoading] = useState(false)
  const [riskClockTick, setRiskClockTick] = useState(0)
  const riverSequenceRef = useRef(0)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRiskClockTick(tick => tick + 1)
    }, RISK_RECALCULATION_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const sequence = ++riverSequenceRef.current
    if (!environmental.data) {
      setRiverSelection(null)
      setRiverSelectionLoading(false)
      return
    }

    const controller = new AbortController()
    setRiverSelection(null)
    setRiverSelectionLoading(true)
    resolveRiverEvidence(
      { latitude: community.latitude, longitude: community.longitude },
      environmental.data.river,
      controller.signal,
    )
      .then(selection => {
        if (sequence !== riverSequenceRef.current) return
        setRiverSelection(selection)
        setRiverSelectionLoading(false)
      })
      .catch(() => {
        if (sequence !== riverSequenceRef.current) return
        setRiverSelection(null)
        setRiverSelectionLoading(false)
      })

    return () => {
      controller.abort()
      riverSequenceRef.current += 1
    }
  }, [
    community.latitude,
    community.longitude,
    environmental.data?.fingerprint,
    environmental.data?.retrievedAt,
  ])

  const alignedEnvironmental = useMemo(() => {
    if (!environmental.data || !riverSelection) return environmental.data
    const selectedCommunity = riverSelection.river.communityCoordinate
    if (
      selectedCommunity.latitude !== community.latitude
      || selectedCommunity.longitude !== community.longitude
    ) return environmental.data
    return { ...environmental.data, river: riverSelection.river }
  }, [community.latitude, community.longitude, environmental.data, riverSelection])
  const historicalBaseline = riverSelection?.historicalBaseline ?? null

  const risk = useMemo(() => {
    void riskClockTick
    const input = {
      environmental: alignedEnvironmental,
      historicalBaseline,
      nowMs: Date.now(),
    }
    return riverSelectionLoading
      ? calculateRisk(input)
      : calculateRiskWithCache(input)
  }, [alignedEnvironmental, historicalBaseline, riverSelectionLoading, riskClockTick])

  const historicalError = historicalBaseline?.status === 'error'
    ? historicalBaseline.error
    : null
  const value: RiskContextValue = {
    ...risk,
    assessmentProvenance: 'LIVE',
    environmentalData: alignedEnvironmental,
    loading: environmental.loading || riverSelectionLoading,
    error: environmental.error ?? historicalError,
    refresh: environmental.refresh,
  }

  return <RiskContext.Provider value={value}>{children}</RiskContext.Provider>
}

export function useRisk(): RiskContextValue {
  const selected = useContext(RiskViewContext)
  const live = useContext(RiskContext)
  const context = selected ?? live
  if (!context) throw new Error('useRisk must be used within RiskProvider')
  return context
}

export function useLiveRisk(): RiskContextValue {
  const context = useContext(RiskContext)
  if (!context) throw new Error('useLiveRisk must be used within RiskProvider')
  return context
}

export function RiskViewProvider({
  value,
  children,
}: {
  value: RiskContextValue
  children: ReactNode
}) {
  return <RiskViewContext.Provider value={value}>{children}</RiskViewContext.Provider>
}
