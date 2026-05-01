# PRD 6: Tasks + Scrum + Sprints + Burndown + Custom Fields + Saved Views

## Status: ready-for-plan-breakdown

## Linkage chain

| Dimension | Detail |
|---|---|
| Vision gaps | V-gap-10: no sprint planning or scrum board; V-gap-11: no burndown/velocity reporting; V-gap-12: no custom fields; V-gap-13: no saved/shareable views |
| Requirements pillar | Pillar 6 — Tasks + Scrum + Sprints (`REQUIREMENTS.md §6`) |
| Key decisions | Q7 (at-most-one active sprint per project); Q8 (burndown both on-demand and cached); Q9 (custom fields full engine); Q10 (saved views DB-persisted + shareable); Q22 (composite org_id indexes on all tables); Q23 (events.org_id backfill in Pillar 1); A2 (doctor coverage per pillar) |
| External specs | `svelte-dnd-action` MIT; `TanStack Table v8` MIT; `LayerChart` MIT; `svelte-gantt` MIT; graphile-worker rollup job docs |

---

## Vision

Jira/Linear-class task management. User verbatim: "interactive monitoring on kanban/scrum boards for dev cycles, burndown charts and reporting per project." Full parity: task detail, subtask trees, blocks/blocked-by, sprint planning, active sprint kanban, burndown + velocity + cycle-time, configurable statuses, custom fields, saved views (kanban/table/calendar/timeline/list) persisted + shareable. Web + CLI + TUI full parity — no surface MVP or phase 2 (C4, C1).

---

## Out-of-scope

Items here fall strictly into carve-out (1): genuinely not in user's verbatim ask and not in any locked decision; or carve-out (2): owned by another pillar. Per C5, no feature mentioned in user's ask, OPEN-QUESTIONS, research, or DECISIONS may appear here.

- **AI auto-labelling / auto-triage** — Q5b explicitly removed: not user-requested. Excluded until the user asks for it.
- **Owned by Pillar 9 (Notifications):** Email / webhook notifications triggered by task events. This pillar emits `events` rows (watchers, mentions, status changes); Pillar 9 owns fan-out to email/webhook/Slack channels.
- **Time tracking (hours logged)** — not in user's verbatim ask and not in any locked decision; considered and excluded.

---

## Always-on features

Ships unconditionally, all surfaces.

### Task primitive (full Jira/Linear parity)

**Detail page** — modal (board card click) + full-page route (`/projects/<id>/tasks/<task_id>`):
- Description: TipTap block editor (Pillar 4), slash commands, wikilinks, autosave.
- Parent/subtask: `tasks.parent_id` adjacency, infinite nesting, breadcrumb header.
- Dependencies: `tasks.dependencies jsonb` blocks/blocked-by; blocked badge on card; inline resolution.
- Assignees: multi-assign users OR agent identities.
- Core fields: due date, estimate (points), priority (urgent/high/medium/low/none), labels, sprint, repo link, custom fields.
- Watchers + mentions (events emitted → Pillar 9 consumes).
- Attachments: artifact rows via `edges(from_kind='artifact', to_kind='task')`.
- Comments: threaded, markdown, reactions, editable/deletable by author.
- Activity feed: append-only events log (status changes, field edits, comments, sprint moves, linked runs).
- Keyboard: `e` title, `a` assign, `s` status, `p` priority, `l` label, `d` due date, `[`/`]` prev/next task.

**Statuses** — configurable per project:
- Default template: `backlog → todo → in_progress → in_review → blocked → done → cancelled`.
- Settings → Statuses: add/rename/reorder/delete/color. Each status carries `category` enum (`unstarted|started|completed|cancelled`) driving burndown logic. At least one `completed` + one `unstarted` required.

**Bulk operations** — shift+click / cmd+click multi-select across board, table, list:
- Actions: assign, status, sprint, label, priority, delete (soft). Floating action bar ≥2 selected. shadcn-svelte Command dispatches bulk commands.

**View types** — five per project, each a `saved_views` row (scope `project` default):
1. **Kanban** — status columns; swimlanes (assignee/epic/priority); `svelte-dnd-action`.
2. **Table** — TanStack Table v8; sort/filter/group any field + custom fields; column visibility; inline edit.
3. **Calendar** — tasks on date grid by due_date; drag-to-reschedule.
4. **Timeline / Gantt** — horizontal timeline by start/end; dependency arrows; `svelte-gantt`.
5. **List** — TanStack Virtual; click opens detail.

---

### Sprints / scrum (Q7)

`sprints` — at-most-one active per project (partial unique index enforces). 

**Sprint planning board:** backlog (all unsprinted tasks) left | sprint right. `svelte-dnd-action` cross-container drag. Capacity bar = `sum(points)` vs `sprints.capacity_points`; over-capacity warning. Backlog filter by priority/assignee/label.

**Active sprint board:** Kanban scoped to `sprint_id = active_sprint.id`. Header: goal, dates, capacity bar, days remaining. Quick-add inline per column.

**Sprint close:** modal to disposition unfinished tasks (next sprint or backlog, per task). Auto-creates `doc_type='postmortem'` retrospective doc (Pillar 7 dependency; if not shipped: emit `sprint.closed` event, Pillar 7 adds listener). Records final metrics snapshot to `metrics_cache`.

---

### Burndown / velocity / cycle-time (Q8 — both on-demand and cached)

**On-demand** — `events WHERE subject_kind='task' AND verb='status_changed'` + JOIN tasks. Used for drill-down tooltips, cycle-time detail, retro deep-dive.

**Cached** — `graphile-worker` rollup job writes `metrics_cache`. Trigger: status_changed event for (project, sprint) past last_rollup_cursor → enqueue job (deduped). Job upserts day row. Dashboard tiles read cache only.

**Reports (all shipped):** burndown (points remaining vs ideal, LayerChart area+line), velocity (3-sprint committed vs completed bar), cycle-time (histogram `in_progress→done`), throughput (tasks/wk 12wk), WIP (`started` count + 7d sparkline), cumulative-flow (stacked area per status category). Routes: `/projects/<id>/reports`, CLI `--json`, TUI ASCII via `asciichart`.

---

### Custom fields engine (Q9 — full engine)

Types: `text | select | multi_select | number | date | user | url | json`. Config JSON per type: select/multi_select `{options:[{value,label,color}]}`; number `{unit,decimals,min,max}`; date `{include_time}`; user `{multi}`; url `{display_as:'link'|'embed'}`.

Defaults seeded at project create: `status, priority, assignee, due_date, estimate, parent, tags, repo, sprint`.

Settings → Fields tab: add/reorder/archive. Archived: hidden in UI, values preserved in `tasks.custom_fields jsonb`. Detail page: fields rendered in `position` order; required fields block save. Custom fields filterable/sortable in all five views + saved-view AST.

---

### Saved views (Q10 — DB-persisted, shareable)

`saved_views` scopes: `private | project | org`. Typed AST is canonical for both URL params (transient) and DB rows (named):

```typescript
type SavedViewQuery = {
  filters: Array<{ field: string; op: 'eq'|'neq'|'in'|'nin'|'gt'|'lt'|'contains'|'is_empty'|'is_not_empty'; value: unknown }>;
  text: string;   // FTS fragment
  facets: { kind?:string[]; status?:string[]; priority?:string[]; assignee?:string[]; sprint?:string[]; label?:string[]; repo?:string[] };
};
```

Q27 (search) reuses same AST; `kind` field discriminates task/doc/memory/artifact. Filter builder: shadcn-svelte Command palette composes chips; "Save as view" serializes state + view type to `saved_views`.

---

## Gated features

All shipped + tested; OFF by default; flip individual flag to enable.

| Feature | Gate flag | What it does |
|---|---|---|
| Real-time multi-cursor editing of task descriptions | `FULCRUM_FEATURES=real-time-collab-server` | Yjs CRDT binding on the task description TipTap field; in-process Hocuspocus server manages document rooms; collab cursor (name + colour) shown to concurrent editors. Cross-ref Pillar 5 (docs editor) — same flag gates Hocuspocus server lifecycle for both docs and tasks. |
| Jira connector (one-way pull) | `FULCRUM_FEATURES=connector-jira` | ETL pipeline scaffolding + Jira REST adapter. Imports issues into `tasks` with `external_id='jira:<issue_key>'`. Bi-directional sync gated behind `connector-jira-bidirectional`. |
| Linear connector (one-way pull) | `FULCRUM_FEATURES=connector-linear` | Linear GraphQL adapter. Imports issues into `tasks` with `external_id='linear:<uuid>'`. Schema already accepts `external_id` column. Bi-directional behind `connector-linear-bidirectional`. |
| GitHub Issues connector (one-way pull) | `FULCRUM_FEATURES=connector-github-issues` | GitHub REST API adapter. Imports issues + labels + milestones into tasks + sprints. Bi-directional behind `connector-github-issues-bidirectional`. |
| LLM-narrated sprint summary | `FULCRUM_FEATURES=report-llm-narration` | On sprint close: inference sidecar generates a 3-paragraph narrative from sprint metrics + completed task titles. Appended to the auto-created retrospective doc. Backend: `embedded` sidecar by default; overridable via `report-llm-narration:<backend>` (same backend syntax as `router-llm`). |
| Embeddings-powered task search | `FULCRUM_FEATURES=embeddings` | Task title + description embedded via inference sidecar; hybrid FTS + cosine similarity for search-in-view filter. |
| ABAC policies for field/view permissions | `FULCRUM_FEATURES=casbin-policies` | node-casbin rules gate which org roles can create/edit/delete custom fields and share saved views to org scope. |
| Public REST/OpenAPI for tasks + sprints | `FULCRUM_FEATURES=public-api` | Exposes `GET/POST/PATCH/DELETE /api/v1/tasks`, `/api/v1/sprints`, `/api/v1/reports/{kind}` via `@hono/zod-openapi`. |

---

## Tech stack

| Layer | Pick | License | Failure gate | 2nd | 3rd |
|---|---|---|---|---|---|
| Kanban DnD | `svelte-dnd-action` | MIT | Svelte 5 runes breaks `onconsider`/`onfinalize`; >500 cards perf | `pragmatic-drag-and-drop` (Apache-2.0) | `SortableJS` (MIT) |
| Gantt/Timeline | `svelte-gantt` | MIT | <618 stars → abandoned; no keyboard a11y; >6mo scroll perf | `vis-timeline` (Apache/MIT) | `SVAR Svelte Gantt` MIT |
| Charts | `LayerChart` | MIT | CFD chart missing + d3 compose >3 days; SSR breaks | `Chart.js` (MIT, 67k stars) | `Apache ECharts` (Apache-2.0) |
| Table/Backlog | `TanStack Table v8` + `TanStack Virtual` | MIT | v9 breaks v8 workarounds; Virtual bug #866 blank lists | `AG Grid Community` (MIT) | `@humanspeak/svelte-virtual-list` (MIT) |
| Filter AST | Hand-rolled `src/filters/ast.ts` | — | N/A — owned | — | — |
| Command palette / bulk | `shadcn-svelte Command` (Bits UI) | MIT | Bits UI breaking change; >1000 items lag | `ninja-keys` (MIT) | Headless Svelte `use:` + Bits UI combobox |
| Sprint retro doc | Pillar 7 doc-create API | — | Pillar 7 not shipped → emit event only; Pillar 7 adds listener | — | — |

---

## Schema changes

All tables: composite `(org_id,…)` indexes (Q22 mandate). All migrations idempotent.

```sql
CREATE TABLE sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL, goal text,
  start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  capacity_points int, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sprints_org_project_status ON sprints(org_id, project_id, status);
CREATE UNIQUE INDEX sprints_one_active_per_project ON sprints(project_id) WHERE status = 'active';

CREATE TABLE custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL, slug text NOT NULL,
  type text NOT NULL CHECK (type IN ('text','select','multi_select','number','date','user','url','json')),
  config_json jsonb NOT NULL DEFAULT '{}',
  required boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0, UNIQUE (project_id, slug)
);
CREATE INDEX custom_field_defs_org_project ON custom_field_defs(org_id, project_id);

CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'private' CHECK (scope IN ('private','project','org')),
  name text NOT NULL, query_json jsonb NOT NULL DEFAULT '{}',
  order_by jsonb NOT NULL DEFAULT '[]',
  view_type text NOT NULL DEFAULT 'list' CHECK (view_type IN ('kanban','table','calendar','timeline','list')),
  created_by uuid NOT NULL REFERENCES users(id),
  shared_with_users uuid[] NOT NULL DEFAULT '{}', shared_with_teams uuid[] NOT NULL DEFAULT '{}',
  default_for text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_views_org_project ON saved_views(org_id, project_id);
CREATE INDEX saved_views_created_by ON saved_views(created_by);

CREATE TABLE metrics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id uuid REFERENCES sprints(id) ON DELETE CASCADE,
  date date NOT NULL,
  started_count int NOT NULL DEFAULT 0, completed_count int NOT NULL DEFAULT 0,
  blocked_count int NOT NULL DEFAULT 0, points_completed int NOT NULL DEFAULT 0,
  points_remaining int NOT NULL DEFAULT 0, wip_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sprint_id, date)
);
CREATE INDEX metrics_cache_project_sprint_date ON metrics_cache(project_id, sprint_id, date);

CREATE TABLE task_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL DEFAULT '#6B7280',
  category text NOT NULL CHECK (category IN ('unstarted','started','completed','cancelled')),
  position int NOT NULL DEFAULT 0, is_default boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, name)
);
CREATE INDEX task_statuses_org_project ON task_statuses(org_id, project_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES sprints(id),
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS points int,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES tasks(id),
  ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '{"blocks":[],"blocked_by":[]}',
  ADD COLUMN IF NOT EXISTS external_id text;  -- 'jira:<key>' | 'linear:<uuid>' | 'github:<number>' etc.
CREATE INDEX tasks_org_sprint_status ON tasks(org_id, sprint_id, status);
CREATE INDEX tasks_org_parent ON tasks(org_id, parent_id);
CREATE INDEX tasks_custom_fields_gin ON tasks USING gin(custom_fields);
CREATE UNIQUE INDEX tasks_org_external_id ON tasks(org_id, external_id) WHERE external_id IS NOT NULL;
```

`events.org_id` backfill in Pillar 1 (Q23). No new events columns here; this pillar only emits events.

---

## Surfaces

### Web (SvelteKit routes)

`/projects/<id>/board` — Kanban (status columns, sprint filter header)  
`/projects/<id>/backlog` — TanStack Table + sprint planning side panel  
`/projects/<id>/sprints` — sprint list (planned/active/completed, velocity sparklines)  
`/projects/<id>/sprint/<sprint_id>` — active sprint Kanban  
`/projects/<id>/tasks/<task_id>` — task full-page detail  
`/projects/<id>/reports` — reports hub (burndown/velocity/cycle-time/throughput/WIP/CFD)  
`/projects/<id>/settings/fields` — custom field CRUD  
`/projects/<id>/settings/statuses` — status config  
`/projects/<id>/settings/views` — saved views management  

Task detail modal: router modal pattern — URL updates to `/projects/<id>/tasks/<id>`, background view preserved.

### CLI (auto-codegenned from tRPC, `--json` every command)

```
fulcrum tasks  list|get|create|update|delete|bulk|deps|comment  --project <id> [flags]
fulcrum sprints list|get|create|start|close                      --project <id> [flags]
  # close: [--unfinished-to-backlog | --unfinished-to-next]
fulcrum reports burndown|velocity|cycletime|throughput           --project <id> --sprint <id> [--json]
fulcrum views  list|get|create|delete                            --project <id> [--query-json]
fulcrum fields list|create|update                                --project <id> [--type] [--config-json]
```

### TUI (OpenTUI, Bun-native)

All panels consume tRPC in-process (no HTTP hop).

- **Tasks** — list rows; `b` ASCII board; `Enter` detail pane; `c` create inline.
- **Board** — ASCII kanban columns; `h`/`l` move status; `Enter` detail.
- **Sprints** — list; `p` planning split (backlog|sprint); `m` move task to sprint.
- **Active sprint** — board pane scoped to active sprint; capacity bar header.
- **Reports** — burndown/velocity/cycle-time/throughput ASCII charts via `asciichart`.
- **Fields/Views** — CRUD list for `custom_field_defs` + `saved_views`.

### API (tRPC always-on + gated OpenAPI)

tRPC namespaces: `tasks.*` (list/get/create/update/delete/bulkUpdate/addComment/listComments/addWatcher/setDependencies), `sprints.*` (list/get/create/start/close/addTask/removeTask), `reports.*` (burndown/velocity/cycleTime/throughput/wip/cumulativeFlow), `customFields.*` (list/create/update/archive/reorder), `savedViews.*` (list/get/create/update/delete/setDefault), `taskStatuses.*` (list/create/update/delete/reorder).

`FULCRUM_FEATURES=public-api` → each procedure gets `GET/POST/PATCH/DELETE /api/v1/…` via `@hono/zod-openapi`.

---

## Technical design

### Architecture

```mermaid
graph TD
    WEB[SvelteKit Web] -->|tRPC| TR[tRPC router tasks/sprints/reports/views]
    CLI[CLI --json] -->|tRPC| TR
    TUI[OpenTUI] -->|in-process tRPC| TR
    TR --> TDB[(PGlite tasks/sprints/metrics_cache)]
    TR --> GW[graphile-worker]
    GW -->|metrics rollup job| MC[metrics_cache upsert]
    MC --> TDB

    subgraph "Task graph"
        TASK[tasks] -->|parent_id| TASK
        TASK -->|sprint_id| SP[sprints]
        TASK -->|custom_fields jsonb| CF[custom_field_defs]
    end

    subgraph "Reports pipeline"
        EV[events WHERE verb=status_changed] -->|on-demand| RPT[reports.* tRPC]
        MC -->|cached reads| RPT
    end

    subgraph "Saved views"
        AST[SavedViewQuery AST] --> SQL[Filter AST to SQL WHERE]
        SQL --> TDB
    end
```

### Sequence: sprint close + metrics rollup

```mermaid
sequenceDiagram
    participant WEB as Web UI
    participant TR as tRPC sprints.close
    participant DB as PGlite
    participant GW as graphile-worker
    participant MJ as metrics-rollup job
    participant P7 as Pillar 7 docs.create

    WEB->>TR: sprints.close({sprintId, unfinishedDisposition})
    TR->>DB: UPDATE sprints SET status=completed
    TR->>DB: UPDATE tasks (unfinished -> backlog or next sprint)
    TR->>DB: INSERT events(verb=sprint.closed)
    TR->>GW: enqueue metrics-rollup(projectId, sprintId)
    TR->>P7: docs.create({doc_type:postmortem, sprint_id})
    P7-->>TR: {docId}
    TR-->>WEB: {sprint, retroDocId}
    GW->>MJ: execute metrics-rollup
    MJ->>DB: SELECT events WHERE subject_kind=task, verb=status_changed
    MJ->>DB: UPSERT metrics_cache (project_id, sprint_id, date, points_remaining...)
```

### ER diagram

```mermaid
erDiagram
    sprints {
        uuid id PK
        uuid org_id FK
        uuid project_id FK
        text name
        text status
        date start_date
        date end_date
        int capacity_points
    }
    custom_field_defs {
        uuid id PK
        uuid org_id FK
        uuid project_id FK
        text name
        text slug
        text type
        jsonb config_json
        boolean required
        boolean archived
        int position
    }
    saved_views {
        uuid id PK
        uuid org_id FK
        uuid project_id FK
        text scope
        text name
        jsonb query_json
        text view_type
        uuid created_by FK
    }
    metrics_cache {
        uuid id PK
        uuid project_id FK
        uuid sprint_id FK
        date date
        int points_remaining
        int completed_count
        int wip_count
    }
    task_statuses {
        uuid id PK
        uuid org_id FK
        uuid project_id FK
        text name
        text category
        int position
    }
    tasks }|--|| sprints : "sprint_id"
    tasks ||--o{ tasks : "parent_id"
    tasks }o--|| task_statuses : "status"
    metrics_cache }|--|| sprints : "sprint_id"
    custom_field_defs }|--|| projects : "project_id"
```

### Error model

| Code | Description | Propagated to | Recovery |
|---|---|---|---|
| `SPRINT_ALREADY_ACTIVE` | `sprints.start` when another active sprint exists | tRPC 400 | Close active sprint first |
| `CIRCULAR_DEPENDENCY` | `tasks.setDependencies` creates cycle | tRPC 400 | Fix dependency chain |
| `CUSTOM_FIELD_REQUIRED` | Required field missing on `tasks.update` | tRPC 400 + Web inline error | Provide required field value |
| `ROLLUP_JOB_FAILED` | graphile-worker metrics rollup throws | job retry; `events(verb=rollup.failed)` | On-demand reports still work; check logs |
| `FILTER_AST_INVALID` | `savedViews.create` with unparseable `query_json` | tRPC 400 | Fix filter AST; validate via `routing.dryRun` |
| `CONNECTOR_SYNC_FAILED` | Jira/Linear/GitHub fetch throws | `connector_sync_log(status=error)` | Check connector credentials; manual retry |

### Observability

| Signal | Name | Fields |
|---|---|---|
| OTel span | `fulcrum.sprint.close` | `sprint_id`, `unfinished_count`, `disposition` |
| OTel span | `fulcrum.metrics.rollup` | `project_id`, `sprint_id`, `rows_upserted`, `duration_ms` |
| OTel span | `fulcrum.tasks.bulkUpdate` | `task_count`, `action`, `duration_ms` |
| Log event | `sprint.closed` | `sprint_id`, `completed_points`, `total_points`, `retro_doc_id` |
| Log event | `metrics.rollup.cached` | `project_id`, `date_rows_written` |

### Performance budgets

| Operation | p50 | p95 |
|---|---|---|
| Kanban 200 tasks cold load | <150 ms | <300 ms |
| Burndown from `metrics_cache` | <50 ms | <100 ms |
| `TanStack Virtual` 1000 tasks | <100 ms | <200 ms |
| Sprint close mutation | <500 ms | <1 s |
| Filter AST to SQL + query | <30 ms | <100 ms |

## Doctor integration

Subsystem: `tasks`

```typescript
const DoctorTasksCheck = z.object({
  subsystem: z.literal('tasks'),
  checks: z.array(z.object({
    id: z.string(),
    status: z.enum(['pass', 'warn', 'fail']),
    message: z.string(),
    durationMs: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
  })),
  ok: z.boolean(),
});
```

| Check ID | What it verifies | Failure recovery |
|---|---|---|
| `tasks.schema.sprints` | `sprints` table present with unique active index | Run migration 0006 |
| `tasks.schema.custom-fields` | `custom_field_defs` table present | Run migration 0006 |
| `tasks.schema.saved-views` | `saved_views` table present | Run migration 0006 |
| `tasks.schema.metrics-cache` | `metrics_cache` table present | Run migration 0006 |
| `tasks.statuses.defaults` | At least one project has default status set seeded | Trigger project create or run seed |
| `tasks.rollup-worker.running` | `graphile-worker` queue accessible; metrics job registered | Check Pillar 1 graphile-worker setup |
| `tasks.connector-sync.errors` | Count of `connector_sync_log` rows with `status=error` in last 24h | Check connector credentials and fix |

## Dependencies

| Depends on | What we need |
|---|---|
| **Pillar 1** | `orgs/projects/users/org_members` tables; feature flag eval; Better-Auth middleware; graphile-worker queue (metrics rollup). |
| **Pillar 4** (TipTap) | Task description shares TipTap instance; sprint retro doc creation via Pillar 4 doc-create API. |
| **Pillar 7** (docs taxonomy) | Sprint close → `doc_type='postmortem'`. If Pillar 7 not shipped: emit `sprint.closed` event; Pillar 7 adds listener. |
| **Pillar 9** (notifications) | PRD 6 emits watcher/mention events; Pillar 9 fan-out routes them. |
| **Pillar 10** (search) | PRD 6 calls index-write helper on task create/update; Pillar 10 owns FTS indexer. |
| **Pillar 11** (inference sidecar) | Gated: LLM sprint summary (`router-llm`) + task embeddings (`embeddings`). |

---

## Issues breakdown (TDD-numbered)

TDD cycle: failing test → implement → green → refactor.

**Foundation**
- `T6-01` Migration: `sprints`, `task_statuses`, `custom_field_defs`, `saved_views`, `metrics_cache` + tasks ALTER. Tests: schema round-trip, unique indexes, FK cascade.
- `T6-02` tRPC `tasks.*` extended (sprint_id, custom_fields, parent_id, dependencies, points). Tests: CRUD, Zod validation.
- `T6-03` tRPC `taskStatuses.*` CRUD + reorder. Tests: default seeding on project create, at-least-one-completed guard.
- `T6-04` tRPC `sprints.*` CRUD + start + close. Tests: at-most-one-active, close moves unfinished tasks, emits `sprint.closed`.
- `T6-05` tRPC `customFields.*` CRUD + reorder + archive. Tests: defaults seeded, archived values preserved.
- `T6-06` tRPC `savedViews.*` CRUD + setDefault. Tests: scope permission checks (private=owner; project=members; org=org).
- `T6-07` tRPC `reports.*` on-demand. Tests: burndown ideal-line formula, velocity 3-sprint rollup, cycle-time median.
- `T6-08` graphile-worker metrics rollup job. Tests: cache invalidation on status_changed, idempotent re-run, date row upsert.
- `T6-09` Filter AST `src/filters/ast.ts` → SQL WHERE. Tests: all 8 operators, `custom_fields->>'slug'` filter, FTS, facets.

**Web — task detail**
- `T6-10` Detail modal (router modal). Tests: URL update, background view preserved, Escape closes.
- `T6-11` Detail full-page route. Tests: SSR render, all sections visible.
- `T6-12` TipTap description. Tests: autosave debounce, wikilink + mention parse.
- `T6-13` Subtask tree UI. Tests: create child, breadcrumb, infinite nesting render.
- `T6-14` Dependencies UI. Tests: add/remove, blocked badge, circular dependency reject.
- `T6-15` Activity feed. Tests: append on status_changed, comment render, pagination.
- `T6-16` Comments thread. Tests: create/edit/delete, reactions, markdown.
- `T6-17` Custom fields renderer. Tests: each type renders correct input, required blocks save.
- `T6-18` Keyboard shortcuts. Tests: each key triggers correct action.
- `T6-19` Attachments. Tests: upload → artifact row + edge row, preview render.

**Web — views**
- `T6-20` Kanban board. Tests: card render, DnD column change, swimlane toggle.
- `T6-21` Kanban card mini-detail: avatar, priority badge, labels, blocked badge, points.
- `T6-22` Table/backlog (TanStack Table). Tests: sort, filter, group-by, column visibility, inline edit.
- `T6-23` Calendar view. Tests: task by due_date, drag-to-reschedule.
- `T6-24` Gantt/Timeline (svelte-gantt). Tests: bars by start/end, dependency arrows, drag reschedule.
- `T6-25` List view (TanStack Virtual). Tests: 1000+ tasks no blank rows, click opens detail.
- `T6-26` Bulk operation bar. Tests: shift+click range, cmd+click toggle, bulk status/assign/delete.
- `T6-27` Saved views filter builder. Tests: add/remove chip, save view, load restores state.
- `T6-28` View switcher tabs. Tests: persists last-used view.

**Web — sprints**
- `T6-29` Sprint list page. Tests: status grouping, velocity sparklines.
- `T6-30` Sprint planning board. Tests: drag to sprint, capacity bar, over-capacity warning.
- `T6-31` Active sprint Kanban. Tests: header fields, quick-add inline.
- `T6-32` Sprint close modal. Tests: task disposition, retro doc creation (mock P7), status update.

**Web — reports**
- `T6-33` Burndown (LayerChart). Tests: ideal line, actual from metrics_cache, sprint-day x-axis.
- `T6-34` Velocity (LayerChart stacked bar). Tests: 3-sprint window, committed vs completed.
- `T6-35` Cycle-time histogram. Tests: median/p75/p95 overlaid.
- `T6-36` Throughput. Tests: 12-week window, tasks/week aggregation.
- `T6-37` WIP counter. Tests: current `started` count, 7d sparkline.
- `T6-38` Cumulative flow. Tests: one band per status category, correct stacking.

**Web — settings**
- `T6-39` Fields tab. Tests: create/reorder/archive, type-specific config form.
- `T6-40` Statuses tab. Tests: add/reorder/color/delete, at-least-one-completed guard.
- `T6-41` Saved Views tab. Tests: list, set default, share to org, delete.

**CLI**
- `T6-42` `fulcrum tasks *`. Tests: `--json` all verbs, flag aliases, error messages.
- `T6-43` `fulcrum sprints *`. Tests: start/close flow, interactive disposition for unfinished tasks.
- `T6-44` `fulcrum reports *`. Tests: JSON schema matches tRPC return, `--sprint` filter.
- `T6-45` `fulcrum views *` + `fulcrum fields *`.

**TUI**
- `T6-46` Tasks panel (list+ASCII board). Tests: 50 tasks render, `b` toggle, `Enter` detail pane.
- `T6-47` Task detail pane. Tests: all sections, edit flow (title/status/assignee).
- `T6-48` Sprints panel + planning split. Tests: `m` moves to sprint, capacity bar updates.
- `T6-49` Reports panel ASCII charts. Tests: burndown + velocity render from cache.

**Gated**
- `T6-50` `report-llm-narration`: sprint summary. Tests: OFF → no LLM call; ON → sidecar called with metrics payload, narrative appended to retro doc; backend override syntax `report-llm-narration:ollama` routes to correct provider.
- `T6-51` `embeddings`: task embed on create/update. Tests: OFF → no write; ON → column populated.
- `T6-52` `public-api`: REST tasks/sprints/reports. Tests: OpenAPI spec valid, auth required, correct status codes.
- `T6-53` `real-time-collab-server`: task description Yjs binding. `tasks.description` TipTap field wired to Yjs Doc; Hocuspocus in-process server manages room keyed by `task_id`; collab cursor overlay shows collaborator name + colour. Tests: two clients connect → edits converge, cursor positions broadcast; flag OFF → TipTap standalone (no Hocuspocus connection). Cross-ref Pillar 5 which owns Hocuspocus server lifecycle.
- `T6-54` Connector framework scaffolding (shared, required before per-connector adapters). `src/connectors/framework.ts`: ETL pipeline base class with `fetch() → UpsertTaskInput[]`; idempotent upsert on `(org_id, external_id)`; `connector_sync_log(id, connector, status, last_run_at, error)` table; `graphile-worker` job per connector; doctor check per enabled connector.
- `T6-55` `connector-jira`: Jira REST adapter. Auth: `JIRA_HOST` + `JIRA_EMAIL` + `JIRA_API_TOKEN`. Fetches issues via `/rest/api/3/search`; maps issue type/status/priority/assignee/labels to Fulcrum fields; `external_id='jira:<key>'`. Tests: mock Jira API → upserts tasks correctly; duplicate run = no-op; status map config.
- `T6-56` `connector-linear`: Linear GraphQL adapter. Auth: `LINEAR_API_KEY`. Fetches issues via `issues(filter: {team:{key:{eq:$team}}})` query; maps state/priority/cycle to sprint; `external_id='linear:<uuid>'`. Tests: mock GraphQL → upserts; cursor-based pagination; delta sync on re-run.
- `T6-57` `connector-github-issues`: GitHub REST adapter. Auth: `GITHUB_TOKEN` + `GITHUB_REPO`. Fetches issues + labels + milestones; maps milestones to sprints; `external_id='github:<number>'`. Tests: mock GitHub API → upserts; label→tag mapping; milestone→sprint matching.
- `T6-58` Connector CLI surface. `fulcrum connectors list|sync <name>|status <name>` — all `--json`. `fulcrum doctor` reports each enabled connector's last sync time + error.
- `T6-59` Connector Web surface. `/settings/connectors` — list enabled connectors, last sync, manual sync button, per-connector config form (host/token fields, masked). TUI: `/connectors` panel, `s` = manual sync.

---

## Failure gates

See Tech stack table above. Additional:
- `graphile-worker` not available (Pillar 1) → on-demand only; cache job added when Pillar 1 ships.
- `svelte-gantt` dependency arrows too limited → `vis-timeline` imperative wrapper (~1 day).

---

## Acceptance criteria

All three surfaces (Web + CLI + TUI) must pass before done.

**Task CRUD + fields** — Web: CRUD all core fields + custom fields; CLI: `tasks create/get` `--json` validates Zod schema; TUI: list + detail pane persists via tRPC.

**Status config** — Web: add/reorder/color/delete; default seeded; CLI: `--status <name>` accepts custom names; TUI: board columns reflect custom statuses.

**Subtasks + dependencies** — Web: create child + breadcrumb; blocks/blocked-by; circular rejected; CLI: `tasks deps <id>` ASCII tree; TUI: detail pane shows subtask + dependency lists.

**Sprint CRUD + planning** — Web: create sprint, drag-to-sprint, capacity bar, one-active enforced; CLI: `sprints start/close` round-trip; TUI: planning split, `m` moves task, capacity bar visible.

**Burndown + reports** — Web: burndown ideal vs actual from metrics_cache, velocity 3 sprints; CLI: `reports burndown --json` returns `{date,pointsRemaining,ideal}[]`; TUI: ASCII burndown renders.

**Custom fields** — Web: create select field, task detail renders, filter-by-custom-field in table view; CLI: `fields create --type select`, `tasks list --json` includes `custom_fields`; TUI: detail shows custom fields section.

**Saved views** — Web: build filter, save, reload URL → same filter; share project scope; CLI: `views create/list` round-trip; TUI: selecting view filters tasks list.

**Bulk ops** — Web: shift+click range, bulk status/assign; CLI: `tasks bulk --action status`; TUI: Space multi-select, `B` bulk menu.

**Gated (both OFF + ON tested):**
- `report-llm-narration` OFF: retro doc has no LLM narrative; ON: narrative appended to retrospective doc.
- `real-time-collab-server` OFF: TipTap standalone (no collab cursor, no Hocuspocus); ON: two browser tabs converge edits, collab cursor visible.
- `connector-jira` OFF: no Jira sync job; ON: `fulcrum connectors sync jira` imports issues, idempotent re-run.
- `connector-linear` OFF: no Linear sync; ON: `fulcrum connectors sync linear` imports issues.
- `connector-github-issues` OFF: no GitHub Issues sync; ON: `fulcrum connectors sync github-issues` imports issues + labels.
- `embeddings` OFF: no embed write; ON: column populated.
- `public-api` OFF: `/api/v1/tasks` → 404; ON: returns tasks with valid OpenAPI schema.

**Performance baselines:**
- Kanban 200 tasks × 7 columns < 300ms cold load.
- Table/backlog 1000 tasks via TanStack Virtual — no blank rows.
- Burndown chart from metrics_cache < 100ms.
- svelte-gantt 6-month timeline — no scroll jank.
