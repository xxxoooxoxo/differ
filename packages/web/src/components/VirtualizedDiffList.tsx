import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle, memo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DiffViewer } from './DiffViewer'
import { Button } from './ui/button'
import { ChevronsUpDown } from 'lucide-react'
import type { DiffStyle } from './Header'

interface FileDiffInfo {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  additions: number
  deletions: number
  oldContent?: string
  newContent?: string
  patch?: string
  isLarge?: boolean
}

interface VirtualizedDiffListProps {
  files: FileDiffInfo[]
  diffStyle: DiffStyle
  scrollContainerRef: React.RefObject<HTMLElement | null>
  focusedIndex?: number | null
  isVimActive?: boolean
}

export interface VirtualizedDiffListHandle {
  scrollToFile: (path: string) => void
  scrollToIndex: (index: number) => void
  expandAll: () => void
  collapseAll: () => void
  isAllExpanded: () => boolean
  isExpanded: (path: string) => boolean
  toggleFile: (path: string, expanded: boolean) => void
}

function estimateItemHeight(file: FileDiffInfo, expanded: boolean): number {
  if (!expanded) return 44 // Collapsed: header only (measured)
  if (file.isLarge) return 200 // Header + placeholder
  const lines = Math.max(file.additions + file.deletions, 5)
  return 44 + Math.min(lines * 20, 600) // Header + content (capped)
}

interface DiffItemWrapperProps {
  file: FileDiffInfo
  diffStyle: DiffStyle
  isExpanded: boolean
  isFocused: boolean
  virtualItem: { index: number; start: number }
  measureElement: (node: HTMLElement | null) => void
  onToggleExpanded: (path: string, expanded: boolean) => void
}

const DiffItemWrapper = memo(function DiffItemWrapper({
  file,
  diffStyle,
  isExpanded,
  isFocused,
  virtualItem,
  measureElement,
  onToggleExpanded,
}: DiffItemWrapperProps) {
  return (
    <div
      ref={measureElement}
      data-index={virtualItem.index}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${virtualItem.start}px)`,
        willChange: 'transform',
      }}
    >
      <DiffViewer
        file={file}
        diffStyle={diffStyle}
        expanded={isExpanded}
        isFocused={isFocused}
        onToggleExpanded={(expanded) => onToggleExpanded(file.path, expanded)}
      />
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.file.path === nextProps.file.path &&
    prevProps.file.patch === nextProps.file.patch &&
    prevProps.file.status === nextProps.file.status &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.diffStyle === nextProps.diffStyle &&
    prevProps.virtualItem.start === nextProps.virtualItem.start
  )
})

export const VirtualizedDiffList = memo(forwardRef<VirtualizedDiffListHandle, VirtualizedDiffListProps>(
  function VirtualizedDiffList({ files, diffStyle, scrollContainerRef, focusedIndex, isVimActive }, ref) {
    const pathToIndex = useRef<Map<string, number>>(new Map())
    // Track which files are expanded (default: all expanded)
    const [expandedState, setExpandedState] = useState<Map<string, boolean>>(() => new Map())
    // Track files that user has explicitly toggled
    const userToggledRef = useRef<Set<string>>(new Set())
    // Track previous file paths to detect actual file list changes
    const prevFilePathsRef = useRef<string[]>([])
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      pathToIndex.current.clear()
      files.forEach((file, index) => {
        pathToIndex.current.set(file.path, index)
      })
      // Only reset user toggle tracking when file paths actually change
      const currentPaths = files.map(f => f.path)
      const prevPaths = prevFilePathsRef.current
      const pathsChanged = currentPaths.length !== prevPaths.length ||
        currentPaths.some((p, i) => p !== prevPaths[i])
      if (pathsChanged) {
        userToggledRef.current.clear()
        prevFilePathsRef.current = currentPaths
        // Start all files expanded when file list changes
        setExpandedState(new Map(files.map(f => [f.path, true])))
      }
    }, [files])

    // Get expansion state for a file (expanded by default)
    const getIsExpanded = useCallback((path: string) => {
      return expandedState.get(path) ?? true
    }, [expandedState])

    const virtualizer = useVirtualizer({
      count: files.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index) => estimateItemHeight(files[index], getIsExpanded(files[index].path)),
      overscan: 8,
      gap: 16,
    })

    const expandAll = useCallback(() => {
      files.forEach(f => userToggledRef.current.add(f.path))
      setExpandedState(new Map(files.map(f => [f.path, true])))
    }, [files])

    const collapseAll = useCallback(() => {
      files.forEach(f => userToggledRef.current.add(f.path))
      setExpandedState(new Map(files.map(f => [f.path, false])))
    }, [files])

    const isAllExpanded = useCallback(() => {
      if (files.length === 0) return false
      return files.every(f => expandedState.get(f.path) ?? true)
    }, [files, expandedState])

    const handleToggleExpanded = useCallback((path: string, expanded: boolean) => {
      // Mark as user-toggled to prevent auto-expand from overriding
      userToggledRef.current.add(path)
      setExpandedState(prev => {
        const next = new Map(prev)
        next.set(path, expanded)
        return next
      })
    }, [])

    const measureElement = useCallback((node: HTMLElement | null) => {
      if (node) {
        virtualizer.measureElement(node)
      }
    }, [virtualizer])

    useImperativeHandle(ref, () => ({
      scrollToFile: (path: string) => {
        const index = pathToIndex.current.get(path)
        if (index !== undefined) {
          virtualizer.scrollToIndex(index, {
            align: 'start',
            behavior: 'auto',
          })
        }
      },
      scrollToIndex: (index: number) => {
        if (index >= 0 && index < files.length) {
          virtualizer.scrollToIndex(index, {
            align: 'start',
            behavior: 'auto',
          })
        }
      },
      expandAll,
      collapseAll,
      isAllExpanded,
      isExpanded: getIsExpanded,
      toggleFile: handleToggleExpanded,
    }), [virtualizer, files.length, expandAll, collapseAll, isAllExpanded, getIsExpanded, handleToggleExpanded])

    if (files.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <div className="mb-4 text-3xl opacity-50">✓</div>
          <h3 className="mb-2 text-foreground">No changes</h3>
          <p>Working directory is clean</p>
        </div>
      )
    }

    const virtualItems = virtualizer.getVirtualItems()
    const allExpanded = isAllExpanded()

    const handleToggleAll = () => {
      if (allExpanded) {
        collapseAll()
      } else {
        expandAll()
      }
    }

    return (
      <>
        <div className="flex justify-end mb-2 items-center gap-2">
          {isVimActive && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              VIM
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleAll}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronsUpDown className="mr-1.5 size-3.5" />
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
        <div
          ref={containerRef}
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const file = files[virtualItem.index]
            const isExpanded = expandedState.get(file.path) ?? true
            return (
              <DiffItemWrapper
                key={file.path}
                file={file}
                diffStyle={diffStyle}
                isExpanded={isExpanded}
                isFocused={focusedIndex === virtualItem.index}
                virtualItem={virtualItem}
                measureElement={measureElement}
                onToggleExpanded={handleToggleExpanded}
              />
            )
          })}
        </div>
      </>
    )
  }
))
