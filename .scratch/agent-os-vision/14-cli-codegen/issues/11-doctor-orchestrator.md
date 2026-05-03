---
Status: implemented
ImplRuntime: claude
LastVerifiedRuntime: codex
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/05-binary-entrypoint-and-compile.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [A2, Q-distribution]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

`fulcrum doctor` orchestrator: `src/doctor/index.ts` (discovers + loads all check modules from `src/doctor/checks/*.ts`), `src/doctor/runner.ts` (parallel batch execution, 10s timeout per check, exponential backoff on flaky checks), `src/doctor/output.ts` (interactive colored spinner + `--json` mode). `fulcrum doctor --json` runs all registered checks → `DoctorReport` Zod shape (version, timestamp, checks[], summary). `fulcrum doctor --subsystem <name>` runs only named subsystem checks. `fulcrum doctor` interactive: per-check spinner with green/yellow/red icons; recovery guidance inline on warn/fail. Exit code: 0 = all pass or warn; 1 = any fail. CLI doctor checks (`src/doctor/checks/cli.ts`): binary entrypoint, codegen sync, completion scripts, `--json` on all domain commands, `fulcrum init` idempotency, error log dir writable. `bun run ci` includes `fulcrum doctor --json` as final gate.

- **Web**: `/doctor` web page shows same subsystem rows.
- **CLI**: `fulcrum doctor [--json] [--subsystem <name>]` — primary surface.
- **TUI**: Doctor screen (T15-68) renders same check results.

## Acceptance criteria

- [ ] `fulcrum doctor --json` runs all registered checks; `DoctorReport` Zod-validates; exit 0 on clean install.
- [ ] `fulcrum doctor --json` exit 1 when any check returns `status='fail'`.
- [ ] `fulcrum doctor --subsystem api` runs only `subsystem='api'` checks; others skipped.
- [ ] `fulcrum doctor` interactive: spinner visible; green/yellow/red icons; recovery lines for warn/fail.
- [ ] CLI checks module: all 6 checks pass on clean build.
- [ ] `bun run ci` includes `fulcrum doctor --json` step after all other stages; CI fails on doctor exit 1.
- [ ] `DoctorReport` Zod schema imported by TUI Doctor screen without error.

## Blocked by

- 14/issues/05-binary-entrypoint-and-compile.md

## Notes

P14.26–P14.28 + P14.38–P14.39 maps to this slice.
