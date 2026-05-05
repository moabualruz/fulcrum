---
phase: 05-task-management-metrics
plan: 11
subsystem: tasks
tags: [filter-builder, bulk-actions, custom-fields, tdd, linear-ux]
dependency_graph:
  requires: [05-06, 05-07, 05-08]
  provides: [FilterBuilder, QuickFilters, BulkActionBar, BulkCustomFieldEdit, ast-round-trip]
  affects: [task-views, saved-views, custom-fields]
tech_stack:
  added: []
  patterns: [chip-based-filters, bulk-transaction, custom-field-types, tdd-red-green]
key_files:
  created:
    - src/web/src/lib/components/tasks/FilterBuilder.svelte
    - src/web/src/lib/components/tasks/QuickFilters.svelte
    - src/web/src/lib/components/tasks/BulkActionBar.svelte
    - src/web/src/lib/components/tasks/BulkCustomFieldEdit.svelte
  modified:
    - src/filters/ast.test.ts
    - src/services/TaskService.ts
    - src/services/TaskService.test.ts
decisions:
  - "BulkCustomFieldEdit handles json/unknown type via raw text input as fallback"
  - "200-cap validated before transactional block to fail-fast (no wasted DB round-trip)"
  - "Label groups modeled as structured JSON array {id,name,color,group} not separate table (D-79)"
  - "Priority integers 0-4 (Urgent=0 highest) enable numeric sort ascending=highest first (D-80)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-05T11:15:19Z"
  tasks: 2
  files: 7
---

# Phase 05 Plan 11: FilterBuilder, BulkActionBar, Saved View Round-Trip Summary

**One-liner:** Chip-based filter builder (Linear-style) with custom field support, bulk action bar with 200-cap enforcement, and comprehensive tests for 50+ task bulk ops and all 9 custom field types.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | FilterBuilder + QuickFilters + AST round-trip tests | 042abf1b | FilterBuilder.svelte, QuickFilters.svelte, ast.test.ts |
| 2 (RED) | Failing bulk/custom field/label/priority tests | efaf3378 | TaskService.test.ts |
| 2 (GREEN) | BulkActionBar + BulkCustomFieldEdit + 200-cap | 52e313d0 | BulkActionBar.svelte, BulkCustomFieldEdit.svelte, TaskService.ts, TaskService.test.ts |

## Success Criteria Verification

- [x] FilterBuilder uses shadcn-svelte primitives only (D-69) — Popover, Badge, Button, Select, Input
- [x] FilterBuilder supports custom field references in picker (D-72) — field key `custom_fields.<id>`
- [x] FilterBuilder outputs AST compatible with existing ast.ts (SavedViewQuerySchema)
- [x] QuickFilters has 5+ presets (D-71) — My Work, Due Today, Overdue, Unassigned, Blocked
- [x] ast.test.ts: round-trip create→save→reload→apply (TSK-13) — 6 new round-trip tests
- [x] ast.test.ts: AND/OR combinator tests — 2 tests
- [x] ast.test.ts: custom field ref tests — 5 tests
- [x] BulkActionBar: all 10 action buttons (D-74)
- [x] BulkCustomFieldEdit: all 9 CUSTOM_FIELD_TYPES (D-78, MEDIUM-05)
- [x] Max 200 enforcement (D-75) — hard cap in TaskService.bulkUpdate + bulkDelete
- [x] 50+ task bulk test passes (TSK-11) — 55 tasks
- [x] Bulk events use transaction pattern (D-76)
- [x] Custom field 9 types round-trip (TSK-12)
- [x] Label group model tested (D-79, MEDIUM-04)
- [x] Priority ordering tested (D-80)
- [x] 66 tests pass across TaskService.test.ts + ast.test.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added max 200 cap to TaskService.bulkUpdate and bulkDelete**
- Found during: Task 2 RED phase
- Issue: bulkUpdate/bulkDelete had no D-75 hard cap enforcement — plan called for it but service lacked it
- Fix: Added `if (ids.length > 200) throw TRPCError({ code: "BAD_REQUEST" })` before transactional block
- Files modified: src/services/TaskService.ts
- Commit: 52e313d0

**2. [Rule 1 - Bug] Fixed mock EntityManager for emitTaskEvent compatibility**
- Found during: Task 2 GREEN phase
- Issue: Test mock didn't include `getReference` / `create` needed by emitTaskEvent internals
- Fix: Added typed mock stubs for both methods
- Files modified: src/services/TaskService.test.ts
- Commit: 52e313d0

**3. [Rule 1 - Bug] Fixed TypeScript strict-null array access in test files**
- Found during: lint pass post-GREEN
- Issue: `reloaded.filters[0].field` — TS flags possible undefined for array index access
- Fix: Added non-null assertion (`!`) on array index accesses in ast.test.ts and TaskService.test.ts
- Commits: 52e313d0

## Known Stubs

None — all components wire to real tRPC mutations and real AST types.

## Threat Flags

None — no new network endpoints; bulk mutation cap mitigates T-05-24 (D-75). Cross-project validation (T-05-25) deferred to tRPC router layer (orgId validation in findBulkTasksOrThrow).

## Self-Check: PASSED

- FilterBuilder.svelte: FOUND
- QuickFilters.svelte: FOUND
- BulkActionBar.svelte: FOUND
- BulkCustomFieldEdit.svelte: FOUND
- ast.test.ts (extended): FOUND
- TaskService.test.ts (extended): FOUND
- TaskService.ts (200-cap): FOUND
- Commits 042abf1b, efaf3378, 52e313d0: FOUND
- Tests: 66 pass, 0 fail
