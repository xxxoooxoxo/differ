import { useState, useEffect, useCallback, useRef } from 'react'

interface FileDiffInfo {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  additions: number
  deletions: number
  patch?: string
  isLarge?: boolean
}

interface VimNavigationOptions {
  files: FileDiffInfo[]
  isExpanded: (path: string) => boolean
  onToggleExpanded: (path: string, expanded: boolean) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  scrollToIndex: (index: number) => void
  openInEditor?: (path: string) => void
}

interface VimNavigationState {
  focusedIndex: number | null
  focusedHunkIndex: number | null
  isActive: boolean
}

/**
 * Get hunk header elements for a file
 */
function getHunkElements(filePath: string): HTMLElement[] {
  const container = document.getElementById(`diff-${CSS.escape(filePath)}`)
  if (!container) return []
  return Array.from(container.querySelectorAll('[data-separator="line-info"]')) as HTMLElement[]
}

/**
 * Scroll a hunk into view
 */
function scrollToHunk(filePath: string, hunkIndex: number) {
  const hunks = getHunkElements(filePath)
  hunks[hunkIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/**
 * Vim-style keyboard navigation for diff viewer
 *
 * Keybindings:
 * - j/k: Navigate between files (collapsed) or hunks (expanded)
 * - h: Collapse focused file
 * - l: Expand focused file
 * - Enter/Space: Toggle expand/collapse
 * - gg: Go to first file
 * - G: Go to last file
 * - H: Collapse all files
 * - L: Expand all files
 * - o: Open file in editor
 * - Escape: Clear focus / deactivate navigation
 */
export function useVimNavigation({
  files,
  isExpanded,
  onToggleExpanded,
  onExpandAll,
  onCollapseAll,
  scrollToIndex,
  openInEditor,
}: VimNavigationOptions): VimNavigationState & {
  setFocusedIndex: (index: number | null) => void
  activate: () => void
  deactivate: () => void
} {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [focusedHunkIndex, setFocusedHunkIndex] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastKeyTimeRef = useRef<number>(0)

  // Reset focus when files change
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= files.length) {
      setFocusedIndex(files.length > 0 ? files.length - 1 : null)
      setFocusedHunkIndex(null)
    }
  }, [files.length, focusedIndex])

  // Reset hunk focus when file focus changes
  useEffect(() => {
    setFocusedHunkIndex(null)
  }, [focusedIndex])

  // Manage hunk highlight class
  useEffect(() => {
    // Clear all highlights
    document.querySelectorAll('.hunk-focused').forEach(el => {
      el.classList.remove('hunk-focused')
    })

    // Apply new highlight
    if (focusedIndex !== null && focusedHunkIndex !== null && focusedIndex < files.length) {
      const file = files[focusedIndex]
      const hunks = getHunkElements(file.path)
      hunks[focusedHunkIndex]?.classList.add('hunk-focused')
    }
  }, [focusedIndex, focusedHunkIndex, files])

  const activate = useCallback(() => {
    setIsActive(true)
    if (focusedIndex === null && files.length > 0) {
      setFocusedIndex(0)
      scrollToIndex(0)
    }
  }, [focusedIndex, files.length, scrollToIndex])

  const deactivate = useCallback(() => {
    setIsActive(false)
    setFocusedIndex(null)
    setFocusedHunkIndex(null)
  }, [])

  const navigateToFile = useCallback((index: number) => {
    if (index >= 0 && index < files.length) {
      setFocusedIndex(index)
      setFocusedHunkIndex(null)
      scrollToIndex(index)
    }
  }, [files.length, scrollToIndex])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    const now = Date.now()
    const timeSinceLastKey = now - lastKeyTimeRef.current
    const key = e.key

    // Handle multi-key sequences (gg) - 500ms timeout
    if (timeSinceLastKey > 500) {
      lastKeyRef.current = null
    }

    // Auto-activate on first navigation key if not active
    if (!isActive && (key === 'j' || key === 'k')) {
      activate()
    }

    switch (key) {
      case 'j': {
        e.preventDefault()
        if (focusedIndex === null) {
          navigateToFile(0)
          return
        }

        const file = files[focusedIndex]
        const expanded = isExpanded(file.path)

        if (!expanded) {
          // File collapsed → next file
          navigateToFile(focusedIndex + 1)
        } else {
          // File expanded → navigate hunks
          const hunks = getHunkElements(file.path)
          const hunkCount = hunks.length

          if (hunkCount === 0) {
            // No hunks → next file
            navigateToFile(focusedIndex + 1)
          } else if (focusedHunkIndex === null) {
            // Not in hunk mode → focus first hunk
            setFocusedHunkIndex(0)
            scrollToHunk(file.path, 0)
          } else if (focusedHunkIndex < hunkCount - 1) {
            // Move to next hunk
            const nextHunk = focusedHunkIndex + 1
            setFocusedHunkIndex(nextHunk)
            scrollToHunk(file.path, nextHunk)
          } else {
            // At last hunk → next file
            navigateToFile(focusedIndex + 1)
          }
        }
        break
      }

      case 'k': {
        e.preventDefault()
        if (focusedIndex === null) {
          navigateToFile(files.length - 1)
          return
        }

        const file = files[focusedIndex]
        const expanded = isExpanded(file.path)

        if (!expanded) {
          // File collapsed → prev file
          navigateToFile(focusedIndex - 1)
        } else {
          // File expanded → navigate hunks
          const hunks = getHunkElements(file.path)
          const hunkCount = hunks.length

          if (hunkCount === 0) {
            // No hunks → prev file
            navigateToFile(focusedIndex - 1)
          } else if (focusedHunkIndex === null) {
            // Not in hunk mode → focus last hunk
            const lastHunk = hunkCount - 1
            setFocusedHunkIndex(lastHunk)
            scrollToHunk(file.path, lastHunk)
          } else if (focusedHunkIndex > 0) {
            // Move to prev hunk
            const prevHunk = focusedHunkIndex - 1
            setFocusedHunkIndex(prevHunk)
            scrollToHunk(file.path, prevHunk)
          } else {
            // At first hunk → prev file, focus its last hunk
            if (focusedIndex > 0) {
              const prevFileIndex = focusedIndex - 1
              const prevFile = files[prevFileIndex]
              setFocusedIndex(prevFileIndex)
              scrollToIndex(prevFileIndex)

              // After navigating, check if prev file is expanded and focus its last hunk
              setTimeout(() => {
                if (isExpanded(prevFile.path)) {
                  const prevHunks = getHunkElements(prevFile.path)
                  if (prevHunks.length > 0) {
                    setFocusedHunkIndex(prevHunks.length - 1)
                    scrollToHunk(prevFile.path, prevHunks.length - 1)
                  }
                }
              }, 50)
            }
          }
        }
        break
      }

      case 'h': {
        e.preventDefault()
        if (focusedIndex !== null && focusedIndex < files.length) {
          const file = files[focusedIndex]
          if (isExpanded(file.path)) {
            setFocusedHunkIndex(null)
            onToggleExpanded(file.path, false)
          }
        }
        break
      }

      case 'l': {
        e.preventDefault()
        if (focusedIndex !== null && focusedIndex < files.length) {
          const file = files[focusedIndex]
          if (!isExpanded(file.path)) {
            onToggleExpanded(file.path, true)
            // Wait for DOM to render, then focus first hunk
            setTimeout(() => {
              const hunks = getHunkElements(file.path)
              if (hunks.length > 0) {
                setFocusedHunkIndex(0)
                scrollToHunk(file.path, 0)
              }
            }, 50)
          }
        }
        break
      }

      case 'Enter':
      case ' ': {
        if (key === ' ') e.preventDefault()
        if (focusedIndex !== null && focusedIndex < files.length) {
          const file = files[focusedIndex]
          const willExpand = !isExpanded(file.path)
          onToggleExpanded(file.path, willExpand)

          if (willExpand) {
            // Expanding → focus first hunk
            setTimeout(() => {
              const hunks = getHunkElements(file.path)
              if (hunks.length > 0) {
                setFocusedHunkIndex(0)
                scrollToHunk(file.path, 0)
              }
            }, 50)
          } else {
            // Collapsing → exit hunk mode
            setFocusedHunkIndex(null)
          }
        }
        break
      }

      case 'g': {
        if (lastKeyRef.current === 'g') {
          e.preventDefault()
          navigateToFile(0)
          lastKeyRef.current = null
        } else {
          lastKeyRef.current = 'g'
          lastKeyTimeRef.current = now
        }
        break
      }

      case 'G': {
        e.preventDefault()
        navigateToFile(files.length - 1)
        break
      }

      case 'H': {
        e.preventDefault()
        setFocusedHunkIndex(null)
        onCollapseAll()
        break
      }

      case 'L': {
        e.preventDefault()
        onExpandAll()
        break
      }

      case 'o': {
        e.preventDefault()
        if (focusedIndex !== null && focusedIndex < files.length && openInEditor) {
          openInEditor(files[focusedIndex].path)
        }
        break
      }

      case 'Escape': {
        e.preventDefault()
        deactivate()
        break
      }

      default:
        if (key !== 'g') {
          lastKeyRef.current = null
        }
        break
    }
  }, [
    isActive,
    activate,
    focusedIndex,
    focusedHunkIndex,
    files,
    isExpanded,
    onToggleExpanded,
    onExpandAll,
    onCollapseAll,
    openInEditor,
    navigateToFile,
    deactivate,
    scrollToIndex,
  ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    focusedIndex,
    focusedHunkIndex,
    isActive,
    setFocusedIndex,
    activate,
    deactivate,
  }
}
