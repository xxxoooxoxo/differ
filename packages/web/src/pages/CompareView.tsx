import { useState, useEffect, useCallback, useRef } from 'react'
import { useBranches, useCompareBranches } from '../hooks/useBranches'
import { useWebSocket } from '../hooks/useWebSocket'
import { useVimNavigation } from '../hooks/useVimNavigation'
import { useEditor } from '../hooks/useEditor'
import { HeaderContent, type DiffStyle } from '../components/Header'
import { BranchSelector } from '../components/BranchSelector'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import { VirtualizedDiffList, type VirtualizedDiffListHandle } from '../components/VirtualizedDiffList'
import { Separator } from '../components/ui/separator'

export function CompareView() {
  const { data: branchData, loading: branchesLoading } = useBranches()
  const { isConnected } = useWebSocket()
  const { openInEditor } = useEditor()

  const [baseBranch, setBaseBranch] = useState<string>('')
  const [headBranch, setHeadBranch] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split')

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
    baseBranch && headBranch && baseBranch !== headBranch ? headBranch : null
  )

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
    diffListRef.current?.scrollToFile(path)
  }, [])

  const branches = branchData?.branches || []
  const files = compareData?.files || []

  const { focusedIndex } = useVimNavigation({
    files,
    diffListRef,
    scrollContainerRef: contentRef,
    openInEditor,
  })

  const headerContent = (
    <div className="p-3 space-y-2">
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
      <SidebarInset className="h-svh overflow-hidden">
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
                  <div className="bg-card border border-border rounded-md p-3 mb-4 text-xs">
                    <span className="font-mono text-foreground">{headBranch}</span>
                    <span className="text-muted-foreground"> is </span>
                    <span className="text-foreground">
                      {compareData.commitCount} commit{compareData.commitCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-muted-foreground"> ahead of </span>
                    <span className="font-mono text-foreground">{baseBranch}</span>
                  </div>
                )}
                <VirtualizedDiffList
                  ref={diffListRef}
                  files={files}
                  diffStyle={diffStyle}
                  scrollContainerRef={contentRef}
                  focusedIndex={focusedIndex}
                />
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
