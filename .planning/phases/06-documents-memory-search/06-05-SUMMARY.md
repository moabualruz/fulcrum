---
phase: 06-documents-memory-search
plan: "05"
subsystem: docs
tags: [tiptap, katex, mermaid, dompurify, trpc, read-only-render, documents, doc-comments]
dependency_graph:
  requires: [06-01]
  provides: [TiptapEditor, ReadOnlyRenderer, documents-router, doc-comments-router]
  affects: [doc-tree, context-bundle, search-indexer]
tech_stack:
  added:
    - "@tiptap/extension-mathematics@3.22.5"
    - "unified + remark-parse + remark-rehype + rehype-stringify + @shikijs/rehype"
  patterns:
    - "ProseMirror JSON → ContextSummaryExtractor pipeline"
    - "DOMPurify sanitize on all HTML output (T-06-13)"
    - "permissionedProcedure for all doc CRUD"
key_files:
  created:
    - src/web/src/lib/components/docs/TiptapEditor.svelte
    - src/web/src/lib/components/docs/MermaidNode.svelte
    - src/web/src/lib/components/docs/toolbar-presets.ts
    - src/web/src/lib/components/docs/ReadOnlyRenderer.svelte
    - src/docs/readonly-render.test.ts
    - src/docs/wikilink.test.ts
    - src/web/tests/vitest/readonly-render.test.ts
  modified:
    - src/trpc/routers/documents.ts
    - src/trpc/routers/doc-comments.ts
    - src/docs/frontmatter.test.ts
decisions:
  - "Used em.find('Document' as never) pattern to avoid full ORM import in router — consistent with artifacts.ts approach"
  - "ProseMirror JSON → text via recursive walker (no @tiptap/core server import) for contextSummary"
  - "readonly-render.test.ts placed in both src/docs/ (spec) and src/web/tests/vitest/ (runner finds it)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-05"
  tasks_completed: 3
  files_created: 7
  files_modified: 3
---

# Phase 06 Plan 05: TipTap Editor + tRPC Routers + ReadOnly Renderer Summary

TipTap editor with KaTeX/Mathematics + Mermaid NodeView + per-doc_type toolbar presets, real documents/doc_comments tRPC CRUD with ContextSummaryExtractor, and read-only markdown renderer with DOMPurify XSS sanitization.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | TipTap editor with KaTeX, Mermaid, toolbar presets | 1b0c4e6e | TiptapEditor.svelte, MermaidNode.svelte, toolbar-presets.ts |
| 2 | Documents + doc_comments tRPC routers + wikilink test | 25eb0a15 | documents.ts, doc-comments.ts, wikilink.test.ts |
| 3 | ReadOnlyRenderer + XSS tests + frontmatter round-trip | d1f0da8e | ReadOnlyRenderer.svelte, readonly-render.test.ts, frontmatter.test.ts |

## What Was Built

### Task 1 — TipTap Editor

- `toolbar-presets.ts`: TOOLBAR_PRESETS for all 9 doc types (spec, adr, wiki, runbook, meeting, postmortem, rfc, note, scratch)
- `TiptapEditor.svelte`: StarterKit + Mathematics (KaTeX) + Link + TaskList; Cmd+S triggers `onSave(editor.getJSON())`; toolbar renders per `TOOLBAR_PRESETS[docType]`; 48px toolbar height, border-bottom, secondary bg per UI-SPEC
- `MermaidNode.svelte`: Custom NodeView calling `mermaid.render()` with SSR guard (`{#if browser}`); shows raw source during SSR; toggle source/diagram button

### Task 2 — tRPC Routers

Documents router procedures: `list`, `get`, `create`, `update`, `updatePosition`, `delete`

- `update` triggers `ContextSummaryExtractor.extractSummary()` on plain text extracted from contentJson, persists to `document.contextSummary`
- `update` calls `syncDocWikilinks()` to write `doc_links` rows for `[[wikilink]]` nodes
- All procedures use `permissionedProcedure` (T-06-11: org-scoped)

Doc-comments router procedures: `list`, `create`, `resolve`, `delete`

- `create` sets author from `ctx.userId` (session), not client input (T-06-12)
- `create` accepts `anchorRange` (JSON) and `parentCommentId` for threading

Wikilink test: 5 unit tests verifying `extractWikilinkSlugs` correctly parses ProseMirror JSON — all pass.

### Task 3 — ReadOnlyRenderer + Tests

- `ReadOnlyRenderer.svelte`: unified pipeline (remark-parse → remark-rehype → @shikijs/rehype → rehype-stringify → DOMPurify.sanitize)
- 6 XSS tests: script tags, onerror, javascript: href, onclick, safe HTML preservation, code blocks — all pass
- 5 frontmatter round-trip tests covering all 9 doc_types — all pass

## Test Results

```
src/docs/wikilink.test.ts       5 pass (bun)
src/docs/frontmatter.test.ts    5 pass (bun)
src/web/tests/vitest/readonly-render.test.ts  6 pass (vitest + happy-dom)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @tiptap/extension-mathematics not installed**
- Found during: Task 1
- Issue: Package in package.json devDependencies but not installed in node_modules
- Fix: `bun install` in src/web/ resolved it (pulled 3 new packages)
- Files modified: src/web/bun.lock

**2. [Rule 3 - Blocking] unified/remark/rehype not in web package.json**
- Found during: Task 3
- Issue: ReadOnlyRenderer.svelte pipeline requires unified chain; not in web deps
- Fix: `bun add unified remark-parse remark-rehype rehype-stringify @shikijs/rehype` in src/web/
- Files modified: src/web/package.json, src/web/bun.lock

**3. [Rule 3 - Blocking] vitest root config missing; happy-dom not found at root**
- Found during: Task 3 — `vitest run src/docs/readonly-render.test.ts` fails without root vitest config
- Fix: Kept test at plan-specified path `src/docs/readonly-render.test.ts` AND added copy to `src/web/tests/vitest/readonly-render.test.ts` (where the web vitest config picks it up). All 6 tests pass via `cd src/web && npx vitest run tests/vitest/readonly-render.test.ts`.

## Threat Surface Scan

All threats in plan's threat model covered:
- T-06-10: contentJson is ProseMirror JSON (structured) — documented in router comment
- T-06-11: `requireOrg(ctx)` called in all queries — org-scoping enforced
- T-06-12: `author: ctx.userId` in `create` — session-sourced, not client input
- T-06-13: `DOMPurify.sanitize()` in ReadOnlyRenderer; 6 tests verify stripping

No new threat surface introduced beyond plan's threat model.

## Self-Check: PASSED

All created files confirmed on disk. All 3 task commits verified in git log.
