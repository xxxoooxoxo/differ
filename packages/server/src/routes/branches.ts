import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { getBranches, compareBranches, getFileContents, getRemoteUrl, performFetch } from '../git'

export function createBranchRoutes(getGit: () => SimpleGit) {
  const app = new Hono()

  // GET /api/branches - List all branches
  app.get('/', async (c) => {
    try {
      const result = await getBranches(getGit())
      c.header('Cache-Control', 'public, max-age=60')
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get branches'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/branches/compare?base=...&head=... - Compare two branches
  app.get('/compare', async (c) => {
    try {
      const base = c.req.query('base')
      const head = c.req.query('head')

      if (!base || !head) {
        return c.json({ error: 'base and head query parameters are required' }, 400)
      }

      const result = await compareBranches(getGit(), base, head)
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to compare branches'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/file - Get file contents
  app.get('/file', async (c) => {
    try {
      const path = c.req.query('path')
      const ref = c.req.query('ref')

      if (!path) {
        return c.json({ error: 'path parameter is required' }, 400)
      }

      const content = await getFileContents(getGit(), path, ref || undefined)
      return c.json({ content })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file contents'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/branches/remote - Get remote origin info
  app.get('/remote', async (c) => {
    try {
      const remote = await getRemoteUrl(getGit())
      c.header('Cache-Control', 'public, max-age=300')
      return c.json({ remote })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get remote URL'
      return c.json({ error: message }, 500)
    }
  })

  // POST /api/branches/fetch - Fetch from remote
  app.post('/fetch', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const remote = (body as { remote?: string }).remote || 'origin'
      const result = await performFetch(getGit(), remote)
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch from remote'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
