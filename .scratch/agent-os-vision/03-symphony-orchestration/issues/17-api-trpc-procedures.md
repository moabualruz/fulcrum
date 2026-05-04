---
Status: completed
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 11-dispatch-loop-happy-path, 13-graphile-worker-poll-registration
ImplRuntime: claude
---

# API: tRPC orchestration.* procedures + OpenAPI gating

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Wire all `orchestration.*` tRPC procedures into the router at `src/trpc/routers/orchestration.ts`:
- `listRuns`, `getRun`, `cancelRun`, `retryRun`, `getOrchestratorStatus`
- `listWorkflowDefs`, `upsertWorkflowDef`, `renderPromptPreview`, `getSymphonyDriftReport`
All procedures Zod-validated input/output. `cancelRun` triggers `on_cancel` hook + sets `symphony_state='cancelled'`. `retryRun` resets `next_retry_at=NOW()` + re-queues. When `FULCRUM_FEATURES=public-api` ON: mount Hono `@hono/zod-openapi` REST routes `GET /api/v1/symphony/state`, `GET /api/v1/symphony/:identifier`, `POST /api/v1/symphony/refresh` per SPEC.md §HTTP Server Extension.

## Acceptance criteria
- [x] Schema / state machine: `cancelRun` sets `symphony_state='cancelled'` and emits `events` row; `retryRun` sets `next_retry_at=NOW()` and `symphony_state='retry_queued'`
- [x] Tracker adapter: tRPC procedures call tracker ops internally
- [x] Dispatch loop / hooks: `cancelRun` fires `on_cancel` hook; `retryRun` re-queues for next orchestrator tick
- [x] Surfaces (web/cli/tui parity): all procedures callable from SvelteKit server actions; REST endpoints live when `public-api` flag on; CLI bindings auto-generated from tRPC schema per Q-cli-shape
- [x] Tests: `cancelRun` sets state + emits events row + fires hook; `retryRun` resets retry timestamp; REST routes return correct JSON when flag on; REST routes return 404 when flag off
- [x] SPEC conformance traced in `docs/symphony-conformance.md`: §HTTP Server Extension mapped to Hono routes

## Blocked by
11-dispatch-loop-happy-path, 13-graphile-worker-poll-registration

## Notes
Per C4 and Q28: tRPC always-on internal; REST gated `FULCRUM_FEATURES=public-api`. Single source of truth = tRPC procedures. REST layer is a thin `@hono/zod-openapi` wrapper with no business logic.
