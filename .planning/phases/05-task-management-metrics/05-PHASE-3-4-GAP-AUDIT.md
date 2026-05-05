# Phase 3 + 4 Gap Audit for Phase 5

**Audited:** 2026-05-05
**Purpose:** Identify real implementation gaps in Phase 3/4 that affect Phase 5 task management targets.
**Method:** Direct file reads of production code. No test output, no docs claims.

---

## Verdict Summary

| Gap | Phase | Blocks Phase 5? | Fix Location |
|-----|-------|----------------|--------------|
| G-01: `tracker.ts` labels always empty | Phase 3 | YES — automation trigger `task.label_added` won't fire from Symphony dispatch | Phase 5 plan adds labels to Task entity + tracker |
| G-02: `TASK_STATUS_CATEGORIES` missing `backlog` | Phase 3 | YES — D-22 adds `backlog`; tracker adapter hardcodes `READY_TASK_STATUS = "ready"` which must stay compatible | Phase 5 migration |
| G-03: No `isBlocked()` service method | Phase 3 | YES — D-89 automation "blocked items" and dispatch eligibility need this | Phase 5 adds to TaskService |
| G-04: Orchestrator does NOT publish to EventBus on run state change | Phase 3 | YES — D-89..D-91 automations subscribe to `agent_run.started/completed`; no such event emitted | Add publish call in orchestration tRPC dispatch or orchestrator |
| G-05: `task_relationships` entity does not exist | Phase 3/5 boundary | YES — tracker adapter currently reads `Task.blockedByIds` (text array); D-19 replaces with normalized entity; if Phase 5 adds `task_relationships` without updating tracker, two representations diverge | Phase 5 migration must also update `fetchBlockerStatusById` in tracker.ts |
| G-06: Router `TaskFacts` has no `labels` field | Phase 4 | PARTIAL — Phase 5 D-79 adds label groups; rules engine cannot match on labels until `TaskFacts.task.labels` is added | Phase 5 (no blocking — router still routes without label matching) |
| G-07: `TaskFacts` has `tags` not `labels` | Phase 4 | LOW — naming inconsistency; automation engine (D-89) uses label vocabulary, router uses `tags` | Fix in Phase 5 when wiring automation label trigger |

---

## Phase 3 Gaps (Symphony + Sandcastle)

### G-01: `tracker.ts` — `labels` hardcoded empty, blocks automation label triggers

**File:** `src/orchestration/symphony/tracker.ts` lines 568-572

**What exists:**
```typescript
function toSymphonyIssue(task: Task, blockerTasksById: ...): SymphonyIssue {
  ...
  labels: [], // Pillar 6 adds label domain; default empty
```

**What Phase 5 expects:** D-89 defines automation trigger `label_added/removed`. For the automation engine to fire on label changes originating from Symphony dispatch context, the tracker must read `task.labels` when Phase 5 adds the `labels` column to `Task`. The current hardcoded empty array means:
- Symphony conformance trace shows `labels: []` for all issues regardless of actual task labels
- Automation trigger `label added` will only fire from direct UI edits, not from Symphony-context task updates that modify labels

**Blocks Phase 5?** YES for label-triggered automations sourced from orchestration context. Independent for UI-only label automations.

**Fix:** Phase 5 migration adds `labels: string[]` to Task entity (already planned in RESEARCH.md). After that migration, update `toSymphonyIssue`:
```typescript
labels: task.labels ?? [],
```
This is a one-line change in `tracker.ts` — include in Phase 5 plan 05-01 (entity migration wave).

---

### G-02: `TASK_STATUS_CATEGORIES` missing `backlog` — partial risk to tracker status mapping

**File:** `src/db/entities/tasks/schemas.ts` lines 7-13

**What exists:**
```typescript
export const TASK_STATUS_CATEGORIES = [
  "unstarted",
  "started",
  "completed",
  "cancelled",
] as const;
```

**What Phase 5 requires:** D-22 adds `backlog` as the 5th category (matching Linear's model). The tracker adapter uses `READY_TASK_STATUS = "ready"` as the dispatch-eligible status — this is separate from `status_category`. However:

1. Phase 5 will add `workflow_transitions` entity (D-24) with transition guards. The `backlog` category must be in the enum before the migration can create check constraints.
2. `Task.status` is currently a free string. After Phase 5 adds `TaskStatus` custom entities per project, the tracker's `buildCandidateIssuesBaseQuery` filters `status = 'ready'`. If `backlog` category tasks have a `backlog` status (not `ready`), they are correctly excluded. No issue. But if `backlog` status gets added to `READY_TASK_STATUS` filter in the future, this must be explicit.
3. The spelling inconsistency: existing code uses `cancelled` (UK), D-22 specifies `canceled` (US). Phase 5 migration updating the check constraint must reconcile.

**Blocks Phase 5?** YES for the migration. The `TASK_STATUS_CATEGORIES` enum migration must add `backlog` and standardize `canceled` spelling before workflow transition entity can be created with correct check constraints.

**Fix:** Phase 5 Wave 0 (entity/schema migration) — add `backlog` and rename `cancelled` → `canceled` in the enum + DB check constraint. Already called out in RESEARCH.md but must be in the first plan.

---

### G-03: No `isBlocked()` method — dispatch eligibility check missing

**File:** `src/orchestration/symphony/tracker.ts` and `src/services/TaskService.ts`

**What exists:** `blockersResolved()` private function in `tracker.ts` — correctly filters tasks with unresolved blockers from candidate fetch. This works for Symphony's own dispatch loop.

**What Phase 5 expects:** RESEARCH.md `## Fulcrum Workflow Integration Map` (line 813):
> Phase 5's blocking chain detection (D-20) must expose a `isBlocked(taskId): boolean` service method that the tracker adapter can call.

D-20 adds `task_relationships` normalized entity. After D-19 migration, the `blockedByIds` text array on Task will be superseded by `task_relationships`. The tracker's `fetchBlockerStatusById` currently reads `task.blockedByIds`. Once Phase 5 adds `task_relationships` as source of truth (RESEARCH assumption A6), the tracker must be updated to query `task_relationships` instead.

**Blocks Phase 5?** YES — if Phase 5 adds `task_relationships` as source of truth without updating `fetchBlockerStatusById` in `tracker.ts`, Symphony dispatch will use stale data from the old `blockedByIds` array. Both representations get out of sync.

**Fix:** Phase 5 plan that introduces `task_relationships` entity must also update:
- `tracker.ts` `fetchBlockerStatusById()` → query `task_relationships` WHERE type = `blocks`
- `tracker.ts` `fetchBlockerTasksById()` → same
- `tracker.ts` `blockersResolved()` → use normalized relationship data

Alternatively, keep `blockedByIds` as a write-through cache (RESEARCH assumption A6) and `tracker.ts` continues using it. **Planner must decide: if jsonb `blockedByIds` stays as denorm cache synced on `task_relationships` write, no tracker change needed. If jsonb is removed, tracker must be updated.**

---

### G-04: Orchestrator does NOT publish to EventBus on agent run state changes — automation trigger gap

**Files checked:**
- `src/orchestration/symphony/orchestrator.ts` — zero `getEventBus` / `publish` calls
- `src/orchestration/symphony/dispatch.ts` — `notifyStateChange` is an optional injected dep, not wired to EventBus
- `src/trpc/routers/orchestration.ts` — zero `getEventBus` / `publish` calls
- `src/services/TaskService.ts` — zero `getEventBus` / `publish` calls

**What exists:** The EventBus exists and has channels for `agent_run.<id>` topics. The `pglite-bridge.ts` listens on the `agent_run` PG channel and forwards to EventBus. But **nothing publishes `NOTIFY agent_run, ...` from the orchestration layer**. The subscription procedures only expose these as tRPC subscriptions for the UI — they receive nothing unless manually triggered.

**What Phase 5 expects:** D-91:
> Automation execution via EventBus listener — when event matches a trigger, evaluate condition, execute action.

D-89 defines triggers including: `status change`, `assignee change`, `label added/removed`, `priority change`, `due date passed`, `task created`, `comment added`.

The automation engine subscribes to EventBus. If TaskService never publishes `task.status_changed` events to EventBus (only creates `Event` entity records), and the orchestrator never publishes `agent_run.started/completed`, then:
- Automation triggers will NOT fire for task mutations during agent run lifecycle
- Status changes performed by agent runs will not trigger automations

**Blocks Phase 5?** YES for D-89..D-92 automation engine correctness. Automations that should trigger on status changes (e.g., "When status → In Review → auto-assign reviewer") will never fire unless TaskService publishes to EventBus.

**Fix:** Two separate additions needed:
1. `TaskService.updateStatus()` (and other mutation methods) must call `getEventBus().publish('task.status_changed', {...})` after flush. This is **Phase 5 work** (TaskService is being extended), but must be explicitly planned.
2. Orchestration `dispatch.ts` `notifyStateChange` callback (already injectable) must be wired to `getEventBus().publish('agent_run.<runId>', {...})` in the real implementation (not just test injection). This is a **Phase 3 implementation gap** — the hook exists but nothing actually calls `getEventBus()` from production dispatch wiring.

**Recommended split:**
- Phase 5 plan for AutomationService should include: "Wire TaskService mutations to EventBus publish" as Wave 1 prerequisite
- Mark as **cross-phase dependency** — Phase 3 left this as a test-injectable hook but never wired it to the real EventBus in the tRPC/orchestrator path

---

### G-05: `task_relationships` entity vs `Task.blockedByIds` array — tracker will diverge

**File:** `src/orchestration/symphony/tracker.ts`, `src/db/entities/tasks/Task.ts`

Already detailed in G-03. The critical point for Phase 5 planning:

`tracker.ts` `fetchBlockerStatusById()` and `blockersResolved()` read `task.blockedByIds` — a `text[]` column on Task. Phase 5 D-19 adds `task_relationships` as a normalized entity. If the planner does not explicitly add a task in Phase 5 to keep `blockedByIds` in sync (write-through cache), or update `tracker.ts` to query `task_relationships`, Symphony dispatch eligibility will be based on stale data after the migration.

**This is the most operationally dangerous gap** — silent data divergence, no compile error.

---

## Phase 4 Gaps (Inference + Router/Skills)

### G-06: Router `TaskFacts` missing `labels` field — Phase 5 label groups not matchable

**File:** `src/router/types.ts`

**What exists:**
```typescript
export interface TaskFacts {
  task: {
    kind: string;
    priority: string;
    tags: string[];   // <-- named "tags", not "labels"
    title: string;
  };
}
```

**What Phase 5 adds:** D-79 adds multi-label system with label groups (e.g., `"Type: bug/feature"`, `"Area: frontend/backend"`). Phase 4 D-15 says "LLM routing input scope configurable, default is full context bundle" and D-25 says routing config has full CRUD parity. The router can already match on `task.tags`.

**Blocks Phase 5?** PARTIAL. The router works. Label-based routing rules (e.g., "if label contains 'infra' → route to codex") require either:
1. `task.tags` is populated with label values by the caller — works if the automation engine / tRPC passes labels under `tags`
2. Or a dedicated `task.labels` field is added to `TaskFacts`

The naming inconsistency (`tags` vs `labels`) is a semantic mismatch. Phase 5 automation engine (D-89) uses `label_added/removed` trigger vocabulary. If the router's `TaskFacts.task.tags` is populated with Phase 5 labels, routing works but the naming mismatch requires a translation layer.

**Fix:** When Phase 5 adds label support, also update `TaskFacts` interface to add `labels: string[]` (or rename `tags` → `labels` with backward compat). Add to Phase 5 plan that wires router + automation service.

---

### G-07: `TaskFacts.task.tags` vs D-89 `label` trigger vocabulary — naming mismatch

Same root as G-06. The automation engine uses `label_added` trigger; the router uses `tags`. Phase 5 `AutomationService` must decide: does it publish `task.label_added` events that the router also receives? Or is the router's `tags` field populated upstream before routing decisions?

**No code change needed in Phase 4.** This is a Phase 5 AutomationService design question — make it explicit in the Phase 5 plan for `AutomationService`.

---

## Non-Gaps (Things That ARE Implemented)

These were listed as audit criteria — confirming they work:

| Item | Status |
|------|--------|
| `tracker-adapter.ts` exists | YES — `src/orchestration/symphony/tracker-adapter.ts` defines `TrackerAdapter` interface |
| 12-field Issue model (`SymphonyIssue`) | YES — `toSymphonyIssue()` maps all 12 fields with `BlockedByRef` objects |
| `blocked_by` returns full `{id, identifier, state}` refs | YES — `fetchBlockerTasksById()` + `BlockedByRefSchema.parse()` per D-02 |
| `agent_runs.task_id` FK exists | YES — `@ManyToOne(() => Task, { fieldName: "task_id", nullable: true })` in `AgentRun.ts` |
| `TrackerBlockerResolutionError` throws on unresolved blockers | YES — implemented and tested |
| Sandcastle dispatch works end-to-end | YES — `sandbox-runner.ts` + `dispatch.ts` + tRPC `dispatchRun` procedure wired |
| WORKFLOW.md runtime behavior (D-06..D-09) | YES — `workflow-runtime.ts` + `prompt.ts` handle reload, env vars, strict rendering |
| Session resume exposes `resumeVia` + capability | YES — `session-resume.ts` per STATE.md |
| EventBus exists with `agent_run.*` channels | YES — `pglite-bridge.ts` + `procedures.ts` expose tRPC subscriptions |
| Embedding 384-dim vectors | YES — `assertEmbeddingDimension` + `inference-embed` Rust tests |
| Rules engine routes on `task.priority` and `task.tags` | YES — `rules-engine.ts` reads `TaskFacts` |
| Router on all 3 surfaces | YES — `routing.ts` tRPC, CLI `inference.ts`, TUI screen |
| MCP virtual skills in skill registry | YES — `mcp-virtual-skills.ts` with tool manifest hash |
| `skills.lock.json` SHA mismatch fails closed | YES — `lock.ts` + `lock-enforcement.test.ts` |
| LLM fallback gate | YES — `llm-fallback.ts` + `llm-fallback-mock.ts` |
| Learned draft auto-detects conflict state | YES — STATE.md Phase 04-01 decision |

---

## Action Items for Phase 5 Planning

| # | Action | Belongs In | Priority |
|---|--------|------------|----------|
| A-01 | Update `tracker.ts` `toSymphonyIssue()` to read `task.labels` after Task entity migration | Phase 5 plan 05-01 (entity wave) | HIGH |
| A-02 | Add `backlog` to `TASK_STATUS_CATEGORIES` enum; standardize `canceled` spelling; update check constraint | Phase 5 plan 05-01 (migration) | HIGH — blocks D-22/D-24 |
| A-03 | Explicit decision: `task_relationships` as source of truth OR write-through cache. Update `tracker.ts` accordingly | Phase 5 plan that introduces `task_relationships` | HIGH — silent data divergence risk |
| A-04 | Wire `TaskService` mutations to `getEventBus().publish(...)` — required for D-89 automation triggers | Phase 5 plan introducing `AutomationService` | HIGH — automations won't fire without it |
| A-05 | Wire orchestration `notifyStateChange` to actual `getEventBus().publish('agent_run.<id>', ...)` in production (not just test injection) | Phase 5 plan OR Phase 3.1 hotfix | MEDIUM — needed for `agent_run.completed` → automation trigger |
| A-06 | Update `TaskFacts` interface to include `labels: string[]` (or populate `tags` from `task.labels`) | Phase 5 plan wiring router + automations | LOW — routing still works, naming only |

---

## Files Modified in Phase 3/4 That Phase 5 Plans Must Not Accidentally Break

| File | Critical Invariant |
|------|-------------------|
| `src/orchestration/symphony/tracker.ts` | `blockersResolved()` must stay correct after `task_relationships` migration |
| `src/orchestration/symphony/schemas.ts` | `READY_TASK_STATUS = "ready"` — dispatch eligibility; do not change this value |
| `src/db/entities/orchestration/AgentRun.ts` | `task_id` FK nullable — sprint rollover (D-28) does NOT break runs because runs reference task, not sprint |
| `src/router/types.ts` | `TaskFacts` interface change must not break existing rules engine tests |
| `src/skills/lock.ts` | SHA validation — Phase 5 has no skills changes; no risk |

---

*Audited by: research agent*
*Basis: direct code reads of production files; no test output claims*
