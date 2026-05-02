---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (top-class editor row)
Docs: [https://github.com/cure53/DOMPurify, https://github.com/rehypejs/rehype-sanitize]
---

# Sanitization pipeline — safe-by-default HTML render + XSS prevention

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (always-on features; sanitize row in tech stack table)

## What to build
`src/docs/sanitize.ts` — a reusable module wrapping `isomorphic-dompurify` (works in Bun
SSR + browser). Exports:
- `sanitizeDocHtml(html: string): string` — strips XSS vectors, allows doc-safe elements
  (headings, lists, links, images, tables, code, pre, blockquote, figure, math/katex spans,
  iframe with `sandbox` attribute only).
- `renderDocToHtml(bodyMd: string): Promise<string>` — full remark pipeline (parse →
  rehype → rehypeShiki → rehypeSanitize → stringify), returns sanitized HTML string.

Used by: read view server-side render, CLI `docs show --html`, TUI HTML preview mode.
Must not double-sanitize TipTap editor output (editor renders its own content safely).

## Acceptance criteria
- [ ] `sanitizeDocHtml` strips `<script>` tags and their contents
- [ ] `sanitizeDocHtml` strips `onerror`, `onclick`, `onload`, and all `on*` event attributes
- [ ] `sanitizeDocHtml` strips `javascript:` href values
- [ ] `sanitizeDocHtml` allows safe elements: `h1–h6`, `p`, `ul/ol/li`, `a`, `img`, `table/thead/tbody/tr/td/th`, `pre/code`, `blockquote`, `figure`, `strong/em/del`, `span.katex-html`, `iframe[sandbox]`
- [ ] `sanitizeDocHtml` preserves safe `iframe[sandbox]` (used by Mermaid NodeView)
- [ ] `renderDocToHtml` produces sanitized HTML from markdown; code blocks syntax-highlighted via shiki
- [ ] `renderDocToHtml` is isomorphic — runs correctly in Bun SSR and in browser (happy-dom test)
- [ ] Tests: XSS payload `<script>alert(1)</script>` → sanitized output has no `<script>`
- [ ] Tests: `onerror` attribute on `<img>` → stripped from output
- [ ] Tests: `<iframe sandbox="allow-scripts">` with Mermaid content → preserved (sandbox attr present)
- [ ] Tests: `<iframe>` without sandbox → stripped
- [ ] Tests: markdown code block with `typescript` lang → rendered with shiki `<span>` tokens; no raw `<script>` possible
- [ ] Benchmark: `renderDocToHtml` on 10 kB markdown doc < 20 ms (Bun benchmark in test)
- [ ] Web: all read views use `renderDocToHtml`; Playwright test verifies XSS payload stripped in rendered page
- [ ] CLI: `fulcrum docs show <slug> --html` outputs sanitized HTML; XSS payload stripped in output
- [ ] TUI: no HTML rendering in TUI (plaintext only); sanitize module not called from TUI path

## Blocked by
`05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- `isomorphic-dompurify` uses `DOMPurify` in browser, `jsdom`-backed in Node/Bun — confirm Bun compatibility in the spike; if incompatible, use `rehypeSanitize` only (unified pipeline handles both environments natively)
- Keep allowed element list as a named export `SAFE_DOC_ELEMENTS` so future extensions (embed, footnote, etc.) can extend it without editing the sanitize function
