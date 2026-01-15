import { useState, useCallback } from 'react'
import { fetchFromRemote, type FetchResult } from '../lib/api'

export function useFetch(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FetchResult | null>(null)

  const performFetch = useCallback(async (remote = 'origin') => {
    try {
      setLoading(true)
      setError(null)

      const fetchResult = await fetchFromRemote(remote)
      setResult(fetchResult)
      onSuccess?.()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    } finally {
      setLoading(false)
    }
  }, [onSuccess])

  return { loading, error, result, performFetch }
}
