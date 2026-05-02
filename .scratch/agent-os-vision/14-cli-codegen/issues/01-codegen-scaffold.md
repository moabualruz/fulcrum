---
Status: in-progress
Triage: AFK
Owner: codex-orchestrator
Pillar: cli-codegen
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, Q-distribution, C4, D5, A1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: [https://bun.sh/docs/bundler/executables, https://ts-morph.com]
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Codegen pipeline `scripts/cli/codegen.ts` that reads `AppRouter` type from `src/server/trpc/router.ts`, introspects procedure metadata (name, type, Zod input/output schema, docstrings), and emits `src/cli/generated/<domain>.ts` per sub-router — one file per domain with `commander` `Command` instances. Zod-to-flag mapping: `z.string()` → `--key <string>`, `z.number()` → `--key <number>`, `z.boolean()` → `--key` (flag), `z.optional()` → optional flag, `z.enum()` → choices, nested `z.object()` → `--parent-child` flattened. Deterministic output (same input → bitwise-identical files). Snapshot baseline established.

- **Web**: not applicable — codegen is a build-time step.
- **CLI**: output files are the CLI commands; `bun run codegen` produces the tree.
- **TUI**: uses same `AppRouter` type; no direct codegen output consumed by TUI.

## Acceptance criteria

- [ ] `bun run scripts/cli/codegen.ts` exits 0; emits `src/cli/generated/projects.ts` with correct `commander` `Command` instance.
- [ ] Zod-to-flag mapping: unit test covers `z.string()`, `z.number()`, `z.boolean()`, `z.optional()`, `z.enum()`, nested `z.object()`.
- [ ] Deterministic: run codegen twice → `diff src/cli/generated/ src/cli/generated/` exits 0.
- [ ] Snapshot baseline: `vitest --run cli:codegen:snapshot` passes; stored in `__snapshots__/`.
- [ ] ts-morph AST walk extracts Zod description strings → `command.description()` text.
- [ ] Failure gate: if ts-morph too slow (>30s), template literal emit path available as `--no-ast` flag; same snapshot contract.

## Blocked by

None - can start immediately (requires Pillar 13 `AppRouter` type to be exported)

## Notes

P14.01–P14.02 maps to this slice. `AppRouter` from Pillar 13 must be stable before full codegen run; stub-router suffices for scaffold.
