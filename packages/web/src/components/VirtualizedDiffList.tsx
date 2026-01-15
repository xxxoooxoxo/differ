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

function estimateItemHeight(file: FileDiffInfo, expanded: boolean): number {
  if (!expanded) return 52 // Collapsed: header only
  if (file.isLarge) return 192 // Header + placeholder
  const lines = Math.max(file.additions + file.deletions, 10)
  return 52 + Math.min(lines * 22, 800) // Header + content (capped)
}

interface DiffItemWrapperProps {
  file: FileDiffInfo
  diffStyle: DiffStyle
  isExpanded: boolean
  virtualItem: { index: number; start: number }
  measureElement: (node: HTMLElement | null) => void
  onToggleExpanded: (path: string, expanded: boolean) => void
  onViewportEntry: (path: string) => void
  scrollContainerRef: React.RefObject<HTMLElement | null>
}

const DiffItemWrapper = memo(function DiffItemWrapper({
  file,
  diffStyle,
  isExpanded,
  virtualItem,
  measureElement,
  onToggleExpanded,
  onViewportEntry,
  scrollContainerRef,
}: DiffItemWrapperProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const hasEnteredViewport = useRef(false)

  useEffect(() => {
    const element = itemRef.current
    const scrollContainer = scrollContainerRef.current
    if (!element || hasEnteredViewport.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && !hasEnteredViewport.current) {
          hasEnteredViewport.current = true
          onViewportEntry(file.path)
          observer.disconnect()
        }
      },
      {
        root: scrollContainer,
        rootMargin: '100px 0px', // Pre-expand items slightly before they're visible
        threshold: 0,
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [file.path, onViewportEntry, scrollContainerRef])

  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      measureElement(node)
    },
    [measureElement]
  )

  return (
    <div
      ref={handleRef}
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
    prevProps.diffStyle === nextProps.diffStyle &&
    prevProps.virtualItem.start === nextProps.virtualItem.start
  )
})

export const VirtualizedDiffList = memo(forwardRef<VirtualizedDiffListHandle, VirtualizedDiffListProps>(
  function VirtualizedDiffList({ files, diffStyle, scrollContainerRef }, ref) {
    const pathToIndex = useRef<Map<string, number>>(new Map())
    // Track which files are expanded (default: collapsed)
    const [expandedState, setExpandedState] = useState<Map<string, boolean>>(() => new Map())
    // Track which files have entered viewport at least once (for auto-expansion)
    const viewportEnteredRef = useRef<Set<string>>(new Set())
    // Track files that user has explicitly toggled (to prevent auto-expand override)
    const userToggledRef = useRef<Set<string>>(new Set())
    // Ref to the container for IntersectionObserver
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      pathToIndex.current.clear()
      files.forEach((file, index) => {
        pathToIndex.current.set(file.path, index)
      })
      // Reset viewport tracking when files change
      viewportEnteredRef.current.clear()
      userToggledRef.current.clear()
    }, [files])

    // Get expansion state for a file (collapsed by default until viewport entry)
    const getIsExpanded = useCallback((path: string) => {
      return expandedState.get(path) ?? false
    }, [expandedState])

    const virtualizer = useVirtualizer({
      count: files.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index) => estimateItemHeight(files[index], getIsExpanded(files[index].path)),
      overscan: 3,
      gap: 16,
    })

    const expandAll = useCallback(() => {
      // Mark all as user-toggled to prevent auto-expand interference
      files.forEach(f => userToggledRef.current.add(f.path))
      setExpandedState(new Map(files.map(f => [f.path, true])))
    }, [files])

    const collapseAll = useCallback(() => {
      // Mark all as user-toggled to prevent auto-expand interference
      files.forEach(f => userToggledRef.current.add(f.path))
      setExpandedState(new Map(files.map(f => [f.path, false])))
    }, [files])

    const isAllExpanded = useCallback(() => {
      if (files.length === 0) return false
      return files.every(f => expandedState.get(f.path) ?? false)
    }, [files, expandedState])

    // Auto-expand files when they enter viewport for the first time
    const handleViewportEntry = useCallback((path: string) => {
      if (viewportEnteredRef.current.has(path)) return
      if (userToggledRef.current.has(path)) return

      viewportEnteredRef.current.add(path)
      setExpandedState(prev => {
        // Only auto-expand if not already set
        if (prev.has(path)) return prev
        const next = new Map(prev)
        next.set(path, true)
        return next
      })
    }, [])

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
      // Mark as user-toggled to prevent auto-expand from overriding
      userToggledRef.current.add(path)
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
          ref={containerRef}
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const file = files[virtualItem.index]
            const isExpanded = expandedState.get(file.path) ?? false
            return (
              <DiffItemWrapper
                key={file.path}
                file={file}
                diffStyle={diffStyle}
                isExpanded={isExpanded}
                virtualItem={virtualItem}
                measureElement={measureElement}
                onToggleExpanded={handleToggleExpanded}
                onViewportEntry={handleViewportEntry}
                scrollContainerRef={scrollContainerRef}
              />
            )
          })}
        </div>
      </>
    )
  }
))
