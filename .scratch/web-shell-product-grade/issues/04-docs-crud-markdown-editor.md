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
