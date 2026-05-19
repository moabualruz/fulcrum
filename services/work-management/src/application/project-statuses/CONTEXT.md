# Project Statuses

Application area that manages per-Project status rows used to label workflow positions on Tasks. CRUD over the `project_statuses` table with audit events appended on every mutation.

## Language

**ProjectStatus**:
A `project_statuses` row owned by an Org and Project with `name`, `color`, `sortOrder`, and `isFinal` flag.
_Avoid_: TaskStatus (distinct entity in `task-statuses/`), column, state, stage.

**SortOrder**:
A monotonically assigned integer determining display order within a Project; new statuses receive `max(sort_order) + 1`.
_Avoid_: Position, rank, index.

**IsFinal**:
A boolean marking a ProjectStatus as a terminal workflow state (work considered done when a Task lands here).
_Avoid_: Closed, terminal, completed (category words belong to TaskStatus).

## Relationships

- A **Project** has many **ProjectStatuses**; each ProjectStatus belongs to exactly one Project and one Org.
- Every create / update / delete on a **ProjectStatus** appends one audit **Event** with `subjectKind: "project_status"`.

## Example dialogue

> **Dev:** "What `sortOrder` does a new **ProjectStatus** get?"
> **Domain expert:** "Max existing `sort_order` for that Project plus one. The caller never supplies it on create; only `updateProjectStatus` may reassign it."
> **Dev:** "Is **IsFinal** the same as the `completed` category on **TaskStatus**?"
> **Domain expert:** "No — `project_statuses` is a separate table from `task_statuses`. IsFinal is a boolean here; categories live on TaskStatus."

## Flagged ambiguities

- **ProjectStatus vs TaskStatus** — resolved: two distinct tables and application areas. `project_statuses` (this area) carries `isFinal: boolean`; `task_statuses` carries a four-value `category`. Do not collapse them or treat one as a view of the other.
- **IsFinal vs category=completed** — resolved: IsFinal is a flag on ProjectStatus only; `unstarted | started | completed | cancelled` categories belong to TaskStatus.
