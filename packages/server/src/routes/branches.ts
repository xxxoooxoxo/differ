import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { getBranches, compareBranches, getFileContents } from '../git'

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

  return app
}
