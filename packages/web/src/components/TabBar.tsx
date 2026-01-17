import { useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTabs, type Tab, type TabType } from '../contexts/TabContext'
import { Pin } from 'lucide-react'
import { Button } from './ui/button'
import { ScrollArea, ScrollBar } from './ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  History,
  X,
  Plus,
  ChevronDown,
  Folder,
  GitCompare,
} from 'lucide-react'

// Map tab types to icons
function getTabIcon(type: TabType) {
  switch (type) {
    case 'working-changes':
      return GitBranch
    case 'history':
      return History
    case 'commit':
      return GitCommit
    case 'branch-compare':
      return GitCompare
    case 'worktree':
      return Folder
    case 'pr':
      return GitPullRequest
    default:
      return GitBranch
  }
}

// Map tab type to route
function getRouteForTab(tab: Tab): string {
  switch (tab.type) {
    case 'working-changes':
      return '/'
    case 'history':
      return '/history'
    case 'commit':
      return tab.context.commitSha ? `/commit/${tab.context.commitSha}` : '/history'
    case 'branch-compare':
      const params = new URLSearchParams()
      if (tab.context.baseBranch) params.set('base', tab.context.baseBranch)
      if (tab.context.headBranch) params.set('head', tab.context.headBranch)
      return `/compare${params.toString() ? `?${params}` : ''}`
    case 'worktree':
      // Worktree goes to working changes view with different repoPath
      return '/'
    case 'pr':
      // PR tabs go to the PR view if they have a prNumber, otherwise to the PR list
      return tab.context.prNumber ? `/prs/${tab.context.prNumber}` : '/prs'
    default:
      return '/'
  }
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  onClose: () => void
  onClick: () => void
  onMiddleClick: () => void
}

function TabItem({ tab, isActive, onClose, onClick, onMiddleClick }: TabItemProps) {
  const Icon = getTabIcon(tab.type)
  const isPinned = tab.pinned

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click to close (not for pinned tabs)
    if (e.button === 1 && !isPinned) {
      e.preventDefault()
      onMiddleClick()
    }
  }

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isPinned) {
      onClose()
    }
  }

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            onMouseDown={handleMouseDown}
            className={`
              group relative flex h-8 items-center gap-1.5 px-3
              border-r border-border
              transition-colors
              ${isActive
                ? 'bg-background text-foreground'
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }
            `}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="max-w-32 truncate text-xs font-medium">
              {tab.label}
            </span>
            {isPinned ? (
              <Pin className="ml-1 size-3 text-muted-foreground/50" />
            ) : (
              <button
                onClick={handleCloseClick}
                className={`
                  ml-1 rounded p-0.5
                  transition-opacity
                  hover:bg-muted-foreground/20
                  ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}
                `}
              >
                <X className="size-3" />
              </button>
            )}
            {/* Active indicator */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>{tab.label}{isPinned && ' (pinned)'}</p>
          {tab.repoPath && (
            <p className="text-muted-foreground font-mono text-[10px]">
              {tab.repoPath}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function NewTabMenu() {
  const { createTab, getDefaultRepoPath } = useTabs()
  const navigate = useNavigate()

  const handleCreateTab = (type: TabType, options?: { label?: string }) => {
    const tab = createTab({
      type,
      label: options?.label,
      repoPath: getDefaultRepoPath(),
    })
    navigate(getRouteForTab(tab))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-secondary"
        >
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={() => handleCreateTab('working-changes')}>
          <GitBranch className="mr-2 size-4" />
          <span>Working Changes</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCreateTab('history')}>
          <History className="mr-2 size-4" />
          <span>History</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCreateTab('branch-compare')}>
          <GitCompare className="mr-2 size-4" />
          <span>Compare Branches</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleCreateTab('worktree', { label: 'Worktree' })}>
          <Folder className="mr-2 size-4" />
          <span>Open Worktree...</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          createTab({
            type: 'pr',
            label: 'Pull Requests',
            repoPath: getDefaultRepoPath(),
          })
          navigate('/prs')
        }}>
          <GitPullRequest className="mr-2 size-4" />
          <span>Pull Requests</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TabBar() {
  const { tabs, activeTabId, activeTab, switchTab, closeTab, updateTabRoute } = useTabs()
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sync current route to active tab
  useEffect(() => {
    if (activeTabId && activeTab) {
      const currentPath = location.pathname + location.search
      if (activeTab.route !== currentPath) {
        updateTabRoute(activeTabId, currentPath)
      }
    }
  }, [location.pathname, location.search, activeTabId, activeTab, updateTabRoute])

  // Scroll active tab into view
  useEffect(() => {
    if (scrollRef.current && activeTabId) {
      const activeElement = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`)
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    }
  }, [activeTabId])

  const handleTabClick = useCallback((tab: Tab) => {
    switchTab(tab.id)
    // Use the tab's stored route instead of computing from type
    navigate(tab.route)
  }, [switchTab, navigate])

  const handleTabClose = useCallback((tabId: string) => {
    closeTab(tabId)
  }, [closeTab])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + W to close active tab (only if not pinned)
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTabId && activeTab && !activeTab.pinned) {
          closeTab(activeTabId)
        }
      }
      // Cmd/Ctrl + T to open new tab
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        // Will be handled by NewTabMenu click
      }
      // Cmd/Ctrl + number to switch tabs
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (tabs[index]) {
          handleTabClick(tabs[index])
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, activeTab, closeTab, tabs, handleTabClick])

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-secondary/30 z-20 relative">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex">
          {tabs.map((tab) => (
            <div key={tab.id} data-tab-id={tab.id}>
              <TabItem
                tab={tab}
                isActive={tab.id === activeTabId}
                onClick={() => handleTabClick(tab)}
                onClose={() => handleTabClose(tab.id)}
                onMiddleClick={() => handleTabClose(tab.id)}
              />
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
      <div className="flex items-center border-l border-border px-1">
        <NewTabMenu />
      </div>
    </div>
  )
}
