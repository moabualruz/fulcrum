# Phase 5 Peer Review

## Executive Summary

Finding count: **HIGH 6, MEDIUM 8, LOW 4.**

Overall quality is high-density and mostly executable, but Phase 5 is not ready for autonomous parallel execution. Biggest blockers: schema/service contradictions around workspace analytics and workflow config, missing server-side field dependency enforcement, missing relationship CRUD despite multiple downstream consumers, and unsafe same-wave file conflicts. Fix dependency declarations and schema holes before execution starts; otherwise agents will produce locally plausible files that fail integration.

---

## Critical Findings (HIGH severity)

### HIGH-01: Workspace reports accepted by router but excluded by MetricsCache.scopeType schema

**Affected Plans:** 05-01, 05-05, 05-09, 05-13

**Description:** CONTEXT requires workspace-level report scope, and reportsRouter accepts `workspace`, but `MetricsCache.scopeType` and migration check constraints only allow `sprint|project|epic`. Workspace portfolio/cross-project reports cannot persist/query snapshots through the declared two-layer model.

**Evidence:** `05-CONTEXT.md:173-176` says portfolio rollups reuse `metrics_snapshots` with `scope_type: 'workspace'`. `05-01-PLAN.md:191-192` and `05-01-PLAN.md:269` constrain scope to `('sprint','project','epic')`. `05-05-PLAN.md:297` defines `ScopeSchema` with `workspace`.

**Recommended Fix:** Add `workspace` to `MetricsCache.scopeType` TypeScript union and migration check constraint, or change D-95/ReportService to aggregate workspace on read without snapshot rows. Align all three plans.

---

### HIGH-02: WorkflowService expects projects.workflow_config column, but Plan 01 migration never adds it

**Affected Plans:** 05-01, 05-04, 05-15

**Description:** Plan 04 depends on a `workflow_config` jsonb column on projects, but Plan 01 migration only alters tasks, sprints, metrics_cache, events, task_statuses, and creates six new tables. Workflow editor and transition persistence will fail at runtime.

**Evidence:** `05-04-PLAN.md:107-112` instructs `getTransitionGraph` and `updateTransitions` to read/write `project.workflow_config`. `05-01-PLAN.md:267-278` enumerates all migration DDL sections and does not alter `projects`.

**Recommended Fix:** Add `workflow_config jsonb` to Plan 01 migration/entities if Project entity exists, or store workflow transitions in a dedicated entity/table and update Plans 04/15 accordingly.

---

### HIGH-03: Field dependency rules lack server-side required-field validation

**Affected Plans:** 05-02, 05-12, 05-11

**Description:** D-111 requires client-side evaluation plus server validation for required-field rules on save. Plans create the entity and UI config, but no TaskService/tRPC save-path validation task exists. This leaves a definite data integrity/security gap: clients can bypass required conditional fields.

**Evidence:** `05-CONTEXT.md:199-202` says "Server validates required-field rules on save." `05-12-PLAN.md:36-41` scopes the work to shortcuts, command palette, overlay, and field dependency configuration UI. `05-12-PLAN.md:83-90` touches only `+layout.svelte` and UI components. `05-11-PLAN.md:182-190` modifies `TaskService.bulkUpdate` only for bulk events, not field dependency validation.

**Recommended Fix:** Add a backend task to validate `field_dependency_rules` in TaskService create/update/bulkUpdate and corresponding tRPC tests for direct API bypass.

---

### HIGH-04: TaskRelationship has entity only — no CRUD/service/router surface for Gantt/CLI/reports/blockers

**Affected Plans:** 05-02, 05-03, 05-05, 05-10, 05-14

**Description:** Plan 02 creates `TaskRelationship`, but no service/router procedures are planned for creating/listing/deleting relationships. Downstream plans call or assume relationships via `tasks.list({ includeRelationships: true })`, CLI `task relate`, blocked-item reports, Gantt dependency arrows, and tracker `isBlocked`.

**Evidence:** `05-02-PLAN.md:137-142` only defines the entity. `05-10-PLAN.md:142-158` fetches `trpc.tasks.list.query({ projectId, includeRelationships: true })` and maps `relationships`. `05-14-PLAN.md:115-120` adds `fulcrum task relate <task-id> blocks <other-id>`. `05-05-PLAN.md:230-232` requires `getBlockedItems` from `TaskRelationship`.

**Recommended Fix:** Add relationship methods to TaskService and tasksRouter in Wave 2, including create/delete/list, org-scoped validation, cycle/duplicate checks, and tests. Update dependencies for plans 05, 10, 14.

---

### HIGH-05: YjsSnapshot entity appears in Wave 4 with no migration or ORM registration

**Affected Plans:** 05-01, 05-13

**Description:** Plan 13 creates `YjsSnapshot` table/entity in Wave 4, but Phase 5 migration is fixed in Wave 1 and creates only six tables. No migration, barrel export, or ORM registration is specified for `yjs_snapshots`, so persistence can compile as a file but fail at DB/runtime.

**Evidence:** `05-13-PLAN.md:100-117` creates `src/db/entities/tasks/YjsSnapshot.ts` with table `yjs_snapshots`. `05-01-PLAN.md:271-276` lists the only new tables: comments, watchers, reactions, relationships, automations, field dependency rules. `05-02-PLAN.md:156-164` updates the barrel for six entities only.

**Recommended Fix:** Move `YjsSnapshot` entity and migration DDL to Wave 1/Plan 01/02, or defer Yjs persistence. Add index/barrel/ORM registration and migration ACs.

---

### HIGH-06: Wave 2 unsafe same-file conflicts across routers/index.ts and TaskService.ts

**Affected Plans:** 05-03, 05-04, 05-05, 05-06

**Description:** Wave 2 contains four autonomous plans that all modify `src/server/trpc/routers/index.ts`; Plans 03 and 04 also both modify `src/services/TaskService.ts`. This violates safe parallelism and will create merge conflicts or order-dependent service behavior.

**Evidence:** `05-03-PLAN.md:8-14`, `05-04-PLAN.md:8-12`, `05-05-PLAN.md:8-13`, and `05-06-PLAN.md:8-12` all include `src/server/trpc/routers/index.ts`. `05-03-PLAN.md:265-268` changes TaskService auto-subscribe; `05-04-PLAN.md:155-160` changes TaskService transition validation/events.

**Recommended Fix:** Split router mounting and TaskService integration into a sequential integration plan after service/router files exist, or assign one Wave 2 owner for shared files.

---

## Significant Findings (MEDIUM severity)

### MEDIUM-01: Plan 06 depends on CommentService but does not declare Plan 03

**Affected Plans:** 05-03, 05-06

**Description:** Automation actions call `CommentService`, but Plan 06 depends only on [01, 02]. In parallel Wave 2 execution, Plan 06 can run before CommentService/commentsRouter exist.

**Evidence:** `05-06-PLAN.md:6` declares `depends_on: [01, 02]`. `05-06-PLAN.md:237-243` includes `add_comment` and `subscribe_watcher` actions via `CommentService`. CommentService is created in `05-03-PLAN.md:171-225`.

**Recommended Fix:** Add dependency `03` to Plan 06, or move automation comment/watcher actions to a later integration plan.

---

### MEDIUM-02: Plan 08 uses sprint capacity but lacks dependency on Plan 06

**Affected Plans:** 05-06, 05-08

**Description:** Plan 08 builds `SprintCapacityBar` and sprint planning UI, but depends only on Plan 03. Its data source/method `getCapacityPreview` is created in Plan 06.

**Evidence:** `05-08-PLAN.md:6` declares `depends_on: [03]`. `05-08-PLAN.md:161-166` renders assigned/capacity utilization. `05-06-PLAN.md:155-160` creates `SprintService.getCapacityPreview`.

**Recommended Fix:** Add dependency `06` to Plan 08 or make Plan 08 purely presentational with explicit mock props and defer wiring.

---

### MEDIUM-03: Team mentions decision only partially covered

**Affected Plans:** 05-03, 05-07

**Description:** D-100 requires `@team-name` resolving to a team and subscribing all team members. Plans cover user mentions and UI suggestion sources, but CommentService extraction only returns user IDs.

**Evidence:** `05-CONTEXT.md:184-186` defines team mention behavior. `05-03-PLAN.md:150-157` tests user IDs from TipTap mention nodes. `05-03-PLAN.md:202-203` defines `extractMentions(...): string[]` extracting `attrs.id` as user IDs. `05-07-PLAN.md` references D-101 but not D-100 in its task/service behavior.

**Recommended Fix:** Add team mention parsing type discriminator, team lookup, member expansion, and tests for watcher auto-subscribe for teams.

---

### MEDIUM-04: Label groups and priority system lack concrete backend model

**Affected Plans:** 05-01, 05-08, 05-11, 05-14

**Description:** D-79/D-80 define label groups and priority levels, but plans mostly use `Task.labels: string[]` and UI pickers. There is no label entity/group schema, no color persistence, and no priority enum/check constraints.

**Evidence:** `05-CONTEXT.md:151-153` requires scoped labels with colors/groups and five priority levels. `05-01-PLAN.md:171-172` adds labels as `string[]`. `05-11-PLAN.md:168-172` adds UI pickers but no data model.

**Recommended Fix:** Either explicitly defer label groups/color and priority metadata, or add label/priority schema/service tasks and tests.

---

### MEDIUM-05: D-78 custom field visibility across surfaces is partial

**Affected Plans:** 05-07, 05-08, 05-11

**Description:** D-78 requires custom fields in list columns, task detail panel, filter builder, bulk edit, and board cards. Plans cover list/filter tests and mention task detail sections, but bulk edit does not include custom fields and board cards do not show up to two custom field values.

**Evidence:** `05-CONTEXT.md:147-149` defines D-78. `05-08-PLAN.md:139-149` includes custom field list columns. `05-11-PLAN.md:167-176` bulk actions omit custom field edits. `05-08-PLAN.md:90-94` TaskCard comfortable mode lists labels/points/assignee/priority, not custom fields.

**Recommended Fix:** Add custom field display slots to TaskCard, custom fields section wiring in TaskDetailPanel, and a bulk custom-field action.

---

### MEDIUM-06: Acceptance criteria rely on grep and can pass broken implementations

**Affected Plans:** 05-05, 05-09, 05-10, 05-13, 05-15

**Description:** Many ACs verify strings/files rather than behavior. This is not enough for chart rendering, dynamic imports, critical path, Yjs auth/persistence, or sprint close flows.

**Evidence:** `05-10-PLAN.md:190-198` accepts Gantt by grep for `Gantt`, `dependency`, `critical`, `slack`. `05-13-PLAN.md:144-152` accepts Yjs persistence by grep for `WebSocketServer`, `encodeStateAsUpdate`, `docName`. `05-15-PLAN.md:141-151` accepts sprint/workflow/automation UI by grep for data attributes and words.

**Recommended Fix:** Add command-verifiable tests: component render tests for charts/Gantt/calendar, pure critical path unit tests, yjs persistence/auth unit tests, and route/server integration tests.

---

### MEDIUM-07: `autonomous: false` final plan conflicts with autonomous execution contract

**Affected Plans:** 05-15

**Description:** User asks autonomous agents to execute plans, but Plan 15 has `autonomous: false` and a blocking human-verify checkpoint. That may be intentional, but it conflicts with "plans executable by autonomous agent without ambiguity" for the final wave.

**Evidence:** `05-15-PLAN.md:17` sets `autonomous: false`. `05-15-PLAN.md:224-238` has a blocking `checkpoint:human-verify` requiring user approval.

**Recommended Fix:** Mark Plan 15 as a manual verification plan, or split automated completion from human UAT so autonomous execution can finish without blocking.

---

### MEDIUM-08: Yjs WebSocket endpoint hardcodes localhost

**Affected Plans:** 05-13

**Description:** Collaboration client connects to `ws://localhost:1234`, which works only in local dev and bypasses deployment/proxy/config concerns. It also weakens auth review because origin/session handling is not represented in client config.

**Evidence:** `05-13-PLAN.md:166-172` hardcodes `new WebsocketProvider("ws://localhost:1234", ...)`. `05-13-PLAN.md:134` requires validating WebSocket upgrade against session auth.

**Recommended Fix:** Use configured public/private WebSocket URL from environment/runtime config, same-origin default, and add tests for auth rejection.

---

## Minor Findings (LOW severity)

### LOW-01: Plan 01 dependency count says 14 packages but command installs 13 web + 1 root + shadcn components

**Affected Plans:** 05-01

**Description:** Wording is slightly ambiguous. Must-have says "All 14 new npm packages," while Task 1 also installs shadcn components via `npx`, which are source additions rather than npm deps.

**Evidence:** `05-01-PLAN.md:28` says 14 packages. `05-01-PLAN.md:100-115` installs 13 web packages plus `asciichart`; `05-01-PLAN.md:117-121` adds shadcn components.

**Recommended Fix:** Clarify "14 npm packages plus shadcn component files."

---

### LOW-02: Custom field type count inconsistent after adding checkbox

**Affected Plans:** 05-01, 05-11

**Description:** Research says existing 8 types include `json` not `checkbox`, while Plan 01 says add checkbox as 9th type, and Plan 11 still says all 8 types.

**Evidence:** `05-RESEARCH.md:109-110` notes 8 existing types include `json` not `checkbox`. `05-01-PLAN.md:228` says add `checkbox` as 9th type. `05-11-PLAN.md:192-205` says verify all 8 types including checkbox.

**Recommended Fix:** Decide whether Phase 5 verifies 8 required types excluding `json`, or 9 supported types including legacy `json`; update ACs.

---

### LOW-03: Some verification commands use brittle grep semantics

**Affected Plans:** 05-02, 05-06, 05-14

**Description:** Several ACs use `grep -vc` as "not found" checks, which counts non-matching lines and can pass even when forbidden text exists.

**Evidence:** `05-06-PLAN.md:202` uses `grep -vc "ensureTaskProjectColumn"`. `05-14-PLAN.md:189` uses `grep -vc "mock\|stub\|placeholder\|TODO"`.

**Recommended Fix:** Use `! rg "pattern" file` for absence checks.

---

### LOW-04: Plan 13 says y-websocket starts alongside Hono but defers startup wiring

**Affected Plans:** 05-13, 05-15

**Description:** Plan 13 `done` claims server starts alongside Hono, but action explicitly exports function only and defers wiring. Plan 15 does not touch server startup.

**Evidence:** `05-13-PLAN.md:137-139` says wiring will be done later and "for now, export the function." `05-13-PLAN.md:153` says "server starts alongside Hono."

**Recommended Fix:** Add startup wiring to Plan 13/15 or change done criterion to "server function implemented but not started."

---

## Decision Coverage Audit

| Decision# | Decision Summary | Mapped Plan(s) | Status |
|---|---|---|---|
| D-01 | Flat comments with threaded replies | 02, 03, 07 | covered |
| D-02 | Comment TipTap JSON with mention/task-list/placeholder | 01, 02, 03, 07 | covered |
| D-03 | Resolve/unresolve comments | 02, 03, 07 | covered |
| D-04 | Emoji reactions | 02, 03, 07 | covered |
| D-05 | Activity feed field-change diffs | 01, 03, 04, 07 | covered |
| D-06 | Mentions auto-subscribe watcher | 03 | partial |
| D-07 | task_watchers source field | 02, 03, 07 | covered |
| D-08 | Creator/assignee/mention auto-subscribe | 03 | covered |
| D-09 | Watcher CRUD only, notifications deferred | 02, 03, 07 | covered |
| D-10 | Board DnD via svelte-dnd-action | 08 | covered |
| D-11 | Board grouping/swimlanes | 08 | covered |
| D-12 | WIP limits | 08 | covered |
| D-13 | Card density toggle | 08 | covered |
| D-14 | TanStack list with virtual scroll | 08 | covered |
| D-15 | Column customization persisted in SavedView | 08, 11 | covered |
| D-16 | Right side task panel | 07 | covered |
| D-17 | Task panel sections | 07 | covered |
| D-18 | J/K/Esc panel navigation | 07, 12 | covered |
| D-19 | Task relationships entity | 02, 03, 10, 14 | partial |
| D-20 | Blocked badge and soft done warning | 08, 03 | partial |
| D-21 | Gantt arrows and board chain tooltip | 02, 10, 08 | partial |
| D-22 | Five status categories | 01, 04, 15 | covered |
| D-23 | Custom statuses per project | 04, 15 | partial |
| D-24 | Hard transition rules | 04, 15 | partial |
| D-25 | Status auto-actions | 04 | covered |
| D-26 | Backlog tray sprint planning | 08 | covered |
| D-27 | Sprint capacity preview | 06, 08 | covered |
| D-28 | Sprint close disposition | 06, 15 | covered |
| D-29 | Retrospective notes and frozen report | 06, 15 | covered |
| D-30 | Sprint comparison velocity | 09, 15 | covered |
| D-31 | Task event log | 01, 05 | covered |
| D-32 | Daily snapshots | 01, 05 | partial |
| D-33 | Metrics rollup worker | 05 | covered |
| D-34 | Extend Event field-change columns | 01, 03, 04, 05 | covered |
| D-35 | Burndown | 05, 09 | covered |
| D-36 | Burnup | 05, 09 | covered |
| D-37 | Velocity | 05, 09 | covered |
| D-38 | Sprint report card | 15 | covered |
| D-39 | CFD | 05, 09 | covered |
| D-40 | Cycle time scatter | 05, 09 | covered |
| D-41 | Lead time | 05, 13 | covered |
| D-42 | Throughput | 05, 09 | covered |
| D-43 | WIP over time | 05, 09 | covered |
| D-44 | Age of open items | 13 | covered |
| D-45 | Progress rollup | 05, 13 | covered |
| D-46 | Scope tracking | 05, 13 | covered |
| D-47 | Deadline risk | 05, 15 | covered |
| D-48 | Workload distribution | 05, 13 | covered |
| D-49 | Capacity utilization | 05, 13 | covered |
| D-50 | Stale issues | 05, 15 | covered |
| D-51 | Blocked items | 05, 15 | covered |
| D-52 | Reopened rate | 05, 15 | covered |
| D-53 | Project and workspace report scopes | 05, 09, 13 | partial |
| D-54 | CSV export for every report | 05, 14 | covered |
| D-55 | Report date range picker | 05, 09 | covered |
| D-56 | LayerChart primary library | 01, 09, 13, 15 | covered |
| D-57 | Client-only chart imports | 09, 13, 15 | covered |
| D-58 | Chart color tokens | 09 | covered |
| D-59 | Chart tooltip/drilldown | 09, 13 | partial |
| D-60 | SVAR Gantt | 01, 10 | covered |
| D-61 | Gantt grouping and arrows | 10 | covered |
| D-62 | Gantt click opens detail panel | 10 | covered |
| D-63 | Event Calendar | 01, 10 | covered |
| D-64 | Calendar due dates/overdue | 10 | covered |
| D-65 | Sprint overlay | 10 | covered |
| D-66 | Command palette | 12 | covered |
| D-67 | Keyboard shortcuts | 12 | covered |
| D-68 | Shortcut help overlay | 12 | covered |
| D-69 | Visual filter builder | 11 | covered |
| D-70 | SavedView stores AST/view config | 11 | covered |
| D-71 | Quick filters | 11 | covered |
| D-72 | Filter AST verification | 11 | covered |
| D-73 | Multi-select UX | 11 | covered |
| D-74 | Bulk action toolbar actions | 11 | covered |
| D-75 | Transaction and max 200 | 11 | partial |
| D-76 | Bulk consolidated events | 11 | covered |
| D-77 | Custom field verification only | 01, 11 | covered |
| D-78 | Custom fields visible across surfaces | 07, 08, 11 | partial |
| D-79 | Labels with color/groups | 01, 08, 11, 14 | partial |
| D-80 | Priority levels | 08, 11, 14 | partial |
| D-81 | Web parity | 07-13, 15 | covered |
| D-82 | CLI parity | 14 | covered |
| D-83 | TUI ASCII reports | 14 | covered |
| D-84 | Shared service/tRPC layer | 03-06, 14 | covered |
| D-85 | New web deps | 01 | covered |
| D-86 | TipTap extension deps | 01 | covered |
| D-87 | TUI asciichart dep | 01 | covered |
| D-88 | MIT licenses | 01 | gap |
| D-89 | Automation rules | 02, 06, 15 | covered |
| D-90 | Project automation entity | 02, 06 | covered |
| D-91 | Automation EventBus/cycle detection | 06 | covered |
| D-92 | Automation templates | 02, 06, 15 | covered |
| D-93 | Portfolio table | 13 | covered |
| D-94 | Portfolio rollup from snapshots | 13 | partial |
| D-95 | Cross-project reports via workspace scope | 05, 13 | partial |
| D-96 | Resource allocation | 13 | covered |
| D-97 | Collaboration cursors | 01, 13 | covered |
| D-98 | y-websocket + persistence | 13 | partial |
| D-99 | Presence indicators | 13 | covered |
| D-100 | Team mentions subscribe all members | 03, 07 | gap |
| D-101 | Dual suggestion sources users/teams | 07 | partial |
| D-102 | Critical path topo sort | 10 | covered |
| D-103 | Recalculate/cache critical path | 10 | partial |
| D-104 | Slack/buffer visualization | 10 | covered |
| D-105 | Monte Carlo simulation | 09 | covered |
| D-106 | Forecast fan chart | 09 | partial |
| D-107 | Forecast per sprint/epic/milestone | 09 | partial |
| D-108 | Client-side computation | 09 | covered |
| D-109 | Field dependency rules entity | 02, 12 | covered |
| D-110 | Example dependent fields | 12 | covered |
| D-111 | Client eval + server required validation | 12 | partial |

**Hard gaps (no coverage):** D-88, D-100.

**Partials requiring explicit AC/task strengthening:** D-06, D-19, D-20, D-21, D-23, D-24, D-32, D-53, D-59, D-75, D-78, D-79, D-80, D-94, D-95, D-98, D-101, D-103, D-106, D-107, D-111.

---

## Wave Structure Analysis

### Wave 1 — Plans 05-01, 05-02

Same-file conflicts: none.

Analysis: Correct parallel split by schema/deps vs entity files. Missing: YjsSnapshot and `projects.workflow_config` are absent from Wave 1 schema/entity work (see HIGH-02, HIGH-05). Both must be absorbed into Wave 1 before later waves proceed.

### Wave 2 — Plans 05-03, 05-04, 05-05, 05-06

Same-file conflicts: `src/server/trpc/routers/index.ts` modified in all four plans; `src/services/TaskService.ts` modified in 05-03 and 05-04.

Analysis: **Not safe for parallel execution.** Split shared router mounting and TaskService integrations into one ordered integration plan, or serialise these plans. Plan 06 also needs Plan 03 dependency added (see MEDIUM-01). Relationship CRUD for HIGH-04 should land here.

### Wave 3 — Plans 05-07, 05-08, 05-09, 05-10

Same-file conflicts: none declared.

Analysis: Mostly parallel-safe by file ownership. Missing dependency: 05-08 needs 05-06 for capacity data (see MEDIUM-02). 05-10 needs relationship CRUD from a fixed Wave 2 (see HIGH-04).

### Wave 4 — Plans 05-11, 05-12, 05-13

Same-file conflicts: none declared.

Analysis: Parallel-safe by files. 05-12 server validation must be backend work, not just UI (HIGH-03). 05-13 creates `yjs_snapshots` table too late for Phase 5 migration wave (HIGH-05).

### Wave 5 — Plans 05-14, 05-15

Same-file conflicts: none declared.

Analysis: 05-14 can likely run in parallel with portions of 05-15, but 05-15 depends on 14 and includes final CI/human verification. Keep final verification last. Plan 15 `autonomous: false` should be marked explicitly as UAT/manual rather than implementation (MEDIUM-07).

---

## Verdict

**NO-GO with conditions.**

Blocking issues that must be resolved before Phase 5 execution begins:

1. **HIGH-01** — Add `workspace` to MetricsCache.scopeType schema or redesign workspace report query path.
2. **HIGH-02** — Add `projects.workflow_config` column to Plan 01 migration, or redesign workflow persistence.
3. **HIGH-03** — Add server-side field dependency validation task to TaskService (Wave 2 or 4 backend plan).
4. **HIGH-04** — Add TaskRelationship CRUD/service/router surface in Wave 2.
5. **HIGH-05** — Add YjsSnapshot migration/ORM registration to Wave 1, or explicitly defer Yjs persistence.
6. **HIGH-06** — Restructure Wave 2 to eliminate same-file conflicts (routers/index.ts, TaskService.ts).

After these six fixes, plans are close to executable. Medium/low issues can be addressed as targeted plan amendments before agent execution starts.
