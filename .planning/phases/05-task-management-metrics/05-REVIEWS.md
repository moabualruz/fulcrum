---
phase: 05
reviewers: [gemini, codex]
reviewed_at: 2026-05-05T11:30:00Z
plans_reviewed: [05-00, 05-01, 05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10, 05-11, 05-12, 05-13, 05-14, 05-15]
---

# Cross-AI Plan Review — Phase 5

## Gemini Review

This review covers 16 implementation plans (00–15) across 7 waves for Phase 5. The phase aim is to bring the Task pillar to competitive parity with Linear/Jira through advanced analytics, workflow automation, and real-time collaboration.

---

## 05-00-PLAN.md: RED Test Stubs
**Summary:** Initializes the TDD cycle by creating 10 RED failing test stubs across backend (bun:test) and frontend (vitest) environments, ensuring Nyquist compliance.

**Strengths:**
- Strong discipline in establishing failure states before implementation.
- Covers critical paths like Comment CRUD, Report compute, and Chart rendering.

**Concerns:**
- **LOW:** Ensure test names match requirement IDs (TSK-XX) exactly for automated traceability.

**Suggestions:**
- Add a specific test case for "cross-org isolation" in the CommentService stub to catch IDOR risks early.

**Risk Assessment: LOW.** Pure boilerplate with no architectural risk.

---

## 05-01-PLAN.md: Schema Foundation
**Summary:** The heavy-lifter plan that installs 14 packages and runs a comprehensive migration extending 5 tables and adding 9 new ones.

**Strengths:**
- Directly addresses `HIGH-01`, `HIGH-02`, and `HIGH-05` architecture blockers in Wave 1.
- Implements MIT license verification for all new dependencies (D-88).

**Concerns:**
- **MEDIUM:** The migration is very large. While `addSql` uses `if not exists`, a failure in the middle of 9 `CREATE TABLE` statements in PGlite might leave the schema in an inconsistent state if transactions aren't handled per-statement.
- **LOW:** Standardizing on US spelling `canceled` (D-22) is good, but ensure existing UI labels are updated globally to avoid "cancelled/canceled" drift.

**Suggestions:**
- Consider splitting this into two migrations: one for table extensions and one for new tables, to reduce the failure surface.

**Risk Assessment: MEDIUM.** Success is critical for all subsequent waves.

---

## 05-02-PLAN.md: New Entities
**Summary:** Creates 9 MikroORM entity classes using Stage-3 decorators, providing the typed foundation for the service layer.

**Strengths:**
- Consistent use of explicit `type` properties (D-111).
- Includes the `YjsSnapshot` entity in Wave 1 (fixing `HIGH-05` early).

**Concerns:**
- **LOW:** `TaskRecurrenceRule` contains template data; ensure the size of this JSONB column is monitored if tasks grow very large.

**Suggestions:**
- Add `@Index` to `targetTaskId` in `TaskRelationship` to optimize "Blocked By" reverse queries (D-123).

**Risk Assessment: LOW.** Standard boilerplate.

---

## 05-03-PLAN.md: Comment Service
**Summary:** Implements Comment/Watcher/Reaction logic, including the high-value "Team Mention" expansion feature.

**Strengths:**
- Recursive `extractMentions` supports both Users and Teams (D-100).
- Implements GitHub-style threaded replies (D-01).

**Concerns:**
- **MEDIUM:** Infinite recursion risk in `getThreaded` if a circular parent/child relationship is somehow introduced (though DB constraints should prevent this).
- **LOW:** Watcher auto-subscribe on `@mention` could lead to notification fatigue (Phase 7 concern, but worth noting now).

**Suggestions:**
- Set a hard limit on thread depth (e.g., 5 levels) in the service layer regardless of UI flattening.

**Risk Assessment: LOW.** Standard service logic.

---

## 05-04-PLAN.md: Workflow & Relationship Services
**Summary:** Delivers the workflow transition engine and the blocking relationship manager with cycle detection.

**Strengths:**
- Cycle detection (DFS with depth 50) resolves `HIGH-04` blocking gap.
- Methodology-aware defaults (Scrum/Kanban/None) provide instant project value.

**Concerns:**
- **LOW:** `markAsDuplicate` auto-closes the source task; ensure this doesn't bypass mandatory "Reason for Close" custom fields if they exist.

**Suggestions:**
- In `checkCycle`, cache the results of previous traversals if a bulk operation is checking 50+ tasks at once.

**Risk Assessment: LOW.**

---

## 05-05-PLAN.md: Report Service & Metrics Worker
**Summary:** Implements the two-layer analytics model (Events + Snapshots) and replaces legacy raw SQL.

**Strengths:**
- Addresses `ARCH-01` and `HIGH-01` by moving reports to tRPC and adding workspace scope.
- CSV export (D-54) is a vital power-user feature.

**Concerns:**
- **MEDIUM:** Worker load. A flood of task updates (e.g., during a bulk edit) will trigger 50+ metrics rollup jobs.
- **LOW:** Cycle time calculation from Layer 1 events requires precise "started" to "completed" stamps.

**Suggestions:**
- **Performance:** Implement job debouncing in `metrics-rollup.ts`: only one job per `(scopeId, scopeType)` should be in the queue at any time.

**Risk Assessment: MEDIUM.** Performance of analytics queries on large event logs is the primary risk.

---

## 05-06-PLAN.md: Integration & Automation
**Summary:** The "Shared File Owner" plan that mounts all routers and extends core Task/Sprint services.

**Strengths:**
- Solves `HIGH-06` same-file conflict by centralizing edits to `router.ts` and `TaskService.ts`.
- Implements rule-based automation with cycle detection (D-91).

**Concerns:**
- **MEDIUM:** `TaskService` is growing significantly. The inline field dependency validation (D-111) is added here to avoid circular imports, but it adds to the service's "God Object" status.
- **LOW:** Ensure `AutomationService` cycle detection uses a persistent key (like `originatingEventId`) to track chains accurately.

**Suggestions:**
- Add a "Dry Run" mode to `AutomationService` to help users test complex chains.

**Risk Assessment: MEDIUM.** High complexity in `AutomationService` logic.

---

## 05-07-PLAN.md: Task Detail Panel
**Summary:** Delivers the central task interaction surface with rich text, mentions, and activity feeds.

**Strengths:**
- Linear-style side panel (D-16) preserves view context.
- Dual mention suggestion source (Users + Teams) is a major UX win.

**Concerns:**
- **LOW:** J/K navigation (D-18) must ensure that any unsaved changes in the TipTap editor are prompted or auto-saved to prevent data loss.

**Suggestions:**
- Implement "Draft" persistence in LocalStorage for the comment composer.

**Risk Assessment: LOW.**

---

## 05-08-PLAN.md: Board & List Views
**Summary:** Implements the primary Kanban board (DnD, Swimlanes) and List view (Virtual scroll).

**Strengths:**
- TanStack Table/Virtual (D-14) allows the app to scale to 10k+ tasks.
- Methodology-aware UI (D-10) correctly hides/shows features based on Scrum/Kanban choice.

**Concerns:**
- **MEDIUM:** DnD complexity. Dragging between swimlanes (grouped by Assignee) AND columns (Status) requires careful state management in `svelte-dnd-action`.

**Suggestions:**
- Ensure "Blocked" cards (D-20) are visually distinct even in compact mode.

**Risk Assessment: MEDIUM.** UI state complexity with DnD + Virtualization.

---

## 05-09-PLAN.md: Reports Dashboard
**Summary:** Creates 8 LayerChart components and rewrites the reports page to use tRPC.

**Strengths:**
- Monte Carlo forecasting (D-105) provides professional-grade project prediction.
- SSR guards (Pitfall 4) ensure build stability.

**Concerns:**
- **LOW:** Ensure `LayerChart` color tokens (`--chart-1..8`) have sufficient contrast in both light and dark modes.

**Suggestions:**
- Add a "Snapshot Time" to each chart card so users know exactly how recent the data is (D-33 latency).

**Risk Assessment: LOW.**

---

## 05-10-PLAN.md: Gantt & Calendar
**Summary:** Replaces custom SVG/DOM views with specialized libraries (@svar/gantt and @event-calendar).

**Strengths:**
- Inclusion of a pure TypeScript `CriticalPath.ts` module (D-102) makes the logic unit-testable.
- Dependency arrows in Gantt provide high-level planning visibility.

**Concerns:**
- **MEDIUM:** Svelte 5 compatibility. Both libraries are "Svelte 5 ready," but real-world usage with Runes mode and DnD needs thorough verification.
- **LOW:** Ensure `event-calendar` respects the `archived_at` filter.

**Suggestions:**
- Cache the critical path result in a Svelte store to avoid re-computation on every hover/re-render.

**Risk Assessment: MEDIUM.** Risk lies in third-party library integration.

---

## 05-11-PLAN.md: Advanced Filters & Bulk Ops
**Summary:** Power-user wave delivering the Linear-style filter builder and 50+ task bulk operations.

**Strengths:**
- Verified AST round-trip (TSK-13) ensures saved views are durable.
- Transactional bulk updates (D-75) prevent partial state on failure.

**Concerns:**
- **LOW:** The "Select All" checkbox should clarify if it selects "Visible" vs. "All tasks in project."

**Suggestions:**
- Add a keyboard shortcut `Shift+A` to select all tasks in the current filtered view.

**Risk Assessment: LOW.**

---

## 05-12-PLAN.md: Keyboard & Commands
**Summary:** Implements the command palette (Cmd+K) and all remaining keyboard shortcuts.

**Strengths:**
- `tinykeys` (D-67) is a lightweight, reliable choice for chords.
- Duplicate detection on title (D-118) reduces task rot during creation.

**Concerns:**
- **LOW:** Fuzzy search in Command Palette must prioritize "Exact Task ID" (FUL-42) over title matches.

**Suggestions:**
- Add "Recent Tasks" to the empty-state of the command palette for even faster access.

**Risk Assessment: LOW.**

---

## 05-13-PLAN.md: Collaboration & Portfolio
**Summary:** The infrastructure-heavy wave delivering the Yjs WebSocket server and Portfolio visibility.

**Strengths:**
- Auth-protected WebSocket upgrade (D-98) prevents unauthorized CRDT access.
- Resource allocation view (D-96) is essential for organization-level planning.

**Concerns:**
- **HIGH:** Yjs Server Scalability. Running the WebSocket server in-process alongside Hono is fine for local-first but will require a standalone process/scaling strategy for SaaS.
- **MEDIUM:** DB Bloat. Frequent Yjs snapshots can grow the `yjs_snapshots` table quickly.

**Suggestions:**
- **Optimization:** Only snapshot when the document becomes "idle" (no updates for 30s) or on user disconnect.
- **Env Config:** Ensure `FULCRUM_YJS_URL` is correctly documented for Docker/Production environments.

**Risk Assessment: HIGH.** Real-time infrastructure and cross-project data aggregation are the most complex parts of Phase 5.

---

## 05-14-PLAN.md: Three-Surface Parity
**Summary:** Bridges the gap between Web, CLI, and TUI. Adds ASCII charts and threaded comments to terminal surfaces.

**Strengths:**
- `fulcrum report` (D-82) makes analytics data pipeline-friendly.
- TUI ASCII charts (D-87) maintain the "Agent OS" feel in the terminal.

**Concerns:**
- **LOW:** Ensure `asciichart` output respects terminal width and doesn't wrap/break the TUI layout.

**Suggestions:**
- Use a `NO_COLOR` check to provide monochrome ASCII charts for users with limited terminal support.

**Risk Assessment: LOW.**

---

## 05-15-PLAN.md: Final UI & CI Gate
**Summary:** Completion wave delivering the Workflow editor and Automation UI. Runs the final `bun run ci` gate.

**Strengths:**
- Visual Workflow Editor (D-24) provides Jira-grade control with Linear-grade UX.
- Automation templates (D-92) reduce the "Blank Slate" problem for users.

**Concerns:**
- **LOW:** `MEDIUM-07` fix: human UAT is deferred. Ensure that "Success Criteria" are clearly printable from the CLI for the user to verify manually.

**Suggestions:**
- Add a "Project Health Check" button that verifies if all tasks follow the current workflow rules (for retroactively applied rules).

**Risk Assessment: LOW.**

---

## Overall Phase Risk: MEDIUM
The plans are exceptionally detailed and strictly follow the project's architecture (`ARCH-XX`). The primary risks are **Yjs infrastructure stability** (Plan 13) and **Third-party UI library integration with Svelte 5** (Plan 10). The decision to centralize shared file ownership in Plan 06 is an excellent mitigation for development-time conflicts.

**Phase Success Verdict: GO.** The plans comprehensively cover TSK-01 through TSK-14 and satisfy all 123 CONTEXT decisions.

---

## Codex Review

## 05-00-PLAN.md
**Summary:** Wave 0 enforces Nyquist-compliant RED state by creating 10 failing test stubs (6 backend + 4 frontend) before implementation. This is a strong sequencing control step, but test quality and exact scaffolding consistency need tightening.

### Strengths
- Explicitly maps each stub to a requirement ID.
- Uses `bun:test`/`vitest` split matching surface ownership.
- Includes clear fail-fast assertions (`expect(true).toBe(false)`).

### Concerns
- **HIGH:** Frontend actions say “3 frontend files” but execution list includes 4 files; mismatch can create execution drift.
- **MEDIUM:** Stubs are minimal and may pass formatting/lint but not enforce test intent (e.g., no structured test names in some cases).
- **MEDIUM:** Verification commands do not assert file count/content (only existence via `ls`/`rg`), so stub contract may silently miss required assertions.
- **LOW:** No requirement to add test imports/types that mirror real test harness setup (e.g., jsdom for Svelte render tests).

### Suggestions
- Normalize file count to exactly 10 in narrative and tasks.
- Add explicit checklist assertions per file for required test names.
- In Wave 0, enforce lint/format and test-framework compatibility checks in verification.

### Risk Assessment
**MEDIUM** — good scaffold intent, moderate process risk from verification gaps and inconsistent file-counting language.

---

## 05-01-PLAN.md
**Summary:** This is the schema foundation plan, but it is the highest-risk plan because it introduces major DB/API drift across ORM entities, migration DDL, and package footprint in one step.

### Strengths
- Comprehensive migration scope aligned to features.
- Strongly enforces required fields and defaults for workspace metrics + workflow/project settings.
- Adds explicit HIGH-01/02/05 fixes early.

### Concerns
- **HIGH:** Adds `14` packages in acceptance text but says “13 web + 1 root”; potential counting mismatch and dependency governance ambiguity.
- **HIGH:** Raw migration SQL is extensive with multiple new FKs/indexes likely to fail on existing data without backfill/reorder strategy.
- **HIGH:** `task_type` enum/check in migration and service/filters may conflict with existing status/category assumptions if dual naming (Todo vs Unstarted) not reconciled consistently first.
- **MEDIUM:** Installing TipTap versions at exact patch (`3.22.5`) without lockfile/compatibility verification can introduce peer dependency friction.
- **MEDIUM:** `pg_trgm` extension may require elevated privileges on some PostgreSQL SaaS environments.
- **MEDIUM:** No explicit data migration for existing rows (e.g., labels/text defaults, methodology defaults).

### Suggestions
- Add pre-migration smoke script: backup + validation queries for all FK target tables and nullability hazards.
- Clarify exact package count and split install commands with lockfile verification.
- Add compatibility matrix for `TaskStatus` naming conversions between existing and new statuses.
- Add migration rollback notes for production runbook.

### Risk Assessment
**HIGH** — core schema changes drive downstream breakage if sequencing and compatibility checks are not strict.

---

## 05-02-PLAN.md
**Summary:** Creates nine new MikroORM entities and wires barrel exports. This is solid and necessary but has several import/dependency assumptions that can trip compile/runtime if not validated early.

### Strengths
- Explicit entity list aligned with migration tables.
- Correct emphasis on MikroORM decorators, PK defaults, and barrel exports.
- Includes YjsSnapshot as wave-1 requirement.

### Concerns
- **HIGH:** `Project` and `Team` entity references are implied but not guaranteed to be available for all `ManyToOne` relations in current entity layer.
- **MEDIUM:** `OptionalProps` completeness is underspecified for JSON/blob fields and defaults; inconsistency can cause runtime partial hydration bugs.
- **MEDIUM:** No explicit registration strategy for ORM discovery if non-folder-based entity discovery is used.
- **LOW:** `source_task_id`/`target_task_id` for relations should likely be constrained via composite indexes beyond unique constraint for query efficiency.

### Suggestions
- Add compile-time verification for `src/db/mikro-orm.config.ts` entity registration and import paths.
- Add explicit DB index verification list for relationship lookup-heavy queries.

### Risk Assessment
**MEDIUM** — model integrity is good, risk is moderate because of entity graph assumptions.

---

## 05-03-PLAN.md
**Summary:** Introduces comment/watchers/reactions service and router. Functionally rich and well-scoped, but parsing/permission/cascade complexity and transactionality need stricter guarantees.

### Strengths
- Explicit D-100 team mention support and team/user discriminator in parser.
- Good service-router separation and tRPC thin delegation concept.
- Includes comment threading behavior and watcher idempotency.

### Concerns
- **HIGH:** Mention extraction from TipTap JSON can be brittle without schema validation and sanitization before persistence.
- **HIGH:** Delete cascade semantics for comment trees depend on DB `ON DELETE CASCADE`; if not configured uniformly, reply cleanup may fail.
- **MEDIUM:** Team expansion requires team membership model query contracts not defined in plan (no explicit entity/service reference).
- **MEDIUM:** Auto-subscribe from mention parsing can create excessive side effects without dedupe/backpressure.
- **LOW:** Error taxonomy for permission checks and duplicate-watcher writes not defined.

### Suggestions
- Define TipTap schema validator and safe parser boundaries.
- Add explicit transaction wrapper for create/delete/update flows.
- Add service-level dedupe cache for watcher subscription bursts.
- Include tests for malformed TipTap payload and stale team/member references.

### Risk Assessment
**HIGH** — user-generated data, notifications, and cascading comments require stronger correctness controls.

---

## 05-04-PLAN.md
**Summary:** Implements workflow validation and task relationship logic including cycle detection. Correctly identifies HIGH-04 dependency but risks algorithmic and permission edge cases.

### Strengths
- Graph-based workflow read/write mapped to workflow_config and methodology defaults.
- Explicit DFS cycle detection for blocks edges.
- Includes duplicate/relationship handling and recurrence/templating scaffolding.

### Concerns
- **HIGH:** Workflow transition model defaults are inconsistent with entities requiring 5-category status names; explicit state-machine mapping may need migration/alignment.
- **HIGH:** Cycle detection depth cap at 50 may silently skip very deep real DAGs without reporting; better to cap via node count and return diagnostic.
- **HIGH:** Template/recurrence services are large features mixed in same plan and can become unstable if done without service partitioning tests.
- **MEDIUM:** `TaskRelationship` cycle logic across projects/org boundaries relies on task existence checks; race conditions under concurrent writes possible.
- **MEDIUM:** Mark-as-duplicate auto-close/transfer-watchers action needs explicit event emission and audit policy in scope.

### Suggestions
- Add canonical status transition matrix tests for all methodology modes.
- Treat workflow graph updates as optimistic-lock/ETag style operation.
- Split recurrence/template services into separate follow-on tasks or dedicated validation steps.

### Risk Assessment
**HIGH** — core lifecycle logic here affects many features; requires tighter invariants and concurrency-safe logic.

---

## 05-05-PLAN.md
**Summary:** Builds analytics stack and reports router; necessary for TSK-03..06 and workspace scope, but report correctness, performance, and contract drift are high-risk.

### Strengths
- Good end-to-end model: raw events + snapshot cache separation.
- Explicit workspace scope inclusion and CSV export.
- Includes worker trigger and tests for rollup/upsert behavior.

### Concerns
- **HIGH:** Scope aggregation across project vs workspace can double-count if both rows exist; query precedence is unspecified.
- **HIGH:** Throughput/cycle-time from event entities are sensitive to timezone normalization and status vocabulary consistency.
- **MEDIUM:** Worker fan-out/debounce requirement exists but not explicitly specified in handler contract; backpressure risk for high-frequency events.
- **MEDIUM:** `getCycleTime` and `getLeadTime` based on events can produce outliers if events missing; fallback strategy unspecified.
- **LOW:** Tests likely under-specify correctness for empty/no-event tasks and null `dateRange`.

### Suggestions
- Add explicit metric grain, UTC date handling, and dedup rules for event streams.
- Add idempotency keying for rollup writes.
- Define workspace aggregation precedence: workspace snapshot row wins vs derived sum of project rows.

### Risk Assessment
**HIGH** — analytics correctness errors are hard to detect later and can invalidate charts/decisions.

---

## 05-06-PLAN.md
**Summary:** High-impact integration plan owning `router.ts` and `TaskService.ts` is the correct architectural move for conflict control, but it also concentrates risk across many cross-cutting concerns.

### Strengths
- Explicit HIGH-06 conflict resolution by isolating shared files.
- Connects workflows/comments/relationships/reporting automation into app router.
- Extends task transitions, watcher behavior, field dependency, and sprint ops.

### Concerns
- **HIGH:** `TaskService` now depends on multiple services (CommentService, WorkflowService, FieldDependencyRule), creating potential circular dependency and import load/order risks.
- **HIGH:** Field dependency validation inline in TaskService with no abstraction may become unmaintainable once service grows.
- **MEDIUM:** `ensureTaskProjectColumn` removal without audit may break any other legacy callers assuming function.
- **MEDIUM:** Mounting many routers in AppRouter may break route typing and hydration if not sorted and exported correctly.
- **LOW:** Automations route added in task 2 only after task 1 may create temporary compile windows if parallel toolchain runs tasks separately.

### Suggestions
- Add explicit service constructor interface boundaries to prevent circular imports.
- Move field-dependency checks to dedicated helper called by TaskService but in same file now acceptable with TODO boundary.
- Add migration-backed integration tests that instantiate app router and run one end-to-end mutation path.

### Risk Assessment
**HIGH** — central-file ownership is correct but high blast radius; errors here break entire application.

---

## 05-07-PLAN.md
**Summary:** Builds rich task detail interactions and task-centric UI surfaces. Feature-complete intent is strong, but data-contract and cross-surface parity for mention/thread UX need stronger API guarantees.

### Strengths
- Comprehensive UI composition for comment/activity/watchers/custom fields/dependencies.
- Good dual-source mention handling and keyboard UX requirements.
- Uses tRPC queries exclusively (good boundary alignment).

### Concerns
- **MEDIUM:** Threaded comment rendering with TipTap JSON formatting can be expensive per render and may regress performance on long threads.
- **MEDIUM:** MentionSuggestion API for users/teams needs paginated/abortable search to avoid UI jank.
- **MEDIUM:** Activity feed relies on field-change events; if `fieldName/from/to` not reliably populated, UI can show blanks.
- **LOW:** Recurrence popover in task detail referenced, but Plan 07 has no dedicated Recurrence component file ownership in this plan.

### Suggestions
- Add virtualized rendering or pagination for comments+activity in large tasks.
- Define explicit event payload schema shared across backend and UI for audit fields.
- Add a11y/accessibility checks for keyboard nav/aria in panel.

### Risk Assessment
**MEDIUM** — mostly implementation depth risk; contract coupling with backend fields is the key risk.

---

## 05-08-PLAN.md
**Summary:** Introduces board/list/sprint-planning surfaces with DnD and virtualized tables. This is feature-critical but very large UI complexity with performance and state consistency caveats.

### Strengths
- Covers all requested UX axes: DnD, grouping, WIP, density, custom fields.
- Mentions methodology-aware rendering and sprint planning integration.
- Uses dedicated virtualized table and table column customization.

### Concerns
- **HIGH:** `svelte-dnd-action` across statuses + TanStack virtual table can create drag-state desync if not modeled with immutable snapshots.
- **HIGH:** `trpc.tasks.update` called on every drag event can overwhelm API if not debounced/batched.
- **MEDIUM:** Grouping columns with swimlanes requires heavy derived computations; no explicit memoization or caching strategy.
- **LOW:** "max 3 indent levels then flatten" for subtasks appears in comments component but not explicitly here; cross-feature consistency not guaranteed.

### Suggestions
- Add drag update queue + optimistic rollback strategy.
- Define a canonical mapping from methodology to column schemas to avoid duplicated status sets.
- Add perf benchmarks for 10k+ tasks in board/list.

### Risk Assessment
**HIGH** — user-facing complexity and high interaction frequency increase risk of state churn and regressions.

---

## 05-09-PLAN.md
**Summary:** Analytics UI is comprehensive (8 charts + Monte Carlo), but complexity and SSR integration risks are high given chart libraries and date/hover behavior requirements.

### Strengths
- Proper move away from raw SQL reports.
- SSR guard requirement addresses common SSR/client library pitfall.
- Includes tooltips, scope/date controls, forecast capabilities.

### Concerns
- **HIGH:** LayerChart usage with `#if browser` and dynamic import semantics need exact implementation consistency; mismatches can fail SSR builds.
- **HIGH:** Monte Carlo forecast in-chart can become nondeterministic/performance-heavy without fixed iterations/time budget enforcement.
- **MEDIUM:** Color semantics (exact palette) and tooltip assertions in tests are hard to enforce with current shallow tests.
- **LOW:** +page migration removing server DB access requires robust tRPC load pattern adaptation for SvelteKit server/client boundaries.

### Suggestions
- Add deterministic forecast seeding and bounded runtime budget (e.g., max 120ms for 1000 iterations).
- Add contract tests for report endpoints feeding each chart component with empty/sparse datasets.
- Include route-level loading state and error boundaries for missing report scopes.

### Risk Assessment
**HIGH** — chart and SSR behavior is often brittle; needs stricter technical guardrails.

---

## 05-10-PLAN.md
**Summary:** Adds Gantt and Calendar views and critical path algorithm. Architectural intent is good, but algorithm/test/runtime coupling is high.

### Strengths
- Clean separation: pure `computeCriticalPath.ts` + UI adapter.
- Explicit DnD + method hooks for task detail panel integration.
- Adds sprint overlay and overdue highlighting in calendar.

### Concerns
- **HIGH:** Gantt integration with `@svar/gantt-svelte` may require significant data adaptation and may not support full task dependency semantics out of the box.
- **HIGH:** Critical path computed on client can be heavy; cached reactive store requires invalidation strategy under frequent updates.
- **MEDIUM:** Calendar and Gantt tests relying only on rendered HTML may pass despite functional defects.
- **MEDIUM:** Drag-to-reschedule across timezone boundaries likely to introduce off-by-one date bugs.

### Suggestions
- Add unit tests for cycle/non-cycle graph and slack edge cases in critical path module.
- Define canonical date encoding for task start/due with timezone policy.
- Implement task detail open event via strongly typed callback and null-safe project/task guards.

### Risk Assessment
**HIGH** — algorithmic feature with heavy third-party integration and real-time interactions.

---

## 05-11-PLAN.md
**Summary:** Adds filtering, bulk operations, and custom-field coverage; very impactful for productivity but can destabilize data validation and permission boundaries.

### Strengths
- Covers filter AST round-trip and saved-view persistence requirements.
- Enforces 200-task bulk cap and event emission per changed field.
- Explicitly includes all 9 custom field types and label/priority model checks.

### Concerns
- **HIGH:** AST round-trip involving SavedView persistence likely needs schema migration/versioning for backward compatibility.
- **HIGH:** 50+ bulk updates as single transaction can lock rows and impact concurrent users without batching/backoff.
- **MEDIUM:** UI-side filter building across custom-field operators can diverge from backend parser semantics.
- **MEDIUM:** Label model “grouped JSON objects” is non-normalized; concurrent updates to labels can conflict without merge strategy.
- **LOW:** QuickFilters and FilterBuilder interaction contract not clearly defined (single source of filter truth).

### Suggestions
- Add server-side validation of AST operator+field/type compatibility before execution.
- Add optimistic concurrency or batched writes for bulk updates.
- Add conflict-resolution strategy for task.labels JSON arrays (replace vs merge behavior).
- Define canonical serialized AST version field.

### Risk Assessment
**HIGH** — data mutation-heavy features with complex filters are high risk for correctness and performance regressions.

---

## 05-12-PLAN.md
**Summary:** Adds UX keyboard, command palette, and field-dependency logic. Good product value, but command search/security and dependency evaluation coupling need tighter constraints.

### Strengths
- Good user-centric input UX with Cmd+K + help overlay.
- Adds both client-side and server-side dependency validation.
- Recognizes that client validation can be bypassed and adds server counterpart.

### Concerns
- **HIGH:** Command palette search can expose unauthorized entities unless strict org/project filtering is guaranteed at query source.
- **MEDIUM:** tinykeys global binding in root layout can conflict with component-local shortcuts unless scoped/unbound carefully.
- **MEDIUM:** Field dependency evaluation logic duplicated client/server; risk of behavioral divergence.
- **LOW:** `QuickCreateForm` in this plan overlaps task/detail plans and Plan 14 task-hierarchy inputs (potential duplicate implementations).

### Suggestions
- Add explicit “permission-aware suggestion source” contract for command search and task query.
- Introduce shared dependency evaluation utility module to reduce drift.
- Add shortcut namespace and context-aware enable/disable (e.g., inputs/textarea).

### Risk Assessment
**MEDIUM** — broad UX changes with cross-surface security and consistency implications.

---

## 05-13-PLAN.md
**Summary:** Realtime collaboration and portfolio analytics are meaningful but materially increase infra/security scope; sequencing and server lifecycle coupling are critical.

### Strengths
- Correctly prioritizes env-configured Yjs URL and persistence path.
- Adds presence, collaboration fallback, and portfolio scope charts.
- Extends reports via workspace aggregation parity.

### Concerns
- **HIGH:** Yjs WebSocket authentication on upgrade path is complex and easy to regress without robust integration tests.
- **HIGH:** Running Yjs server alongside Hono with shared DB lifecycle and shutdown hooks is operationally risky without clear lifecycle contract.
- **MEDIUM:** Portfolio metrics depend on report snapshots; if snapshots stale, charts mislead and can’t be trusted for SLA decisions.
- **LOW:** Critical collaboration UX (cursors/editor sync) depends on exact TipTap+Yjs extension interop versions; no version pinning strategy stated.

### Suggestions
- Add explicit startup/shutdown integration points with CI smoke boot test.
- Add health endpoint/check for Yjs availability and graceful degradation.
- Add snapshot freshness metadata to portfolio charts.

### Risk Assessment
**HIGH** — real-time infra/security plus analytics correctness compounds risk.

---

## 05-14-PLAN.md
**Summary:** Final parity plan for CLI/TUI command coverage is necessary, but scope breadth is huge and overlaps with prior web-centric plans.

### Strengths
- Explicit parity goals across CLI + TUI for reports, hierarchy, relationships, comments.
- Uses shared tRPC layer for data access rather than raw DB calls.
- Includes ASCII charts and methodology-aware TUI rendering.

### Concerns
- **HIGH:** Plan tries to introduce many CLI commands (`import/export/my-work/archive/relate/comment/task/project`) likely beyond direct WIP scope of this phase milestone if not previously implemented service endpoints exist.
- **HIGH:** Argument parsing complexity (especially identifier parsing `FUL-42`) and recursive hierarchy rendering are non-trivial and likely to break edge cases.
- **MEDIUM:** Mock/stub/TODO scan check insufficient; runtime quality depends on behavior tests not just grep.
- **MEDIUM:** Task tree recursion in CLI across deep hierarchies requires cycle protection.

### Suggestions
- Split CLI plan into sub-waves or defer import/export if service primitives are not yet stable.
- Add identifier resolver service (`resolveTaskIdentifier`) before CLI surface to centralize parsing.
- Add TUI tests (at least unit tests for icon/type rendering and command handling state transitions).

### Risk Assessment
**HIGH** — broad command surface and multiple new command lines at once make regression probability high.

---

## 05-15-PLAN.md
**Summary:** Finalization plan is appropriate for release readiness but overly broad with mixed UI, import wizard, and full CI dependency; execution needs strict sequencing and rollback criteria.

### Strengths
- Completes critical last-mile surfaces (workflow editor, automation management, sprint report card).
- Clear tie-back to methodology and shared service layer.
- Uses `bun run ci` as final gate.

### Concerns
- **HIGH:** Plan depends on many previous deliverables; if any upstream API shape drifts, this plan will fail at integration level.
- **MEDIUM:** Settings pages/import wizard plus report card in same plan may collide with unresolved CLI/TUI parity expectations and inflate debugging surface.
- **LOW:** No explicit fallback/error states for workflow graph save failures, automation action failures, and recurrence config conflicts.

### Suggestions
- Add milestone gate before Plan 15: all 05-00..05-14 summaries/tests must exist and pass specific contract checks.
- Add “feature switches” for workflow editor/automation import if back-end actions unavailable.
- Include rollback/partial-enable strategy for failed automation execution.

### Risk Assessment
**MEDIUM** — final gating is correct, but consolidation risk is high if prior contracts are not fully aligned.

---

## Cross-Plan Global Review Notes
### Strengths overall
- Requirements traceability is unusually explicit with requirement IDs.
- Risk controls are present (HIGH-* fixes, wave designations, summary artifacts).
- Strong bias toward service-first + tRPC-only business logic.
- Good attention to three-surface parity in end-of-phase plans.

### High-level concerns
- **HIGH:** Task hierarchy (`epic/task/subtask/bug`) consistency is defined in many places but appears partially distributed; must enforce centrally in schema + service + CLI/TUI output early.
- **HIGH:** Methodology gating (`scrum/kanban/none`) is pervasive but transition state defaults and UI behavior rely on many implicit mappings (risk of drift).
- **MEDIUM:** Security filtering appears mostly stated, but explicit org-scoping for command palette/CLI imports/portfolio/report queries should be mandated everywhere.
- **MEDIUM:** Dependency ordering is good in docs but some features appear referenced before implementation hooks exist (e.g., recurrence config UI using trpc routes not yet guaranteed).
- **MEDIUM:** Several verification steps are structural (exists/grep) rather than behavioral for critical logic.

### Suggested phase-level improvements
1. Add a formal contract sheet per service/router method before coding (inputs, outputs, errors, org scopes).
2. Add two mandatory integration tests per wave: one shared service path + one cross-surface happy path.
3. Introduce migration/runtime checklist for status enums and workflow defaults before UI-heavy waves.
4. Add explicit CI stage for “parity assertions” to compare web/CLI/TUI supported operation IDs.
5. Enforce no raw SQL remaining outside migration scripts in this phase.

### Overall Risk Assessment
**OVERALL: HIGH**.  
Plan set is comprehensive and structurally organized, but the combined blast radius across schema, service, analytics, UI, CLI, and TUI in one phase is large with many high-risk integrations. The biggest vulnerabilities are schema migration compatibility, waveform-dependent status/workflow consistency, and three-surface parity drift.

---

## Consensus Summary

### Agreed Strengths
- Architecture discipline: all peer-review HIGH blockers (01-06) addressed in Wave 1-3
- Methodology-aware system (scrum/kanban/none) adds immediate project value
- Cycle detection in RelationshipService prevents circular dependency bugs
- TDD stubs (Wave 0) establish failure-first verification baseline
- Three-surface parity consistently maintained across Web/CLI/TUI
- MIT license verification (D-88) for governance compliance

### Agreed Concerns (shared by 2+ reviewers)
- **HIGH: Migration complexity** — 9 new tables + 10 column extensions in single migration. Risk of FK constraint failures on existing data without backfill strategy. Consider splitting into sub-migrations or adding explicit ordering.
- **HIGH: Yjs scalability** — In-process WebSocket server alongside Hono is local-first only. SaaS deployment needs standalone process or horizontal scaling strategy.
- **HIGH: task_type enum conflicts** — New `task_type` check constraint may conflict with existing status/category assumptions if naming (Todo vs Unstarted) not reconciled.
- **MEDIUM: pg_trgm extension privileges** — Some PostgreSQL SaaS (Neon, Supabase) may restrict `CREATE EXTENSION`. Need conditional/fallback strategy.
- **MEDIUM: Verification commands weak** — Multiple plans use `ls`/`rg` file-existence checks instead of behavioral tests. Stubs pass lint but don't enforce intent.
- **MEDIUM: Dependency count mismatch** — "14 packages" vs "13 web + 1 root" creates ambiguity. Count should include shadcn source components or explicitly exclude them.

### Divergent Views
- **Gemini:** Focused on Plan 13 (Yjs/portfolio) as highest risk. Rated it HIGH.
- **Codex:** Focused on Plan 01 (migration) as highest risk. Concerned about data integrity on ALTER TABLE operations with existing rows.
- **Overall:** Both rate Phase 5 as HIGH complexity but achievable with the current wave structure.

### Verdict
**GO with conditions.** The plans are executable if:
1. Migration split strategy is documented (or backfill script added)
2. Yjs deployment strategy is decided (in-process for dev, standalone for prod)
3. pg_trgm fallback is added (graceful degradation if extension unavailable)
