---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 03-symphony-orchestration
Blocked-by: 17-api-trpc-procedures, 18-web-runs-board
---

# Gated: SSE real-time push + SSH remote workspace + HTTP status API extensions

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Three gated extensions, all shipped + disabled by default:

**`FULCRUM_FEATURES=real-time-collab-server`** — on every `symphony_state` transition, publish to an SSE channel `symphony:run:<runId>`. SvelteKit `+server.ts` SSE endpoint at `/api/sse/symphony`. Web runs board subscribes and updates badge without polling. Polling fallback (5s) when flag off.

**`FULCRUM_FEATURES=symphony-ssh-worker`** — when ON, `orchestrator.ts` dispatches to a remote agent process via SSH stdio per SPEC.md §SSH Worker Extension. New `src/orchestration/symphony/ssh-worker.ts` module. Config: `WORKFLOW.md` `ssh_host`, `ssh_user`, `ssh_key_path`. Off by default (local-first C2).

**`FULCRUM_FEATURES=symphony-http-api`** — when ON, mount Hono routes: `GET /api/v1/symphony/state`, `GET /api/v1/symphony/:identifier`, `POST /api/v1/symphony/refresh` per SPEC.md §HTTP Server Extension. When off, routes return 404.

## Acceptance criteria
- [ ] Schema / state machine: SSE publishes correct state payload on each transition; SSH worker writes `workspace_path` on remote host; HTTP API returns correct JSON shape per SPEC.md
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: SSH worker called instead of local sandbox-runner when `symphony-ssh-worker` flag on; local sandbox-runner unchanged when flag off
- [ ] Surfaces (web/cli/tui parity): SSE badge updates in Web board; CLI `runs show --json` unaffected by SSE flag; TUI unaffected (no SSE in TUI); HTTP API accessible when flag on
- [ ] Tests: flag off → SSE endpoint 404; flag on → SSE event emitted on state change and received by test subscriber; SSH worker test with mock SSH connection; HTTP API routes return correct shape when flag on, 404 when off
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §SSE Extension, §SSH Worker Extension, §HTTP Server Extension each mapped

## Blocked by
17-api-trpc-procedures, 18-web-runs-board

## Notes
All three are SHIPPED, not deferred (C1, C5). Each is independently flagged. SSE uses existing Hono server — no new service. SSH worker shares the same workspace interface (`workspace.ts`) with `remotePath` override.
