import simpleGit, { type SimpleGit } from 'simple-git'
import { stat, readFile } from 'fs/promises'
import { join } from 'path'
import type { DiffResult, FileDiffInfo, CommitInfo, BranchInfo, WorktreeInfo } from './types'

export * from './types'

// =============================================================================
// CACHING
// =============================================================================

// Simple TTL cache for expensive git operations
const cache = new Map<string, { data: unknown; expires: number }>()

function getCached<T>(key: string, ttlMs: number, getter: () => Promise<T>): Promise<T> {
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.data as T)
  }
  return getter().then(data => {
    cache.set(key, { data, expires: Date.now() + ttlMs })
    return data
  })
}

/**
 * Clear cache entries. Called when file system changes are detected.
 * @param pattern - Optional pattern to match cache keys. If omitted, clears all.
 */
export function invalidateCache(pattern?: string) {
  if (!pattern) {
    cache.clear()
  } else {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) cache.delete(key)
    }
  }
}

// =============================================================================
// GIT CLIENT
// =============================================================================

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
  const MAX_PATCH_SIZE = 50000 // 50KB max per file for display

  // Get diff of working directory against HEAD
  // Run diffSummary, name-status, get repo root, and untracked files in parallel
  const [diffSummary, nameStatusRaw, repoRoot, untrackedRaw] = await Promise.all([
    git.diffSummary(['HEAD']),
    git.raw(['diff', '--name-status', 'HEAD']),
    git.revparse(['--show-toplevel']).then((r) => r.trim()),
    git.raw(['ls-files', '--others', '--exclude-standard']),
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

  // PARALLEL: Fetch all file patches at once instead of sequentially
  const patchPromises = diffSummary.files.map(async (file) => {
    const rawPatch = await git.diff(['HEAD', '--', file.file])
    return { file, rawPatch }
  })
  const patchResults = await Promise.all(patchPromises)

  // Process tracked file results
  const files: FileDiffInfo[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const { file, rawPatch } of patchResults) {
    const { additions, deletions } = getFileStats(file as any)
    totalAdditions += additions
    totalDeletions += deletions

    const isLarge = rawPatch.length > MAX_PATCH_SIZE
    const patch = isLarge ? '' : rawPatch

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

  // PARALLEL: Process untracked files - read all at once
  const untrackedFiles = untrackedRaw.trim().split('\n').filter(Boolean)

  const untrackedPromises = untrackedFiles.map(async (filePath) => {
    try {
      const fullPath = join(repoRoot, filePath)
      const content = await readFile(fullPath, 'utf-8')
      return { filePath, content, error: null }
    } catch {
      return { filePath, content: null, error: true }
    }
  })
  const untrackedResults = await Promise.all(untrackedPromises)

  // Process untracked file results
  for (const { filePath, content, error } of untrackedResults) {
    if (error || content === null) continue

    const lines = content.split('\n')
    const lineCount = lines.length
    const isLarge = content.length > MAX_PATCH_SIZE

    let patch = ''
    if (!isLarge) {
      const patchLines = lines.map((line) => `+${line}`).join('\n')
      patch = `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lineCount} @@
${patchLines}`
    }

    totalAdditions += lineCount
    files.push({
      path: filePath,
      status: 'untracked',
      additions: lineCount,
      deletions: 0,
      patch,
      isLarge,
    })
  }

  // PARALLEL: Fetch file modification times (skip deleted files as they don't exist)
  await Promise.all(
    files.map(async (f) => {
      if (f.status === 'deleted') return
      try {
        const fileStat = await stat(join(repoRoot, f.path))
        f.modifiedTime = fileStat.mtime.getTime()
      } catch {
        // File might not exist (e.g., staged but deleted)
      }
    })
  )

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

  // PARALLEL: Fetch all patches at once instead of sequentially
  const patchPromises = diffSummary.files.map(async (file) => {
    const patch = await git.diff([baseRef, sha, '--', file.file]).catch(() => '')
    return { file, patch }
  })
  const patchResults = await Promise.all(patchPromises)

  const files: FileDiffInfo[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const { file, patch } of patchResults) {
    const { additions, deletions } = getFileStats(file as any)
    totalAdditions += additions
    totalDeletions += deletions

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
  // Get commit count and diff summary in parallel
  const [countResult, diffSummary] = await Promise.all([
    git.raw(['rev-list', '--count', `${base}..${head}`]),
    git.diffSummary([base, head]),
  ])
  const commitCount = parseInt(countResult.trim(), 10)

  // PARALLEL: Fetch all patches at once instead of sequentially
  const patchPromises = diffSummary.files.map(async (file) => {
    const patch = await git.diff([base, head, '--', file.file]).catch(() => '')
    return { file, patch }
  })
  const patchResults = await Promise.all(patchPromises)

  const files: FileDiffInfo[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const { file, patch } of patchResults) {
    const { additions, deletions } = getFileStats(file as any)
    totalAdditions += additions
    totalDeletions += deletions

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

  // Parse porcelain output - collect basic info first
  const worktreeBlocks = worktreeOutput.trim().split('\n\n')
  const parsedWorktrees: Array<{ path: string; commit: string; branch: string; isCurrent: boolean }> = []

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

    parsedWorktrees.push({
      path,
      commit,
      branch,
      isCurrent: path === currentPath,
    })
  }

  // PARALLEL: Fetch stats for all worktrees at once
  const statsPromises = parsedWorktrees.map(async (wt) => {
    const { path, commit, branch, isCurrent } = wt

    // Fetch all three stats in parallel for each worktree
    const [behindOutput, aheadOutput, dateOutput] = await Promise.all([
      git.raw(['rev-list', '--count', `${branch}..${mainBranch}`]).catch(() => '0'),
      git.raw(['rev-list', '--count', `${mainBranch}..${branch}`]).catch(() => '0'),
      git.raw(['log', '-1', '--format=%cI', branch]).catch(() => new Date().toISOString()),
    ])

    return {
      path,
      branch,
      commit: commit.slice(0, 7),
      isCurrent,
      behindMain: parseInt(behindOutput.trim(), 10) || 0,
      aheadOfMain: parseInt(aheadOutput.trim(), 10) || 0,
      lastActivity: dateOutput.trim() || new Date().toISOString(),
    }
  })

  const worktrees = await Promise.all(statsPromises)

  // Sort by last activity (most recent first)
  worktrees.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

  return { worktrees, current: currentPath }
}

export interface RemoteInfo {
  url: string
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown'
  owner: string
  repo: string
}

export async function getRemoteUrl(git: SimpleGit): Promise<RemoteInfo | null> {
  try {
    const remoteUrl = (await git.raw(['config', '--get', 'remote.origin.url'])).trim()
    if (!remoteUrl) return null

    // Parse SSH format: git@github.com:owner/repo.git
    // Parse HTTPS format: https://github.com/owner/repo.git
    let url: string
    let owner: string
    let repo: string
    let provider: RemoteInfo['provider'] = 'unknown'

    if (remoteUrl.startsWith('git@')) {
      // SSH format: git@github.com:owner/repo.git
      const match = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
      if (!match) return null

      const host = match[1]
      const path = match[2]
      const [ownerPart, repoPart] = path.split('/')

      url = `https://${host}/${path}`
      owner = ownerPart
      repo = repoPart.replace(/\.git$/, '')
      provider = detectProvider(host)
    } else {
      // HTTPS format: https://github.com/owner/repo.git
      try {
        const parsed = new URL(remoteUrl)
        const pathParts = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')

        url = `${parsed.protocol}//${parsed.host}/${pathParts.join('/')}`
        owner = pathParts[0] || ''
        repo = pathParts[1] || ''
        provider = detectProvider(parsed.host)
      } catch {
        return null
      }
    }

    return { url, provider, owner, repo }
  } catch {
    return null
  }
}

function detectProvider(host: string): RemoteInfo['provider'] {
  if (host.includes('github')) return 'github'
  if (host.includes('gitlab')) return 'gitlab'
  if (host.includes('bitbucket')) return 'bitbucket'
  return 'unknown'
}

export interface FetchResult {
  success: boolean
  remote: string
  message: string
}

export async function performFetch(git: SimpleGit, remote = 'origin'): Promise<FetchResult> {
  await git.fetch([remote])
  return {
    success: true,
    remote,
    message: `Successfully fetched from ${remote}`,
  }
}

export interface CheckoutPRResult {
  success: boolean
  prNumber: number
  branchName: string
  message: string
}

export async function checkoutPR(git: SimpleGit, prNumber: number, remote = 'origin'): Promise<CheckoutPRResult> {
  const branchName = `pr-${prNumber}`

  // Fetch the PR ref to a local branch
  // GitHub format: pull/PR_NUMBER/head
  // GitLab format: merge-requests/MR_NUMBER/head
  // Try GitHub format first (most common)
  try {
    await git.fetch([remote, `pull/${prNumber}/head:${branchName}`])
  } catch {
    // Try GitLab format
    try {
      await git.fetch([remote, `merge-requests/${prNumber}/head:${branchName}`])
    } catch (e) {
      throw new Error(`Failed to fetch PR #${prNumber}. Make sure the PR exists and you have access to it.`)
    }
  }

  // Checkout the branch
  await git.checkout(branchName)

  return {
    success: true,
    prNumber,
    branchName,
    message: `Checked out PR #${prNumber} to branch ${branchName}`,
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
 * Opens a PR in a new worktree without affecting the current branch.
 * This allows viewing PRs in separate tabs without switching the main worktree.
 */
export async function openPRWorktree(git: SimpleGit, prNumber: number, remote = 'origin'): Promise<OpenPRWorktreeResult> {
  const branchName = `pr-${prNumber}`
  const os = await import('os')
  const path = await import('path')
  const fs = await import('fs/promises')

  // Get repo name for unique worktree directory
  const repoRoot = (await git.revparse(['--show-toplevel'])).trim()
  const repoName = path.basename(repoRoot)

  // Create worktree in temp directory
  const worktreePath = path.join(os.tmpdir(), `differ-${repoName}-pr-${prNumber}`)

  // Check if worktree already exists
  try {
    await fs.access(worktreePath)
    // Worktree exists, just return it
    return {
      success: true,
      prNumber,
      branchName,
      worktreePath,
      message: `PR #${prNumber} worktree already exists at ${worktreePath}`,
    }
  } catch {
    // Worktree doesn't exist, create it
  }

  // Fetch the PR ref to a local branch
  // GitHub format: pull/PR_NUMBER/head
  // GitLab format: merge-requests/MR_NUMBER/head
  try {
    await git.fetch([remote, `pull/${prNumber}/head:${branchName}`])
  } catch {
    try {
      await git.fetch([remote, `merge-requests/${prNumber}/head:${branchName}`])
    } catch {
      throw new Error(`Failed to fetch PR #${prNumber}. Make sure the PR exists and you have access to it.`)
    }
  }

  // Create the worktree
  try {
    await git.raw(['worktree', 'add', worktreePath, branchName])
  } catch (e) {
    // If worktree add fails because branch already exists, try without creating a new branch
    try {
      await git.raw(['worktree', 'add', worktreePath, branchName])
    } catch {
      throw new Error(`Failed to create worktree for PR #${prNumber}: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  return {
    success: true,
    prNumber,
    branchName,
    worktreePath,
    message: `Opened PR #${prNumber} in worktree at ${worktreePath}`,
  }
}

/**
 * Removes a PR worktree when the tab is closed.
 */
export async function closePRWorktree(git: SimpleGit, prNumber: number): Promise<{ success: boolean; message: string }> {
  const os = await import('os')
  const path = await import('path')

  // Get repo name for worktree directory
  const repoRoot = (await git.revparse(['--show-toplevel'])).trim()
  const repoName = path.basename(repoRoot)

  const worktreePath = path.join(os.tmpdir(), `differ-${repoName}-pr-${prNumber}`)

  try {
    // Remove the worktree
    await git.raw(['worktree', 'remove', worktreePath, '--force'])

    // Optionally delete the local branch
    const branchName = `pr-${prNumber}`
    try {
      await git.branch(['-D', branchName])
    } catch {
      // Branch might not exist or be checked out elsewhere
    }

    return {
      success: true,
      message: `Removed PR #${prNumber} worktree`,
    }
  } catch (e) {
    return {
      success: false,
      message: `Failed to remove worktree: ${e instanceof Error ? e.message : 'Unknown error'}`,
    }
  }
}
