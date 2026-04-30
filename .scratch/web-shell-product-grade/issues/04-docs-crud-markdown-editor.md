# 04 — Documents CRUD + Markdown editor

Status: ready-for-agent
Risk tier: high
Severity: critical
Dependencies: 02
File ownership:
- `src/web/src/routes/docs/**`
- `src/web/src/lib/server/documents.ts`
- `src/web/src/lib/components/markdown/**`

TDD plan:
- RED unit: `src/web/src/lib/server/documents.test.ts` exercises `createDocumentAction`, `updateDocumentAction`, `deleteDocumentAction` against PGlite; asserts source row + `document.<verb>` event row + `search_documents` row update via `indexSearchDocument`.
- RED unit: `markdown-preview.test.ts` for the preview helper — sanitises script tags, preserves links, renders basic Markdown to HTML.
- RED component: `markdown-editor.svelte.test.ts` boots the CodeMirror wrapper, types into the textarea fallback, and asserts the `change` event payload matches the typed text. (Skip the real CodeMirror render in jsdom; assert wrapper props instead.)
- RED component: `frontmatter-form.svelte.test.ts` validates required `title` + `kind`, surfaces inline errors.
- GREEN: implement actions, editor wrapper, preview tab, list with FTS filter.
- REFACTOR: factor a `<MarkdownView />` component reused on `/docs/[id]` and on the dashboard recent-docs list.

Acceptance criteria:
- `/docs` list with kind filter, project filter, free-text filter (FTS through `searchProductDocuments`). Empty state + create button.
- `/docs/new` and `/docs/[id]/edit` use a CodeMirror 6 Markdown editor (`svelte-codemirror-editor` + `@codemirror/lang-markdown` + `@codemirror/theme-one-dark`).
- Frontmatter form (title, kind, labels). Round-trip through `parseKernelMarkdown` / `serializeKernelMarkdown` (issue 15 from migration-review still applies; this PR uses the existing implementation but flags the limitation in `<aside>`).
- Live preview tab using `marked` (or similar) + DOMPurify.
- `/docs/[id]` view renders the Markdown body.
- Delete via `AlertDialog`; success → redirect to `/docs`.
- Every mutation writes a `document.<verb>` event row.
- Toasts on success/failure.

## Sub-tasks

- [ ] **04.1 — Server actions for documents.** Owns: `src/web/src/lib/server/documents.ts`, `.test.ts`. RED: PGlite tests for create/update/delete + matching `events` row + `search_documents` upsert via `indexSearchDocument`.
- [ ] **04.2 — Frontmatter form mapper.** Owns: `src/web/src/lib/markdown/frontmatter-form.ts`, `.test.ts`. RED: round-trip `{ title, kind, labels[] }` ↔ `KernelMarkdown.frontmatter` via existing `parseKernelMarkdown` / `serializeKernelMarkdown`.
- [ ] **04.3 — `MarkdownEditor` wrapper (CodeMirror 6).** Owns: `src/web/src/lib/components/markdown/MarkdownEditor.svelte`, `.svelte.test.ts`. RED: jsdom-safe wrapper test asserts the `value` prop binding and the `change` event payload.
- [ ] **04.4 — `MarkdownPreview` (marked + dompurify).** Owns: `src/web/src/lib/components/markdown/MarkdownPreview.svelte`, `.svelte.test.ts`. RED: sanitises `<script>`; preserves links + headings; renders `# h1` to `<h1>`.
- [ ] **04.5 — `/docs` list with kind + FTS filter.** Owns: `src/web/src/routes/docs/+page.server.ts`, `+page.svelte`, `+page.svelte.test.ts`. RED: filter by kind hides non-matching rows; free-text filter calls `searchProductDocuments`.
- [ ] **04.6 — `/docs/new`, `/docs/[id]`, `/docs/[id]/edit`.** Owns: those three routes + form action wiring. RED: create-then-view round-trip; edit preserves byte-identical body when no changes.
