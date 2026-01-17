import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useEditor, type EditorType } from '../hooks/useEditor'
import { useWorktrees, type WorktreeInfo } from '../hooks/useWorktrees'
import { useBranches } from '../hooks/useBranches'
import { useRemoteUrl, type RemoteInfo } from '../hooks/useRemoteUrl'
import { useFetch } from '../hooks/useFetch'
import { useTabs } from '../contexts/TabContext'
import { checkoutPR, openPRWorktree } from '../lib/api'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { GitBranch, Folder, ChevronDown, ExternalLink, GitPullRequest, Eye, CloudDownload, Loader2, GitFork, MoreHorizontal, Download } from 'lucide-react'

export type DiffStyle = 'split' | 'unified'

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Combined Branches + Worktrees dropdown
function BranchesDropdown() {
  const { activeTab, createTab } = useTabs()
  const { data: branchData, loading: branchLoading } = useBranches(activeTab?.repoPath)
  const { data: worktreeData, loading: worktreeLoading, switching, switchWorktree } = useWorktrees(false)
  const { editor } = useEditor()
  const navigate = useNavigate()

  const branches = branchData?.branches ?? []
  const currentBranch = branchData?.current ?? 'main'
  const worktrees = worktreeData?.worktrees ?? []
  const worktreeCount = worktrees.length

  // Find the main/master branch for comparison base
  const mainBranch = branches.find(b => b.name === 'main' || b.name === 'master')?.name || branches[0]?.name

  // Get display info from the current tab
  const tabType = activeTab?.type
  const tabLabel = activeTab?.label ?? currentBranch
  const isCompareTab = tabType === 'branch-compare'
  const isWorktreeTab = tabType === 'worktree'
  const isPrTab = tabType === 'pr'
  const displayBranch = isCompareTab
    ? activeTab?.context.headBranch
    : isPrTab
      ? `PR #${activeTab?.context.prNumber}`
      : currentBranch

  const handleSelectBranch = (branchName: string) => {
    // Always open in a new tab
    if (branchName === mainBranch) {
      createTab({
        type: 'working-changes',
        label: 'Changes',
      })
      navigate('/')
    } else {
      createTab({
        type: 'branch-compare',
        label: `${mainBranch}...${branchName}`,
        context: {
          baseBranch: mainBranch,
          headBranch: branchName,
        },
      })
      navigate(`/compare?base=${mainBranch}&head=${branchName}`)
    }
  }

  const openInEditor = (path: string) => {
    const editorUrls: Record<EditorType, string> = {
      vscode: `vscode://file${path}`,
      cursor: `cursor://file${path}`,
      zed: `zed://file${path}`,
      sublime: `subl://open?url=file://${path}`,
      webstorm: `webstorm://open?file=${path}`,
      idea: `idea://open?file=${path}`,
    }
    window.location.href = editorUrls[editor]
  }

  const handleOpenWorktree = (wt: WorktreeInfo) => {
    // Open worktree in a new tab
    createTab({
      type: 'worktree',
      label: wt.branch,
      repoPath: wt.path,
    })
    navigate('/')
  }

  if (branchLoading && worktreeLoading) return null

  const activeWorktree = worktrees.find(w => w.isActive)
  const mainWorktree = worktrees.find(w => w.branch === 'main' || w.branch === 'master') || worktrees.find(w => w.isCurrent)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7" disabled={switching}>
          <GitBranch className="size-3.5" />
          <span className="max-w-28 truncate text-xs">{displayBranch || currentBranch}</span>
          {worktreeCount > 1 && (
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {worktreeCount}
            </Badge>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-y-auto">
        {/* Branches section */}
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Compare branch
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.slice(0, 10).map((branch) => {
          const isMain = branch.name === mainBranch
          // Highlight based on current tab's context
          const isSelected = isCompareTab
            ? activeTab?.context.headBranch === branch.name
            : branch.current && !isCompareTab && !isWorktreeTab && !isPrTab
          return (
            <DropdownMenuItem
              key={branch.name}
              className={`gap-2 ${isSelected ? 'bg-accent/50' : ''}`}
              onClick={() => handleSelectBranch(branch.name)}
            >
              <span className="font-mono text-xs truncate flex-1">{branch.name}</span>
              {branch.current && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  HEAD
                </Badge>
              )}
              {isMain && !branch.current && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  base
                </Badge>
              )}
            </DropdownMenuItem>
          )
        })}
        {branches.length > 10 && (
          <DropdownMenuItem
            className="justify-center text-xs text-muted-foreground"
            onClick={() => navigate('/compare')}
          >
            View all {branches.length} branches...
          </DropdownMenuItem>
        )}

        {/* Worktrees section - only show if there are worktrees */}
        {worktreeCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Worktrees (open in new tab)
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {worktrees.map((wt: WorktreeInfo) => {
              const isMain = wt.branch === 'main' || wt.branch === 'master'
              // Check if this worktree is being viewed in the current tab
              const isViewingThis = activeTab?.repoPath === wt.path
              return (
                <DropdownMenuItem
                  key={wt.path}
                  className={`flex-col items-start gap-1 py-2 ${isViewingThis ? 'bg-accent/50' : ''}`}
                  onClick={() => handleOpenWorktree(wt)}
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-mono text-xs font-medium">{wt.branch}</span>
                    {isViewingThis && (
                      <Badge variant="default" className="h-4 px-1.5 text-[10px] bg-emerald-600">
                        viewing
                      </Badge>
                    )}
                    {isMain && !isViewingThis && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                        main
                      </Badge>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-5"
                        title="Open in editor"
                        onClick={(e) => {
                          e.stopPropagation()
                          openInEditor(wt.path)
                        }}
                      >
                        <Folder className="size-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {wt.behindMain > 0 && (
                      <span className="text-amber-500">{wt.behindMain} behind</span>
                    )}
                    {wt.aheadOfMain > 0 && (
                      <span className="text-emerald-500">{wt.aheadOfMain} ahead</span>
                    )}
                    <span className="text-muted-foreground">{formatRelativeTime(wt.lastActivity)}</span>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getRemoteUrls(remote: RemoteInfo, branch: string) {
  const { url, provider } = remote

  switch (provider) {
    case 'github':
      return {
        viewBranch: `${url}/tree/${branch}`,
        createPr: `${url}/compare/${branch}?expand=1`,
        viewPrs: `${url}/pulls`,
      }
    case 'gitlab':
      return {
        viewBranch: `${url}/-/tree/${branch}`,
        createPr: `${url}/-/merge_requests/new?merge_request[source_branch]=${branch}`,
        viewPrs: `${url}/-/merge_requests`,
      }
    case 'bitbucket':
      return {
        viewBranch: `${url}/src/${branch}`,
        createPr: `${url}/pull-requests/new?source=${branch}`,
        viewPrs: `${url}/pull-requests`,
      }
    default:
      return {
        viewBranch: url,
        createPr: url,
        viewPrs: url,
      }
  }
}

function getProviderName(provider: RemoteInfo['provider']): string {
  switch (provider) {
    case 'github':
      return 'GitHub'
    case 'gitlab':
      return 'GitLab'
    case 'bitbucket':
      return 'Bitbucket'
    default:
      return 'Remote'
  }
}

// Combined Git Actions dropdown (Fetch + GitHub/Remote + PR checkout)
function GitActionsDropdown() {
  const { activeTab, createTab } = useTabs()
  const { remote, loading: remoteLoading } = useRemoteUrl()
  const { data: branchData } = useBranches(activeTab?.repoPath)
  const { loading: isFetching, performFetch } = useFetch()
  const navigate = useNavigate()
  const [prNumber, setPrNumber] = useState('')
  const [checkingOutPr, setCheckingOutPr] = useState(false)
  const [prError, setPrError] = useState<string | null>(null)

  const currentBranch = branchData?.current ?? 'main'
  const providerName = remote ? getProviderName(remote.provider) : 'Remote'
  const urls = remote ? getRemoteUrls(remote, currentBranch) : null

  const handleOpenPR = async () => {
    if (!prNumber.trim()) return
    const prNum = parseInt(prNumber.trim(), 10)
    if (isNaN(prNum)) {
      setPrError('Invalid PR number')
      return
    }

    setCheckingOutPr(true)
    setPrError(null)
    try {
      // Open PR in a new worktree and create a tab for it
      const result = await openPRWorktree(prNum)
      setPrNumber('')

      // Create a new PR tab with the worktree path
      createTab({
        type: 'pr',
        label: `PR #${prNum}`,
        repoPath: result.worktreePath,
        context: {
          prNumber: prNum,
          prBranch: result.branchName,
        },
      })
      navigate('/')
    } catch (err) {
      setPrError(err instanceof Error ? err.message : 'Failed to open PR')
    } finally {
      setCheckingOutPr(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7">
          {isFetching || checkingOutPr ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="size-3.5" />
          )}
          <span className="text-xs">Git</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* Fetch action */}
        <DropdownMenuItem
          className="gap-2"
          onClick={() => performFetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CloudDownload className="size-3.5" />
          )}
          <span className="text-xs">Fetch from remote</span>
        </DropdownMenuItem>

        {/* Remote/GitHub actions - only show if remote is available */}
        {remote && urls && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              {remote.owner}/{remote.repo}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onClick={() => window.open(urls.viewBranch, '_blank')}
            >
              <Eye className="size-3.5" />
              <span className="text-xs">View branch on {providerName}</span>
              <ExternalLink className="ml-auto size-3 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onClick={() => window.open(urls.createPr, '_blank')}
            >
              <GitPullRequest className="size-3.5" />
              <span className="text-xs">Create Pull Request</span>
              <ExternalLink className="ml-auto size-3 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onClick={() => window.open(urls.viewPrs, '_blank')}
            >
              <GitFork className="size-3.5" />
              <span className="text-xs">View Pull Requests</span>
              <ExternalLink className="ml-auto size-3 text-muted-foreground" />
            </DropdownMenuItem>

            {/* Open PR in new tab section */}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Open PR in new tab
            </DropdownMenuLabel>
            <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  placeholder="PR #"
                  value={prNumber}
                  onChange={(e) => {
                    setPrNumber(e.target.value)
                    setPrError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleOpenPR()
                    }
                  }}
                  className="h-7 text-xs flex-1"
                  disabled={checkingOutPr}
                />
                <Button
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleOpenPR}
                  disabled={checkingOutPr || !prNumber.trim()}
                >
                  {checkingOutPr ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                </Button>
              </div>
              {prError && (
                <p className="text-[10px] text-red-400 mt-1">{prError}</p>
              )}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface HeaderProps {
  isConnected: boolean
  stats?: {
    additions: number
    deletions: number
    files: number
  }
  diffStyle?: DiffStyle
  onDiffStyleChange?: (style: DiffStyle) => void
  children?: React.ReactNode
}

// Navigation component for the header
export function HeaderNav() {
  const location = useLocation()

  return (
    <nav className="flex items-center">
      <Link
        to="/"
        className={`px-3 py-1.5 text-sm transition-colors ${
          location.pathname === '/'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Changes
      </Link>
      <Link
        to="/history"
        className={`px-3 py-1.5 text-sm transition-colors ${
          location.pathname.startsWith('/history') || location.pathname.startsWith('/commit')
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        History
      </Link>
      <Link
        to="/compare"
        className={`px-3 py-1.5 text-sm transition-colors ${
          location.pathname.startsWith('/compare')
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Compare
      </Link>
    </nav>
  )
}

// Stats display
export function HeaderStats({ stats }: { stats: { additions: number; deletions: number; files: number } }) {
  return (
    <div className="flex items-center gap-4 font-mono text-xs">
      <span className="text-emerald-500">+{stats.additions}</span>
      <span className="text-red-400">-{stats.deletions}</span>
      <span className="text-muted-foreground">
        {stats.files} file{stats.files !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

// Controls component
export function HeaderControls({
  diffStyle,
  onDiffStyleChange,
  isConnected,
}: {
  diffStyle?: DiffStyle
  onDiffStyleChange?: (style: DiffStyle) => void
  isConnected: boolean
}) {
  const { editor, setEditor, editors, editorTypes } = useEditor()

  return (
    <div className="flex items-center gap-2">
      {onDiffStyleChange && (
        <Tabs value={diffStyle} onValueChange={(v) => onDiffStyleChange(v as DiffStyle)}>
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="split" className="h-6 px-2.5 text-xs">Split</TabsTrigger>
            <TabsTrigger value="unified" className="h-6 px-2.5 text-xs">Unified</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <Select value={editor} onValueChange={(v) => setEditor(v as EditorType)}>
        <SelectTrigger size="sm" className="h-7 w-auto min-w-[90px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {editorTypes.map((key) => (
            <SelectItem key={key} value={key}>
              {editors[key].name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <BranchesDropdown />
      <GitActionsDropdown />

      <div className="flex items-center gap-1.5 pl-2 text-xs text-muted-foreground">
        <span
          className={`size-1.5 rounded-full ${
            isConnected ? 'bg-emerald-500' : 'bg-red-400'
          }`}
        />
        {isConnected ? 'Live' : 'Offline'}
      </div>
    </div>
  )
}

// Inner header content (without wrapper)
export function HeaderContent({ isConnected, stats, diffStyle, onDiffStyleChange, children }: HeaderProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <GitBranch className="size-4 text-muted-foreground" />
          <span>differ</span>
        </h1>
        <span className="h-4 w-px bg-border" />
        <HeaderNav />
      </div>

      {stats && (
        <div className="ml-6">
          <HeaderStats stats={stats} />
        </div>
      )}

      {children}

      <div className="ml-auto">
        <HeaderControls
          diffStyle={diffStyle}
          onDiffStyleChange={onDiffStyleChange}
          isConnected={isConnected}
        />
      </div>
    </>
  )
}

// Full header with wrapper (for standalone use)
export function Header({ isConnected, stats, diffStyle, onDiffStyleChange }: HeaderProps) {
  return (
    <header className="flex h-14 items-center border-b border-border bg-background px-4">
      <HeaderContent
        isConnected={isConnected}
        stats={stats}
        diffStyle={diffStyle}
        onDiffStyleChange={onDiffStyleChange}
      />
    </header>
  )
}
