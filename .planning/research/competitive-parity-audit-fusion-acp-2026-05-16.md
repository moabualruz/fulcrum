# Fusion + ACP UI vs. Fulcrum: Competitive Parity Audit

*Research date: 2026-05-16. Fusion (Runfusion/Fusion), ACP UI (formulahendry/acp-ui).*

## Fusion Audit Summary

### Coverage Ratings

| Area | Rating | Notes |
|------|--------|-------|
| Task/Job Lifecycle | Parity/Surplus | Fulcrum has explicit failure states; Fusion absorbs into revision loop |
| Dependency-Aware Scheduling | Surplus | Fulcrum has explicit topo ordering + preview; Fusion uses file-tracking heuristic |
| Live Activity Feeds | Partial | Fulcrum has live feedback streams; no kanban board surface or per-run diff panel |
| Approval Workflows | Parity | Both have blocking review verdicts |
| Recovery/Retry | Surplus | Fulcrum has explicit recoverable failure classification + backoff config |
| Run Lineage | Partial | Audit log hook present; no git-commit-per-step lineage |
| Worker/Concurrency | Parity | Worker tick with concurrency implied |
| Agent Orchestration | Missing | No inter-agent messaging, escalation, or agent self-improvement |

### Top 5 Gaps
1. No kanban board surface (Fusion's primary UX)
2. No inter-agent message bus (mailbox handoff/escalation)
3. No mid-flight human steering (pause/nudge/re-prompt without restart)
4. No per-gate type taxonomy (docs/QA/security/perf/a11y named gates)
5. No agent self-improvement loop (post-task AGENTS.md update)

### Surplus Areas
- Explicit topological ordering with preview (Fusion is implicit)
- Explicit recoverable failure classification + backoff
- Skip-satisfied and refuse-in-progress semantics
- Dedicated runs dashboard (Fusion embeds in task card)

## ACP UI Audit Summary

### Coverage Ratings

| Area | Rating | Notes |
|------|--------|-------|
| Session Management | Partial | Backend complete; no React session UI, resume sidebar, cancel control |
| Model/Mode/Agent Selectors | Partial | Config store exists; no picker UI |
| Permission Dialogs | Partial | Request types present; no dialog UI |
| Traffic Inspector | Partial | Backend capture exists; no message log/filter/search/pause frontend |
| Tool Call Visualization | Missing | No inline display or collapsible reasoning blocks |
| Transport Config | Partial/Surplus | SSE transport present (ACP UI lacks SSE); no config UI |
| Host/Storage Settings | Parity | Session/config store matches; no settings UI |
| Session History | Missing | No history browser; ACP UI's session/load protocol available |

### Top 5 Gaps
1. No React session UI (backend complete, zero frontend)
2. No traffic inspector frontend (message log, filter, search, pause)
3. No permission approval dialog
4. No model/mode picker UI
5. No tool call visualization

### Surplus Areas
- SSE transport (ACP UI doesn't have SSE)
- More comprehensive traffic recording backend

## Combined Priority

| Rank | Gap | Source | Impact |
|------|-----|--------|--------|
| 1 | React ACP session UI | ACP UI | Very High — blocks entire agent interaction surface |
| 2 | Kanban board surface | Fusion | High — primary PM visual pipeline |
| 3 | Traffic inspector frontend | ACP UI | High — debuggability |
| 4 | Inter-agent message bus | Fusion | High — multi-agent orchestration |
| 5 | Permission approval dialog | ACP UI | Medium — security UX |
| 6 | Mid-flight human steering | Fusion | Medium — runtime control |
| 7 | Tool call visualization | ACP UI | Medium — observability |
| 8 | Agent self-improvement loop | Fusion | Medium — closed-loop learning |
