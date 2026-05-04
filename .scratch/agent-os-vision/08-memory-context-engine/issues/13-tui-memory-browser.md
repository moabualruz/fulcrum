---
Status: completed
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [07-trpc-memory-crud-and-search.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q-tui-lib, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Surfaces — TUI memory browser screen; Q-tui-lib: OpenTUI (Bun-native TS)
---

## What to build

TUI memory browser screen (`m` keybind from main nav). Built with OpenTUI (Bun-native TS, JSX components), consuming tRPC in-process.

Layout: left facet tree (kind / importance / source / project), right virtual-scroll list of memory rows, detail pane on `Enter`. Inline actions: `g` promote-to-global, `a` archive, `e` edit body/importance/tags, `d` delete (with confirmation). `/` opens search mode with 200ms debounce via `memory.search` tRPC.

Failure gate per Q-tui-lib: if OpenTUI component library proves too immature during implementation, document the gate and fall back to ratatui (Rust, inference workspace) — raise as HITL blocker if fallback required.

## Acceptance criteria

- [ ] `m` keybind launches memory browser from TUI main nav
- [ ] Facet tree renders kind/importance/source/project facets; selecting filters the right-side list
- [ ] Virtual-scroll list renders memory rows (body preview, kind badge, importance indicator)
- [ ] `Enter` opens detail pane showing full body, metadata, linked entities
- [ ] `g` calls `memory.promote` tRPC; `a` calls `memory.archive`; `d` calls `memory.forget` with confirmation prompt; `e` opens inline edit
- [ ] `/` + typing → calls `memory.search` with debounce; results replace list
- [ ] Keyboard navigation: `↑↓` move list cursor; `Tab` switches pane focus; `q`/`Esc` closes screen
- [ ] Empty state (no memories for project) renders helpful message with `r` shortcut to `memory remember`
- [ ] Integration test: TUI memory browser renders without crash with fixture data
- [ ] If OpenTUI gate triggered: HITL issue raised with documented fallback path to ratatui

## Blocked by

- `07-trpc-memory-crud-and-search.md`
