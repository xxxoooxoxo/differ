import { useState, useEffect, useCallback, useRef } from 'react'

interface FileDiffInfo {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  additions: number
  deletions: number
  patch?: string
  isLarge?: boolean
}

interface DiffListHandle {
  scrollToIndex: (index: number) => void
  isExpanded: (path: string) => boolean
  toggleFile: (path: string, expanded: boolean) => void
  expandAll: () => void
  collapseAll: () => void
}

interface VimNavigationOptions {
  files: FileDiffInfo[]
  diffListRef: React.RefObject<DiffListHandle | null>
  scrollContainerRef: React.RefObject<HTMLElement | null>
  openInEditor?: (path: string) => void
}

interface VimNavigationState {
  focusedIndex: number | null
  focusedHunkIndex: number | null
  focusedLineIndex: number | null
  isActive: boolean
}

/**
 * Get the shadow root of the diffs-container element for a file.
 * @pierre/diffs uses Web Components with Shadow DOM, so we need to access
 * the shadow root to query diff lines and hunks.
 */
function getDiffsShadowRoot(filePath: string): ShadowRoot | null {
  const container = document.getElementById(`diff-${CSS.escape(filePath)}`)
  if (!container) return null

  const diffsContainer = container.querySelector('diffs-container')
  if (!diffsContainer || !diffsContainer.shadowRoot) return null

  return diffsContainer.shadowRoot
}

/**
 * Get hunk header elements for a file.
 * Tries multiple selectors to be compatible with different @pierre/diffs versions.
 */
function getHunkElements(filePath: string): HTMLElement[] {
  const shadowRoot = getDiffsShadowRoot(filePath)
  if (!shadowRoot) return []

  // Try the data-separator attribute first (standard @pierre/diffs)
  let hunks = shadowRoot.querySelectorAll('[data-separator="line-info"]')
  if (hunks.length > 0) {
    return Array.from(hunks) as HTMLElement[]
  }

  // Fallback: look for elements containing @@ hunk header pattern
  const candidates = shadowRoot.querySelectorAll('div, span, td')
  const hunkElements: HTMLElement[] = []
  candidates.forEach((el) => {
    const text = el.textContent?.trim() || ''
    // Match @@ -x,y +x,y @@ pattern and ensure it's a leaf-ish node
    if (/^@@\s*-\d+/.test(text) && el.children.length <= 2) {
      hunkElements.push(el as HTMLElement)
    }
  })

  return hunkElements
}

/**
 * Get all diff lines for a file using [data-line][data-line-type] selector.
 * Queries the Shadow DOM of the diffs-container element.
 */
function getAllDiffLines(filePath: string): HTMLElement[] {
  const shadowRoot = getDiffsShadowRoot(filePath)
  if (!shadowRoot) return []

  // Get all elements with data-line attribute that also have a data-line-type
  const lines = shadowRoot.querySelectorAll('[data-line][data-line-type]')
  return Array.from(lines) as HTMLElement[]
}

/**
 * Determine which hunk a line belongs to by finding the nearest preceding hunk header
 */
function getHunkIndexForLine(
  lineElement: HTMLElement,
  filePath: string
): number | null {
  const hunks = getHunkElements(filePath)
  if (hunks.length === 0) return null

  // Find the hunk that precedes this line in the DOM
  for (let i = hunks.length - 1; i >= 0; i--) {
    const hunk = hunks[i]
    // Check if the hunk comes before the line in DOM order
    if (
      hunk.compareDocumentPosition(lineElement) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      return i
    }
  }

  return 0 // Default to first hunk if no preceding hunk found
}

/**
 * Get lines belonging to a specific hunk
 */
function getLinesInHunk(filePath: string, hunkIndex: number): HTMLElement[] {
  const allLines = getAllDiffLines(filePath)
  const hunks = getHunkElements(filePath)

  if (hunks.length === 0) return allLines
  if (hunkIndex < 0 || hunkIndex >= hunks.length) return []

  const hunkStart = hunks[hunkIndex]
  const hunkEnd = hunks[hunkIndex + 1] // undefined if last hunk

  return allLines.filter((line) => {
    // Line must come after the hunk header
    const afterStart =
      hunkStart.compareDocumentPosition(line) &
      Node.DOCUMENT_POSITION_FOLLOWING

    // Line must come before the next hunk header (or be at end)
    const beforeEnd =
      !hunkEnd ||
      hunkEnd.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_PRECEDING

    return afterStart && beforeEnd
  })
}

/**
 * Get the first line index of a hunk
 */
function getFirstLineIndexOfHunk(
  filePath: string,
  hunkIndex: number
): number | null {
  const allLines = getAllDiffLines(filePath)
  const hunkLines = getLinesInHunk(filePath, hunkIndex)

  if (hunkLines.length === 0) return null

  const firstHunkLine = hunkLines[0]
  return allLines.indexOf(firstHunkLine)
}

/**
 * Scroll an element into view within a scroll container.
 * Uses direct scroll calculation for reliability.
 */
function scrollElementIntoView(
  element: HTMLElement,
  scrollContainer: HTMLElement | null
) {
  if (!scrollContainer) {
    // Fallback: use native scrollIntoView
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  const elementRect = element.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()

  // Calculate scroll position to center the element
  const elementOffsetTop =
    elementRect.top - containerRect.top + scrollContainer.scrollTop
  const centeredScrollTop =
    elementOffsetTop - containerRect.height / 2 + elementRect.height / 2

  scrollContainer.scrollTo({
    top: Math.max(0, centeredScrollTop),
    behavior: 'smooth',
  })
}

/**
 * Scroll a file element into view
 */
function scrollToFile(filePath: string, scrollContainer: HTMLElement | null) {
  requestAnimationFrame(() => {
    const fileElement = document.getElementById(`diff-${CSS.escape(filePath)}`)
    if (fileElement) {
      scrollElementIntoView(fileElement, scrollContainer)
    }
  })
}

/**
 * Scroll a hunk into view
 */
function scrollToHunk(
  filePath: string,
  hunkIndex: number,
  scrollContainer: HTMLElement | null
) {
  requestAnimationFrame(() => {
    const hunks = getHunkElements(filePath)
    const hunk = hunks[hunkIndex]
    if (hunk) {
      scrollElementIntoView(hunk, scrollContainer)
    }
  })
}

/**
 * Scroll a line into view
 */
function scrollToLine(
  filePath: string,
  lineIndex: number,
  scrollContainer: HTMLElement | null
) {
  requestAnimationFrame(() => {
    const lines = getAllDiffLines(filePath)
    const line = lines[lineIndex]
    if (line) {
      scrollElementIntoView(line, scrollContainer)
    }
  })
}

/**
 * Clear a CSS class from all diffs-container shadow roots.
 * Since @pierre/diffs uses Shadow DOM, document.querySelectorAll won't find
 * elements inside shadow roots, so we need to iterate through all of them.
 */
function clearClassFromAllShadowRoots(className: string) {
  document.querySelectorAll('diffs-container').forEach((container) => {
    const shadowRoot = container.shadowRoot
    if (shadowRoot) {
      shadowRoot.querySelectorAll(`.${className}`).forEach((el) => {
        el.classList.remove(className)
      })
    }
  })
}

/**
 * Apply line focus styling
 */
function applyLineFocus(element: HTMLElement | null) {
  // Clear all existing line focus from shadow DOMs
  clearClassFromAllShadowRoots('line-focused')

  // Apply new focus
  if (element) {
    element.classList.add('line-focused')
  }
}

/**
 * Vim-style keyboard navigation for diff viewer
 *
 * Three-tier navigation:
 * - j/k: Navigate lines (finest granularity)
 * - {/}: Jump between hunks (medium granularity)
 * - [[/]]: Jump between files (coarsest granularity)
 *
 * Other keybindings:
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
  diffListRef,
  scrollContainerRef,
  openInEditor,
}: VimNavigationOptions): VimNavigationState & {
  setFocusedIndex: (index: number | null) => void
  activate: () => void
  deactivate: () => void
} {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [focusedHunkIndex, setFocusedHunkIndex] = useState<number | null>(null)
  const [focusedLineIndex, setFocusedLineIndex] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastKeyTimeRef = useRef<number>(0)

  // Reset focus when files change
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= files.length) {
      setFocusedIndex(files.length > 0 ? files.length - 1 : null)
      setFocusedHunkIndex(null)
      setFocusedLineIndex(null)
    }
  }, [files.length, focusedIndex])

  // Reset hunk and line focus when file focus changes
  useEffect(() => {
    setFocusedHunkIndex(null)
    setFocusedLineIndex(null)
  }, [focusedIndex])

  // Manage hunk highlight class
  useEffect(() => {
    // Clear all hunk highlights from shadow DOMs
    clearClassFromAllShadowRoots('hunk-focused')

    // Apply new hunk highlight
    if (
      focusedIndex !== null &&
      focusedHunkIndex !== null &&
      focusedIndex < files.length
    ) {
      const file = files[focusedIndex]
      const hunks = getHunkElements(file.path)
      hunks[focusedHunkIndex]?.classList.add('hunk-focused')
    }
  }, [focusedIndex, focusedHunkIndex, files])

  // Manage line highlight
  useEffect(() => {
    if (
      focusedIndex !== null &&
      focusedLineIndex !== null &&
      focusedIndex < files.length
    ) {
      const file = files[focusedIndex]
      const lines = getAllDiffLines(file.path)
      applyLineFocus(lines[focusedLineIndex] || null)
    } else {
      applyLineFocus(null)
    }
  }, [focusedIndex, focusedLineIndex, files])

  const activate = useCallback(() => {
    setIsActive(true)
    if (focusedIndex === null && files.length > 0) {
      setFocusedIndex(0)
      diffListRef.current?.scrollToIndex(0)
    }
  }, [focusedIndex, files.length, diffListRef])

  const deactivate = useCallback(() => {
    setIsActive(false)
    setFocusedIndex(null)
    setFocusedHunkIndex(null)
    setFocusedLineIndex(null)
    applyLineFocus(null)
  }, [])

  const navigateToFile = useCallback(
    (index: number) => {
      if (index >= 0 && index < files.length) {
        setFocusedIndex(index)
        setFocusedHunkIndex(null)
        setFocusedLineIndex(null)
        diffListRef.current?.scrollToIndex(index)
      }
    },
    [files.length, diffListRef]
  )

  /**
   * Navigate to a file and focus its first line (expanding if needed)
   */
  const navigateToFileWithFirstLine = useCallback(
    (index: number) => {
      if (index < 0 || index >= files.length) return

      const file = files[index]
      setFocusedIndex(index)
      diffListRef.current?.scrollToIndex(index)

      // Expand the file if collapsed
      if (!diffListRef.current?.isExpanded(file.path)) {
        diffListRef.current?.toggleFile(file.path, true)
      }

      // Wait for DOM to render, then focus first line
      setTimeout(() => {
        const lines = getAllDiffLines(file.path)
        if (lines.length > 0) {
          setFocusedLineIndex(0)
          // Update hunk index based on line position
          const hunkIdx = getHunkIndexForLine(lines[0], file.path)
          setFocusedHunkIndex(hunkIdx)
          scrollToLine(file.path, 0, scrollContainerRef.current)
        } else {
          // No lines (empty file), just focus the file
          setFocusedLineIndex(null)
          setFocusedHunkIndex(null)
        }
      }, 50)
    },
    [files, diffListRef, scrollContainerRef]
  )

  /**
   * Navigate to a file and focus its last line
   */
  const navigateToFileWithLastLine = useCallback(
    (index: number) => {
      if (index < 0 || index >= files.length) return

      const file = files[index]
      setFocusedIndex(index)
      diffListRef.current?.scrollToIndex(index)

      // Expand the file if collapsed
      if (!diffListRef.current?.isExpanded(file.path)) {
        diffListRef.current?.toggleFile(file.path, true)
      }

      // Wait for DOM to render, then focus last line
      setTimeout(() => {
        const lines = getAllDiffLines(file.path)
        if (lines.length > 0) {
          const lastIdx = lines.length - 1
          setFocusedLineIndex(lastIdx)
          // Update hunk index based on line position
          const hunkIdx = getHunkIndexForLine(lines[lastIdx], file.path)
          setFocusedHunkIndex(hunkIdx)
          scrollToLine(file.path, lastIdx, scrollContainerRef.current)
        } else {
          setFocusedLineIndex(null)
          setFocusedHunkIndex(null)
        }
      }, 50)
    },
    [files, diffListRef, scrollContainerRef]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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

      // Handle multi-key sequences (gg, [[, ]]) - 500ms timeout
      if (timeSinceLastKey > 500) {
        lastKeyRef.current = null
      }

      // Auto-activate on first navigation key if not active
      if (!isActive && (key === 'j' || key === 'k' || key === '{' || key === '}')) {
        activate()
      }

      switch (key) {
        // LINE NAVIGATION (j/k)
        case 'j': {
          e.preventDefault()
          if (focusedIndex === null) {
            navigateToFileWithFirstLine(0)
            return
          }

          const file = files[focusedIndex]
          const expanded = diffListRef.current?.isExpanded(file.path)

          if (!expanded) {
            // File collapsed → expand and focus first line
            diffListRef.current?.toggleFile(file.path, true)
            setTimeout(() => {
              const lines = getAllDiffLines(file.path)
              if (lines.length > 0) {
                setFocusedLineIndex(0)
                const hunkIdx = getHunkIndexForLine(lines[0], file.path)
                setFocusedHunkIndex(hunkIdx)
                scrollToLine(file.path, 0, scrollContainerRef.current)
              }
            }, 50)
            return
          }

          const lines = getAllDiffLines(file.path)
          if (lines.length === 0) {
            // No lines → next file
            navigateToFileWithFirstLine(focusedIndex + 1)
            return
          }

          if (focusedLineIndex === null) {
            // Not in line mode → focus first line
            setFocusedLineIndex(0)
            const hunkIdx = getHunkIndexForLine(lines[0], file.path)
            setFocusedHunkIndex(hunkIdx)
            scrollToLine(file.path, 0, scrollContainerRef.current)
          } else if (focusedLineIndex < lines.length - 1) {
            // Move to next line
            const nextLine = focusedLineIndex + 1
            setFocusedLineIndex(nextLine)
            // Update hunk index based on new line position
            const hunkIdx = getHunkIndexForLine(lines[nextLine], file.path)
            setFocusedHunkIndex(hunkIdx)
            scrollToLine(file.path, nextLine, scrollContainerRef.current)
          } else {
            // At last line → next file's first line
            navigateToFileWithFirstLine(focusedIndex + 1)
          }
          break
        }

        case 'k': {
          e.preventDefault()
          if (focusedIndex === null) {
            navigateToFileWithLastLine(files.length - 1)
            return
          }

          const file = files[focusedIndex]
          const expanded = diffListRef.current?.isExpanded(file.path)

          if (!expanded) {
            // File collapsed → go to previous file's last line
            navigateToFileWithLastLine(focusedIndex - 1)
            return
          }

          const lines = getAllDiffLines(file.path)
          if (lines.length === 0) {
            // No lines → prev file
            navigateToFileWithLastLine(focusedIndex - 1)
            return
          }

          if (focusedLineIndex === null) {
            // Not in line mode → focus last line
            const lastIdx = lines.length - 1
            setFocusedLineIndex(lastIdx)
            const hunkIdx = getHunkIndexForLine(lines[lastIdx], file.path)
            setFocusedHunkIndex(hunkIdx)
            scrollToLine(file.path, lastIdx, scrollContainerRef.current)
          } else if (focusedLineIndex > 0) {
            // Move to prev line
            const prevLine = focusedLineIndex - 1
            setFocusedLineIndex(prevLine)
            const hunkIdx = getHunkIndexForLine(lines[prevLine], file.path)
            setFocusedHunkIndex(hunkIdx)
            scrollToLine(file.path, prevLine, scrollContainerRef.current)
          } else {
            // At first line → prev file's last line
            navigateToFileWithLastLine(focusedIndex - 1)
          }
          break
        }

        // HUNK NAVIGATION ({/})
        case '{': {
          e.preventDefault()
          if (focusedIndex === null) {
            navigateToFileWithFirstLine(0)
            return
          }

          const file = files[focusedIndex]
          const expanded = diffListRef.current?.isExpanded(file.path)

          if (!expanded) {
            diffListRef.current?.toggleFile(file.path, true)
          }

          setTimeout(() => {
            const hunks = getHunkElements(file.path)
            if (hunks.length === 0) {
              // No hunks → prev file's last hunk
              if (focusedIndex > 0) {
                const prevFile = files[focusedIndex - 1]
                setFocusedIndex(focusedIndex - 1)
                diffListRef.current?.scrollToIndex(focusedIndex - 1)

                if (!diffListRef.current?.isExpanded(prevFile.path)) {
                  diffListRef.current?.toggleFile(prevFile.path, true)
                }

                setTimeout(() => {
                  const prevHunks = getHunkElements(prevFile.path)
                  if (prevHunks.length > 0) {
                    const lastHunkIdx = prevHunks.length - 1
                    setFocusedHunkIndex(lastHunkIdx)
                    const lineIdx = getFirstLineIndexOfHunk(prevFile.path, lastHunkIdx)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(prevFile.path, lastHunkIdx, scrollContainerRef.current)
                  }
                }, 50)
              }
              return
            }

            const currentHunk = focusedHunkIndex ?? 0
            if (currentHunk > 0) {
              // Move to prev hunk
              const prevHunk = currentHunk - 1
              setFocusedHunkIndex(prevHunk)
              const lineIdx = getFirstLineIndexOfHunk(file.path, prevHunk)
              setFocusedLineIndex(lineIdx)
              scrollToHunk(file.path, prevHunk, scrollContainerRef.current)
            } else {
              // At first hunk → prev file's last hunk
              if (focusedIndex > 0) {
                const prevFile = files[focusedIndex - 1]
                setFocusedIndex(focusedIndex - 1)
                diffListRef.current?.scrollToIndex(focusedIndex - 1)

                if (!diffListRef.current?.isExpanded(prevFile.path)) {
                  diffListRef.current?.toggleFile(prevFile.path, true)
                }

                setTimeout(() => {
                  const prevHunks = getHunkElements(prevFile.path)
                  if (prevHunks.length > 0) {
                    const lastHunkIdx = prevHunks.length - 1
                    setFocusedHunkIndex(lastHunkIdx)
                    const lineIdx = getFirstLineIndexOfHunk(prevFile.path, lastHunkIdx)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(prevFile.path, lastHunkIdx, scrollContainerRef.current)
                  }
                }, 50)
              }
            }
          }, expanded ? 0 : 50)
          break
        }

        case '}': {
          e.preventDefault()
          if (focusedIndex === null) {
            navigateToFileWithFirstLine(0)
            return
          }

          const file = files[focusedIndex]
          const expanded = diffListRef.current?.isExpanded(file.path)

          if (!expanded) {
            diffListRef.current?.toggleFile(file.path, true)
          }

          setTimeout(() => {
            const hunks = getHunkElements(file.path)
            if (hunks.length === 0) {
              // No hunks → next file's first hunk
              if (focusedIndex < files.length - 1) {
                const nextFile = files[focusedIndex + 1]
                setFocusedIndex(focusedIndex + 1)
                diffListRef.current?.scrollToIndex(focusedIndex + 1)

                if (!diffListRef.current?.isExpanded(nextFile.path)) {
                  diffListRef.current?.toggleFile(nextFile.path, true)
                }

                setTimeout(() => {
                  const nextHunks = getHunkElements(nextFile.path)
                  if (nextHunks.length > 0) {
                    setFocusedHunkIndex(0)
                    const lineIdx = getFirstLineIndexOfHunk(nextFile.path, 0)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(nextFile.path, 0, scrollContainerRef.current)
                  }
                }, 50)
              }
              return
            }

            const currentHunk = focusedHunkIndex ?? -1
            if (currentHunk < hunks.length - 1) {
              // Move to next hunk
              const nextHunk = currentHunk + 1
              setFocusedHunkIndex(nextHunk)
              const lineIdx = getFirstLineIndexOfHunk(file.path, nextHunk)
              setFocusedLineIndex(lineIdx)
              scrollToHunk(file.path, nextHunk, scrollContainerRef.current)
            } else {
              // At last hunk → next file's first hunk
              if (focusedIndex < files.length - 1) {
                const nextFile = files[focusedIndex + 1]
                setFocusedIndex(focusedIndex + 1)
                diffListRef.current?.scrollToIndex(focusedIndex + 1)

                if (!diffListRef.current?.isExpanded(nextFile.path)) {
                  diffListRef.current?.toggleFile(nextFile.path, true)
                }

                setTimeout(() => {
                  const nextHunks = getHunkElements(nextFile.path)
                  if (nextHunks.length > 0) {
                    setFocusedHunkIndex(0)
                    const lineIdx = getFirstLineIndexOfHunk(nextFile.path, 0)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(nextFile.path, 0, scrollContainerRef.current)
                  }
                }, 50)
              }
            }
          }, expanded ? 0 : 50)
          break
        }

        // FILE NAVIGATION ([[/]])
        case '[': {
          if (lastKeyRef.current === '[') {
            e.preventDefault()
            // [[ - previous file
            if (focusedIndex === null) {
              navigateToFileWithFirstLine(files.length - 1)
            } else if (focusedIndex > 0) {
              navigateToFileWithFirstLine(focusedIndex - 1)
            }
            lastKeyRef.current = null
          } else {
            lastKeyRef.current = '['
            lastKeyTimeRef.current = now
          }
          break
        }

        case ']': {
          if (lastKeyRef.current === ']') {
            e.preventDefault()
            // ]] - next file
            if (focusedIndex === null) {
              navigateToFileWithFirstLine(0)
            } else if (focusedIndex < files.length - 1) {
              navigateToFileWithFirstLine(focusedIndex + 1)
            }
            lastKeyRef.current = null
          } else {
            lastKeyRef.current = ']'
            lastKeyTimeRef.current = now
          }
          break
        }

        case 'h': {
          e.preventDefault()
          if (focusedIndex !== null && focusedIndex < files.length) {
            const file = files[focusedIndex]
            if (diffListRef.current?.isExpanded(file.path)) {
              setFocusedHunkIndex(null)
              setFocusedLineIndex(null)
              applyLineFocus(null)
              diffListRef.current?.toggleFile(file.path, false)
            }
          }
          break
        }

        case 'l': {
          e.preventDefault()
          if (focusedIndex !== null && focusedIndex < files.length) {
            const file = files[focusedIndex]
            if (!diffListRef.current?.isExpanded(file.path)) {
              diffListRef.current?.toggleFile(file.path, true)
              // Wait for DOM to render, then focus first line
              setTimeout(() => {
                const lines = getAllDiffLines(file.path)
                if (lines.length > 0) {
                  setFocusedLineIndex(0)
                  const hunkIdx = getHunkIndexForLine(lines[0], file.path)
                  setFocusedHunkIndex(hunkIdx)
                  scrollToLine(file.path, 0, scrollContainerRef.current)
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
            const willExpand = !diffListRef.current?.isExpanded(file.path)
            diffListRef.current?.toggleFile(file.path, willExpand)

            if (willExpand) {
              // Expanding → focus first line
              setTimeout(() => {
                const lines = getAllDiffLines(file.path)
                if (lines.length > 0) {
                  setFocusedLineIndex(0)
                  const hunkIdx = getHunkIndexForLine(lines[0], file.path)
                  setFocusedHunkIndex(hunkIdx)
                  scrollToLine(file.path, 0, scrollContainerRef.current)
                }
              }, 50)
            } else {
              // Collapsing → exit line/hunk mode
              setFocusedHunkIndex(null)
              setFocusedLineIndex(null)
              applyLineFocus(null)
            }
          }
          break
        }

        case 'g': {
          if (lastKeyRef.current === 'g') {
            e.preventDefault()
            navigateToFileWithFirstLine(0)
            lastKeyRef.current = null
          } else {
            lastKeyRef.current = 'g'
            lastKeyTimeRef.current = now
          }
          break
        }

        case 'G': {
          e.preventDefault()
          navigateToFileWithFirstLine(files.length - 1)
          break
        }

        case 'H': {
          e.preventDefault()
          setFocusedHunkIndex(null)
          setFocusedLineIndex(null)
          applyLineFocus(null)
          diffListRef.current?.collapseAll()
          break
        }

        case 'L': {
          e.preventDefault()
          diffListRef.current?.expandAll()
          break
        }

        case 'o': {
          e.preventDefault()
          if (
            focusedIndex !== null &&
            focusedIndex < files.length &&
            openInEditor
          ) {
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
          if (key !== 'g' && key !== '[' && key !== ']') {
            lastKeyRef.current = null
          }
          break
      }
    },
    [
      isActive,
      activate,
      focusedIndex,
      focusedHunkIndex,
      focusedLineIndex,
      files,
      diffListRef,
      openInEditor,
      navigateToFile,
      navigateToFileWithFirstLine,
      navigateToFileWithLastLine,
      deactivate,
      scrollContainerRef,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    focusedIndex,
    focusedHunkIndex,
    focusedLineIndex,
    isActive,
    setFocusedIndex,
    activate,
    deactivate,
  }
}
