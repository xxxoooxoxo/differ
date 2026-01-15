import { Link, useLocation } from 'react-router-dom'
import { useEditor, type EditorType } from '../hooks/useEditor'
import { useWorktrees, type WorktreeInfo } from '../hooks/useWorktrees'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
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
} from './ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { GitBranch, Folder } from 'lucide-react'

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

function WorktreeDropdown() {
  const { data, loading, switching, switchWorktree } = useWorktrees(false) // Show all worktrees
  const { editor } = useEditor()

  const worktrees = data?.worktrees ?? []
  const count = worktrees.length

  if (loading || count === 0) return null

  const activeWorktree = worktrees.find(w => w.isActive)

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

  const revealInFinder = (path: string) => {
    window.open(`file://${path}`, '_blank')
  }

  const handleSwitchWorktree = async (path: string) => {
    const success = await switchWorktree(path)
    if (success) {
      // Reload the page to refetch all data with new worktree
      window.location.reload()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7" disabled={switching}>
          <GitBranch className="size-3.5" />
          <span className="max-w-24 truncate text-xs">{activeWorktree?.branch || 'Worktrees'}</span>
          {count > 1 && (
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          Switch worktree
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {worktrees.map((wt: WorktreeInfo) => {
          const dirName = wt.path.split('/').pop() || wt.path
          return (
            <DropdownMenuItem
              key={wt.path}
              className={`flex-col items-start gap-1 py-2 ${wt.isActive ? 'bg-accent/50' : ''}`}
              onClick={() => !wt.isActive && handleSwitchWorktree(wt.path)}
              disabled={switching}
            >
              <div className="flex w-full items-center gap-2">
                <span className="font-mono text-sm font-medium">{wt.branch}</span>
                {wt.isActive && (
                  <Badge variant="default" className="h-4 px-1.5 text-[10px] bg-emerald-600">
                    viewing
                  </Badge>
                )}
                {wt.isCurrent && !wt.isActive && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    checkout
                  </Badge>
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
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
              <div className="flex items-center gap-2 text-xs">
                {wt.behindMain > 0 && (
                  <span className="text-amber-500">{wt.behindMain} behind</span>
                )}
                {wt.aheadOfMain > 0 && (
                  <span className="text-emerald-500">{wt.aheadOfMain} ahead</span>
                )}
                <span className="text-muted-foreground">{formatRelativeTime(wt.lastActivity)}</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{dirName}</span>
            </DropdownMenuItem>
          )
        })}
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

      <WorktreeDropdown />

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
