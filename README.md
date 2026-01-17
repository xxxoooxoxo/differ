# differ

The best diff viewer for working with AI.

## What is this?

A simple, local-only Git diff viewer. Think offline Graphite—quickly review small patches scattered across multiple locations in your local and remote repos.

**What it is:**
- A fast way to review diffs with syntax highlighting
- Split and unified diff views
- Branch comparison and commit history browser
- Live reload when files change
- Keyboard-driven navigation

**What it is not:**
- Not an orchestrator
- No automated reviewing
- No commenting
- Not collaborative

Just you and your code.

## Install

```bash
git clone https://github.com/xxxoooxoxo/differ.git
cd differ
bun install
bun run build:cli

# Link globally (optional)
sudo ln -sf $(pwd)/dist/differ /usr/local/bin/differ
```

## Usage

```bash
differ                    # current directory
differ /path/to/repo      # specific repo
differ -p 8080            # custom port
differ --no-open          # don't open browser
```

## Development

```bash
bun install

# Terminal 1: frontend
bun run dev

# Terminal 2: backend
bun run differ ./
```

Frontend runs on `localhost:5173`, proxies API calls to backend on `localhost:1738`.

## Stack

- Runtime: Bun
- Backend: Hono
- Frontend: React 19, Vite, shadcn/ui
- Diff rendering: @pierre/diffs

## License

MIT
