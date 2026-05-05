# Phase 5: Competitive Feature Gaps Research

**Researched:** 2026-05-05
**Purpose:** Close 14 identified feature gaps between Fulcrum Phase 5 scope and competitive parity
**Confidence:** HIGH (verified against competitor docs + codebase audit)

---

## Gap 1: Task Templates

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Team-scoped + workspace-scoped templates. Standard (pre-fill properties + description placeholder text) and Form (structured fields user must fill). Default template per team. `Alt+C` creates from template. Filterable by template used. [CITED: linear.app/docs/issue-templates] | Template picker in create modal; "Template" link next to team name |
| Jira | Issue type schemes with per-type templates. Templates set description structure, components, priority, labels. Scoped per project via Issue Type Scheme. | Modal with issue type dropdown; type selection loads template |
| ClickUp | Task templates at space/folder/list scope. Template includes: description, checklists, subtasks, custom fields, assignees, tags. Template center with search. | "Templates" button in create; browse/search template center |
| Asana | Project templates (full project structure) + task templates (individual task with subtasks/fields). | "Use template" from project or task creation |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (v1 — standard templates only; form templates = v2)
**Priority:** Medium
**Data Model:**
```sql
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  project_id UUID REFERENCES projects(id),  -- NULL = workspace-scoped
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL DEFAULT '{}',
  -- template_data contains: { title_prefix, description (TipTap JSON),
  --   status, priority, labels[], assignee_id, points,
  --   subtasks: [{title, description}], custom_fields: {} }
  is_default BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX task_templates_org_project_default
  ON task_templates (org_id, project_id) WHERE is_default = true;
CREATE INDEX task_templates_org_project ON task_templates (org_id, project_id);
```
**Libraries:** None additional (existing TipTap for description, existing entity pattern)
**UX Pattern:** Match Linear — template picker appears in create modal as dropdown; `Alt+C` shortcut variant creates from template. Default template auto-applies for project context.
**Integration Points:** `TaskService.create()` accepts optional `templateId`; pre-fills fields from template_data. `task_templates` tRPC router (CRUD). Quick-create (Gap 4) shows template selector.
**Effort:** S

### Implementation Notes
- Template versioning NOT needed v1 — templates are live-editable, applied at creation time (snapshot into task). No back-reference stored on task unless needed for filtering (Linear tracks it — add `template_id` nullable FK on tasks for filter support).
- Subtask templates: when template has subtasks array, `TaskService.create()` also creates child tasks in same transaction.
- Migration: add `template_id` nullable column to `tasks` table for "created from template" tracking.

---

## Gap 2: Recurring Tasks

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| ClickUp | Three trigger types: (1) on completion, (2) on close, (3) on schedule (cron-like). Handles overdue: either skip missed or accumulate. Subtasks optionally recur. [CITED: help.clickup.com/hc/en-us/articles/6309885016471] | Recurrence config in task detail; date picker with schedule builder |
| Asana | Five patterns: daily, weekly, monthly, yearly, periodically (every N days). Also "N days after completion". Subtasks do NOT inherit recurrence. [CITED: forum.asana.com] | Due date field → "Make recurring" toggle; pattern picker |
| Todoist | Natural language recurrence ("every Monday", "every 2 weeks"). Completion-triggered (marks done → new instance appears). | Type recurrence in date field natural language |
| Linear | No native recurring tasks (use Zapier/Make integrations) | N/A |

### Recommended Approach for Fulcrum
**Scope:** Phase 5
**Priority:** Medium
**Data Model:**
```sql
CREATE TABLE task_recurrence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  source_task_id UUID NOT NULL REFERENCES tasks(id),
  -- Recurrence config
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'on_complete')),
  cron_expression TEXT,  -- for 'schedule': '0 9 * * 1' (Mon 9am)
  interval_days INTEGER, -- for 'on_complete': create N days after completion
  timezone TEXT DEFAULT 'UTC',
  -- What to copy
  template_data JSONB NOT NULL, -- snapshot of task fields to clone
  include_subtasks BOOLEAN DEFAULT false,
  -- Bounds
  start_date DATE,
  end_date DATE,          -- NULL = indefinite
  max_occurrences INTEGER, -- NULL = unlimited
  occurrences_created INTEGER DEFAULT 0,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX recurrence_next_run ON task_recurrence_rules (next_run_at) WHERE enabled = true;
```
**Libraries:** `graphile-worker` crontab feature (already referenced in D-33; use its built-in cron scheduling). [VERIFIED: graphile-worker supports crontab with backfill on restart — github.com/graphile/worker]
**UX Pattern:** Match ClickUp — recurrence settings in task detail panel date section. Three modes: "On schedule" (cron picker), "After completion" (interval), "On close" (interval).
**Integration Points:**
- graphile-worker crontab entry: polls `task_recurrence_rules` where `next_run_at <= now()` every minute
- Worker job `processRecurrence`: clones source task (title, description, assignee, labels, priority, subtasks if flagged), links as `relates_to` to source, updates `next_run_at`
- EventBus listener: on task status → `completed`, if task has `trigger_type: 'on_complete'` rule, schedule next occurrence
- `TaskService` extended with `setRecurrence()` / `removeRecurrence()` methods
**Effort:** M

### Implementation Notes
- Cron expression parsing: use `cron-parser` npm package (MIT, 3M weekly downloads) for next-run calculation. graphile-worker's native crontab handles the polling, but we store rules in our table for user CRUD.
- Overdue behavior: for schedule-triggered, if task is still open when next occurrence fires, create new instance anyway (don't block). Source task stays open — user decides.
- Template snapshot: `template_data` captured at rule creation time. If source task changes after, recurrence uses snapshot (not live task). Add "Update template from task" action.

---

## Gap 3: Task ID System (PROJ-123)

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | `TEAM-123` — team-scoped prefix (2-5 uppercase chars) + auto-increment integer per team. Used in URLs (`linear.app/team/TEAM-123`), Git branch names, PR references. [CITED: linear.app/docs/conceptual-model] | Displayed everywhere; clickable; copyable for branch names |
| Jira | `PROJ-123` — project key (2-10 uppercase) + sequence per project. Configurable key at project creation. Used in URLs, Git commits, branch names. | Prominent in all views; search by ID; URL routing |
| Plane | Configurable prefix + auto-increment per project. User sets prefix at project creation. | Similar to Jira |
| Shortcut | `sc-123` — global auto-increment (not team/project scoped). | Displayed in story cards |

### Recommended Approach for Fulcrum
**Scope:** Phase 5
**Priority:** Critical — shareable human-readable IDs are table-stakes for team communication
**Data Model:**
```sql
-- Add to projects table:
ALTER TABLE projects ADD COLUMN key TEXT;  -- e.g., 'FUL', 'WEB', 'API'
ALTER TABLE projects ADD COLUMN task_sequence INTEGER DEFAULT 0;
CREATE UNIQUE INDEX projects_org_key ON projects (org_id, key) WHERE key IS NOT NULL;

-- Add to tasks table:
ALTER TABLE tasks ADD COLUMN sequence_number INTEGER;
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id);
CREATE UNIQUE INDEX tasks_project_sequence ON tasks (project_id, sequence_number)
  WHERE sequence_number IS NOT NULL;

-- Computed identifier = project.key || '-' || task.sequence_number
-- e.g., 'FUL-42'
```
**Libraries:** None additional
**UX Pattern:** Match Linear/Jira — ID displayed in task cards, list rows, detail panel header, URLs. Search by typing `FUL-42` in command palette. Copy ID button. Git branch suggestion: `feat/FUL-42-task-title-slug`.
**Integration Points:**
- `TaskService.create()`: atomic increment of `projects.task_sequence` + set `tasks.sequence_number` in same transaction (PostgreSQL `UPDATE ... RETURNING` or advisory lock)
- Computed getter: `get identifier(): string` on Task entity (not stored, derived from loaded project key + sequence_number)
- tRPC: `tasks.getByIdentifier({ identifier: 'FUL-42' })` — parse prefix, lookup project by key, then task by sequence
- URL routing: `/projects/:projectKey/tasks/:sequenceNumber` (or `/task/FUL-42` short URL)
- Command palette: fuzzy match on identifier string
- CLI: `fulcrum task show FUL-42`
**Effort:** M

### Implementation Notes
- Sequence assignment MUST be atomic. Use: `UPDATE projects SET task_sequence = task_sequence + 1 WHERE id = $1 RETURNING task_sequence` inside task creation transaction. This guarantees no gaps under concurrent creation (PostgreSQL row lock on UPDATE).
- Project key validation: 2-5 uppercase alphanumeric, unique per org. Set at project creation, optionally changeable (warn: breaks existing references).
- Display: identifier always visible. Never show raw UUID to users in any surface.
- Migration for existing tasks: backfill `sequence_number` ordered by `created_at` per project. One-time migration script.

---

## Gap 4: Quick-Create UX (`C` key -> inline form)

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | `C` anywhere opens inline issue creator. Context-aware: inherits current team, status column (if on board), cycle (if viewing cycle). Minimal fields: title (auto-focus), team, status. Expand for full form. `Alt+C` for template. [CITED: linear.app/docs/creating-issues] | Inline panel/modal; auto-focus title; Enter submits; context pre-fills |
| Asana | `Tab+Q` global quick-add. Pre-fills project from current view. Title + assignee + due date visible. | Bottom-anchored strip; minimal fields |
| ClickUp | Multiple entry points: `+` in list header (inline row), space-bar in board, quick-add button. Context inherits list + status. | Inline row in list; overlay in board |
| Shortcut | `N` creates new story. Inherits current epic/iteration context. | Modal with title focus |

### Recommended Approach for Fulcrum
**Scope:** Phase 5
**Priority:** Critical — core UX differentiator per D-67 (`C` key binding)
**Data Model:** No schema changes (uses existing task creation)
**Libraries:** `tinykeys` (already in D-85) for keyboard binding
**UX Pattern:** Match Linear exactly:
1. `C` key triggers `QuickCreateTask` Svelte component
2. Component renders as compact inline form (not full-page modal)
3. Title field auto-focused, Enter submits
4. Context pre-fill from current view: project (always), status (if on board column), sprint (if viewing sprint), assignee (if grouped by assignee)
5. Below title: collapsed "more fields" section — click/Tab to expand (priority, assignee, labels, due date, points)
6. `Esc` cancels; `Cmd+Enter` submits with expanded fields
7. After submit: form stays open for rapid multi-create (Linear behavior); `Esc` closes

**Integration Points:**
- `tinykeys` binding registered in root layout `+layout.svelte`
- Component reads current route context (project, sprint, board column) via SvelteKit `$page` store
- Calls existing `trpc.tasks.create` mutation
- Emits EventBus event for optimistic UI update on board/list
- Template dropdown (Gap 1) integrated as optional field
**Effort:** S

### Implementation Notes
- Mobile equivalent: FAB (floating action button) in bottom-right corner, opens same compact form.
- Accessibility: form is `role="dialog"` with `aria-label="Create task"`, focus trap while open.
- Board context: if user is viewing board grouped by status, `C` while hovering a column pre-fills that status. If cursor is on a specific card, new task inserts below it.

---

## Gap 5: Archive / Soft-Delete UX

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Archive = separate from Cancel/Done. Archived issues hidden from all views, searchable via "Include archived" filter toggle. Bulk archive. Restore via archive view. | Right-click → Archive; bulk select → Archive; dedicated "Archived" filter |
| Jira | Archive = hidden from all searches/boards, preservable. Not editable while archived. Restorable. Separate from "Done" resolution. Delete = permanent (admin only). [CITED: support.atlassian.com/jira-software-cloud/docs/archive-an-issue/] | Kebab menu → Archive; admin archive view |
| ClickUp | Close + archive. Closed = done (visible in history). Archived = hidden from everything. Trash = 30-day soft delete before permanent. | Three-tier: active → closed → archived/trashed |

### Recommended Approach for Fulcrum
**Scope:** Phase 5
**Priority:** High
**Data Model:**
```sql
-- Task already has deleted_at (hard delete with restore window)
-- Add archive semantics:
ALTER TABLE tasks ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX tasks_archived ON tasks (org_id, archived_at) WHERE archived_at IS NOT NULL;
```
Three states:
1. **Active** (`archived_at IS NULL AND deleted_at IS NULL`) — visible in all views
2. **Archived** (`archived_at IS NOT NULL AND deleted_at IS NULL`) — hidden from default views, visible with "Include archived" filter, searchable, restorable
3. **Deleted** (`deleted_at IS NOT NULL`) — hidden from everything, 30-day restore window, then permanent purge

**Libraries:** None additional
**UX Pattern:** Match Linear — archive is an action separate from status completion:
- Task can be "Done" AND later "Archived" (cleaned up after sprint review)
- Archive removes from active views but preserves in reports/metrics
- "Include archived" toggle in filter builder
- Dedicated "Archived" section in project settings for browsing/restoring

**Integration Points:**
- `TaskService.archive(taskIds[])` / `TaskService.restore(taskIds[])`
- Bulk archive via bulk operations toolbar (D-74)
- Default queries add `WHERE archived_at IS NULL` (update `TaskRepository.findAll()`)
- Reports: archived tasks INCLUDED in historical metrics (they happened), EXCLUDED from active WIP/age reports
- SavedView filter AST: add `archived` boolean filter operator
**Effort:** S

### Implementation Notes
- Metrics impact: archived tasks retain their event history. Burndown/velocity calculated from events, not current task state — so archiving doesn't distort historical reports.
- Cascading: archiving a parent task does NOT archive subtasks (they may be re-assignable). Archiving prompts: "This task has N active subtasks. Archive them too?"
- Sprint close: option to "Archive all completed" as part of sprint close flow (D-28).

---

## Gap 6: Duplicate Detection / Merge

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Mark as duplicate (links with `duplicate_of`, closes duplicate). Merge: combine into one issue (comments transfer). [CITED: linear.app/changelog/2021-06-17-inbox-snooze-and-easier-issue-merge] | Command palette action "Mark as duplicate"; merge via kebab menu |
| Jira | Native: "Link as Duplicate" + close. No native merge. Marketplace apps (Find Duplicates, Merge Agent) provide: title similarity scoring, merge with comment/attachment transfer. [CITED: community.atlassian.com] | Link dialog → "duplicates" link type; marketplace merge UIs |
| ClickUp | Merge tasks: combine description, comments, attachments, watchers into target task. Source task closed. | Kebab → "Merge with..." → search target |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (v1 — duplicate linking + auto-close; merge = v1.5 if time permits)
**Priority:** Medium
**Data Model:** Uses existing `task_relationships` entity with `type: 'duplicate_of'`. No new tables for v1.

For duplicate suggestions during create:
```sql
-- Trigram index for fuzzy title matching:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX tasks_title_trgm ON tasks USING GIN (title gin_trgm_ops);
```

**Libraries:** PostgreSQL `pg_trgm` extension (built-in, just needs `CREATE EXTENSION`)
**UX Pattern:** Two features:
1. **Suggestion during create:** After typing title (debounced 500ms), query similar titles via `similarity(title, $input) > 0.3`. Show top 3 matches as "Possible duplicates" below title field.
2. **Mark as duplicate:** Action in task detail → search for original → creates `duplicate_of` relationship + optionally auto-closes (Gap 13).
3. **Merge (v1.5):** Select two tasks → merge dialog → pick "keep" task → transfer: comments, watchers, relationships (re-point), custom fields (merge). Close source.

**Integration Points:**
- `TaskService.findSimilar(title, projectId, limit=3)` — pg_trgm similarity query
- `RelationshipService.createDuplicate(sourceId, targetId, autoClose)` — creates relationship + optional status change
- Quick-create component (Gap 4) calls `findSimilar` on title blur/debounce
- Merge service: `TaskService.merge(keepTaskId, closeTaskId)` — transfers comments, watchers, relationships
**Effort:** M (S without merge)

### Implementation Notes
- pg_trgm `similarity()` threshold: 0.3 is standard starting point. Tune based on false positive rate.
- Merge transfer rules: comments get note "Merged from PROJ-XX"; watchers union; relationships re-pointed (if closed task was blocked_by X, keep task becomes blocked_by X); custom fields: keep task values win, source fills gaps.
- Merge is IRREVERSIBLE — confirmation dialog required.

---

## Gap 7: Import from Competitors

### Competitive Landscape
| Platform | Export Format | Key Fields |
|----------|-------------|------------|
| Linear | GraphQL API (paginated). Fields: id, title, description (markdown), state, priority (0-4), assignee, labels, dueDate, estimate, comments, attachments (URLs). [VERIFIED: existing `src/importers/linear.ts`] | Status mapping: Linear states → Fulcrum status categories |
| Jira | REST API v3 or CSV export. Fields: key, summary, description (ADF or HTML), status, priority, assignee, labels, sprint, story points, comments, attachments, custom fields. | Complex: ADF→TipTap conversion; workflow mapping |
| Asana | REST API. Fields: gid, name, notes (HTML), memberships (projects), assignee, due_on, tags, subtasks, custom fields. | Flat structure; sections ≈ status |
| ClickUp | REST API v2. Fields: id, name, description (markdown), status, priority (1-4), assignees (multi!), tags, due_date, time_estimate, custom_fields, checklists. | Multi-assignee → single + watchers |
| GitHub Issues | REST/GraphQL API. Fields: number, title, body (markdown), state, labels, assignees, milestone. | Minimal; no story points natively |
| Trello | REST API or JSON export. Fields: id, name, desc, idList (→status), labels, due, checklists, comments. | Lists = statuses; no priority field |
| CSV | User-defined columns. Minimum: title, status, priority, assignee, description, due_date. | Flexible; needs column mapping UI |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (extend existing importer pattern)
**Priority:** High — critical for adoption
**Data Model:** No new tables. Uses existing `tasks` + `externalId` field for dedup on re-import.
**Libraries:** None additional beyond existing `HttpClient` abstraction
**UX Pattern:** Match existing `src/importers/` pattern:
1. Import wizard: select source → authenticate → select project → preview mapped data → confirm → progress bar
2. Field mapping UI for CSV: drag source columns to Fulcrum fields
3. Dry-run mode (existing in `ImportOptions.dryRun`)

**Integration Points:**
- Extend existing pattern: `src/importers/linear.ts` (exists), `src/importers/types.ts` (Importer interface)
- Add new importers: `jira.ts`, `asana.ts`, `clickup.ts`, `github.ts`, `trello.ts`, `csv.ts`
- Each implements `Importer` interface with `featureFlag` gating
- Field maps: `*.fieldmap.ts` pattern (existing for linear, jira, plane)
- Progress: graphile-worker job for large imports (>100 tasks), emit progress events
- CLI: `fulcrum import <source> --project <id> [--dry-run] [--json]`
- Status mapping config stored per import (source_status → fulcrum_status)
**Effort:** L (6 importers; but each is S individually following established pattern)

### Implementation Notes
- Jira is hardest: ADF (Atlassian Document Format) → TipTap JSON conversion needed. Use `@atlaskit/adf-utils` for parsing, custom transformer to TipTap nodes.
- Dedup on re-import: `externalId` field (format: `jira:PROJ-123`, `linear:<uuid>`, `github:<number>`) with unique index already exists.
- Comments import: extend `ImportedTask` type to include `comments[]` array. Each importer fetches comments alongside tasks.
- Rate limiting: respect each platform's API limits. Linear: 400 req/hr. Jira: varies. Use existing `withRetry` from `src/importers/retry.ts`.

---

## Gap 8: Estimation Scales (beyond points)

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Points only: configurable scale per team: Linear (1-5), Fibonacci (1,2,3,5,8,13,21), T-shirt (XS=1, S=2, M=3, L=5, XL=8). All stored as numeric internally. [CITED: linear.app/docs/estimates] | Estimate picker in task detail; per-team setting |
| Jira | Story points (numeric, any value) + time tracking (original estimate, remaining, logged). Separate fields. Board can show either. | Point field on issue; time tracking in detail |
| ClickUp | Multiple estimation types per space: time, points, custom. Points support: Fibonacci, Linear (1-10), T-shirt, custom scale. | Space settings → estimation type; picker per task |

### Recommended Approach for Fulcrum
**Scope:** Phase 5
**Priority:** Medium
**Data Model:**
```sql
-- Project-level estimation config (add to projects table or separate):
ALTER TABLE projects ADD COLUMN estimation_scale JSONB DEFAULT '{"type":"linear","values":[1,2,3,4,5]}';
-- estimation_scale examples:
-- {"type":"linear","values":[1,2,3,4,5]}
-- {"type":"fibonacci","values":[1,2,3,5,8,13,21]}
-- {"type":"tshirt","values":[1,2,3,5,8],"labels":["XS","S","M","L","XL"]}
-- {"type":"hours","values":null}  (freeform numeric)
-- {"type":"custom","values":[1,3,7,14],"labels":["Tiny","Small","Medium","Large"]}

-- Task.points stays as INTEGER — all scales normalize to numeric
-- Display: map stored integer back to label via project.estimation_scale.labels[]
```
**Libraries:** None additional
**UX Pattern:** Match Linear — per-project estimation scale setting. Task detail shows picker appropriate to scale type:
- Linear/Fibonacci: dropdown with numbers
- T-shirt: button group with size labels (XS S M L XL)
- Hours: numeric input
- Custom: dropdown with custom labels

Velocity calculation always uses raw numeric values regardless of display scale.

**Integration Points:**
- Project settings UI: estimation scale picker (5 presets + custom)
- Task detail panel: estimate picker renders based on project config
- Sprint capacity (D-27): uses raw points regardless of scale
- Reports: velocity/burndown use raw numeric; display optionally shows labels
- CLI: `--points 3` (raw value) or `--estimate M` (label lookup)
**Effort:** S

### Implementation Notes
- Key insight from Linear: ALL scales store as integer internally. T-shirt "M" = 3 points. This means velocity/burndown work identically regardless of scale — no conversion logic in reports.
- Migration: existing `tasks.points` column (integer, nullable) already correct. Only need project-level config.
- Scale change mid-project: warn user that existing estimates retain their numeric value. "L" (old scale = 5) stays as 5 even if new scale maps differently. Offer "re-map existing" option.

---

## Gap 9: Goals / OKRs

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | "Projects" act as goals — have progress %, linked issues, target date. No formal OKR structure. Progress = % of linked issues completed. | Project list with progress bars; timeline view |
| Jira | Goals (Jira Cloud): hierarchy above epics. Progress auto-rolls from child issues. Jira Align: full OKR hub with objectives + key results + health. [CITED: community.atlassian.com] | Goals page; hierarchy drilldown; progress bars |
| Asana | Full Goals + OKRs: Objectives contain Key Results. Progress auto-calculated from linked projects/tasks (% complete). Manual progress for metrics. Weighted sub-goals. [CITED: asana.com/features/goals-reporting/goals] | Goals tab; cascading tree; auto-progress from linked work |

### Recommended Approach for Fulcrum
**Scope:** v2 (not Phase 5) — depends on portfolio dashboard being mature
**Priority:** Low for Phase 5 / High for v2
**Data Model (design for v2):**
```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  project_id UUID REFERENCES projects(id),  -- NULL = workspace-level goal
  parent_goal_id UUID REFERENCES goals(id), -- for OKR hierarchy (Objective → KR)
  title TEXT NOT NULL,
  description TEXT,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('objective', 'key_result', 'target')),
  -- Progress tracking
  progress_mode TEXT CHECK (progress_mode IN ('auto_tasks', 'auto_subgoals', 'manual')),
  progress_percent NUMERIC(5,2) DEFAULT 0,
  target_value NUMERIC,   -- for numeric KRs (e.g., "reach 1000 users")
  current_value NUMERIC,
  -- Timeline
  start_date DATE,
  target_date DATE,
  status TEXT DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'off_track', 'achieved')),
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Link table: which tasks/projects contribute to a goal
CREATE TABLE goal_links (
  goal_id UUID REFERENCES goals(id),
  linkable_type TEXT CHECK (linkable_type IN ('task', 'project', 'epic')),
  linkable_id UUID NOT NULL,
  weight NUMERIC DEFAULT 1.0,  -- for weighted progress
  PRIMARY KEY (goal_id, linkable_type, linkable_id)
);
```
**Libraries:** None additional
**UX Pattern:** Match Asana — cascading goal tree with auto-progress from linked tasks/projects.
**Integration Points:** Portfolio dashboard (D-93), `metrics_snapshots` for progress computation.
**Effort:** L (standalone feature, significant UI)

### Implementation Notes
- Phase 5 contribution: the portfolio dashboard (D-93-96) lays groundwork. Goals build on top of portfolio progress tracking.
- Auto-progress calculation: `progress_percent = (linked_completed_tasks / linked_total_tasks) * 100` — or weighted variant using `goal_links.weight`.
- DEFER to v2: implementing now would stretch Phase 5 scope significantly with minimal MVP value.

---

## Gap 10: Task Creation from Email/Slack

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Slack: `/linear create` command + message action (right-click → "Create Linear issue"). Email: unique project email address, forward → creates issue. Two-way sync for comments. | Slack app; project inbox email |
| Jira | Email: project inbox address, parses subject → title, body → description. Slack: Jira Cloud app with `/jira create` + message action. Automation rules for email parsing. | Service desk email channel; Slack integration |
| Asana | Email: `x@mail.asana.com` per project. Forward email → task. Slack: `/asana create` + message action → task with thread link. | Project email; Slack app |

### Recommended Approach for Fulcrum
**Scope:** Phase 7 (notifications) — NOT Phase 5
**Priority:** Low for Phase 5 / Medium for Phase 7
**Rationale for deferral:**
- Email parsing requires inbound email infrastructure (SendGrid Inbound Parse, AWS SES receiving, or Mailgun routes) — significant infra work
- Slack integration requires Slack app registration, OAuth, event subscriptions — separate pillar
- Phase 5 should focus on core task UX; integrations layer on after notifications (Phase 7) exist
**Integration Points (for Phase 7 planning):**
- Inbound webhook endpoint: `POST /api/inbound/email` parses sender → user, subject → title, body → description (TipTap from HTML)
- Slack bot: message action → opens modal with pre-filled title (message text) + link back to thread
- Both use `TaskService.create()` — no special data model needed
**Effort:** M (each integration separately)

### Implementation Notes
- Mark as OUT OF SCOPE for Phase 5 planning. Document as Phase 7 dependency.
- When implemented: store `source: 'email' | 'slack'` on task creation event metadata for attribution tracking.

---

## Gap 11: Inbox / My Work View

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Inbox = notification center. Shows: assigned, mentioned, watching changes. Actions: snooze (custom datetime), mark read, archive. Keyboard: 1=accept, 2=duplicate, 3=decline, H=snooze. [CITED: linear.app/docs/inbox] | Left-nav "Inbox" with unread count badge; notification list with inline actions |
| Asana | "My Tasks" = personal task list with sections: Recently Assigned, Today, Upcoming, Later. Prioritized by user drag. | Dedicated "My Tasks" in left nav; sortable sections |
| ClickUp | "Inbox" = notifications + "My Work" = filtered view (assigned to me, by status grouping). | Two separate views in left nav |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (v1 — filtered "My Work" view; full notification inbox = Phase 7)
**Priority:** High
**Data Model:** No new tables needed for v1. Uses existing `SavedView` entity as a system-default saved view.

v1 "My Work" is a pre-built filtered view, NOT a notification system:
- Assigned to current user
- Grouped by: Overdue, Due today, Due this week, No due date
- Sorted by priority within each group
- Shows tasks from ALL projects user is member of

**Libraries:** None additional
**UX Pattern:** Match Asana "My Tasks" pattern for v1:
- Left nav item: "My Work" (below projects list)
- Renders as list view with grouping sections
- Quick-filter chips: "All", "In Progress", "Overdue", "Blocked"
- This is a filtered query, not a separate data model

Phase 7 adds full notification inbox (Linear-style with snooze, read/unread, triage actions) powered by `task_watchers` + notification delivery system.

**Integration Points:**
- New route: `/my-work`
- Query: `TaskRepository.findAll({ assigneeId: currentUser.id, archived_at: null, deleted_at: null })` with date grouping logic
- Reuses existing list view component with pre-configured grouping
- Can be implemented as a special `SavedView` with `is_system: true` flag
**Effort:** S (it's essentially a pre-built saved view with custom grouping)

### Implementation Notes
- v1 is deliberately simple: it's a filtered list, not a notification feed. The value is "one place to see my stuff across all projects."
- Phase 7 upgrades this to true inbox with: read/unread state per notification, snooze, notification delivery from watchers, mention notifications, status change notifications.
- "Blocked" chip: queries tasks where user is assignee AND task appears in `task_relationships.target_task_id` with `type = 'blocks'` (i.e., something blocks this task).

---

## Gap 12: CSV Export (decided but thin)

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | CSV/JSON export per project or filtered view. Background job for large exports. Email notification when ready. | Settings → Export; or view kebab → Export |
| Jira | Full export: CSV, XML. Filtered export from any JQL result. Columns match current view. Background for large datasets. | Filter → Export button; format picker |
| Asana | CSV export per project. Includes all visible fields. Real-time for small; email link for large. | Project kebab → Export → CSV |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (already decided in D-54, needs surface implementation)
**Priority:** Medium
**Data Model:** No changes (query-based export)
**Libraries:** None — CSV generation is trivial string building
**UX Pattern:**
- Web: "Export" button in report header + view header. Downloads CSV with columns matching current view/report.
- CLI: `fulcrum report <type> --format csv > output.csv` (already planned in D-82)
- Bulk export: for >1000 rows, generate via graphile-worker job, return download URL

**Integration Points:**
- `ReportService.exportCsv(reportType, filters, columns)` — returns CSV string or stream
- tRPC endpoint: `reports.exportCsv` returning `text/csv` content-type via streaming response
- Views: export button passes current filter AST + visible columns to export endpoint
- CLI: `--format csv|json|table` flag on `fulcrum report` command
- Background job: for exports >1000 rows, enqueue worker job, return job ID, poll for completion
**Effort:** S

### Implementation Notes
- CSV generation: simple `columns.join(',') + '\n' + rows.map(r => columns.map(c => csvEscape(r[c])).join(',')).join('\n')`. No library needed.
- Streaming for large exports: use `ReadableStream` in tRPC response for memory efficiency.
- Date formatting in CSV: ISO 8601 always. Let spreadsheet apps parse.
- Custom fields in export: include all custom field columns, JSON values flattened.

---

## Gap 13: Auto-Close on Duplicate

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Mark as duplicate → automatically moves to "Duplicate" status (mapped to Canceled category). Original linked. | One action: "Mark as duplicate of..." → auto-resolves |
| Jira | Link as "duplicates" → manual close required (or automation rule). Resolution set to "Duplicate". | Link dialog + separate close action; or automation |
| ClickUp | Mark duplicate → prompts "Close this task?" → auto-closes with "Duplicate" resolution. | Inline prompt after marking |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (small enhancement to RelationshipService)
**Priority:** Medium
**Data Model:** No new tables. Uses existing `task_relationships` with `type: 'duplicate_of'` + task status change.
**Libraries:** None
**UX Pattern:** Match Linear — single action flow:
1. User selects "Mark as duplicate" → search modal for original task
2. Creates `duplicate_of` relationship (source = this task, target = original)
3. Prompt: "Close this task as duplicate?" (checkbox, default checked)
4. If yes: set status to project's "Canceled" category status, add "duplicate" label
5. Transfer watchers to original (union, don't duplicate)
6. Activity event: "Marked as duplicate of PROJ-42"

**Integration Points:**
- `RelationshipService.markAsDuplicate(sourceTaskId, targetTaskId, options: { autoClose: boolean, transferWatchers: boolean })`
- EventBus listener: on `relationship_added` where type = `duplicate_of`, if `autoClose` in metadata → change status
- Watcher transfer: query source task watchers, upsert into target task watchers with `source: 'duplicate_merge'`
- UI: "Mark as duplicate" action in task detail kebab menu + command palette
**Effort:** S

### Implementation Notes
- Auto-close is configurable per project (some teams want to review before closing). Default: prompt user.
- The duplicate task remains accessible (not archived) — its status is just set to canceled category.
- Comments on duplicate are NOT transferred (unlike full merge in Gap 6). User can find them via the relationship link.
- Event metadata stores `{ autoClosedAsDuplicate: true, originalTaskId: targetId }` for audit trail.

---

## Gap 14: Blocked-By Direction Queries

### Competitive Landscape
| Platform | Implementation | UX Pattern |
|----------|---------------|------------|
| Linear | Shows both "Blocking" and "Blocked by" lists on issue. Click to navigate. Badge on blocked issues in all views. | Relationships section in detail panel; badge on cards |
| Jira | Linked issues section shows all directions. "is blocked by" vs "blocks" displayed as sentences. | Link section with directional labels |
| ClickUp | Dependencies section: "Waiting on" (blocked by) and "Blocking" (blocks others). Visual indicators. | Dependency section in task detail; warning banners |

### Recommended Approach for Fulcrum
**Scope:** Phase 5 (already partially addressed by D-19 `task_relationships` entity)
**Priority:** High — D-19 specifies the data model, this gap is about the query/UX surface
**Data Model:** `task_relationships` table stores ONE direction:
```
source_task_id | target_task_id | type
task_A         | task_B         | 'blocks'
-- Meaning: A blocks B (B is blocked by A)
```
To answer "What blocks task B?" → query WHERE `target_task_id = B AND type = 'blocks'`
To answer "What does task A block?" → query WHERE `source_task_id = A AND type = 'blocks'`

```sql
-- Already planned indexes from D-19 entity design:
CREATE INDEX task_relationships_source ON task_relationships (source_task_id, type);
CREATE INDEX task_relationships_target ON task_relationships (target_task_id, type);
```

**Libraries:** None
**UX Pattern:** Match Linear — bidirectional display in task detail:
- "Blocking" section: tasks this one blocks (I am source, type=blocks)
- "Blocked by" section: tasks blocking this one (I am target, type=blocks)
- Badge on task cards in board/list: red "Blocked" badge when task has any `blocked_by` entries
- Tooltip on badge: "Blocked by PROJ-12, PROJ-15"

**Integration Points:**
- `RelationshipService.listBlockedBy(taskId)` → returns tasks that block this one
- `RelationshipService.listBlocking(taskId)` → returns tasks this one blocks
- `RelationshipService.isBlocked(taskId)` → boolean for badge rendering
- tRPC: include `blockedByCount` in task list response for badge rendering without N+1
- Board: red overlay/badge on blocked cards (D-20)
- Gantt: arrow direction from blocker → blocked (D-21)
- "Blocked" quick filter (D-71): `WHERE EXISTS (SELECT 1 FROM task_relationships WHERE target_task_id = tasks.id AND type = 'blocks')`
**Effort:** S (queries + UI surface; data model already planned)

### Implementation Notes
- Performance: the `target_task_id` index makes reverse lookups O(log n). For board rendering, batch-fetch blocked status for all visible tasks in single query: `SELECT target_task_id, COUNT(*) FROM task_relationships WHERE target_task_id = ANY($taskIds) AND type = 'blocks' GROUP BY target_task_id`.
- Existing `tasks.dependencies` JSONB field (current denormalized approach) should be deprecated in favor of `task_relationships` normalized table. Migration: copy existing `dependencies.blocked_by[]` and `dependencies.blocks[]` into relationship rows.
- Chain detection for critical path (D-102): topological sort on the relationship graph handles cycles (detect + warn, don't crash).

---

## Summary: Priority & Scope Assignment

| Gap | Priority | Scope | Effort | Dependencies |
|-----|----------|-------|--------|--------------|
| 3. Task ID System | Critical | Phase 5 | M | Project entity (key column) |
| 4. Quick-Create UX | Critical | Phase 5 | S | tinykeys (D-85) |
| 5. Archive/Soft-Delete | High | Phase 5 | S | None |
| 11. Inbox/My Work | High | Phase 5 | S | None |
| 14. Blocked-By Queries | High | Phase 5 | S | task_relationships entity |
| 7. Import from Competitors | High | Phase 5 | L | Existing importer pattern |
| 1. Task Templates | Medium | Phase 5 | S | Quick-create (Gap 4) |
| 2. Recurring Tasks | Medium | Phase 5 | M | graphile-worker |
| 6. Duplicate Detection | Medium | Phase 5 | M | pg_trgm extension |
| 8. Estimation Scales | Medium | Phase 5 | S | Project config |
| 12. CSV Export | Medium | Phase 5 | S | ReportService |
| 13. Auto-Close Duplicate | Medium | Phase 5 | S | RelationshipService |
| 9. Goals/OKRs | Low | v2 | L | Portfolio dashboard |
| 10. Email/Slack Create | Low | Phase 7 | M | Notification infra |

---

## Sources

### Primary (HIGH confidence)
- [Linear Issue Templates](https://linear.app/docs/issue-templates) — template types, scoping, default behavior
- [Linear Estimates](https://linear.app/docs/estimates) — scale types, per-team config
- [Linear Inbox](https://linear.app/docs/inbox) — notification triage, snooze, keyboard shortcuts
- [Linear Create Issues](https://linear.app/docs/creating-issues) — `C` key, `Alt+C` template variant
- [Linear Conceptual Model](https://linear.app/docs/conceptual-model) — TEAM-123 identifier format
- [ClickUp Recurring Tasks](https://help.clickup.com/hc/en-us/articles/6309885016471) — trigger types, overdue handling
- [Jira Archive](https://support.atlassian.com/jira-software-cloud/docs/archive-an-issue/) — archive semantics vs resolution
- [graphile-worker cron](https://github.com/graphile/worker) — crontab scheduling with backfill

### Secondary (MEDIUM confidence)
- [Asana Goals](https://asana.com/features/goals-reporting/goals) — OKR progress auto-calculation
- [Jira Goals Setup](https://community.atlassian.com/forums/App-Central-articles/Jira-Goals-Setup-Guide) — hierarchy above epics
- [graphile-scheduler](https://github.com/davbeck/graphile-scheduler) — cron-like scheduling on graphile-worker

### Verified Codebase (HIGH confidence)
- `src/importers/linear.ts` — existing Linear importer with pagination, field mapping, retry
- `src/importers/types.ts` — Importer interface, ImportedTask shape, ImportOptions
- `src/db/entities/tasks/Task.ts` — existing `deleted_at`, `points`, `dependencies` JSONB, `externalId`
- `src/db/entities/tasks/schemas.ts` — DependenciesSchema (blocks/blocked_by arrays), status categories
- `src/db/entities/tasks/MetricsCache.ts` — existing snapshot entity (needs extension per D-32)
