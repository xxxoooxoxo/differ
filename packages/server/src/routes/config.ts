import { Hono } from 'hono'
import { saveConfig, getConfigPath, type DifferConfig } from '../config'

export function createConfigRoutes(repoPath: string, config: DifferConfig) {
  const app = new Hono()

  // GET /api/config - Get current config
  app.get('/', (c) => {
    return c.json({
      config,
      paths: {
        local: getConfigPath({ repoPath }),
        global: getConfigPath({ global: true }),
      },
    })
  })

  // PATCH /api/config - Update config
  app.patch('/', async (c) => {
    try {
      const body = await c.req.json()
      const { updates, global: saveGlobal } = body as {
        updates: Partial<DifferConfig>
        global?: boolean
      }

      if (!updates || typeof updates !== 'object') {
        return c.json({ error: 'Missing updates object' }, 400)
      }

      // Save to file
      saveConfig(updates, { repoPath, global: saveGlobal })

      // Update in-memory config
      Object.assign(config, updates)

      return c.json({
        success: true,
        config,
        savedTo: getConfigPath({ repoPath, global: saveGlobal }),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update config'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
