import { ArrowUpDown, X, Filter } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { DiffFilters, SortBy, SortOrder, FileStatus } from '../hooks/useDiffFilters'

interface DiffToolbarProps {
  filters: DiffFilters
  setFilters: (update: Partial<DiffFilters>) => void
  resetFilters: () => void
  toggleExtension: (ext: string) => void
  toggleStatus: (status: FileStatus) => void
  hasActiveFilters: boolean
  availableExtensions: string[]
  totalCount: number
  filteredCount: number
}

const SORT_OPTIONS: { value: `${SortBy}-${SortOrder}`; label: string }[] = [
  { value: 'modified-desc', label: 'Modified (newest)' },
  { value: 'modified-asc', label: 'Modified (oldest)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'extension-asc', label: 'Extension' },
  { value: 'status-asc', label: 'Status' },
  { value: 'changes-desc', label: 'Changes (+/-)' },
  { value: 'changes-asc', label: 'Changes (-/+)' },
]

const STATUS_OPTIONS: { value: FileStatus; label: string; color: string }[] = [
  { value: 'added', label: 'A', color: 'bg-green-500/20 text-green-600 hover:bg-green-500/30' },
  { value: 'modified', label: 'M', color: 'bg-amber-500/20 text-amber-600 hover:bg-amber-500/30' },
  { value: 'deleted', label: 'D', color: 'bg-red-500/20 text-red-600 hover:bg-red-500/30' },
  { value: 'renamed', label: 'R', color: 'bg-blue-500/20 text-blue-600 hover:bg-blue-500/30' },
]

export function DiffToolbar({
  filters,
  setFilters,
  resetFilters,
  toggleExtension,
  toggleStatus,
  hasActiveFilters,
  availableExtensions,
  totalCount,
  filteredCount,
}: DiffToolbarProps) {
  const sortValue = `${filters.sortBy}-${filters.sortOrder}` as const

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('-') as [SortBy, SortOrder]
    setFilters({ sortBy, sortOrder })
  }

  const showingFiltered = hasActiveFilters && filteredCount !== totalCount

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-background border border-border rounded-lg">
      {/* Sort dropdown */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <Select value={sortValue} onValueChange={handleSortChange}>
          <SelectTrigger size="sm" className="h-8 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Status filters */}
      <div className="flex items-center gap-1">
        <Filter className="h-4 w-4 text-muted-foreground mr-1" />
        {STATUS_OPTIONS.map((status) => {
          const isActive = filters.filterStatuses.includes(status.value)
          return (
            <button
              key={status.value}
              onClick={() => toggleStatus(status.value)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                isActive
                  ? status.color
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {status.label}
            </button>
          )
        })}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Extension filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {availableExtensions.slice(0, 6).map((ext) => {
          const isActive = filters.filterExtensions.includes(ext)
          return (
            <button
              key={ext}
              onClick={() => toggleExtension(ext)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                isActive
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {ext}
            </button>
          )
        })}
        {availableExtensions.length > 6 && (
          <span className="text-xs text-muted-foreground">
            +{availableExtensions.length - 6} more
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* File count */}
      {showingFiltered ? (
        <span className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} files
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'file' : 'files'}
        </span>
      )}

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 px-2">
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}
