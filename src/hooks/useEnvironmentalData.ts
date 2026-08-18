import { useState, useEffect, useCallback, useRef } from 'react'
import type { EnvironmentalData } from '../services/types'
import {
  fetchEnvironmentalData,
  getCachedEnvData,
  loadCachedOrStale,
} from '../services/environmentalData'
import { coordFingerprint } from '../services/cache'

interface UseEnvironmentalDataResult {
  data: EnvironmentalData | null
  loading: boolean
  error: string | null
  stale: boolean
  refresh: () => void
}

export function useEnvironmentalData(
  latitude: number,
  longitude: number,
): UseEnvironmentalDataResult {
  const coordsKey = coordFingerprint(latitude, longitude)

  const [data, setData] = useState<EnvironmentalData | null>(() =>
    getCachedEnvData(latitude, longitude),
  )
  const [loading, setLoading] = useState<boolean>(
    () => getCachedEnvData(latitude, longitude) === null,
  )
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<boolean>(false)

  const seqRef = useRef(0)
  const lastKeyRef = useRef<string>('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const doFetch = useCallback(
    (lat: number, lon: number) => {
      const seq = ++seqRef.current
      setLoading(true)
      setError(null)

      fetchEnvironmentalData(lat, lon)
        .then(result => {
          if (!mountedRef.current || seq !== seqRef.current) return
          setData(result)
          setStale(false)
          setLoading(false)
        })
        .catch(err => {
          if (!mountedRef.current || seq !== seqRef.current) return
          const cached = loadCachedOrStale(lat, lon)
          if (cached) {
            setData({ ...cached, stale: true })
            setStale(true)
          }
          setError(err instanceof Error ? err.message : 'Failed to fetch environmental data')
          setLoading(false)
        })
    },
    [],
  )

  useEffect(() => {
    if (lastKeyRef.current === coordsKey) return
    lastKeyRef.current = coordsKey
    doFetch(latitude, longitude)
  }, [coordsKey, latitude, longitude, doFetch])

  const refresh = useCallback(() => {
    doFetch(latitude, longitude)
  }, [latitude, longitude, doFetch])

  return { data, loading, error, stale, refresh }
}
