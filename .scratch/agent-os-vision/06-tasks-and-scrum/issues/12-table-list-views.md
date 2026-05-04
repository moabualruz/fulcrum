---
Status: completed
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline, 04-saved-views-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q10]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Table view (TanStack Table) + List view (TanStack Virtual)

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-22, T6-25)

## What to build
SvelteKit route `/projects/<id>/backlog` — TanStack Table v8 with sort/filter/group-by
any field + custom fields, column visibility toggle, inline edit for status/assignee/
priority, row click → task detail modal. List view using TanStack Virtual rendering
1000+ tasks without blank rows. Both views accept `SavedViewQuery` filter from slice 04.
CLI `--output table` tabular format. TUI list panel using terminal rows.

## Acceptance criteria
- [x] Web: TanStack Table v8 renders all task columns with sort indicators; clicking column header cycles asc/desc/unsorted
- [x] Web: column visibility toggle (gear icon) shows/hides columns; selection persisted in `localStorage`
- [x] Web: group-by any field (status/assignee/priority/sprint/label) — rows grouped with collapse toggle per group
- [x] Web: filter bar above table accepts free-text; table re-fetches with updated `SavedViewQuery`
- [x] Web: inline edit — click status cell → inline `<Select>`; click assignee → inline user picker; changes dispatch `tasks.update` immediately
- [x] Web: row click opens task detail modal (router-modal pattern from slice 07)
- [x] Web: TanStack Virtual list view — `/projects/<id>/board?view=list` — 1000 tasks render with no blank rows; virtual item height = 48px; overscan = 5
- [x] Web: list view click → task detail modal
- [ ] CLI: `fulcrum tasks list --project <id> --output table` renders padded column table to stdout; `--json` returns typed array
- [ ] TUI: tasks list panel uses terminal rows (one task per line); `↑`/`↓` navigate; `Enter` opens detail; `c` inline create
- [x] Tests: TanStack Table sort ascending on `created_at` — first row has earliest date
- [x] Tests: group-by status — groups match unique status values
- [x] Tests: inline status edit dispatches `tasks.update` with new status
- [x] Tests: TanStack Virtual 1000 tasks — no blank rows (DOM query finds 1000 rendered items or virtual window items)
- [x] Tests: column visibility persists across route re-mount

## Blocked by
- 07-task-crud-baseline
- 04-saved-views-schema

## Notes / Tech-stack hints
- Failure gate: if TanStack Table v9 breaking changes surface during implementation, stay on v8; document in tech-debt note
- Failure gate: if TanStack Virtual bug #866 blank list reproduces, fall back to `@humanspeak/svelte-virtual-list` (MIT)
- Custom fields rendered as additional columns when `customFields.list` returns them; type determines cell renderer
- Inline edit cells must handle keyboard: `Enter` commits, `Escape` cancels, `Tab` moves to next cell
