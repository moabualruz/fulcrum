---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 08-memory-context-engine/issues/02-retriever-and-context-assembler.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q15, Q17, Q18, Q-flag-granularity, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (rows: "Memory: per-project + global", "Context engine")
Docs: https://kit.svelte.dev/docs
---

# Memory browser (/memory, /memory/[id]) + Context bundle preview (/context/preview)

## What to build

`/memory`: memory browser with filter sidebar (scope: project/global/task/user, importance: high/medium/low, source: heuristic/llm/manual, project selector). List shows memory cards (title snippet, scope badge, importance badge, tags, last used). Create memory button → inline create form. `/memory/[id]`: detail view — full body (markdown), importance selector, scope toggle (project ↔ global), tags combobox, linked docs/tasks (edges), "Delete" action. `/context/preview`: project + task selectors → 4-pane view (top-N memories / linked docs / recent transcripts / repo state) showing token budget bar and truncation markers per slice.

Cuts through: `memory.list(projectId)` tRPC → handler resolves `MemoryService` from `ctx.container` → repository returns memories → importance filter applied → click → `memory.get(id)` → detail renders → toggle global → `memory.update(scope='global')` → repository write → scope badge updates.

## Acceptance criteria

- [ ] Memory list: filter by scope, importance, source all update list without reload; pagination works at 100+ items.
- [ ] Memory detail: body renders markdown; importance change saved; scope toggle (project → global) writes `scope='global'` to DB; tags save.
- [ ] Create memory: inline form → `memory.create` → new card appears in list.
- [ ] Context preview: selecting project + task → 4 panes filled from `context.assemble(projectId, taskId)` tRPC; token budget bar shows used/total; each pane has truncation indicator if capped.
- [ ] Playwright: filter by project → count changes; open memory → toggle global → badge updates; context preview loads all 4 slices.
- [ ] CLI: `fulcrum memory list --json`; `fulcrum memory put --json`; `fulcrum memory get <id> --json`.
- [ ] TUI: memory browser + search pane (Pillar 15).

## Blocked by

- Issue 01 (scaffold) — layout needed.
- Pillar 8 issue 02 (retriever + assembler) — `memory.list`, `context.assemble` tRPC.
