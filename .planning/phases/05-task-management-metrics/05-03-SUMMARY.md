---
phase: 05-task-management-metrics
plan: "03"
subsystem: task-comments
tags: [comments, watchers, reactions, tRPC, tdd]
dependency_graph:
  requires: ["05-01", "05-02"]
  provides: ["CommentService", "commentsRouter"]
  affects: ["05-06"]
tech_stack:
  added: []
  patterns: ["service-layer", "tRPC-thin-router", "TDD-green", "upsert-watcher"]
key_files:
  created:
    - src/services/CommentService.ts
    - src/server/trpc/routers/comments.ts
  modified:
    - src/services/CommentService.test.ts
decisions:
  - "No Team entity exists; expandTeamMembers queries OrgMember — returns all org members for any team ID until Team entity added in later phase"
  - "Watcher subscribe uses try/catch on unique constraint instead of em.upsert for MikroORM v7 compatibility"
  - "commentsRouter not wired into root router — Plan 06 owns src/trpc/router.ts"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 05 Plan 03: CommentService + commentsRouter Summary

**One-liner:** TipTap-aware CommentService with team mention expansion (D-100), threaded replies (D-01), watcher auto-subscribe, and 11-procedure tRPC router.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | CommentService CRUD + watchers + reactions + team mentions | c572c96c | src/services/CommentService.ts, src/services/CommentService.test.ts |
| 2 | commentsRouter (tRPC thin delegation) | 2c1431e3 | src/server/trpc/routers/comments.ts |

## What Was Built

**CommentService** (`src/services/CommentService.ts`):
- `createComment` / `createReply` — stores TipTap JSON body, auto-subscribes author, mentioned users, and team-expanded members
- `listComments` — flat list with reactions, org-scoped
- `getThreaded` — tree structure: top-level comments with `replies[]` nested (D-01)
- `deleteComment` — cascades to reply children
- `resolveComment` / `unresolveComment` — sets resolved fields
- `addReaction` / `removeReaction` — emoji reactions per user per comment
- `subscribe` / `unsubscribe` / `listWatchers` — watcher management with source field
- `extractMentions` — traverses TipTap JSON recursively, discriminates `type: "user"` vs `type: "team"` (D-100)
- `expandTeamMembers` — queries OrgMember for team mention bulk-subscribe (D-100)

**commentsRouter** (`src/server/trpc/routers/comments.ts`):
- 11 procedures: list, threaded, create, delete, resolve, unresolve, addReaction, removeReaction, watchers, subscribe, unsubscribe
- All use `permissionedProcedure`
- `ctx.userId` / `ctx.orgId` sourced from authenticated context (T-05-05, T-05-07)

**Tests**: 18 unit tests, all passing. Uses in-memory MockEntityManager stub.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] No Team entity — expandTeamMembers adapted**
- **Found during:** Task 1 exploration
- **Issue:** Plan assumed a Team entity with member relations. No such entity exists in the codebase.
- **Fix:** `expandTeamMembers` queries `OrgMember` for the org and returns all member IDs. Documented as a stub for when a Team entity is introduced.
- **Files modified:** `src/services/CommentService.ts`
- **Impact:** Team mentions currently subscribe all org members. Scoped correctly for current data model.

**2. [Rule 1 - Bug] Mock EM criteria matching needed org-reference handling**
- **Found during:** Task 1 test run
- **Issue:** EntityManager stores org as `{ id: orgId }` reference; criteria matching `{ org: orgId }` failed with plain equality.
- **Fix:** `matchesCriteria` function in test stub handles object references with `.id` field comparison.
- **Files modified:** `src/services/CommentService.test.ts`

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `expandTeamMembers` returns all org members | `src/services/CommentService.ts` | ~155 | No Team entity yet; comment in code flags which future plan will add Team entity |

## Threat Surface

All mitigations from the plan's threat register were implemented:
- T-05-05: authorId from `ctx.userId` in router, never from input
- T-05-06: mention IDs are auto-subscribed as watchers; `expandTeamMembers` is org-scoped
- T-05-07: all `find`/`findOne` queries include `org: orgId` filter

## Self-Check: PASSED

- `src/services/CommentService.ts` — FOUND
- `src/server/trpc/routers/comments.ts` — FOUND
- `src/services/CommentService.test.ts` — FOUND (18 tests pass)
- Commit c572c96c — FOUND
- Commit 2c1431e3 — FOUND
- `bun run build` — PASSES
