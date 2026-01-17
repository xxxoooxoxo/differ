import { Hono } from 'hono'
import type { SimpleGit } from 'simple-git'
import { getCurrentDiff, getFileContents, getBinaryFileContents } from '../git'
import { getGitForRequest } from './utils'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.tif']

export function isImageFile(path: string): boolean {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'))
  return IMAGE_EXTENSIONS.includes(ext)
}

export function createDiffRoutes(getGit: () => SimpleGit) {
  const app = new Hono()

  // GET /api/diff/current - Get current uncommitted changes
  // Supports optional ?repoPath= query param for multi-tab support
  app.get('/current', async (c) => {
    try {
      const git = getGitForRequest(c, getGit)
      const diff = await getCurrentDiff(git)
      return c.json(diff)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get diff'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/diff/file?path=... - Get patch for a single file (for large files loaded on demand)
  // Supports optional ?repoPath= query param for multi-tab support
  app.get('/file', async (c) => {
    try {
      const filePath = c.req.query('path')
      if (!filePath) {
        return c.json({ error: 'Missing path parameter' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const patch = await git.diff(['HEAD', '--', filePath])
      return c.json({ path: filePath, patch })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file diff'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/diff/file-content?path=...&ref=... - Get file content (working dir or specific ref)
  // Supports optional ?repoPath= query param for multi-tab support
  app.get('/file-content', async (c) => {
    try {
      const filePath = c.req.query('path')
      const ref = c.req.query('ref') // optional: 'HEAD' or specific commit
      if (!filePath) {
        return c.json({ error: 'Missing path parameter' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const content = await getFileContents(git, filePath, ref || undefined)
      return c.json({ path: filePath, content, ref: ref || 'working' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get file content'
      return c.json({ error: message }, 500)
    }
  })

  // GET /api/diff/image?path=...&ref=... - Get image content as base64
  // Returns { path, data, mimeType, ref } or { error, exists: false } if file doesn't exist
  app.get('/image', async (c) => {
    try {
      const filePath = c.req.query('path')
      const ref = c.req.query('ref') // optional: 'HEAD' or specific commit
      if (!filePath) {
        return c.json({ error: 'Missing path parameter' }, 400)
      }

      if (!isImageFile(filePath)) {
        return c.json({ error: 'Not an image file' }, 400)
      }

      const git = getGitForRequest(c, getGit)
      const result = await getBinaryFileContents(git, filePath, ref || undefined)

      if (!result) {
        return c.json({ path: filePath, exists: false, ref: ref || 'working' })
      }

      // Determine MIME type from extension
      const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'))
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      return c.json({
        path: filePath,
        data: result.toString('base64'),
        mimeType,
        ref: ref || 'working',
        exists: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get image'
      // If file doesn't exist at ref, return exists: false instead of error
      if (message.includes('does not exist') || message.includes('not found')) {
        return c.json({ path: c.req.query('path'), exists: false, ref: c.req.query('ref') || 'working' })
      }
      return c.json({ error: message }, 500)
    }
  })

  return app
}
