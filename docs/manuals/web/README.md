# Web user manual (SvelteKit, port 5173)

The Fulcrum web is a **pure invocation layer** over the NestJS public API:
every page load + form action calls `/api/v1/*` on the backend at `:3000`.
URLs are stable. Mobile / cross-cutting routes are state previews of the
canonical surfaces listed below.

## Getting started

```bash
cd apps/server && bun run src/index.ts &                              # backend
cd apps/web    && FULCRUM_SERVER_URL=http://localhost:3000 bun run dev # web
open http://localhost:5173/
```

The root path lands on the **Portfolio** — the workspace's project list.
Pick a project; URLs then become
`/<workspaceId>/projects/<projectSlug>/<stage>`.

![Portfolio root](../screenshots/web/00-root.png)

## Workflow stages — `/<ws>/projects/<projId>/<stage>`

Six stages, one URL pattern. The header carries the StageRail tabs +
scope bar + trace identity.

### Capture — `…/capture`

Docs, drafts, promoted captures, inbox. Sub-views are `?view=docs|drafts|
promoted|inbox` projections — never standalone routes. Empty-state
primary action (`New document`) navigates to `/docs/new?project=<slug>`;
the Capture stage's project context preselects the owning project on the
doc-create wizard.

![Capture stage](../screenshots/web/40-stage-capture.png)
![Capture · drafts](../screenshots/web/41-stage-capture-drafts.png)
![Capture · promoted](../screenshots/web/42-stage-capture-promoted.png)
![Capture · inbox](../screenshots/web/43-stage-capture-inbox.png)

**Flow — create a doc from Capture:**
1. Click `New document` on the empty-state.
2. Pick a doc type from the wizard (ADR, meeting, wiki, runbook, …).
3. Click `Use template` → fill the title/labels/body → `Create document`.
4. Redirect to `/docs/<id>` showing the rendered doc.

### Plan — `…/plan`

AI-Assist planning workbench. Headline reads "AI Assist planning". Three
sub-views (`?view=prompts|prototypes|templates`) project the same plan
session.

![Plan stage](../screenshots/web/44-stage-plan.png)

### Build — `…/build`

Build board: tasks, dependency runs, manual workbench. Three view modes
(`?view=board|list|table`). Streams `tasks` + `manualWorkbench` from
`/api/v1/tasks` + `/api/v1/tasks/manual-workbench`. With the seeded data
the board renders 7 task cards (P3/P2/P1 across status columns).

![Build · board](../screenshots/web/48-stage-build.png)

### Review — `…/review`

Review queue: code review, QA, generated-e2e, final-QA workbenches. Each
review session is identified by `traceId`; persisted sessions load via
`/api/v1/workflows/review/workbench/session/load`. See the
[Review stage routes](#review-stage-routes) section below for the
production review surfaces (`/review`, `/review-queue`, `/review-search`,
`/review-templates`, `/comments`, `/comments-block-thread`).

![Review · queue](../screenshots/web/04-review.png)

### Ship — `…/ship`

Artifacts ready to ship: built docs, exported reports, release packages.
Read-model from `/api/v1/artifacts`. See the
[Ship stage routes](#ship-stage-routes) section below for the production
ship surfaces (`/ship`, `/ship-archive`, `/artifacts`).

![Ship · artifacts](../screenshots/web/05-ship.png)

### Operate — `…/operate`

Doctor + MCP + Plugins + Alerts + Telemetry + Budgets. Six sub-routes,
each its own URL:

| Sub-route | Screenshot |
|---|---|
| `/operate/doctor` | `59-operate-doctor.png` |
| `/operate/mcp` | `60-operate-mcp.png` |
| `/operate/plugins` | `61-operate-plugins.png` |
| `/operate/alerts` | `62-operate-alerts.png` |
| `/operate/telemetry` | `63-operate-telemetry.png` |
| `/operate/budgets` | `64-operate-budgets.png` |

![Operate · Doctor](../screenshots/web/24-operate-doctor.png) ![Operate · MCP](../screenshots/web/22-operate-mcp.png) ![Operate · Plugins](../screenshots/web/23-operate-plugins.png)

## Workspace routes (no project scope)

| Route | Purpose | Screenshot |
|---|---|---|
| `/projects` | All projects in the workspace; create / import / filter | `01-projects.png` |
| `/search` | Federated search across docs / tasks / runs / artifacts / memory | `02-search.png` |
| `/memory` | Persistent facts, decisions, references | `03-memory.png` |
| `/context/preview` | Inspect the context bundle for a project + task | `04-context-preview.png` |
| `/settings` | Account, workspace, secrets, feature flags, orchestration | `05-settings.png` |
| `/docs` | Global doc browser | `16-docs.png` |
| `/docs/new` | Doc creation wizard (preselects project via `?project=`) | `17-docs-new.png` |
| `/inbox` | Workspace inbox: notifications + handoffs | `15-inbox.png` |
| `/audit` | Audit log | `19-audit.png` |
| `/tasks` | Flat task list across the workspace (8 seeded) | `01-tasks-list.png` |
| `/runs` | All agent runs across the workspace | `21-runs.png` |
| `/agents` | Agent session workbench + dispatch | `20-agents.png` |
| `/boards` | Workspace-wide kanban across projects | `02-boards.png` |
| `/orchestration` | Orchestrator dashboard: dispatch / cancel / retry | `23-orchestration.png` |
| `/design-kit` | UI-kit primitive showcase | `24-design-kit.png` |
| `/doctor` | Workspace-level doctor | `26-doctor.png` |
| `/api-tokens` | API token management | `30-api-tokens.png` |
| `/members` | Workspace members | `31-members.png` |

## Settings sub-routes

| Route | Purpose |
|---|---|
| `/settings/secrets` | Credential vault entries |
| `/settings/feature-flags` | Toggle settings flags + rollout percent |
| `/settings/orchestration` | Workflow defs + orchestration config |
| `/settings/data` | Export / import workspace JSON |
| `/settings/backups` | Backup history + restore |
| `/settings/skills` | Installed skill packs (CLI parity: `fulcrum skills list --installed`) |
| `/settings/notifications` | Notification routing rules |
| `/settings/telemetry` | OpenTelemetry config |
| `/settings/ai-assist` | AI-Assist model + token defaults |

## Project-detail routes

`/projects/<slug>/{board,backlog,sprints,modules,intake,calendar,gantt,
repos,uat,review,reports,routing,e2e,updates,runs,settings/*}`.

Notable:
- **`/projects/<slug>`** — overview card with task counts + sprint days remaining (`70-proj-detail.png`).
- **`/projects/<slug>/backlog`** — backlog list + sprint panel; seeded sample shows 6 open tasks + Sprint 1 with 0/40 points (`72-proj-backlog.png`).
- **`/projects/<slug>/board`** — kanban with full task workbench (`71-proj-board.png`).
- **`/projects/<slug>/modules`** — module list (3 seeded: Capture & Plan, Build & Ship, Operate & Audit).
- **`/projects/<slug>/intake`** — intake queue (2 seeded: feedback, bug).

![Project · backlog with sprint](../screenshots/web/72-proj-backlog.png) ![Project · modules](../screenshots/web/74-proj-modules.png) ![Project · intake](../screenshots/web/75-proj-intake.png)

## Build stage routes (tasks, boards, runs, orchestration)

All build-stage URLs live on the workspace and consume the public API at
`/api/v1/*`. Most legacy flat routes (`/build-board`, `/build-graph`, …) are
308-redirected to the canonical `/{ws}/projects/{slug}/build/{sub}` paths via
`canonical-stage-redirect.ts`; we keep both addresses documented because the
legacy URLs still exist as OD design-preview surfaces.

### `/tasks`

[![Tasks list](../screenshots/web/01-tasks-list.png)](../screenshots/web/01-tasks-list.png)

Flat task list across the workspace. Server load calls `/api/v1/tasks` and
shows 8 seeded `manual-test-project` rows with id, title, priority badge and
canonical status pill (Pending / In progress / Completed). Each row links to
`/tasks/{id}`.

| Action | How (web) | How (CLI) | Notes |
|---|---|---|---|
| Create | `+` button (header) | `fulcrum task create` | POSTs `/api/v1/tasks` |
| Edit | open detail row | `fulcrum task patch <id>` | PATCH `/api/v1/tasks/{id}` |
| Delete | detail row Delete button | `fulcrum task delete <id>` | soft-delete sets `deletedAt` |

### `/tasks/{id}`

[![Task detail](../screenshots/web/93-task-detail.png)](../screenshots/web/93-task-detail.png)

Task workbench: title + status + priority header, description (Tiptap), Dependency
Run panel (agent / model / trace), Time Tracking, Save / Delete. Drives a real
seeded task (e.g. `1a0b16a9-…`). Lazy-loads the Tiptap editor and the
dependency-tree side panel.

### `/boards`

[![Workspace board](../screenshots/web/02-boards.png)](../screenshots/web/02-boards.png)

Workspace-wide kanban. Reads `/api/v1/tasks/board` through `TaskPublicStore`
(canonical `fulcrum_tasks`, slug-or-UUID resolver). Columns are the canonical
status set: Pending · In progress · Blocked · Completed · Cancelled. Seeded
`manual-test-project` renders 3/3/0/2/0 across columns. Header view-switcher
exposes List · Table · Gantt · Calendar.

| Action | How (web) | How (CLI) | Notes |
|---|---|---|---|
| Create | `+ Add task` button per column | `fulcrum task create --status <s>` | column status preselects |
| Move status | drag card between columns | `fulcrum task patch <id> --status <s>` | conflicts return 409 |
| Bulk status | row select + `Bulk` menu | `fulcrum task patch …` | `bulkStatus` form action |
| Delete | row context menu | `fulcrum task delete <id>` | `bulkDelete` form action |

### `/build-graph` and `/agent-dependency-board` (design preview)

[![Build · graph](../screenshots/web/03-build-graph.png)](../screenshots/web/03-build-graph.png)

Legacy URLs that 308-redirect to canonical `/{ws}/projects/fulcrum/build/graph`.
The graph itself is the OD design-preview fixture (AUTH-43 chain, 8 nodes,
Sugiyama layered): hard-coded for visual parity, **not** wired to the public
API. Canonical Build graph for live data is the same surface accessed via the
Build · Graph tab when the surface is rebuilt against `/api/v1/tasks/board`
edges. Do not rewrite the fixture from this audit.

### `/build-board` (design preview)

[![Build · board](../screenshots/web/04-build-board.png)](../screenshots/web/04-build-board.png)

OD design-preview kanban (AUTH-42 / AUTH-43 fixture). 308-redirects to
canonical `/{ws}/projects/fulcrum/build/board`. The live Build board is
`/boards` above; this surface stays fixture-only.

### `/build-list` (design preview)

[![Build · list](../screenshots/web/94-build-list.png)](../screenshots/web/94-build-list.png)

OD design-preview list view (FUL-1284 … FUL-1310 fixture). 308-redirects to
`/{ws}/projects/fulcrum/build/list`. Fixture-only.

### `/build-timeline` (design preview)

[![Build · timeline](../screenshots/web/95-build-timeline.png)](../screenshots/web/95-build-timeline.png)

OD design-preview Gantt. 308-redirects to `/{ws}/projects/fulcrum/build/gantt`.
Fixture-only.

### `/build-runs` (design preview)

[![Build · runs](../screenshots/web/96-build-runs.png)](../screenshots/web/96-build-runs.png)

OD design-preview runs feed (AUTH-43 with transcript and diffs).
308-redirects to `/{ws}/projects/fulcrum/build/runs`. Fixture-only; the live
runs list is `/runs` below.

### `/agents`

[![Agents · session workbench](../screenshots/web/20-agents.png)](../screenshots/web/20-agents.png)

Workspace agents surface — Session workbench + Connect to agent form (Mode:
Planning · Build · Review; Runtime: Agent default · Fast · Deep). Empty state
copy: "No saved sessions yet. Create a new session to Begin." Sessions are
persisted by AI-Assist; "No agents configured" until an agent profile is added.

| Action | How (web) | How (CLI) | Notes |
|---|---|---|---|
| Start session | `Create Session` button | `fulcrum agent session create` | mode + runtime form |
| Connect agent | `Connect to agent` panel | `fulcrum agent add <name>` | requires command / URL |

### `/runs`

[![Agent runs](../screenshots/web/21-runs.png)](../screenshots/web/21-runs.png)

Live agent runs across the workspace. Load reads `/api/v1/runs/page-data`.
With zero seeded runs the view shows the empty state "No agent runs match
the current filters." Header has Search, Dispatch (project · kind · agent
selector + Dispatch button), and Live run controls (`Reassign agent`).
Filter bar: agent · status · project · range · date-from · date-to.

| Action | How (web) | How (CLI) | Notes |
|---|---|---|---|
| Dispatch | Dispatch dropdown + button | `fulcrum run dispatch` | POSTs `/api/v1/runs` |
| Cancel | row context | `fulcrum run cancel <id>` | POSTs `/api/v1/runs/{id}/cancel` |
| Retry | row context | `fulcrum run retry <id>` | POSTs `/api/v1/runs/{id}/retry` |
| Reassign agent | `Reassign agent` button | n/a | live run only |

> **Known issue (BUG-runs-create):** `POST /api/v1/runs` currently 500s with
> `column FulcrumJob.trace_id does not exist`. The `JobQueue1778751000000`
> migration defines the column but existing PGlite stores were created before
> it was added. Re-run the migration set or drop `fulcrum_jobs` and re-init.
> Until then the empty-state screenshot is canonical.

### `/run-detail` · `/run-cancel` · `/run-fork` · `/run-cost-tracking` · `/run-rate-limits` · `/run-retry-policy` · `/run-retry-prompt`

[![Run detail](../screenshots/web/98-run-detail.png)](../screenshots/web/98-run-detail.png)

All seven legacy flat run-* routes 308-redirect to the canonical run-detail
surface `/{ws}/projects/fulcrum/build/runs/run_56e3d12` (an OD fixture
identifier). The redirect target is the Build · Runs surface, which shows
OBS-12 transcript, tool-call cards, inline diffs, and (when live) cancel /
fork / retry / cost / rate-limit / retry-policy / retry-prompt affordances on
the same page. Use the canonical URL pattern for new links; the legacy
addresses exist for back-compat only.

### `/orchestration`

[![Orchestration](../screenshots/web/23-orchestration.png)](../screenshots/web/23-orchestration.png)

Orchestrator dashboard. Stats row: Last tick · Worker (connected?) ·
Concurrency (used / max) · Last sync. Sections: Recent dispatches · Retry
queue. With no seeded jobs both sections show their empty state ("No
dispatches yet." / "No runs awaiting retry."). Filter by project.

| Action | How (web) | How (CLI) | Notes |
|---|---|---|---|
| Filter | Project select | `fulcrum orchestration list --project <slug>` | |
| Cancel dispatch | row context | `fulcrum run cancel <id>` | same path as `/runs` |
| Retry from queue | row context | `fulcrum run retry <id>` | same path as `/runs` |

## Cross-cutting affordances

- **Trace identity** — every page header carries a copy-trace-id button (`tr_…`).
- **Command palette** — `⌘K` everywhere; jumps to any stage / project / run / doc.
- **AI Assist** — `⌘/` opens chat in the status footer.
- **Keyboard shortcuts** — `?` shows the cheat-sheet overlay.
- **Theme + density** — gear next to notifications, persists per-user.

## Troubleshooting

- Page renders but a section says "Project could not load" → the slug isn't in the NestJS DB. List with `curl /api/v1/projects?orgId=<org>`. Seed via `POST /api/v1/projects`.
- A `/settings/*` sub-route returns 500 → check the server log; missing tables (`project_statuses`, `project_connectors`) now return `[]` rather than 500 so the page renders empty-state.
- `/projects/<slug>/sprints` is empty → expected: sprint↔task model is being unified across `FulcrumTaskEntity` (no sprint_id) and the legacy `Task` entity (has sprint_id). See [findings.md](../findings.md) bug E.
- Web has stale data → restart the NestJS server first (`lsof -ti:3000 | xargs kill -9; cd apps/server && bun run src/index.ts`). PGlite is single-writer; the web doesn't open it directly, but the data behind it lives in `~/.fulcrum/db/main`.
