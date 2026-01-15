# differ

A local git diff viewer with syntax highlighting.

## Install

```bash
# Clone and build
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

## Features

- Split and unified diff views
- Syntax highlighting via shiki
- File tree and flat list navigation
- Branch comparison
- Commit history browser
- Live reload on file changes

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
