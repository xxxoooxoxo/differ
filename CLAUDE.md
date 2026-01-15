# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
bun install              # Install all workspace dependencies
bun run typecheck        # Type-check all packages (use this to verify changes)
bun run dev              # Start Vite dev server (frontend only, port 5173)
bun run differ           # Run CLI from source (starts backend server)
bun run build:cli        # Create standalone binary
```

**Important**: Use `bun run typecheck` to verify changes work, not `bun run build`.

### Tauri Development

```bash
bun run tauri:dev        # Start Tauri development mode
bun run tauri:build      # Build Tauri app for production
```

## Architecture

Differ is a monorepo git diff viewer with three packages plus optional Tauri desktop app:

```
packages/
├── cli/     → Command-line entry point (Bun executable)
├── server/  → Hono backend with git operations + WebSocket
└── web/     → React 19 + Vite frontend
src-tauri/   → Tauri desktop app (Rust backend)
```

**Data Flow** (Web Mode):
```
CLI (argument parsing, starts server)
  ↓
Server (Hono routes, simple-git wrapper, WebSocket file watcher)
  ↓
Web (React Router pages, diff rendering with @pierre/diffs)
```

**Data Flow** (Tauri Mode):
```
Tauri (Rust commands in src-tauri/src/)
  ↓
Web (same React app, uses lib/api.ts abstraction)
```

## Key Technologies

- **Runtime/Package Manager**: Bun
- **Backend**: Hono 4.6, simple-git, Bun.serve (native HTTP/WebSocket)
- **Frontend**: React 19, React Router 7, Vite 7, @pierre/diffs, shadcn/ui
- **Desktop**: Tauri 2 (optional)

## Package Details

### @differ/server

**Routes** (in `src/routes/`):
- `/api/diff` - Working directory changes and file diffs
- `/api/commits` - Commit history and individual commit details
- `/api/branches` - Branch listing, comparison, remote info, fetch
- `/api/config` - Configuration management
- `/ws` - WebSocket for live file change notifications

**Git Operations** (in `src/git/index.ts`):
- `getCurrentDiff()` - Working directory vs HEAD
- `getCommitHistory()` - Paginated commit log
- `getCommitDiff()` - Changes in a specific commit
- `compareBranches()` - Diff between branches
- Files >50KB patch size are lazy-loaded to prevent browser lockup

### @differ/web

**API Abstraction** (`src/lib/api.ts`):
- Unified API layer that works in both web (HTTP fetch) and Tauri (invoke) modes
- All hooks import from `../lib/api` using relative paths (not `@/` aliases - Vite 7 build compatibility)

**Pages** (in `src/pages/`):
- `CurrentChanges` (/) - Uncommitted changes
- `HistoryPage` (/history) - Commit browser
- `CommitView` (/commit/:sha) - Single commit details
- `CompareView` (/compare) - Branch comparison
- `WelcomePage` - Tauri-only directory picker

**Vite Config**: Dev proxy sends `/api/*` and `/ws` → localhost:1738

### @differ/cli

Entry point at `src/index.ts`. Parses CLI args, starts server on port 1738, opens browser.

## Configuration System

Hierarchy: CLI args > `.differrc.json` (repo) > `~/.config/differ/config.json` (global) > defaults

Options: `editor`, `diffStyle` (split/unified), `port`, `autoOpen`, `largeFileThreshold`

## Development Workflow

For full development (frontend + backend):
```bash
# Terminal 1: Frontend dev server
bun run dev

# Terminal 2: Backend server
bun run differ ./
```

Frontend at localhost:5173 proxies API calls to backend at localhost:1738.
