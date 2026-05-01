---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 07-workspace-management, 08-prompt-template-renderer
---

# Lifecycle hooks: before_run / after_run / on_failure / on_cancel with per-hook timeout

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/symphony/hooks.ts`:
- Four hook dispatch points: `before_run`, `after_run`, `on_failure`, `on_cancel`.
- Each hook receives typed context `{ run: AgentRunRow, task: TaskRow, workspacePath: string, attempt: number }`.
- Timeout enforcement: `Promise.race([hookFn(ctx), timeout(ms)])` using `AbortSignal.timeout`; rejects with `HookTimeoutError` on breach.
- Default timeout 60s; overridable via `WORKFLOW.md` config per-hook key (`before_run_timeout_ms`, etc.).
- `before_run` calls `src/context/assemble.ts` stub (Pillar 8 boundary — import interface only, no implementation here).
- Each hook dispatch emits an `events` row `{verb: 'hook_dispatched', payload: {hookName, durationMs}}`.

## Acceptance criteria
- [ ] Schema / state machine: `events` row emitted per hook dispatch with hook name and duration
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: all four hooks wired into `orchestrator.ts` dispatch flow (slice 10)
- [ ] Surfaces (web/cli/tui parity): hook outputs visible in Web run detail timeline; `fulcrum symphony runs show --json` includes `hookEvents[]`
- [ ] Tests: hook completing within timeout resolves; hook exceeding timeout rejects with `HookTimeoutError`; all four hook names dispatched in correct order in happy-path integration test; `events` table has hook rows
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Lifecycle Hooks section mapped to `hooks.ts`

## Blocked by
07-workspace-management, 08-prompt-template-renderer

## Notes
TS functions only — no shell scripts. `before_run` integration with Pillar 8's `assemble.ts` is interface-based; mock in tests. `on_cancel` fires when `cancelRun` is called from any surface.
