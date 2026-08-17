import { useState, useEffect, useCallback, useRef } from 'react'
import type { EnvironmentalData } from '../services/types'
import { fetchEnvironmentalData, getCachedEnvData, loadCachedOrStale } from '../services/environmentalData'

interface UseEnvironmentalDataResult {
  data: EnvironmentalData | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useEnvironmentalData(
  latitude: number,
  longitude: number,
): UseEnvironmentalDataResult {
  const [data, setData] = useState<EnvironmentalData | null>(() => getCachedEnvData())
  const [loading, setLoading] = useState<boolean>(() => getCachedEnvData() === null)
  const [error, setError] = useState<string | null>(null)
  const coordsKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`
  const lastFetchedKey = useRef<string>('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const doFetch = useCallback((lat: number, lon: number) => {
    setLoading(true)
    setError(null)
    fetchEnvironmentalData(lat, lon)
      .then(result => {
        if (!mountedRef.current) return
        setData(result)
        setLoading(false)
      })
      .catch(err => {
        if (!mountedRef.current) return
        const stale = loadCachedOrStale()
        if (stale) setData(stale)
        setError(err instanceof Error ? err.message : 'Failed to fetch environmental data')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (lastFetchedKey.current === coordsKey) return
    lastFetchedKey.current = coordsKey
    doFetch(latitude, longitude)
  }, [coordsKey, latitude, longitude, doFetch])

  const refresh = useCallback(() => {
    doFetch(latitude, longitude)
  }, [latitude, longitude, doFetch])

  return { data, loading, error, refresh }
}
