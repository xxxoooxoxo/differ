import { useState, useEffect, useCallback } from 'react'

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isCurrent: boolean
  isActive: boolean
  behindMain: number
  aheadOfMain: number
  lastActivity: string
}

interface WorktreesResponse {
  worktrees: WorktreeInfo[]
  current: string
  activePath: string
  mainBranch: string
}

export function useWorktrees(onlyBehind = false) {
  const [data, setData] = useState<WorktreesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWorktrees = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (onlyBehind) params.set('onlyBehind', 'true')

      const response = await fetch(`/api/worktrees?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch worktrees')
      }

      const result = await response.json()
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

      const response = await fetch('/api/worktrees/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to switch worktree')
      }

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
