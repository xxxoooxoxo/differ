import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getCurrentDiff,
  getCommitDiff as apiGetCommitDiff,
  type DiffResult,
  type CommitDiff,
  type FileDiffInfo,
} from '../lib/api'

export type { DiffResult, FileDiffInfo }

export function useGitDiff(repoPath?: string) {
  const [data, setData] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDiff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await getCurrentDiff(repoPath)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    fetchDiff()
  }, [fetchDiff])

  return { data, loading, error, refetch: fetchDiff }
}

export function useCommitDiff(sha: string | null, repoPath?: string) {
  const [data, setData] = useState<CommitDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentShaRef = useRef<string | null>(null)

  useEffect(() => {
    if (!sha) {
      setData(null)
      return
    }

    // Track current sha to ignore stale responses
    currentShaRef.current = sha

    const fetchCommitDiff = async () => {
      try {
        setLoading(true)
        setError(null)

        const result = await apiGetCommitDiff(sha, repoPath)

        // Only update if this is still the current request
        if (currentShaRef.current === sha) {
          setData(result)
        }
      } catch (err) {
        if (currentShaRef.current === sha) {
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      } finally {
        if (currentShaRef.current === sha) {
          setLoading(false)
        }
      }
    }

    fetchCommitDiff()

    return () => {
      currentShaRef.current = null
    }
  }, [sha, repoPath])

  const refetch = useCallback(() => {
    if (!sha) return
    // Trigger re-fetch by clearing data
    setData(null)
  }, [sha])

  return { data, loading, error, refetch }
}
