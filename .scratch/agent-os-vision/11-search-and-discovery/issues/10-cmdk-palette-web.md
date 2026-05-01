---
Status: ready-for-agent
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md, 08-client-cache.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Web Cmd+K palette: search mode + command mode (>) + quick-filter + keyboard nav

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-17, T11-18, T11-19, T11-20)

## What to build
Global `⌘K`/`Ctrl+K` palette in `+layout.svelte` using shadcn-svelte `Command` (Bits UI). Svelte 5 portal to `<body>` — persists across routes. Search mode (default): debounced 150ms, results grouped by kind, icon+title+badge+breadcrumb+relative-date, client cache (`SearchCache`). Command mode (`>` prefix): list of registered commands (open/create-task/create-doc/navigate-to/run-agent/toggle-flag); `>create-task` dispatches task-create modal. Quick-filter inline (`kind:doc`, `project:<slug>`, `assignee:me`, `status:open`, `tag:<x>`) — client-parsed via `quick-filter-parser`. Keyboard: `↑↓` navigate, `Enter` open, `⌘Enter` new tab, `Tab` cycle kind group. Focus trap inside palette. `Esc` closes.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `search.query` + `search.suggest` called; command registry in `src/search/commands.ts`.
- [ ] Web surface: `⌘K` opens <50ms; `Esc` closes; persists across client-side navigation; debounce 150ms verified; kind-grouped results; `>create-task` dispatches task-create modal; `kind:doc` quick-filter applied; Playwright: open palette, type query, press Enter on result — navigates to entity page.
- [ ] CLI command: N/A (palette is Web/TUI only).
- [ ] TUI screen: N/A (TUI palette in separate slice).
- [ ] Tests: `⌘K` open/close; focus trap (Tab cycles within palette); `>` prefix switches mode; `>create-task` triggers modal; quick-filter `kind:doc` applied; cache hit — no second tRPC call; Playwright e2e: type "foo", select first result, navigate; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query`.
- `06-suggest-and-quick-filter.md` — `quick-filter-parser`.
- `08-client-cache.md` — `SearchCache` wraps query.

## Notes / Tech-stack hints
- shadcn-svelte `Command` (Bits UI, MIT) — check for breaking changes; fallback `ninja-keys` (MIT web component) per PRD gate.
- Command registry: `{ name: string, label: string, handler: () => void }[]` exported from `src/search/commands.ts`; each pillar registers commands on module init.
- `⌘Enter` new tab: `window.open(href, '_blank')` on `Enter` when `metaKey` held.
- Portal: Svelte 5 `{@html}` with teleport; or shadcn Dialog wrapping Command.
