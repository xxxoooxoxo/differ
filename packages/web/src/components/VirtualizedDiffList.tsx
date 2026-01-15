import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle, memo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DiffViewer } from './DiffViewer'
import { Button } from './ui/button'
import { ChevronsUpDown } from 'lucide-react'
import type { DiffStyle } from './Header'

interface FileDiffInfo {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
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
}

export interface VirtualizedDiffListHandle {
  scrollToFile: (path: string) => void
  expandAll: () => void
  collapseAll: () => void
  isAllExpanded: () => boolean
}

function estimateItemHeight(file: FileDiffInfo): number {
  if (file.isLarge) return 192 // Header + placeholder
  const lines = Math.max(file.additions + file.deletions, 10)
  return 52 + Math.min(lines * 22, 800) // Header + content (capped)
}

export const VirtualizedDiffList = memo(forwardRef<VirtualizedDiffListHandle, VirtualizedDiffListProps>(
  function VirtualizedDiffList({ files, diffStyle, scrollContainerRef }, ref) {
    const pathToIndex = useRef<Map<string, number>>(new Map())
    const [expandedState, setExpandedState] = useState<Map<string, boolean>>(() => new Map())

    useEffect(() => {
      pathToIndex.current.clear()
      files.forEach((file, index) => {
        pathToIndex.current.set(file.path, index)
      })
    }, [files])

    const virtualizer = useVirtualizer({
      count: files.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index) => estimateItemHeight(files[index]),
      overscan: 3,
      gap: 16,
    })

    const expandAll = useCallback(() => {
      setExpandedState(new Map(files.map(f => [f.path, true])))
    }, [files])

    const collapseAll = useCallback(() => {
      setExpandedState(new Map(files.map(f => [f.path, false])))
    }, [files])

    const isAllExpanded = useCallback(() => {
      if (files.length === 0) return false
      return files.every(f => expandedState.get(f.path) ?? true)
    }, [files, expandedState])

    useImperativeHandle(ref, () => ({
      scrollToFile: (path: string) => {
        const index = pathToIndex.current.get(path)
        if (index !== undefined) {
          virtualizer.scrollToIndex(index, {
            align: 'start',
            behavior: 'smooth',
          })
        }
      },
      expandAll,
      collapseAll,
      isAllExpanded,
    }), [virtualizer, expandAll, collapseAll, isAllExpanded])

    const measureElement = useCallback((node: HTMLElement | null) => {
      if (node) {
        virtualizer.measureElement(node)
      }
    }, [virtualizer])

    const handleToggleExpanded = useCallback((path: string, expanded: boolean) => {
      setExpandedState(prev => {
        const next = new Map(prev)
        next.set(path, expanded)
        return next
      })
    }, [])

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
        <div className="flex justify-end mb-2">
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
              <div
                key={file.path}
                ref={measureElement}
                data-index={virtualItem.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <DiffViewer
                  file={file}
                  diffStyle={diffStyle}
                  expanded={isExpanded}
                  onToggleExpanded={(expanded) => handleToggleExpanded(file.path, expanded)}
                />
              </div>
            )
          })}
        </div>
      </>
    )
  }
))
