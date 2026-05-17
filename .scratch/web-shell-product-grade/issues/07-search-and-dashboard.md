# 07 — Global search + dashboard landing

Status: ready-for-agent
Risk tier: medium
Severity: high
Dependencies: 02, 03, 04, 05, 06
File ownership:
- `src/web/src/routes/+page.svelte`
- `src/web/src/routes/+page.server.ts`
- `src/web/src/routes/search/**`
- `src/web/src/lib/components/dashboard/**`
- `src/web/src/lib/components/command-palette/**`

TDD plan:
- RED integration: `dashboard.test.ts` exercises the `loadDashboard()` server helper against PGlite because it verifies aggregate query behavior; pure dashboard formatting helpers stay fixture-backed unit tests.
- RED unit: `command-palette.filter.test.ts` for the fuzzy filter (`scoreCommand(label, query)`) — exact match > prefix > subsequence > miss.
- RED component: `command-palette.svelte.test.ts` cmd+K opens, Escape closes, typing filters, Enter routes via `goto` mock.
- RED component: `dashboard.svelte.test.ts` renders skeletons while `streamed` data resolves; asserts skeleton then row swap.
- GREEN: implement `/+page.server.ts`, `/search/+page.server.ts`, command palette mount in layout.
- REFACTOR: hoist counters as `<MetricCard />` reused across dashboard.

Acceptance criteria:
- `/` dashboard:
  - Counters (projects, open tasks, docs, runs last 7d) using shadcn `Card`s + `Skeleton` while loading.
  - "Recent runs" mini-table (5 rows, link to `/runs/[id]`).
  - "Recent docs" list (5 entries).
  - "Top tasks" — top 5 by priority, status pill.
  - Search bar at top routes to `/search?q=`.
- `/search?q=` runs `searchProductDocuments` and groups hits by source kind (doc/task/memory). Empty state with hint.
- Cmd+K command palette using shadcn `Command`. Opens with kbd hint in top bar. Routes to top-level pages + recently visited URLs (cookie). Live filter as user types.
- Keyboard escape closes palette.

## Sub-tasks

- [x] **07.1 — `loadDashboard` server helper.** Owns: `src/web/src/lib/server/dashboard.ts`, `.test.ts`. RED: counters match seeded data; recent-runs cap = 5; recent-docs cap = 5; top-tasks = 5 by priority.
  - Comment: `loadDashboard(db, orgId, projectId?)` returns `{counters, recentRuns, recentDocs, topTasks}`. Schema-mapping: kernel `tasks.status` CHECK uses `'completed'` (not `'done'`); helper excludes `('completed','cancelled')` for `openTasks` + `topTasks`. `projectId === undefined` = org-wide; specific id narrows; `null` filters via `IS NULL`. `counters.projects` intentionally org-wide (project-scope filter would always return 1). All seven queries fan out via `Promise.all`. `RECENT_LIMIT = 5` extracted as a constant.
- [x] **07.2 — `command-palette` filter (`scoreCommand`).** Owns: `src/web/src/lib/components/command-palette/score.ts`, `.test.ts`. RED: exact > prefix > subsequence > miss.
  - Comment: Tier base values — exact=`1000`, prefix=`500 - (label.length - query.length)`, subsequence=`100 + proximityBonus`, miss=`0`. Subsequence proximity bonus formula: for each pair of adjacent matched query-chars at label positions `prev` and `cur`, add `max(0, 10 - (cur - prev - 1))`. Adjacent matches (gap=0) earn the full `+10`; bonus tapers linearly with distance and floors at 0 once gap reaches 10. Greedy left-to-right scan picks the first available label position per query char (no backtracking). Empty query and empty label both return `0`.
- [x] **07.3 — `CommandPalette` component.** Owns: `src/web/src/lib/components/command-palette/CommandPalette.svelte`, `.svelte.test.ts`. RED: `cmd+K` opens; `Esc` closes; typing filters; `Enter` calls injected `onSelect(item)` once.
  - Comment: Component keeps browser-only window key wiring in `$effect`; pure `filterAndSort()` and `makeKeydownHandler()`/`makeSelect()` helpers carry filtering, sort, toggle, Escape, and top-item selection logic for SSR-safe unit coverage.
- [x] **07.4 — `/search?q=` route.** Owns: `src/web/src/routes/search/+page.server.ts`, `+page.svelte`. RED: groups hits by `source_kind`; empty state shown for unknown query.
  - Comment: `load({url, locals})` reads `?q=`, calls `searchProductDocuments(db, q, {orgId, limit:50})` (orgId via inline `getDefaultOrgId(db)` SELECT against `orgs WHERE slug='default'`). Empty/whitespace q short-circuits to `{q:"",hits:[],grouped:{}}`. `grouped` is `Record<source_kind, SearchHit[]>` built by reducing `hits`. Page renders `<form data-search-form method="GET">` with `<input data-search-input name="q">`, then iterates `data.grouped` rendering `<section data-search-group data-source-kind="<kind>">` per non-empty group with per-kind link helpers (`/docs/<id>` / `/boards?task=<id>` / `/runs/<id>` / `/memory/<id>`). `<div data-search-empty>` shown when q is non-empty + zero hits; no-query hint shown when q empty.
- [x] **07.5 — Dashboard composition (`MetricCard`, `RecentRuns`, `RecentDocs`, `TopTasks`).** Owns: `src/web/src/lib/components/dashboard/*.svelte`, `.svelte.test.ts`. RED: each asserts data props rendered.
  - Comment: `MetricCard` — `data-metric-card` on `<a>` when `href` provided, `<div>` otherwise; `data-metric-value` + `data-metric-label-text` children. `RecentRuns` — `<section data-recent-runs>` with `<h3>Recent runs</h3>`; `<li data-recent-run data-run-id>` links to `/runs/<id>`; `data-recent-runs-empty` on empty input (capped at 5). `RecentDocs` — `<section data-recent-docs>` with `<h3>Recent docs</h3>`; `<li data-recent-doc data-doc-id>` links to `/docs/<id>`; `data-recent-docs-empty` on empty. `TopTasks` — `<section data-top-tasks>` with `<h3>Top tasks</h3>`; `<li data-top-task data-task-id>` with `<span data-priority>P{n}</span>`; `data-top-tasks-empty` on empty. All use `cn()` from `$lib/utils.js`; no shadcn Card imports (SSR clash avoided).
- [x] **07.6 — `/+page.server.ts` + skeleton streaming.** Owns: `src/web/src/routes/+page.server.ts`, `+page.svelte`. RED: returns `streamed` payload; skeleton renders pre-resolution.
  - Comment: `load()` returns `{activeProjectId, streamed:{dashboard: Promise<DashboardData>}}`. Inline `getDefaultOrgId(db)` queries `SELECT id FROM orgs WHERE slug='default'`. `{#await data.streamed.dashboard}` pending branch renders 4 `<div data-dashboard-skeleton>` cards; `{:then}` branch renders `<div data-dashboard-grid>` with 4 `MetricCard` instances (counter→href: projects→`/projects`, openTasks→`/boards`, docs→`/docs`, runsLast7d→`/runs`) + `RecentRuns` + `RecentDocs` + `TopTasks`. Svelte 5 SSR always renders the pending branch for all promises (even pre-resolved), so tests assert 4 skeletons for both resolved and unresolved inputs.
