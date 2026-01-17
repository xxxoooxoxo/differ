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
  const isInitialLoadRef = useRef(true)

  const fetchDiff = useCallback(
    async (silent = false) => {
      try {
        // Only show loading state on initial load, not on refetches
        if (!silent && isInitialLoadRef.current) {
          setLoading(true)
        }
        setError(null)

        const result = await getCurrentDiff(repoPath)
        setData(result)
        isInitialLoadRef.current = false
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [repoPath]
  )

  // Reset initial load flag when repoPath changes
  useEffect(() => {
    isInitialLoadRef.current = true
  }, [repoPath])

  useEffect(() => {
    fetchDiff()
  }, [fetchDiff])

  // Refetch silently without loading state
  const refetch = useCallback(() => fetchDiff(true), [fetchDiff])

  return { data, loading, error, refetch }
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
