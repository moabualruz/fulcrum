# Dashboard

Read-only aggregation surface that composes Projects, Tasks, Sprints, Docs, and Runs into the home-screen tiles, counters, and lists every Fulcrum surface (CLI, TUI, web) renders as its landing view. Owns query shapes — never mutation.

## Language

**DashboardData**:
The single aggregate payload returned for one Org and optional Project scope, bundling counters, recent runs, recent docs, top tasks, project tiles, and unread count.
_Avoid_: Overview, summary, home payload, snapshot.

**Counter**:
A single numeric tile in `DashboardData.counters` (`projects`, `openTasks`, `docs`, `runsLast7d`); not an entity.
_Avoid_: Metric, KPI, stat.

**ProjectTile**:
A per-Project row in `DashboardData.projectTiles` with `id`, `name`, `openTasks`, `lastActivity`; the dashboard's compact Project rendering.
_Avoid_: Project card, project summary, project widget.

**TopTask**:
One of the up-to-five highest-priority open Tasks in `DashboardData.topTasks`, sorted by priority then recency.
_Avoid_: Featured task, hot task, priority task.

**OpenTask**:
A Task whose status is not in `completed | cancelled`; the filter the dashboard applies before counting or ranking.
_Avoid_: Active task, pending task, live task.

**ProjectScope**:
The optional scoping argument: `undefined` = whole Org, `null` = unassigned only, `string` = that Project and its descendants resolved via recursive `parent_id` walk.
_Avoid_: Filter, project filter, scope filter.

**ProductQuery**:
A standalone list query in `product-queries.ts` (`listProjects`, `listBoardTasks`, `listSprintsForProject`, `getSprintVelocity`, `listBacklog`, …) opening its own DB connection via `withDb` and resolving the default Org; not part of `DashboardData`.
_Avoid_: Dashboard query (reserved for `loadDashboard`), board query.

**VelocityPoint**:
A `{ sprint_id, name, points }` triple per completed Sprint returned by `getSprintVelocity`, summing `estimate_points` (fallback `estimate`) of completed Tasks in that Sprint.
_Avoid_: Velocity sample, burndown point, sprint stat.

## Relationships

- One **DashboardData** belongs to one Org and at most one **ProjectScope**.
- One **DashboardData** contains many **Counters**, many **ProjectTiles**, up to five **TopTasks**, up to five recent runs, up to five recent docs.
- A **ProjectTile** corresponds to exactly one Project; its `openTasks` count derives from **OpenTasks** in that Project only.
- A **ProductQuery** is independent of `loadDashboard`; it serves the per-surface list views (board, backlog, sprints, runs).
- A **VelocityPoint** belongs to exactly one completed Sprint.

## Example dialogue

> **Dev:** "If I pass a `projectId` to `loadDashboard`, do I get only that Project or its children too?"
> **Domain expert:** "Children too — `ProjectScope` resolves via the recursive `descendants` CTE, so the **Counter** for `openTasks` and the **TopTask** list span the whole subtree. Pass `null` if you want unassigned only, `undefined` for the whole Org."
> **Dev:** "And `listBoardTasks` — does it follow the same scope rules?"
> **Domain expert:** "No. **ProductQuery** functions take a flat `projectId | null | undefined` and never walk descendants. They're for surface-specific lists, not the aggregate."

## Flagged ambiguities

- **DashboardData vs ProductQuery** — resolved: **DashboardData** is the single aggregate from `loadDashboard` (one call, one payload). **ProductQuery** functions in `product-queries.ts` are independent list endpoints for non-dashboard surfaces; they do not compose into `DashboardData`.
- **ProjectScope semantics** — resolved: a `string` scope walks descendants via recursive CTE in `loadDashboard`; the same `string` in a **ProductQuery** matches that Project only. Do not assume parity.
- **OpenTask vs Task with Status category `started`** — resolved: **OpenTask** is the dashboard's filter (`status NOT IN completed | cancelled`), evaluated on the raw `Task.status` string. It is not the same as the parent service's **Status** category model; the dashboard does not consult `TaskStatus.category`.
