---
phase: 05
plan: 15
subsystem: web-ui
tags: [workflow-editor, automation-rules, sprint-report, recurrence, import-ui, svelte, phase-completion]
dependency_graph:
  requires: [05-04, 05-06, 05-07]
  provides: [workflow-editor-ui, automation-rules-ui, sprint-report-card-ui, recurrence-config-ui, import-settings-ui]
  affects: [projects-settings-routes]
tech_stack:
  added: []
  patterns: [svelte-runes, trpc-client-injection, server-load-functions]
key_files:
  created:
    - src/web/src/lib/components/tasks/WorkflowEditor.svelte
    - src/web/src/lib/components/tasks/AutomationRuleList.svelte
    - src/web/src/lib/components/tasks/RecurrenceConfig.svelte
    - src/web/src/lib/components/reports/SprintReportCard.svelte
    - src/web/src/routes/projects/[id]/settings/workflow/+page.svelte
    - src/web/src/routes/projects/[id]/settings/workflow/+page.server.ts
    - src/web/src/routes/projects/[id]/settings/automations/+page.svelte
    - src/web/src/routes/projects/[id]/settings/automations/+page.server.ts
    - src/web/src/routes/projects/[id]/settings/import/+page.svelte
    - src/web/src/routes/projects/[id]/settings/import/+page.server.ts
  modified:
    - src/cli/commands/task-hierarchy.ts
    - src/services/FieldDependencyService.test.ts
decisions:
  - "trpc injected as prop (not global) — matches existing BulkActionBar pattern; avoids SSR import issues"
  - "Import page uses simulated dry-run progress; real trpc.import.* wiring deferred to integration phase"
  - "WorkflowEditor uses local DEFAULT_STATUSES list; real project statuses would be fetched via separate tRPC call"
metrics:
  duration: "~20 min"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 10
  files_modified: 2
---

# Phase 05 Plan 15: Final UI Components Summary

One-liner: Workflow transition editor, automation rule CRUD, sprint report card with frozen stats and velocity, recurrence popover, and import wizard delivered as Svelte components with tRPC injection pattern.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Workflow editor + automation rules UI | aabde381 | 10 files created |
| 2 | CI typecheck fixes | 0d3c432b | task-hierarchy.ts, FieldDependencyService.test.ts |

## Component Delivery

### WorkflowEditor.svelte (D-23, D-24)
- 5-category column grid: backlog → unstarted → started → completed → canceled
- Click-to-edit status opens checkbox panel for target transitions
- Save via `trpc.workflows.updateTransitions`, reset via `trpc.workflows.getDefault`
- Transition summary table below the visual grid

### AutomationRuleList.svelte (D-89, D-92)
- Rules list with enabled/disabled toggle (visual switch), execution count, delete with confirmation
- Add Rule form: trigger picker (7 types), optional condition builder (field/operator/value), action picker (8 types)
- Templates panel: one-click create from `trpc.automations.templates.query()`

### RecurrenceConfig.svelte (D-116)
- Popover from repeat icon badge; three modes: on_schedule, after_completion, on_close
- Day-of-week multi-select + time picker for on_schedule mode
- Interval days input for after_completion/on_close
- End date + max occurrences bounds; shows next occurrence date and count

### SprintReportCard.svelte (D-38, D-29, D-30)
- Stats row: completed count+points, carried over, added mid-sprint, removed, scope change %
- Velocity bar chart comparing prior sprints with rolling average
- Retrospective notes: TipTap JSON → plain text extraction (read-only)
- Task table with status timeline history
- Live stats for open sprints, frozen for closed

### Import Settings (D-121)
- 5-step wizard: source selector → upload/auth → field mapping → dry-run preview → import with progress bar
- Sources: CSV, Jira, Linear, GitHub Issues, Trello
- CSV parser for header extraction and field mapping UI

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS2352 in task-hierarchy.ts**
- Found during: Task 2 CI run
- Issue: `factory(ctx) as unknown as` cast was still triggering TS2352 under strict mode
- Fix: Changed to `as any as` with eslint-disable comment
- Files: src/cli/commands/task-hierarchy.ts
- Commit: 0d3c432b

**2. [Rule 1 - Bug] Fixed pre-existing TS2344 in FieldDependencyService.test.ts**
- Found during: Task 2 CI run
- Issue: `Parameters<typeof Service["prototype"]["constructor"]>` uses `Function` type which doesn't satisfy `(...args: any) => any`
- Fix: Changed to `ConstructorParameters<typeof FieldDependencyService>`
- Files: src/services/FieldDependencyService.test.ts
- Commit: 0d3c432b

## CI Status

- typecheck: PASS
- symphony:lock: PASS
- symphony:conformance: 29 FAIL (pre-existing — DB table not created in test env; unrelated to Phase 5 UI)

The symphony:conformance failures require a running Postgres with migrations applied. They were present before this plan and are not caused by Phase 5 changes.

## Known Stubs

- WorkflowEditor: statuses list is hardcoded to DEFAULT_STATUSES. Real project custom statuses would require an additional `trpc.statuses.list` call wired in the page server load.
- Import page: dry-run uses a simulated setTimeout + hardcoded count. Real `trpc.import.*` procedures not yet wired.
- SprintReportCard: velocityHistory data comes from sprint.velocityHistory field; SprintService does not currently return this — component handles absent data gracefully (section hidden).

## Threat Flags

None — new UI components do not introduce server-side trust boundaries beyond what the existing tRPC routers already expose. Router-level permission checks (T-05-33, T-05-34) are enforced in Plan 04 routers.

## Self-Check: PASSED

Files verified:
- src/web/src/lib/components/tasks/WorkflowEditor.svelte ✓
- src/web/src/lib/components/tasks/AutomationRuleList.svelte ✓
- src/web/src/lib/components/tasks/RecurrenceConfig.svelte ✓
- src/web/src/lib/components/reports/SprintReportCard.svelte ✓
- src/web/src/routes/projects/[id]/settings/workflow/+page.svelte ✓
- src/web/src/routes/projects/[id]/settings/automations/+page.svelte ✓
- src/web/src/routes/projects/[id]/settings/import/+page.svelte ✓

Commits verified:
- aabde381 ✓ (feat(05-15): workflow editor…)
- 0d3c432b ✓ (fix(05): resolve pre-existing typecheck errors…)
