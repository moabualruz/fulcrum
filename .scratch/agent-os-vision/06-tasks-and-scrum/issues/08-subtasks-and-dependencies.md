---
Status: implemented
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q9]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Subtasks + parent tree + dependencies (blocks/blocked-by)

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-13, T6-14)

## What to build
tRPC procedures for subtask tree management and dependency (blocks/blocked-by)
manipulation; Web UI — breadcrumb header on detail page, subtask list with inline
create, dependency section with blocked badge and circular-dependency rejection;
CLI `fulcrum tasks deps <id>` ASCII tree; TUI detail pane subtask + dependency sections.

## Acceptance criteria
- [ ] tRPC `tasks.setParent(taskId, parentId | null)`: updates `tasks.parent_id`; rejects creating cycles (recursive CTE cycle check); emits `parent_changed` event
- [ ] tRPC `tasks.listChildren(taskId)`: returns direct children; frontend composes full tree by recursive calls or recursive CTE for depth ≤ 10
- [ ] tRPC `tasks.setDependencies(taskId, {blocks: uuid[], blocked_by: uuid[]})`: updates `tasks.dependencies jsonb`; rejects circular dependency (A blocks B blocks A); emits `dependency_updated` event
- [ ] Web: breadcrumb header on task detail shows `Project → Parent → … → Task` chain; each crumb is a link
- [ ] Web: subtask section — list of direct children with status chips; inline create (type title + Enter); "add subtask" button
- [ ] Web: dependency section — `Blocks` list + `Blocked by` list; "add dependency" typeahead; blocked badge on card (orange) when any `blocked_by` task is not completed; circular dependency rejected with toast
- [ ] CLI: `fulcrum tasks deps <task-id> --json` returns `{task, blocks[], blocked_by[]}` tree; plain output renders ASCII tree with `├─` indentation
- [ ] TUI: task detail pane shows subtask count chip; expand shows list; dependency section shows blocked/blocking counts; `d` key opens dependency editor
- [ ] Tests: `setParent` — direct cycle A→B→A rejected; A→B→C (non-cycle) accepted
- [ ] Tests: `setDependencies` — circular blocks (A blocks B blocks A) rejected with typed error
- [ ] Tests: `listChildren` with 3-level nesting returns correct tree structure
- [ ] Tests: Web blocked badge present when `blocked_by` contains incomplete task (Playwright or jsdom)
- [ ] Tests: CLI `deps --json` schema matches `{task: TaskRow, blocks: TaskRow[], blocked_by: TaskRow[]}`

## Blocked by
- 07-task-crud-baseline

## Notes / Tech-stack hints
- `tasks.parent_id` adjacency list — infinite nesting allowed but UI breadcrumb caps at 10 levels with ellipsis
- Cycle detection: `WITH RECURSIVE` CTE traverses parent chain; if inserted `parent_id` appears in ancestor set, reject
- `tasks.dependencies` is a jsonb column (`{"blocks":[],"blocked_by":[]}`); both directions stored on each task for query efficiency (denormalized)
- Blocked badge logic: any task in `blocked_by` where its `status.category !== 'completed'` → show badge
