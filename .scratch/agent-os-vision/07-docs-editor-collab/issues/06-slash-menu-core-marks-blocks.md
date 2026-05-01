---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (top-class editor row)
Docs: [https://tiptap.dev/docs/editor/extensions/functionality/slash-commands, https://tiptap.dev/docs/editor/extensions/nodes/table]
---

# Slash menu + StarterKit core marks/blocks — heading/list/link/code/table/blockquote

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-24 area; always-on features section)

## What to build
Extend `EditorBaseline.svelte` (slice 02) into a full `DocEditor.svelte` with all
StarterKit extensions wired: H1-H6, bullet list, ordered list, task list, bold/italic/
strike/underline/code, blockquote, horizontal rule, undo/redo. Add:
`@tiptap/extension-table` (CRUD via toolbar + keyboard), `@tiptap/extension-link`
(auto-detect URLs, `Mod+K` dialog), `@tiptap/extension-code-block-lowlight` + shiki
(syntax highlight). Implement `/` slash menu using `shadcn-svelte Command` — keyboard
navigable, covers all block types + template insert + wikilink insert placeholders.
Autosave: 2 s debounce writing `content_json` + `body_md` via `docs.update` tRPC.

## Acceptance criteria
- [ ] `DocEditor.svelte` renders StarterKit with all marks: bold/italic/strike/underline/code (inline)
- [ ] Headings H1–H6 via `/heading-1` … `/heading-6` slash commands and toolbar buttons
- [ ] Bullet list, ordered list, task list (checklist) via slash menu and keyboard shortcuts
- [ ] Blockquote via `/quote` slash menu entry
- [ ] Table: insert via `/table`, add/remove row/column via right-click context menu, Tab navigation across cells
- [ ] Link: `Mod+K` opens link dialog; auto-detects pasted URLs; unlinks via toolbar
- [ ] Code block: `/code` inserts; shiki highlights TypeScript/Python/Bash/JSON/SQL by default; language picker in toolbar
- [ ] Slash menu (`/` trigger): opens `shadcn-svelte Command` popover, filters on typing, keyboard navigable (↑↓ Enter Esc), inserts correct block
- [ ] Autosave: 2 s after last keystroke calls `docs.update`; loading indicator while saving; toast on save error
- [ ] Tests: Vitest — slash menu filters items by typed text; correct node inserted for each item
- [ ] Tests: autosave debounce — rapid keystrokes produce single `docs.update` call after 2 s
- [ ] Playwright: type `/table` → Enter → table inserted; Tab moves to next cell
- [ ] Playwright: paste URL → auto-linked; Mod+K → link dialog opens
- [ ] Web: `/docs/<slug>/edit` mounts `DocEditor.svelte`; all blocks render and save
- [ ] CLI: `fulcrum docs show <slug> --json` returns `body_md` with correct markdown for all block types
- [ ] TUI: `fulcrum docs show` body_md renders readable in TUI plain-text pane (no raw JSON)

## Blocked by
`02-tiptap-svelte-binding-spike.md` — needs confirmed binding before extensions built

## Notes / Tech-stack hints
- shiki failure gate: if WASM budget exceeded in PGlite context → switch to Prism (synchronous, no WASM)
- Slash menu should use Tiptap `Extension.create` with `addProseMirrorPlugins` to intercept `/` keystroke — see tiptap docs on suggestion plugin
- Autosave writes both `content_json` (TipTap JSON source) and `body_md` (remark serialise → string) — use `@tiptap/html` or `src/docs/tiptap-to-md.ts` converter
