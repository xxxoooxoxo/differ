import { useWebSocket } from '../hooks/useWebSocket'
import { useCommits } from '../hooks/useCommits'
import { useTabs } from '../contexts/TabContext'
import { HeaderContent } from '../components/Header'
import { CommitList } from '../components/CommitList'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '../components/AppSidebar'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarRail,
} from '../components/ui/sidebar'
import { Separator } from '../components/ui/separator'

export function HistoryPage() {
  const { activeTab } = useTabs()
  const repoPath = activeTab?.repoPath

  const { data, loading, error, page, goToPage } = useCommits(1, 20, repoPath)
  const { isConnected } = useWebSocket()

  if (error) {
    return (
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>History</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                  Error
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <HeaderContent isConnected={isConnected} />
          </header>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>History</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="p-3 text-xs text-muted-foreground">
                Browse commit history and view changes for each commit.
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <HeaderContent isConnected={isConnected} />
        </header>
        <main className="flex-1 overflow-y-auto bg-secondary/30">
          <div className="max-w-3xl mx-auto p-6">
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Commit History</h2>
            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <CommitList
                commits={data?.commits || []}
                page={page}
                totalPages={data?.totalPages || 1}
                onPageChange={goToPage}
              />
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
