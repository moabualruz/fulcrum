# Product Kernel

Local-first product kernel for Fulcrum. Powers the supervisor, task system, agent runs, memory, artifacts, and context engine described in `HANDOVER.md` §6. Implementation lives under `src/product-kernel/` and is exposed through `fulcrum product …`.

## Operator modes

Two engines, one driver contract (`ProductDb` in `src/product-kernel/db/types.ts`):

- **Local default — PGlite.** Embedded Postgres, no separate process. Database files live under `~/.fulcrum/state/product/db/main`. Ships with the Fulcrum binary; no install step beyond `bun add @electric-sql/pglite`.
- **Team / SaaS — PostgreSQL.** Set `DATABASE_URL` to a server connection string and use `openPostgres(url)`. The same SQL runs against both engines; the only behavior split is in `claimJob` (Postgres uses `FOR UPDATE SKIP LOCKED`; PGlite uses single-process transactions, documented in code).

State paths (override the root with `FULCRUM_HOME`):

| Path                                       | Contents                                |
| ------------------------------------------ | --------------------------------------- |
| `~/.fulcrum/state/product/db/main`         | PGlite data directory                   |
| `~/.fulcrum/state/product/artifacts`       | Artifact bodies (per-file storage)      |

`fulcrum product init` creates the PGlite directory, runs migrations, and ensures a `default` local org. `fulcrum doctor` reports engine + schema + row counts. `fulcrum uninstall --purge` removes `~/.fulcrum/state/product/`.

## Schema

Migrations under `src/product-kernel/db/migrations/`:

- `0001_product_kernel.sql` — `orgs`, `projects`, `repos`, `documents`, `tasks`, `memories`, `agent_runs`, `artifacts`, `edges`, `events`. ULID text PKs, `timestamptz` everywhere.
- `0002_search.sql` — `search_documents` read model with a generated `tsvector search_vector` column and a GIN index.
- `0003_jobs.sql` — local queue with status CHECK constraint and a claim index.

The runner is idempotent: re-running applies only new migrations and tracks them in `schema_migrations`.

## Deterministic retrieval

The kernel intentionally does **not** use embeddings, RAG pipelines, semantic search, or any local/remote model dependency. Retrieval is structural:

- **Full-text search** — `searchProductDocuments(db, query, filters)` runs Postgres FTS (`plainto_tsquery('english', $1)`) over `search_documents.search_vector`. Title text is weight A, body weight B. Results order by `score DESC, updated_at DESC, id ASC` for stability.
- **Filters** — `orgId` + optional `projectId` + optional `sourceKinds[]`. No fuzzy matching; no synonym expansion.
- **Edges + backlinks** — `edges(from_kind, from_id, to_kind, to_id, rel)` records typed relationships used by `assembleContext`.
- **Stable context assembly** — `assembleContext(db, { orgId, taskId, searchQuery? })` renders ordered Markdown sections: task → linked documents → linked memory → optional search hits → recent decision documents → artifacts. Same inputs ⇒ byte-identical output.

If you want LLM-side reasoning over kernel data, do it at the agent layer; the kernel does not call models.

## Failure gates

Run before depending on each layer:

```bash
bun test src/product-kernel/compat.test.ts
bun test src/product-kernel/markdown.test.ts
bun test src/product-kernel/state.test.ts
bun test src/product-kernel/db/migrate.test.ts
bun test src/product-kernel/events.test.ts
bun test src/product-kernel/search.test.ts
bun test src/product-kernel/context.test.ts
bun test src/product-kernel/jobs.test.ts
bun test src/cli/product.test.ts src/cli/doctor.test.ts src/cli/uninstall.test.ts
bun run --bun tsc --noEmit
bun run ci
```

Gate policy:

- **pass** — continue with the default tool.
- **warn** — keep the default only if the limitation is documented in the relevant task.
- **fail** — stop dependent tasks and switch to the next tool in the fallback table.

## CLI surface

```bash
fulcrum product init [--json]
fulcrum product projects list [--json]
fulcrum product search "<query>" [--org-slug <slug>] [--limit <N>] [--json]
fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
```

`--json` is parseable on every verb. `--org-slug` defaults to `default` (the local org `fulcrum product init` creates).

## Web shell

A SvelteKit 2 + shadcn-svelte web shell ships under `src/web/`, backed by the same PGlite product DB the CLI uses (`${FULCRUM_HOME}/state/product/db/main`). It surfaces all CLI domains as interactive views: `/` dashboard, `/projects`, `/docs` (Markdown editor), `/boards` (drag/drop kanban), `/runs` (filterable run list + detail with cancel/retry), `/search` (full-text), and a global cmd+K command palette. Form actions return a uniform `ActionResult` shape that the layout's `Toaster` bridge surfaces as success/error toasts. Heavy queries stream via SvelteKit's `streamed` loader so route headers paint while data resolves; `RouteSkeleton` placeholders fill the pending branch.

## Web shell testing

Vitest + Playwright scaffold for the web shell under `src/web/`. Unit tests cover store logic, filtering, validation, and component rendering. E2E tests run against a temp PGlite instance and verify the user journey: create project → task → drag → search → toast. Run `bun run web:test` for units; `FULCRUM_RUN_E2E=1 bun run web:e2e` for e2e. See `src/web/README.md` for full invocation details.
