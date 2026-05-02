---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 17-api-trpc-procedures
---

# TUI: Orchestration pane — live runs table, state filter tabs, detail overlay

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement OpenTUI `<OrchestratorPane>` component in `src/tui/panes/orchestrator.tsx`:
- Live runs table (auto-refresh 2s via `listRuns` tRPC); columns: task title, agent, `symphony_state` badge, attempt count, elapsed, workspace path (truncated).
- State filter tabs: All / Running / Queued / Stalled / Failed (each tab calls `fetchIssuesByStates` with corresponding filter).
- Row select → detail overlay: state timeline, hook event outputs, `last_error_kind`, retry schedule.
- Keyboard bindings: `r` → `retryRun`, `x` → `cancelRun`, `l` → view logs, `a` → view artifacts, `Esc` → close overlay.
- cmd-palette integration: `> symphony <cmd>` dispatches CLI equivalents.

## Acceptance criteria
- [ ] Schema / state machine: N/A
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: `r` key calls `retryRun` tRPC mutation; `x` key calls `cancelRun` and fires `on_cancel`; state badge updates on next 2s poll
- [ ] Surfaces (web/cli/tui parity): cancelling from TUI updates state visible in Web board and `CLI runs list --json`; same run rows visible across all three surfaces; retry from TUI resets `next_retry_at` same as CLI/Web
- [ ] Tests: TUI component test — render with mock `listRuns` response; assert correct row count; simulate `r` keypress on a `retry_queued` row; assert `retryRun` mutation called with correct `runId`; simulate `x` on running row; assert `cancelRun` called
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: N/A (surface layer)

## Blocked by
17-api-trpc-procedures

## Notes
OpenTUI framework (Bun-native TS, JSX components) per Q-tui-lib. Fallback: if OpenTUI too immature, implement pane in ratatui (Rust sidecar). 2s poll interval hardcoded; no SSE in TUI pane (SSE is Web-only per PRD).
