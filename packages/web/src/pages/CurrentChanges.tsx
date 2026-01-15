import { useState, useCallback, useRef } from 'react'
import { useGitDiff } from '../hooks/useGitDiff'
import { useWebSocket } from '../hooks/useWebSocket'
import { HeaderContent, type DiffStyle } from '../components/Header'
import { AppSidebar, SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import { VirtualizedDiffList, type VirtualizedDiffListHandle } from '../components/VirtualizedDiffList'
import { Separator } from '../components/ui/separator'

export function CurrentChanges() {
  const { data, loading, error, refetch } = useGitDiff()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split')

  const { isConnected } = useWebSocket(refetch)

  const contentRef = useRef<HTMLElement>(null)
  const diffListRef = useRef<VirtualizedDiffListHandle>(null)

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
      <SidebarInset>
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
        <main className="flex-1 overflow-y-auto bg-secondary/30" ref={contentRef}>
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <VirtualizedDiffList
                ref={diffListRef}
                files={data?.files || []}
                diffStyle={diffStyle}
                scrollContainerRef={contentRef}
              />
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
