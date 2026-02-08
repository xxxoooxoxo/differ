import { useState, useEffect, useCallback, useRef } from 'react'
import { useBranches, useCompareBranches } from '../hooks/useBranches'
import { useWebSocket } from '../hooks/useWebSocket'
import { useVimNavigation } from '../hooks/useVimNavigation'
import { useEditor } from '../hooks/useEditor'
import { useTabs } from '../contexts/TabContext'
import { HeaderContent, type DiffStyle } from '../components/Header'
import { BranchSelector } from '../components/BranchSelector'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import { VirtualizedDiffList, type VirtualizedDiffListHandle } from '../components/VirtualizedDiffList'
import { FileMinimap } from '../components/FileMinimap'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Label } from '../components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip'

export function CompareView() {
  const { activeTab, updateTabViewState, updateTabContext } = useTabs()
  const repoPath = activeTab?.repoPath
  const activeTabId = activeTab?.id

  const { data: branchData, loading: branchesLoading } = useBranches(repoPath)
  const { isConnected } = useWebSocket()
  const { openInEditor } = useEditor()

  // Local UI state
  const [baseBranch, setBaseBranch] = useState<string>(
    activeTab?.context.baseBranch ?? ''
  )
  const [headBranch, setHeadBranch] = useState<string>(
    activeTab?.context.headBranch ?? ''
  )
  const [selectedFile, setSelectedFile] = useState<string | null>(
    activeTab?.viewState.selectedFile ?? null
  )
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    activeTab?.viewState.diffStyle ?? 'split'
  )
  const [useMergeBase, setUseMergeBase] = useState<boolean>(
    activeTab?.viewState.useMergeBase ?? true
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
        setBaseBranch(activeTab.context.baseBranch ?? '')
        setHeadBranch(activeTab.context.headBranch ?? '')
        setSelectedFile(activeTab.viewState.selectedFile)
        setDiffStyle(activeTab.viewState.diffStyle)
        setUseMergeBase(activeTab.viewState.useMergeBase ?? true)
      }

      queueMicrotask(() => {
        isTabSwitchingRef.current = false
      })
    }
  }, [activeTabId, activeTab])

  // Sync TO tab when local state changes (but not during tab switch)
  useEffect(() => {
    if (activeTabId && !isTabSwitchingRef.current) {
      updateTabViewState(activeTabId, { selectedFile, diffStyle, useMergeBase })
    }
  }, [selectedFile, diffStyle, useMergeBase, activeTabId, updateTabViewState])

  // Sync branch context changes back to tab (but not during tab switch)
  useEffect(() => {
    if (activeTabId && !isTabSwitchingRef.current) {
      updateTabContext(activeTabId, { baseBranch, headBranch })
    }
  }, [baseBranch, headBranch, activeTabId, updateTabContext])

  const contentRef = useRef<HTMLElement>(null)
  const diffListRef = useRef<VirtualizedDiffListHandle>(null)

  useEffect(() => {
    if (branchData && !baseBranch) {
      const mainBranch = branchData.branches.find(b => b.name === 'main' || b.name === 'master')
      setBaseBranch(mainBranch?.name || branchData.current)
      setHeadBranch(branchData.current)
    }
  }, [branchData, baseBranch])

  const { data: compareData, loading: compareLoading, error } = useCompareBranches(
    baseBranch && headBranch && baseBranch !== headBranch ? baseBranch : null,
    baseBranch && headBranch && baseBranch !== headBranch ? headBranch : null,
    repoPath,
    { useMergeBase }
  )

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    diffListRef.current?.scrollToFile(path)
  }, [])

  const branches = branchData?.branches || []
  const files = compareData?.files || []

  const { focusedIndex, isActive: isVimActive } = useVimNavigation({
    files,
    diffListRef,
    scrollContainerRef: contentRef,
    openInEditor,
  })

  const headerContent = (
    <div className="p-3 space-y-3">
      {branchesLoading ? (
        <div className="flex items-center justify-center p-2 text-xs text-muted-foreground">Loading...</div>
      ) : (
        <>
          <BranchSelector
            branches={branches}
            selected={baseBranch}
            onChange={setBaseBranch}
            label="Base"
          />
          <BranchSelector
            branches={branches}
            selected={headBranch}
            onChange={setHeadBranch}
            label="Head"
          />
          <div className="flex items-center justify-between pt-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label className="text-xs text-muted-foreground cursor-help">
                    Show changes
                  </Label>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px]">
                  <p className="text-xs">
                    "Mine" shows only changes introduced by the head branch since it diverged from base.
                    "All" shows all differences between the two branches.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Tabs value={useMergeBase ? 'mine' : 'all'} onValueChange={(v) => setUseMergeBase(v === 'mine')}>
              <TabsList className="h-7 p-0.5">
                <TabsTrigger value="mine" className="h-6 px-2.5 text-xs">Mine</TabsTrigger>
                <TabsTrigger value="all" className="h-6 px-2.5 text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </>
      )}
    </div>
  )

  return (
    <SidebarProvider>
      <AppSidebar
        files={baseBranch === headBranch ? [] : files}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        title="Files"
        loading={compareLoading}
        headerContent={headerContent}
      />
      <SidebarInset className="h-full overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <HeaderContent
            isConnected={isConnected}
            stats={compareData?.stats}
            diffStyle={diffStyle}
            onDiffStyleChange={setDiffStyle}
          />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto bg-secondary/30" ref={contentRef}>
          <div className="p-4">
            {baseBranch === headBranch ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Select two different branches to compare
              </div>
            ) : compareLoading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                {error}
              </div>
            ) : (
              <>
                {compareData?.commitCount !== undefined && (
                  <div className="bg-card border border-border rounded-md p-3 mb-4 text-xs space-y-1">
                    <div>
                      <span className="font-mono text-foreground">{headBranch}</span>
                      <span className="text-muted-foreground"> is </span>
                      <span className="text-foreground">
                        {compareData.commitCount} commit{compareData.commitCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-muted-foreground"> ahead of </span>
                      <span className="font-mono text-foreground">
                        {useMergeBase && compareData.mergeBase ? 'merge-base' : baseBranch}
                      </span>
                    </div>
                    {useMergeBase && compareData.mergeBase && (
                      <div className="text-muted-foreground">
                        Comparing against{' '}
                        <span className="font-mono text-foreground">{compareData.mergeBase.slice(0, 7)}</span>
                        {compareData.mergeBaseDate && (
                          <>
                            {' '}
                            ({new Date(compareData.mergeBaseDate).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })})
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <VirtualizedDiffList
                  ref={diffListRef}
                  files={files}
                  diffStyle={diffStyle}
                  scrollContainerRef={contentRef}
                  focusedIndex={focusedIndex}
                  isVimActive={isVimActive}
                />
              </>
            )}
          </div>
        </main>
      </SidebarInset>
      {!compareLoading && files.length > 0 && baseBranch !== headBranch && (
        <FileMinimap
          files={files}
          onSelectFile={handleSelectFile}
          selectedFile={selectedFile}
        />
      )}
    </SidebarProvider>
  )
}
