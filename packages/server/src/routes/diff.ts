import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { getCurrentDiff, getFileContents } from '../git'

export function createDiffRoutes(getGit: () => SimpleGit) {
  const app = new Hono()

  // GET /api/diff/current - Get current uncommitted changes
  app.get('/current', async (c) => {
    try {
      const diff = await getCurrentDiff(getGit())
      return c.json(diff)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get diff'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/diff/file?path=... - Get patch for a single file (for large files loaded on demand)
  app.get('/file', async (c) => {
    try {
      const filePath = c.req.query('path')
      if (!filePath) {
        return c.json({ error: 'Missing path parameter' }, 400)
      }

      const patch = await getGit().diff(['HEAD', '--', filePath])
      return c.json({ path: filePath, patch })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file diff'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/diff/file-content?path=...&ref=... - Get file content (working dir or specific ref)
  app.get('/file-content', async (c) => {
    try {
      const filePath = c.req.query('path')
      const ref = c.req.query('ref') // optional: 'HEAD' or specific commit
      if (!filePath) {
        return c.json({ error: 'Missing path parameter' }, 400)
      }

      const content = await getFileContents(getGit(), filePath, ref || undefined)
      return c.json({ path: filePath, content, ref: ref || 'working' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file content'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
