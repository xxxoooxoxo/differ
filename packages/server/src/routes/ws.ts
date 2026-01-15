import { watch, type FSWatcher } from 'fs'
import { join } from 'path'

export interface FileWatcher {
  watcher: FSWatcher
  clients: Set<WebSocket>
  broadcast: (message: string) => void
  close: () => void
}

export function createFileWatcher(repoPath: string): FileWatcher {
  const clients = new Set<WebSocket>()
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null

  const broadcast = (message: string) => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  }

  const watcher = watch(repoPath, { recursive: true }, (event, filename) => {
    // Ignore .git, node_modules, and dist directory changes
    if (!filename ||
        filename.startsWith('.git') ||
        filename.includes('node_modules') ||
        filename.includes('/dist/') ||
        filename.startsWith('dist/')) return

    // Debounce to avoid spamming on rapid file changes
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    debounceTimeout = setTimeout(() => {
      broadcast(JSON.stringify({
        type: 'change',
        event,
        file: filename,
        timestamp: Date.now(),
      }))
    }, 300)
  })

  const close = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }
    watcher.close()
    for (const client of clients) {
      client.close()
    }
    clients.clear()
  }

  return {
    watcher,
    clients,
    broadcast,
    close,
  }
}

export function handleWebSocketUpgrade(
  fileWatcher: FileWatcher,
  request: Request,
  server: { upgrade: (request: Request, options?: { data?: unknown }) => boolean }
): Response | undefined {
  const url = new URL(request.url)

  if (url.pathname === '/ws') {
    const success = server.upgrade(request, {
      data: { fileWatcher },
    })

    if (success) {
      return undefined // Bun handles the upgrade
    }

    return new Response('WebSocket upgrade failed', { status: 500 })
  }

  return undefined
}

export function createWebSocketHandlers(fileWatcher: FileWatcher) {
  // Periodic cleanup of dead connections every 30 seconds
  const cleanupInterval = setInterval(() => {
    for (const client of fileWatcher.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        fileWatcher.clients.delete(client)
      }
    }
  }, 30000)

  // Store cleanup interval reference for shutdown
  const originalClose = fileWatcher.close
  fileWatcher.close = () => {
    clearInterval(cleanupInterval)
    originalClose()
  }

  return {
    open(ws: WebSocket) {
      fileWatcher.clients.add(ws)
      ws.send(JSON.stringify({ type: 'connected' }))
    },

    close(ws: WebSocket) {
      fileWatcher.clients.delete(ws)
    },

    error(ws: WebSocket) {
      // Remove client on error to prevent memory leaks
      fileWatcher.clients.delete(ws)
    },

    message(ws: WebSocket, message: string | Buffer) {
      // Handle ping/pong for keepalive
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
  }
}
