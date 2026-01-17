import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { DiffStyle } from '../components/Header'
import { closePRWorktree } from '../lib/api'

// Tab types representing different views
export type TabType = 'working-changes' | 'branch-compare' | 'commit' | 'history' | 'worktree' | 'pr'

// Context-specific data for each tab type
export interface TabContext {
  // For branch-compare tabs
  baseBranch?: string
  headBranch?: string
  // For commit tabs
  commitSha?: string
  // For PR tabs
  prNumber?: number
  prBranch?: string
}

// UI state persisted per-tab
export interface TabViewState {
  selectedFile: string | null
  diffStyle: DiffStyle
  scrollPosition?: number
  expandedFolders?: string[]
}

// Full tab definition
export interface Tab {
  id: string
  type: TabType
  label: string
  repoPath: string // Each tab has its own repo/worktree path
  context: TabContext
  viewState: TabViewState
}

// Configuration for creating a new tab
export interface CreateTabConfig {
  type: TabType
  label?: string
  repoPath?: string
  context?: TabContext
  viewState?: Partial<TabViewState>
}

// Context value interface
interface TabContextValue {
  tabs: Tab[]
  activeTab: Tab | null
  activeTabId: string | null

  // Tab management
  createTab: (config: CreateTabConfig) => Tab
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Omit<Tab, 'id'>>) => void
  updateTabViewState: (tabId: string, viewState: Partial<TabViewState>) => void
  updateTabContext: (tabId: string, context: Partial<TabContext>) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  duplicateTab: (tabId: string) => Tab | null

  // Utilities
  getDefaultRepoPath: () => string
}

const TabContext = createContext<TabContextValue | null>(null)

const STORAGE_KEY = 'differ:tabs'
const DEFAULT_DIFF_STYLE: DiffStyle = 'split'

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getDefaultLabel(type: TabType, context?: TabContext): string {
  switch (type) {
    case 'working-changes':
      return 'Changes'
    case 'history':
      return 'History'
    case 'commit':
      return context?.commitSha?.slice(0, 7) || 'Commit'
    case 'branch-compare':
      if (context?.baseBranch && context?.headBranch) {
        return `${context.baseBranch}...${context.headBranch}`
      }
      return 'Compare'
    case 'worktree':
      return 'Worktree'
    case 'pr':
      return context?.prNumber ? `PR #${context.prNumber}` : 'PR'
    default:
      return 'Tab'
  }
}

function getDefaultViewState(): TabViewState {
  return {
    selectedFile: null,
    diffStyle: DEFAULT_DIFF_STYLE,
  }
}

// Get the default repo path from server-injected config or Tauri
function getServerRepoPath(): string {
  // Check for server-injected config
  const differConfig = (window as unknown as { __DIFFER__?: { repoPath?: string } }).__DIFFER__
  if (differConfig?.repoPath) {
    return differConfig.repoPath
  }
  // Fallback for development - empty string means use server default
  return ''
}

interface TabProviderProps {
  children: ReactNode
  initialRepoPath?: string
}

export function TabProvider({ children, initialRepoPath }: TabProviderProps) {
  const defaultRepoPath = initialRepoPath || getServerRepoPath()

  // Initialize state from localStorage or create default tab
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          // Validate and restore tabs, ensuring repoPath is set
          return parsed.tabs.map((tab: Tab) => ({
            ...tab,
            repoPath: tab.repoPath || defaultRepoPath,
          }))
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Create default "Changes" tab
    return [
      {
        id: generateId(),
        type: 'working-changes' as TabType,
        label: 'Changes',
        repoPath: defaultRepoPath,
        context: {},
        viewState: getDefaultViewState(),
      },
    ]
  })

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.activeTabId && tabs.some((t) => t.id === parsed.activeTabId)) {
          return parsed.activeTabId
        }
      }
    } catch {
      // Ignore parse errors
    }
    return tabs[0]?.id || null
  })

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }))
    } catch {
      // Ignore storage errors
    }
  }, [tabs, activeTabId])

  const activeTab = tabs.find((t) => t.id === activeTabId) || null

  const getDefaultRepoPath = useCallback(() => defaultRepoPath, [defaultRepoPath])

  const createTab = useCallback(
    (config: CreateTabConfig): Tab => {
      const newTab: Tab = {
        id: generateId(),
        type: config.type,
        label: config.label || getDefaultLabel(config.type, config.context),
        repoPath: config.repoPath || defaultRepoPath,
        context: config.context || {},
        viewState: {
          ...getDefaultViewState(),
          ...config.viewState,
        },
      }

      setTabs((prev) => [...prev, newTab])
      setActiveTabId(newTab.id)

      return newTab
    },
    [defaultRepoPath]
  )

  const closeTab = useCallback(
    (tabId: string) => {
      // Find the tab being closed to check if it's a PR tab
      const tabToClose = tabs.find((t) => t.id === tabId)

      // If it's a PR tab, clean up the worktree asynchronously
      if (tabToClose?.type === 'pr' && tabToClose.context.prNumber) {
        closePRWorktree(tabToClose.context.prNumber).catch((err) => {
          console.warn('Failed to cleanup PR worktree:', err)
        })
      }

      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId)

        // If closing the last tab, create a new default tab
        if (newTabs.length === 0) {
          const defaultTab: Tab = {
            id: generateId(),
            type: 'working-changes',
            label: 'Changes',
            repoPath: defaultRepoPath,
            context: {},
            viewState: getDefaultViewState(),
          }
          setActiveTabId(defaultTab.id)
          return [defaultTab]
        }

        // If closing the active tab, switch to an adjacent one
        if (tabId === activeTabId) {
          const closedIndex = prev.findIndex((t) => t.id === tabId)
          const newActiveIndex = Math.min(closedIndex, newTabs.length - 1)
          setActiveTabId(newTabs[newActiveIndex].id)
        }

        return newTabs
      })
    },
    [activeTabId, defaultRepoPath, tabs]
  )

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const updateTab = useCallback((tabId: string, updates: Partial<Omit<Tab, 'id'>>) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab))
    )
  }, [])

  const updateTabViewState = useCallback(
    (tabId: string, viewState: Partial<TabViewState>) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, viewState: { ...tab.viewState, ...viewState } }
            : tab
        )
      )
    },
    []
  )

  const updateTabContext = useCallback(
    (tabId: string, context: Partial<TabContext>) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, context: { ...tab.context, ...context } }
            : tab
        )
      )
    },
    []
  )

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const newTabs = [...prev]
      const [removed] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, removed)
      return newTabs
    })
  }, [])

  const duplicateTab = useCallback(
    (tabId: string): Tab | null => {
      const tabToDuplicate = tabs.find((t) => t.id === tabId)
      if (!tabToDuplicate) return null

      const newTab: Tab = {
        ...tabToDuplicate,
        id: generateId(),
        label: `${tabToDuplicate.label} (copy)`,
      }

      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === tabId)
        const newTabs = [...prev]
        newTabs.splice(index + 1, 0, newTab)
        return newTabs
      })
      setActiveTabId(newTab.id)

      return newTab
    },
    [tabs]
  )

  const value: TabContextValue = {
    tabs,
    activeTab,
    activeTabId,
    createTab,
    closeTab,
    switchTab,
    updateTab,
    updateTabViewState,
    updateTabContext,
    reorderTabs,
    duplicateTab,
    getDefaultRepoPath,
  }

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}

export function useTabs(): TabContextValue {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error('useTabs must be used within a TabProvider')
  }
  return context
}

// Hook to get the current tab's repo path for API calls
export function useTabRepoPath(): string {
  const { activeTab, getDefaultRepoPath } = useTabs()
  return activeTab?.repoPath || getDefaultRepoPath()
}
