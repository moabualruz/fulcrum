# User Journeys — Test Scenarios

Each journey describes a real user workflow end-to-end. These map to Phase 7
cross-surface E2E tests. Every step is a testable assertion.

---

## J01: First-time local setup

**Persona:** Solo developer installing Fulcrum for the first time.

```
1. Run `fulcrum product init`
   → Creates ~/.fulcrum/state/product/db/main
   → Runs all migrations (42 files, 0 errors)
   → Seeds default org (slug=default, name=Local)
   → Prints "Product kernel initialized"

2. Run `bun run dev` (or `fulcrum web`)
   → Dev server starts on :5173
   → No auth redirect (dev mode)
   → Dashboard loads: 0 projects, 0 tasks, 0 docs, 0 runs

3. Navigate to /projects → "No projects yet"
4. Navigate to /doctor → all subsystems listed, ≥14 OK
5. Navigate to /settings/theme → theme controls render
```

**Assertions:** No crashes, no 500s, no login wall, empty states render.

---

## J02: Project + task lifecycle

**Persona:** User creating their first project and tasks.

```
1. Web: /projects → "New Project" → name="My App", slug="my-app" → Create
   → Redirects to /projects/my-app
   → Sidebar shows "My App" under Projects

2. Web: /projects/my-app/board → empty kanban columns (Todo, In Progress, Done)

3. CLI: `fulcrum tasks create --title "Set up CI" --project my-app --json`
   → Returns {id, title, status: "todo", projectId}

4. Web: refresh /projects/my-app/board → "Set up CI" card in Todo column

5. Web: drag card to "In Progress" (or click → change status)
   → Card moves to In Progress column
   → `fulcrum tasks list --project my-app --json` shows status: "in_progress"

6. CLI: `fulcrum tasks update <id> --status done`
   → Web board refreshes → card in Done column

7. Web: /projects/my-app → task count shows 1 completed
```

**Assertions:** Create via CLI → visible on web. Update via web → visible in CLI.
Kanban board renders with correct columns. Status transitions work bidirectionally.

---

## J03: Sprint planning + close + burndown

**Persona:** Scrum master planning a sprint.

```
1. Web: /projects/my-app → Sprints tab → "New Sprint"
   → name="Sprint 1", startDate=today, endDate=+14d → Create
   → Sprint board shows Sprint 1 (planned)

2. Web: assign 5 tasks to Sprint 1 (drag from backlog or bulk assign)
   → Sprint board shows 5 items, 0 completed

3. Complete 3 tasks over the sprint period (status → done)

4. Web: Sprint 1 → "Close Sprint" button → close modal appears
   → 2 incomplete tasks → disposition selector: [Backlog] [Next Sprint]
   → Select "Backlog" → Confirm
   → Sprint status = completed
   → 2 tasks moved to backlog (sprint_id = null)
   → Metrics snapshot created (completed=3, remaining=2)

5. Web: /projects/my-app/reports → burndown chart renders
   → Shows velocity, completed count, points

6. CLI: `fulcrum sprints list --project my-app --json`
   → Sprint 1: status=completed, completed_count=3
```

**Assertions:** Sprint lifecycle (plan → active → close). Disposition works.
Burndown data accurate. Metrics snapshot has valid UUID (gate fix F1-B).

---

## J04: Document creation + versioning + search

**Persona:** User writing project docs.

```
1. Web: /docs → "New Document" → title="Architecture", type=decision
   → TipTap editor loads
   → Type "## Overview\nThis is our architecture doc"
   → Save (Ctrl+S or autosave)

2. Web: edit again → add "## Database\nWe use PGlite locally"
   → Save → version 2 created

3. Web: /docs/<id>/history → version list shows v1 and v2
   → Click v1 → diff shows what changed between v1 and v2

4. CLI: `fulcrum docs list --json` → shows "Architecture" doc
5. CLI: `fulcrum search "PGlite" --json` → returns Architecture doc in results

6. Web: /search → type "PGlite" → Architecture doc appears in results
   → Click → navigates to doc detail
```

**Assertions:** Doc CRUD works. Version history records changes.
Search indexes doc content. CLI and web search return same results.

---

## J05: Agent run + artifacts + monitoring

**Persona:** User dispatching an agent run.

```
1. Web: /agents → agent list shows registered profiles
   → Click "Dispatch" on an agent → modal opens
   → Select task → Submit

2. Web: /runs → new run appears with status "queued"
   → Status updates: queued → claimed → running → completed

3. Web: /runs/<id> → run detail shows:
   → Log output (streaming or final)
   → Duration, token usage
   → Artifacts tab: files produced by the run

4. CLI: `fulcrum runs list --json` → shows the run
5. CLI: `fulcrum runs logs <id>` → prints log output

6. Web: /orchestration → dashboard shows run in completed queue
```

**Assertions:** Run lifecycle visible on web. Artifacts attached.
CLI can retrieve run data. Orchestration dashboard reflects state.

---

## J06: Notification pipeline

**Persona:** User receiving notifications from system events.

```
1. Setup: create a notification rule (Settings → Notifications → New Rule)
   → event_pattern="task.*", channel="in-app"

2. Trigger: create a task via CLI
   → `fulcrum tasks create --title "Test task"`
   → Event: task.created fires

3. Web: /inbox → "For you" tab → notification appears
   → Shows "Task created: Test task"
   → Bell badge shows 1

4. Web: click "Mark all read" → bell badge clears → notification grayed

5. Web: /audit → filter kind=task → shows task.created event
   → Export CSV → downloads file with event data

6. CLI: `fulcrum notifications list --json` → shows the notification
7. CLI: `fulcrum audit query --kind task --json` → shows the event
```

**Assertions:** Event → rule match → notification delivery → UI display.
Bell badge count. Mark-read. Audit log query. CSV export.

---

## J07: Memory + context pipeline

**Persona:** Agent run that produces memory, which is retrieved later.

```
1. Agent run completes → heuristic extractor fires
   → Extracts fact: "Project uses TypeScript + Bun"
   → Memory entity created

2. Web: /memory → memory list shows the fact
   → Click → detail view shows source (run ID), importance, content

3. Next agent run starts for same project
   → Context assembler retrieves relevant memories
   → "Project uses TypeScript + Bun" included in context window

4. CLI: `fulcrum memory list --json` → shows the fact
5. CLI: `fulcrum memory search "TypeScript" --json` → returns the fact
```

**Assertions:** Extraction hooks fire. Memory persisted. Retriever finds it.
Context assembler includes it. CLI access works.

---

## J08: Backup + restore round-trip

**Persona:** User backing up and restoring their data.

```
1. Create some data: project, tasks, docs, memories

2. CLI: `fulcrum backup --output /tmp/fulcrum-backup.tar.gz`
   → Creates backup archive
   → Prints entity counts

3. Delete all data: `rm -rf ~/.fulcrum/state/product/db/main`

4. CLI: `fulcrum restore --input /tmp/fulcrum-backup.tar.gz`
   → Restores from archive
   → Prints restored entity counts

5. Web: verify data is back
   → Dashboard shows same project/task/doc counts
   → Specific task titles match
```

**Assertions:** Backup captures all entity types. Restore recreates them.
Data integrity preserved across round-trip.

---

## J09: Import from external tool

**Persona:** User migrating from Linear/Jira.

```
1. Web: /settings/importers → select "Linear" tab
   → Enter API key → "Test connection" → success
   → Select project to import → "Preview" → shows task count
   → "Import" → progress bar → complete

2. Web: /projects → imported project appears
   → Tasks have mapped fields (title, status, priority, assignee)
   → Custom fields contain source IDs (linear_issue_id)

3. CLI: `fulcrum import --format linear --api-key <key> --json`
   → Same import works from CLI
```

**Assertions:** API key validation. Preview shows counts. Import maps fields.
Source IDs preserved. CLI parity.

---

## J10: Connector sync (GitHub Issues)

**Persona:** User syncing GitHub issues into Fulcrum.

```
1. Web: /settings/connectors → GitHub Issues card → Configure
   → Enter repo URL + token → "Test connection" → success
   → "Sync now" → sync starts

2. Web: sync log shows progress → completed
   → Tasks created from GitHub issues
   → Labels mapped, assignees mapped

3. Create new GitHub issue externally
4. Web: "Sync now" again → new issue appears as task

5. Web: /audit → connector.synced event logged
```

**Assertions:** Connector config persists. Sync creates tasks. Re-sync is incremental.
Audit trail records sync events.

---

## J11: Feature flag gating

**Persona:** Admin toggling feature flags.

```
1. Web: /settings/feature-flags → flag list shows all flags
   → "i18n" is OFF → /settings/i18n returns 404

2. Toggle "i18n" ON
   → /settings/i18n now accessible → locale picker renders

3. Toggle "i18n" OFF
   → /settings/i18n returns 404 again

4. CLI: `fulcrum flags set i18n on`
   → Web: /settings/i18n accessible

5. Check consistency: every gated route returns 404 when its flag is OFF
```

**Assertions:** Flag toggle propagates to route visibility.
CLI and web flag changes are consistent. No leaky routes.

---

## J12: Repo integration + file browser

**Persona:** User browsing a supervised repository.

```
1. CLI: `fulcrum repos add --path /path/to/repo --name my-repo`
   → Repo registered, initial sync runs

2. Web: /repos → "my-repo" listed with branch count, last sync time

3. Web: /repos/<id>/files → file tree renders
   → Expand directory → children load lazily
   → Click file → syntax-highlighted content shown
   → Binary file → "Binary file" placeholder

4. Web: /repos/<id>/commits → paginated commit log
   → SHA monospace, author avatar, date

5. Web: /repos/<id> → branches listed, recent commits, linked tasks
```

**Assertions:** Repo registration works. File tree lazy-loads.
Syntax highlighting renders. Commit pagination works.

---

## J13: Theme customization

**Persona:** User customizing the UI theme.

```
1. Web: /settings/theme → theme controls render
   → Change accent color (HSL slider) → live preview updates
   → Switch dark/light/auto → mode changes
   → Toggle compact mode → spacing reduces
   → Select preset → all values update

2. Save → page reloads with new theme
3. Reset → defaults restored

4. Switch to Arabic locale (if i18n enabled)
   → dir="rtl" on <html>
   → Sidebar flips to right side
```

**Assertions:** Live preview works without save. Save persists across reload.
Reset restores defaults. RTL layout correct for Arabic.

---

## J14: Doctor health check

**Persona:** Operator diagnosing system health.

```
1. Web: /doctor → all 17 subsystems listed
   → Healthy system: ≥15 OK badges
   → Inference: FAIL if no API key → "Show recovery" → shows fix command
   → Memory: WARN if dir not initialized → "Show recovery" → shows fix

2. Click "Refresh now" → timestamps update without full page reload

3. Wait 30s → auto-refresh fires → timestamps update

4. CLI: `fulcrum doctor --json`
   → Same subsystems, same statuses
   → Exit code 0 if all ok/warn, 1 if any fail

5. Fix a failure → refresh → status changes to OK
```

**Assertions:** All subsystems rendered. Recovery hints shown.
Auto-refresh works. CLI output matches web. Exit codes correct.
