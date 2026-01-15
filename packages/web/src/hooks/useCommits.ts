import { useState, useEffect, useCallback, useRef } from 'react'

interface CommitInfo {
  sha: string
  shortSha: string
  message: string
  author: string
  authorEmail: string
  date: string
  stats: {
    additions: number
    deletions: number
    files: number
  }
}

interface CommitsResponse {
  commits: CommitInfo[]
  total: number
  page: number
  totalPages: number
}

export function useCommits(initialPage = 1, limit = 20) {
  const [data, setData] = useState<CommitsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(initialPage)
  const totalPagesRef = useRef(1)

  const fetchCommits = useCallback(async (pageNum: number) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/commits?page=${pageNum}&limit=${limit}`)

      if (!response.ok) {
        throw new Error('Failed to fetch commits')
      }

      const result = await response.json()
      totalPagesRef.current = result.totalPages
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchCommits(page)
  }, [fetchCommits, page])

  const goToPage = useCallback((pageNum: number) => {
    setPage(pageNum)
  }, [])

  const nextPage = useCallback(() => {
    setPage(prev => prev < totalPagesRef.current ? prev + 1 : prev)
  }, [])

  const prevPage = useCallback(() => {
    setPage(prev => prev > 1 ? prev - 1 : prev)
  }, [])

  return {
    data,
    loading,
    error,
    page,
    goToPage,
    nextPage,
    prevPage,
    refetch: () => fetchCommits(page),
  }
}
