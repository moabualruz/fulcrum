# Plan 01-06 Summary: Web Server Raw SQL Migration to MikroORM

## Status: COMPLETE

## What was done

Migrated all 17 web server files from `db: ProductDb` + `db.query()` (raw SQL via product-kernel) to `em: EntityManager` + `em.getConnection().execute()` (MikroORM connection layer).

### New files created
- `src/web/src/lib/server/em.ts` — `getEm()` helper providing forked EntityManager via `initOrm()` singleton
- `src/web/src/lib/server/orm-helpers.ts` — `appendEventOrm()`, `indexSearchDocumentOrm()`, `enqueueJobOrm()` replacing product-kernel raw SQL helpers

### Files migrated (17/17)
1. `tasks.ts` — create, update, delete, moveStatus
2. `documents.ts` — create, update, delete with search indexing
3. `skills.ts` — list, install, upgrade, uninstall, updateEnabledAgents, resolveConflict
4. `orchestration.ts` — dashboard, project runs, config, workflow defs
5. `doc-versions.ts` — create, list, get, restore with legacy table fallback
6. `reports.ts` — sprints, burndown, velocity, cycleTime, throughput, WIP, CFD
7. `dashboard.ts` — counters, recent activity, project tiles
8. `saved-views.ts` — create, update, delete, list
9. `audit.ts` — query events, retention policies
10. `task-detail.ts` — detail view, bulkUpdateStatus, bulkDelete
11. `memory.ts` — create, update, delete, get, list with search indexing
12. `project-statuses.ts` — create, update, delete, list
13. `project-connectors.ts` — upsert, sync, list
14. `custom-fields.ts` — create, update, archive, list
15. `runs.ts` — dispatch, cancel, retry with job enqueue
16. `agents.ts` — listProfiles, upsert, test
17. `artifacts.ts` — list, readDetail, delete, stats

## Architecture decision

MikroORM entities are currently partial stubs (many table columns not yet mapped in entity classes). Migration uses `em.getConnection().execute()` for raw SQL through the unified MikroORM connection pool rather than full entity operations. This achieves:

- **ARCH-01**: Single DB access layer (MikroORM EntityManager replaces ProductDb)
- **ARCH-02**: Unified connection management, transaction scoping, and pool sharing

As entity stubs are fleshed out in later plans, queries can progressively migrate from `conn.execute()` to `em.find()`/`em.create()`/`em.persistAndFlush()`.

## Commits
1. `dd6428ea` — em.ts, orm-helpers.ts, tasks, documents, skills, orchestration
2. `22b4a136` — doc-versions, reports, dashboard, saved-views
3. `3f5c775f` — audit, task-detail, memory, project-statuses
4. `0c8f3493` — project-connectors, custom-fields, runs, agents, artifacts

## Out of scope (not in plan 01-06 file list)
- `sprints.ts`, `settings.ts`, `repo-files.ts`, `projects.ts`, `doc-links.ts` still use ProductDb
