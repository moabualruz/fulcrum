---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md, 07-saved-searches.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q-tui-lib, C4, Q27]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# TUI: Cmd+K overlay + full-screen search + in-panel bars

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-27, T11-28, T11-29)

## What to build
Three TUI search surfaces using OpenTUI components consuming tRPC in-process:

1. `⌘K` overlay (any screen): modal overlay with search input + results list + keyboard nav (`↑↓ Enter Esc`); same search mode + `>` command mode as Web palette.
2. `S` keybind → full-screen search: left panel = facet checkboxes; right panel = kind-grouped result list; `Enter` opens entity detail pane.
3. In-panel bars on tasks, docs, runs panels: type-to-filter the panel list; results replace list; `Esc` restores.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `search.query` + `search.suggest` consumed in-process (no HTTP).
- [ ] Web surface: N/A.
- [ ] CLI command: N/A.
- [ ] TUI screen: `⌘K` opens overlay on any screen; `Esc` closes; `↑↓` navigate results; `Enter` navigates to entity; `S` opens full-screen search; left facet checkboxes filter results; in-panel bars on tasks panel type-to-filter; results replace list; `Esc` restores original list.
- [ ] Tests: OpenTUI component smoke tests: overlay renders without error; key dispatch (`⌘K` open, `Esc` close, `Enter` navigate); full-screen: facet select → result count updates; in-panel bar: type → results replace list; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query`.
- `06-suggest-and-quick-filter.md` — suggest + quick-filter.
- `07-saved-searches.md` — saved searches loadable in full-screen search.
- Pillar 15 (TUI) — OpenTUI framework; if overlay API immature → ratatui popup per Q-tui-lib gate.

## Notes / Tech-stack hints
- Failure gate: if OpenTUI overlay API too immature, implement minimal overlay using ratatui popup in Rust sidecar workspace (same Unix socket RPC).
- In-process tRPC: import tRPC router directly in Bun process — no HTTP round-trip; fast for interactive search.
- Debounce: 150ms same as Web.
- TUI full-screen: `Ctrl+←` / `Ctrl+→` switch focus between facet panel and result panel.
