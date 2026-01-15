import { useState, useEffect, useCallback, useRef } from 'react'
import { getCommits, type CommitInfo, type CommitHistory } from '../lib/api'

export type { CommitInfo }

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

      const result = await getCommits(pageNum, limit)
      const totalPages = Math.ceil(result.total / limit)
      totalPagesRef.current = totalPages

      setData({
        commits: result.commits,
        total: result.total,
        page: pageNum,
        totalPages,
      })
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
