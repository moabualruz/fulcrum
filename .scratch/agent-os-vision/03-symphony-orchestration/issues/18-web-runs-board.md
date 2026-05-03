---
Status: implemented
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 17-api-trpc-procedures
ImplRuntime: claude
---

# Web: /orchestration dashboard + /projects/[id]/runs board + workflow editor

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
SvelteKit pages consuming `orchestration.*` tRPC procedures:
- `/orchestration` — poll-loop status tile (`lastTickAt`, `workerConnected`, concurrency gauge), recent dispatches table, retry queue, last sync date + drift badge, conformance status badge.
- `/projects/[id]/runs` — active runs board; `symphony_state` badges with color coding; expandable per-run state timeline.
- `/projects/[id]/runs/[runId]` — run detail: state machine diagram, attempt history, workspace path, `last_error_kind`, retry schedule, hook event timeline, artifact links.
- `/settings/orchestration` — per-org config (poll interval, max concurrency, stall timeout, workspace root).
- `/settings/orchestration/workflows/[id]` — WORKFLOW.md editor: Zod-validated YAML config form + TipTap Markdown prompt editor + `renderPromptPreview` live preview.
- Polling fallback: 5s interval refetch when `FULCRUM_FEATURES=real-time-collab-server` is OFF. SSE subscription when ON.

## Acceptance criteria
- [x] Schema / state machine: N/A (reads via tRPC)
- [x] Tracker adapter: N/A
- [x] Dispatch loop / hooks: cancel + retry actions on run detail page call `cancelRun` / `retryRun` tRPC mutations; state badge updates within 5s (polling) or immediately (SSE)
- [x] Surfaces (web/cli/tui parity): all pages render correctly; cancel/retry from Web updates state visible in CLI `runs list` and TUI pane
- [x] Tests: E2E test (Playwright): create task → orchestrator tick → `/projects/:id/runs` shows run with state badge → cancel from UI → state updates to `cancelled`; workflow editor saves `upsertWorkflowDef` and preview renders
- [x] SPEC conformance traced in `docs/symphony-conformance.md`: N/A (surface layer)

## Blocked by
17-api-trpc-procedures

## Notes
SSE gated behind `FULCRUM_FEATURES=real-time-collab-server` per PRD. Polling fallback always-on. TipTap editor same instance as Pillar 7 (docs editor) — reuse component, don't duplicate.
