## Invocation

```bash
# Baseline: run <cmd> on any change in cwd (recursively, respecting .gitignore)
watchexec -- <cmd>

# Filter by extension (comma-separated, no leading dot)
watchexec -e ts,tsx,js -- bun test
watchexec -e rs -- cargo test
watchexec -e py -- pytest

# Glob filter / ignore
watchexec -f 'src/**/*.ts' -- bun run typecheck
watchexec -i 'dist/**' -i 'node_modules/**' -- bun build

# Watch specific directories (repeatable)
watchexec -w src -w tests -- bun test

# Restart a long-running process on change (kills the previous run first)
watchexec --restart -- bun run server.ts
watchexec -r -- cargo run

# Clear screen between runs; debounce; don't run on startup
watchexec -c -- cargo check
watchexec -d 500 -- pytest                # 500 ms debounce (default 50)
watchexec --postpone -- make               # wait for first change before running

# Pull ignore patterns from a file
watchexec --ignore-file .watchexecignore -- bun test

# Disable .gitignore reading (raw mode)
watchexec --no-vcs-ignore -- echo changed
```
