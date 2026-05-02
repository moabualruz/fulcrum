---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C3, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (top-class editor row)
Docs: [https://katex.org/docs/api, https://mermaid.js.org/config/schema-docs/config.html, https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api]
---

# Math (KaTeX) + Mermaid (sandboxed iframe) + Excalidraw (React island) NodeViews

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-27, P7-26, P7-29)

## What to build
Three custom TipTap NodeView extensions:

1. **KaTeX** — inline `$expr$` and block `$$expr$$` math nodes. Rendered via `katex.renderToString` on mount. Invalid LaTeX shows red fallback with raw expression.
2. **Mermaid** — `/mermaid` slash command inserts block node with fenced code + sandboxed iframe renderer. Diagram rendered inside a `<iframe sandbox="allow-scripts">` with inline script — zero npm dep risk; CVE recurrence gate: if Mermaid npm CVE reoccurs, strip the npm dep and load only via iframe CDN.
3. **Excalidraw** — `/sketch` slash command inserts a React-island sketch node (uses `@excalidraw/excalidraw`). Sketch data saved as base64 JSON in node attrs; opens full Excalidraw dialog on click; saves on close. Bundle gate: if `@excalidraw/excalidraw` pushes total bundle > 400 kB gzip, swap to draw.io web embed.

## Acceptance criteria
- [ ] KaTeX inline: `$E=mc^2$` in editor renders as typeset math inline; fallback shows red raw expression for invalid LaTeX
- [ ] KaTeX block: `$$…$$` renders as display-mode centered math block
- [ ] KaTeX: slash menu entry `/math` inserts inline node; `/math-block` inserts display node
- [ ] Mermaid: `/mermaid` inserts node; valid diagram string renders diagram in sandboxed iframe
- [ ] Mermaid: invalid syntax shows inline error text ("Diagram syntax error") not blank
- [ ] Mermaid: no XSS — `<script>` in diagram string is not executed outside sandbox
- [ ] Excalidraw: `/sketch` opens Excalidraw component; drawing saved on close as node attrs; renders thumbnail in doc
- [ ] Excalidraw: click on thumbnail re-opens Excalidraw with existing drawing; update saves correctly
- [ ] Bundle: `bun build --analyze` — KaTeX < 50 kB gzip; Mermaid (iframe, no npm) = 0 kB; Excalidraw < 400 kB gzip
- [ ] Tests: KaTeX node — valid LaTeX renders non-empty string; invalid LaTeX renders fallback
- [ ] Tests: Mermaid iframe — `src` attribute uses sanitised diagram; no raw HTML injection possible
- [ ] Web: all three block types visible in slash menu; render correctly in `/docs/<slug>/edit` and read view
- [ ] CLI: `fulcrum docs show <slug> --json` `body_md` renders math as `$…$` fenced blocks; mermaid as fenced `mermaid` blocks
- [ ] TUI: math and mermaid rendered as fenced code blocks in plaintext reader; Excalidraw as `[sketch]` placeholder

## Blocked by
`02-tiptap-svelte-binding-spike.md`

## Notes / Tech-stack hints
- Mermaid npm dep listed as optional; iframe renderer uses `mermaid.initialize + mermaid.render` in an inline `<script>` inside the blob URL — no network call unless CDN gate triggered
- Excalidraw is a React component; use a Svelte `<svelte:component>` wrapper with `onMount` + `createRoot` from `react-dom/client` — React-in-Svelte island pattern
- KaTeX failure gate: if missing glyph causes render crash → swap to MathJax (Apache-2.0)
