import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { listPRs, getPRInfo, getPRDiff } from '../git'
import { getGitForRequest } from './utils'

export function createPRRoutes(getGit: () => SimpleGit) {
  const app = new Hono()

  // GET /api/prs - List PRs
  // Query params: state=open|closed|all, limit=50, repoPath=...
  app.get('/', async (c) => {
    try {
      const state = c.req.query('state') as 'open' | 'closed' | 'all' | undefined
      const limitStr = c.req.query('limit')
      const limit = limitStr ? parseInt(limitStr, 10) : 50

      const git = getGitForRequest(c, getGit)
      const result = await listPRs(git, { state, limit })

      c.header('Cache-Control', 'public, max-age=30') // Short cache for PR list
      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list PRs'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/prs/:number - Get PR info
  app.get('/:number', async (c) => {
    try {
      const prNumber = parseInt(c.req.param('number'), 10)

      if (isNaN(prNumber)) {
        return c.json({ error: 'Invalid PR number' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await getPRInfo(git, prNumber)

      if (!result) {
        return c.json({ error: `PR #${prNumber} not found` }, 404)
      }

      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get PR info'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/prs/:number/diff - Get PR diff
  app.get('/:number/diff', async (c) => {
    try {
      const prNumber = parseInt(c.req.param('number'), 10)

      if (isNaN(prNumber)) {
        return c.json({ error: 'Invalid PR number' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await getPRDiff(git, prNumber)

      return c.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get PR diff'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
