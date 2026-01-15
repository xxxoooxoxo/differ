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
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  additions: number
  deletions: number
  oldContent?: string
  newContent?: string
  patch?: string
  isLarge?: boolean
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
