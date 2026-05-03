---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/01-tui-foundation-launcher.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [Q-tui-lib, C4, Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Global widgets used by all screens: Cmd+K palette overlay (`src/tui/widgets/Palette.tsx`, `⌘K`/`Ctrl+K` open, search + `>` command mode, quick-filter tokens, `Esc` close), VirtualList widget (1000-item scroll without blank rows, `Enter` select, <16ms/frame), StatusBar (org name + user email + current screen + bell count badge), Help overlay (`?` key — renders keybinding map for current screen context), FilterChips widget (add/remove facet chips, `Tab` cycle, `Enter` apply), ASCII chart renderer (`asciichart` wrapper with TUI size-aware scaling — burndown line, velocity bar, sparkline, histogram; deterministic snapshot output), wcwidth handling (`src/tui/utils/truncate.ts` using `wcwidth` npm — CJK double-width chars, emoji widths).

- **Web**: Cmd+K (Bits UI Command) is the web equivalent; global StatusBar is the web nav/header.
- **CLI**: `fulcrum search` and `fulcrum doctor` are the CLI equivalents of palette/filter chips.
- **TUI**: all widgets used by every domain screen in subsequent slices.

## Acceptance criteria

- [ ] Palette: opens on `Ctrl+K`; `>create-task` dispatches `task.create` action; `kind:doc` filter token applied; `Esc` closes; FakeTTY snapshot.
- [ ] VirtualList: 1000-item list renders; scroll to last row; `Enter` fires select callback; render time <16ms (measured in snapshot test).
- [ ] StatusBar: bell count increments on new notification event (subscription); session change → user email updates.
- [ ] Help overlay: `?` shows current screen's keybinding map; different screen → different map.
- [ ] FilterChips: add chip, remove chip, `chips` array correct; FakeTTY snapshot.
- [ ] ASCII charts: burndown with known data → deterministic ANSI output (snapshot, strip-ansi before compare); velocity bar; sparkline; histogram.
- [ ] wcwidth: `truncate('中文abc', 6)` = `'中文a'` (CJK counts double); emoji truncation correct.

## Blocked by

- 15/issues/01-tui-foundation-launcher.md

## Notes

T15-10–T15-15 maps to this slice.
