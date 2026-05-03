---
Status: implemented
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 17-api-trpc-procedures
ImplRuntime: claude
---

# CLI: fulcrum symphony * — full command surface with --json parity

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Auto-generate CLI bindings from tRPC schema (per Q-cli-shape) for all `orchestration.*` procedures. Hand-roll where codegen insufficient:
- `fulcrum symphony status [--json]`
- `fulcrum symphony sync [--daily] [--json]`
- `fulcrum symphony runs list [--project <id>] [--state <state>] [--json]`
- `fulcrum symphony runs show <runId> [--json] [--verbose]`
- `fulcrum symphony runs cancel <runId>`
- `fulcrum symphony runs retry <runId>`
- `fulcrum symphony conformance [--verbose] [--json]`
All commands: `--json` flag emits machine-readable output. `conformance` command runs the test suite and outputs per-section PASS/FAIL.

## Acceptance criteria
- [x] Schema / state machine: N/A
- [x] Tracker adapter: N/A
- [x] Dispatch loop / hooks: `runs cancel <runId>` triggers `on_cancel` hook via `cancelRun` tRPC call
- [x] Surfaces (web/cli/tui parity): `runs list --json` output matches shape of Web tRPC `listRuns` response; cancelling from CLI updates state visible in Web board and TUI pane; `conformance --json` output parseable by CI
- [x] Tests: integration tests — `fulcrum symphony runs list --json` outputs valid JSON array; `--state running` filters correctly; `cancel <runId> --json` returns `{success:true}`; `conformance --json` includes per-section pass/fail array
- [x] SPEC conformance traced in `docs/symphony-conformance.md`: N/A (surface layer)

## Blocked by
17-api-trpc-procedures

## Notes
Per Q-cli-shape: codegen reads tRPC + Zod → emits `fulcrum <domain> <verb>` tree with auto-help. `conformance` is hand-rolled (runs `bun test` subprocess, parses output). All `--json` outputs validated by Zod before print.
