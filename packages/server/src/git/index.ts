import simpleGit, { type SimpleGit } from 'simple-git'
import type { DiffResult, FileDiffInfo, CommitInfo, BranchInfo, WorktreeInfo } from './types'

export * from './types'

export function createGitClient(repoPath: string): SimpleGit {
  return simpleGit(repoPath)
}

function getFileStats(file: { binary?: boolean; insertions?: number; deletions?: number }): { additions: number; deletions: number } {
  if (file.binary) {
    return { additions: 0, deletions: 0 }
  }
  return {
    additions: file.insertions ?? 0,
    deletions: file.deletions ?? 0,
  }
}

export async function getCurrentDiff(git: SimpleGit): Promise<DiffResult> {
  // Get diff of working directory against HEAD
  // Run diffSummary and name-status in parallel to reduce git calls
  const [diffSummary, nameStatusRaw] = await Promise.all([
    git.diffSummary(['HEAD']),
    git.raw(['diff', '--name-status', 'HEAD']),
  ])

  // Parse name-status output to get file statuses (A=added, D=deleted, M=modified, R=renamed)
  const fileStatuses = new Map<string, string>()
  for (const line of nameStatusRaw.trim().split('\n')) {
    if (!line) continue
    const [status, ...pathParts] = line.split('\t')
    const filePath = pathParts[pathParts.length - 1] // Handle renames (R status has old\tnew)
    if (filePath) {
      fileStatuses.set(filePath, status.charAt(0))
    }
  }

  const files: FileDiffInfo[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const file of diffSummary.files) {
    const { additions, deletions } = getFileStats(file as any)
    totalAdditions += additions
    totalDeletions += deletions

    // Get the actual patch for this file
    // Limit patch size to prevent browser lockup on large files (e.g., source maps)
    const MAX_PATCH_SIZE = 50000 // 50KB max per file for display
    const rawPatch = await git.diff(['HEAD', '--', file.file])
    const isLarge = rawPatch.length > MAX_PATCH_SIZE
    const patch = isLarge ? '' : rawPatch // Don't send large patches

    // Determine file status from name-status output
    const gitStatus = fileStatuses.get(file.file) || 'M'
    const status = gitStatus === 'A' ? 'added'
      : gitStatus === 'D' ? 'deleted'
      : gitStatus === 'R' ? 'renamed'
      : 'modified'

    files.push({
      path: file.file,
      status,
      additions,
      deletions,
      patch,
      isLarge,
    })
  }

  return {
    files,
    stats: {
      additions: totalAdditions,
      deletions: totalDeletions,
      files: files.length,
    },
  }
}

export async function getCommitHistory(
  git: SimpleGit,
  options: { limit: number; offset: number } = { limit: 20, offset: 0 }
): Promise<{ commits: CommitInfo[]; total: number }> {
  const { limit, offset } = options

  // Get total count
  const countResult = await git.raw(['rev-list', '--count', 'HEAD'])
  const total = parseInt(countResult.trim(), 10)

  // Get commits with stats
  const log = await git.log({
    maxCount: limit,
    '--skip': offset,
    '--stat': null,
  })

  const commits: CommitInfo[] = log.all.map((commit) => ({
    sha: commit.hash,
    shortSha: commit.hash.slice(0, 7),
    message: commit.message,
    author: commit.author_name,
    authorEmail: commit.author_email,
    date: commit.date,
    stats: {
      additions: 0, // Will be populated below
      deletions: 0,
      files: 0,
    },
  }))

  // Get stats for each commit in parallel (use show --shortstat which works for initial commits too)
  const statPromises = commits.map((commit) =>
    git.raw(['show', '--shortstat', '--format=', commit.sha]).catch(() => '')
  )
  const statResults = await Promise.all(statPromises)

  statResults.forEach((statResult, index) => {
    const match = statResult.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/)
    if (match) {
      commits[index].stats.files = parseInt(match[1] || '0', 10)
      commits[index].stats.additions = parseInt(match[2] || '0', 10)
      commits[index].stats.deletions = parseInt(match[3] || '0', 10)
    }
  })

  return { commits, total }
}

export async function getCommitDiff(git: SimpleGit, sha: string): Promise<{ commit: CommitInfo; files: FileDiffInfo[] }> {
  // Get commit info - use the sha directly, not a range
  const log = await git.log(['-1', sha])
  const commitData = log.latest

  if (!commitData) {
    throw new Error(`Commit ${sha} not found`)
  }

  const commit: CommitInfo = {
    sha: commitData.hash,
    shortSha: commitData.hash.slice(0, 7),
    message: commitData.message,
    author: commitData.author_name,
    authorEmail: commitData.author_email,
    date: commitData.date,
    stats: { additions: 0, deletions: 0, files: 0 },
  }

  // Check if this is the initial commit (no parent)
  const hasParent = await git.raw(['rev-parse', '--verify', `${sha}^`]).then(() => true).catch(() => false)

  // For initial commit, diff against empty tree; otherwise diff against parent
  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  const baseRef = hasParent ? `${sha}^` : EMPTY_TREE

  // Get diff summary
  const diffSummary = await git.diffSummary([baseRef, sha])
  const files: FileDiffInfo[] = []

  let totalAdditions = 0
  let totalDeletions = 0

  for (const file of diffSummary.files) {
    const { additions, deletions } = getFileStats(file as any)
    totalAdditions += additions
    totalDeletions += deletions

    // Get the patch
    const patch = await git.diff([baseRef, sha, '--', file.file]).catch(() => '')

    // Determine status from diff summary flags
    const fileAny = file as any
    const status = fileAny.deleted ? 'deleted' : fileAny.insertion ? 'added' : 'modified'

    files.push({
      path: file.file,
      status,
      additions,
      deletions,
      patch,
    })
  }

  commit.stats = {
    additions: totalAdditions,
    deletions: totalDeletions,
    files: files.length,
  }

  return { commit, files }
}

export async function compareBranches(
  git: SimpleGit,
  base: string,
  head: string
): Promise<DiffResult & { commitCount: number }> {
  // Get commit count between branches
  const countResult = await git.raw(['rev-list', '--count', `${base}..${head}`])
  const commitCount = parseInt(countResult.trim(), 10)

  // Get diff summary
  const diffSummary = await git.diffSummary([base, head])
  const files: FileDiffInfo[] = []

  let totalAdditions = 0
  let totalDeletions = 0

  for (const file of diffSummary.files) {
    const { additions, deletions } = getFileStats(file as any)
    totalAdditions += additions
    totalDeletions += deletions

    // Get the patch for this file
    const patch = await git.diff([base, head, '--', file.file]).catch(() => '')

    // Determine status from diff summary flags
    const fileAny = file as any
    const status = fileAny.deleted ? 'deleted' : fileAny.insertion ? 'added' : 'modified'

    files.push({
      path: file.file,
      status,
      additions,
      deletions,
      patch,
    })
  }

  return {
    files,
    stats: {
      additions: totalAdditions,
      deletions: totalDeletions,
      files: files.length,
    },
    commitCount,
  }
}

export async function getBranches(git: SimpleGit): Promise<{ branches: BranchInfo[]; current: string }> {
  const branchSummary = await git.branch(['-a'])
  const branches: BranchInfo[] = []

  for (const [name, branch] of Object.entries(branchSummary.branches)) {
    // Skip remote tracking branches for cleaner UI
    if (name.startsWith('remotes/')) continue

    branches.push({
      name,
      current: branch.current,
      commit: branch.commit,
    })
  }

  return {
    branches,
    current: branchSummary.current,
  }
}

export async function getFileContents(
  git: SimpleGit,
  filePath: string,
  ref?: string
): Promise<string> {
  if (ref) {
    return git.show([`${ref}:${filePath}`])
  }

  // Get from working directory
  const fs = await import('fs/promises')
  const path = await import('path')
  const repoRoot = await git.revparse(['--show-toplevel'])
  return fs.readFile(path.join(repoRoot.trim(), filePath), 'utf-8')
}

export async function getWorktrees(
  git: SimpleGit,
  mainBranch = 'main'
): Promise<{ worktrees: WorktreeInfo[]; current: string }> {
  // Get worktree list in porcelain format
  const worktreeOutput = await git.raw(['worktree', 'list', '--porcelain'])
  const currentPath = (await git.revparse(['--show-toplevel'])).trim()

  // Parse porcelain output
  const worktreeBlocks = worktreeOutput.trim().split('\n\n')
  const worktrees: WorktreeInfo[] = []

  for (const block of worktreeBlocks) {
    const lines = block.split('\n')
    let path = ''
    let commit = ''
    let branch = ''

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        commit = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        // Format: branch refs/heads/branch-name
        branch = line.slice('branch refs/heads/'.length)
      } else if (line === 'detached') {
        branch = '(detached)'
      }
    }

    if (!path || !commit) continue

    // Skip bare worktrees
    if (!branch && !block.includes('detached')) continue

    const isCurrent = path === currentPath

    // Get ahead/behind counts relative to main
    let behindMain = 0
    let aheadOfMain = 0
    try {
      const behindOutput = await git.raw(['rev-list', '--count', `${branch}..${mainBranch}`]).catch(() => '0')
      behindMain = parseInt(behindOutput.trim(), 10) || 0

      const aheadOutput = await git.raw(['rev-list', '--count', `${mainBranch}..${branch}`]).catch(() => '0')
      aheadOfMain = parseInt(aheadOutput.trim(), 10) || 0
    } catch {
      // Branch might not exist or main might not exist
    }

    // Get last commit date for this branch
    let lastActivity = new Date().toISOString()
    try {
      const dateOutput = await git.raw(['log', '-1', '--format=%cI', branch])
      lastActivity = dateOutput.trim()
    } catch {
      // Use current time if we can't get the date
    }

    worktrees.push({
      path,
      branch,
      commit: commit.slice(0, 7),
      isCurrent,
      behindMain,
      aheadOfMain,
      lastActivity,
    })
  }

  // Sort by last activity (most recent first)
  worktrees.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

  return { worktrees, current: currentPath }
}
