# Fulcrum

Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, worktrees, quality gates, artifacts, and policy decisions.

## Development

Required for this source checkout:

- Node.js 22-compatible runtime
- pnpm 10.x
- git for repository registration, code search context, and worktree workflows

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @fulcrum/cli dev -- setup preview --json
pnpm --filter @fulcrum/cli dev -- setup apply --json
pnpm --filter @fulcrum/cli dev -- doctor --json --no-network
```

## Apps

- CLI: `pnpm --filter @fulcrum/cli dev -- --help`
- Local API server: `pnpm --filter @fulcrum/server dev`
- Cockpit web UI: `pnpm --filter @fulcrum/cockpit dev`
- Terminal dashboard/TUI: `pnpm --filter @fulcrum/tui dev`
- MCP stdio: `pnpm --filter @fulcrum/cli dev -- mcp stdio`

Default behavior is local-only. The server binds to `127.0.0.1`; remote adapters, telemetry, public binds, and remote model/provider calls are disabled unless explicitly configured and approved by policy.
