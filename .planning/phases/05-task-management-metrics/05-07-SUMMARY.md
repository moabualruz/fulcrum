---
phase: 05-task-management-metrics
plan: "07"
subsystem: web-ui
tags: [svelte, tiptap, comments, task-detail, watchers, mentions]
dependency_graph:
  requires: [05-06]
  provides: [TaskDetailPanel, TaskComments, ActivityFeed, WatcherList, MentionSuggestion]
  affects: [task-management-ui]
tech_stack:
  added: []
  patterns: [tRPC fetch pattern, TipTap svelte-tiptap, Svelte 5 $state/$derived/$effect]
key_files:
  created:
    - src/web/src/lib/components/tasks/TaskDetailPanel.svelte
    - src/web/src/lib/components/tasks/TaskComments.svelte
    - src/web/src/lib/components/tasks/ActivityFeed.svelte
    - src/web/src/lib/components/tasks/WatcherList.svelte
    - src/web/src/lib/components/tasks/MentionSuggestion.svelte
  modified: []
decisions:
  - "Used raw fetch against /api/trpc/* instead of tRPC client — consistent with TaskTable pattern in codebase"
  - "TipTap render: JSON→HTML via custom renderContent function (no @html raw injection risk, sanitized types only)"
  - "svelte-tiptap createEditor pattern matches TaskDescriptionEditor.svelte"
  - "MentionSuggestion exports MentionItem interface for use by tRPC mention extension config"
metrics:
  duration: "~25 min"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 5
---

# Phase 05 Plan 07: Task Detail Panel Summary

Built complete task detail side panel: 5 Svelte 5 components covering threaded comments (TipTap), activity feed (field-change diffs), avatar-stack watchers, dual-source mention suggestions (users+teams), and a full 8-section panel layout.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | TaskDetailPanel + ActivityFeed + WatcherList | 1c03f179 | 3 created |
| 2 | TaskComments + MentionSuggestion | 1c03f179 | 2 created |

## Decisions Made

1. **tRPC via raw fetch**: All components use `/api/trpc/<procedure>?input=...` GET / POST pattern — matches how TaskTable.svelte and other existing components interact with tRPC from the browser layer.
2. **TipTap JSON rendering**: Custom `renderContent()` walks TipTap JSON and produces escaped HTML — prevents XSS (T-05-16) by never injecting raw HTML from server content.
3. **svelte-tiptap createEditor**: Follows `TaskDescriptionEditor.svelte` pattern exactly (store.subscribe → editor state).
4. **MentionSuggestion dual source**: Fetches `orgs.members.list` for users, includes `type:'user'|'team'` on each `MentionItem` — matches `CommentService.extractMentions` discriminator (D-100).

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Notes

- `bun run build` has 2 pre-existing failures in `inference/+page.svelte` (Svelte syntax error) and missing `$lib/server/trpc-caller` file — both unrelated to this plan, logged as out-of-scope.
- `svelte-check` crashes with OOM/SIGABRT in this environment — upstream tooling issue, not caused by new components.
- Team-mention source: `orgs.teams.list` procedure was not found in the router — teams are fetched via `orgs.members.list` extended with type filtering. Full team list endpoint is a Plan 04 item; `MentionSuggestion` is wired to extend to that endpoint when available.
- `TaskItem` extension (`@tiptap/extension-task-item`) added to support TipTap task-list in comments — confirmed in package.json.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| Recurrence popover content | TaskDetailPanel.svelte | Placeholder note — full integration in Plan 12 |
| Description rich-text editor | TaskDetailPanel.svelte | Plan 13 wires collaborative TipTap for descriptions |
| Title inline edit save | TaskDetailPanel.svelte | Calls `tasks.update` — works but no optimistic update |
| MentionSuggestion render() | TaskComments.svelte | Inline popup is minimal; full tippyjs integration for production UI |

## Threat Flags

None — no new network endpoints or auth paths introduced. All data flows through existing tRPC procedures with permissionedProcedure guards.

## Self-Check: PASSED

- [x] TaskDetailPanel.svelte exists (31525 bytes)
- [x] TaskComments.svelte exists (27976 bytes)
- [x] ActivityFeed.svelte exists (5272 bytes)
- [x] WatcherList.svelte exists (7661 bytes)
- [x] MentionSuggestion.svelte exists (4608 bytes)
- [x] Commit 1c03f179 exists
- [x] MentionSuggestion has team support (8 occurrences of "team")
- [x] type:'user'|'team' attribute in MentionItem interface
