import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePRDiff } from '../hooks/usePRs'
import { useWebSocket } from '../hooks/useWebSocket'
import { useVimNavigation } from '../hooks/useVimNavigation'
import { useEditor } from '../hooks/useEditor'
import { useTabs } from '../contexts/TabContext'
import { HeaderContent, type DiffStyle } from '../components/Header'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import { VirtualizedDiffList, type VirtualizedDiffListHandle } from '../components/VirtualizedDiffList'
import { Separator } from '../components/ui/separator'
import { Button } from '../components/ui/button'
import { ArrowLeft, GitPullRequest, RefreshCw, GitBranch, ExternalLink } from 'lucide-react'
import { cn } from '../lib/utils'
import { getRemoteInfo } from '../lib/api'

export function PRView() {
  const { number } = useParams<{ number: string }>()
  const prNumber = number ? parseInt(number, 10) : null

  const { activeTab, updateTabViewState } = useTabs()
  const repoPath = activeTab?.repoPath
  const activeTabId = activeTab?.id

  const { data, loading, error, refetch } = usePRDiff(prNumber, repoPath)
  const { isConnected } = useWebSocket()
  const { openInEditor } = useEditor()

  // Local UI state
  const [selectedFile, setSelectedFile] = useState<string | null>(
    activeTab?.viewState.selectedFile ?? null
  )
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    activeTab?.viewState.diffStyle ?? 'split'
  )
  const [prUrl, setPrUrl] = useState<string | null>(null)

  // Fetch remote info to build PR URL
  useEffect(() => {
    if (prNumber) {
      getRemoteInfo(repoPath).then((remote) => {
        if (remote && remote.provider === 'github') {
          setPrUrl(`https://github.com/${remote.owner}/${remote.repo}/pull/${prNumber}`)
        }
      })
    }
  }, [prNumber, repoPath])

  // Track previous tab to detect switches
  const prevTabIdRef = useRef(activeTabId)
  const isTabSwitchingRef = useRef(false)

  // Sync FROM tab when switching tabs
  useEffect(() => {
    if (activeTabId && activeTabId !== prevTabIdRef.current) {
      isTabSwitchingRef.current = true
      prevTabIdRef.current = activeTabId

      if (activeTab) {
        setSelectedFile(activeTab.viewState.selectedFile)
        setDiffStyle(activeTab.viewState.diffStyle)
      }

      requestAnimationFrame(() => {
        isTabSwitchingRef.current = false
      })
    }
  }, [activeTabId, activeTab])

  // Sync TO tab when local state changes
  useEffect(() => {
    if (activeTabId && !isTabSwitchingRef.current) {
      updateTabViewState(activeTabId, { selectedFile, diffStyle })
    }
  }, [selectedFile, diffStyle, activeTabId, updateTabViewState])

  const contentRef = useRef<HTMLElement>(null)
  const diffListRef = useRef<VirtualizedDiffListHandle>(null)

  const pr = data?.pr
  const files = data?.files || []

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

  const stateColor = pr?.state === 'open'
    ? 'text-green-500'
    : pr?.state === 'merged'
      ? 'text-purple-500'
      : 'text-red-500'

  const headerContent = (
    <Link
      to="/prs"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-3.5" />
      Back to PRs
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
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={refetch}>
                  <RefreshCw className="size-4 mr-2" />
                  Retry
                </Button>
                <Link
                  to="/prs"
                  className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors inline-flex items-center"
                >
                  Back to PRs
                </Link>
              </div>
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
            stats={data?.stats}
            diffStyle={diffStyle}
            onDiffStyleChange={setDiffStyle}
          />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={refetch} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            </Button>
            {prUrl && (
              <Button variant="ghost" size="icon" asChild>
                <a href={prUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            )}
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto bg-secondary/30" ref={contentRef}>
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : pr ? (
              <>
                <div className="bg-card border border-border rounded-md p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <GitPullRequest className={cn('size-4', stateColor)} />
                    <span className="font-mono text-sm text-foreground">#{pr.number}</span>
                    <span className={cn('text-xs font-medium capitalize px-1.5 py-0.5 rounded', stateColor, 'bg-current/10')}>
                      {pr.state}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-2">{pr.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{pr.author}</span>
                    {pr.baseRef && pr.headRef && (
                      <span className="flex items-center gap-1">
                        <GitBranch className="size-3" />
                        {pr.baseRef} <span className="text-muted-foreground/50">&larr;</span> {pr.headRef}
                      </span>
                    )}
                    {data.commitCount > 0 && (
                      <span>{data.commitCount} commit{data.commitCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <VirtualizedDiffList
                  ref={diffListRef}
                  files={files}
                  diffStyle={diffStyle}
                  scrollContainerRef={contentRef}
                  focusedIndex={focusedIndex}
                />
              </>
            ) : null}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
