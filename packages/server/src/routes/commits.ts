import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { getCommitHistory, getCommitDiff } from '../git'

export function createCommitRoutes(getGit: () => SimpleGit) {
  const app = new Hono()

  // GET /api/commits - Paginated commit history
  app.get('/', async (c) => {
    try {
      const page = parseInt(c.req.query('page') || '1', 10)
      const limit = parseInt(c.req.query('limit') || '20', 10)
      const offset = (page - 1) * limit

      const { commits, total } = await getCommitHistory(getGit(), { limit, offset })

      c.header('Cache-Control', 'public, max-age=30')
      return c.json({
        commits,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get commits'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/commits/:sha/diff - Get diff for specific commit
  app.get('/:sha/diff', async (c) => {
    try {
      const sha = c.req.param('sha')
      const result = await getCommitDiff(getGit(), sha)
      // Commit diffs are immutable, cache for 1 hour
      c.header('Cache-Control', 'public, max-age=3600, immutable')
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get commit diff'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
