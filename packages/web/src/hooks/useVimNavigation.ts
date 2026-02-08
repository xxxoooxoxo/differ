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

const injectedShadowRoots = new WeakSet<ShadowRoot>()

function injectFocusStyles(shadowRoot: ShadowRoot) {
  if (injectedShadowRoots.has(shadowRoot)) return

  const style = document.createElement('style')
  style.textContent = `
[data-line] {
  transition: background 0.15s ease;
}
[data-separator] {
  transition: background 0.15s ease;
}
[data-line].line-focused::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.15);
  border-left: 3px solid rgb(59, 130, 246);
  pointer-events: none;
  z-index: 1;
}
[data-line].line-focused:hover::after {
  background: rgba(59, 130, 246, 0.15);
}
[data-line-type="change-addition"].line-focused::after,
[data-line-type="change-addition"].line-focused:hover::after {
  background: rgba(34, 197, 94, 0.2);
  border-left-color: rgb(34, 197, 94);
}
[data-line-type="change-deletion"].line-focused::after,
[data-line-type="change-deletion"].line-focused:hover::after {
  background: rgba(239, 68, 68, 0.2);
  border-left-color: rgb(239, 68, 68);
}
[data-separator="line-info"].hunk-focused,
[data-separator="line-info"].hunk-focused:hover {
  background: rgba(251, 191, 36, 0.2) !important;
  box-shadow: inset 4px 0 0 rgb(251, 191, 36) !important;
}
`
  shadowRoot.appendChild(style)
  injectedShadowRoots.add(shadowRoot)
}

/**
 * Get the shadow root of the diffs-container element for a file.
 * @pierre/diffs uses Web Components with Shadow DOM, so we need to access
 * the shadow root to query diff lines and hunks.
 */
function getDiffsShadowRoot(filePath: string): ShadowRoot | null {
  // getElementById takes a plain string, NOT a CSS selector - don't use CSS.escape
  const container = document.getElementById(`diff-${filePath}`)
  if (!container) return null

  const diffsContainer = container.querySelector('diffs-container')
  if (!diffsContainer?.shadowRoot) return null

  const shadowRoot = diffsContainer.shadowRoot
  injectFocusStyles(shadowRoot)
  return shadowRoot
}

/**
 * Get hunk header elements for a file.
 * In split mode, deduplicates by data-expand-index since each logical hunk
 * has two separator elements (one per column). Returns the first column's
 * elements for navigation/scrolling purposes.
 */
function getHunkElements(filePath: string): HTMLElement[] {
  const shadowRoot = getDiffsShadowRoot(filePath)
  if (!shadowRoot) return []

  const allSeparators = shadowRoot.querySelectorAll('[data-separator="line-info"]')
  const hunks = Array.from(allSeparators) as HTMLElement[]

  // In split mode, there are duplicate separators (one per column).
  // Deduplicate by data-expand-index, keeping only the first occurrence.
  const isSplitMode = shadowRoot.querySelector('[data-type="split"]') !== null
  if (isSplitMode) {
    const seen = new Set<string>()
    return hunks.filter((el) => {
      const expandIndex = el.getAttribute('data-expand-index')
      if (expandIndex !== null && seen.has(expandIndex)) return false
      if (expandIndex !== null) seen.add(expandIndex)
      return true
    })
  }

  return hunks
}

/**
 * Get all diff lines for a file using [data-line][data-line-type] selector.
 * In split mode, only returns lines from the LEFT column (data-deletions) to
 * avoid double-counting rows that appear in both columns.
 */
function getAllDiffLines(filePath: string): HTMLElement[] {
  const shadowRoot = getDiffsShadowRoot(filePath)
  if (!shadowRoot) return []

  const isSplitMode = shadowRoot.querySelector('[data-type="split"]') !== null
  if (isSplitMode) {
    // Only query the left column to get one line per visual row
    const leftCol = shadowRoot.querySelector('code[data-deletions]')
    if (leftCol) {
      return Array.from(leftCol.querySelectorAll('[data-line][data-line-type]')) as HTMLElement[]
    }
  }

  const lines = shadowRoot.querySelectorAll('[data-line][data-line-type]')
  return Array.from(lines) as HTMLElement[]
}

/**
 * Parse the split row index from a data-line-index attribute (format: "unifiedIdx,splitIdx").
 */
function getSplitIndex(el: HTMLElement): string | null {
  const idx = el.getAttribute('data-line-index')
  if (!idx) return null
  const comma = idx.lastIndexOf(',')
  return comma >= 0 ? idx.slice(comma + 1) : null
}

/**
 * In split mode, find the matching line in the RIGHT column at the same visual row.
 * Matches by comparing parsed split row indices from data-line-index.
 */
function getMatchingRightLine(filePath: string, leftLine: HTMLElement): HTMLElement | null {
  const splitIdx = getSplitIndex(leftLine)
  if (splitIdx === null) return null

  const shadowRoot = getDiffsShadowRoot(filePath)
  if (!shadowRoot) return null

  const rightCol = shadowRoot.querySelector('code[data-additions]')
  if (!rightCol) return null

  const rightLines = rightCol.querySelectorAll('[data-line][data-line-type]')
  for (const rl of rightLines) {
    if (getSplitIndex(rl as HTMLElement) === splitIdx) {
      return rl as HTMLElement
    }
  }
  return null
}

function waitForDiffReady(filePath: string, callback: () => void, maxWait = 300) {
  let elapsed = 0
  const check = () => {
    const lines = getAllDiffLines(filePath)
    if (lines.length > 0) {
      callback()
      return
    }
    elapsed += 16
    if (elapsed < maxWait) {
      requestAnimationFrame(check)
    }
  }
  requestAnimationFrame(check)
}

function waitForHunksReady(filePath: string, callback: () => void, maxWait = 300) {
  let elapsed = 0
  const check = () => {
    const hunks = getHunkElements(filePath)
    if (hunks.length > 0) {
      callback()
      return
    }
    elapsed += 16
    if (elapsed < maxWait) {
      requestAnimationFrame(check)
    }
  }
  requestAnimationFrame(check)
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
 * Check if an element is visible within its scroll container with margin.
 */
function isElementInView(
  element: HTMLElement,
  container: HTMLElement,
  margin = 80
): boolean {
  const elemRect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return (
    elemRect.top >= containerRect.top + margin &&
    elemRect.bottom <= containerRect.bottom - margin
  )
}

/**
 * Scroll an element into view within a scroll container.
 * Scrolls minimally — just enough to bring the element into view with margin.
 */
function scrollElementIntoView(
  element: HTMLElement,
  scrollContainer: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth'
) {
  if (!scrollContainer) {
    element.scrollIntoView({ behavior, block: 'nearest' })
    return
  }

  // Skip if already visible with margin
  if (isElementInView(element, scrollContainer)) return

  const elementRect = element.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()

  // Scroll minimally: just enough to bring into view with margin
  let scrollTop = scrollContainer.scrollTop
  const margin = 80

  if (elementRect.top < containerRect.top + margin) {
    // Element is above visible area - scroll up
    scrollTop =
      scrollContainer.scrollTop + (elementRect.top - containerRect.top) - margin
  } else if (elementRect.bottom > containerRect.bottom - margin) {
    // Element is below visible area - scroll down
    scrollTop =
      scrollContainer.scrollTop +
      (elementRect.bottom - containerRect.bottom) +
      margin
  }

  scrollContainer.scrollTo({
    top: Math.max(0, scrollTop),
    behavior,
  })
}

/**
 * Scroll a file element into view
 */
function scrollToFile(filePath: string, scrollContainer: HTMLElement | null) {
  requestAnimationFrame(() => {
    const fileElement = document.getElementById(`diff-${filePath}`)
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
      scrollElementIntoView(hunk, scrollContainer, 'smooth')
    }
  })
}

/**
 * Scroll an element to the center of its scroll container.
 * Clamps to top/bottom so it doesn't over-scroll at boundaries.
 */
function scrollElementToCenter(
  element: HTMLElement,
  scrollContainer: HTMLElement | null,
  behavior: ScrollBehavior = 'instant'
) {
  if (!scrollContainer) {
    element.scrollIntoView({ behavior, block: 'center' })
    return
  }

  const elementRect = element.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()

  // Calculate scroll position that centers the element
  const elementCenter = elementRect.top + elementRect.height / 2
  const containerCenter = containerRect.top + containerRect.height / 2
  const offset = elementCenter - containerCenter
  const targetScroll = scrollContainer.scrollTop + offset

  // Clamp to valid range (handles top/bottom boundaries naturally)
  const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight
  const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll))

  scrollContainer.scrollTo({ top: clampedScroll, behavior })
}

/**
 * Scroll a line to center of viewport (instant to avoid lag when holding j/k)
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
      scrollElementToCenter(line, scrollContainer, 'instant')
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
 * Apply line focus styling to a line and its split-mode counterpart
 */
function applyLineFocus(element: HTMLElement | null, filePath?: string) {
  // Clear all existing line focus from shadow DOMs
  clearClassFromAllShadowRoots('line-focused')

  // Apply new focus
  if (element) {
    element.classList.add('line-focused')

    // In split mode, also highlight the matching right-column line
    if (filePath) {
      const rightLine = getMatchingRightLine(filePath, element)
      if (rightLine) {
        rightLine.classList.add('line-focused')
      }
    }
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

    // Apply new hunk highlight to ALL matching separators (both columns in split mode)
    if (
      focusedIndex !== null &&
      focusedHunkIndex !== null &&
      focusedIndex < files.length
    ) {
      const file = files[focusedIndex]
      const shadowRoot = getDiffsShadowRoot(file.path)
      if (shadowRoot) {
        const hunks = getHunkElements(file.path)
        const focusedHunk = hunks[focusedHunkIndex]
        if (focusedHunk) {
          const expandIndex = focusedHunk.getAttribute('data-expand-index')
          // Highlight ALL separators with this expand-index (both columns)
          shadowRoot.querySelectorAll('[data-separator="line-info"]').forEach((el) => {
            if (expandIndex === null || el.getAttribute('data-expand-index') === expandIndex) {
              el.classList.add('hunk-focused')
            }
          })
        }
      }
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
      applyLineFocus(lines[focusedLineIndex] || null, file.path)
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
      waitForDiffReady(file.path, () => {
        const lines = getAllDiffLines(file.path)
        if (lines.length > 0) {
          setFocusedLineIndex(0)
          const hunkIdx = getHunkIndexForLine(lines[0], file.path)
          setFocusedHunkIndex(hunkIdx)
          scrollToLine(file.path, 0, scrollContainerRef.current)
        }
      })
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
      waitForDiffReady(file.path, () => {
        const lines = getAllDiffLines(file.path)
        if (lines.length > 0) {
          const lastIdx = lines.length - 1
          setFocusedLineIndex(lastIdx)
          const hunkIdx = getHunkIndexForLine(lines[lastIdx], file.path)
          setFocusedHunkIndex(hunkIdx)
          scrollToLine(file.path, lastIdx, scrollContainerRef.current)
        }
      })
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

      // Keys that work OUTSIDE vim mode: J/K (scroll files), Ctrl-D/U, v (activate)
      const isCtrlD = key === 'd' && (e.ctrlKey || e.metaKey)
      const isCtrlU = key === 'u' && (e.ctrlKey || e.metaKey)
      const outsideKeys = key === 'J' || key === 'K' || key === 'v' || isCtrlD || isCtrlU
      if (!isActive && !outsideKeys) {
        return
      }

      // Handle Ctrl-D / Ctrl-U (half-page jump) - works in and out of vim mode
      if (isCtrlD || isCtrlU) {
        e.preventDefault()
        const container = scrollContainerRef.current

        // If not in vim mode or no focus, just scroll the viewport
        if (!isActive || focusedIndex === null || !container) {
          if (container) {
            const dir = isCtrlD ? 1 : -1
            container.scrollBy({ top: dir * container.clientHeight / 2, behavior: 'smooth' })
          }
          return
        }

        const file = files[focusedIndex]
        const lines = getAllDiffLines(file.path)
        if (lines.length === 0) return

        // Estimate half-page as ~container height / line height
        const sampleLine = lines[0]
        const lineHeight = sampleLine?.getBoundingClientRect().height || 20
        const halfPage = Math.max(1, Math.floor(container.clientHeight / 2 / lineHeight))

        const currentLine = focusedLineIndex ?? 0
        if (isCtrlD) {
          const targetLine = Math.min(currentLine + halfPage, lines.length - 1)
          if (targetLine >= lines.length - 1 && focusedIndex < files.length - 1) {
            // Past end of file → jump to next file
            navigateToFileWithFirstLine(focusedIndex + 1)
          } else {
            setFocusedLineIndex(targetLine)
            const hunkIdx = getHunkIndexForLine(lines[targetLine], file.path)
            setFocusedHunkIndex(hunkIdx)
            scrollToLine(file.path, targetLine, container)
          }
        } else {
          const targetLine = Math.max(currentLine - halfPage, 0)
          if (targetLine <= 0 && focusedIndex > 0) {
            // Past start of file → jump to prev file
            navigateToFileWithLastLine(focusedIndex - 1)
          } else {
            setFocusedLineIndex(targetLine)
            const hunkIdx = getHunkIndexForLine(lines[targetLine], file.path)
            setFocusedHunkIndex(hunkIdx)
            scrollToLine(file.path, targetLine, container)
          }
        }
        return
      }

      // J/K outside vim mode: scroll next/prev file into center view
      if (!isActive && (key === 'J' || key === 'K')) {
        e.preventDefault()
        const container = scrollContainerRef.current
        if (!container || files.length === 0) return

        // Find which file is currently most centered in view
        const containerRect = container.getBoundingClientRect()
        const containerCenter = containerRect.top + containerRect.height / 2
        let closestIdx = 0
        let closestDist = Infinity
        for (let i = 0; i < files.length; i++) {
          const el = document.getElementById(`diff-${files[i].path}`)
          if (el) {
            const rect = el.getBoundingClientRect()
            const dist = Math.abs(rect.top + rect.height / 2 - containerCenter)
            if (dist < closestDist) {
              closestDist = dist
              closestIdx = i
            }
          }
        }

        const targetIdx = key === 'J'
          ? Math.min(closestIdx + 1, files.length - 1)
          : Math.max(closestIdx - 1, 0)
        const targetEl = document.getElementById(`diff-${files[targetIdx].path}`)
        if (targetEl) {
          const targetRect = targetEl.getBoundingClientRect()
          const scrollOffset = targetRect.top - containerRect.top - (containerRect.height / 2) + (targetRect.height / 2)
          container.scrollBy({ top: scrollOffset, behavior: 'smooth' })
        }
        return
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
            waitForDiffReady(file.path, () => {
              const lines = getAllDiffLines(file.path)
              if (lines.length > 0) {
                setFocusedLineIndex(0)
                const hunkIdx = getHunkIndexForLine(lines[0], file.path)
                setFocusedHunkIndex(hunkIdx)
                scrollToLine(file.path, 0, scrollContainerRef.current)
              }
            })
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

          waitForDiffReady(file.path, () => {
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

                waitForHunksReady(prevFile.path, () => {
                  const prevHunks = getHunkElements(prevFile.path)
                  if (prevHunks.length > 0) {
                    const lastHunkIdx = prevHunks.length - 1
                    setFocusedHunkIndex(lastHunkIdx)
                    const lineIdx = getFirstLineIndexOfHunk(prevFile.path, lastHunkIdx)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(prevFile.path, lastHunkIdx, scrollContainerRef.current)
                  }
                })
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

                waitForHunksReady(prevFile.path, () => {
                  const prevHunks = getHunkElements(prevFile.path)
                  if (prevHunks.length > 0) {
                    const lastHunkIdx = prevHunks.length - 1
                    setFocusedHunkIndex(lastHunkIdx)
                    const lineIdx = getFirstLineIndexOfHunk(prevFile.path, lastHunkIdx)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(prevFile.path, lastHunkIdx, scrollContainerRef.current)
                  }
                })
              }
            }
          })
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

          waitForDiffReady(file.path, () => {
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

                waitForHunksReady(nextFile.path, () => {
                  const nextHunks = getHunkElements(nextFile.path)
                  if (nextHunks.length > 0) {
                    setFocusedHunkIndex(0)
                    const lineIdx = getFirstLineIndexOfHunk(nextFile.path, 0)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(nextFile.path, 0, scrollContainerRef.current)
                  }
                })
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

                waitForHunksReady(nextFile.path, () => {
                  const nextHunks = getHunkElements(nextFile.path)
                  if (nextHunks.length > 0) {
                    setFocusedHunkIndex(0)
                    const lineIdx = getFirstLineIndexOfHunk(nextFile.path, 0)
                    setFocusedLineIndex(lineIdx)
                    scrollToHunk(nextFile.path, 0, scrollContainerRef.current)
                  }
                })
              }
            }
          })
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
              waitForDiffReady(file.path, () => {
                const lines = getAllDiffLines(file.path)
                if (lines.length > 0) {
                  setFocusedLineIndex(0)
                  const hunkIdx = getHunkIndexForLine(lines[0], file.path)
                  setFocusedHunkIndex(hunkIdx)
                  scrollToLine(file.path, 0, scrollContainerRef.current)
                }
              })
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
              waitForDiffReady(file.path, () => {
                const lines = getAllDiffLines(file.path)
                if (lines.length > 0) {
                  setFocusedLineIndex(0)
                  const hunkIdx = getHunkIndexForLine(lines[0], file.path)
                  setFocusedHunkIndex(hunkIdx)
                  scrollToLine(file.path, 0, scrollContainerRef.current)
                }
              })
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

        case 'v': {
          e.preventDefault()
          if (!isActive) {
            activate()
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
