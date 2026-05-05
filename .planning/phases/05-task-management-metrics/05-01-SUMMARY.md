---
phase: 05-task-management-metrics
plan: "01"
subsystem: db-schema
tags: [migrations, entities, npm-packages, phase5-foundation]
dependency_graph:
  requires: []
  provides: [phase5-schema-foundation]
  affects: [05-02, 05-03, 05-04, 05-05, 05-06]
tech_stack:
  added:
    - layerchart
    - wx-svelte-gantt
    - "@event-calendar/core"
    - tinykeys
    - "@tanstack/svelte-table"
    - "@tanstack/svelte-virtual"
    - yjs
    - y-websocket
    - "@tiptap/extension-mention@3.22.5"
    - "@tiptap/extension-task-list@3.22.5"
    - "@tiptap/extension-placeholder@3.22.5"
    - "@tiptap/extension-collaboration@3.22.5"
    - "@tiptap/extension-collaboration-cursor@2.26.2"
    - asciichart
  patterns:
    - MikroORM Migration class with up()/down()
    - ADD COLUMN IF NOT EXISTS for idempotent DDL
    - DO $$ ... EXCEPTION for graceful pg_trgm fallback
    - Deferred FK pattern (column in migration 1, constraint in migration 2)
key_files:
  created:
    - src/db/migrations/Migration20260505100000_phase5_schema_extensions.ts
    - src/db/migrations/Migration20260505100001_phase5_schema_new_tables.ts
  modified:
    - src/web/package.json
    - package.json
    - bun.lock
    - src/web/bun.lock
    - src/db/entities/tasks/Task.ts
    - src/db/entities/tasks/Sprint.ts
    - src/db/entities/tasks/MetricsCache.ts
    - src/db/entities/core/Event.ts
    - src/db/entities/tasks/schemas.ts
    - src/db/tasks-schema-extension.test.ts
decisions:
  - "@svar/gantt-svelte does not exist on npm; used wx-svelte-gantt (SVAR's actual published package)"
  - "@tiptap/extension-collaboration-cursor has no 3.x release; installed latest 2.26.2"
  - "task_statuses category changed from cancelled to canceled to match plan spec"
  - "Web build failures (trpc-caller missing, inference page parse error) are pre-existing, not caused by plan 01 changes"
metrics:
  duration: ~25m
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 2
  files_modified: 10
---

# Phase 05 Plan 01: Phase 5 npm Dependencies + Schema Migrations Summary

Two ordered migrations creating the Phase 5 schema foundation, plus 13 web packages and 1 root package installed.

## What Was Done

### Task 1: npm Packages

Installed 14 packages total (13 web + 1 root). Two deviations from plan:
- `@svar/gantt-svelte` → `wx-svelte-gantt` (SVAR's actual npm package name)
- `@tiptap/extension-collaboration-cursor` → `2.26.2` (3.x does not exist for this extension)

Shadcn components (badge, command, dialog, popover) already present, skipped.

### Task 2: Migrations + Entity Extensions

**Migration 100000 (extensions)** — ALTER TABLE on 5 existing tables:
- `tasks`: +11 columns (due_date, start_date, started_at, assignee_id, labels, project_id, task_type, sequence_number, archived_at, template_id + task_type check constraint)
- `projects`: +6 columns (workflow_config, methodology, enabled_task_types, key, task_sequence, estimation_scale + methodology check constraint)
- `sprints`: +2 columns (retrospective_notes, closed_summary)
- `metrics_cache`: +4 columns (scope_type with workspace union, points_total, tasks_total, status_counts)
- `events`: +3 columns (field_name, from_value, to_value)
- `task_statuses`: category constraint updated to include backlog
- pg_trgm graceful fallback in DO block (T-05-03)

**Migration 100001 (new tables)** — CREATE TABLE for 9 tables:
task_comments, comment_reactions, task_watchers, task_relationships, project_automations, field_dependency_rules, yjs_snapshots, task_templates, task_recurrence_rules. Deferred FK tasks.template_id→task_templates added at end.

**Entity extensions:** Task, Sprint, MetricsCache, Event classes updated with @Property decorators matching DDL.

**schemas.ts additions:** TASK_STATUS_CATEGORIES (5, includes backlog), CUSTOM_FIELD_TYPES (9, includes checkbox), TASK_TYPES, METHODOLOGIES, HAS_TRGM flag.

## Deviations from Plan

**1. [Rule 1 - Bug] Package name correction: @svar/gantt-svelte → wx-svelte-gantt**
- Found during: Task 1
- Issue: `@svar/gantt-svelte` returns 404 on npm; SVAR's actual Gantt package is `wx-svelte-gantt`
- Fix: Installed `wx-svelte-gantt@2.6.1`
- Files modified: src/web/package.json, src/web/bun.lock

**2. [Rule 1 - Bug] TipTap collaboration-cursor version: 3.22.5 doesn't exist → 2.26.2**
- Found during: Task 1
- Issue: `@tiptap/extension-collaboration-cursor` has no 3.x releases; latest is 2.26.2
- Fix: Installed `@tiptap/extension-collaboration-cursor@2.26.2`
- Files modified: src/web/package.json

**3. [Rule 2 - Test fix] Updated test expectation for TASK_STATUS_CATEGORIES**
- Found during: Task 2 lint check
- Issue: Test expected old 4-element array with "cancelled"; plan specifies 5 elements with "canceled" (American spelling)
- Fix: Updated test in tasks-schema-extension.test.ts
- Files modified: src/db/tasks-schema-extension.test.ts

## Known Stubs

None — this plan creates DDL and installs packages only, no UI stubs.

## Threat Flags

None — no new network endpoints or auth paths introduced.

## Self-Check: PASSED

- Migration 100000 exists: FOUND
- Migration 100001 exists: FOUND
- Task.ts has dueDate/startDate/etc: FOUND
- MetricsCache scopeType includes workspace: FOUND
- schemas.ts has 5 status categories: FOUND
- Commits a3d3faec, 63d8fc36: FOUND (git log verified)
- bun run lint: PASSED (0 errors)
- Web build failures are pre-existing (verified via git stash test)
