---
Status: integration-review
Triage: AFK
Owner: codex-orchestrator
Pillar: 04-sandcastle-wrapper
Blocked-by: None
---

# Sandcastle dep install + Effect singleton enforcement

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Add `@ai-hero/sandcastle@0.5.6` (exact pin) to `package.json` and resolve the `effect` peer-dependency singleton. Sandcastle requires `effect`, `@effect/platform`, and `@effect/platform-node`; these must resolve to a single version in Bun's module graph to avoid the duplicate-Effect runtime-conflict failure gate. A CI assertion (a test or `bun check` script) must fail if more than one `effect` version is present in `bun pm ls` output. Add a `SANDCASTLE_API_VERSION` constant in `src/orchestration/sandbox-runner.ts` (stub file, no implementation yet) pinned to `"0.5.6"` so future bumps require an explicit code change.

## Acceptance criteria

- [ ] Adapter / profile: `@ai-hero/sandcastle@0.5.6` present in `package.json` with exact version pin; `bun install` succeeds.
- [ ] Adapter / profile: `effect`, `@effect/platform`, `@effect/platform-node` pinned in `package.json` overrides or `bun.lockb` to a single version; `bun pm ls effect | wc -l` equals `1` in CI.
- [ ] Lifecycle integration: `src/orchestration/sandbox-runner.ts` stub file created; exports `SANDCASTLE_API_VERSION = "0.5.6"` constant.
- [ ] Surfaces parity: no new CLI/Web/TUI surface in this slice (foundation only).
- [ ] Tests: CI step (e.g. `bun run check:deps` or inline test) asserts single `effect` version; test fails if a duplicate is introduced.

## Blocked by

None

## Notes

Effect isolation rule: no `import { ... } from 'effect'` allowed outside `src/orchestration/` modules. Enforce via a lint rule or import-boundary check in the test suite. Renovate config should require a human review (not auto-merge) for any `@ai-hero/sandcastle` bump.
