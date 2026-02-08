import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GitBranchIcon,
  GitPullRequestIcon,
  FolderGit2Icon,
  GitCommitIcon,
  FileTextIcon,
  HistoryIcon,
  ColumnsIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  SettingsIcon,
} from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '../ui/command'
import { Badge } from '../ui/badge'
import { useCommandPalette } from './CommandPaletteContext'
import { useTabs, useTabRepoPath } from '../../contexts/TabContext'
import {
  getBranches,
  listPRs,
  getWorktrees,
  getCommits,
  fetchFromRemote,
  isTauri,
  type BranchInfo,
  type PRInfo,
  type WorktreeInfo,
  type CommitInfo,
} from '../../lib/api'

interface CommandPaletteData {
  branches: BranchInfo[]
  currentBranch: string
  prs: PRInfo[]
  worktrees: WorktreeInfo[]
  commits: CommitInfo[]
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette()
  const { createTab, activeTab } = useTabs()
  const repoPath = useTabRepoPath()
  const navigate = useNavigate()

  const [data, setData] = useState<CommandPaletteData>({
    branches: [],
    currentBranch: '',
    prs: [],
    worktrees: [],
    commits: [],
  })
  const [loading, setLoading] = useState(false)

  // Fetch data when palette opens
  useEffect(() => {
    if (!isOpen) return

    setLoading(true)

    const fetchData = async () => {
      try {
        // Fetch all data in parallel
        const [branchesResult, commitsResult, ...optionalResults] = await Promise.all([
          getBranches(repoPath).catch(() => ({ branches: [], current: '' })),
          getCommits(1, 30, repoPath).catch(() => ({ commits: [], total: 0 })),
          // These are only available in web mode, not Tauri
          !isTauri() ? listPRs({ state: 'open', limit: 20 }, repoPath).catch(() => ({ prs: [] })) : Promise.resolve({ prs: [] }),
          !isTauri() ? getWorktrees().catch(() => ({ worktrees: [] })) : Promise.resolve({ worktrees: [] }),
        ])

        setData({
          branches: branchesResult.branches,
          currentBranch: branchesResult.current,
          prs: optionalResults[0]?.prs || [],
          worktrees: optionalResults[1]?.worktrees || [],
          commits: commitsResult.commits,
        })
      } catch (err) {
        console.error('Failed to fetch command palette data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, repoPath])

  // Navigation commands
  const handleNavigate = useCallback((route: string) => {
    navigate(route)
    close()
  }, [navigate, close])

  // Branch selection - open compare view in new tab
  const handleBranchSelect = useCallback((branch: BranchInfo) => {
    const baseBranch = data.currentBranch || 'main'
    createTab({
      type: 'branch-compare',
      label: `${baseBranch}...${branch.name}`,
      context: {
        baseBranch,
        headBranch: branch.name,
      },
      route: `/compare?base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(branch.name)}`,
    })
    navigate(`/compare?base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(branch.name)}`)
    close()
  }, [createTab, navigate, close, data.currentBranch])

  // PR selection - open PR view in new tab
  const handlePRSelect = useCallback((pr: PRInfo) => {
    createTab({
      type: 'pr',
      label: `PR #${pr.number}`,
      context: {
        prNumber: pr.number,
        prBranch: pr.headRef,
      },
      route: `/prs/${pr.number}`,
    })
    navigate(`/prs/${pr.number}`)
    close()
  }, [createTab, navigate, close])

  // Commit selection - open commit view in new tab
  const handleCommitSelect = useCallback((commit: CommitInfo) => {
    createTab({
      type: 'commit',
      label: commit.shortSha,
      context: {
        commitSha: commit.sha,
      },
      route: `/commit/${commit.sha}`,
    })
    navigate(`/commit/${commit.sha}`)
    close()
  }, [createTab, navigate, close])

  // Worktree selection - switch context
  const handleWorktreeSelect = useCallback(async (worktree: WorktreeInfo) => {
    // For worktrees, we create a new tab with the worktree's repoPath
    createTab({
      type: 'working-changes',
      label: `${worktree.branch} (worktree)`,
      repoPath: worktree.path,
      route: '/',
    })
    navigate('/')
    close()
  }, [createTab, navigate, close])

  // Action: Fetch from remote
  const handleFetch = useCallback(async () => {
    try {
      await fetchFromRemote()
      close()
    } catch (err) {
      console.error('Failed to fetch:', err)
    }
  }, [close])

  // Action: Toggle diff style
  const handleToggleDiffStyle = useCallback(() => {
    // Get current diff style and toggle
    const currentStyle = activeTab?.viewState.diffStyle || 'split'
    const newStyle = currentStyle === 'split' ? 'unified' : 'split'

    // Dispatch custom event that pages can listen to
    window.dispatchEvent(new CustomEvent('diffy:toggle-diff-style', { detail: newStyle }))
    close()
  }, [activeTab, close])

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput placeholder="Search commands, branches, PRs, commits..." />
      <CommandList>
        <CommandEmpty>
          {loading ? 'Loading...' : 'No results found.'}
        </CommandEmpty>

        {/* Navigation Commands */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleNavigate('/')}>
            <FileTextIcon className="text-muted-foreground" />
            <span>Go to Changes</span>
            <CommandShortcut>g c</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/history')}>
            <HistoryIcon className="text-muted-foreground" />
            <span>Go to History</span>
            <CommandShortcut>g h</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/prs')}>
            <GitPullRequestIcon className="text-muted-foreground" />
            <span>Go to Pull Requests</span>
            <CommandShortcut>g p</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate('/compare')}>
            <ColumnsIcon className="text-muted-foreground" />
            <span>Go to Compare</span>
            <CommandShortcut>g b</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Branches */}
        {data.branches.length > 0 && (
          <>
            <CommandGroup heading="Branches">
              {data.branches.slice(0, 10).map((branch) => (
                <CommandItem
                  key={branch.name}
                  value={`branch ${branch.name}`}
                  onSelect={() => handleBranchSelect(branch)}
                >
                  <GitBranchIcon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {branch.current && (
                    <Badge variant="secondary" className="text-xs">current</Badge>
                  )}
                </CommandItem>
              ))}
              {data.branches.length > 10 && (
                <CommandItem disabled className="text-muted-foreground text-xs">
                  ...and {data.branches.length - 10} more branches
                </CommandItem>
              )}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Pull Requests */}
        {data.prs.length > 0 && (
          <>
            <CommandGroup heading="Pull Requests">
              {data.prs.slice(0, 8).map((pr) => (
                <CommandItem
                  key={pr.number}
                  value={`pr ${pr.number} ${pr.title}`}
                  onSelect={() => handlePRSelect(pr)}
                >
                  <GitPullRequestIcon className="text-muted-foreground" />
                  <span className="text-muted-foreground">#{pr.number}</span>
                  <span className="flex-1 truncate">{pr.title}</span>
                  <Badge
                    variant={pr.state === 'open' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {pr.state}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Worktrees */}
        {data.worktrees.length > 0 && (
          <>
            <CommandGroup heading="Worktrees">
              {data.worktrees.map((worktree) => (
                <CommandItem
                  key={worktree.path}
                  value={`worktree ${worktree.branch} ${worktree.path}`}
                  onSelect={() => handleWorktreeSelect(worktree)}
                >
                  <FolderGit2Icon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{worktree.branch}</span>
                  {worktree.isCurrent && (
                    <Badge variant="secondary" className="text-xs">current</Badge>
                  )}
                  {worktree.behindMain > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {worktree.behindMain} behind
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Recent Commits */}
        {data.commits.length > 0 && (
          <>
            <CommandGroup heading="Recent Commits">
              {data.commits.slice(0, 8).map((commit) => (
                <CommandItem
                  key={commit.sha}
                  value={`commit ${commit.shortSha} ${commit.message}`}
                  onSelect={() => handleCommitSelect(commit)}
                >
                  <GitCommitIcon className="text-muted-foreground" />
                  <span className="text-muted-foreground font-mono text-xs">
                    {commit.shortSha}
                  </span>
                  <span className="flex-1 truncate">{commit.message.split('\n')[0]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleToggleDiffStyle}>
            <ColumnsIcon className="text-muted-foreground" />
            <span>Toggle Diff Style (Split/Unified)</span>
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          {!isTauri() && (
            <CommandItem onSelect={handleFetch}>
              <RefreshCwIcon className="text-muted-foreground" />
              <span>Fetch from Remote</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
