# Phase 5 Cross-Plan Review

> Review generated: 2026-05-05
> Plans analyzed: 00–15 (16 plans across 7 waves)
> Method: 5 parallel persona reviewers, each covering a plan group

---

## Plan 00 — RED Test Stubs

### Summary
Creates 10 RED failing test files (6 backend `bun:test` + 4 frontend `vitest`) with `expect(true).toBe(false)` as RED mechanism. Files co-located with future implementation. Nyquist compliance.

### Strengths
- Test locations match codebase conventions (colocated for services/workers, `tests/db/`, `src/web/tests/vitest/`)
- Each stub names the implementation plan that will turn it GREEN — dependency chain explicit
- `expect(true).toBe(false)` guaranteed to fail until replaced

### Concerns
- **MEDIUM:** VALIDATION.md Wave 0 Gaps lists 9 files but Plan 00 creates 10 (CalendarView.test.ts added during enrichment). Drift between gaps table and artifact list.
- **MEDIUM:** Calendar test references `@event-calendar/core` in description but no import/install exists during RED phase.
- **LOW:** No existing test files in `src/services/` or `src/workers/` — runner glob discovery unverified. Plan doesn't run `bun test <specific-file>` to confirm failure.

### Suggestions
1. Sync VALIDATION.md: update Wave 0 Gaps to include CalendarView.test.ts
2. Add `bun test <file>` to verification steps (confirms runner discovers + fails)
3. Remove library reference from calendar test description or add import comment

### Risk Assessment: **LOW**
Trivial file creation. Only risk is test discovery (glob patterns) and VALIDATION.md drift.

---

## Plan 01 — Schema Foundation

### Summary
Installs 14 npm packages. Creates monolithic Phase 5 migration: ~18 new columns across 5 existing tables, 9 new tables, pg_trgm extension, 7 strategic indexes. Extends 4 entity classes + schemas.ts.

### Strengths
- `add column if not exists` for idempotency
- Check constraints on all enum-like columns
- Partial indexes on nullable columns (WHERE clauses) — correct practice
- pg_trgm GIN index follows PostgreSQL best practices for fuzzy matching
- License verification step (D-88) included

### Concerns
- **HIGH:** `cancelled` → `canceled` status rename: existing rows with `category = 'cancelled'` will fail the new check constraint. Migration must include `UPDATE task_statuses SET category = 'canceled' WHERE category = 'cancelled'` before constraint change.
- **HIGH:** Single monolithic migration with `addSql()` — DDL auto-commits in PostgreSQL. If migration fails partway (table 8 of 9), partial schema with no rollback. Wrap in transactions via `this.execute()` rather than bare `addSql()`.
- **MEDIUM:** `events.field_name/from_value/to_value` overlap with existing `payload jsonb`. Dual-representation risk — future code writes to payload OR to these columns. Add precedence documentation or mutual-exclusion check.
- **MEDIUM:** `yjs_snapshots.state` (bytea) has no retention/compaction strategy. Yjs states grow unbounded. Without compaction plan, table will accumulate large blobs.
- **MEDIUM:** `comment_reactions.emoji varchar(8)` — multi-codepoint sequences (flags, skin-tones) exceed 8 chars. Use `varchar(16)`.
- **MEDIUM:** TaskStatus.ts entity not in files_modified but the check constraint rename affects it.
- **LOW:** GIN index `CREATE INDEX` doesn't use `IF NOT EXISTS` — re-run fails.
- **LOW:** No retention policy for yjs_snapshots.

### Suggestions
1. Add data migration: `UPDATE task_statuses SET category = 'canceled' WHERE category = 'cancelled'` before constraint change
2. Break migration into 2-3 logical chunks wrapped in explicit transactions
3. Document `field_name/from_value/to_value` vs `payload` precedence in Event entity
4. Add `IF NOT EXISTS` to index creation or use guard pattern
5. Increase emoji column to `varchar(16)`

### Risk Assessment: **MEDIUM** (two HIGH concerns)
Data integrity risk from cancelled→canceled rename. Partial-failure risk from monolithic non-transactional migration. Both fixable before execution.

---

## Plan 02 — New Entity Classes

### Summary
9 MikroORM v7 entity classes (TaskComment, TaskWatcher, CommentReaction, TaskRelationship, ProjectAutomation, FieldDependencyRule, YjsSnapshot, TaskTemplate, TaskRecurrenceRule) with Stage-3 decorators. Barrel export updated.

### Strengths
- Follows Sprint.ts/MetricsCache.ts pattern exactly — import paths, decorators, OptionalProps
- Explicit `type` on every `@Property` — Stage-3 compliance
- Correct `@ManyToOne(() => Org, { fieldName, deleteRule: "cascade" })` for org-scoped entities
- Self-referencing FK on TaskComment for threading (D-01)
- Unique constraints on join tables prevent duplicates at DB level
- YjsSnapshot in Wave 1 — HIGH-05 resolved

### Concerns
- **HIGH:** Objective says "7 entities" but plan creates 9 (TaskTemplate + TaskRecurrenceRule added during enrichment). Acceptance criteria text references "7 files" — documentation not updated to 9.
- **MEDIUM:** CommentReaction has NO org FK — queries require 4-join chain (reaction→comment→task→org) for scoping. Security T-05-03 doesn't cover this leak path.
- **MEDIUM:** YjsSnapshot.state typed as ambiguous `Buffer/Uint8Array`. MikroORM bytea hydration expects `Buffer` exactly. Use `Buffer` explicitly.
- **MEDIUM:** TaskRecurrenceRule.cronExpression nullable — but required when triggerType='schedule'. No CHECK constraint enforces this.
- **LOW:** TaskComment.parentCommentId and TaskRelationship.sourceTaskId/targetTaskId use raw uuid `@Property` instead of `@ManyToOne`. DB FKs exist but ORM loses relationship features.

### Suggestions
1. Fix objective text + acceptance criteria: "7" → "9" everywhere
2. Add `@ManyToOne(() => Org)` to CommentReaction OR document explicit decision + add threat model entry
3. Type YjsSnapshot.state as Buffer exactly
4. Use `@ManyToOne(() => Task)` for sourceTaskId/targetTaskId in TaskRelationship

### Risk Assessment: **LOW**
No execution risk. Documentation drift (7 vs 9) and CommentReaction org-scoping gap are clean-up items.

---

## Plan 03 — CommentService + Watchers

### Summary
Full commenting subsystem: CRUD with threading, reactions, resolution, TipTap mention extraction (user vs team discrimination), auto-watch subscription. 10 tRPC procedures via permissionedProcedure.

### Strengths
- Auto-subscribe on author + mentions + team expansion — correct ownership model
- Mention extraction discriminates user vs team via `attrs.type` — defensive
- D-100 team mention fix integrated cleanly into pipeline
- All mutations through permissionedProcedure

### Concerns
- **MEDIUM:** `getThreaded` tree construction — if using naive parent-traversal per comment, O(n²) for 500 comments. Should use `Map<parentId, Comment[]>` single-pass grouping + iterative assembly. Implementation strategy unspecified.
- **MEDIUM:** No max thread depth guard. Depth-100 nesting could overflow stack in recursive builder. Add `MAX_THREAD_DEPTH` (20) and reject at insert.
- **MEDIUM:** TipTalk mention extraction must skip `code_block` and `code_inline` nodes — a mention in code fence is not a real mention. Not mentioned in plan.
- **LOW:** `deleteComment` cascade strategy undefined — soft-delete tombstone? Hard-delete children? If hard-delete, hidden cost.

### Suggestions
1. Specify implementation: `Map<parentId, Comment[]>` single-pass + iterative BFS assembly
2. Add `config.maxThreadDepth = 20` constant — reject deeper nesting
3. Filter code_block/code_inline nodes in extractMentions traversal
4. Document delete strategy (prefer tombstone parent + orphan children as "deleted")

### Risk Assessment: **MEDIUM**
Tree construction and mention edge cases are real bugs at scale. Easy fixes in implementation.

---

## Plan 04 — WorkflowService + RelationshipService

### Summary
WorkflowService reads project.workflow_config for state-machine transitions (methodology-aware: scrum/kanban/none). RelationshipService manages task dependencies with cycle detection. TemplateService + RecurrenceService for competitive gap features.

### Strengths
- Methodology gating clean — 3 modes driven by single column
- BFS/DFS cycle detection with depth cap
- checkCycle before create — correct operation order

### Concerns
- **HIGH:** `validateTransition` with empty/malformed `workflow_config` — if jsonb is `null` or `"{}"`, transition graph = empty set. Silent behavior undefined: reject ALL transitions or allow ALL? Harden: fall back to methodology default, not empty graph.
- **MEDIUM:** Cycle detection depth 50 — standard DFS visited-set is better. Depth cap for performance only, with log warning if exceeded. Current design permits cycles ≥ 51 nodes.
- **MEDIUM:** `updateTransitions` race — two concurrent admin updates to `workflow_config` jsonb can lose one via read-modify-write. No optimistic locking mentioned.
- **LOW:** No `beforeTransition`/`afterTransition` hook points for future side effects (auto-assign, auto-notify).

### Suggestions
1. Add `getDefaultTransitionGraph(methodology)` fallback: if `workflow_config` null/empty/malformed, return methodology hardcoded defaults
2. Replace depth-50 with visited-set cycle detection; keep depth cap as warning-level safeguard
3. Use optimistic concurrency (version column or row lock) on workflow_config writes

### Risk Assessment: **HIGH**
Empty-config fall-open is a real data-integrity issue. If workflow_config ever null/corrupted in prod, ALL methodology enforcement vanishes silently. RelationshipService is solid.

---

## Plan 05 — ReportService + Metrics Worker

### Summary
Two-layer analytics: Event entities (verb: task.status_changed) + MetricsCache snapshots. 13+ query methods. Background rollup worker with EventBus trigger + nightly catchup. Workspace-scoped aggregation.

### Strengths
- Two-layer architecture (raw events + materialized cache) is correct for analytics
- EventBus-triggered + nightly catchup provides freshness + reliability
- CSV export as mutation (not query) — appropriate for large datasets
- Stale issues and blocked items queries add real value beyond basic metrics

### Concerns
- **HIGH:** CycleTime when task never explicitly "started" (Kanban). If no started event found, computation produces `(Done_Time - NULL)` or 0 — silently corrupt metrics. Must detect missing start: use creation date as proxy + flag "estimated" in metadata.
- **MEDIUM:** Metrics rollup worker race — EventBus trigger + nightly catchup overlap both computing and upserting MetricsCache. No idempotency key or advisory lock. Lost updates possible. Use `ON CONFLICT DO UPDATE` with generation counter or pg_advisory_lock.
- **MEDIUM:** Workspace aggregation across mixed methodologies — burndown for Kanban project doesn't make sense. Add methodology filter or per-project scoping.
- **MEDIUM:** Plan 05 depends on Plan 06 for `router.ts` mount (reportsRouter import). If Wave ordering shuffled, no import target. Need stub or clearer dependency contract.
- **LOW:** getBurndown without sprint context — burndown over arbitrary date range shows trend, not sprint progress. Needs sprint start/totalPoints to be meaningful.

### Suggestions
1. CycleTime: implement `findEffectiveStart(taskId, events)` — last event before first 'started-category' state; if none, fall back to `task.createdAt` with `estimated: true` flag
2. MetricsCache upsert: use `INSERT ... ON CONFLICT (scope_type, scope_id, date) DO UPDATE` with advisory lock
3. Workspace reports: add methodology filter parameter to avoid mixing incompatible methodologies
4. Add formal Plan 05→Plan 06 dependency — create stub router file Plan 05 can import until Plan 06 is implemented

### Risk Assessment: **HIGH**
CycleTime with missing start is silent data-quality bug. Worker race solvable but ignored until corrupts production cache. Plan 06 router dependency not formalized.

---

## Plan 06 — Integration Hub

### Summary
Mounts all Phase 5 routers in AppRouter (exclusive ownership — HIGH-06). Extends TaskService (transition validation, watcher subscribe, startedAt, field events, inline field dependency validation). Extends SprintService (capacity, close disposition, retro). Creates AutomationService (rule evaluation, 8 action types, cycle depth 5, 4 templates, CRUD).

### Strengths
- Task ordering: automationsRouter imported/mounted in Task 2 AFTER file creation — eliminates compile-time missing-file risk
- Explicit `depends_on: [03, 04, 05]` — correct ordering with Wave 2 services
- Exclusive ownership of shared files (router.ts, TaskService.ts) — HIGH-06 resolved
- Cycle detection at depth 5 with log warning — explicit DoS mitigation

### Concerns
- **HIGH:** Dual `reportsRouter` path risk. Plan 06 imports from `../server/trpc/routers/reports.ts` but `router.ts` currently imports from `./routers/reports.ts`. If Plan 05 creates at server path, two conflicting exports. Need to verify single source of truth.
- **HIGH:** FieldDependencyService refactoring handoff. Plan 06 uses inline `em.find(FieldDependencyRule)` with note "DO NOT import FieldDependencyService (Plan 12 creates it and refactors)". No cross-plan TODO marker in source. If Plan 12 misses this refactoring step, TaskService keeps inline code forever.
- **MEDIUM:** AutomationService lifecycle unspecified — instantiated where? Wired to EventBus how? Constructor args from DI? No reference to `main.ts` or DI container pattern.
- **MEDIUM:** Sprint.close `closedSummary` jsonb schema undefined. Plan references migration column but doesn't spec the JSON shape that services will read/write.
- **LOW:** WorkflowService.validateTransition signature assumed from Plan 04 — no cross-plan signature validation.

### Suggestions
1. Add `// TODO(plan-12): refactor inline FieldDependencyRule em.find into FieldDependencyService` comment in TaskService.ts
2. Specify AutomationService lifecycle: `startAutomationWorker(em, eventBus)` exported function, called from Hono startup
3. Document closedSummary schema: `{ completedPoints, completedTasks, carriedOverPoints, rolloverDisposition, closedAt, velocity }`
4. Resolve reportsRouter import path — pick one path

### Risk Assessment: **MEDIUM**
Dependency ordering correct. Exclusive file ownership correct. Main risk: FieldDependencyService refactoring handoff (Plan 06 → Plan 12) and dual reportsRouter path confusion.

---

## Plan 07 — Web UI: Task Detail Panel

### Summary
5 Svelte components: TaskDetailPanel (12-section right panel), ActivityFeed, WatcherList, TaskComments (TipTap threaded), MentionSuggestion (dual source). Depends on Plan 06.

### Strengths
- Keyboard nav J/K/Esc — preserves list context, Linear-style UX
- Dual-source mentions with type discriminator — matches CommentService contract
- Max 3 indent levels then flatten — prevents deep nesting hell
- Threat model includes XSS via TipTap JSON

### Concerns
- **HIGH:** 12 sections is scope creep risk for first pass. Sections 10 (archive), 11 (recurrence), 12 (blocked-by) reference competitive gap features (D-114, D-116, D-123). Core D-17 defines 7 sections. Adding 5 bonus sections inflates delivery.
- **HIGH:** MentionSuggestion queries org members on EVERY keystroke after `@`. No debouncing, no minimum query length, no caching. With 500+ members + 50+ teams, that's 10-20 API calls per mention search.
- **MEDIUM:** `@tiptap/extension-mention`, `@tiptap/extension-task-list`, `@tiptap/extension-placeholder` NOT in package.json. Existing custom `editor/mention.ts` may conflict. Need to decide: extend custom or install new package.
- **MEDIUM:** TipTap JSON→HTML rendering infrastructure missing. Comments send TipTap JSON to server and render it. Reverse rendering (JSON→HTML) requires `@tiptap/html` or a custom renderer. Not mentioned.
- **MEDIUM:** Custom fields editable section — 8+ field types with different input widgets. No reusable component pattern referenced.

### Suggestions
1. Cut sections 10-12 from first pass. Ship 9-core panel. Move archive/blocked-by/recurrence to later plans.
2. Add 300ms debounce + 2-char minimum to MentionSuggestion. Cache results per session.
3. Resolve TipTap mention extension choice: extend existing custom `editor/mention.ts` or install `@tiptap/extension-mention`
4. Add TipTap JSON→HTML render step — either `@tiptap/html` or `starter-kit.getHTML()`

### Risk Assessment: **MEDIUM**
Scope creep (12 sections) biggest risk. TipTap dependency gap and mention performance are manageable but need resolution before implementation.

---

## Plan 08 — Web UI: Board + List + Sprint Planning

### Summary
5 Svelte components: TaskBoard (svelte-dnd-action DnD, grouping, WIP limits, methodology-aware), TaskCard (compact/comfortable, blocked badge, hierarchy indicators), TaskListView (TanStack Table, virtual scroll, inline edit, custom fields), SprintPlanningTray (scrum-only), WipLimitIndicator.

### Strengths
- Methodology-aware rendering explicitly defined — scrum vs kanban vs none behaviors documented
- svelte-dnd-action cross-container DnD already proven in existing BoardColumn.svelte
- Existing KanbanBoard.svelte serves as structural template — builds on proven patterns
- WIP limit color thresholds match SprintService capacity bar colors — consistent UX language

### Concerns
- **HIGH:** `@tanstack/svelte-table` + `@tanstack/svelte-virtual` NOT in package.json. Plan action steps don't include `bun add`. These are new deps for Plan 08.
- **HIGH:** Board column performance — no virtualization. svelte-dnd-action tracks each card as DOM element. A single column with 200+ tasks (e.g., Backlog) will degrade. No pagination or lazy loading per column.
- **MEDIUM:** Methodology detection depends on Plan 04's `workflowsRouter.getMethodology` procedure existing. No graceful degradation if procedure 404s. Default to 'none' on error.
- **MEDIUM:** SprintPlanningTray scrum-only gating implies cross-component DnD coordination (tray ↔ board shared type + onFinalize). Not documented. Existing backlog↔sprint DnD pattern exists but needs explicit coordination point.
- **MEDIUM:** "Up to 2 custom field values (configurable per board)" — config implies persistence. Plan doesn't specify WHERE (SavedView? Board config entity?).
- **LOW:** Type filter "All | Epics | Tasks | Bugs" excludes Subtasks. Inconsistency with 4-type enum.

### Suggestions
1. Add `bun add @tanstack/svelte-table @tanstack/svelte-virtual` to Task 2 action steps
2. Add column-level virtualization or pagination for >100-task columns
3. Default methodology to `'none'` when getMethodology procedure unavailable
4. Document cross-component DnD: shared `type: "task"` + coordinated onFinalize between SprintPlanningTray and TaskBoard
5. Reduce "up to 2 custom fields" — show all or make it local-only toggle
6. Include Subtask in type filter or document exclusion

### Risk Assessment: **HIGH**
Missing TanStack deps and board column performance at scale are the biggest risks. Methodology gating depends on Plan 04 delivering router procedure. Cross-component DnD underspecified.

---

## Plan 09 — Reports Charts

### Summary
8 LayerChart components (all with SSR guards, tooltips, CSS color tokens), Monte Carlo ForecastChart (1000 iterations client-side), reports page rewrite from raw SQL to tRPC, 2 chart tests GREEN.

### Strengths
- Explicitly addresses Pitfall 1 (openProductDb → tRPC migration)
- Date picker with presets + custom range (D-55)
- CSV export per chart (D-54) and chart drill-down (D-59)
- Monte Carlo correctly scoped client-side — pure math, ~10ms

### Concerns
- **MEDIUM:** Plan 09 depends on Plan 06 (`depends_on: [06]`) but tests need Plan 00 stubs. Implicit dependency on Plan 00 not modeled in DAG.
- **MEDIUM:** SSR guard pattern inconsistency across 8 components — some use `{#if browser}`, some use dynamic import. Pick one pattern (dynamic import preferred — keeps LayerChart out of SSR bundle entirely).
- **LOW:** Monte Carlo 1000-iteration latency claim ~10ms — realistic for 30-90 data points. If throughputHistory has 1000+ entries, could be ~100ms. No loading skeleton.

### Suggestions
1. Normalize SSR guard to dynamic import only — eliminates pattern drift
2. Add `depends_on: [00]` to Plan 09 frontmatter for modeling accuracy
3. Add loading/placeholder state for chart mount period (tRPC query → LayerChart render)

### Risk Assessment: **LOW**
Well-researched plan. Monte Carlo performance acceptable. tRPC migration explicitly addressed. Lowest risk of all Wave 4 plans.

---

## Plan 10 — Gantt + Calendar

### Summary
CriticalPath.ts (topological sort + forward/backward pass), GanttView (SVAR Gantt + dependency arrows + critical path + slack), CalendarView (event-calendar + sprint overlay + overdue highlights). Both tests GREEN.

### Strengths
- CriticalPath.ts pure TypeScript — unit-testable by design
- Algorithm handles DAG with multiple roots correctly (Kahn's works for any DAG)
- Slack/buffer visualization (D-104) included — many Gantt tools miss this
- Drag-to-reschedule mutation validation in threat model (T-05-22)
- Explicit callout to study existing TaskTimeline + TaskCalendar before replacing

### Concerns
- **HIGH:** Neither `@svar/gantt-svelte` nor `@event-calendar/core` validated against Svelte 5.55.2 + Vite 8. Research flags as ASSUMED (LOW confidence). If SVAR fails on import, Gantt feature has no path forward within this plan's scope.
- **MEDIUM:** GanttView render tests need tRPC mocking — undocumented pattern in this codebase. Project uses `permissionedProcedure` everywhere. Mock infrastructure doesn't exist yet.
- **MEDIUM:** Calendar sprint overlay rendering approach unspecified. Does `@event-calendar/core` support custom background overlays natively? If not, non-trivial custom feature.
- **LOW:** GanttView test assertions weak — `container.innerHTML.length > 0` proves something rendered, not the right thing. Test for SVG elements, `.critical` CSS class, arrow paths.

### Suggestions
1. Add Task 0: install SVAR + event-calendar, run `bun run build`, verify no SSR errors BEFORE proceeding
2. Document tRPC mock pattern for component tests — vi.mock() or inject data as props
3. Verify event-calendar sprint overlay support via upstream docs before implementation
4. Strengthen GanttView test assertions: test for SVG paths, `.critical` class, dependency arrow elements

### Risk Assessment: **MEDIUM**
Library compatibility is the biggest risk — two unverified deps central to deliverables. Mitigated by existing custom implementations (TaskTimeline, TaskCalendar) as contingency.

---

## Plan 11 — Filter Builder + Bulk Actions

### Summary
FilterBuilder (shadcn chips + custom fields), QuickFilters (6 presets), BulkActionBar (max 200, all actions), BulkCustomFieldEdit (9 types), extended tests (50+ bulk, custom fields, labels, priority).

### Strengths
- Bulk transaction: single `em.flush()` with all-or-nothing (D-75)
- Bulk event dedup via `affected_task_ids` array (D-76)
- Max 200 enforcement with tooltip UX
- 9 custom field types round-trip verified (D-77/D-78)
- Label group + priority ordering tested (MEDIUM-04/05)

### Concerns
- **HIGH:** AND/OR combinator requires extending existing SavedViewQuerySchema — no combinator field exists, `compileSavedViewQuery` wraps all in `$and`. Adding combinator changes schema consumed by other features (saved views, search). Not documented as cross-plan change.
- **MEDIUM:** Labels with groups: plan states "No label_groups table" but D-79 requires group browsing. Without label_groups table, FilterBuilder must scan ALL project tasks to discover distinct groups — O(N) per project, poor scaling.
- **MEDIUM:** Priority None(4) vs null — Task entity defaults to `priority: number | null = null`. If null coexists with 4, there are two "no priority" states. Need migration: change default from null to 4, update existing nulls.
- **LOW:** Custom field type "checkbox" doesn't exist yet in CUSTOM_FIELD_TYPES (only 8 types). Plan says 9 types but checkbox needs: schema change, migration, seed updates, test additions.
- **LOW:** Filter AST round-trip test depends on SavedView tRPC router + entity — not standalone. If Plan 06 not ready, test can't run.

### Suggestions
1. Define AST combinator extension explicitly: add `combinator: z.enum(["AND", "OR"])` to SavedViewQuerySchema, update compileSavedViewQuery, document cross-plan impact
2. Add lightweight label_groups table OR accept O(N) scan + document performance tradeoff
3. Normalize priority: change Task default from null to 4, add migration for existing nulls
4. Add `checkbox` to CUSTOM_FIELD_TYPES explicitly — this is a schema change, not just a test
5. Structure bulk 55-task test with in-memory PGlite (existing pattern) — avoids env coupling

### Risk Assessment: **MEDIUM**
AND/OR combinator requires changes to shared module (src/filters/ast.ts) consumed beyond this plan. Label group model internally inconsistent. Priority enum needs migration.

---

## Plan 12 — Keyboard Shortcuts + Field Dependencies

### Summary
Cmd+K command palette (shadcn Command), 14 tinykeys bindings (D-67), help overlay, QuickCreateForm (template picker, pg_trgm duplicate detection), field dependencies (client eval + server validation + config UI). Wave 5.

### Strengths
- QuickCreateForm stays open for rapid multi-create (Linear-style UX win)
- Template picker integrated at create time
- Server-side field dependency validation explicitly described (HIGH-03)
- Cleanup function returned from KeyboardShortcuts — no memory leaks

### Concerns
- **HIGH:** `trpc.tasks.findSimilar` procedure DOES NOT EXIST in any plan. Plan 12 calls `trpc.tasks.findSimilar.query()` but no plan (00-15) creates this tRPC procedure or TaskService.findSimilar method. Plan 01 adds pg_trgm + GIN index but no surface for it.
- **MEDIUM:** FieldDependencyService ordering gap. Plan 06 uses inline `em.find(FieldDependencyRule)` to avoid importing non-existent service. Plan 12 creates FieldDependencyService but has NO refactoring task to wire it into TaskService.create/update. Inline code stays forever.
- **MEDIUM:** QuickCreateForm context pre-fill from route is overconstrained. Keyboard shortcurts mount in root layout — no access to "board column hovered" state. Status/assignee context pre-fill needs a shared store, not route detection.
- **LOW:** QuickCreateForm `findSimilar` has no AbortController — stale responses on rapid typing
- **LOW:** FieldDependencyEval receives `Record<string, unknown>` but IDs vs display-name mapping undefined

### Suggestions
1. Add `trpc.tasks.findSimilar` to Plan 06 (TaskService extensions) or Plan 12 — preferably Plan 06 since it owns TaskService
2. Add explicit refactoring step to Plan 12: "Replace inline `em.find(FieldDependencyRule)` in TaskService with `FieldDependencyService.validate(orgId, projectId, fieldValues)`"
3. Use Svelte writable store (`currentCreationContext`) for QuickCreateForm pre-fill — board/list views update store on hover, keyboard handler reads from store
4. Add AbortController on debounce for findSimilar calls

### Risk Assessment: **MEDIUM**
Missing `findSimilar` procedure guarantees runtime crash on duplicate detection. FieldDependencyService ordering gap means service created but never wired. QuickCreateForm keyboard context pre-fill overconstrained. All fixable.

---

## Plan 13 — Real-time Collaboration + Portfolio

### Summary
Yjs WebSocket server (auth + persistence), TipTap collaborative editor with cursor presence, portfolio dashboard (progress/health table), 4 analytics charts (age/scope/workload/resource allocation). Wave 5.

### Strengths
- Auth on WebSocket upgrade — not after connect (genuine security)
- FULCRUM_YJS_URL env var — no hardcoded localhost (MEDIUM-08 fix)
- Graceful fallback to non-collab mode if WebSocket fails
- YjsSnapshot entity in Wave 1 (Plan 02) — persistence layer ready before server
- Portfolio health computed from velocity trend — useful signal

### Concerns
- **MEDIUM:** WebSocket auth mechanism underspecified. Cookie extraction from WS upgrade requires parsing `Sec-WebSocket-Key` + Cookie header manually. Session validation against same JWT as Hono? Token refresh during active session?
- **MEDIUM:** Yjs server on separate port (default 1234). No CORS/same-origin policy. `getYjsUrl()` returns `ws://localhost:1234` — fine for dev but production needs `wss://` + host resolution. Config expectations undocumented.
- **LOW:** 5s persistence debounce — up to 5s of edits lost on crash. Acceptable but undocumented.
- **LOW:** No awareness stale-timeout cleanup. Tab closes without clean WS disconnect → presence indicator lingers. Add 30s timeout.
- **LOW:** Portfolio health thresholds undefined — "green/amber/red based on velocity trend" but no definition of trend computation (2-sprint? 3-sprint? threshold values?).

### Suggestions
1. Document explicit auth flow: WS upgrade → parse Cookie → extract session JWT → validate against same auth middleware as Hono
2. Add production config documentation: FULCRUM_YJS_URL should use `wss://` in production. Recommend nginx reverse proxy to avoid separate port.
3. Add 30s awareness stale timeout to PresenceIndicators
4. Define portfolio health thresholds: green = >80% velocity, amber = 50-80%, red = <50%

### Risk Assessment: **MEDIUM**
Auth integration highest risk — if cookie extraction from WS upgrade wrong, collab feature is either insecure (no auth) or broken (all connections rejected). Separate port needs production config awareness.

---

## Plan 14 — CLI + TUI Parity

### Summary
9 CLI commands (report 12 types, task-relate, task-hierarchy, comment threaded, project-config, import/export, my-work, archive/restore) + TUI enhancements (ASCII charts, methodology-aware tabs, hierarchy/threading, board adaptation, My Work screen). Three-surface parity delivery.

### Strengths
- Comprehensive CLI coverage — all task surfaces accessible from terminal
- Three-surface parity explicit in must_haves
- 12 report types support pipeline-friendly stdout
- `--dry-run` for import — safe exploration
- TUI task type icons + box-drawing tree chars — good visual hierarchy
- TUI ReportsScreen methodology-aware tabs (scrum=4, kanban=3, none=2)

### Concerns
- **HIGH:** `plainTextToTipTap(text)` utility referenced but NOT DEFINED anywhere in any plan. CLI comment add will crash or store plain text in TipTap JSON field that web UI can't render. Must create this utility.
- **MEDIUM:** Task hierarchy tree hard-capped at 3 levels. 4 task types (epic→task→subtask→?) supports 4-level hierarchies. Should support arbitrary depth with pagination indicator.
- **MEDIUM:** report.test.ts only tests 5 of 9 commands. Thin coverage for large surface area.
- **MEDIUM:** TUI ReportsScreen methodology detection not reactive — no re-fetch on project switch. If TUI supports switching projects, tabs stale until manual refresh.
- **MEDIUM:** TUI data via same tRPC as web — latency with large datasets on terminal could be problematic.
- **LOW:** CLI import token storage undefined — env var or config file?
- **LOW:** `my-work.ts` urgency thresholds undefined — what is "LATER"? (>7 days? no due date?)

### Suggestions
1. Create `plainTextToTipTap(text)` utility alongside CLI comment command. Simple mapping: each line → paragraph node with text content.
2. Remove 3-level cap — implement recursive fetch with depth control + "N more levels" indicator
3. Add methodology re-fetch on project switch in ReportsScreen: reactive `$: if (projectId) fetchMethodology(projectId)`
4. Add tests for all 9 CLI commands — not just the 5 current tests
5. Prefer env vars over interactive prompts for import tokens

### Risk Assessment: **MEDIUM**
`plainTextToTipTap` is a hard blocker — CLI comment add crashes without it. 3-level hierarchy cap arbitrary and contradicts 4-type system. Test coverage thin for 9-command surface.

---

## Plan 15 — Final UI + CI

### Summary
WorkflowEditor (visual transition graph), AutomationRuleList (trigger/condition/action builder), settings routes (workflow/automations/import), RecurrenceConfig, SprintReportCard, final `bun run ci` gate. Wave 6 (sink plan).

### Strengths
- WorkflowEditor in 5-category columns — known UX from Jira/GitHub
- Default workflow reset button — easy to undo mistakes
- Automation templates (4 predefined) reduce cold-start friction
- SprintReportCard renders retro notes as read-only TipTap
- Final CI verification as explicit gate

### Concerns
- **HIGH:** Wave 6 dependency chain: Plan 15 depends on ALL of [07,08,09,10,11,12,13,14]. Any failure in earlier waves blocks Plan 15. Critical path = longest of 8 preceding plans. This is a hard serialization at phase end.
- **MEDIUM:** WorkflowEditor visual rendering approach underspecified. "Visual node-edge diagram" with "directed arrows between nodes" — HTML/CSS? SVG? Canvas? Positioning + arrow routing requires graph layout library (dagre, cytoscape). Without declared approach, this is significant UI challenge.
- **MEDIUM:** AutomationRuleList add form not decomposed — single component has: 7 trigger types, condition builder, 8 action types with per-action config, 4 templates. Should be `AutomationTriggerPicker` + `AutomationConditionBuilder` + `AutomationActionConfig` sub-components composed by `AutomationRuleForm`.
- **MEDIUM:** SprintReportCard "task status timeline" requires Event data with `field_name='status'` from Plan 06 D-34. Pre-migration tasks have no history → status timeline empty. Need fallback documentation.
- **LOW:** Import settings page "field mapping preview" ≈ small ETL UI. If basic (auto-map by name), doable. If full-featured (type coercion, transformation rules), scope creep risk.

### Suggestions
1. Use dagre (`@dagrejs/dagre`, 3KB gzipped) for WorkflowEditor node positioning. SVG `<path>` with marker-end for arrows. Edit mode via checkboxes overlaid on edges — no custom layout math.
2. Decompose AutomationRuleList add form into 3 sub-components. Add to files_modified and task actions.
3. SprintReportCard fallback: if no event history data, derive from current status only → show "(no history)" note for pre-migration tasks
4. Consider sprint merge window — Plan 15 sub-components can start as soon as their specific dependencies complete (e.g., SprintReportCard depends on Plan 13, not Plan 14 CLI)

### Risk Assessment: **HIGH**
Sink plan — every preceding plan must complete first. WorkflowEditor visual rendering is highest implementation risk (graph layout + arrows + edit mode + save). AutomationRuleList complexity manageable with decomposition. CI gate is correct and necessary.

---

## Cross-Cutting Findings

### Integration Gaps Summary

| # | Gap | Severity | Plans | Fix |
|---|-----|----------|-------|-----|
| 1 | `cancelled→canceled` data migration in Plan 01 | **HIGH** | 01 | Add UPDATE before constraint change |
| 2 | Monolithic non-transactional migration | **HIGH** | 01 | Break into chunks with explicit transactions |
| 3 | `workflow_config` empty/missing fallback | **HIGH** | 04 | Fall back to methodology default |
| 4 | CycleTime missing start (Kanban) | **HIGH** | 05 | Proxy start detection + "estimated" flag |
| 5 | `trpc.tasks.findSimilar` procedure missing | **HIGH** | 12 | Add to Plan 06 or Plan 12 |
| 6 | `plainTextToTipTap` utility missing | **HIGH** | 14 | Create utility alongside comment CLI |
| 7 | Missing TanStack deps in Plan 08 | **HIGH** | 08 | Add `bun add` steps |
| 8 | Board column performance (no virtualization) | **HIGH** | 08 | Add per-column pagination/virtualization |
| 9 | SVAR/event-calendar Svelte 5 compat unverified | **HIGH** | 10 | Add Task 0: install + build test |
| 10 | AND/OR combinator schema change unplanned | **HIGH** | 11 | Define schema extension explicitly |
| 11 | FieldDependencyService never wired into TaskService | MEDIUM | 06,12 | Add refactoring task to Plan 12 |
| 12 | CommentReaction no org FK | MEDIUM | 02 | Add org FK or document decision |
| 13 | `getThreaded` implementation strategy unspecified | MEDIUM | 03 | Use Map<parentId> single-pass |
| 14 | TipTap mention skip code_block | MEDIUM | 03 | Add code block filter to extraction |
| 15 | Metrics worker race / idempotency | MEDIUM | 05 | Use ON CONFLICT + advisory lock |
| 16 | Workspace cross-methodology aggregation | MEDIUM | 05 | Add methodology filter param |
| 17 | Dual reportsRouter path confusion | MEDIUM | 06 | Verify single import path |
| 18 | TipTap mention extension choice | MEDIUM | 07 | Extend custom or install new |
| 19 | TipTap JSON→HTML renderer missing | MEDIUM | 07 | Add @tiptap/html or custom |
| 20 | Plan 08 methodology graceful degradation | MEDIUM | 08 | Default to 'none' on 404 |
| 21 | Cross-component DnD coordination | MEDIUM | 08 | Document shared type + onFinalize |
| 22 | Label groups: no table for D-79 | MEDIUM | 11 | Add label_groups or accept O(N) |
| 23 | Priority None(4) vs null | MEDIUM | 11 | Migration: null→4 |
| 24 | QuickCreateForm context overconstrained | MEDIUM | 12 | Use shared store instead of route |
| 25 | Yjs WebSocket auth mechanism underspecified | MEDIUM | 13 | Document cookie extraction flow |
| 26 | Hierarchy cap 3 levels arbitrary | MEDIUM | 14 | Remove cap, add depth indicator |
| 27 | TUI methodology not reactive | MEDIUM | 14 | Add $: re-fetch on project switch |
| 28 | WorkflowEditor rendering approach unspecified | MEDIUM | 15 | Use dagre + SVG arrows |
| 29 | AutomationRuleList not decomposed | MEDIUM | 15 | Split into 3 sub-components |
| 30 | SprintReportCard timeline empty for pre-migration | MEDIUM | 15 | Add "(no history)" fallback |

### Dependency Graph Issues
```
Plan 00 (Wave 0) ──> Plan 03 (Wave 2) ──> Plan 06 (Wave 3) ──> Plan 07-10 (Wave 4) ──> Plan 11-13 (Wave 5) ──> Plan 14-15 (Wave 6)
Plan 01 (Wave 1) ─┘                              │                │
Plan 02 (Wave 1) ─────────────────────────────────┘                │
                                                                    │
Plan 04 (Wave 2) ─────────────────────────────────> Plan 06        │
Plan 05 (Wave 2) ─────────────────────────────────> Plan 06        │
                                                                    │
Plan 09 (Wave 4) ───────────────────> implicit dep on Plan 00 (not modeled)
Plan 12 (Wave 5) ───────────────────> missing findSimilar (gap)
Plan 14 (Wave 6) ───────────────────> missing plainTextToTipTap (gap)
Plan 15 (Wave 6) ───────────────────> depends on ALL Wave 4-5 plans (critical path)
```

### Three-Surface Parity Gaps

| Feature | Web | CLI | TUI | Parity |
|---------|-----|-----|-----|--------|
| Task ID (D-112) | ✅ Plans 07,12 | ✅ Plan 14 | ✅ Plan 14 | Full |
| Archive (D-114) | ✅ Plans 07,11 | ✅ Plan 14 | ✅ Plan 14 | Full |
| My Work (D-119) | ✅ Plan 11 | ✅ Plan 14 | ✅ Plan 14 | Full |
| Export (D-120) | ✅ Plan 11 | ✅ Plan 14 | ❌ Not mentioned | Partial |
| Import (D-121) | ✅ Plan 15 | ✅ Plan 14 | ❌ Not mentioned | Partial |
| Hierarchy | ✅ Plan 07 | ✅ Plan 14 | ✅ Plan 14 | Full |
| Threading | ✅ Plan 03,07 | ✅ Plan 14 | ✅ Plan 14 | Full |
| Methodology | ✅ Plan 04,08 | ✅ Plan 14 | ✅ Plan 14 | Full |
| Recurrence (D-116) | ✅ Plan 07,15 | ❌ Not mentioned | ❌ Not mentioned | Web-only |
| Field deps (D-109) | ✅ Plan 12 | ❌ Not mentioned | ❌ Not mentioned | Web-only |
| Templates (D-115) | ✅ Plan 12 | ❌ Not mentioned | ❌ Not mentioned | Web-only |

### Top 5 Execution Blockers (fix before proceeding)
1. **Plan 01:** cancelled→canceled data migration step + chunk migration into transactions
2. **Plan 04:** workflow_config empty/missing fallback to methodology defaults
3. **Plan 12:** Create `trpc.tasks.findSimilar` procedure (add to Plan 06)
4. **Plan 14:** Create `plainTextToTipTap` utility
5. **Plan 06+12:** Add explicit FieldDependencyService refactoring handoff step

### Overall Phase 5 Risk Assessment: **MEDIUM-HIGH**

The plans are comprehensive and well-structured with clear dependencies, threat models, and verification steps. However, 10 HIGH-severity integration gaps exist, most of which are missing procedures or data migration steps rather than architectural flaws. The critical path through Plan 15 (sink plan dependent on all 8 preceding plans) and the WorkflowEditor visual rendering risk are the highest execution risks.

If the top 5 blockers are fixed before Wave 1 execution begins, the remaining risks are manageable at MEDIUM. Without these fixes, three features (duplicate detection, CLI comments, workflow enforcement) will have runtime failures.
