---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 11-dispatch-loop-happy-path
---

# graphile-worker poll loop registration + stall scanner wiring

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Register the `symphony:poll` recurring task in `src/jobs/registry.ts` (1-min cron). The task handler calls `orchestrator.tick()`. Single-leader via Postgres advisory lock built into graphile-worker. Wire the stall scanner's 30s setInterval to start/stop with the worker lifecycle. Add `fulcrum doctor` check: graphile-worker connected, `symphony:poll` task registered, last tick timestamp within 2× poll interval.

## Acceptance criteria
- [ ] Schema / state machine: graphile-worker job table has `symphony:poll` recurring entry after startup
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: `orchestrator.tick()` invoked by job; stall scanner runs on 30s interval while worker is active
- [ ] Surfaces (web/cli/tui parity): `fulcrum symphony status --json` reports `lastTickAt`, `workerConnected`; `fulcrum doctor` reports orchestration health; Web `/orchestration` dashboard shows last-tick timestamp
- [ ] Tests: in-process worker integration test — register task, advance clock 1 min, assert `tick()` called; stall scanner fires within 35s of clock advance
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Poll Loop section mapped to `jobs/registry.ts`

## Blocked by
11-dispatch-loop-happy-path

## Notes
graphile-worker already in stack. Advisory lock ensures single leader across multi-instance deploys. PGlite must be file-backed (`FULCRUM_PGLITE_PATH` ≠ `:memory:`) per failure gate — doctor enforces this.
