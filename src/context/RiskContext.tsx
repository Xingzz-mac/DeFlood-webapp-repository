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
import {
  fetchHistoricalBaseline,
  historicalErrorBaseline,
  monthFromForecastDate,
  readHistoricalBaseline,
} from '../services/historicalGlofas'
import { calculateRisk } from '../services/riskEngine'
import { calculateRiskWithCache } from '../services/riskCache'
import type { HistoricalBaseline, RiskResult } from '../services/riskTypes'
import type { EnvironmentalData } from '../services/types'

export interface RiskContextValue extends RiskResult {
  environmentalData: EnvironmentalData | null
  loading: boolean
  error: string | null
  refresh: () => void
}

const RiskContext = createContext<RiskContextValue | null>(null)

export function RiskProvider({ children }: { children: ReactNode }) {
  const { community } = useCommunity()
  const environmental = useEnvironmentalData(community.latitude, community.longitude)
  const forecastDate = environmental.data?.river.days[0]?.date ?? null
  const calendarMonth = forecastDate ? monthFromForecastDate(forecastDate) : null
  const [historicalBaseline, setHistoricalBaseline] = useState<HistoricalBaseline | null>(null)
  const [historicalLoading, setHistoricalLoading] = useState(false)
  const historicalSequenceRef = useRef(0)

  useEffect(() => {
    const sequence = ++historicalSequenceRef.current
    if (!forecastDate || calendarMonth === null || !environmental.data) {
      setHistoricalBaseline(null)
      setHistoricalLoading(false)
      return
    }

    const cached = readHistoricalBaseline(
      community.latitude,
      community.longitude,
      calendarMonth,
    )
    if (cached) {
      setHistoricalBaseline(cached)
      setHistoricalLoading(false)
      return
    }

    setHistoricalBaseline(null)
    setHistoricalLoading(true)
    fetchHistoricalBaseline(community.latitude, community.longitude, forecastDate)
      .then(baseline => {
        if (sequence !== historicalSequenceRef.current) return
        setHistoricalBaseline(baseline)
        setHistoricalLoading(false)
      })
      .catch(reason => {
        if (sequence !== historicalSequenceRef.current) return
        const message = reason instanceof Error ? reason.message : 'Historical GloFAS request failed'
        setHistoricalBaseline(historicalErrorBaseline(
          community.latitude,
          community.longitude,
          calendarMonth,
          message,
        ))
        setHistoricalLoading(false)
      })

    return () => {
      historicalSequenceRef.current += 1
    }
  }, [
    calendarMonth,
    community.latitude,
    community.longitude,
    environmental.data?.fingerprint,
    forecastDate,
  ])

  const risk = useMemo(() => {
    const input = {
      environmental: environmental.data,
      historicalBaseline,
    }
    return historicalLoading
      ? calculateRisk(input)
      : calculateRiskWithCache(input)
  }, [environmental.data, historicalBaseline, historicalLoading])

  const historicalError = historicalBaseline?.status === 'error'
    ? historicalBaseline.error
    : null
  const value: RiskContextValue = {
    ...risk,
    environmentalData: environmental.data,
    loading: environmental.loading || historicalLoading,
    error: environmental.error ?? historicalError,
    refresh: environmental.refresh,
  }

  return <RiskContext.Provider value={value}>{children}</RiskContext.Provider>
}

export function useRisk(): RiskContextValue {
  const context = useContext(RiskContext)
  if (!context) throw new Error('useRisk must be used within RiskProvider')
  return context
}
