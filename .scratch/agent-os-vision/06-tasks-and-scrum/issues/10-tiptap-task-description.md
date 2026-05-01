---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Top-class editor row)
Docs: []
---

# TipTap task description — autosave, wikilinks, mentions

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-12)

## What to build
Wire the task detail description field to TipTap v2 (StarterKit + wikilinks +
`@agent` mention extension). Autosave debounces writes to `tRPC tasks.update`
every 1500 ms. Wikilink parses `[[doc slug]]` and resolves to doc IDs via lookup.
Mention parses `@username`/`@agent-name` and emits `mention_created` event.
CLI edits description as plain text (round-trip safe). TUI uses plain `<Textarea>`
(no TipTap in terminal) but reads TipTap JSON and renders plain-text preview.

## Acceptance criteria
- [ ] Web: TipTap editor mounts on task detail description field using StarterKit + wikilink extension (~300 LOC from Pillar 7) + `@agent` mention extension (~150 LOC)
- [ ] Web: autosave debounce — editor stops receiving input → 1500 ms later `tasks.update` called with `tiptap_content jsonb`; concurrent saves deduplicated
- [ ] Web: wikilink `[[slug]]` resolves via `docs.get(slug)` tRPC call; renders as clickable chip; unresolved renders as dashed underline
- [ ] Web: `@mention` triggers user/agent picker popover; selecting emits `mention_created` event with `{task_id, mentioned_id, kind}`
- [ ] Web: slash command menu (`/`) opens shadcn-svelte Command palette with heading, bullet, numbered list, code block, image, math (from Pillar 7 shared extension set)
- [ ] CLI: `tasks update --description-text "..."` accepts plain text; stored as TipTap paragraph JSON (`{type:'doc', content:[{type:'paragraph',...}]}`)
- [ ] CLI: `tasks get --json` returns `description_text` (extracted plain text) alongside `tiptap_content`
- [ ] TUI: task detail renders `description_text` in a read-only `<Textarea>`; edit sends plain text via `tasks.update --description-text`
- [ ] Tests: autosave fires exactly once 1500 ms after last keystroke (vitest fake timers)
- [ ] Tests: wikilink `[[missing-slug]]` renders dashed underline without throwing
- [ ] Tests: `@mention` event emitted with correct shape on selection
- [ ] Tests: plain-text round-trip — write text via CLI, read in Web, content preserved

## Blocked by
- 07-task-crud-baseline

## Notes / Tech-stack hints
- TipTap instance shared with Pillar 7 (docs editor) — import extension set from `src/editor/extensions.ts`
- `tiptapContent` property added to `Task` entity in this slice via additive MikroORM migration class (`mikro-orm migration:create`)
- Real-time collab (Yjs) for task description is gated behind `real-time-collab-server` flag — wired in slice 27
- Autosave must not fire if content is unchanged (deep-equal check before tRPC call)
