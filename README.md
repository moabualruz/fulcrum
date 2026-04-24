# Fulcrum

Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, worktrees, quality gates, artifacts, and policy decisions.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @fulcrum/cli dev -- --json doctor --no-network
pnpm --filter @fulcrum/server dev
pnpm --filter @fulcrum/cockpit dev
```

Default behavior is local-only. The server binds to `127.0.0.1`; remote adapters, telemetry, public binds, and remote model/provider calls are disabled unless explicitly configured and approved by policy.
