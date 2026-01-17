import { useState, useCallback, useRef, useEffect } from 'react'
import { useGitDiff } from '../hooks/useGitDiff'
import { useWebSocket } from '../hooks/useWebSocket'
import { useVimNavigation } from '../hooks/useVimNavigation'
import { useEditor } from '../hooks/useEditor'
import { useDiffFilters } from '../hooks/useDiffFilters'
import { useTabs } from '../contexts/TabContext'
import { HeaderContent, type DiffStyle } from '../components/Header'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import { VirtualizedDiffList, type VirtualizedDiffListHandle } from '../components/VirtualizedDiffList'
import { DiffToolbar } from '../components/DiffToolbar'
import { Separator } from '../components/ui/separator'

export function CurrentChanges() {
  const { activeTab, updateTabViewState } = useTabs()
  const repoPath = activeTab?.repoPath
  const activeTabId = activeTab?.id

  const { data, loading, error, refetch } = useGitDiff(repoPath)

  // Local UI state
  const [selectedFile, setSelectedFile] = useState<string | null>(
    activeTab?.viewState.selectedFile ?? null
  )
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    activeTab?.viewState.diffStyle ?? 'split'
  )
  const [showFilterBar, setShowFilterBar] = useState(true)

  // Track previous tab to detect switches and skip saving during switch
  const prevTabIdRef = useRef(activeTabId)
  const isTabSwitchingRef = useRef(false)

  // Sync FROM tab when switching tabs (restore tab's saved state)
  useEffect(() => {
    if (activeTabId && activeTabId !== prevTabIdRef.current) {
      // Mark that we're switching tabs - prevents sync TO from saving stale state
      isTabSwitchingRef.current = true
      prevTabIdRef.current = activeTabId

      // Restore state from new tab
      if (activeTab) {
        setSelectedFile(activeTab.viewState.selectedFile)
        setDiffStyle(activeTab.viewState.diffStyle)
      }

      // Clear the flag after state updates have been applied
      requestAnimationFrame(() => {
        isTabSwitchingRef.current = false
      })
    }
  }, [activeTabId, activeTab])

  // Sync TO tab when local state changes (but not during tab switch)
  useEffect(() => {
    if (activeTabId && !isTabSwitchingRef.current) {
      updateTabViewState(activeTabId, { selectedFile, diffStyle })
    }
  }, [selectedFile, diffStyle, activeTabId, updateTabViewState])

  const { isConnected } = useWebSocket(refetch)
  const { openInEditor } = useEditor()

  // Toggle filter bar with 'f' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }
        e.preventDefault()
        setShowFilterBar((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const contentRef = useRef<HTMLElement>(null)
  const diffListRef = useRef<VirtualizedDiffListHandle>(null)

  const allFiles = data?.files || []
  const {
    filters,
    setFilters,
    resetFilters,
    toggleExtension,
    toggleStatus,
    filteredFiles,
    hasActiveFilters,
    availableExtensions,
  } = useDiffFilters(allFiles)

  const files = filteredFiles

  const { focusedIndex } = useVimNavigation({
    files,
    diffListRef,
    scrollContainerRef: contentRef,
    openInEditor,
  })

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    diffListRef.current?.scrollToFile(path)
  }, [])

  if (error) {
    return (
      <SidebarProvider>
        <AppSidebar files={[]} selectedFile={null} onSelectFile={() => {}} />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <HeaderContent isConnected={isConnected} />
          </header>
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                onClick={refetch}
              >
                Retry
              </button>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar
        files={data?.files || []}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        title="Files"
        loading={loading}
      />
      <SidebarInset className="h-full overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <HeaderContent
            isConnected={isConnected}
            stats={data?.stats}
            diffStyle={diffStyle}
            onDiffStyleChange={setDiffStyle}
          />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto bg-secondary/30" ref={contentRef}>
          <div className="p-4 pb-20">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <VirtualizedDiffList
                ref={diffListRef}
                files={files}
                diffStyle={diffStyle}
                scrollContainerRef={contentRef}
                focusedIndex={focusedIndex}
              />
            )}
          </div>
        </main>
        {!loading && allFiles.length > 0 && (
          <DiffToolbar
            filters={filters}
            setFilters={setFilters}
            resetFilters={resetFilters}
            toggleExtension={toggleExtension}
            toggleStatus={toggleStatus}
            hasActiveFilters={hasActiveFilters}
            availableExtensions={availableExtensions}
            totalCount={allFiles.length}
            filteredCount={files.length}
            visible={showFilterBar}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
