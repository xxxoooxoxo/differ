import type { Context } from 'hono'
import type { SimpleGit } from 'simple-git'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { createGitClient } from '../git'

/**
 * Get a git client for a request, optionally using a different repoPath.
 * If repoPath query param is provided and valid, creates a new git client for that path.
 * Otherwise falls back to the default git client.
 */
export function getGitForRequest(
  c: Context,
  defaultGetGit: () => SimpleGit,
  createGit: typeof createGitClient = createGitClient
): SimpleGit {
  const repoPath = c.req.query('repoPath')

  if (repoPath) {
    // Validate the path exists and is a directory
    const resolvedPath = resolve(repoPath)
    if (existsSync(resolvedPath)) {
      // Create a temporary git client for this request
      return createGit(resolvedPath)
    }
    // If path doesn't exist, fall through to default
  }

  return defaultGetGit()
}

/**
 * Validate that a path is a valid git repository.
 * Returns true if valid, throws error if not.
 */
export async function validateGitRepo(git: SimpleGit): Promise<boolean> {
  try {
    await git.status()
    return true
  } catch {
    throw new Error('Not a valid git repository')
  }
}
