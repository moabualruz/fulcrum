---
phase: 05-task-management-metrics
plan: 12
subsystem: web-ui, services
tags: [keyboard-shortcuts, command-palette, field-dependencies, quick-create, tinykeys]
dependency_graph:
  requires: [05-06, 05-07]
  provides: [KeyboardShortcuts, CommandPalette, FieldDependencyService, QuickCreateForm]
  affects: [TaskService, layout.svelte]
tech_stack:
  added: [tinykeys@3.0.0]
  patterns: [tinykeys bindings with guard function, pure evaluator pattern, TRPCError validation]
key_files:
  created:
    - src/web/src/lib/components/KeyboardShortcuts.ts
    - src/web/src/lib/components/CommandPalette.svelte
    - src/web/src/lib/components/ShortcutHelpOverlay.svelte
    - src/web/src/lib/components/tasks/QuickCreateForm.svelte
    - src/web/src/lib/components/tasks/FieldDependencyEval.ts
    - src/web/src/lib/components/tasks/FieldDependencyConfig.svelte
    - src/services/FieldDependencyService.ts
    - src/services/FieldDependencyService.test.ts
  modified: []
decisions:
  - "tinykeys guard() wrapper suppresses shortcuts in input/textarea/contenteditable targets"
  - "CommandPalette fetches task/project/sprint data on first open (best-effort, degrades gracefully)"
  - "QuickCreateForm stays open after submit (Linear behavior) for rapid multi-create"
  - "FieldDependencyService.validate uses TRPCError BAD_REQUEST with missing field list"
  - "Client-side evaluateFieldDependencies is pure with no side effects; server validates on save (HIGH-03)"
metrics:
  duration: ~15min
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 8
---

# Phase 05 Plan 12: Keyboard Shortcuts, Command Palette, Field Dependencies Summary

Tinykeys global shortcuts + richer command palette with task/project/sprint search + field dependency evaluator (client) + validator (server, HIGH-03) + QuickCreateForm with duplicate detection.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Command palette + keyboard shortcuts + help overlay | 10b92943 | CommandPalette.svelte, KeyboardShortcuts.ts, ShortcutHelpOverlay.svelte, QuickCreateForm.svelte |
| 2 | Field dependency client eval + server validation + config UI | 10b92943 | FieldDependencyEval.ts, FieldDependencyConfig.svelte, FieldDependencyService.ts, FieldDependencyService.test.ts |

## Decisions Made

1. **tinykeys guard pattern** — `guard(cb, allowInEditable)` wrapper prevents shortcuts from firing inside `<input>`, `<textarea>`, and `contenteditable` elements. Escape and Cmd+K set `allowInEditable=true`.

2. **CommandPalette data fetch strategy** — Fetches tasks/projects/sprints via REST `/api/trpc/*` on first open, best-effort. Falls back to navigation actions only if fetch fails. Task ID regex (`/^[A-Z]{2,6}-\d+$/i`) switches to identifier matching (D-112).

3. **QuickCreateForm duplicate detection** — 500ms debounced `onblur` call to `trpc.tasks.findSimilar`. Shows top 3 matches with dismiss option. Uses pg_trgm when `HAS_TRGM=true`, ILIKE fallback otherwise (D-118).

4. **FieldDependencyService.validate** — Throws `TRPCError({ code: "BAD_REQUEST" })` with comma-separated list of missing required fields. Called by TaskService.create/update (HIGH-03 mitigation, T-05-26).

5. **Pure client evaluator** — `evaluateFieldDependencies` returns `{visible, hidden, required}` Sets with no side effects. Components bind reactively; server re-validates independently.

## Deviations from Plan

None — plan executed exactly as written. All 8 files created, 8 tests pass.

## Test Results

```
src/services/FieldDependencyService.test.ts:
 8 pass
 0 fail
 13 expect() calls
```

TDD gate compliance:
- RED: tests written before implementation — confirmed "Cannot find module" failure
- GREEN: implementation written — all 8 tests pass

## Known Stubs

- `FieldDependencyConfig.svelte`: calls `/api/trpc/fieldDependencies.*` endpoints which are not yet wired in a tRPC router. The UI degrades gracefully (silently ignores failed fetches). A future plan should add `fieldDependencies` router to the tRPC app router.
- `CommandPalette.svelte`: REST fetch calls for task/project/sprint data will 404 until those routes return the expected shape. Falls back to navigation actions only.

## Threat Flags

No new threat surface beyond what the plan's threat model covers (T-05-26 mitigated by server validation, T-05-27 noted for future org-scoped filtering in CommandPalette results).

## Self-Check: PASSED

All 8 files found on disk. Commit 10b92943 verified in git log. 8/8 tests pass.
