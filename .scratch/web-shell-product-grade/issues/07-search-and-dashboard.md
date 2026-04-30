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
- RED unit: `dashboard.test.ts` exercises the `loadDashboard()` server helper against PGlite — counters match seeded data, recent-runs cap = 5, recent-docs cap = 5, top-tasks = top 5 by priority.
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
