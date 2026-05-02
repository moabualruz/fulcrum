---
Status: ready-for-agent
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/06-projects-tasks-sprints-commands.md, 14/issues/07-docs-memory-search-commands.md, 14/issues/08-runs-notify-audit-webhooks-commands.md, 14/issues/09-interactive-flows-init-backup.md, 14/issues/10-interactive-flows-routing-skills-imports.md, 14/issues/11-doctor-orchestrator.md, 14/issues/12-keybindings-registry.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [C4, A1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Final parity gate and performance benchmarks for Pillar 14. Parity matrix: for every domain (projects, tasks, docs, memory, runs, repos, artifacts, search, notify, audit, routing, skills, webhooks, connectors, flags), verify same tRPC procedure reachable via: (a) Playwright e2e web action, (b) `fulcrum <domain> <verb> --json` CLI integration test, (c) TUI in-process smoke via `FakeTTY`. `hyperfine` benchmarks: `fulcrum tasks list --json` p95 <300ms cold, <150ms warm with 1k tasks fixture; codegen step <8s; `bun build --compile` <60s; `bun run ci` including codegen + doctor gate <120s total.

- **Web**: Playwright e2e covers all domain actions.
- **CLI**: `hyperfine` measurements in CI for task list; all domain commands green.
- **TUI**: FakeTTY smoke for each domain via `createCaller`.

## Acceptance criteria

- [ ] Parity matrix: 15 domains × 3 surfaces = 45 integration checks all green in `bun run ci`.
- [ ] `hyperfine --warmup 3 'fulcrum tasks list --json'` p95 <150ms (warm); p95 <300ms (cold) with 1k task fixture.
- [ ] `bun run codegen` completes in <8s on CI hardware.
- [ ] `bun run ci` total time <120s on CI including codegen + doctor gate.
- [ ] Binary `dist/fulcrum` <150MB on all 5 targets.
- [ ] `bun run type-check` exits 0 with full consolidated router.

## Blocked by

- 14/issues/06-projects-tasks-sprints-commands.md
- 14/issues/07-docs-memory-search-commands.md
- 14/issues/08-runs-notify-audit-webhooks-commands.md
- 14/issues/09-interactive-flows-init-backup.md
- 14/issues/10-interactive-flows-routing-skills-imports.md
- 14/issues/11-doctor-orchestrator.md
- 14/issues/12-keybindings-registry.md

## Notes

P14.40 maps to this slice. Pillar 14 marked done only after this gate passes.
