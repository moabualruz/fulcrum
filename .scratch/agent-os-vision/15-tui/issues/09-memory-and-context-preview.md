---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/04-dashboard-and-projects.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q15, Q17, Q18, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Memory: per-project + global, retrievable, gated" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Memory browser screen (VirtualList of memories; `g` toggles `global` filter; `/` opens inline search overlay via `search.query`; `Enter` opens memory detail with full content; `p` promotes memory to global via `memories.promote`), Context bundle preview screen (4 split panes: memories / linked docs / recent transcripts / repo state; token count displayed per pane; total budget shown in StatusBar; `r` refresh).

- **Web**: `/memory` and `/context/preview` web routes.
- **CLI**: `fulcrum memories list --json`, `fulcrum context assemble --task T --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [x] Memory browser: project memories + global memories listed; `g` toggles global filter; `/` opens search overlay with real-time filter.
- [x] Memory detail: full content readable; `p` promotes → `memories.global=true` in DB; list refreshes.
- [x] Context preview: 4 panes side-by-side; token count per pane matches `context.assemble` output; `r` refreshes all panes.
- [x] After TUI `p` promote, web memory browser shows `global=true` badge; CLI `fulcrum memories list --json` reflects.
- [x] FakeTTY snapshot for memory browser (strip-ansi).

## Blocked by

- 15/issues/04-dashboard-and-projects.md

## Notes

T15-42–T15-43 maps to this slice.
