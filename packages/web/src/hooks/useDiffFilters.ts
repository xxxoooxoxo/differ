import { useState, useEffect, useCallback, useMemo } from 'react'
import type { FileDiffInfo } from '../lib/api'

export type SortBy = 'modified' | 'name' | 'extension' | 'status' | 'changes'
export type SortOrder = 'asc' | 'desc'
export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'

export interface DiffFilters {
  sortBy: SortBy
  sortOrder: SortOrder
  filterExtensions: string[]
  filterStatuses: FileStatus[]
}

const STORAGE_KEY = 'diffy-filters'

const defaultFilters: DiffFilters = {
  sortBy: 'modified',
  sortOrder: 'desc',
  filterExtensions: [],
  filterStatuses: [],
}

function loadFilters(): DiffFilters {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaultFilters, ...parsed }
    }
  } catch {
    // Ignore parse errors
  }
  return defaultFilters
}

function saveFilters(filters: DiffFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // Ignore storage errors
  }
}

function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.')
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (lastDot > lastSlash) {
    return path.slice(lastDot).toLowerCase()
  }
  return ''
}

function applyFiltersAndSort(files: FileDiffInfo[], filters: DiffFilters): FileDiffInfo[] {
  let result = [...files]

  // Filter by extension
  if (filters.filterExtensions.length > 0) {
    result = result.filter((f) =>
      filters.filterExtensions.some((ext) => f.path.toLowerCase().endsWith(ext.toLowerCase()))
    )
  }

  // Filter by status
  if (filters.filterStatuses.length > 0) {
    result = result.filter((f) => filters.filterStatuses.includes(f.status))
  }

  // Sort
  result.sort((a, b) => {
    let cmp = 0
    switch (filters.sortBy) {
      case 'modified':
        cmp = (a.modifiedTime ?? 0) - (b.modifiedTime ?? 0)
        break
      case 'name':
        cmp = a.path.localeCompare(b.path)
        break
      case 'extension':
        cmp = getExtension(a.path).localeCompare(getExtension(b.path))
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
      case 'changes':
        cmp = a.additions + a.deletions - (b.additions + b.deletions)
        break
    }
    return filters.sortOrder === 'desc' ? -cmp : cmp
  })

  return result
}

export function useDiffFilters(files: FileDiffInfo[]) {
  const [filters, setFiltersState] = useState<DiffFilters>(loadFilters)

  // Save to localStorage when filters change
  useEffect(() => {
    saveFilters(filters)
  }, [filters])

  const setFilters = useCallback((update: Partial<DiffFilters> | ((prev: DiffFilters) => DiffFilters)) => {
    setFiltersState((prev) => {
      const newFilters = typeof update === 'function' ? update(prev) : { ...prev, ...update }
      return newFilters
    })
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters)
  }, [])

  const toggleExtension = useCallback((ext: string) => {
    setFiltersState((prev) => {
      const exists = prev.filterExtensions.includes(ext)
      return {
        ...prev,
        filterExtensions: exists
          ? prev.filterExtensions.filter((e) => e !== ext)
          : [...prev.filterExtensions, ext],
      }
    })
  }, [])

  const toggleStatus = useCallback((status: FileStatus) => {
    setFiltersState((prev) => {
      const exists = prev.filterStatuses.includes(status)
      return {
        ...prev,
        filterStatuses: exists
          ? prev.filterStatuses.filter((s) => s !== status)
          : [...prev.filterStatuses, status],
      }
    })
  }, [])

  const filteredFiles = useMemo(() => applyFiltersAndSort(files, filters), [files, filters])

  const hasActiveFilters = filters.filterExtensions.length > 0 || filters.filterStatuses.length > 0

  // Extract unique extensions from all files
  const availableExtensions = useMemo(() => {
    const exts = new Set<string>()
    for (const file of files) {
      const ext = getExtension(file.path)
      if (ext) exts.add(ext)
    }
    return Array.from(exts).sort()
  }, [files])

  return {
    filters,
    setFilters,
    resetFilters,
    toggleExtension,
    toggleStatus,
    filteredFiles,
    hasActiveFilters,
    availableExtensions,
  }
}
