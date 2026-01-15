import { useState, useEffect, memo, startTransition, useCallback, useRef } from 'react'
import { PatchDiff } from '@pierre/diffs/react'
import type { DiffStyle } from './Header'
import { useEditor } from '../hooks/useEditor'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { ExternalLink, Package, ChevronsUpDown } from 'lucide-react'
import { cn } from '../lib/utils'

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

interface DiffViewerProps {
  file: FileDiffInfo
  diffStyle: DiffStyle
  defaultExpanded?: boolean
  expanded?: boolean
  isFocused?: boolean
  onToggleExpanded?: (expanded: boolean) => void
}

const DiffViewerInner = memo(function DiffViewerInner({
  file,
  diffStyle,
  defaultExpanded = true,
  expanded: controlledExpanded,
  isFocused = false,
  onToggleExpanded
}: DiffViewerProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isControlled = controlledExpanded !== undefined
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const handleToggle = () => {
    const newExpanded = !expanded
    if (onToggleExpanded) {
      onToggleExpanded(newExpanded)
    }
    if (!isControlled) {
      setInternalExpanded(newExpanded)
    }
  }
  const [ready, setReady] = useState(false)
  const [loadedPatch, setLoadedPatch] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { openInEditor } = useEditor()

  useEffect(() => {
    startTransition(() => setReady(true))
  }, [])

  const loadLargeDiff = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/diff/file?path=${encodeURIComponent(file.path)}`)
      const data = await response.json()
      if (data.patch) {
        setLoadedPatch(data.patch)
      }
    } catch (error) {
      console.error('Failed to load diff:', error)
    } finally {
      setLoading(false)
    }
  }

  const statusLabel = {
    added: 'Added',
    deleted: 'Deleted',
    modified: 'Modified',
    renamed: 'Renamed',
  }

  // Use loaded patch for large files, otherwise use the file's patch
  const displayPatch = loadedPatch || file.patch
  const hasPatch = displayPatch && displayPatch.trim().length > 0
  const showLargeFileMessage = file.isLarge && !loadedPatch

  const statusColors = {
    added: 'bg-emerald-500',
    deleted: 'bg-red-400',
    modified: 'bg-amber-400',
    renamed: 'bg-blue-400',
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-card transition-colors",
        isFocused
          ? "border-blue-500 ring-1 ring-blue-500/50"
          : "border-border"
      )}
      id={`diff-${file.path}`}
    >
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-accent/30"
        onClick={handleToggle}
      >
        <span className={cn('size-1.5 shrink-0 rounded-full', statusColors[file.status])} />
        <span className="flex-1 truncate font-mono text-xs text-foreground">{file.path}</span>
        <div className="flex items-center gap-3 text-muted-foreground">
          {file.additions > 0 && (
            <span className="font-mono text-[11px] text-emerald-500">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="font-mono text-[11px] text-red-400">-{file.deletions}</span>
          )}
          {file.isLarge && (
            <Badge variant="outline" className="h-5 text-[10px] text-amber-400 border-amber-400/50">
              Large
            </Badge>
          )}
          <button
            className="p-1 rounded hover:bg-accent/50 transition-colors"
            title="Open in editor"
            onClick={(e) => {
              e.stopPropagation()
              openInEditor(file.path)
            }}
          >
            <ExternalLink className="size-3.5" />
          </button>
          <span className="text-[10px]">
            {expanded ? '−' : '+'}
          </span>
        </div>
      </div>

      {expanded && ready && (
        <div className="overflow-x-auto">
          {showLargeFileMessage ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="mb-4 size-8 text-muted-foreground" />
              <p className="text-[13px] text-muted-foreground">
                Large file ({file.additions + file.deletions} lines changed)
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Diff hidden to prevent browser slowdown
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={(e) => {
                  e.stopPropagation()
                  loadLargeDiff()
                }}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load diff anyway'}
              </Button>
            </div>
          ) : !hasPatch ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-[13px] text-muted-foreground">No content changes</p>
            </div>
          ) : (
            <PatchDiff
              patch={displayPatch!}
              options={{
                theme: 'github-dark',
                diffStyle: diffStyle,
              }}
              style={{
                fontSize: '13px',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render if these specific values changed
  return (
    prevProps.file.path === nextProps.file.path &&
    prevProps.file.patch === nextProps.file.patch &&
    prevProps.file.status === nextProps.file.status &&
    prevProps.file.additions === nextProps.file.additions &&
    prevProps.file.deletions === nextProps.file.deletions &&
    prevProps.file.isLarge === nextProps.file.isLarge &&
    prevProps.diffStyle === nextProps.diffStyle &&
    prevProps.expanded === nextProps.expanded &&
    prevProps.isFocused === nextProps.isFocused
  )
})

export function DiffViewer(props: DiffViewerProps) {
  return <DiffViewerInner {...props} />
}

interface DiffListProps {
  files: FileDiffInfo[]
  diffStyle: DiffStyle
}

export const DiffList = memo(function DiffList({ files, diffStyle }: DiffListProps) {
  // Start with all collapsed, auto-expand as they enter viewport
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set())
  const userToggledRef = useRef<Set<string>>(new Set())
  const viewportEnteredRef = useRef<Set<string>>(new Set())

  const allExpanded = files.length > 0 && files.every(f => expandedPaths.has(f.path))

  const toggleAll = useCallback(() => {
    // Mark all as user-toggled
    files.forEach(f => userToggledRef.current.add(f.path))
    if (allExpanded) {
      setExpandedPaths(new Set())
    } else {
      setExpandedPaths(new Set(files.map(f => f.path)))
    }
  }, [allExpanded, files])

  const handleToggleFile = useCallback((path: string, expanded: boolean) => {
    userToggledRef.current.add(path)
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (expanded) {
        next.add(path)
      } else {
        next.delete(path)
      }
      return next
    })
  }, [])

  const handleViewportEntry = useCallback((path: string) => {
    if (viewportEnteredRef.current.has(path)) return
    if (userToggledRef.current.has(path)) return

    viewportEnteredRef.current.add(path)
    setExpandedPaths(prev => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
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

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronsUpDown className="mr-1.5 size-3.5" />
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>
      {files.map((file) => (
        <DiffWithViewportDetection
          key={file.path}
          file={file}
          diffStyle={diffStyle}
          expanded={expandedPaths.has(file.path)}
          onToggleExpanded={(expanded) => handleToggleFile(file.path, expanded)}
          onViewportEntry={handleViewportEntry}
        />
      ))}
    </div>
  )
})

// Wrapper component that detects when a diff enters the viewport
interface DiffWithViewportDetectionProps extends DiffViewerProps {
  onViewportEntry: (path: string) => void
}

const DiffWithViewportDetection = memo(function DiffWithViewportDetection({
  file,
  diffStyle,
  expanded,
  onToggleExpanded,
  onViewportEntry,
}: DiffWithViewportDetectionProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const hasEnteredViewport = useRef(false)

  useEffect(() => {
    const element = itemRef.current
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
        rootMargin: '100px 0px',
        threshold: 0,
      }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [file.path, onViewportEntry])

  return (
    <div ref={itemRef}>
      <DiffViewer
        file={file}
        diffStyle={diffStyle}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
      />
    </div>
  )
})
