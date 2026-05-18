# Work Management

Bounded service owning tasks, projects, sprints, custom fields, views, templates, and automations. Provides the planning, tracking, and execution-rule surface that every other Fulcrum surface (CLI, TUI, web, agents) reads and writes through.

## Language

**Task**:
A unit of work owned by an Org, optionally scoped to a Project, with status, priority, points, assignee, labels, dependencies, and custom fields.
_Avoid_: Issue, ticket, story, card, item, work-item.

**Project**:
An Org-scoped container that owns a Methodology, a workflow config, enabled task types, custom field definitions, statuses, and the Sprints/Templates/Automations attached to it.
_Avoid_: Workspace, team, board (Board is a view of a Project, not the Project), epic.

**Sprint**:
A time-boxed iteration belonging to one Project with `planned | active | completed` status, start/end dates, optional capacity points, and a closing metrics snapshot. The canonical name for "cycle" / "iteration" in this codebase.
_Avoid_: Cycle, iteration, milestone (use Sprint; `cycleId` on Task is a legacy alias).

**Module**:
A coarser-than-Sprint grouping a Task can belong to via `moduleId`, used to slice a Project into thematic chunks orthogonal to Sprints.
_Avoid_: Component, epic, feature-group, swimlane.

**Status**:
A per-Project named state on a Task, defined by a `TaskStatus` row with a category in `unstarted | started | completed | cancelled`, a color, and a position. Drives workflow transitions and dispatch eligibility.
_Avoid_: State, stage, column (Column is a Board rendering of a Status).

**Priority**:
An integer on Task used for dispatch ordering and UI sort, surfaced through the seeded `priority` custom field (`urgent | high | medium | low | none`).
_Avoid_: Severity, importance, rank.

**CustomFieldDef**:
A Project-scoped, typed field definition (`text | select | multi_select | number | date | user | url | json`) whose values live in `Task.customFields` jsonb, addressed by `slug`.
_Avoid_: Property, attribute, metadata field, column (column is a SavedView rendering concern).

**SavedView**:
A reusable, named, scoped (`private | project | org`) filter + sort + view-type (`kanban | table | calendar | timeline | list | search`) over Tasks, persisted as a `SavedViewQuery` AST plus `OrderByClause[]`.
_Avoid_: View, filter, query, smart list, board definition.

**Board**:
A `viewType: 'kanban'` rendering of a SavedView, where Status values become columns. Not its own entity.
_Avoid_: Kanban (the rendering mode), pipeline.

**Backlog**:
The set of Tasks in a Project not assigned to an active or planned Sprint. Not its own entity; derived by SavedView query.
_Avoid_: Inbox, queue.

**Template**:
A `TaskTemplate` owned by an Org and optionally a Project that captures a Task shape (`templateData` jsonb) and may be marked default-per-project; instantiated to create new Tasks.
_Avoid_: Preset, blueprint, recipe.

**Automation**:
A `ProjectAutomation` rule of shape (trigger_type, trigger_config) → optional condition → (action_type, action_config), enabled per Project, with an execution counter.
_Avoid_: Rule, workflow (Workflow is the Status-transition graph), trigger, hook.

**Dependency**:
A directional relation between two Tasks expressed two ways: (1) `Task.dependencies` jsonb (`{ blocks, blocked_by }`), (2) `TaskRelationship` rows keyed on `(sourceTaskId, targetTaskId, type)`. The denormalized jsonb is the read path; relationships are the audited write path.
_Avoid_: Link, blocker (a blocker is one direction of a Dependency).

**RecurrenceRule**:
A `TaskRecurrenceRule` attached to a source Task that generates new Tasks on a schedule (cron or interval days), bounded by start/end dates, max occurrences, and an `enabled` flag.
_Avoid_: Schedule, repeat, cron job.

**FieldDependencyRule**:
A per-Project rule that fires an `action` on a target CustomFieldDef when a source CustomFieldDef takes a given value. Conditional field behavior, not Task-to-Task linkage.
_Avoid_: Dependency (reserved for Task-to-Task), trigger, validation.

**WorkflowConfig**:
The `Project.workflowConfig.transitions` map (`status → allowedNextStatuses[]`) plus `methodology` (`scrum | kanban | none`) and `enabledTaskTypes`, defining which Status moves are legal for the Project.
_Avoid_: State machine, pipeline, flow, automation (Automation is event→action; WorkflowConfig is status-transition legality).

**ToolPermissionMode**:
The Project-level trust setting for agent tool execution: `review_each_tool` (default approval queue), `auto` (safe tools may run without stopping), or `danger` (operator-owned full trust). Stored in `Project.modulePolicy.toolPermissionMode` and echoed into dispatch trace/audit payloads.
_Avoid_: ACP mode, chat permission, sandbox mode.

**MetricsSnapshot**:
The frozen `{ capacity_points, completed_points, total_tasks, completed_tasks, velocity }` written into a Sprint on close, mirrored by `MetricsCache` rows for cross-Sprint reporting.
_Avoid_: Report, burndown, stats.

## Relationships

- An **Org** has many **Projects**; every Task, Sprint, CustomFieldDef, SavedView, Template, Automation, and RecurrenceRule is Org-scoped.
- A **Project** has many **Sprints**, **CustomFieldDefs**, **TaskStatuses**, **Templates**, **Automations**, and **FieldDependencyRules**.
- A **Sprint** belongs to exactly one **Project** and has many **Tasks** (via `Task.sprint`); only one Sprint per Project may be `active` at a time.
- A **Task** belongs to one **Org**, optionally one **Project**, optionally one **Sprint**, optionally one **Module** (via `moduleId`), and optionally one parent **Task**.
- A **Task** has many **CustomField** values (jsonb keyed by CustomFieldDef.slug), many **Dependencies** (blocks / blocked_by), many **TaskRelationships**, and at most one **RecurrenceRule** as source.
- A **SavedView** belongs to one **Org**, optionally one **Project**, and is scoped `private | project | org`; a **Board** is a SavedView with `viewType: 'kanban'`.
- A **Template** belongs to one **Org** and optionally one **Project**; at most one Template per Project is `isDefault`.
- An **Automation** belongs to one **Project** and fires on Task lifecycle events; each fire increments `executionCount`.
- A closed **Sprint** produces exactly one **MetricsSnapshot**.

## Example dialogue

> **Dev:** "When I move a **Task** from `todo` to `in_progress`, does the **Automation** fire before or after the **WorkflowConfig** transition check?"
> **Domain expert:** "WorkflowConfig gates the move first — if `todo → in_progress` isn't in `transitions`, the change is rejected and no Automation runs. Automations are post-commit reactions, not pre-write guards. If you need a guard, that's a FieldDependencyRule or a Status category rule, not an Automation."
> **Dev:** "And the **Sprint**'s `metricsSnapshot` — is that live or frozen?"
> **Domain expert:** "Frozen on close. Live numbers come from MetricsCache rows; the snapshot column is the historical record of what the Sprint looked like at close time."

## Flagged ambiguities

- **Sprint vs Cycle vs Iteration** — resolved: the canonical entity is **Sprint** (`sprints` table, `WorkCycleService`). `Task.cycleId` is a legacy column kept for compatibility; new code references `Task.sprint`. The service is named `WorkCycleService` for historical reasons but operates on Sprints.
- **Module vs Component vs Epic** — resolved: **Module** is the only first-class grouping below Project and orthogonal to Sprint (`Task.moduleId`). "Component" and "Epic" are not modeled; do not introduce them as synonyms.
- **Dependency vs FieldDependencyRule** — resolved: **Dependency** is Task-to-Task (`Task.dependencies` + `TaskRelationship`). **FieldDependencyRule** is CustomField-to-CustomField conditional behavior within a single Task. Same word, different layers — never collapse.
- **Workflow vs Automation** — resolved: **WorkflowConfig** is the Project-level legal-transitions graph (synchronous gate). **Automation** is an event→action reaction (asynchronous post-commit). Both can shape Task state but are distinct mechanisms.
- **Board vs SavedView vs View** — resolved: **SavedView** is the entity. **Board** is the rendering of a SavedView with `viewType: 'kanban'`. Bare "view" is too generic; use SavedView when referring to the stored object and Board only for the kanban rendering.
- **TaskStatus vs Priority custom field** — resolved: **Status** is a first-class per-Project entity (`TaskStatus` rows) with categories. **Priority** is a seeded CustomFieldDef (not an entity), even though `Task.priority` exists as a column for dispatch ordering. Both representations are kept in sync by service code.
- **ToolPermissionMode vs Sandbox** — resolved: **ToolPermissionMode** governs whether agent tool calls need approval. **Sandbox** belongs to execution orchestration and controls process isolation. Do not use either as a synonym for the other.
