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
    (lat: number, lon: number, key: string, coordinateChange: boolean) => {
      const seq = ++seqRef.current
      if (coordinateChange) {
        const cached = getCachedEnvData(lat, lon)
        setData(cached)
        setStale(cached?.stale ?? false)
      }
      setLoading(true)
      setError(null)

      fetchEnvironmentalData(lat, lon)
        .then(result => {
          if (!mountedRef.current || seq !== seqRef.current || result.fingerprint !== key) return
          setData(result)
          setStale(result.stale)
          setError(
            result.status === 'error'
              ? 'Environmental sources are currently unavailable.'
              : result.status === 'partial'
                ? 'Some environmental sources are incomplete, cached, or unavailable.'
                : null,
          )
          setLoading(false)
        })
        .catch(err => {
          if (!mountedRef.current || seq !== seqRef.current) return
          const cached = loadCachedOrStale(lat, lon)
          if (cached?.fingerprint === key) {
            setData({ ...cached, stale: true })
            setStale(true)
          } else {
            setData(null)
            setStale(false)
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
    doFetch(latitude, longitude, coordsKey, true)
  }, [coordsKey, latitude, longitude, doFetch])

  const refresh = useCallback(() => {
    doFetch(latitude, longitude, coordsKey, false)
  }, [latitude, longitude, coordsKey, doFetch])

  const currentData = data?.fingerprint === coordsKey ? data : null
  return {
    data: currentData,
    loading,
    error,
    stale: currentData ? stale : false,
    refresh,
  }
}
