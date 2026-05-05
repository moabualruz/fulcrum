# Phase 5: Task Management + Metrics - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the task pillar feature-complete: add comments and watchers entities, build sprint metrics charts (burndown, velocity, cycle time, throughput, WIP, CFD), add sprint capacity and retrospective notes, create Gantt and calendar views, verify bulk operations at scale, verify all 8 custom field types end-to-end, and ensure saved view filter AST round-trips correctly. Three-surface parity (Web, CLI, TUI) for task CRUD, sprint management, and metrics access per TSK-14.

</domain>

<decisions>
## Implementation Decisions

### Comments Entity Design
- **D-01:** `task_comments` uses flat threading (no nested replies). Comments are ordered chronologically. Each comment has a `resolved` boolean for resolve/unresolve flow.
- **D-02:** Comment body stored as TipTap JSON (`tiptapContent` + `textContent` plain-text mirror), matching the existing `Task` entity rich-text pattern.
- **D-03:** Comments emit `Event` records on create/delete/resolve for audit trail consistency with existing task event patterns.

### Watchers Entity Design
- **D-04:** `task_watchers` is a join entity (task_id, user_id, created_at). Subscribe/unsubscribe are idempotent operations.
- **D-05:** Watcher list drives notification delivery (Phase 7 scope) — Phase 5 only creates the entity and CRUD. No notification plumbing yet.

### Metrics Computation Strategy
- **D-06:** Metrics computed via graphile-worker rollup job writing to the existing `MetricsCache` entity. Not real-time calculation.
- **D-07:** Cache invalidation is event-driven: `EventBus` listeners on task status change, points change, sprint assignment change trigger a job enqueue for the affected sprint/project.
- **D-08:** Staleness window: metrics are stale up to 30 seconds after the triggering event (worker poll interval). Acceptable for dashboard use.
- **D-09:** Rollup job computes: completed count, points completed, points remaining, WIP count, velocity (points per sprint), cycle time (median hours from in_progress→completed), throughput (tasks completed per day), and CFD snapshot (count per status per day).

### Chart Library + Visualization
- **D-10:** LayerChart is the chart library (per roadmap). Install as dependency in `apps/web`.
- **D-11:** Charts render client-only via SvelteKit dynamic import (`{#await import(...)}`). No SSR for chart components — D3/SVG requires browser DOM.
- **D-12:** Six chart types: burndown (line), velocity (bar), cycle time (line), throughput (bar), WIP (area), CFD (stacked area). All fed from `MetricsCache` via tRPC query.

### Gantt + Calendar View Architecture
- **D-13:** Gantt view renders as custom SVG using LayerChart scales for time axis. No heavy third-party Gantt library. Tasks render as horizontal bars; dependency arrows as simple SVG lines.
- **D-14:** Calendar view renders tasks by due date in a month grid. Standard CSS grid layout, no external calendar library.
- **D-15:** Both views are read-only in v1. Drag-to-reschedule and drag-to-reassign are deferred to a future phase.

### Bulk Operations Design
- **D-16:** Bulk operations (status change, assignee, sprint move, priority, label, delete) use a single DB transaction with batched MikroORM `em.flush()`. All-or-nothing — partial failure rolls back entire batch.
- **D-17:** Bulk endpoint accepts array of task IDs + patch object. Validated before transaction begins. Max batch size enforced at 200 tasks.
- **D-18:** Each bulk operation emits a single bulk `Event` record (not per-task events) to avoid event flood.

### Custom Fields Verification
- **D-19:** Custom field engine already implemented. Phase 5 scope is verification-only: write tests confirming all 8 field types (text, number, date, select, multi-select, checkbox, url, user) round-trip through create → read → update → filter.
- **D-20:** Custom field filter integration verified through saved view AST round-trip tests.

### Saved View Filters
- **D-21:** Existing `SavedView` entity and `src/filters/ast.ts` provide the filter AST. Phase 5 verifies round-trip: create filter → save → reload → apply → results match.
- **D-22:** Filter AST supports AND/OR combinators, field-type-aware operators, and custom field references.

### Sprint Enhancements
- **D-23:** Sprint entity extended with `capacityPoints` (already present) preview: capacity = sum of assigned task points vs. capacity target. Rendered as progress bar in sprint detail.
- **D-24:** Sprint entity extended with `retrospectiveNotes` text field (TipTap JSON). Written during/after sprint close.

### Three-Surface Parity
- **D-25:** Web: board + list + calendar + Gantt + reports (full chart rendering).
- **D-26:** CLI: task CRUD + sprint CRUD + `--json` for all output. Metrics available as JSON data via `fulcrum metrics <sprint-id>`. No chart rendering in CLI.
- **D-27:** TUI: task-board + task-list + sprints + reports with ASCII bar/sparkline charts rendered via terminal box-drawing characters.
- **D-28:** All three surfaces share service layer (`TaskService`, `SprintService`) via tRPC. No business logic duplication.

### Claude's Discretion
- Chart color palette and visual styling within the existing design system (shadcn-svelte)
- ASCII chart rendering library choice for TUI (or hand-rolled)
- Exact GraphQL/tRPC query shape for metrics endpoints
- Test fixture data generation approach for 50+ task bulk operation tests

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TSK-01 through TSK-14 definitions (Pillar 6)
- `.planning/ROADMAP.md` — Phase 5 goal, dependencies, success criteria

### Prior Phase Decisions
- `.planning/phases/01-architecture-convergence-security/01-CONTEXT.md` — Architecture decisions (schema, auth, CI)
- `.planning/phases/02-bug-fixes-foundation/02-CONTEXT.md` — graphile-worker setup, TDD evidence, CI gate
- `.planning/phases/03-symphony-sandcastle/03-CONTEXT.md` — Tracker authority, event model, dispatch patterns
- `.planning/phases/04-inference-router-skills/04-CONTEXT.md` — Three-surface parity pattern, feature flags

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — tRPC path, service/repository constraints, EventBus
- `.planning/codebase/STACK.md` — Bun, MikroORM, PGlite/PostgreSQL, test stack
- `.planning/codebase/TESTING.md` — Test conventions, coverage approach

### Implementation Starting Points
- `src/services/TaskService.ts` — Existing task CRUD service with bulk patch support
- `src/services/SprintService.ts` — Existing sprint CRUD with MetricsSnapshot on close
- `src/db/entities/tasks/` — Task, Sprint, MetricsCache, CustomFieldDef, SavedView, TaskStatus, schemas
- `src/server/trpc/routers/tasks.ts` — tRPC task surface
- `src/server/trpc/routers/sprints.ts` — tRPC sprint surface
- `src/filters/ast.ts` — Filter AST implementation with tests
- `src/services/tasks.ts` — Pure DB task operations, event dispatcher integration
- `src/db/repositories/tasks/TaskRepository.ts` — Task data access layer

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TaskService` — full CRUD + bulk patch + children listing. Extend with comment/watcher methods.
- `SprintService` — CRUD + close with MetricsSnapshot. Extend with capacity preview + retrospective.
- `MetricsCache` entity — already exists, ready for rollup worker output.
- `SavedView` entity — already exists for filter persistence.
- `CustomFieldDef` entity — already implemented, needs verification tests only.
- `src/filters/ast.ts` — filter AST parser/compiler exists with test suite.
- `EventBus` — established pattern for event-driven side effects (metrics cache invalidation).
- `src/db/tasks-rich-text.ts` — TipTap JSON → plain text conversion, reuse for comments.

### Established Patterns
- Root gate: `bun run ci`. Use focused `bun test` while iterating.
- Services use `EntityManager` injection via constructor, MikroORM entities.
- tRPC routers delegate to service layer — no business logic in routers.
- Events recorded via `Event` entity for audit trail on mutations.
- Three-surface parity routes through shared tRPC/service, no business logic duplication.
- Feature flags through `FULCRUM_FEATURES` registry for progressive rollout.

### Integration Points
- Comment/watcher entities → new migrations in `src/db/migrations/`
- MetricsCache rollup → graphile-worker job definition in `src/db/entities/jobs/` or worker config
- LayerChart → new dependency in `apps/web/package.json`, chart components in web app
- Gantt/Calendar → new route/pages in `apps/web/src/routes/`
- Sprint retrospective → extend Sprint entity, migration for new column
- TUI ASCII charts → new rendering module in TUI codebase
- CLI metrics → new subcommand in CLI task/sprint commands

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Roadmap specifies LayerChart for charts; all other implementation choices follow established codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

- Drag-to-reschedule in Gantt view (future phase — interaction complexity)
- Drag-to-reassign in calendar view (future phase)
- Notification delivery from watchers (Phase 7 — NTF pillar scope)
- Real-time chart updates via WebSocket/SSE (future — current polling/refresh sufficient)
- Chart export to PNG/PDF (future)
- Comment threading/nesting (v2 if flat proves insufficient)
- Comment reactions/emoji (v2)

</deferred>

---

*Phase: 5-Task Management + Metrics*
*Context gathered: 2026-05-05*
