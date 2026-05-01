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

- [x] **04.1 — Server actions for documents.** Owns: `src/web/src/lib/server/documents.ts`, `.test.ts`. RED: PGlite tests for create/update/delete + matching `events` row + `search_documents` upsert via `indexSearchDocument`.
- [x] **04.2 — Frontmatter form mapper.** Owns: `src/web/src/lib/markdown/frontmatter-form.ts`, `.test.ts`. RED: round-trip `{ title, kind, labels[] }` ↔ `KernelMarkdown.frontmatter` via existing `parseKernelMarkdown` / `serializeKernelMarkdown`.
- [x] **04.3 — `MarkdownEditor` wrapper (CodeMirror 6).** Owns: `src/web/src/lib/components/markdown/MarkdownEditor.svelte`, `.svelte.test.ts`. RED: jsdom-safe wrapper test asserts the `value` prop binding and the `change` event payload.
- [x] **04.4 — `MarkdownPreview` (marked + dompurify).** Owns: `src/web/src/lib/components/markdown/MarkdownPreview.svelte`, `.svelte.test.ts`. RED: sanitises `<script>`; preserves links + headings; renders `# h1` to `<h1>`.
- [ ] **04.5 — `/docs` list with kind + FTS filter.** Owns: `src/web/src/routes/docs/+page.server.ts`, `+page.svelte`, `+page.svelte.test.ts`. RED: filter by kind hides non-matching rows; free-text filter calls `searchProductDocuments`.
- [ ] **04.6 — `/docs/new`, `/docs/[id]`, `/docs/[id]/edit`.** Owns: those three routes + form action wiring. RED: create-then-view round-trip; edit preserves byte-identical body when no changes.

## Comments

### 04.1 — Server actions for documents (DONE)

RED command:
```
cd src/web && bun test --conditions=svelte ./src/lib/server/documents.test.ts
```

RED output (excerpt):
```
src/lib/server/documents.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module './documents.ts' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/server/documents.test.ts'
```

GREEN command:
```
cd src/web && bun test --conditions=svelte ./src/lib/server/documents.test.ts
```

GREEN output (excerpt):
```
 9 pass
 0 fail
 33 expect() calls
Ran 9 tests across 1 file.
```

### 04.2 — Frontmatter form mapper (DONE)

RED command:
```
cd src/web && bun test --conditions=svelte ./src/lib/markdown/frontmatter-form.test.ts
```

RED output (excerpt):
```
src/lib/markdown/frontmatter-form.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module './frontmatter-form.ts' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/markdown/frontmatter-form.test.ts'
```

GREEN command:
```
cd src/web && bun test --conditions=svelte ./src/lib/markdown/frontmatter-form.test.ts
```

GREEN output (excerpt):
```
 9 pass
 0 fail
 22 expect() calls
Ran 9 tests across 1 file.
```

Notes:
- `frontmatter-form.ts` is 42 LOC, under the ≤80 ceiling.
- The kernel's `serializeKernelMarkdown` injects a `\n` separator before bodies that don't start with `\n`; `parseKernelMarkdown`'s `^---\n…---\n?` regex only consumes one trailing newline. So a body like `"hello\n"` round-trips through the kernel as `"\nhello\n"`. The mapper inherits this — the round-trip test fixture uses a body already starting with `\n` to assert byte-equal recovery.
- `labels` filter drops non-string entries (mirrors `extractLabels` in `documents.ts`); a non-array `labels` field is dropped from both `values` and `rawFrontmatter`.

Kernel surface notes (carried from 03):
- `events.subject_id` has no FK back to `documents`, so `deleteDocumentAction` skips an "events strip" pre-delete — only `search_documents` (which has a unique key on `(source_kind, source_id)` and no FK either) is cleared first. `DELETE FROM documents ... RETURNING org_id, project_id` then drives the `document.deleted` event; on no-row-deleted we return `{ok:true}` and emit nothing.
- `frontmatter` is stored as `jsonb` and round-trips as a `Record<string, unknown>`. `extractLabels` filters non-string entries so a malformed `labels` field never breaks the search index.
- `documents.ts` is 110 LOC, under the ≤120 ceiling.

### 04.3 — MarkdownEditor wrapper (DONE)

RED command:
```
bun test --conditions=svelte ./src/web/src/lib/components/markdown/MarkdownEditor.svelte.test.ts ./src/web/src/lib/components/markdown/markdown-editor-helpers.test.ts
```

RED output (excerpt):
```
src/web/src/lib/components/markdown/MarkdownEditor.svelte.test.ts:
error: Cannot find module './MarkdownEditor.svelte' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/markdown/MarkdownEditor.svelte.test.ts'
(fail) MarkdownEditor component (SSR) > (unnamed) [9.50ms]

src/web/src/lib/components/markdown/markdown-editor-helpers.test.ts:

# Unhandled error between tests
```

GREEN command:
```
bun test --conditions=svelte ./src/web/src/lib/components/markdown/MarkdownEditor.svelte.test.ts ./src/web/src/lib/components/markdown/markdown-editor-helpers.test.ts
```

GREEN output (excerpt):
```
 9 pass
 0 fail
 11 expect() calls
Ran 9 tests across 2 files.
```

Notes:
- Added deps to `src/web/package.json`: `codemirror@6.0.2`, `@codemirror/state@6.6.0`, `@codemirror/view@6.41.1`, `@codemirror/lang-markdown@6.5.0`, `@codemirror/theme-one-dark@6.1.3`, `svelte-codemirror-editor@2.1.0`. Lockfile re-pinned with `frozenLockfile = true`.
- `svelte-codemirror-editor` v2.1 is runes-mode: it exposes an `onchange?: (value: string) => void` callback rather than a Svelte 4 `on:change` event with `event.detail.value`. The wrapper bridges by funnelling the callback's plain string through `extractMarkdownChange({ detail: { value: next } })` — this keeps the Issue 09 (Playwright) browser-level test surface compatible with the legacy `event.detail.value` shape and lets the helper unit-test stand on its own.
- `cm-ready` is derived directly from `$app/environment`'s `browser` constant. An earlier draft used a `$state(false)` toggled inside a `$effect`, but that died with `Svelte error: effect_orphan` whenever the test loader resolved to client-mode (smoke-test loader race). Pure conditional avoids the runtime entirely.
- The `<textarea hidden data-markdown-editor-source ...>` mirror sits inside the wrapper for SSR-fallback / non-JS form submission. It's marked `readonly` because the live edit channel is CodeMirror; the textarea only reflects the bound value.
- `MarkdownEditor.svelte` is 47 LOC, under the ≤90 ceiling.
- `bun run ci` (root) → 9/9 green. `cd src/web && bun run check` → 0 errors / 0 warnings. `cd src/web && bun run build` → ok.
- Pre-existing `.svelte.test.ts` files in this repo (`AppSidebar`, `AppTopbar`, `ProjectPicker`, `ProjectForm`, `DangerZone`, `SetActiveButton`) currently fail when the web suite is run as a single `bun test ./src/lib` invocation due to the SSR↔CSR loader race documented in `svelte-ssr-preload.ts`. The new MarkdownEditor SSR tests inherit the same isolation behaviour: green when targeted directly, racey under the full-suite run. The fix surface is in the test harness (out of 04.3 ownership).

### 04.4 — MarkdownPreview (DONE)

RED command:
```
bun test --conditions=svelte ./src/web/src/lib/components/markdown/markdown-preview-helpers.test.ts ./src/web/src/lib/components/markdown/MarkdownPreview.svelte.test.ts
```

RED output (excerpt):
```
src/lib/components/markdown/markdown-preview-helpers.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module './markdown-preview-helpers' from '/Users/mkh/workspace/fulcrum/src/web/src/lib/components/markdown/markdown-preview-helpers.test.ts'
```

GREEN command:
```
bun test --conditions=svelte ./src/web/src/lib/components/markdown/markdown-preview-helpers.test.ts ./src/web/src/lib/components/markdown/MarkdownPreview.svelte.test.ts
```

GREEN output (excerpt):
```
 10 pass
 0 fail
 12 expect() calls
Ran 10 tests across 2 files.
```

Notes:
- Added dep `isomorphic-dompurify@3.11.0` to `src/web/package.json` so `DOMPurify.sanitize` works in SSR / bun:test without a JSDOM bootstrap. Lockfile re-pinned with `frozenLockfile = true`.
- `renderMarkdownToHtml` calls `marked.parse(input, { async: false })` (synchronous string return) and then `DOMPurify.sanitize` with default allowlist. Defaults strip `<script>`, `<iframe>`, and `on*` handler attributes; `<a>` and `<img>` plus their canonical attributes survive.
- `MarkdownPreview.svelte` is 20 LOC (≤30 budget). `markdown-preview-helpers.ts` is 10 LOC (≤30 budget). Wrapper is `<article data-markdown-preview class="prose ...">` with `{@html renderMarkdownToHtml(value)}`; safe because the helper sanitises before any DOM injection.
- Component test must be invoked from the repo root (`bun test --conditions=svelte ./src/web/...`) so `bunfig.toml`'s `preload = ["./src/web/src/lib/test/svelte-ssr-preload.ts"]` resolves; running from `src/web/` skips preload and the SSR `.svelte` loader is never registered, mirroring the loader race noted under 04.3.
- `bun run ci` (root) → 9/9 green. `cd src/web && bun run check` → 0 errors / 0 warnings. `cd src/web && bun run build` → ok.
