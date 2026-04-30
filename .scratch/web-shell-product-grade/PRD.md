# Web Shell — Product-Grade Rebuild

Status: ready-for-agent
Source: user feedback 2026-04-30 ("not a fully functioning UI", "fucking ugly", "does nothing only shows some shitty ass very high level data")
Issues: see `issues/01-..` through `issues/09-..`.

> **Goal:** Replace the read-only Tailwind primitives currently shipped at `src/web/` with a polished, fully interactive product UI over the local product kernel. The shell must look and behave like a real Jira/Linear-class tool, not a debug viewer.

**Architecture:** SvelteKit + Svelte 5 (already in place). shadcn-svelte component kit copied into `src/web/src/lib/components/ui/`. CodeMirror 6 for Markdown. svelte-dnd-action for the kanban. SvelteKit form actions for every mutation; SQL goes through `src/product-kernel/store/repositories.ts` and writes accompanying `events` rows. Active project lives in a Svelte store backed by a cookie. Server side is the SvelteKit Node adapter so the dev server can run on Bun.

**Tech stack:** Bun, Svelte 5, SvelteKit, shadcn-svelte 1.2, Tailwind v4 (`@tailwindcss/vite`), `lucide-svelte`, `bits-ui`, `tailwind-variants`, `tailwind-merge`, `@codemirror/*`, `svelte-codemirror-editor`, `svelte-dnd-action`, `sonner-svelte`, `mode-watcher`, PGlite (existing).

**Branch policy:** Stay on `main`. One Conventional Commit per closed issue. No PRs (per user instruction).

## Hard requirements (non-negotiable)

- Real component kit. No more raw `<div>` lists.
- Every list view supports filter, search, and empty-state.
- Every mutation (create/update/delete) goes through a SvelteKit form action that writes the source row + an `events` row in one SQL transaction.
- Every mutation surfaces a toast on success/failure (`sonner-svelte`).
- Dark mode toggle wired and persisted (cookie + `mode-watcher`).
- Cmd+K command palette routes to projects/docs/board/runs/search.
- Kanban supports keyboard re-order for accessibility (Up/Down to move within column, Cmd+Right/Left to move column).
- All routes typed. `cd src/web && bun run check` green; root `bun run ci` green (now includes `web:check` + `web:build`).
- No model/embedding dependency. Retrieval stays Postgres FTS only.
- No telemetry, no auth flow, no external network calls beyond shadcn registry during init.

## Out of scope for this rebuild

- Real-time collaboration / multi-cursor editing.
- Auth + accounts (still local-first; project-level RLS waits for SaaS work).
- Charting (ECharts) — defer to a follow-up unless needed for runs.
- Plugin manager UI (covered by HANDOVER §6.7).

## Severity bands

- **critical** — blocks user value. Issues 01, 02, 03, 04, 05.
- **high** — required for "real product" feel. Issues 06, 07, 08.
- **medium** — quality + tests. Issue 09.

## Execution order

1. 01 install shadcn kit → 02 sidebar layout + theme + project picker (sets visual baseline).
2. 03 projects CRUD → 04 docs CRUD + Markdown editor → 05 kanban with drag/drop.
3. 06 runs view → 07 search + dashboard → 08 toasts + skeletons + a11y.
4. 09 tests + e2e.

## Acceptance gate

- All 9 issues `Status: done`.
- `cd src/web && bun run dev` boots; user can: create a project, create a task, drag it across the board, write a Markdown doc, search for it via cmd+K, watch the toast confirm.
- `bun run ci` green (typecheck, test, build, web:check, web:build, skills:lint, compress:check).
- `cd src/web && bun run test` (Vitest) green.
- Playwright e2e in `src/web/tests/e2e/` boots SvelteKit dev server, executes the smoke flow, exits 0.
