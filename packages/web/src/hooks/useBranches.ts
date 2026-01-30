import { useState, useEffect, useCallback } from 'react'
import {
  getBranches,
  compareBranches,
  type BranchInfo,
  type BranchList,
  type CompareBranchesResult,
} from '../lib/api'

export type { BranchInfo }

export function useBranches(repoPath?: string) {
  const [data, setData] = useState<BranchList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await getBranches(repoPath)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  return { data, loading, error, refetch: fetchBranches }
}

export interface UseCompareBranchesOptions {
  useMergeBase?: boolean
}

export function useCompareBranches(
  base: string | null,
  head: string | null,
  repoPath?: string,
  options?: UseCompareBranchesOptions
) {
  const { useMergeBase = true } = options ?? {}
  const [data, setData] = useState<CompareBranchesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchComparison = useCallback(async () => {
    if (!base || !head) {
      setData(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const result = await compareBranches(base, head, repoPath, { useMergeBase })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [base, head, repoPath, useMergeBase])

  useEffect(() => {
    fetchComparison()
  }, [fetchComparison])

  return { data, loading, error, refetch: fetchComparison }
}
