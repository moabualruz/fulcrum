# Phase 5: Task Management + Metrics — Research

**Researched:** 2026-05-05
**Domain:** Task management, metrics/analytics, real-time collaboration, visual views (Gantt/Calendar/Reports), automation engine
**Confidence:** HIGH (all findings verified against codebase)

---

## Summary

Phase 5 delivers the Task pillar from its current stub state to feature parity with Linear/Jira. The codebase is substantially further along than the phase description implies. Calendar and Gantt views already exist as custom SVG/DOM implementations (not using the proposed third-party libs). Reports page exists with full tab UI and ASCII fallback data tables. The reports page server load still uses the legacy `openProductDb()` raw SQL path — a layering violation that must be resolved.

**Critical gap**: The `Task` entity is missing nine columns that are already in the database via migrations (`due_date`, `start_date`) and via raw SQL in product-kernel (`assignee_id`, `labels`, `started_at`). The entity must be extended before any service-layer work can proceed. The `MetricsCache` entity schema diverges from D-32 requirements — it needs `scope_type`, `points_total`, `tasks_total`, `status_counts` jsonb columns.

Six new entities are required: `task_comments`, `task_watchers`, `comment_reactions`, `task_relationships` (normalized, vs current jsonb), `project_automations`, `field_dependency_rules`. The Event entity already exists but lacks `field_name`, `from_value`, `to_value` columns (D-34). Worker infrastructure (`src/workers/registry.ts`) exists but has no graphile-worker integration — the metrics rollup job (D-33) must use the existing internal `WorkerRegistry` pattern unless graphile-worker is actually installed.

**Primary recommendation:** Plan in migration-first waves: (1) entity/schema additions, (2) service-layer extensions, (3) new tRPC routers, (4) web UI integration, (5) CLI/TUI parity.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Comments & Activity Feed:** D-01 through D-06 — `task_comments` flat + threaded, TipTap JSON body, resolve/unresolve, emoji reactions (`comment_reactions`), Event entity for activity feed, @mention → watcher auto-subscribe.

**Watchers:** D-07 through D-09 — `task_watchers` join entity with source enum, auto-subscribe rules, Phase 7 owns notification delivery.

**Board & List Views:** D-10 through D-15 — `svelte-dnd-action` for DnD, grouping by status/assignee/priority/label/sprint, WIP limits, card density toggle, `@tanstack/svelte-table` for list, `@tanstack/svelte-virtual` for virtual scrolling, column customization via `SavedView`.

**Task Detail Panel:** D-16 through D-18 — right side panel, sections enumerated, J/K navigation.

**Task Relationships:** D-19 through D-21 — `task_relationships` entity with `blocks`/`blocked_by`/`relates_to`/`duplicate_of` types.

**Workflow & Status Engine:** D-22 through D-25 — 5 status categories matching Linear, custom statuses per project, hard transition rules (directed graph), auto-actions on status change via EventBus.

**Sprint Management:** D-26 through D-30 — drag from backlog tray, capacity preview, sprint close prompt, retrospective TipTap JSON + frozen summary, velocity comparison chart.

**Data Model:** D-31 through D-34 — Layer 1 `task_events` event log, Layer 2 `metrics_snapshots` daily snapshots via MetricsCache extension, graphile-worker rollup job, extend Event entity with field_name/from_value/to_value.

**Reports:** D-35 through D-55 — burndown, burnup, velocity, sprint report, CFD, cycle time scatter, lead time, throughput, WIP over time, age of open items, progress rollup, scope tracking, deadline risk, workload distribution, capacity utilization, stale issues, blocked items, reopened rate, project+workspace scope, CSV export, date range picker.

**Chart Library:** D-56 through D-59 — LayerChart as primary, client-only dynamic import, existing chart CSS variables + extend chart-6..chart-8, interactive tooltips.

**Gantt:** D-60 through D-62 — `@svar/gantt-svelte` (SVAR Gantt v2, MIT, Svelte 5 native), grouped by epic/assignee/sprint, click → side panel.

**Calendar:** D-63 through D-65 — `@event-calendar/core`, month/week/day views, tasks by due date, sprint overlay.

**Keyboard & Command Palette:** D-66 through D-68 — shadcn-svelte Command for palette, `tinykeys` for shortcuts, enumerated bindings (C/J/K/Enter/Esc/S/A/P/L/M/X/Shift+C/?), help overlay.

**Filter Builder:** D-69 through D-72 — shadcn-svelte primitives only (no external filter lib), existing `SavedView` entity, quick filter sidebar presets, filter AST round-trip verification.

**Bulk Operations:** D-73 through D-76 — multi-select UX, bulk action toolbar, single DB transaction with batched `em.flush()`, max 200, bulk events with `affected_task_ids[]`.

**Custom Fields:** D-77 through D-78 — verification-only (already implemented), all 8 types round-trip tested.

**Labels & Priority:** D-79 through D-80 — multi-label with groups, 5 priority levels matching Linear.

**Three-Surface Parity:** D-81 through D-84 — Web full interactive, CLI `fulcrum report` + `--json`, TUI ASCII charts via `asciichart`, shared service layer.

**Dependencies to Install:** D-85 through D-88 — `layerchart`, `@svar/gantt-svelte`, `@event-calendar/core`, `tinykeys`, `@tanstack/svelte-table`, `@tanstack/svelte-virtual`, `yjs`, `y-websocket`; extend TipTap with mention/task-list/placeholder/collaboration/collaboration-cursor; TUI `asciichart`.

**Automation Engine:** D-89 through D-92 — `project_automations` entity, EventBus listener execution, cycle detection at 5 chains, 4 templates.

**Portfolio:** D-93 through D-96 — workspace-level table, rollup from `metrics_snapshots`, same report components with `scope_type: 'workspace'`, resource allocation view.

**Real-Time Collaboration:** D-97 through D-99 — TipTap Yjs CRDT, y-websocket alongside Hono, PostgreSQL persistence, presence heartbeat.

**Team @Mentions:** D-100 through D-101 — both user and team mentions, team → bulk watcher subscribe.

**Critical Path in Gantt:** D-102 through D-104 — topological sort on `task_relationships`, Gantt highlight, slack/buffer visualization.

**Monte Carlo Forecasting:** D-105 through D-108 — 1000 iterations client-side, fan chart, per sprint/epic, ~10ms.

**Field Dependencies:** D-109 through D-111 — `field_dependency_rules` entity, client-side evaluation, server validates required-field on save.

### Claude's Discretion
- Exact chart component composition (LayerChart primitives per chart type)
- TanStack Table column definition patterns
- Event log query optimization (indexes, materialized views if needed)
- Sprint report card layout and responsive breakpoints
- Gantt zoom level defaults and interaction details beyond drag-to-reschedule

### Deferred Ideas (OUT OF SCOPE)
- Time tracking / time entries / timesheets — v2
- Custom dashboard builder (widget-based, drag-to-compose) — v2
- Scheduled email report delivery — v2
- Multi-assignee per task — v2 (v1 = single assignee + watchers)
- Notification delivery from watchers (Phase 7 — NTF pillar scope)
- Chart export to PNG/PDF — v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TSK-01 | task_comments entity with CRUD (create, list, delete, resolve) | New entity + migration + CommentService + tRPC router. TipTap JSON stored same as Task.tiptapContent. |
| TSK-02 | task_watchers entity with subscribe/unsubscribe | New entity + migration + watcher service methods in TaskService. Auto-subscribe logic at comment/assign/create events. |
| TSK-03 | Burndown chart renders from events log using LayerChart (install + integrate) | LayerChart not yet installed. `reports.ts` burndown query already exists using `metrics_cache`. Install + replace table with chart component (client-only import). |
| TSK-04 | Velocity rollup chart functional | Velocity query exists in `reports.ts`. Replace table with LayerChart BarChart. |
| TSK-05 | Cycle time + throughput + WIP + CFD reports | All queries exist in `reports.ts`. Replace tables with LayerChart components. Event entity needs field-change verb support for cycle time accuracy. |
| TSK-06 | metrics_cache rollup worker (graphile-worker job) with invalidation | `MetricsCache` entity exists but schema incomplete. WorkerRegistry exists (`src/workers/registry.ts`). graphile-worker NOT installed — use internal worker pattern or install. |
| TSK-07 | Sprint capacity preview with capacity math | `Sprint.capacityPoints` exists. Missing: real-time points sum query. Extend SprintService.get() to include capacity math. |
| TSK-08 | Sprint retrospective notes field on Sprint entity | `Sprint.retroDocId` exists (FK to doc). Need `retrospectiveNotes` TipTap JSON column and `closedSummary` jsonb per D-29. Migration required. |
| TSK-09 | Gantt view renders task timeline with dependencies | `TaskTimeline.svelte` + custom SVG implementation already exists. Decision D-60 requires replacing with `@svar/gantt-svelte`. Dependency arrows use `task_relationships` (new entity). |
| TSK-10 | Calendar view renders tasks by due date | `TaskCalendar.svelte` already exists and uses `svelte-dnd-action`. Decision D-63 requires replacing with `@event-calendar/core`. |
| TSK-11 | Bulk operations tested with 50+ tasks | `TaskService.bulkUpdate/bulkDelete` exist. Need bulk test suite with 50+ fixture tasks. Max 200 per D-75. |
| TSK-12 | Custom field engine all 8 types verified end-to-end (verification only) | `CustomFieldDef` entity + `seedDefaultFields` exist. Note: existing `CUSTOM_FIELD_TYPES` has 8 types but includes `json` not `checkbox` — reconcile with D-77 which lists `checkbox`. |
| TSK-13 | Saved view filter AST round-trips and renders correctly | `SavedView` entity + `src/filters/ast.ts` exist with tests (`ast.test.ts`). Verify round-trip test coverage. OR/AND combinators need verification. |
| TSK-14 | Three-surface parity: Web (board+list+calendar+Gantt+reports), CLI (task CRUD+sprint CRUD+`--json`), TUI (task-board+task-list+sprints+reports with ASCII charts) | TUI `ReportsScreen` exists but uses mock/stub metrics. CLI sprints tests use product-kernel (old path). Need tRPC-wired CLI/TUI for reports. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Task CRUD, comments, watchers | API/Backend (tRPC + service) | — | Business logic belongs in TaskService/CommentService |
| Sprint management, capacity math | API/Backend (tRPC + SprintService) | — | State machine logic (start/close/rollover) |
| Metrics rollup, snapshot generation | Backend worker (WorkerRegistry) | EventBus trigger | CPU-intensive, async — not in request path |
| Report queries (burndown/velocity/CFD) | API/Backend (tRPC + ReportService) | — | SQL aggregation; currently bypassed via direct DB in web |
| Chart rendering (LayerChart) | Browser/Client | — | D3/SVG requires DOM; D-57 client-only dynamic import |
| Gantt view (@svar/gantt-svelte) | Browser/Client | — | Interactive SVG with DOM events |
| Calendar view (@event-calendar/core) | Browser/Client | — | DOM event handling |
| Filter AST compilation | API/Backend (service) | Client (filter UI) | Filter compiled server-side; filter builder UI client-side |
| Bulk operations (200 task cap) | API/Backend (tRPC + service) | — | Single transaction, batched flush |
| Automation engine | API/Backend (EventBus listener) | — | EventBus-driven; cycle detection server-side |
| Workflow transition validation | API/Backend (WorkflowService) | Client (UX warning) | Hard rules server-enforced; soft UX warning client-side |
| Real-time collaboration (Yjs) | Backend (y-websocket alongside Hono) | Client (TipTap) | WebSocket server handles CRDT sync; client renders cursors |
| Monte Carlo forecasting | Browser/Client | — | D-108: pure math, ~10ms, no server round-trip |
| Field dependency evaluation | Browser/Client | API/Backend (save validation) | Client-side for instant UX; D-111 server validates required |
| Keyboard shortcuts + command palette | Browser/Client | — | DOM event listeners, tinykeys |
| ASCII charts for TUI | TUI surface | — | asciichart renders in terminal renderer |
| CLI report subcommand | CLI surface | — | `fulcrum report` → tRPC → ReportService |

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `svelte-dnd-action` | 0.9.69 | Kanban DnD, Calendar reschedule | INSTALLED [VERIFIED: src/web/package.json] |
| `@tiptap/core` + `svelte-tiptap` | 3.22.5 / 3.0.1 | Rich text editor | INSTALLED [VERIFIED: src/web/package.json] |
| `@tiptap/starter-kit` | 3.22.5 | Base TipTap extensions | INSTALLED [VERIFIED: src/web/package.json] |
| shadcn-svelte Command | via shadcn-svelte 1.2.7 | Command palette | INSTALLED [VERIFIED: src/web/package.json] |
| `bits-ui` | 2.16.3 | Headless components (Select/Popover/Badge for filter builder) | INSTALLED [VERIFIED: src/web/package.json] |

### To Install (web — `src/web/package.json`)
| Library | Purpose | Notes |
|---------|---------|-------|
| `layerchart` | Charts (burndown, velocity, CFD, cycle time scatter) | Not installed. Client-only dynamic import per D-57. [VERIFIED: not in bun.lock] |
| `@svar/gantt-svelte` | Gantt timeline (replaces custom TaskTimeline.svelte) | Not installed. SVAR v2, MIT, Svelte 5 native per D-60. [VERIFIED: not in bun.lock] |
| `@event-calendar/core` | Calendar (replaces custom TaskCalendar.svelte) | Not installed. Zero deps, Svelte native per D-63. [VERIFIED: not in bun.lock] |
| `tinykeys` | Keyboard shortcut bindings | Not installed. 650 bytes per D-67. [VERIFIED: not in bun.lock] |
| `@tanstack/svelte-table` | Headless table for list view | Not installed per D-14. [VERIFIED: not in bun.lock] |
| `@tanstack/svelte-virtual` | Virtual scrolling for large lists | Not installed per D-14. [VERIFIED: not in bun.lock] |
| `yjs` | CRDT for real-time collaboration | Not installed per D-97. [VERIFIED: not in bun.lock] |
| `y-websocket` | WebSocket transport for Yjs | Not installed per D-98. [VERIFIED: not in bun.lock] |
| `@tiptap/extension-mention` | @mentions in comments | Not installed per D-02/D-86. [VERIFIED: not in bun.lock] |
| `@tiptap/extension-task-list` | Checklists in comments | Not installed per D-02/D-86. [VERIFIED: not in bun.lock] |
| `@tiptap/extension-placeholder` | Placeholder text | Not installed per D-02/D-86. [VERIFIED: not in bun.lock] |
| `@tiptap/extension-collaboration` | Yjs CRDT for task description | Not installed per D-97/D-86. [VERIFIED: not in bun.lock] |
| `@tiptap/extension-collaboration-cursor` | Cursor presence in editor | Not installed per D-97/D-86. [VERIFIED: not in bun.lock] |

### To Install (root — for TUI/CLI)
| Library | Purpose | Notes |
|---------|---------|-------|
| `asciichart` | ASCII sparklines + bars for TUI reports | Not installed per D-87. [VERIFIED: not in bun.lock] |

**Installation command (web):**
```bash
cd src/web && bun add layerchart @svar/gantt-svelte @event-calendar/core tinykeys \
  @tanstack/svelte-table @tanstack/svelte-virtual \
  yjs y-websocket \
  @tiptap/extension-mention @tiptap/extension-task-list \
  @tiptap/extension-placeholder @tiptap/extension-collaboration \
  @tiptap/extension-collaboration-cursor
```

**Installation command (root):**
```bash
bun add asciichart
```

**TipTap version alignment:** All new TipTap extensions MUST be pinned to exact version `3.22.5` matching existing `@tiptap/core` and `@tiptap/starter-kit`. [VERIFIED: src/web/package.json]

**Compatibility risk — @svar/gantt-svelte vs @event-calendar/core:** These are to REPLACE the existing custom implementations. Current `TaskTimeline.svelte` (custom SVG Gantt) and `TaskCalendar.svelte` (custom DOM calendar) are both functional. Replacing them is required per D-60/D-63 but carries integration risk against Svelte 5.55.2. [ASSUMED: both libs claim Svelte 5 support — verify after install]

---

## Architecture Patterns

### System Architecture Diagram

```
User action (Web/CLI/TUI)
         │
         ▼
  tRPC router (tasks/sprints/reports/comments/automations/workflows)
         │
         ▼
  Service layer (TaskService / SprintService / ReportService / CommentService / AutomationService / WorkflowService)
         │                │                    │
         ▼                ▼                    ▼
  MikroORM entities    EventBus.publish()   WorkerRegistry.enqueue()
  (flush to PG/PGlite)       │                    │
                             ▼                    ▼
                  AutomationService        metrics_rollup_job
                  (EventBus listener)      (updates MetricsCache)
                             │
                             ▼
                  task_events insert + metrics_snapshots update
```

Data flow for reports:
```
Client requests report
    → tRPC reports.get({ scope, scopeId, dateRange })
    → ReportService queries metrics_snapshots (Layer 2 snapshots)
    → Falls back to task_events (Layer 1) for recent deltas
    → Returns typed data to client
    → LayerChart renders client-side (dynamic import, no SSR)
```

### Recommended Project Structure — New Files

```
src/
├── db/entities/tasks/
│   ├── TaskComment.ts        # NEW — task_comments entity
│   ├── TaskWatcher.ts        # NEW — task_watchers entity
│   ├── CommentReaction.ts    # NEW — comment_reactions entity
│   ├── TaskRelationship.ts   # NEW — task_relationships entity (replaces jsonb)
│   ├── ProjectAutomation.ts  # NEW — project_automations entity
│   ├── FieldDependencyRule.ts # NEW — field_dependency_rules entity
│   ├── Task.ts               # EXTEND — add due_date, start_date, started_at, assignee_id, labels
│   ├── Sprint.ts             # EXTEND — add retrospectiveNotes (TipTap JSON), closedSummary jsonb
│   ├── MetricsCache.ts       # EXTEND — add scope_type, points_total, tasks_total, status_counts jsonb
│   └── index.ts              # EXTEND barrel
├── db/entities/core/
│   └── Event.ts              # EXTEND — add field_name, from_value, to_value columns (D-34)
├── db/migrations/
│   └── Migration20260505XXXXXX_phase5_task_entities.ts  # NEW migration
├── services/
│   ├── CommentService.ts     # NEW
│   ├── ReportService.ts      # NEW — analytics queries
│   ├── AutomationService.ts  # NEW — rule evaluation + execution
│   └── WorkflowService.ts    # NEW — transition validation
├── workers/
│   └── metrics-rollup.ts     # NEW — WorkerRegistry job for snapshot updates
├── server/trpc/routers/
│   ├── comments.ts           # NEW
│   ├── reports.ts            # NEW (replaces web-only reports.ts)
│   ├── automations.ts        # NEW
│   └── workflows.ts          # NEW
src/web/src/
├── lib/components/tasks/
│   ├── TaskDetailPanel.svelte   # NEW — right side panel (D-16)
│   ├── TaskComments.svelte      # NEW — comments + activity feed
│   ├── WatcherList.svelte       # NEW
│   └── BulkActionBar.svelte     # NEW
├── lib/components/reports/
│   ├── BurndownChart.svelte     # NEW — LayerChart LineChart
│   ├── VelocityChart.svelte     # NEW — LayerChart BarChart
│   ├── CfdChart.svelte          # NEW — LayerChart AreaChart stacked
│   ├── CycleTimeChart.svelte    # NEW — LayerChart ScatterChart
│   └── ...                      # remaining report charts
├── routes/projects/[id]/
│   ├── gantt/                   # NEW route — @svar/gantt-svelte
│   └── reports/+page.svelte     # REWRITE — replace tables with LayerChart
```

### Pattern 1: New Entity (MikroORM v7 Stage-3 decorators)
```typescript
// Source: existing entities (Task.ts, Sprint.ts — verified in session)
// CRITICAL: Stage-3 decorators require explicit `type` on every @Property.
// No reflect-metadata. Always use @mikro-orm/decorators/es imports.
import {
  Entity, PrimaryKey, Property, ManyToOne, Index
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

@Entity({ tableName: "task_comments" })
@Index({ name: "task_comments_task_id", properties: ["taskId"] })
export class TaskComment {
  [OptionalProps]?: "createdAt" | "updatedAt" | "resolved" | "resolvedAt" | "resolvedBy" | "parentCommentId";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "uuid", fieldName: "task_id" })
  taskId!: string;

  @Property({ type: "uuid", fieldName: "author_id" })
  authorId!: string;

  @Property({ type: "json", fieldName: "body", defaultRaw: "'{}'::jsonb", returning: false })
  body: Record<string, unknown> = {};

  @Property({ type: "boolean", default: false })
  resolved: boolean = false;

  // ... etc
}
```

### Pattern 2: tRPC Router (thin delegation)
```typescript
// Source: src/server/trpc/routers/tasks.ts — verified in session
// Pattern: permissionedProcedure + zod input/output schemas + delegate to service
export const commentsRouter = t.router({
  list: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.uuid() }))
    .output(z.array(CommentOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      return new CommentService(ctx.em).list(ctx.orgId, input.taskId);
    }),
});
```

### Pattern 3: Event emission in services
```typescript
// Source: src/services/TaskService.ts emitTaskEvent() — verified in session
// No EventDispatcher class — create Event entity directly, persist, flush.
const event = em.create(Event, {
  org: em.getReference(Org, orgId),
  verb: "task.status_changed",
  subjectKind: "task",
  subjectId: taskId,
  payload: { from: fromStatus, to: toStatus, field_name: "status" },
  createdAt: new Date(),
});
em.persist(event);
// Flush happens at outer transaction boundary.
```

### Pattern 4: WorkerRegistry job registration
```typescript
// Source: src/workers/registry.ts — verified in session
// graphile-worker is NOT installed. Use existing WorkerRegistry pattern.
import { createWorkerRegistry, assertRecordPayload, assertStringField } from "../workers/registry.ts";

const workerRegistry = createWorkerRegistry();
workerRegistry.registerTask(
  "metrics_rollup",
  (payload) => {
    assertRecordPayload(payload, "metrics_rollup");
    assertStringField(payload as Record<string, unknown>, "scope_id", "metrics_rollup");
    assertStringField(payload as Record<string, unknown>, "scope_type", "metrics_rollup");
  },
  async (payload) => {
    // compute and upsert MetricsCache row
  }
);
```

### Pattern 5: Reports page server load — must migrate to EM
```typescript
// CURRENT (WRONG): src/web/src/routes/projects/[id]/reports/+page.server.ts
// uses openProductDb() raw SQL — ARCH-01/ARCH-02 violation.
// CORRECT: Use EntityManager via tRPC or direct EM injection from hooks.server.ts
// See: src/web/src/hooks.server.ts for EM injection pattern.
```

### Anti-Patterns to Avoid
- **Raw SQL in route handlers:** `openProductDb()` in page.server.ts is a known violation. Do not add new ones. Route `reports/+page.server.ts` currently uses it — fix as part of this phase.
- **Inline ALTER TABLE in services:** `ensureTaskProjectColumn()` in SprintService is a known legacy — do not add more. All schema changes go in migrations.
- **TaskService.bulkUpdate raw SQL for project_id:** Line 133 in TaskService uses `em.getConnection().execute()` for the `project_id` column — this is legacy DDL-in-handler, fix by adding `project_id` properly to Task entity.
- **Missing explicit `type` on @Property:** Stage-3 decorators do NOT use reflect-metadata. Forgetting `type` causes ORM to silently mismap the column.
- **Replacing existing working UI without feature parity:** `TaskCalendar.svelte` and `TaskTimeline.svelte` are functional. Do not remove them until replacements are verified working.
- **SSR for LayerChart:** D3/SVG requires browser DOM. All chart components must use `{#if browser}` + dynamic import or `import.meta.env.SSR` guard.

---

## Entity Schema Audit

### Task entity — MISSING columns (D-34, D-05, D-07)
The `tasks` table has these columns via migrations but they are **NOT on the Task entity**:

| Column | In DB (migration) | On Task entity | Required by |
|--------|-------------------|----------------|-------------|
| `due_date` | YES (Migration20260504130000) | NO | Calendar view, D-64 |
| `start_date` | YES (Migration20260504130000) | NO | Gantt view, D-61 |
| `started_at` | Not in migration, in product-kernel raw | NO | Cycle time D-25, D-40 |
| `assignee_id` | In product-kernel raw SQL | NO | D-08, D-48, filter AST |
| `labels` | In product-kernel raw SQL | NO | D-79, filter facets |
| `project_id` | Via ALTER TABLE in service (!!!) | NO | Sprint/board scoping |

**Action required:** Single migration adds all missing columns to `tasks` table AND updates Task entity class to declare them. The `project_id` DDL-in-service antipattern must also be resolved here.

### MetricsCache entity — schema gap (D-32)
Current `MetricsCache` columns: `projectId`, `sprint` (FK), `date`, `startedCount`, `completedCount`, `blockedCount`, `pointsCompleted`, `pointsRemaining`, `wipCount`, `updatedAt`.

**Missing per D-32:** `scope_type` (`'sprint' | 'project' | 'epic'`), `points_total`, `tasks_total`, `status_counts: jsonb`.

Also: current `metrics_cache` table has a `metric_kind` column used by reports.ts queries (`WHERE metric_kind = 'burndown'`) but this is NOT on the MetricsCache entity — it's raw SQL legacy from product-kernel. The two representations need to be reconciled.

### Sprint entity — missing fields (D-29)
`Sprint` has `retroDocId` (FK to docs). Missing per D-29:
- `retrospectiveNotes` — TipTap JSON (`jsonb`)
- `closedSummary` — jsonb (`{ carried: number, added: number, removed: number, scope_change_pct: number }`)

### Event entity — missing fields (D-34)
`Event.payload` currently stores everything as freeform jsonb. D-34 requires dedicated columns:
- `field_name varchar` — which field changed
- `from_value jsonb` — previous value
- `to_value jsonb` — new value

These are additive columns — no data loss. Existing events have `null` for these.

### Custom field type discrepancy
`CUSTOM_FIELD_TYPES` in `CustomFieldDef.ts` = `["text", "select", "multi_select", "number", "date", "user", "url", "json"]` — 8 types including `json`.

D-77 lists 8 types including `checkbox` but NOT `json`.

**Reconcile:** Either add `checkbox` to the enum and default fields seed, or treat D-77's `checkbox` as `json` type with boolean semantics. Confirm with user or treat as Claude's discretion. [ASSUMED: add `checkbox` type, keep `json` for 9 total — planner should confirm]

### TaskStatus category discrepancy
`schemas.ts` `TASK_STATUS_CATEGORIES = ["unstarted", "started", "completed", "cancelled"]` — 4 categories.
D-22 requires 5 categories: `backlog`, `unstarted`, `started`, `completed`, `canceled`.

**Action required:** Add `backlog` to the enum and update check constraint. Note: D-22 uses `canceled` (US spelling); existing code uses `cancelled` (UK). Standardize to D-22 spelling. [ASSUMED: migration updates check constraint; reconcile spelling]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop for Kanban/Calendar | Custom pointer event handling | `svelte-dnd-action` (already installed) | Touch support, a11y, cross-container DnD complexity |
| Charts (burndown, velocity, CFD, scatter) | Custom SVG/Canvas charts | `layerchart` (D3-based, composable) | Percentile bands, tooltips, stacked areas — months of work |
| Gantt timeline | Custom SVG Gantt (already started in TaskTimeline.svelte) | `@svar/gantt-svelte` | Dependency arrows, drag-to-reschedule, 10k task test, zoom — year of work |
| Calendar | Custom DOM calendar (already in TaskCalendar.svelte) | `@event-calendar/core` | Multi-day spans, drag-to-reschedule, week/day views |
| Keyboard shortcut binding | Custom keydown handlers | `tinykeys` | Chord sequences, OS modifier normalization, memory leak prevention |
| Virtual scrolling (list view 10k+ tasks) | Custom scroll math | `@tanstack/svelte-virtual` | Row height estimation, scroll anchoring, overscan |
| Headless table | Custom HTML table | `@tanstack/svelte-table` | Column resize state, sort state, multi-level grouping |
| CRDT for collaborative editing | Custom OT algorithm | `yjs` + TipTap extensions | Conflict-free merge of concurrent edits — not solvable by hand |
| Filter UI chip state | Custom filter DSL | shadcn-svelte primitives + existing `ast.ts` | AST already implemented; UI is composition, not new logic |
| Cycle detection in automations | Custom graph traversal | Existing `assertDependencyGraphDoesNotCycle()` pattern in TaskService | Already proven — reuse same DFS approach with max-depth counter |

**Key insight:** Five major UI capabilities (Gantt, Calendar, charts, DnD, virtual scroll) require specialized libraries — building custom versions would consume the entire phase timeline without shipping business value.

---

## Common Pitfalls

### Pitfall 1: Reports page server still uses openProductDb()
**What goes wrong:** Adding LayerChart to reports page but data fetching still calls `openProductDb()` raw SQL path — ARCH-01 violation, two DB connection paths, won't work in SaaS mode.
**Why it happens:** `src/web/src/routes/projects/[id]/reports/+page.server.ts` imports `openProductDb` from `$lib/server/db` and calls `loadReports()` which uses raw ProductDb.
**How to avoid:** Migrate reports route to tRPC before adding chart UI. Add `reports` tRPC router, wire `ReportService`, update page server load.
**Warning signs:** `openProductDb` import in any new route.

### Pitfall 2: Task entity missing columns break service layer
**What goes wrong:** `TaskService.create()` called with `assignee`, `labels`, `due_date` but Task entity has none of these — silently ignored, data lost.
**Why it happens:** Task entity is a Pillar 6 stub (see Task.ts comment line 7) — domain columns were deferred to Phase 5.
**How to avoid:** Migration + entity update MUST be the first plan in this phase. Nothing else proceeds until Task has full columns.
**Warning signs:** `customFields.assignee` being used as a workaround (it is in current BulkTaskPatch — see `applyBulkPatch` lines 273-284).

### Pitfall 3: TipTap version mismatch on new extensions
**What goes wrong:** Installing `@tiptap/extension-mention@latest` pulls a different version than 3.22.5 causing peer dependency conflicts or silent incompatibility.
**Why it happens:** TipTap 3.x has strict peer dependency requirements between packages.
**How to avoid:** Pin all new TipTap extensions to exact `3.22.5`. Add to `package.json` `overrides` if needed.
**Warning signs:** `@tiptap/pm` peer dep warnings during `bun install`.

### Pitfall 4: LayerChart SSR crash
**What goes wrong:** SvelteKit SSR runs LayerChart code which calls `document.createElementNS()` or `window.*` — build fails or runtime crash.
**Why it happens:** D3 internals use browser globals.
**How to avoid:** All chart components use `{#if !ssr}` or dynamic import: `const Chart = (await import('layerchart')).LineChart`. Per D-57 decision: client-only via SvelteKit dynamic import.
**Warning signs:** `ReferenceError: document is not defined` during `bun run build`.

### Pitfall 5: MetricsCache metric_kind column not on entity
**What goes wrong:** New rollup worker writes to MetricsCache entity but existing `loadBurndown()`/`loadWip()` query `WHERE metric_kind = 'burndown'` — column not on entity, ORM can't query it.
**Why it happens:** Legacy raw SQL in `reports.ts` uses a `metric_kind` column that was added outside the MikroORM entity definition.
**How to avoid:** When extending MetricsCache entity for D-32, check the actual table schema (`.snapshot-postgres.json`) for all columns including legacy ones added by raw migrations.

### Pitfall 6: graphile-worker assumed but not installed
**What goes wrong:** Plan references `graphile-worker` for the metrics rollup job (D-33) but it is not in `package.json` or `bun.lock`.
**Why it happens:** Prior phases planned graphile-worker but it was never installed. The `flags/registry.ts` mentions it only in flag descriptions.
**How to avoid:** Either install graphile-worker as a dependency, or use the existing `WorkerRegistry` pattern (`src/workers/registry.ts`) with a polling interval mechanism. [ASSUMED: existing WorkerRegistry is sufficient for Phase 5 scope — actual graphile-worker adds PostgreSQL-backed job persistence which Phase 5 doesn't strictly require if the worker runs in-process]

### Pitfall 7: Replacing functional TaskCalendar/TaskTimeline without parity
**What goes wrong:** `@event-calendar/core` or `@svar/gantt-svelte` replace existing implementations but miss features like the sprint band overlay in TaskCalendar or the dependency arrows in TaskTimeline.
**Why it happens:** Existing implementations have custom features built on top of basic DnD.
**How to avoid:** Document existing feature inventory before replacement. Keep existing components until replacements pass integration tests.

### Pitfall 8: task_relationships vs tasks.dependencies jsonb (two representations)
**What goes wrong:** D-19 adds `task_relationships` entity but `Task.dependencies` jsonb already stores `{ blocks: [], blocked_by: [] }`. Two representations get out of sync.
**Why it happens:** `setDependencies()` in TaskService updates the jsonb field directly. New `task_relationships` entity adds a normalized table.
**How to avoid:** Decision: either (a) keep jsonb as denormalized read cache, keep entity as source of truth and sync on write, or (b) remove jsonb and use entity only. Option (b) is cleaner but requires migration. [ASSUMED: Option (a) — jsonb denorm cache, relationships entity is source of truth — planner confirm]

---

## Code Examples

### Verified Pattern: Extending Task entity (must add these columns)
```typescript
// Source: src/db/entities/tasks/Task.ts — existing structure, extending
// Add to Task class after existing properties:

@Property({ type: "date", fieldName: "due_date", nullable: true })
dueDate: Date | null = null;

@Property({ type: "date", fieldName: "start_date", nullable: true })
startDate: Date | null = null;

@Property({ type: "datetime", fieldName: "started_at", nullable: true })
startedAt: Date | null = null;

@Property({ type: "string", fieldName: "assignee_id", nullable: true })
assigneeId: string | null = null;

// labels stored as PostgreSQL text[] via @Property({ type: "array" })
@Property({ type: "array", fieldName: "labels", default: [] })
labels: string[] = [];

@Property({ type: "uuid", fieldName: "project_id", nullable: true })
projectId: string | null = null;
```

### Verified Pattern: Service returns field-diff Event
```typescript
// Source: src/services/TaskService.ts emitTaskEvent() — verified
// Extend emitTaskEvent to include field_name/from/to when Event entity gains those columns:
const event = em.create(Event, {
  org: em.getReference(Org, orgId),
  verb: "task.status_changed",
  subjectKind: "task",
  subjectId: taskId,
  // After Event entity extension (D-34):
  // fieldName: "status",
  // fromValue: previousStatus,
  // toValue: newStatus,
  payload: { from: previousStatus, to: newStatus },
  createdAt: new Date(),
});
```

### Verified Pattern: tRPC router permissionedProcedure
```typescript
// Source: src/server/trpc/routers/tasks.ts lines 104-114, 125-197 — verified
// permissionedProcedure({ resource, action }) is the standard auth pattern.
// All new routers use this — no custom middleware.
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
```

### Verified Pattern: Migration class
```typescript
// Source: src/db/migrations/Migration20260505042000_skill_supply_chain.ts — verified
import { Migration } from "@mikro-orm/migrations";

export class Migration20260505XXXXXX_phase5_task_entities extends Migration {
  static isLossy = true; // set if migration drops/alters existing data

  override async up(): Promise<void> {
    this.addSql(`alter table "tasks" add column if not exists "due_date" date`);
    this.addSql(`alter table "tasks" add column if not exists "assignee_id" uuid`);
    // ... etc
    this.addSql(`
      create table "task_comments" (
        "id" uuid not null default gen_random_uuid(),
        "org_id" uuid not null references "orgs"("id") on delete cascade,
        "task_id" uuid not null,
        "author_id" uuid not null,
        "body" jsonb not null default '{}'::jsonb,
        "parent_comment_id" uuid null references "task_comments"("id") on delete cascade,
        "resolved" boolean not null default false,
        "resolved_by" uuid null,
        "resolved_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        primary key ("id")
      )
    `);
    this.addSql(`create index "task_comments_task_id" on "task_comments" ("task_id")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "task_comments"`);
    this.addSql(`alter table "tasks" drop column if exists "due_date"`);
    // etc
  }
}
```

### Verified Pattern: EventBus subscription for automations
```typescript
// Source: src/subscriptions/event-bus.ts — verified (publish/subscribe pattern)
// EventBus is a process-singleton. AutomationService subscribes on init:
import { eventBus } from "../subscriptions/event-bus.ts";

class AutomationService {
  private unsubscribes: Array<() => void> = [];

  start(): void {
    this.unsubscribes.push(
      eventBus.subscribe("project.*.tasks", async (event) => {
        await this.evaluateAutomations(event.payload);
      })
    );
  }

  stop(): void {
    this.unsubscribes.forEach((fn) => fn());
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw SQL in web route handlers | tRPC + service + MikroORM | Phase 1 (ARCH-01) | Reports page still uses old path — fix in Phase 5 |
| Inline ALTER TABLE in request handlers | MikroORM migrations | Phase 1 (ARCH-11) | SprintService still has `ensureTaskProjectColumn()` — fix in Phase 5 |
| `tasks.dependencies` jsonb blob | `task_relationships` normalized table | Phase 5 (D-19) | Existing TaskService.setDependencies() must be extended |
| `Sprint.metricsSnapshot` inline jsonb | `MetricsCache` entity extended with scope | Phase 5 (D-32/D-34) | SprintService.close() currently writes inline — migrate |
| Custom SVG Gantt (TaskTimeline.svelte) | @svar/gantt-svelte | Phase 5 (D-60) | Dependency arrows, proper drag — replace existing |
| Custom DOM Calendar (TaskCalendar.svelte) | @event-calendar/core | Phase 5 (D-63) | Week/day views, proper multi-day spans — replace existing |
| Reports as data tables | Reports with LayerChart visual charts | Phase 5 (D-56..59) | `+page.svelte` already has tab structure — add chart components |

**Deprecated/outdated:**
- `openProductDb()` in `reports/+page.server.ts`: Known ARCH violation, replace with tRPC
- `customFields.assignee` workaround in BulkTaskPatch: Replace with proper `assigneeId` column on Task
- Inline `ensureTaskProjectColumn()` in SprintService: Replace with migration

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@svar/gantt-svelte` v2 is compatible with Svelte 5.55.2 (runes mode) | Standard Stack | Gantt view falls back to custom SVG implementation; D-60 can't be satisfied |
| A2 | `@event-calendar/core` is compatible with Svelte 5.55.2 and svelte-dnd-action | Standard Stack | Calendar replacement fails; must keep TaskCalendar.svelte |
| A3 | `layerchart` dynamic import works correctly in SvelteKit 2.59 with Vite 8 | Standard Stack | Charts need alternative rendering approach |
| A4 | Existing WorkerRegistry pattern is sufficient for metrics rollup without installing graphile-worker | Don't Hand-Roll / Pitfall 6 | Must install graphile-worker as proper dependency for PostgreSQL-backed job persistence |
| A5 | `checkbox` type should be added to `CUSTOM_FIELD_TYPES` (D-77 lists checkbox, existing code has `json` instead) | Entity Schema Audit | If `json` is the intended type, verification tests use wrong type name |
| A6 | `task_relationships` entity is source of truth; `tasks.dependencies` jsonb becomes denormalized read cache | Architecture Patterns | If jsonb removed entirely, all existing dependency read paths break until migrated |
| A7 | TipTap 3.22.5 supports `@tiptap/extension-collaboration` with Yjs | Standard Stack | Realtime collaboration (D-97) requires TipTap version upgrade |

---

## Open Questions

1. **graphile-worker vs internal WorkerRegistry for metrics rollup**
   - What we know: `WorkerRegistry` exists, graphile-worker not installed. Flag descriptions mention graphile-worker conceptually.
   - What's unclear: D-33 explicitly says "graphile-worker job" — does this require installing the actual package?
   - Recommendation: Planner decides: if PostgreSQL-backed durable jobs are required, install `graphile-worker`. If in-process is sufficient for Phase 5, use existing registry with EventBus trigger.

2. **task_relationships vs tasks.dependencies jsonb — which wins?**
   - What we know: Both represent dependency data. Existing TaskService uses jsonb exclusively.
   - What's unclear: D-19 adds `task_relationships` entity. Does jsonb become a read cache, or does it get removed?
   - Recommendation: Keep jsonb as denorm cache for now (read performance), treat `task_relationships` as source of truth. Migration writes both. Removal of jsonb is Phase 6+ cleanup.

3. **Reports page server: full tRPC migration or EM injection?**
   - What we know: Reports page uses `openProductDb()` — ARCH violation. Phase 5 adds LayerChart.
   - What's unclear: Does page.server.ts use direct EM (via hooks.server.ts injection) or does it call tRPC?
   - Recommendation: New `reports` tRPC router. Page.server.ts calls tRPC. Consistent with board/sprints pattern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Runtime | ✓ | 1.3+ | — |
| PostgreSQL/PGlite | DB layer | ✓ | via @electric-sql/pglite 0.4.5 | — |
| svelte-dnd-action | Kanban DnD, Calendar | ✓ installed | 0.9.69 | — |
| @tiptap/core | Comments, description editor | ✓ installed | 3.22.5 | — |
| layerchart | Charts (TSK-03..05) | ✗ not installed | — | Current data table fallback (existing) |
| @svar/gantt-svelte | Gantt view (TSK-09) | ✗ not installed | — | Keep existing TaskTimeline.svelte |
| @event-calendar/core | Calendar (TSK-10) | ✗ not installed | — | Keep existing TaskCalendar.svelte |
| tinykeys | Keyboard shortcuts (D-67) | ✗ not installed | — | Raw keydown listeners |
| @tanstack/svelte-table | List view (D-14) | ✗ not installed | — | HTML table |
| @tanstack/svelte-virtual | Virtual scroll (D-14) | ✗ not installed | — | No virtualization |
| yjs + y-websocket | Real-time collab (D-97..99) | ✗ not installed | — | No real-time collab |
| asciichart | TUI ASCII charts (D-83) | ✗ not installed | — | Text spark lines |
| graphile-worker | Metrics rollup job (D-33) | ✗ not installed | WorkerRegistry in-process | Requires decision |

**Missing dependencies requiring install (no fallback acceptable per CONTEXT.md):**
- All items with ✗ above must be installed before their dependent features can be implemented.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | bun:test (co-located `.test.ts` files) |
| Framework (web) | Vitest 4.x (`src/web/vitest.config.ts`) |
| Framework (e2e) | Playwright 1.59 (opt-in: `FULCRUM_RUN_E2E=1`) |
| Config file | `src/web/vitest.config.ts` (web), none needed for bun:test |
| Quick run command | `bun test src/db/entities/tasks/ src/services/` |
| Full suite command | `bun run ci` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TSK-01 | task_comments CRUD (create, list, delete, resolve) | unit | `bun test src/services/CommentService.test.ts` | ❌ Wave 0 |
| TSK-02 | task_watchers subscribe/unsubscribe + auto-subscribe triggers | unit | `bun test src/services/ -t watcher` | ❌ Wave 0 |
| TSK-03 | Burndown chart renders from real data | Vitest component | `cd src/web && bun run web:test -- BurndownChart` | ❌ Wave 0 |
| TSK-04 | Velocity rollup chart renders | Vitest component | `cd src/web && bun run web:test -- VelocityChart` | ❌ Wave 0 |
| TSK-05 | Cycle time + throughput + WIP + CFD report data correct | unit | `bun test src/services/ReportService.test.ts` | ❌ Wave 0 |
| TSK-06 | metrics_cache rollup job updates snapshot on task mutation | unit | `bun test src/workers/metrics-rollup.test.ts` | ❌ Wave 0 |
| TSK-07 | Sprint capacity preview returns correct math | unit | `bun test src/services/SprintService.test.ts -t capacity` | ❌ Wave 0 |
| TSK-08 | Sprint retrospective notes saved/loaded losslessly | unit | `bun test src/services/SprintService.test.ts -t retrospective` | ❌ Wave 0 |
| TSK-09 | Gantt view renders with dependency arrows | Vitest component | `cd src/web && bun run web:test -- Gantt` | ❌ Wave 0 |
| TSK-10 | Calendar view renders tasks by due date | Vitest component | `cd src/web && bun run web:test -- TaskCalendar` | PARTIAL (TaskCalendar.svelte.test.ts exists) |
| TSK-11 | Bulk operations handle 50+ tasks (single transaction) | unit | `bun test src/services/TaskService.test.ts -t bulk` | ❌ Wave 0 |
| TSK-12 | Custom field engine — all 8 types round-trip | unit | `bun test tests/db/custom-fields.test.ts` | ❌ Wave 0 |
| TSK-13 | Filter AST round-trips (create → save → reload → apply) | unit | `bun test src/filters/ast.test.ts` | ✅ EXISTS |
| TSK-14 | Three-surface parity (web board/list/calendar/Gantt/reports; CLI task+sprint+report; TUI board+list+reports) | integration | `bun run ci` | PARTIAL (TUI screens exist, not fully wired to tRPC) |

### Sampling Rate
- **Per task commit:** `bun test src/db/entities/tasks/ src/services/ src/filters/`
- **Per wave merge:** `bun run ci` (full suite: typecheck + test + build + web)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/services/CommentService.test.ts` — covers TSK-01
- [ ] `src/services/TaskService.test.ts` (watcher tests) — covers TSK-02
- [ ] `src/services/ReportService.test.ts` — covers TSK-05
- [ ] `src/workers/metrics-rollup.test.ts` — covers TSK-06
- [ ] `src/services/SprintService.test.ts` (capacity + retrospective) — covers TSK-07, TSK-08
- [ ] `tests/db/custom-fields.test.ts` — covers TSK-12 (all 8 types round-trip)
- [ ] `src/web/tests/vitest/BurndownChart.test.ts` — covers TSK-03
- [ ] `src/web/tests/vitest/VelocityChart.test.ts` — covers TSK-04
- [ ] `src/web/tests/vitest/GanttView.test.ts` — covers TSK-09

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `permissionedProcedure` on all new tRPC routers |
| V3 Session Management | no (handled by better-auth, not phase 5 scope) | — |
| V4 Access Control | yes | `permissionedProcedure` resource/action checks; org-scoping on all queries |
| V5 Input Validation | yes | zod schemas on all tRPC inputs; TipTap JSON sanitized via existing `tipTapDocToText` pattern |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on task_comments (fetch other org's comments) | Elevation of privilege | All queries filter `org_id = ctx.orgId` — standard service layer pattern |
| Automation cycle attack (infinite loop via chained rules) | DoS | D-91: max 5 chained executions per originating event, then halt + warn |
| XSS via TipTap comment body | Spoofing | Store as TipTap JSON (structured), render via TipTap extensions (sanitized); never render as raw HTML |
| Bulk operation DoS (200 task max) | DoS | D-75: hard cap 200 tasks per bulk operation; enforced in zod schema |
| y-websocket unauthorized access | Elevation of privilege | WebSocket upgrade must validate session/auth; same auth middleware as HTTP |

---

## Sources

### Primary (HIGH confidence)
- `src/db/entities/tasks/Task.ts` — entity columns verified in session
- `src/db/entities/tasks/Sprint.ts` — entity columns verified in session
- `src/db/entities/tasks/MetricsCache.ts` — entity columns verified in session
- `src/db/entities/tasks/TaskStatus.ts` — category enum verified in session
- `src/db/entities/tasks/CustomFieldDef.ts` — field types verified in session
- `src/db/entities/tasks/SavedView.ts` — view types + scope verified in session
- `src/db/entities/tasks/schemas.ts` — TASK_STATUS_CATEGORIES (4, not 5) verified
- `src/db/entities/core/Event.ts` — missing field_name/from_value/to_value verified
- `src/services/TaskService.ts` — all methods, BulkTaskPatch, emitTaskEvent() verified
- `src/services/SprintService.ts` — all methods, ensureTaskProjectColumn antipattern verified
- `src/server/trpc/routers/tasks.ts` — permissionedProcedure pattern verified
- `src/server/trpc/routers/sprints.ts` — requireService pattern verified
- `src/filters/ast.ts` — FilterOp enum, compileSavedViewQuery, custom field support verified
- `src/workers/registry.ts` — WorkerRegistry interface verified (graphile-worker NOT installed)
- `src/subscriptions/event-bus.ts` — EventBus publish/subscribe verified
- `src/web/package.json` — dependency versions verified (no layerchart/gantt/calendar/tinykeys/tanstack)
- `src/web/src/lib/components/tasks/TaskCalendar.svelte` — existing calendar implementation verified
- `src/web/src/lib/components/tasks/TaskTimeline.svelte` — existing Gantt implementation verified
- `src/web/src/lib/server/reports.ts` — all 6 report query functions verified (uses EM connection)
- `src/web/src/routes/projects/[id]/reports/+page.server.ts` — ARCH violation (openProductDb) verified
- `src/db/migrations/Migration20260504130000_ddl_cleanup.ts` — due_date/start_date columns verified

### Secondary (MEDIUM confidence)
- `.planning/phases/05-task-management-metrics/05-CONTEXT.md` — all 111 decisions
- `.planning/REQUIREMENTS.md` — TSK-01..14 definitions
- `.planning/codebase/STACK.md` — dependency versions
- `.planning/codebase/ARCHITECTURE.md` — layering rules

### Tertiary (LOW confidence — flagged as ASSUMED)
- @svar/gantt-svelte Svelte 5 compatibility claim [A1]
- @event-calendar/core compatibility [A2]
- WorkerRegistry sufficiency without graphile-worker [A4]

---

## Fulcrum Workflow Integration Map

### How Phase 5 Features Connect to Existing Fulcrum Systems

#### Symphony Orchestration ↔ Task Management
- `agent_runs` table (Phase 3) tracks orchestration runs. Each run references tasks via `agent_runs.task_id` FK.
- **Automation engine (D-89..D-92) interaction:** When Symphony dispatches an agent to work on a task, the run creates events (`agent_run.started`, `agent_run.completed`). Automation triggers should listen for these events in addition to standard task field changes. Example automation: "When agent_run completes → move task from In Progress to In Review".
- **Task status → dispatch eligibility:** Symphony's tracker adapter reads task status to determine dispatch eligibility. Phase 5's workflow transition rules (D-24) must not break the tracker adapter's assumptions about which statuses are "eligible" vs "completed". The tracker adapter maps Fulcrum statuses to Symphony's `Issue.state` field — ensure the 5 status categories (D-22) map cleanly to Symphony's `open | in_progress | done | cancelled` states.
- **File:** `src/orchestration/tracker-adapter.ts` — reads tasks to build Symphony 12-field Issue model. Phase 5 must NOT break this mapping.

#### Sandcastle Agent Dispatch ↔ Task Management
- Sandcastle dispatches agents (claudeCode, codex) to work on tasks. Agent artifacts (code, files, patches) link back to tasks via `artifacts.task_id`.
- **Task relationships (D-19..D-21) impact on dispatch:** When a task has `blocks` dependencies, Symphony should not dispatch agents to blocked tasks. Phase 5's blocking chain detection (D-20) must expose a `isBlocked(taskId): boolean` service method that the tracker adapter can call.
- **Sprint ↔ agent dispatch:** Active sprint tasks are the primary dispatch pool. Sprint rollover (D-28) must not orphan in-flight agent_runs — if a task rolls over to next sprint while an agent is running, the run continues unaffected (agent_runs tracks task_id, not sprint_id).

#### Inference Router ↔ Task Management
- Phase 4's inference router routes LLM requests. Task context (title, description, custom fields) can be passed to the router for context-aware routing.
- **Routing rules (Phase 4 D-15..D-17) use task metadata:** Rules engine can match on task labels, priority, or project to select different LLM backends. Phase 5's label groups (D-79) and custom fields (D-77) expand the matching surface.
- **No direct integration required in Phase 5** — the router already reads task metadata via tRPC. Phase 5 enriches that metadata (more fields, relationships, comments) which the router can optionally use.

#### EventBus Integration Points
The EventBus is the central integration seam. Phase 5 adds these event producers and consumers:

| Producer | Event Type | Consumer |
|----------|-----------|----------|
| TaskService (status change) | `task.status_changed` | AutomationService (D-89), MetricsRollupWorker (D-33), Symphony tracker |
| TaskService (assignment) | `task.assigned` | AutomationService, WatcherService (D-08 auto-subscribe) |
| CommentService (comment added) | `task.comment_added` | WatcherService (D-06 @mention subscribe) |
| SprintService (sprint closed) | `sprint.closed` | MetricsRollupWorker (freeze snapshot), ReportService (frozen sprint report) |
| AutomationService (rule fired) | `automation.executed` | Audit log, cycle detection counter |
| WorkflowService (transition blocked) | `workflow.transition_denied` | UI notification (soft warning on board) |

#### Three-Surface Integration with New Services

```
Web (SvelteKit)
  → tRPC client → reports.ts router → ReportService → MetricsCache/task_events queries
  → tRPC client → comments.ts router → CommentService → task_comments entity
  → tRPC client → automations.ts router → AutomationService → project_automations entity
  → tRPC client → workflows.ts router → WorkflowService → workflow_transitions config
  → WebSocket → y-websocket server → Yjs CRDT → PostgreSQL doc storage

CLI (fulcrum CLI)
  → tRPC client → same routers as Web
  → `fulcrum report burndown --sprint <id> --format table` → ReportService → ASCII table output
  → `fulcrum task comment add <task-id> "text"` → CommentService (plain text, not TipTap)
  → `fulcrum automation list --project <id>` → AutomationService

TUI (OpenTUI)
  → tRPC client → same routers as Web
  → ReportsScreen → ReportService → asciichart rendering
  → TaskDetailPanel → CommentService → plain text rendering
  → No WebSocket/Yjs in TUI (no collaborative editing in terminal)
```

#### Existing Code That Phase 5 Must NOT Break

| File | What It Does | Phase 5 Risk |
|------|-------------|-------------|
| `src/orchestration/tracker-adapter.ts` | Maps Fulcrum tasks → Symphony Issue model | Adding status categories (D-22) must maintain mapping |
| `src/orchestration/dispatch.ts` | Dispatches agents to eligible tasks | Task relationships (D-19 blocked_by) must expose `isBlocked()` |
| `src/orchestration/session-resume.ts` | Resumes interrupted agent sessions | Sprint rollover (D-28) must not break task_id references |
| `src/router/auto-assign.ts` | Auto-assigns tasks to routing rules | Labels (D-79) and custom fields (D-78) expand matching surface |
| `src/importers/linear.ts` | Imports Linear issues into Fulcrum tasks | New Task columns (due_date, assignee_id, labels) should be populated by importer |
| `src/importers/types.ts` | Import type definitions | Must be extended for new entity types |
| `src/context/assemble.ts` | Assembles context for LLM prompts | Task comments (D-01) and activity feed (D-05) can feed context assembly |
| `src/connectors/framework.ts` | External service connectors | Automation engine (D-89) may fire connector actions |

### Companion Research Files

The following research files contain detailed competitive analysis and are referenced by CONTEXT.md decisions:

| File | Content | Decisions Informed |
|------|---------|-------------------|
| `05-RESEARCH-PLATFORMS.md` | Feature audit: Linear, Jira, ClickUp, Shortcut, Plane, Asana, GitHub Projects, Notion — 16 feature areas compared | D-10..D-18 (board/panel UX), D-22..D-25 (workflow), D-26..D-30 (sprint), D-66..D-68 (keyboard), D-73..D-76 (bulk ops) |
| `05-RESEARCH-DEPENDENCIES.md` | Library selection: best Svelte-compatible package per feature area with rationale | D-60 (SVAR Gantt), D-63 (event-calendar), D-56 (LayerChart), D-14 (TanStack Table), D-67 (tinykeys), D-85..D-88 (dep list) |
| `05-RESEARCH-REPORTS.md` | Reports deep dive: 18 report types, data model architecture, charting library mapping | D-31..D-55 (data model + all report types), D-93..D-96 (portfolio), D-105..D-108 (Monte Carlo) |

---

## Metadata

**Confidence breakdown:**
- Entity schema audit: HIGH — read all entity files directly
- Service layer audit: HIGH — read TaskService + SprintService + reports.ts fully
- Missing columns/entities: HIGH — cross-referenced Task entity vs migrations vs product-queries
- Standard stack (installed): HIGH — verified in bun.lock and package.json
- Standard stack (to install): HIGH — confirmed absent from bun.lock
- Architecture patterns: HIGH — verified from existing routers and services
- Pitfalls: HIGH — identified from actual code antipatterns found in session
- Third-party lib compatibility: LOW — version/compat claims tagged ASSUMED

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (stable stack, no fast-moving dependencies)
