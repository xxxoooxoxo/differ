import { useState, useEffect, useCallback } from 'react'
import {
  listPRs,
  getPRDiff,
  type PRInfo,
  type PRListResult,
  type PRDiff,
} from '../lib/api'

export type { PRInfo, PRListResult, PRDiff }

export function usePRList(
  options?: { state?: 'open' | 'closed' | 'all' },
  repoPath?: string
) {
  const [data, setData] = useState<PRListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPRs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await listPRs(options, repoPath)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [options?.state, repoPath])

  useEffect(() => {
    fetchPRs()
  }, [fetchPRs])

  return { data, loading, error, refetch: fetchPRs }
}

export function usePRDiff(prNumber: number | null, repoPath?: string) {
  const [data, setData] = useState<PRDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDiff = useCallback(async () => {
    if (prNumber === null) {
      setData(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const result = await getPRDiff(prNumber, repoPath)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [prNumber, repoPath])

  useEffect(() => {
    fetchDiff()
  }, [fetchDiff])

  return { data, loading, error, refetch: fetchDiff }
}
