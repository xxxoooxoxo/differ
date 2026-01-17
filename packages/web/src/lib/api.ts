/**
 * API abstraction layer that works in both web (HTTP) and Tauri (invoke) modes
 */

// Check if running in Tauri
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Types matching the Rust/TypeScript definitions
export interface DiffStats {
  additions: number
  deletions: number
  files: number
}

export interface FileDiffInfo {
  path: string
  oldPath?: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'untracked'
  additions: number
  deletions: number
  oldContent?: string
  newContent?: string
  patch?: string
  isLarge?: boolean
  modifiedTime?: number // Unix timestamp in ms (from fs.stat mtime)
}

export interface DiffResult {
  files: FileDiffInfo[]
  stats: DiffStats
}

export interface CompareBranchesResult extends DiffResult {
  commitCount: number
}

export interface CommitStats {
  additions: number
  deletions: number
  files: number
}

export interface CommitInfo {
  sha: string
  shortSha: string
  message: string
  author: string
  authorEmail: string
  date: string
  stats: CommitStats
}

export interface CommitHistory {
  commits: CommitInfo[]
  total: number
}

export interface CommitDiff {
  commit: CommitInfo
  files: FileDiffInfo[]
}

export interface BranchInfo {
  name: string
  current: boolean
  commit: string
}

export interface BranchList {
  branches: BranchInfo[]
  current: string
}

export interface RemoteInfo {
  url: string
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown'
  owner: string
  repo: string
}

export interface DifferConfig {
  editor: string
  diffStyle: string
  port: number
  autoOpen: boolean
  largeFileThreshold: number
}

// Lazy-load Tauri API only when needed
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
let tauriListen: ((event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>) | null = null

async function getTauriInvoke() {
  if (!tauriInvoke) {
    const { invoke } = await import('@tauri-apps/api/core')
    tauriInvoke = invoke
  }
  return tauriInvoke
}

async function getTauriListen() {
  if (!tauriListen) {
    const { listen } = await import('@tauri-apps/api/event')
    tauriListen = listen
  }
  return tauriListen
}

// Helper to build URLs with optional repoPath query param
function buildUrl(basePath: string, params?: Record<string, string | number | undefined>, repoPath?: string): string {
  const searchParams = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value))
      }
    }
  }
  if (repoPath) {
    searchParams.set('repoPath', repoPath)
  }
  const queryString = searchParams.toString()
  return queryString ? `${basePath}?${queryString}` : basePath
}

// API functions

export async function setRepoPath(path: string): Promise<void> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    await invoke('cmd_set_repo_path', { path })
  } else {
    // In web mode, repo path is set by the server
    throw new Error('setRepoPath is only available in Tauri mode')
  }
}

export async function getCurrentDiff(repoPath?: string): Promise<DiffResult> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_diff_current', { repoPath }) as Promise<DiffResult>
  } else {
    const res = await fetch(buildUrl('/api/diff/current', undefined, repoPath))
    if (!res.ok) throw new Error('Failed to fetch current diff')
    return res.json()
  }
}

export async function getFilePatch(path: string, repoPath?: string): Promise<string> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_diff_file', { path, repoPath }) as Promise<string>
  } else {
    const res = await fetch(buildUrl('/api/diff/file', { path }, repoPath))
    if (!res.ok) throw new Error('Failed to fetch file patch')
    const data = await res.json()
    return data.patch
  }
}

export async function getCommits(page: number = 1, limit: number = 20, repoPath?: string): Promise<CommitHistory> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_commits', { page, limit, repoPath }) as Promise<CommitHistory>
  } else {
    const res = await fetch(buildUrl('/api/commits', { page, limit }, repoPath))
    if (!res.ok) throw new Error('Failed to fetch commits')
    return res.json()
  }
}

export async function getCommitDiff(sha: string, repoPath?: string): Promise<CommitDiff> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_commit', { sha, repoPath }) as Promise<CommitDiff>
  } else {
    const res = await fetch(buildUrl(`/api/commits/${sha}/diff`, undefined, repoPath))
    if (!res.ok) throw new Error('Failed to fetch commit diff')
    return res.json()
  }
}

export async function getBranches(repoPath?: string): Promise<BranchList> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_branch_list', { repoPath }) as Promise<BranchList>
  } else {
    const res = await fetch(buildUrl('/api/branches', undefined, repoPath))
    if (!res.ok) throw new Error('Failed to fetch branches')
    return res.json()
  }
}

export async function compareBranches(base: string, head: string, repoPath?: string): Promise<CompareBranchesResult> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_compare_branch', { base, head, repoPath }) as Promise<CompareBranchesResult>
  } else {
    const res = await fetch(buildUrl('/api/branches/compare', { base, head }, repoPath))
    if (!res.ok) throw new Error('Failed to compare branches')
    return res.json()
  }
}

export async function getFileContents(path: string, ref?: string, repoPath?: string): Promise<string> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_file', { path, gitRef: ref, repoPath }) as Promise<string>
  } else {
    const res = await fetch(buildUrl('/api/branches/file', { path, ref }, repoPath))
    if (!res.ok) throw new Error('Failed to fetch file contents')
    const data = await res.json()
    return data.content
  }
}

export async function getRemoteInfo(repoPath?: string): Promise<RemoteInfo | null> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_remote', { repoPath }) as Promise<RemoteInfo | null>
  } else {
    const res = await fetch(buildUrl('/api/branches/remote', undefined, repoPath))
    if (!res.ok) return null
    const data = await res.json()
    return data.remote
  }
}

export interface FetchResult {
  success: boolean
  remote: string
  message: string
}

export async function fetchFromRemote(remote = 'origin'): Promise<FetchResult> {
  if (isTauri()) {
    // Not implemented in Tauri yet
    throw new Error('fetchFromRemote is not yet available in Tauri mode')
  } else {
    const res = await fetch('/api/branches/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote }),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to fetch from remote' }))
      throw new Error(error.error || 'Failed to fetch from remote')
    }
    return res.json()
  }
}

export async function getConfig(): Promise<DifferConfig> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    return invoke('cmd_get_config', {}) as Promise<DifferConfig>
  } else {
    const res = await fetch('/api/config')
    if (!res.ok) throw new Error('Failed to fetch config')
    return res.json()
  }
}

export async function setConfig(config: Partial<DifferConfig>): Promise<void> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    const currentConfig = await getConfig()
    await invoke('cmd_set_config', { config: { ...currentConfig, ...config } })
  } else {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) throw new Error('Failed to save config')
  }
}

export async function openInEditor(filePath: string, editor: string): Promise<void> {
  if (isTauri()) {
    const invoke = await getTauriInvoke()
    await invoke('cmd_open_in_editor', { filePath, editor })
  } else {
    const res = await fetch('/api/editor/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, editor }),
    })
    if (!res.ok) throw new Error('Failed to open in editor')
  }
}

// File change event listener
export interface FileChangeEvent {
  eventType: string
  file: string
  timestamp: number
}

export type FileChangeCallback = (event: FileChangeEvent) => void

let webSocket: WebSocket | null = null
let wsListeners: Set<FileChangeCallback> = new Set()

export async function subscribeToFileChanges(callback: FileChangeCallback): Promise<() => void> {
  if (isTauri()) {
    const listen = await getTauriListen()
    const unlisten = await listen('file-change', (event) => {
      callback(event.payload as FileChangeEvent)
    })
    return unlisten
  } else {
    // Web mode: use WebSocket
    wsListeners.add(callback)

    if (!webSocket || webSocket.readyState === WebSocket.CLOSED) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`

      webSocket = new WebSocket(wsUrl)

      webSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'change') {
            const changeEvent: FileChangeEvent = {
              eventType: data.event,
              file: data.file,
              timestamp: data.timestamp,
            }
            wsListeners.forEach((listener) => listener(changeEvent))
          }
        } catch {
          // Ignore parse errors
        }
      }

      webSocket.onclose = () => {
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (wsListeners.size > 0) {
            // Trigger reconnection by calling subscribeToFileChanges with a dummy callback
            const dummyCallback = () => {}
            wsListeners.add(dummyCallback)
            subscribeToFileChanges(dummyCallback).then((unsub) => {
              wsListeners.delete(dummyCallback)
            })
          }
        }, 3000)
      }
    }

    return () => {
      wsListeners.delete(callback)
      if (wsListeners.size === 0 && webSocket) {
        webSocket.close()
        webSocket = null
      }
    }
  }
}

// Directory picker (Tauri only)
export async function selectDirectory(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Git Repository',
    })
    return selected as string | null
  }
  return null
}

// Worktrees API
export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isCurrent: boolean
  isActive: boolean
  behindMain: number
  aheadOfMain: number
  lastActivity: string
}

export interface WorktreesResponse {
  worktrees: WorktreeInfo[]
  current: string
  activePath: string
  mainBranch: string
}

export async function getWorktrees(onlyBehind = false): Promise<WorktreesResponse> {
  if (isTauri()) {
    // Worktrees not implemented in Tauri yet - return empty response
    return {
      worktrees: [],
      current: '',
      activePath: '',
      mainBranch: 'main',
    }
  } else {
    const params = new URLSearchParams()
    if (onlyBehind) params.set('onlyBehind', 'true')
    const res = await fetch(`/api/worktrees?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch worktrees')
    return res.json()
  }
}

export async function switchWorktree(path: string): Promise<boolean> {
  if (isTauri()) {
    // Not implemented in Tauri yet
    throw new Error('switchWorktree is not yet available in Tauri mode')
  } else {
    const res = await fetch('/api/worktrees/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) {
      const result = await res.json()
      throw new Error(result.error || 'Failed to switch worktree')
    }
    return true
  }
}

export interface CheckoutPRResult {
  success: boolean
  prNumber: number
  branchName: string
  message: string
}

export async function checkoutPR(prNumber: number, remote = 'origin'): Promise<CheckoutPRResult> {
  if (isTauri()) {
    // Not implemented in Tauri yet
    throw new Error('checkoutPR is not yet available in Tauri mode')
  } else {
    const res = await fetch('/api/branches/checkout-pr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prNumber, remote }),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to checkout PR' }))
      throw new Error(error.error || 'Failed to checkout PR')
    }
    return res.json()
  }
}

export interface OpenPRWorktreeResult {
  success: boolean
  prNumber: number
  branchName: string
  worktreePath: string
  message: string
}

/**
 * Opens a PR in a new worktree, allowing it to be viewed in a separate tab
 * without affecting the current working directory.
 */
export async function openPRWorktree(prNumber: number, remote = 'origin'): Promise<OpenPRWorktreeResult> {
  if (isTauri()) {
    throw new Error('openPRWorktree is not yet available in Tauri mode')
  } else {
    const res = await fetch('/api/branches/open-pr-worktree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prNumber, remote }),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to open PR worktree' }))
      throw new Error(error.error || 'Failed to open PR worktree')
    }
    return res.json()
  }
}

/**
 * Closes a PR worktree and cleans up the temporary directory.
 * Should be called when closing a PR tab.
 */
export async function closePRWorktree(prNumber: number): Promise<{ success: boolean; message: string }> {
  if (isTauri()) {
    throw new Error('closePRWorktree is not yet available in Tauri mode')
  } else {
    const res = await fetch('/api/branches/close-pr-worktree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prNumber }),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to close PR worktree' }))
      throw new Error(error.error || 'Failed to close PR worktree')
    }
    return res.json()
  }
}

// =============================================================================
// PULL REQUEST API
// =============================================================================

export interface PRInfo {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  author: string
  headRef: string
  baseRef: string
  updatedAt: string
  additions?: number
  deletions?: number
  changedFiles?: number
}

export interface PRListResult {
  prs: PRInfo[]
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown'
  hasGhCli: boolean
}

export interface PRDiff {
  pr: PRInfo
  files: FileDiffInfo[]
  stats: DiffStats
  commitCount: number
}

/**
 * List pull requests from the remote repository.
 * Uses GitHub CLI when available, falls back to git ls-remote.
 */
export async function listPRs(
  options?: { state?: 'open' | 'closed' | 'all'; limit?: number },
  repoPath?: string
): Promise<PRListResult> {
  if (isTauri()) {
    throw new Error('listPRs is not yet available in Tauri mode')
  }

  const params: Record<string, string | number> = {}
  if (options?.state) params.state = options.state
  if (options?.limit) params.limit = options.limit

  const res = await fetch(buildUrl('/api/prs', params, repoPath))
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to list PRs' }))
    throw new Error(error.error || 'Failed to list PRs')
  }
  return res.json()
}

/**
 * Get info for a specific pull request.
 */
export async function getPRInfo(prNumber: number, repoPath?: string): Promise<PRInfo> {
  if (isTauri()) {
    throw new Error('getPRInfo is not yet available in Tauri mode')
  }

  const res = await fetch(buildUrl(`/api/prs/${prNumber}`, undefined, repoPath))
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to get PR info' }))
    throw new Error(error.error || 'Failed to get PR info')
  }
  return res.json()
}

/**
 * Get the diff for a pull request.
 * Fetches the PR ref and compares against base branch without checkout.
 */
export async function getPRDiff(prNumber: number, repoPath?: string): Promise<PRDiff> {
  if (isTauri()) {
    throw new Error('getPRDiff is not yet available in Tauri mode')
  }

  const res = await fetch(buildUrl(`/api/prs/${prNumber}/diff`, undefined, repoPath))
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to get PR diff' }))
    throw new Error(error.error || 'Failed to get PR diff')
  }
  return res.json()
}
