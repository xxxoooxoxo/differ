import { useState, useEffect, useCallback } from 'react'
import {
  getWorktrees,
  switchWorktree as apiSwitchWorktree,
  type WorktreeInfo,
  type WorktreesResponse,
} from '../lib/api'

export type { WorktreeInfo }

export function useWorktrees(onlyBehind = false) {
  const [data, setData] = useState<WorktreesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWorktrees = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await getWorktrees(onlyBehind)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [onlyBehind])

  const switchWorktree = useCallback(async (path: string) => {
    try {
      setSwitching(true)
      setError(null)

      await apiSwitchWorktree(path)

      // Refetch worktrees to update active state
      await fetchWorktrees()

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    } finally {
      setSwitching(false)
    }
  }, [fetchWorktrees])

  useEffect(() => {
    fetchWorktrees()
  }, [fetchWorktrees])

  return { data, loading, switching, error, refetch: fetchWorktrees, switchWorktree }
}
