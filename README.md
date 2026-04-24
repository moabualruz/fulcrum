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

## Package And Start

Build the packaged local product from the repository root:

```bash
pnpm install
pnpm build:package
```

The package exposes `fulcrum` at `apps/cli/dist/main.js`. Use the installed package runner or the root start script against the built artifacts:

```bash
pnpm exec fulcrum --help
pnpm exec fulcrum setup apply --json
pnpm exec fulcrum doctor --json --no-network
pnpm exec fulcrum server start --bind 127.0.0.1:3410
pnpm exec fulcrum tui --view dashboard
pnpm exec fulcrum mcp tools --json
```

Equivalent root runner examples:

```bash
pnpm start -- --help
pnpm start -- --json setup apply
pnpm start -- --json doctor --no-network
pnpm start -- --json server start --bind 127.0.0.1:3410
pnpm start -- tui --view dashboard
pnpm start -- --json mcp tools
```

`pnpm start:server` runs the packaged local API on loopback by default and serves built cockpit assets from `apps/cockpit/dist`. Server startup reports URL, state root, privacy status, cockpit asset status, and shutdown instructions. Public binds require policy approval; use `127.0.0.1` or `localhost` for normal local operation.
