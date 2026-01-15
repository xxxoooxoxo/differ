#!/usr/bin/env bun

import { parseArgs } from 'util'
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import open from 'open'
import { startServer, loadConfig, type EditorType, type DiffStyle } from '@differ/server'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: 'string', short: 'p' },
    editor: { type: 'string', short: 'e' },
    'diff-style': { type: 'string', short: 'd' },
    'no-open': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
})

if (values.help) {
  console.log(`
differ - Git diff viewer

Usage:
  differ [directory] [options]

Arguments:
  directory     Path to git repository (default: current directory)

Options:
  -p, --port <port>      Port to run server on (default: auto-select)
  -e, --editor <editor>  Default editor: vscode, cursor, zed, sublime, webstorm, idea
  -d, --diff-style       Default diff style: split, unified
  --no-open              Don't open browser automatically
  -h, --help             Show this help message

Config:
  Create .differrc.json in your repo or ~/.config/differ/config.json globally.

  Example .differrc.json:
  {
    "editor": "zed",
    "diffStyle": "unified",
    "port": 3000,
    "autoOpen": true
  }

Examples:
  differ                    # View diffs in current directory
  differ /path/to/repo      # View diffs in specific repo
  differ -p 3000            # Use specific port
  differ -e zed             # Use Zed as default editor
  differ --no-open          # Don't open browser
`)
  process.exit(0)
}

// Resolve repository path
const repoPath = resolve(positionals[0] || process.cwd())

// Verify it's a git repository
const gitDir = join(repoPath, '.git')
if (!existsSync(gitDir)) {
  console.error(`Error: ${repoPath} is not a git repository`)
  console.error('Make sure the directory contains a .git folder')
  process.exit(1)
}

// Resolve web dist path - look for built web assets
// When running from source: ../../web/dist relative to this file
// When running as compiled binary: ./web/dist next to the binary
let webDistPath = resolve(import.meta.dir, '../../web/dist')
let webDistExists = existsSync(webDistPath)

// Fallback for compiled binary - use the executable's directory
if (!webDistExists) {
  const execDir = resolve(process.execPath, '..')
  webDistPath = resolve(execDir, 'web/dist')
  webDistExists = existsSync(webDistPath)
}

if (!webDistExists) {
  console.log('Note: Web UI not built. Run `bun run build` first for production use.')
  console.log('Starting in development mode (connect Vite dev server separately)...\n')
}

// Load config from files first
const fileConfig = loadConfig(repoPath)

// Build CLI overrides (these take precedence over file config)
const cliOverrides: Record<string, unknown> = {}
if (values.port !== undefined) {
  cliOverrides.port = parseInt(values.port, 10)
}
if (values.editor !== undefined) {
  cliOverrides.editor = values.editor as EditorType
}
if (values['diff-style'] !== undefined) {
  cliOverrides.diffStyle = values['diff-style'] as DiffStyle
}
if (values['no-open']) {
  cliOverrides.autoOpen = false
}

// Merge: file config + CLI overrides
const config = { ...fileConfig, ...cliOverrides }

// Start server
const server = startServer({
  repoPath,
  webDistPath: webDistExists ? webDistPath : undefined,
  port: config.port,
  differConfig: config,
})

const url = `http://localhost:${server.port}`

console.log(`\n  Differ is running!\n`)
console.log(`  Repository: ${repoPath}`)
console.log(`  URL:        ${url}`)
if (config.editor !== 'vscode') {
  console.log(`  Editor:     ${config.editor}`)
}
console.log(`\n  Press Ctrl+C to stop\n`)

// Open browser (respect config.autoOpen)
if (config.autoOpen) {
  open(url).catch(() => {
    // Ignore errors opening browser
  })
}
