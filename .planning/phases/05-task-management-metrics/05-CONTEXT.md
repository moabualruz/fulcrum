# Phase 5: Task Management + Metrics - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Research basis:** Feature audit of Linear, Jira, ClickUp, Shortcut, Plane, Asana, GitHub Projects, Notion; dependency landscape for SvelteKit stack

<domain>
## Phase Boundary

Make the task pillar **competitive with Linear/Plane** as the UX benchmark and **Jira/Shortcut** as the analytics benchmark. Phase delivers: comments with @mentions (users + teams) and resolve, watchers, full board/list UX (swimlanes, grouping, inline edit, drag-and-drop), Gantt timeline with dependency arrows, drag-to-reschedule, and critical path highlighting, calendar with drag-to-change-date, comprehensive reporting suite (sprint reports, flow metrics, project/epic rollups, team workload, quality/health, portfolio/cross-project), workflow engine with transition rules and automation, real-time collaboration cursors in task descriptions, field dependencies, Monte Carlo forecasting, bulk operations at scale, custom field verification, saved view filter builder, keyboard-first UX with command palette, and three-surface parity. All backed by a two-layer data model (event log + daily snapshots) powering near-real-time analytics.

</domain>

<decisions>
## Implementation Decisions

### Comments & Activity Feed
- **D-01:** `task_comments` supports flat comments with optional threaded replies (`parent_comment_id` nullable FK). Default view is chronological flat; replies indent under parent. Matches GitHub Issues threading model — battle-tested.
- **D-02:** Comment body uses TipTap JSON with extensions: `@tiptap/extension-mention` (user @mentions with suggestion popup), `@tiptap/extension-task-list` (checklists), `@tiptap/extension-placeholder`. Reuses existing `tasks-rich-text.ts` for plain-text mirror.
- **D-03:** Comments support resolve/unresolve (`resolved: boolean`, `resolvedBy`, `resolvedAt`). Resolved comments visually collapse (minimized) like GitHub PR review comments.
- **D-04:** Emoji reactions on comments — 6 standard reactions (👍 👎 😄 🎉 😕 ❤️) stored as `comment_reactions` join table (`comment_id, user_id, emoji`). Linear + GitHub + ClickUp all offer this — table stakes.
- **D-05:** Per-task activity feed shows field changes with diff (who changed status from X→Y, who reassigned, who changed points). Stored in existing `Event` entity with `field_changes: jsonb` column. Activity feed = filtered Event query per task.
- **D-06:** @mentions in comments trigger watcher auto-subscribe for mentioned user (if not already watching). Mention rendering links to user profile.

### Watchers Entity Design
- **D-07:** `task_watchers` join entity (`task_id, user_id, created_at, source: 'manual' | 'mention' | 'assign' | 'create'`). Source tracks why subscribed — allows smart unsubscribe logic.
- **D-08:** Auto-subscribe rules: creator auto-watches on create; assignee auto-watches on assign; @mentioned auto-watches on comment. All can manually unwatch.
- **D-09:** Watcher list drives notification delivery (Phase 7 scope) — Phase 5 creates entity + CRUD + auto-subscribe logic only.

### Board & List Views
- **D-10:** Kanban board uses `svelte-dnd-action` for drag-and-drop (2.1k stars, Svelte 5 compat, cross-container, touch, a11y). Cards draggable between status columns and between sprints (backlog ↔ sprint).
- **D-11:** Board supports grouping by: status (default), assignee, priority, label, sprint. Grouping changes swimlane rows. Matches Linear's board grouping UX.
- **D-12:** WIP limits configurable per status column. Visual warning (red column header) when limit exceeded. Matches Jira's board WIP limit UX.
- **D-13:** Card density toggle: compact (title + assignee avatar + priority icon) vs comfortable (title + description preview + labels + points + assignee + priority). Matches ClickUp's density toggle.
- **D-14:** List view with inline editing — click any cell to edit. Uses `@tanstack/svelte-table` for headless table with column resize, sorting, multi-field grouping, virtual scrolling via `@tanstack/svelte-virtual`.
- **D-15:** Column customization in list view — show/hide/reorder columns. Persisted per user via `SavedView` entity.

### Task Detail Panel
- **D-16:** Task detail opens as right side panel (not full page modal) — preserves board/list context. Linear-style: click task → panel slides in from right, list stays visible and navigable.
- **D-17:** Side panel sections: title (inline edit), status/priority/assignee/labels bar, rich text description (TipTap), subtasks list, dependencies section, custom fields, comments + activity feed (tabbed), watchers.
- **D-18:** Keyboard navigation in panel: `J/K` to move between tasks without closing panel. `Esc` to close.

### Task Relationships & Dependencies
- **D-19:** Three relationship types stored in `task_relationships` entity: `blocks` / `blocked_by` (directional), `relates_to` (bidirectional), `duplicate_of` (directional with auto-close option).
- **D-20:** Blocked tasks show visual badge on board cards and list rows. Blocked status prevents drag-to-done on board (soft warning, not hard block).
- **D-21:** Dependency visualization: Gantt view shows arrows between dependent tasks. Board view shows blocking chain icon with hover tooltip listing blockers.

### Workflow & Status Engine
- **D-22:** Status categories: `backlog`, `unstarted`, `started`, `completed`, `canceled` — matching Linear's proven 5-category model. Custom statuses map to one of these categories.
- **D-23:** Custom statuses per project — each project defines its own status set within the 5 categories. Default set: Backlog, Todo, In Progress, In Review, Done, Canceled.
- **D-24:** **Hard transition rules per workflow.** Each project workflow defines allowed transitions as a directed graph (e.g., Todo→In Progress allowed, Todo→Done blocked). Transition violations show error with explanation of required path. Configurable per-project in workflow settings. Matches Jira's workflow scheme model — only platform with true transition guards.
- **D-25:** Auto-actions on status change via EventBus: when task moves to `completed` → auto-resolve linked blocking relationships; when task moves to `started` → auto-set `startedAt` timestamp (for cycle time calculation).

### Sprint/Cycle Management
- **D-26:** Sprint planning UX: drag tasks from backlog tray into sprint. Backlog tray is a persistent sidebar panel on sprint board. Matches Linear's cycle planning UX.
- **D-27:** Sprint capacity preview: sum of assigned task points vs `capacityPoints` target. Rendered as progress bar with color (green < 80%, yellow 80-100%, red > 100%).
- **D-28:** Sprint close behavior: prompt for incomplete items — options: move to next sprint (rollover), move to backlog, keep in closed sprint. Matches Jira's sprint close UX.
- **D-29:** Sprint retrospective: `retrospectiveNotes` field (TipTap JSON) + structured sprint report data frozen at close time (completed count, carried over count, added mid-sprint count, removed count, scope change delta).
- **D-30:** Sprint comparison: velocity chart shows current sprint vs last N sprints with rolling average line.

### Data Model — Two-Layer Analytics Architecture
- **D-31:** **Layer 1 — Event log** (`task_events` table): `(id, task_id, event_type, from_value, to_value, field_name, actor_id, sprint_id, project_id, timestamp, metadata: jsonb)`. Powers: cycle time, lead time, CFD, throughput, activity feed, audit trail. Event types: `status_change`, `assignment_change`, `points_change`, `sprint_change`, `priority_change`, `label_change`, `comment_added`, `comment_resolved`, `relationship_added`, `relationship_removed`.
- **D-32:** **Layer 2 — Daily snapshots** (`metrics_snapshots` table): `(id, scope_type: 'sprint' | 'project' | 'epic', scope_id, date, points_total, points_completed, points_remaining, tasks_total, tasks_completed, wip_count, status_counts: jsonb)`. One row per scope per day. Powers: burndown, burnup, velocity, WIP over time.
- **D-33:** Snapshot generation runs as graphile-worker job triggered by EventBus on task mutations. Also runs nightly catchup job to fill any gaps. Near-real-time: event → job enqueue → snapshot update within worker poll interval (~5s with graphile-worker `pollInterval`).
- **D-34:** Existing `MetricsCache` entity repurposed as the snapshot table (extend columns). Existing `Event` entity extended with `field_name` + `from_value` + `to_value` for field-change tracking.

### Reports & Analytics Suite

#### Sprint Reports
- **D-35:** **Burndown chart** — Line chart: points remaining (actual) vs ideal burndown line. Scope changes shown as vertical jumps. Points mode + task count mode toggle. LayerChart `LineChart` with reference line overlay.
- **D-36:** **Burnup chart** — Line chart: points completed (ascending) + total scope line (shows scope creep explicitly). Better than burndown for scope-volatile sprints.
- **D-37:** **Velocity chart** — Bar chart: points completed per sprint for last N sprints + rolling average line. Bar color codes: on-target (green), below target (amber). LayerChart `BarChart`.
- **D-38:** **Sprint report** — Summary card: completed (count + points), carried over, added mid-sprint, removed, scope change %. Table of all tasks with status change timeline. Frozen at sprint close.

#### Flow Metrics (Kanban Analytics)
- **D-39:** **CFD (Cumulative Flow Diagram)** — Stacked area chart: count per status category per day. Bottlenecks visible as expanding bands. LayerChart `AreaChart` with `stack` layout. Shortcut has best-in-class CFD — match their implementation.
- **D-40:** **Cycle time scatter** — Scatter plot: each completed task as a dot (x = completion date, y = cycle time in hours). Percentile bands at p50, p75, p95. LayerChart `ScatterChart` with percentile reference lines. Linear Insights pattern.
- **D-41:** **Lead time** — Same scatter as cycle time but measured from created → completed (not started → completed).
- **D-42:** **Throughput** — Bar chart: tasks completed per week. Rolling average line. Trend direction indicator.
- **D-43:** **WIP over time** — Area chart: items in `started` status category per day. Highlights when WIP exceeds team WIP limit.
- **D-44:** **Age of open items** — Horizontal bar chart: current items grouped by status, bar length = days in current status. Stale items (>14 days) highlighted red.

#### Project/Epic/Milestone Reports
- **D-45:** **Progress rollup** — Donut/progress bar per epic/milestone/project: % complete by task count and by points. Drillable to task list.
- **D-46:** **Scope tracking** — Line chart: original scope (at sprint/epic creation) vs current scope vs completed. Shows scope creep over time.
- **D-47:** **Deadline risk** — Table: items at risk of missing target date based on current velocity extrapolation. Traffic light: green/amber/red.

#### Team/Workload Reports
- **D-48:** **Workload distribution** — Stacked bar per assignee: task count by status category. Shows who's overloaded vs underutilized.
- **D-49:** **Capacity utilization** — Per-sprint: assigned points per team member vs capacity allocation. Bar chart with target line.

#### Quality/Health Reports
- **D-50:** **Stale issues** — Table: tasks with no activity for >N days (configurable, default 14). Sortable by age.
- **D-51:** **Blocked items** — Table: currently blocked tasks with blocker chain and days blocked.
- **D-52:** **Reopened rate** — Percentage of tasks moved from `completed` back to `started`/`unstarted`. Tracks quality signal over sprints.

#### Report Infrastructure
- **D-53:** All reports accessible at project scope and workspace scope. Workspace = aggregated across projects.
- **D-54:** CSV export for every report's underlying data. One-click download via tRPC endpoint returning CSV stream.
- **D-55:** Report date range picker: last 7/14/30/90 days, custom range, or per-sprint scope.

### Chart Library & Visualization
- **D-56:** LayerChart (`layerchart` npm) as primary chart library. Composable D3-based Svelte components. Supports: line, area, stacked area (CFD), bar, scatter, histogram via primitives.
- **D-57:** Charts render client-only via SvelteKit dynamic import. No SSR — D3/SVG requires browser DOM.
- **D-58:** Chart color tokens: use existing `chart-1` through `chart-5` oklch CSS variables from app.css. Extend with `chart-6` through `chart-8` for reports needing more series.
- **D-59:** All charts interactive: tooltip on hover showing exact values, click to drill into filtered task list.

### Gantt/Timeline View
- **D-60:** Use `@svar/gantt-svelte` (SVAR Gantt v2, MIT, Svelte 5 native). Provides: task bars, dependency arrows, drag-to-reschedule, drag-to-resize duration, zoom (day/week/month), 10k task tested. Eliminates need for custom SVG Gantt.
- **D-61:** Gantt grouped by: epic, assignee, or sprint. Dependency arrows drawn automatically from `task_relationships` where type = `blocks`.
- **D-62:** Gantt integrates with task detail panel — click task bar → opens side panel.

### Calendar View
- **D-63:** Use `@event-calendar/core` (zero deps, Svelte native). Provides: month/week/day views, drag-to-reschedule, multi-day spans, event rendering slots.
- **D-64:** Calendar shows tasks by due date. Tasks with start + end date render as multi-day spans. Overdue tasks highlighted red.
- **D-65:** Calendar integrates with sprint overlay — sprint date range shown as background band.

### Keyboard Shortcuts & Command Palette
- **D-66:** Command palette via shadcn-svelte `Command` component (backed by Bits UI). `Cmd+K` opens fuzzy search across tasks, projects, sprints, views. Matches Linear's cmd-K UX — fastest task access.
- **D-67:** Keyboard shortcuts via `tinykeys` (650 bytes). Key bindings:
  - `C` — create task
  - `J/K` — navigate task list up/down
  - `Enter` — open task detail panel
  - `Esc` — close panel
  - `S` — set status (opens status picker)
  - `A` — set assignee
  - `P` — set priority (1-4 keys for levels)
  - `L` — add label
  - `M` — move to sprint
  - `X` — select/deselect for bulk
  - `Shift+C` — add to current sprint
  - `?` — show shortcut help
- **D-68:** Keyboard shortcut help overlay via `?` key. Shows all bindings grouped by context.

### Filter Builder & Saved Views
- **D-69:** Visual filter builder from shadcn-svelte primitives (`Select` + `Popover` + `Badge` + `Button`). No external filter library — domain-specific enough that custom is better. Linear-style filter chip UX: click "+ Filter" → pick field → pick operator → pick value → chip appears.
- **D-70:** Existing `SavedView` entity stores filter AST + view config (column order, sort, grouping, card density). Views shareable at project scope.
- **D-71:** Quick filters sidebar: "My tasks", "Recently updated", "Unassigned", "Blocked", "Overdue". Pre-built filter presets, not saved views.
- **D-72:** Filter AST verification: existing `src/filters/ast.ts` verifies round-trip: create → save → reload → apply → results match. Support AND/OR combinators, field-type-aware operators, custom field references.

### Bulk Operations
- **D-73:** Multi-select UX: checkbox on hover (left edge of task row/card). `Shift+click` for range select. `Cmd+click` for toggle. `Ctrl+A` for select all visible. Matches ClickUp's bulk selection UX.
- **D-74:** Bulk action toolbar appears at top when tasks selected. Actions: set status, set assignee, set priority, add/remove label, move to sprint, set due date, archive, delete. Each opens a picker popover.
- **D-75:** Single DB transaction with batched MikroORM `em.flush()`. All-or-nothing. Max batch 200 tasks.
- **D-76:** Bulk events: one `Event` record per affected field (not per-task), with `affected_task_ids: string[]` in metadata. Avoids event flood while maintaining audit trail.

### Custom Fields
- **D-77:** Custom field engine already implemented. Phase 5 scope: verification-only. Tests confirming all 8 field types (text, number, date, select, multi-select, checkbox, url, user) round-trip through create → read → update → filter.
- **D-78:** Custom fields visible in: list view columns, task detail panel, filter builder, bulk edit. Board cards show up to 2 custom field values (configurable per board).

### Labels & Priority
- **D-79:** Multi-label system with color. Labels scoped per project. Label groups for organization (e.g., "Type: bug/feature/chore", "Area: frontend/backend/infra").
- **D-80:** Priority levels: Urgent (P0), High (P1), Medium (P2), Low (P3), No Priority. Icon + color per level. Matches Linear's priority system.

### Three-Surface Parity
- **D-81:** **Web:** Board + list + table + calendar + Gantt + all reports + command palette + keyboard shortcuts. Full interactive experience.
- **D-82:** **CLI:** Task CRUD + sprint CRUD + `--json` for all output. Reports available as JSON data or formatted tables via `fulcrum report <type> [--sprint <id>] [--project <id>] [--format json|table|csv]`. No chart rendering.
- **D-83:** **TUI:** Task board + task list + sprints + reports with ASCII charts via `asciichart` npm package. Sparklines for velocity trend, ASCII bar charts for workload. Keyboard navigation with j/k/enter/esc.
- **D-84:** All surfaces share service layer (`TaskService`, `SprintService`, `ReportService`) via tRPC. Zero business logic duplication.

### Dependencies to Install
- **D-85:** New npm packages for `apps/web`: `layerchart`, `@svar/gantt-svelte`, `@event-calendar/core`, `tinykeys`, `@tanstack/svelte-table`, `@tanstack/svelte-virtual`, `yjs`, `y-websocket`.
- **D-86:** Existing packages to extend: `svelte-dnd-action` (already in deps or add), `@tiptap/extension-mention`, `@tiptap/extension-task-list`, `@tiptap/extension-placeholder`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`.
- **D-87:** TUI: `asciichart` for ASCII chart rendering.
- **D-88:** All deps MIT licensed. No proprietary runtime dependencies.

### Automation Engine
- **D-89:** Rule-based automation system: `when <trigger> [if <condition>] then <action>`. Triggers: status change, assignee change, label added/removed, priority change, due date passed, task created, comment added. Conditions: field equals/contains/in-list. Actions: set status, set assignee, add/remove label, set priority, move to sprint, add comment, subscribe watcher.
- **D-90:** Automations scoped per project. Stored in `project_automations` entity: `(id, project_id, name, trigger_type, trigger_config: jsonb, condition: jsonb | null, action_type, action_config: jsonb, enabled: boolean, execution_count: number)`.
- **D-91:** Automation execution via EventBus listener — when event matches a trigger, evaluate condition, execute action. Actions that mutate tasks fire their own events (can chain automations). Cycle detection: max 5 chained executions per originating event, then halt with warning log.
- **D-92:** Automation templates for common patterns: "Auto-assign reviewer when status = In Review", "Add 'stale' label when no activity for 14 days", "Move to Done when all subtasks completed", "Notify watchers when priority changed to Urgent".

### Portfolio / Cross-Project Dashboard
- **D-93:** Workspace-level portfolio view: all projects in a table showing name, progress (% done), active sprint summary, overdue count, health status (green/amber/red based on velocity trend).
- **D-94:** Portfolio progress rollup computed from `metrics_snapshots` aggregated across projects. Same two-layer data model — no separate portfolio tables.
- **D-95:** Cross-project reports reuse the same report components (burndown, velocity, CFD, workload) but with `scope_type: 'workspace'` filter. One implementation, multiple scopes.
- **D-96:** Resource allocation view: stacked bar per team member showing task distribution across projects. Identifies over-allocation (>100% capacity across projects).

### Real-Time Collaboration
- **D-97:** Real-time collaboration cursors in task description editor via TipTap `@tiptap/extension-collaboration` (Yjs CRDT) + `@tiptap/extension-collaboration-cursor`. Shows other users' cursor positions and selections with name labels.
- **D-98:** Yjs backend via `y-websocket` server running alongside Hono. Persistence via Yjs document snapshots stored in PostgreSQL. No external service dependency.
- **D-99:** Presence indicators on task detail panel — show avatar dots for users currently viewing the same task. Lightweight: WebSocket heartbeat, not full CRDT for non-editor fields.

### Comment @Mention for Teams
- **D-100:** @mentions support both individual users and teams. `@team-name` resolves to team entity, renders as team badge. All team members receive watcher auto-subscribe (per D-08 pattern).
- **D-101:** TipTap mention extension configured with two suggestion sources: users (from org members) and teams (from org teams). Suggestion popup shows both with type indicator icon.

### Critical Path in Gantt
- **D-102:** Critical path calculation: longest chain of dependent tasks from project start to end. Highlighted in Gantt as red/bold task bars + red dependency arrows. Uses topological sort on `task_relationships` where type = `blocks`.
- **D-103:** Critical path recalculated on dependency change, duration change, or schedule change. Cached per project in `metrics_snapshots` with `scope_type: 'project'`.
- **D-104:** Slack/buffer visualization: non-critical tasks show float (how much they can slip without affecting critical path) as lighter-colored extension on Gantt bar.

### Monte Carlo Forecasting
- **D-105:** Monte Carlo simulation using historical throughput data (tasks completed per day, last 30/60/90 days). Runs 1000 iterations sampling from throughput distribution. Outputs: probability of completing N remaining items by target date at p50/p75/p85/p95.
- **D-106:** Forecast chart: fan chart showing probability cone over time. X = date, Y = remaining items. Bands at p50 (dark), p75, p85, p95 (lightest). LayerChart area chart with multiple opacity-layered series.
- **D-107:** Forecast available per sprint and per epic/milestone. Answers: "When will this sprint/epic likely be done?" with confidence intervals. Displayed as card in reports section.
- **D-108:** Forecast computation runs client-side (pure math, no server round-trip needed). Input: remaining count + throughput array from tRPC query. Monte Carlo in ~10ms for 1000 iterations.

### Field Dependencies
- **D-109:** Conditional field visibility: `field_dependency_rules` entity `(id, project_id, source_field_id, source_value, target_field_id, action: 'show' | 'hide' | 'require')`. When source field matches value → show/hide/require target field.
- **D-110:** Example: when "Type" custom field = "Bug" → show "Severity" and "Steps to Reproduce" fields; when "Type" = "Feature" → show "Design Link" field. Matches ClickUp's task-type field sets.
- **D-111:** Dependency rules evaluated client-side for instant UX. Rules loaded with project config, cached. Server validates required-field rules on save.

### Claude's Discretion
- Exact chart component composition (LayerChart primitives per chart type)
- TanStack Table column definition patterns
- Event log query optimization (indexes, materialized views if needed)
- Sprint report card layout and responsive breakpoints
- Gantt zoom level defaults and interaction details beyond drag-to-reschedule

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
- `src/services/TaskService.ts` — Existing task CRUD + bulk patch
- `src/services/SprintService.ts` — Existing sprint CRUD + MetricsSnapshot on close
- `src/db/entities/tasks/` — Task, Sprint, MetricsCache, CustomFieldDef, SavedView, TaskStatus, schemas
- `src/server/trpc/routers/tasks.ts` — tRPC task surface
- `src/server/trpc/routers/sprints.ts` — tRPC sprint surface
- `src/filters/ast.ts` — Filter AST implementation with tests
- `src/services/tasks.ts` — Pure DB task ops, event dispatcher
- `src/db/repositories/tasks/TaskRepository.ts` — Task data access
- `src/db/tasks-rich-text.ts` — TipTap JSON ↔ plain text

### Research Files (downstream agents SHOULD read relevant sections)
- `.planning/phases/05-task-management-metrics/05-RESEARCH.md` — Fulcrum codebase integration research: entity audits, patterns, pitfalls, code examples, workflow integration map
- `.planning/phases/05-task-management-metrics/05-RESEARCH-PLATFORMS.md` — Feature audit: Linear, Jira, ClickUp, Shortcut, Plane, Asana, GitHub Projects, Notion (16 areas)
- `.planning/phases/05-task-management-metrics/05-RESEARCH-DEPENDENCIES.md` — Library selection per feature area with rationale and compatibility notes
- `.planning/phases/05-task-management-metrics/05-RESEARCH-REPORTS.md` — 18 report types, two-layer data model architecture, LayerChart component mapping

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TaskService` — full CRUD + bulk patch + children listing. Extend with comment/watcher/relationship methods.
- `SprintService` — CRUD + close with MetricsSnapshot. Extend with capacity preview, retrospective, rollover.
- `MetricsCache` entity — exists, repurpose as daily snapshot table (extend columns).
- `SavedView` entity — exists for filter + view config persistence.
- `CustomFieldDef` entity — implemented, needs verification tests only.
- `src/filters/ast.ts` — filter AST parser/compiler with test suite.
- `EventBus` — event-driven side effects (metrics snapshot triggers).
- `src/db/tasks-rich-text.ts` — TipTap JSON ↔ plain text, reuse for comments.
- `Event` entity — audit trail on mutations, extend for field-change tracking.
- `svelte-dnd-action` — may already be in deps for existing drag interactions.

### Established Patterns
- Root gate: `bun run ci`. Focused `bun test` while iterating.
- Services: `EntityManager` injection, MikroORM entities.
- tRPC routers delegate to service layer — no business logic in routers.
- Events via `Event` entity for audit trail.
- Three-surface parity through shared tRPC/service.
- Feature flags through `FULCRUM_FEATURES` registry.
- shadcn-svelte + Bits UI for all UI components.

### Integration Points
- New entities → migrations: `task_comments`, `task_watchers`, `task_relationships`, `comment_reactions`, `task_events` (or extend `Event`), `project_automations`, `workflow_transitions`, `field_dependency_rules`
- `MetricsCache` extension → migration for new snapshot columns (scope_type, status_counts jsonb, points_total, tasks_total)
- `Sprint` entity → migration for `retrospectiveNotes` (TipTap JSON), `closedSummary` (jsonb with carried/added/removed counts)
- `Task` entity → `startedAt` timestamp for cycle time, verify `assignee`, `labels`, `priority` fields exist
- New npm deps → `apps/web/package.json`: layerchart, @svar/gantt-svelte, @event-calendar/core, tinykeys, @tanstack/svelte-table, @tanstack/svelte-virtual, @tiptap/extension-mention, @tiptap/extension-task-list, @tiptap/extension-collaboration, @tiptap/extension-collaboration-cursor, y-websocket, yjs
- New tRPC routers: `reports.ts`, `comments.ts`, `automations.ts`, `workflows.ts`
- New services: `ReportService` (analytics queries), `AutomationService` (rule evaluation + execution), `WorkflowService` (transition validation)
- MetricsCache rollup → graphile-worker job definition in `src/db/entities/jobs/` or worker config
- Gantt/Calendar/Reports/Portfolio → new routes in `apps/web/src/routes/`
- Command palette → root layout component (shadcn-svelte Command)
- Keyboard shortcuts → root layout `onMount` with `tinykeys`
- Collaboration → y-websocket server alongside Hono, Yjs doc persistence in PostgreSQL
- TUI ASCII charts → new render module in TUI via `asciichart`
- CLI reports → new subcommand `fulcrum report` in CLI

</code_context>

<specifics>
## Specific Ideas

### UX Benchmarks
- **Task creation:** Match Linear — `C` key anywhere, instant inline form, no modal
- **Board interaction:** Match Linear grouping + ClickUp WIP limits + Jira swimlanes
- **Command palette:** Match Linear `Cmd+K` — fuzzy search across all entities, instant results
- **Side panel:** Match Linear — right panel preserves list context, J/K navigation between tasks
- **Sprint planning:** Match Linear — drag from backlog tray into sprint, capacity bar
- **Reports:** Match Jira breadth (burndown + velocity + CFD + sprint report) with Linear simplicity (scatterplots + percentile bands)
- **Gantt:** Match Plane/ClickUp — dependency arrows + drag-to-reschedule

### Data Model Pattern
- Two-layer analytics (event log + daily snapshots) is the industry-converged pattern used by Screenful, LinearB, Axify, and all platforms internally. Not novel — validated at scale.

</specifics>

<deferred>
## Deferred Ideas

- Time tracking / time entries / timesheets — v2
- Custom dashboard builder (widget-based, drag-to-compose) — v2
- Scheduled email report delivery — v2
- Multi-assignee per task — v2 (v1 = single assignee + watchers)
- Notification delivery from watchers (Phase 7 — NTF pillar scope)
- Chart export to PNG/PDF — v2

</deferred>

---

*Phase: 5-Task Management + Metrics*
*Context gathered: 2026-05-05*
*Research: Linear, Jira, ClickUp, Shortcut, Plane, Asana, GitHub Projects, Notion feature audit*
