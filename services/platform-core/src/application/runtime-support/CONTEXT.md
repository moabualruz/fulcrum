# Context: Utils

> Shared helpers used across CLI, components, and hooks. No business logic; no state.

## Modules

- `io.ts` — file system helpers (read with default, write atomic, ensure dir, …).
- `proc.ts` — process helpers: `which(cmd)`, `run(argv, opts)`. The vendor adapter mocks these in tests.
- `source-clean.ts` — filter functions for excluding `.original.md`, `.backup.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree dirs from generated agent mirrors.

## Invariants

- No utility owns business logic that belongs in a feature context. If a "helper" needs to know about agents, components, or packages, it belongs in that context.
- Tests live alongside the module (`io.test.ts`, …) and exercise edge cases (missing file, atomic write rename, …).
- `proc.run` returns `{ exit, stdout, stderr }`; never throws on non-zero exit. Callers check `exit`.
- `proc.which` returns `string | null`; never throws.

## Cross-context coupling

- Imported by every other context. Imports nothing from `apps/cli/src/`, `src/components/`, `src/hooks/`, `src/agents/`, `src/repo/`.

## ADRs

Context-scoped decisions will live under `src/utils/docs/adr/` when recorded. None recorded yet; create the directory lazily from `docs/adr/0000-template.md`.
