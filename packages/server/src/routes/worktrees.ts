import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { existsSync } from 'fs'
import { getWorktrees } from '../git'
import type { FileWatcher } from './ws'

interface GitState {
  git: SimpleGit
  repoPath: string
  fileWatcher: FileWatcher
}

export function createWorktreeRoutes(
  getGit: () => SimpleGit,
  state: GitState,
  createGitClient: (path: string) => SimpleGit,
  createFileWatcher: (path: string) => FileWatcher
) {
  const app = new Hono()

  // GET /api/worktrees - Get all worktrees with their status relative to main
  app.get('/', async (c) => {
    try {
      const mainBranch = c.req.query('main') || 'main'
      const onlyBehind = c.req.query('onlyBehind') === 'true'

      const { worktrees, current } = await getWorktrees(getGit(), mainBranch)

      // Optionally filter to only show worktrees that are behind main
      const filtered = onlyBehind
        ? worktrees.filter((w) => w.behindMain > 0)
        : worktrees

      // Mark which worktree is currently being viewed (may differ from git's "current")
      const withActiveState = filtered.map(w => ({
        ...w,
        isActive: w.path === state.repoPath,
      }))

      return c.json({
        worktrees: withActiveState,
        current,
        activePath: state.repoPath,
        mainBranch,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get worktrees'
      return c.json({ error: message }, 500)
    }
  })

  // POST /api/worktrees/switch - Switch to a different worktree
  app.post('/switch', async (c) => {
    try {
      const body = await c.req.json()
      const { path: worktreePath } = body

      if (!worktreePath) {
        return c.json({ error: 'path is required' }, 400)
      }

      // Verify the path exists and is a git worktree
      if (!existsSync(worktreePath)) {
        return c.json({ error: 'Worktree path does not exist' }, 400)
      }

      // Close old file watcher
      state.fileWatcher.close()

      // Update state with new worktree
      state.repoPath = worktreePath
      state.git = createGitClient(worktreePath)
      state.fileWatcher = createFileWatcher(worktreePath)

      // Notify all connected clients about the worktree change
      const message = JSON.stringify({ type: 'worktree-changed', path: worktreePath })
      for (const client of state.fileWatcher.clients) {
        try {
          client.send(message)
        } catch {
          // Client might be disconnected
        }
      }

      return c.json({
        success: true,
        path: worktreePath,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to switch worktree'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
