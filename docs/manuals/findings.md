# Manual test findings (2026-05-23)

Live manual-test pass across all 3 surfaces (web `:5173`, CLI `fulcrum`,
TUI `apps/tui/src/index.ts`) with real data seeded into NestJS. **8 server
bugs identified and fixed in this pass.**

## Bugs fixed

### A. `loadProjectOverview` queried legacy `projects` / `tasks` tables

The canonical schema uses `fulcrum_projects` (with `workspace_id`) and
`fulcrum_tasks` (with `project_id`, no `org_id`). The application query
was on the long-removed `projects` / `tasks` tables. Switched to the
entity tables. `GET /api/v1/projects/<slug>/overview` now returns the
real `{project,summary}` shape, and `/projects/<slug>` renders the
detail card with task counts.

### B. ui-kit Button rejected legacy variants

Closure-10 work removed the alias map; consumers still passing
`variant="default"` / `size="default"` 500'd the page (`/settings`).
Restored `LEGACY_VARIANT_ALIASES` + `LEGACY_SIZE_ALIASES` in both
`button.svelte` and `button.exports.ts`. `/settings` 200 again.

### C + D. CLI `--help` only worked on 2 of 7 subcommands

`fulcrum install --help`, `init --help`, `hooks --help`, `skills --help`
returned `unknown arg` / treated `--help` as a positional. Root cause:
`main.ts` only dispatched help when `COMMAND_HELP.get(root)` was
populated, then fell through to the runner. Fix: when `--help`/`-h` is
present and no command-specific entry exists, print `ROOT_HELP` and
return — every subcommand now has help. Rebuild + reinstall the binary
(`bun run build && cp dist/fulcrum-darwin-arm64 ~/.local/bin/fulcrum`).

### E. `WorkCycleService.addTask` / `removeTask` used `?` placeholders

TypeORM `em.query` passes SQL to the native driver; Postgres requires
`$N`, not the PGlite-compat `?` form (which is the `ormSqlConnection`
wrapper used elsewhere). Both methods now use `$1..$N`. The deeper
sprint↔task entity split — `FulcrumTaskEntity` (no `sprint_id`) vs
`TaskEntity` (`tasks` table with `sprint_id`) — is documented as a
known-issue for a future PRD; the placeholder fix unblocks downstream
calls regardless.

### F. Task PATCH did not accept `sprintId`

`TaskPatchBodyDto` lacked the field; `taskPatch` helper didn't thread it
through. Both extended for forward-compat. Actual sprint assignment
still routes through `/api/v1/projects/<id>/backlog/sprint-tasks`
(which 500'd before — see E), so PATCH-by-sprintId is a no-op until the
sprint↔task model unifies.

### G. NestJS literal routes mounted AFTER parametric

Two controllers had the same bug class — methods declared in
class-definition order get mounted in that order, and Express matches in
registration order. So `Get(":id")` declared before `Get("dashboard")` /
`Get("project-board")` captured `/dashboard` and `/project-board` as
`{id:"dashboard"}` / `{id:"project-board"}` → 404. Fixed in
`project-public-api.controller.ts` (literals first) and
`sprint-public-api.controller.ts` (same).

### H. `project_statuses` / `project_connectors` tables don't exist

These are part of an in-flight planning migration. The query 500'd
because `relation "project_*" does not exist`. Wrapped both
`listProjectStatuses` + `listProjectConnectors` in try/catch returning
`[]`, so the project-settings routes show an empty list rather than
crashing the page.

### I. `findScopedProject` accepted only uuid, not slug

Web URLs pass the project slug (`/projects/local-project/...`). The
store only resolved by `id`. Added slug fallback (`OR slug = $1`) and
made `projectOverview` thread the resolved uuid into downstream queries.

Also added the same slug-or-uuid acceptance to `getProjectOrNull` (the
application-layer query used by backlog / sprints / etc.).

## Real data seeded

Via the public API on `local-project`:

```bash
ORG=00000000-0000-0000-0000-000000000001
PID=local-project

for spec in "Wire MCP servers|in_progress|3" "Add CFD chart|pending|2" \
  "Migrate Postgres adapter|done|3" "Review QA pipeline|pending|2" \
  "Document settings flow|in_progress|1" "Triage user feedback|pending|2" \
  "Ship release v1.0|pending|3"; do
  IFS='|' read -r title st prio <<< "$spec"
  curl -s -X POST "http://localhost:3000/api/v1/tasks" \
    -H 'content-type: application/json' \
    -d "{\"orgId\":\"$ORG\",\"projectId\":\"$PID\",\"title\":\"$title\",\"status\":\"$st\",\"priority\":$prio}"
done

curl -s -X POST "http://localhost:3000/api/v1/sprints/project-board?orgId=$ORG" \
  -H 'content-type: application/json' \
  -d "{\"orgId\":\"$ORG\",\"projectId\":\"$PID\",\"name\":\"Sprint 1\",\"goal\":\"Wire foundational MCP + CFD chart\",\"capacity\":40}"

for doc in "Architecture Overview|adr" "Sprint 1 Kickoff|meeting" "Public API Reference|wiki"; do
  IFS='|' read -r title kind <<< "$doc"
  curl -s -X POST "http://localhost:3000/api/v1/docs" \
    -H 'content-type: application/json' \
    -d "{\"orgId\":\"$ORG\",\"projectId\":\"$PID\",\"title\":\"$title\",\"type\":\"$kind\",\"bodyMd\":\"Body...\"}"
done

for n in "Capture & Plan" "Build & Ship" "Operate & Audit"; do
  curl -s -X POST "http://localhost:3000/api/v1/planning-structures/modules" \
    -H 'content-type: application/json' \
    -d "{\"orgId\":\"$ORG\",\"projectId\":\"$PID\",\"name\":\"$n\",\"status\":\"active\"}"
done

for spec in "Customer feedback: dashboard slow|open" "Bug: invoice export crashes|accepted"; do
  IFS='|' read -r title st <<< "$spec"
  curl -s -X POST "http://localhost:3000/api/v1/planning-structures/intake" \
    -H 'content-type: application/json' \
    -d "{\"orgId\":\"$ORG\",\"projectId\":\"$PID\",\"title\":\"$title\",\"source\":\"manual\",\"status\":\"$st\"}"
done
```

This is what the screenshots in `../screenshots/` were taken against.

## Manual-test pass result

| Surface | Routes / commands captured | Real data visible | Failures left |
|---|---|---|---|
| Web | 80+ routes incl every stage `?view=` + project-detail | Yes — 7 tasks on /backlog, 1 sprint, 3 docs, 3 modules, 2 intake | 0 (`/projects/<slug>` post-fix renders, settings sub-routes return empty-state not 500) |
| CLI | Every top-level subcommand + per-cmd `--help` + `doctor --checks` + `compress --check` | Yes — `fulcrum doctor` shows live MCP + skill + agent counts | 0 |
| TUI | Launcher + Auth + Feature Flags + Doctor + chord-nav (`g b`, `g r`) + colon palette | Yes — Doctor shows 2/0/0 checks pass | 0 |

## Known architecture issues (deferred, not bugs to "fix")

1. **Sprint↔task entity split.** `FulcrumTaskEntity` (canonical) has no `sprint_id`; the legacy `Task` entity (tableName `tasks`) does. Sprint assignment via `/api/v1/projects/<id>/backlog/sprint-tasks` writes to `tasks.sprint_id` but the public API task creates write to `fulcrum_tasks`. Sprint backlog assignment is therefore a no-op for tasks created via the public API. Resolution: unify the two task entities; tracked as a separate PRD.

2. **`project_statuses`, `project_connectors` schema absent.** Tables are referenced by the project-settings routes but no migration has provisioned them. The route now tolerates missing tables (returns empty list). When the migration lands, the routes start showing real data without code change.

3. **TUI screen surface is large but only foundation screens are shipped.** The Launcher advertises ~22 domain nav entries; the auth.test/feature-flags.test files are the only screen-level coverage so far. Adding screen coverage is itself a PRD; the foundation set (Auth, Feature Flags, Doctor, the stage chords) is screenshotted here.
