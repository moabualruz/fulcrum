# Tasks

Application layer for the **Task** aggregate inside Work Management: CRUD, hierarchy and dependency mutation, the Task-detail/relationship-hub read model, and the orchestration surface for dependency runs, QA reviews, automated feedback loops, and the manual workbench. Interface layers (HTTP, tRPC, CLI, TUI) compose this module rather than reach into TypeORM.

## Language

**TaskDetailPayload**:
The denormalized read model returned by `getTaskDetail`, pairing one Task with its Subtask rows, typed Edge rows, and recent Event rows.
_Avoid_: View, projection, snapshot, task page.

**TaskRelationshipHub**:
The aggregated link bundle around one Task — hierarchy, dependencies, docs, repo, runs, artifacts, memory, context, comments, automations, audit — used by the relationship-hub UI and trace surfaces.
_Avoid_: Graph, related items, sidecar, neighborhood.

**WorkMode**:
A named lens (`planning | docs | repo-workspace | agent-run | knowledge | audit-activity`) that groups a Task's links into a tab with its own count and empty-state.
_Avoid_: Tab, section, panel, facet.

**WorkView**:
The scoped listing shape (`board | list | table | calendar | gantt | report`) returned by `listScopedWorkItems`; distinct from a SavedView's `viewType`.
_Avoid_: View (use SavedView), layout, render.

**DependencyRun**:
A grouped agent dispatch over a set of Tasks ordered by their `blocked_by` graph, identified by `runGroupId` and traced via `traceId`; previewed before scheduling and emitted as `scheduledRuns` plus `skippedTasks`.
_Avoid_: Batch, sweep, cascade, fan-out.

**DependencyRunPreview**:
The pre-dispatch projection of a DependencyRun showing `orderedTaskIds`, `omittedTaskIds`, `missingTaskIds`, blockers per Task, and a `requiresDisclosure` flag for operator review.
_Avoid_: Dry-run, plan, simulation.

**TaskQaReview**:
A reviewer-agent verdict (`APPROVE | REVISE | RETHINK | UNAVAILABLE`) on one Task run for a `reviewType` of `plan | code | spec`, carrying a `nextAction`, `successCriteria`, optional follow-up `feedbackRun`, and a `recoveryPlan`.
_Avoid_: Approval, gate, signoff, lint.

**AutomatedFeedbackLoop**:
A bounded review→feedback-run cycle keyed by `runGroupId` that drives a Task toward `APPROVE` until it exits with a `stopReason` (e.g. `max_iterations_reached`, `reviewer_unavailable`, `stale_run_detected`).
_Avoid_: Retry loop, auto-fix, agent loop.

**ManualTaskWorkbench**:
The operator-driven, project-scoped read surface returning Kanban columns, list rows, and a spreadsheet `table` for hand-managing Tasks, parameterized by `viewMode` (`board | list | table`).
_Avoid_: Board, dashboard, workspace.

**AppContext**:
The per-call `(orgId, userId, projectId)` tuple every command and query in this module accepts; `projectId` here is the caller's active project, distinct from the Task's own `projectId`.
_Avoid_: Session, request, scope, tenant.

## Relationships

- A **Task** has one **TaskDetailPayload** at a time and one **TaskRelationshipHub** projection.
- A **TaskRelationshipHub** carries many **WorkModes**, each summarizing one slice of its links.
- A **DependencyRun** targets many **Tasks**; each Task in the run may produce one **TaskQaReview** per review pass.
- An **AutomatedFeedbackLoop** belongs to one **DependencyRun** (`runGroupId`) and produces many **TaskQaReviews** and many feedback **Runs** across its iterations.
- A **ManualTaskWorkbench** call is scoped to one **Project** (or null) and returns many Tasks grouped by Status into columns.
- Every command and query in this module takes an **AppContext** and an `EntityManager`; nothing here reads SQL directly outside `work-item-detail.ts`.

## Example dialogue

> **Dev:** "If a **DependencyRunPreview** comes back with `blocked: true`, can the **AutomatedFeedbackLoop** still kick in?"
> **Domain expert:** "No — the loop is the post-dispatch follow-up. Preview is the pre-dispatch gate. If preview is blocked you never get a `runGroupId`, so there's nothing for the loop to attach to. The loop only iterates over runs that were actually scheduled."
> **Dev:** "And a **TaskQaReview** with verdict `RETHINK` — does that schedule a feedback run automatically?"
> **Domain expert:** "Only inside an AutomatedFeedbackLoop. A bare `recordTaskQaReview` call records the verdict and may queue one feedback run if the reviewer asked for it, but it doesn't keep iterating. The loop is what re-reviews until `APPROVE` or a `stopReason` fires."

## Flagged ambiguities

- **WorkView vs SavedView.viewType** — resolved: **WorkView** is the listing shape returned by `listScopedWorkItems` in this module; **SavedView.viewType** is the persisted rendering on a SavedView entity. They overlap on names like `board`/`list`/`table` but are not the same field.
- **DependencyRun vs Automation** — resolved: a **DependencyRun** is an ad-hoc, operator-initiated agent dispatch ordered by Task `blocked_by` edges. **Automation** (parent context) is a persistent Project rule firing on Task lifecycle events. Both can spawn agent runs; only DependencyRun previews disclosure.
- **AppContext.projectId vs Task.projectId** — resolved: the context `projectId` scopes visibility for the caller; the Task's own `projectId` is its membership. `createTask` reconciles the two and rejects cross-project parents.
