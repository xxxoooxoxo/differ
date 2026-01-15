# Differ

A performant git diff viewer with a web UI.

## Features

- Split diff view using @pierre/diffs
- Live reload on file changes
- Commit history browser
- Branch comparison

## Usage

```bash
differ                    # View diffs in current directory
differ /path/to/repo      # View diffs in specific repo
differ -p 3000            # Use specific port
differ --no-open          # Don't open browser
```

## Development

```bash
bun install
bun run dev        # Start Vite dev server
bun run differ     # Start the CLI
```

Test
