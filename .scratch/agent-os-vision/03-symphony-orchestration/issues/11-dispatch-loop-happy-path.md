---
Status: implemented
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 04-tracker-fetch-candidate-issues, 05-tracker-fetch-by-states, 06-state-machine-claim-lock, 07-workspace-management, 08-prompt-template-renderer, 09-lifecycle-hooks, 10-retry-backoff-stall-detection
---

# Dispatch loop: Unclaimed → Running → Released happy-path + OTel spans

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/symphony/orchestrator.ts` — the main `tick()` function:
1. `fetchCandidateIssues` → claim each (up to `maxConcurrency`).
2. Create workspace → render prompt → fire `before_run` hook → dispatch to sandbox-runner interface (Pillar 4 boundary — call `src/sandbox/runner.ts` stub).
3. Await result (or timeout) → fire `after_run` or `on_failure` → reconcile `symphony_state` to `released`/`succeeded`/`failed`.
4. `destroyWorkspace` per `keepOnFailure` config.
5. Every state transition: emit `events` row + OTel span via `@opentelemetry/api` `tracer.startActiveSpan`; span attributes include `from_state`, `to_state`, `org_id`, `run_id`.

## Acceptance criteria
- [ ] Schema / state machine: full `unclaimed → claimed → running → released/succeeded` sequence recorded in `agent_runs.symphony_state`; all `events` rows present
- [ ] Tracker adapter: all three tracker ops called at correct points in loop
- [ ] Dispatch loop / hooks: `before_run` and `after_run` hooks fire in order; sandbox-runner stub interface called with rendered prompt + workspace path
- [ ] Surfaces (web/cli/tui parity): `orchestration.getOrchestratorStatus` tRPC procedure returns `{running, queued, stalled}` counts; `fulcrum symphony status --json` calls it; Web dashboard shows counts
- [ ] Tests: full happy-path integration test — create task in PGlite → tick() → all four state-transition `events` rows present → OTel test-tracer captures spans with correct attributes; `maxConcurrency` cap enforced (no more than N concurrent claims)
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Dispatch Loop mapped to `orchestrator.ts:tick`

## Blocked by
04-tracker-fetch-candidate-issues, 05-tracker-fetch-by-states, 06-state-machine-claim-lock, 07-workspace-management, 08-prompt-template-renderer, 09-lifecycle-hooks, 10-retry-backoff-stall-detection

## Notes
Sandbox-runner interface is `src/sandbox/runner.ts` — import only, no impl here (Pillar 4). Use a mock/stub in tests. `maxConcurrency` comes from `WORKFLOW.md` config.
