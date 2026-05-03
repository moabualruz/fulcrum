---
Status: implemented
Owner: claude-orchestrator
ImplCommit: pending
ImplRuntime: claude
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q27, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Search facets / saved searches")
Docs: https://www.bits-ui.com/docs, https://ui.shadcn.com/docs/svelte/command
---

# Cmd+K palette — search mode, command mode, quick-filter tokens

## What to build

Build the `<CommandPalette>` Svelte 5 component using Bits UI `Command` (shadcn-svelte). Mount as a portal to `<body>` from `+layout.svelte`. Two modes: search (default) and command (`>` prefix). Quick-filter tokens: `kind:doc`, `kind:task`, `project:<slug>`, `assignee:me`, `status:open`, `tag:<x>`. Keyboard: `↑↓` navigate, `Enter` open, `Esc` close, `Tab` cycle kind group. Search queries `search.query` tRPC; commands dispatch route navigation or modal opens.

Cuts through: key event on `<svelte:window>` → component visible → `search.query` tRPC call → grouped results rendered → `Enter` navigates → URL changes.

## Acceptance criteria

- [ ] `⌘K` / `Ctrl+K` on any route opens palette within <50ms (`performance.mark` assertion in Playwright).
- [ ] Search mode: typing "task" → results grouped by kind (tasks / docs / memories); each result has icon + title + project badge.
- [ ] Command mode: `>create-task` → task-create dialog opens; `>create-project` → project-create dialog opens; `>go-search` → navigates `/search`.
- [ ] Quick-filter `kind:doc` applied to query; facet chip shown in input; results filtered to docs only.
- [ ] `↑↓` keyboard navigation cycles groups; `Enter` opens selected item; `Esc` closes; focus returns to trigger element.
- [ ] Debounced 150ms; no flicker on rapid typing.
- [ ] Failure gate: >1000 items → list virtualised; open time stays <50ms.
- [ ] Vitest: palette renders with mocked `search.query`; `>create-task` command dispatches correct event.
- [ ] Playwright: open → type "test" → result appears → `Enter` → URL changes.

## Blocked by

- Issue 01 (scaffold) — portal mount slot must exist in `+layout.svelte`.
