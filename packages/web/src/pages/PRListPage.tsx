import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePRList, type PRInfo } from '../hooks/usePRs'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTabs } from '../contexts/TabContext'
import { HeaderContent } from '../components/Header'
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
import { Button } from '../components/ui/button'
import { GitPullRequest, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { cn } from '../lib/utils'

function PRListItem({ pr, onClick }: { pr: PRInfo; onClick: () => void }) {
  const stateColor = pr.state === 'open'
    ? 'text-green-500'
    : pr.state === 'merged'
      ? 'text-purple-500'
      : 'text-red-500'

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <GitPullRequest className={cn('size-4', stateColor)} />
        <span className="font-mono text-xs text-muted-foreground">#{pr.number}</span>
        <span className={cn('text-xs font-medium capitalize', stateColor)}>
          {pr.state}
        </span>
      </div>
      <div className="text-sm font-medium text-foreground mb-1 line-clamp-2">
        {pr.title}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{pr.author}</span>
        {pr.updatedAt && (
          <>
            <span>·</span>
            <span>{formatDate(pr.updatedAt)}</span>
          </>
        )}
        {pr.changedFiles !== undefined && (
          <>
            <span>·</span>
            <span>{pr.changedFiles} files</span>
          </>
        )}
      </div>
      {(pr.additions !== undefined || pr.deletions !== undefined) && (
        <div className="flex items-center gap-2 text-xs mt-1">
          {pr.additions !== undefined && (
            <span className="text-green-500">+{pr.additions}</span>
          )}
          {pr.deletions !== undefined && (
            <span className="text-red-500">-{pr.deletions}</span>
          )}
        </div>
      )}
    </button>
  )
}

export function PRListPage() {
  const { activeTab, createTab } = useTabs()
  const repoPath = activeTab?.repoPath
  const navigate = useNavigate()

  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open')
  const { data, loading, error, refetch } = usePRList({ state: stateFilter }, repoPath)
  const { isConnected } = useWebSocket()

  const handlePRClick = (pr: PRInfo) => {
    createTab({
      type: 'pr',
      label: `PR #${pr.number}`,
      context: { prNumber: pr.number },
      repoPath,
    })
    navigate(`/prs/${pr.number}`)
  }

  if (error) {
    return (
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Pull Requests</SidebarGroupLabel>
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
            <div className="text-center">
              <AlertCircle className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                <RefreshCw className="size-4 mr-2" />
                Retry
              </Button>
            </div>
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
            <SidebarGroupLabel>Pull Requests</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="p-3 text-xs text-muted-foreground">
                Browse and review pull requests without checking them out.
              </div>
              {!data?.hasGhCli && (data?.prs?.length ?? 0) > 0 && (
                <div className="mx-3 mb-3 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="size-3 inline mr-1" />
                  Install <code className="font-mono">gh</code> CLI for full PR metadata
                </div>
              )}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-muted-foreground">Pull Requests</h2>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border overflow-hidden">
                  {(['open', 'closed', 'all'] as const).map((state) => (
                    <button
                      key={state}
                      onClick={() => setStateFilter(state)}
                      className={cn(
                        'px-3 py-1 text-xs capitalize transition-colors',
                        stateFilter === state
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:bg-accent/50'
                      )}
                    >
                      {state}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" onClick={refetch} disabled={loading}>
                  <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : data?.prs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <GitPullRequest className="size-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  No {stateFilter === 'all' ? '' : stateFilter} pull requests found
                </p>
                {data?.provider === 'unknown' && (
                  <p className="text-xs text-muted-foreground">
                    PR browsing requires a GitHub remote
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {data?.prs.map((pr) => (
                  <PRListItem key={pr.number} pr={pr} onClick={() => handlePRClick(pr)} />
                ))}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
