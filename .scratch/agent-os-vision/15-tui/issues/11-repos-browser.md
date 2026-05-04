---
Status: completed
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/04-dashboard-and-projects.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q24, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Repo supervision" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Repos browser screen (VirtualList of repos with supervision status, last-synced-at, branch count; `Enter` opens detail; `s` triggers `repos.sync` tRPC; `r` registers new repo via form overlay), Repo detail + file tree (split pane: left = file tree expandable; right = file content viewer; `f` focuses file tree; `l` focuses commit log), Commit log screen (SHA/message/author/date list; `Enter` opens unified diff view).

- **Web**: `/repos`, `/repos/[id]` web routes.
- **CLI**: `fulcrum repos list --json`, `fulcrum repos sync <id> --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [x] Repos list: repos with `supervision_mode`, `last_synced_at`, `branch_count`; `s` triggers sync → `repos.sync` called; last-synced-at updates.
- [x] Repo detail: file tree expands/collapses; `Enter` on file → content viewer renders file text; `l` switches to commit log.
- [x] Commit log: SHA/message/author list in VirtualList; `Enter` on commit → unified diff view (added/removed lines).
- [x] After TUI `s` sync, web repo detail shows updated branch count; CLI `fulcrum repos list --json` reflects `last_synced_at`.
- [x] FakeTTY snapshot for repos list (strip-ansi).

## Blocked by

- 15/issues/04-dashboard-and-projects.md

## Notes

T15-47–T15-49 maps to this slice.
