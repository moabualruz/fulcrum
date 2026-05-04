---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 12-artifact-harvest
---

# fulcrum agents CLI + fulcrum runs CLI + doctor orchestration checks

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement all CLI commands for this pillar via the tRPC-codegen binding strategy (Q-cli-shape). `fulcrum agents list | profile <name> | test <name>` — all `--json`. `fulcrum runs list [--project] [--agent] [--state] | show <id> | <id> logs [--follow] | <id> attach | <id> cancel | <id> retry` — all `--json`. Add a `fulcrum doctor` check group for orchestration: Sandcastle version pinned, Docker/Podman daemon reachable when mode configured, agent binaries on PATH, auth vars set, workspace root writable, Effect singleton. Doctor exits non-zero on any `error`-level check.

## Acceptance criteria

- [ ] Adapter / profile: `fulcrum agents list --json` returns JSON array of all profiles; `fulcrum agents profile <name> --json` returns single profile or non-zero + JSON error for unknown name.
- [ ] Lifecycle integration: `fulcrum agents test <name> --json` returns `{name, passed, reason?, testedAt}`; `fulcrum runs <id> cancel` SIGTERMs process + calls `on_cancel` hook; `retry` re-enqueues in graphile-worker job queue.
- [ ] Lifecycle integration: `fulcrum runs <id> logs [--follow]` streams JSONL file; `--follow` tails live during active run (reads new lines as they appear); terminates when run ends.
- [ ] Surfaces parity: `fulcrum runs <id> attach` tails JSONL live (same as `logs --follow` but also surfaces iteration counter progress); all commands output valid JSON with `--json`.
- [ ] Tests: integration test for each CLI command with mock DB; `agents list --json` — valid JSON, includes all 6 profiles; `runs list --json` — valid JSON; `runs <id> logs` with a pre-written JSONL fixture — outputs lines correctly; doctor exits 1 when a known binary missing; doctor exits 0 on fully configured local install (with mocked checks).

## Blocked by

12-artifact-harvest

## Notes

`logs --follow` implementation: open the JSONL file, read existing lines, then `watchexec`-style filesystem watch or periodic stat-based tail to emit new lines. Do not use `while sleep 1; do …; done` polling. `cancel` sends `SIGTERM` then waits up to 5 seconds before `SIGKILL`. `retry` calls `graphile-worker` `addJob` with the original run payload.
