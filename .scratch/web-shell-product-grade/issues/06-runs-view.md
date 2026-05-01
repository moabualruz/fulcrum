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

## Sub-tasks

- [x] **06.1 — Server actions cancel/retry.** Owns: `src/web/src/lib/server/runs.ts`, `.test.ts`. RED: cancel sets status `cancelled` + emits `agent_run.cancelled`; retry creates new `agent_runs` row + `jobs` row + emits `agent_run.retried`.
  - Comment: `cancelRunAction` is idempotent — `UPDATE … WHERE status IN ('queued','running') RETURNING …`; only emits `agent_run.cancelled` when a row was actually transitioned. `retryRunAction` reads the original row, inserts a fresh `agent_runs` row (status `queued`, `parent_run_id` set), enqueues `{queue:'agent-runs', kind:'agent_run', payload:{run_id}}` via `enqueueJob`, and writes `agent_run.retried` on the **parent** subject with payload `{parent, retry}`. Throws when the parent run is missing.
- [x] **06.2 — Filters reducer.** Owns: `src/web/src/lib/components/runs/runs-filters.ts`, `.test.ts`. RED: applying agent + status + range narrows the input list deterministically.
  - Comment: pure `applyRunsFilters(rows, filter, now?)`. Range cutoffs computed off injectable `now` so tests are deterministic; `range:'all'` skips the time slice. `project:''` matches rows whose `project_id` is null (so the "no project" filter is expressible).
- [x] **06.3 — `formatDuration` helper.** Owns: `src/web/src/lib/util/duration.ts`, `.test.ts`. RED: `null` → "—"; `1h 5m`, `45s`, etc.
  - Comment: 7 cases — null end, 0s edge, 45s, 5m 9s, 1h 5m, 2h 13m, 2d 5h. Negative deltas clamp to 0.
- [x] **06.4 — `RunStatusBadge`.** Owns: `src/web/src/lib/components/runs/RunStatusBadge.svelte`, `.svelte.test.ts`. RED: matrix asserts class for each status.
  - Comment: SSR snapshot per status, asserts `data-status`, tailwind class string, and capitalised label. `badgeClass` / `label` live in `<script module>` so they're tree-shakeable for reuse.
- [x] **06.5 — `RunsTable` sortable.** Owns: `src/web/src/lib/components/runs/RunsTable.svelte`, `.svelte.test.ts`. RED: clicking column header toggles sort direction.
  - Comment: pure `sortRunRows` lives in a sibling `runs-table-sort.ts` module so the comparator is unit-tested independent of SSR. Stable sort keeps original order on ties via a decorate-sort-undecorate (index pre-recorded). Duration column uses `(ended_at - started_at)` ms; running rows (`ended_at === null`) get a sentinel that lands them last in both directions (`+Infinity` for asc, `-1` for desc). String columns put nulls last for asc / first for desc. The component renders a flat shadcn-shape `<table>` with `data-runs-th` headers wrapping a sort `<button>`; the active column's header carries a `data-runs-sort-direction` arrow.
- [x] **06.6 — `/runs/[id]` detail + cancel/retry dialogs + 5s polling.** Owns: `src/web/src/routes/runs/[id]/+page.server.ts`, `+page.svelte`. RED: tabs swap; transcript empty state when `transcript_path` missing; polling clears on unmount.
  - Comment: load reads the `agent_runs` row + (best-effort) transcript file + scoped `events`; throws 404 when the run is missing. `?/cancel` delegates to `cancelRunAction` (06.1, idempotent); `?/retry` delegates to `retryRunAction` and `redirect(303, /runs/<newId>)`. Detail page renders all three tab panels (transcript / payload / events) and toggles `hidden` on the inactive ones — keeps `data-runs-events`/`data-runs-payload` markers in the SSR DOM so SSR snapshot tests can assert structure without driving client tab state. Cancel + retry use the `DangerZone` confirm-then-form pattern. 5s polling lives in a `$effect` guarded by `browser` from `$app/environment` and `data.run.status === "running"`; the effect returns its `clearInterval` so SvelteKit cleans up on unmount and on status transitions out of `running`. Also rewrites `/runs/+page.{svelte,server.ts}` to drive the new `RunsTable` from a URL-query filter form (`agent` / `status` / `range`); the server applies `applyRunsFilters` (06.2) so the rendered list matches the filter state without a client-side re-filter.
