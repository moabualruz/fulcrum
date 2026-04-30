# 06 — Runs view with filters + detail

Status: ready-for-agent
Risk tier: medium
Severity: high
Dependencies: 02
File ownership:
- `src/web/src/routes/runs/**`
- `src/web/src/lib/server/runs.ts`
- `src/web/src/lib/components/runs/**`

TDD plan:
- RED unit: `runs.test.ts` server actions: `cancelRunAction(id)`, `retryRunAction(id)`. Cancel asserts row status `cancelled` + `agent_run.cancelled` event; retry asserts a new `agent_runs` row + a new `jobs` row + `agent_run.retried` event.
- RED unit: `runs-filters.test.ts` covers the filter reducer (`agent`, `status`, `project`, `range`).
- RED unit: `run-duration.test.ts` formats started/ended timestamps into `2h 13m`/`—`.
- RED component: `run-status-badge.svelte.test.ts` renders all five statuses, asserts class matrix.
- RED component: `runs-table.svelte.test.ts` sorts by started column on header click, asserts row order swaps.
- RED component: `run-detail-tabs.svelte.test.ts` switches tabs, asserts content swaps; transcript empty state shows when `transcript_path` missing.
- GREEN: implement table, filters, detail tabs, cancel/retry dialogs, polling hook.
- REFACTOR: factor `<StatusBadge />` and `<DurationLabel />` for reuse on the dashboard.

Acceptance criteria:
- `/runs` shows a sortable shadcn `Table` (agent, model, status, started, duration, cost). Filters: agent, status, project, time range (last 24h / 7d / 30d / all).
- Status badges: `succeeded` neutral, `running` blue with pulse, `failed`/`cancelled` red, `queued` muted.
- `/runs/[id]` detail: summary card + tabbed content (transcript, payload, events). Reads transcript file from `transcript_path` if it exists; otherwise empty state.
- Cancel + retry buttons (cancel → status=`cancelled` + event; retry → enqueue new job via `enqueueJob` + event). Both gated behind `AlertDialog`.
- Auto-refresh `/runs` every 5s while any row is `running` (uses `setInterval` cleared on unmount).
- Toasts.
