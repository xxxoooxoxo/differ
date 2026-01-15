import { useState, useEffect, useCallback } from 'react'

interface BranchInfo {
  name: string
  current: boolean
  commit: string
}

interface BranchesResponse {
  branches: BranchInfo[]
  current: string
}

export function useBranches() {
  const [data, setData] = useState<BranchesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/branches')

      if (!response.ok) {
        throw new Error('Failed to fetch branches')
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBranches()
  }, [fetchBranches])

  return { data, loading, error, refetch: fetchBranches }
}

export function useCompareBranches(base: string | null, head: string | null) {
  const [data, setData] = useState<any>(null)
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

      const params = new URLSearchParams({ base, head })
      const response = await fetch(`/api/branches/compare?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to compare branches')
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [base, head])

  useEffect(() => {
    fetchComparison()
  }, [fetchComparison])

  return { data, loading, error, refetch: fetchComparison }
}
