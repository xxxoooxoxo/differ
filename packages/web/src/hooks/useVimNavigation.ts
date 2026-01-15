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
  isActive: boolean
}

/**
 * Vim-style keyboard navigation for diff viewer
 *
 * Keybindings:
 * - j/k: Navigate between files
 * - h: Collapse focused file
 * - l: Expand focused file
 * - Enter/Space: Toggle expand/collapse
 * - gg: Go to first file
 * - G: Go to last file
 * - H: Collapse all files
 * - L: Expand all files
 * - o: Open file in editor
 * - Escape: Clear focus / deactivate navigation
 * - ?: Show help (optional)
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
  const [isActive, setIsActive] = useState(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastKeyTimeRef = useRef<number>(0)

  // Reset focus when files change
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= files.length) {
      setFocusedIndex(files.length > 0 ? files.length - 1 : null)
    }
  }, [files.length, focusedIndex])

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
  }, [])

  const navigateTo = useCallback((index: number) => {
    if (index >= 0 && index < files.length) {
      setFocusedIndex(index)
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
      // Let the key handler continue to process this key
    }

    switch (key) {
      case 'j': {
        e.preventDefault()
        if (focusedIndex === null) {
          navigateTo(0)
        } else {
          navigateTo(focusedIndex + 1)
        }
        break
      }

      case 'k': {
        e.preventDefault()
        if (focusedIndex === null) {
          navigateTo(files.length - 1)
        } else {
          navigateTo(focusedIndex - 1)
        }
        break
      }

      case 'h': {
        e.preventDefault()
        if (focusedIndex !== null && focusedIndex < files.length) {
          const file = files[focusedIndex]
          if (isExpanded(file.path)) {
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
          }
        }
        break
      }

      case 'Enter':
      case ' ': {
        if (key === ' ') e.preventDefault() // Prevent page scroll
        if (focusedIndex !== null && focusedIndex < files.length) {
          const file = files[focusedIndex]
          onToggleExpanded(file.path, !isExpanded(file.path))
        }
        break
      }

      case 'g': {
        if (lastKeyRef.current === 'g') {
          // gg - go to first file
          e.preventDefault()
          navigateTo(0)
          lastKeyRef.current = null
        } else {
          lastKeyRef.current = 'g'
          lastKeyTimeRef.current = now
        }
        break
      }

      case 'G': {
        // G - go to last file
        e.preventDefault()
        navigateTo(files.length - 1)
        break
      }

      case 'H': {
        // Collapse all
        e.preventDefault()
        onCollapseAll()
        break
      }

      case 'L': {
        // Expand all
        e.preventDefault()
        onExpandAll()
        break
      }

      case 'o': {
        // Open in editor
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
        // Clear the key sequence for non-matching keys
        if (key !== 'g') {
          lastKeyRef.current = null
        }
        break
    }
  }, [
    isActive,
    activate,
    focusedIndex,
    files,
    isExpanded,
    onToggleExpanded,
    onExpandAll,
    onCollapseAll,
    openInEditor,
    navigateTo,
    deactivate,
  ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    focusedIndex,
    isActive,
    setFocusedIndex,
    activate,
    deactivate,
  }
}
