import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCommitDiff } from '../hooks/useGitDiff'
import { useWebSocket } from '../hooks/useWebSocket'
import { useVimNavigation } from '../hooks/useVimNavigation'
import { useEditor } from '../hooks/useEditor'
import { useTabs } from '../contexts/TabContext'
import { HeaderContent, type DiffStyle } from '../components/Header'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import { VirtualizedDiffList, type VirtualizedDiffListHandle } from '../components/VirtualizedDiffList'
import { FileMinimap } from '../components/FileMinimap'
import { Separator } from '../components/ui/separator'
import { ArrowLeft } from 'lucide-react'

export function CommitView() {
  const { sha } = useParams<{ sha: string }>()
  const { activeTab, updateTabViewState } = useTabs()
  const repoPath = activeTab?.repoPath
  const activeTabId = activeTab?.id

  const { data, loading, error } = useCommitDiff(sha || null, repoPath)
  const { isConnected } = useWebSocket()
  const { openInEditor } = useEditor()

  // Local UI state
  const [selectedFile, setSelectedFile] = useState<string | null>(
    activeTab?.viewState.selectedFile ?? null
  )
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    activeTab?.viewState.diffStyle ?? 'split'
  )

  // Track previous tab to detect switches and skip saving during switch
  const prevTabIdRef = useRef(activeTabId)
  const isTabSwitchingRef = useRef(false)

  // Sync FROM tab when switching tabs (restore tab's saved state)
  useEffect(() => {
    if (activeTabId && activeTabId !== prevTabIdRef.current) {
      isTabSwitchingRef.current = true
      prevTabIdRef.current = activeTabId

      if (activeTab) {
        setSelectedFile(activeTab.viewState.selectedFile)
        setDiffStyle(activeTab.viewState.diffStyle)
      }

      queueMicrotask(() => {
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

  const contentRef = useRef<HTMLElement>(null)
  const diffListRef = useRef<VirtualizedDiffListHandle>(null)

  const commit = data?.commit
  const files = data?.files || []

  const { focusedIndex, isActive: isVimActive } = useVimNavigation({
    files,
    diffListRef,
    scrollContainerRef: contentRef,
    openInEditor,
  })

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    diffListRef.current?.scrollToFile(path)
  }, [])

  const headerContent = (
    <Link
      to="/history"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-3.5" />
      Back to History
    </Link>
  )

  if (error) {
    return (
      <SidebarProvider>
        <AppSidebar files={[]} selectedFile={null} onSelectFile={() => {}} headerContent={headerContent} />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <HeaderContent isConnected={isConnected} />
          </header>
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Link
                to="/history"
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
              >
                Back to History
              </Link>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar
        files={files}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        title="Files"
        loading={loading}
        headerContent={headerContent}
      />
      <SidebarInset className="h-full overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <HeaderContent
            isConnected={isConnected}
            stats={commit?.stats}
            diffStyle={diffStyle}
            onDiffStyleChange={setDiffStyle}
          />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto bg-secondary/30" ref={contentRef}>
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : commit ? (
              <>
                <div className="bg-card border border-border rounded-md p-3 mb-4">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-foreground">{commit.shortSha}</span>
                    <span className="text-muted-foreground">
                      {commit.author} · {new Date(commit.date).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{commit.message}</p>
                </div>
                <VirtualizedDiffList
                  ref={diffListRef}
                  files={files}
                  diffStyle={diffStyle}
                  scrollContainerRef={contentRef}
                  focusedIndex={focusedIndex}
                  isVimActive={isVimActive}
                />
              </>
            ) : null}
          </div>
        </main>
      </SidebarInset>
      {!loading && files.length > 0 && (
        <FileMinimap
          files={files}
          onSelectFile={handleSelectFile}
          selectedFile={selectedFile}
        />
      )}
    </SidebarProvider>
  )
}
