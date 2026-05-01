---
Status: ready-for-agent
Triage: HITL
Pillar: 07-docs-editor-collab
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C3]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (top-class editor row)
Docs: [https://tiptap.dev/docs/editor/getting-started/install/svelte, https://github.com/sibiraj-s/svelte-tiptap]
---

# TipTap v2 + svelte-tiptap baseline spike — Svelte 5 runes compat gate

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (tech stack table, failure gates section)

## What to build
Prove the integration works before any feature work builds on top. Install `@tiptap/core`,
`@tiptap/pm`, `@tiptap/starter-kit`, and `svelte-tiptap@3.0.1` (first choice). Wire a
minimal `EditorBaseline.svelte` component with runes-mode (`<script lang="ts">`) that
mounts a TipTap editor, accepts `content: JSONContent` prop, emits `on:change` with
updated JSON. If Svelte 5 runes compat regression is detected during the spike, evaluate
Tipex as immediate fallback; document findings as an ADR commit in `docs/adrs/`. HITL
gate: agent stops and surfaces result to user before any dependent slices proceed.

## Acceptance criteria
- [ ] `EditorBaseline.svelte` mounts without console errors in Svelte 5 runes mode (Bun dev server)
- [ ] Component accepts `content: JSONContent` and renders StarterKit content (headings, paragraphs, bold, lists)
- [ ] `on:change` fires with updated `JSONContent` on every keystroke / mutation
- [ ] Vitest unit test: mount component in happy-dom, set content, assert `on:change` fires with correct JSON shape
- [ ] Vitest unit test: empty `content` prop mounts with empty document node, no runtime error
- [ ] Playwright e2e: type "Hello world" into editor, press **Bold**, assert `<strong>Hello world</strong>` visible
- [ ] Bundle size audit: `bun build --analyze` shows TipTap + StarterKit < 350 kB gzip
- [ ] If Tipex path taken: same acceptance criteria met; ADR doc written at `docs/adrs/07-tiptap-binding.md` recording reason, compat matrix, Tipex API diff
- [ ] HITL gate: PR comment summarises compat verdict, chosen binding, any runes workarounds applied

## Blocked by
None — can start immediately (highest-risk dep, must gate all downstream editor slices)

## Notes / Tech-stack hints
- PRD failure gate order: svelte-tiptap 3.0.1 → Tipex (Svelte 5 runes) → Milkdown → svelte-lexical
- `svelte-tiptap` wraps TipTap editor as a Svelte component with `EditorContent`; check for `$effect` / store incompatibilities in runes mode
- Do NOT advance to custom NodeViews or extensions until this spike passes HITL review
- `useEditor` composable in svelte-tiptap must return a reactive store compatible with Svelte 5 `$state`
