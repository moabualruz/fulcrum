# Projects

Application area that owns Project lifecycle: creation, hierarchy, template-driven setup, trust/policy mutation, and the overview/board/calendar/gantt reads that hang off a single Project.

## Language

**ProjectKind**:
The discriminator on a Project row: `workspace` (root container), `project` (default standalone), or `subproject` (descendant of a parent Project).
_Avoid_: Type, category, level.

**ProjectPath**:
The slash-joined slug chain stored on `Project.path` that materializes the ancestor chain (e.g. `acme/platform/auth`); used for descendant queries via `LIKE`.
_Avoid_: Breadcrumb, ancestry, lineage.

**ProjectDepth**:
The integer on `Project.depth` equal to the number of ancestor Projects above this one; `workspace` and root `project` rows are depth `0`.
_Avoid_: Level, tier, nesting.

**ProjectSetup**:
The one-shot composite operation (`createProjectFromSetup`) that creates a Project, applies a built-in Template, links an optional local repo, and emits a `project.setup.completed` audit event.
_Avoid_: Bootstrap, onboarding, initialization, wizard.

**ModulePolicy**:
The free-form jsonb on `Project.modulePolicy` carrying per-Project policy flags — currently `trustMode` (inherited from setup) and `toolPermissionMode` (agent tool gating).
_Avoid_: Settings, config, policy bag.

**TrustMode**:
The template-execution trust setting captured at ProjectSetup time (e.g. `manual`); distinct from `ToolPermissionMode` which governs runtime agent tool approvals.
_Avoid_: Permission, mode, trust level.

**ProjectOverview**:
The read-model returned by `loadProjectOverview` summarizing one Project: identity fields plus `{ openTasks, inProgress, done, sprintDaysRemaining }`, optionally aggregated across descendants.
_Avoid_: Dashboard, summary, snapshot, stats.

**ProjectActivity**:
The filtered, project-scoped slice of the `events` table (`listProjectActivityEvents`) used to render a Project's recent timeline.
_Avoid_: Audit log, history, feed.

## Relationships

- A **Project** has zero-or-one parent **Project** (forming a tree via `parentId` + `ProjectPath`); `ProjectKind` constrains the role at each node.
- A **ProjectSetup** produces exactly one **Project**, one **Template** application, one optional **ProjectRepo** link, and one `project.setup.completed` audit event.
- A **Project** carries one **ModulePolicy** jsonb that holds both **TrustMode** (set at setup) and **ToolPermissionMode** (mutated via `updateProjectToolPermissionMode`).
- A **ProjectOverview** aggregates **Task** counts for one **Project**, optionally unioned across all descendants reached through **ProjectPath**.
- **ProjectActivity** rows are **Event**s filtered by `org_id` + `project_id`; deleting a Project deletes its Events first.

## Example dialogue

> **Dev:** "If I pass `includeDescendants: true` to **ProjectOverview**, how does it find the children?"
> **Domain expert:** "It walks **ProjectPath** with a `LIKE` against the parent's path and unions the **Task** counts. **ProjectKind** doesn't matter — `workspace`, `project`, and `subproject` all participate."
> **Dev:** "And **TrustMode** vs **ToolPermissionMode** — both live in **ModulePolicy**?"
> **Domain expert:** "Yes, same jsonb. **TrustMode** is frozen at **ProjectSetup** time and describes template trust; **ToolPermissionMode** is mutated at runtime and gates agent tool calls. Don't collapse them."

## Flagged ambiguities

- **TrustMode vs ToolPermissionMode** — resolved: **TrustMode** is setup-time template trust stored on `ModulePolicy.trustMode`; **ToolPermissionMode** is runtime agent-tool gating stored on `ModulePolicy.toolPermissionMode`. Same jsonb, different lifecycles.
- **ProjectKind `workspace` vs Org** — resolved: `workspace` is a **ProjectKind** value (a root Project node), not the parent **Org**. Every `workspace` row still belongs to one Org.
- **ProjectSetup vs createProject** — resolved: `createProject` is the bare insert; **ProjectSetup** (`createProjectFromSetup`) is the composite that also applies a Template, links a repo, and emits the setup audit event.
