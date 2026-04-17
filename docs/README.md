# Fulcrum Documentation

## Design Specifications

| Spec | Description |
|---|---|
| [Memory Stack: L0 Vault + L2 Graph](superpowers/specs/2026-04-14-memory-graph-l0-design.md) | Three-layer memory architecture — git vault, FTS5, Kuzu graph + HNSW |
| [Core Extension](superpowers/specs/2026-04-13-fulcrum-full-rebuild-design.md) | Full system rebuild design — all packages |

## Implementation Plans

| Plan | Package |
|---|---|
| [Core Extension](superpowers/plans/2026-04-13-core-extension.md) | `fulcrum-core` |
| [Memory Stack L0+L2](superpowers/plans/2026-04-14-memory-stack-l0-l2.md) | `fulcrum-memory` |
| [Memory (initial)](superpowers/plans/2026-04-13-memory.md) | `fulcrum-memory` |
| [Monitor](superpowers/plans/2026-04-13-monitor.md) | `fulcrum-monitor` |
| [Planning](superpowers/plans/2026-04-13-planning.md) | `fulcrum-planning` |
| [Policy](superpowers/plans/2026-04-13-policy.md) | `fulcrum-policy` |
| [Sync](superpowers/plans/2026-04-13-sync.md) | `fulcrum-sync` |
| [Teams](superpowers/plans/2026-04-13-teams.md) | `fulcrum-teams` |
| [Workflows](superpowers/plans/2026-04-13-workflows.md) | `fulcrum-workflows` |
| [Worktrees](superpowers/plans/2026-04-13-worktrees.md) | `fulcrum-worktrees` |

## Package READMEs

Each package has its own README with API reference and usage examples:

- [`packages/core`](../packages/core/README.md) — core persistence and orchestration
- [`packages/memory`](../packages/memory/README.md) — three-layer memory stack
- [`packages/monitor`](../packages/monitor/README.md) — metrics and monitoring
- [`packages/planning`](../packages/planning/README.md) — project planning domain
- [`packages/policy`](../packages/policy/README.md) — policy engine and audit
- [`packages/sync`](../packages/sync/README.md) — external sync adapters
- [`packages/teams`](../packages/teams/README.md) — agent team orchestration
- [`packages/workflows`](../packages/workflows/README.md) — workflow engine
- [`packages/worktrees`](../packages/worktrees/README.md) — worktree lifecycle
