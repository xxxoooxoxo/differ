export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
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
  stats: {
    additions: number
    deletions: number
    files: number
  }
}

export interface CommitInfo {
  sha: string
  shortSha: string
  message: string
  author: string
  authorEmail: string
  date: string
  stats: {
    additions: number
    deletions: number
    files: number
  }
}

export interface BranchInfo {
  name: string
  current: boolean
  commit: string
  lastActivity?: string // ISO date of last commit
}

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isCurrent: boolean
  behindMain: number
  aheadOfMain: number
  lastActivity: string // ISO date of last commit
}

export interface PRInfo {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  author: string
  headRef: string      // e.g., "feature-branch"
  baseRef: string      // e.g., "main"
  updatedAt: string    // ISO date
  additions?: number
  deletions?: number
  changedFiles?: number
}

export interface PRListResult {
  prs: PRInfo[]
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown'
  hasGhCli: boolean    // Indicates if gh CLI is available
}

export interface PRDiffResult {
  pr: PRInfo
  files: FileDiffInfo[]
  stats: {
    additions: number
    deletions: number
    files: number
  }
  commitCount: number
}
