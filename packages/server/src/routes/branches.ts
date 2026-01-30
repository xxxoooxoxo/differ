import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { getBranches, compareBranches, getFileContents, getRemoteUrl, performFetch, checkoutPR, openPRWorktree, closePRWorktree } from '../git'
import { getGitForRequest } from './utils'

export function createBranchRoutes(getGit: () => SimpleGit) {
  const app = new Hono()

  // GET /api/branches - List all branches
  // Supports optional ?repoPath= query param for multi-tab support
  app.get('/', async (c) => {
    try {
      const git = getGitForRequest(c, getGit)
      const result = await getBranches(git)
      c.header('Cache-Control', 'public, max-age=60')
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get branches'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/branches/compare?base=...&head=...&useMergeBase=true - Compare two branches
  // Supports optional ?repoPath= query param for multi-tab support
  // When useMergeBase=true (default), shows only changes introduced by head branch
  // When useMergeBase=false, shows all differences between base and head
  app.get('/compare', async (c) => {
    try {
      const base = c.req.query('base')
      const head = c.req.query('head')
      const useMergeBaseParam = c.req.query('useMergeBase')
      // Default to true for better UX - show only branch changes by default
      const useMergeBase = useMergeBaseParam !== 'false'

      if (!base || !head) {
        return c.json({ error: 'base and head query parameters are required' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await compareBranches(git, base, head, { useMergeBase })
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to compare branches'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/file - Get file contents
  // Supports optional ?repoPath= query param for multi-tab support
  app.get('/file', async (c) => {
    try {
      const path = c.req.query('path')
      const ref = c.req.query('ref')

      if (!path) {
        return c.json({ error: 'path parameter is required' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const content = await getFileContents(git, path, ref || undefined)
      return c.json({ content })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file contents'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/branches/remote - Get remote origin info
  // Supports optional ?repoPath= query param for multi-tab support
  app.get('/remote', async (c) => {
    try {
      const git = getGitForRequest(c, getGit)
      const remote = await getRemoteUrl(git)
      c.header('Cache-Control', 'public, max-age=300')
      return c.json({ remote })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get remote URL'
      return c.json({ error: message }, 500)
    }
  })

  // POST /api/branches/fetch - Fetch from remote
  // Supports optional ?repoPath= query param for multi-tab support
  app.post('/fetch', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const remote = (body as { remote?: string }).remote || 'origin'
      const git = getGitForRequest(c, getGit)
      const result = await performFetch(git, remote)
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch from remote'
      return c.json({ error: message }, 500)
    }
  })

  // POST /api/branches/checkout-pr - Checkout a PR by number
  // Supports optional ?repoPath= query param for multi-tab support
  app.post('/checkout-pr', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const prNumber = (body as { prNumber?: number }).prNumber
      const remote = (body as { remote?: string }).remote || 'origin'

      if (!prNumber || typeof prNumber !== 'number') {
        return c.json({ error: 'prNumber is required and must be a number' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await checkoutPR(git, prNumber, remote)
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to checkout PR'
      return c.json({ error: message }, 500)
    }
  })

  // POST /api/branches/open-pr-worktree - Open a PR in a new worktree (for tab isolation)
  app.post('/open-pr-worktree', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const prNumber = (body as { prNumber?: number }).prNumber
      const remote = (body as { remote?: string }).remote || 'origin'

      if (!prNumber || typeof prNumber !== 'number') {
        return c.json({ error: 'prNumber is required and must be a number' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await openPRWorktree(git, prNumber, remote)
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open PR worktree'
      return c.json({ error: message }, 500)
    }
  })

  // POST /api/branches/close-pr-worktree - Close a PR worktree (cleanup on tab close)
  app.post('/close-pr-worktree', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const prNumber = (body as { prNumber?: number }).prNumber

      if (!prNumber || typeof prNumber !== 'number') {
        return c.json({ error: 'prNumber is required and must be a number' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await closePRWorktree(git, prNumber)
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close PR worktree'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
