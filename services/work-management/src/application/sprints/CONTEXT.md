# Sprints

Application area that exposes Sprint lifecycle commands, queries, and capacity/backlog projections over the `work-cycle` domain. Sharpens parent vocabulary for sprint closure, disposition of unfinished work, and per-sprint metrics shape.

## Language

**SprintStatus**:
The lifecycle value of a Sprint, one of `planned | active | completed`.
_Avoid_: state, phase, stage.

**CloseSprintResult**:
The return shape of closing a Sprint: the updated `Sprint` plus its frozen `MetricsSnapshot`.
_Avoid_: close payload, sprint report.

**UnfinishedDisposition**:
The routing decision for Tasks still open at Sprint close, either `next-sprint` (move to the upcoming planned Sprint) or `backlog` (clear `sprintId`).
_Avoid_: rollover, carry-over policy, sweep target.

**TaskDisposition**:
A per-Task override on close (`{ taskId, disposition }`) that beats the default `UnfinishedDisposition`.
_Avoid_: task rollover, task override.

**MetricsSnapshot**:
The `{ completedCount, pointsCompleted, pointsRemaining, wipCount }` row written when a Sprint is closed; the area-local shape of parent's MetricsSnapshot concept.
_Avoid_: burndown, sprint stats, report row.

**CapacityPreview**:
The live `{ assigned, capacity, percentage }` projection of currently-assigned points against the Sprint's `capacityPoints`.
_Avoid_: load, utilization, fill rate.

**Backlog**:
The Tasks in the current `projectId` with `sprintId IS NULL` and status not in `completed | cancelled`, ordered by priority then recency.
_Avoid_: queue, inbox, unscheduled.

## Relationships

- A **Sprint** transitions `planned → active → completed`; only one Sprint per Project may be `active`.
- Closing a **Sprint** produces exactly one **MetricsSnapshot** and applies one **UnfinishedDisposition**, optionally overridden per Task by a **TaskDisposition**.
- A **CapacityPreview** is derived per Sprint from the sum of assigned Task points relative to `capacityPoints`.
- The **Backlog** is derived per Project; it is the read-side complement of Sprint membership, not its own entity.

## Example dialogue

> **Dev:** "If I pass `unfinishedDisposition: 'next-sprint'` but include a `TaskDisposition` of `backlog` for one task, who wins?"
> **Domain expert:** "The per-task **TaskDisposition** wins. The top-level **UnfinishedDisposition** is the default for tasks not listed."
> **Dev:** "And the **MetricsSnapshot** — is it computed at close or live?"
> **Domain expert:** "Computed at close, frozen on the Sprint. **CapacityPreview** is the live equivalent for an in-flight Sprint."

## Flagged ambiguities

- **MetricsSnapshot shape** — the parent context lists `{ capacity_points, completed_points, total_tasks, completed_tasks, velocity }`; this area persists `{ completedCount, pointsCompleted, pointsRemaining, wipCount }`. Both are valid snapshots at different layers (cache row vs. close-time payload). Do not collapse — refer to the local DTO when working in `sprints/`.
- **Sprint vs WorkCycle naming** — resolved at parent: the canonical entity is **Sprint**. This area re-exports from `work-cycle.ts` / `WorkCycleService` for legacy reasons; new code should still use **Sprint** vocabulary at the API boundary.
