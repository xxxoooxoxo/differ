import { useState, useEffect, useCallback, useRef } from 'react'

interface FileDiffInfo {
  path: string
  oldPath?: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  additions: number
  deletions: number
  oldContent?: string
  newContent?: string
  patch?: string
}

interface DiffResult {
  files: FileDiffInfo[]
  stats: {
    additions: number
    deletions: number
    files: number
  }
}

export function useGitDiff() {
  const [data, setData] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDiff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/diff/current')

      if (!response.ok) {
        throw new Error('Failed to fetch diff')
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
    fetchDiff()
  }, [fetchDiff])

  return { data, loading, error, refetch: fetchDiff }
}

export function useCommitDiff(sha: string | null) {
  const [data, setData] = useState<{ commit: any; files: FileDiffInfo[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!sha) {
      setData(null)
      return
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const fetchCommitDiff = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/commits/${sha}/diff`, {
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch commit diff')
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchCommitDiff()

    return () => {
      abortController.abort()
    }
  }, [sha])

  const refetch = useCallback(() => {
    if (!sha) return
    // Trigger re-fetch by creating new effect cycle
    setData(null)
  }, [sha])

  return { data, loading, error, refetch }
}
