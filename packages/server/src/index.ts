import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createGitClient } from './git'
import { createDiffRoutes } from './routes/diff'
import { createCommitRoutes } from './routes/commits'
import { createBranchRoutes } from './routes/branches'
import { createPRRoutes } from './routes/prs'
import { createConfigRoutes } from './routes/config'
import { createWorktreeRoutes } from './routes/worktrees'
import { createFileWatcher, createWebSocketHandlers, type FileWatcher } from './routes/ws'
import { loadConfig, DEFAULT_CONFIG, type DifferConfig } from './config'

export * from './git'
export * from './config'
export { createFileWatcher, createWebSocketHandlers, type FileWatcher }

export interface ServerConfig {
  repoPath: string
  webDistPath?: string
  differConfig?: Partial<DifferConfig>
}

// Mutable state container for git client and file watcher
interface GitState {
  git: ReturnType<typeof createGitClient>
  repoPath: string
  fileWatcher: FileWatcher
}

export function createServer(serverConfig: ServerConfig) {
  const { repoPath: initialRepoPath, webDistPath, differConfig: configOverrides } = serverConfig

  // Load config from files, with CLI overrides taking precedence
  const differConfig = loadConfig(initialRepoPath, configOverrides)

  // Mutable state that can be switched when changing worktrees
  const state: GitState = {
    git: createGitClient(initialRepoPath),
    repoPath: initialRepoPath,
    fileWatcher: createFileWatcher(initialRepoPath),
  }

  // Getter functions so routes always use current git client
  const getGit = () => state.git
  const getRepoPath = () => state.repoPath
  const getFileWatcher = () => state.fileWatcher

  const wsHandlers = createWebSocketHandlers(state.fileWatcher)

  const app = new Hono()

  // Enable CORS for development
  app.use('*', cors())

  // Health check
  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', repoPath: getRepoPath() })
  })

  // API routes - use getter functions for dynamic git client
  app.route('/api/diff', createDiffRoutes(getGit))
  app.route('/api/commits', createCommitRoutes(getGit))
  app.route('/api/branches', createBranchRoutes(getGit))
  app.route('/api/prs', createPRRoutes(getGit))
  app.route('/api/config', createConfigRoutes(initialRepoPath, differConfig))
  app.route('/api/worktrees', createWorktreeRoutes(getGit, state, createGitClient, createFileWatcher))

  // Serve static files if webDistPath is provided
  if (webDistPath) {
    const indexPath = join(webDistPath, 'index.html')
    const rawHtml = existsSync(indexPath) ? readFileSync(indexPath, 'utf-8') : ''

    // Serve index.html with injected config for SPA routes
    // Re-inject config on each request so saved config changes are reflected
    const serveIndex = (c: any) => {
      if (!rawHtml) {
        return c.text('Not found', 404)
      }
      const configScript = `<script>window.__DIFFER__=${JSON.stringify({ config: differConfig, repoPath: state.repoPath })}</script>`
      const html = rawHtml.replace('</head>', `${configScript}</head>`)
      return c.html(html)
    }

    // Static assets (js, css, etc.)
    app.use('/assets/*', serveStatic({ root: webDistPath }))

    // SPA fallback - serve injected HTML for all other routes
    app.get('*', serveIndex)
  }

  return {
    app,
    get fileWatcher() { return state.fileWatcher },
    wsHandlers,
    fetch: app.fetch,
    state,
  }
}

const DEFAULT_PORT = 1738
const MAX_PORT_ATTEMPTS = 10

export function startServer(config: ServerConfig & { port?: number }) {
  const { port = DEFAULT_PORT } = config
  const serverInstance = createServer(config)
  const { app, state } = serverInstance

  let currentPort = port
  let server: ReturnType<typeof Bun.serve<{ state: GitState }>> | null = null
  let attempts = 0

  while (!server && attempts < MAX_PORT_ATTEMPTS) {
    try {
      server = Bun.serve<{ state: GitState }>({
        port: currentPort,
        fetch(request, server) {
          // Handle WebSocket upgrade
          const url = new URL(request.url)
          if (url.pathname === '/ws') {
            const success = server.upgrade(request, {
              data: { state },
            })
            if (success) return undefined
            return new Response('WebSocket upgrade failed', { status: 500 })
          }

          return app.fetch(request)
        },
        websocket: {
          open(ws) {
            // Use current fileWatcher from state
            state.fileWatcher.clients.add(ws as unknown as WebSocket)
            ws.send(JSON.stringify({ type: 'connected' }))
          },
          close(ws) {
            state.fileWatcher.clients.delete(ws as unknown as WebSocket)
          },
          message(ws, message) {
            const data = typeof message === 'string' ? message : message.toString()
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }))
              }
            } catch {
              // Ignore invalid messages
            }
          },
        },
      })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
        attempts++
        currentPort++
      } else {
        throw err
      }
    }
  }

  if (!server) {
    throw new Error(`Failed to start server after ${MAX_PORT_ATTEMPTS} attempts. Ports ${port}-${currentPort - 1} are all in use.`)
  }

  console.log(`Server running at http://localhost:${server.port}`)

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    state.fileWatcher.close()
    server.stop()
    process.exit(0)
  })

  return server
}
