import { useState, useEffect, useCallback } from 'react'
import { getRemoteInfo, type RemoteInfo } from '../lib/api'

export type { RemoteInfo }

export function useRemoteUrl() {
  const [remote, setRemote] = useState<RemoteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRemote = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await getRemoteInfo()
      setRemote(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRemote()
  }, [fetchRemote])

  return { remote, loading, error, refetch: fetchRemote }
}
