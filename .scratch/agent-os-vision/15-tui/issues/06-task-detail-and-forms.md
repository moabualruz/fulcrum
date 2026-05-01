---
Status: ready-for-agent
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/05-task-list-and-kanban-board.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q9, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Jira-grade task management" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Task detail pane (full-pane: title/description/status/assignee/due date/priority/labels/custom fields/comments/activity/watchers/subtasks/blocking), Task create form (required fields: title + project; submit → `tasks.create` tRPC; `Esc` cancels), Subtask tree (child tasks listed in detail, breadcrumb, create child via `c`), Dependencies section (blocked-by list with search overlay for task ID), Comments section (markdown rendered ANSI-safe, create comment, show count). Keyboard shortcuts: `e` edit title, `a` assign, `s` status picker overlay, `p` priority, `d` due date, `l` labels.

- **Web**: `/tasks/[id]` task detail page with all sections.
- **CLI**: `fulcrum tasks get <id> --json`, `fulcrum tasks update <id> --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [ ] Task detail: all 12 sections rendered; `e` opens title edit inline; `s` opens status picker (Enter selects); `a` opens user picker.
- [ ] Custom fields rendered in configured order (reads `custom_field_defs`).
- [ ] Task create form: required `title` validated; `Esc` cancels without DB write; submit → task row created; navigates to detail.
- [ ] Subtask tree: children listed under "Subtasks" section; `c` creates child with `parent_id` set; breadcrumb navigable.
- [ ] Dependency: `blocked-by` list with search overlay; selecting task → `tasks.update(blocked_by=[...])`.
- [ ] Comments: markdown (bold/italic/code) renders ANSI-safe; create comment form; count badge.
- [ ] After TUI `s` status change, web task detail shows new status; CLI `fulcrum tasks get <id> --json` reflects.

## Blocked by

- 15/issues/05-task-list-and-kanban-board.md

## Notes

T15-23–T15-28 maps to this slice.
