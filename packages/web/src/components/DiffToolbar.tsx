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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover'
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
  visible?: boolean
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

const STATUS_OPTIONS: { value: FileStatus; label: string; fullLabel: string; color: string; activeColor: string }[] = [
  { value: 'added', label: 'A', fullLabel: 'Added', color: 'text-green-600', activeColor: 'bg-green-500/20 text-green-600 border-green-500/50' },
  { value: 'modified', label: 'M', fullLabel: 'Modified', color: 'text-amber-600', activeColor: 'bg-amber-500/20 text-amber-600 border-amber-500/50' },
  { value: 'deleted', label: 'D', fullLabel: 'Deleted', color: 'text-red-600', activeColor: 'bg-red-500/20 text-red-600 border-red-500/50' },
  { value: 'renamed', label: 'R', fullLabel: 'Renamed', color: 'text-blue-600', activeColor: 'bg-blue-500/20 text-blue-600 border-blue-500/50' },
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
  visible = true,
}: DiffToolbarProps) {
  const sortValue = `${filters.sortBy}-${filters.sortOrder}` as const

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split('-') as [SortBy, SortOrder]
    setFilters({ sortBy, sortOrder })
  }

  const showingFiltered = hasActiveFilters && filteredCount !== totalCount

  // Calculate active filter count
  const activeFilterCount = filters.filterStatuses.length + filters.filterExtensions.length

  // Extensions shown inline vs in popover
  const MAX_INLINE_EXTENSIONS = 6
  const inlineExtensions = availableExtensions.slice(0, MAX_INLINE_EXTENSIONS)
  const overflowExtensions = availableExtensions.slice(MAX_INLINE_EXTENSIONS)

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-3 bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg transition-all duration-200 ease-out max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-hide ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
        }`}
      >
        {/* Sort dropdown */}
        <div className="flex items-center gap-2 shrink-0">
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

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Status filters with tooltips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="absolute -top-2 -right-2 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center bg-primary text-primary-foreground"
              >
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <ToggleGroup
            type="multiple"
            value={filters.filterStatuses}
            onValueChange={(value) => setFilters({ filterStatuses: value as FileStatus[] })}
            className="gap-0"
          >
            {STATUS_OPTIONS.map((status) => {
              const isActive = filters.filterStatuses.includes(status.value)
              return (
                <Tooltip key={status.value}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={status.value}
                      className={`px-2 py-1 h-7 text-xs font-medium border transition-colors ${
                        isActive
                          ? status.activeColor
                          : `bg-muted/50 text-muted-foreground hover:bg-muted border-transparent`
                      }`}
                    >
                      {status.label}
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    {status.fullLabel} files
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </ToggleGroup>
        </div>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Extension filters */}
        <div className="flex items-center gap-1 shrink-0">
          {inlineExtensions.map((ext) => {
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
          {overflowExtensions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">
                  +{overflowExtensions.length} more
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                sideOffset={8}
                className="w-auto max-w-[280px] p-2"
              >
                <div className="grid grid-cols-3 gap-1">
                  {availableExtensions.map((ext) => {
                    const isActive = filters.filterExtensions.includes(ext)
                    return (
                      <button
                        key={ext}
                        onClick={() => toggleExtension(ext)}
                        className={`px-2 py-1.5 text-xs font-mono rounded transition-colors text-center ${
                          isActive
                            ? 'bg-primary/20 text-primary hover:bg-primary/30'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {ext}
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* File count */}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {showingFiltered
            ? `${filteredCount}/${totalCount}`
            : `${totalCount} ${totalCount === 1 ? 'file' : 'files'}`}
        </span>

        {/* Keyboard shortcut hint */}
        <Tooltip>
          <TooltipTrigger asChild>
            <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-mono text-muted-foreground bg-muted rounded border border-border shrink-0">
              F
            </kbd>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            Toggle filter bar
          </TooltipContent>
        </Tooltip>

        {/* Clear filters - always rendered to prevent layout shift */}
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className={`h-8 px-2 transition-opacity shrink-0 ${hasActiveFilters ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </TooltipProvider>
  )
}
