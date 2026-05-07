# Product Kernel

Local-first product kernel for Fulcrum. Powers supervisor, task system, agent runs, memory, artifacts, context engine per `HANDOVER.md` §6. Impl under `src/product-kernel/`, exposed via `fulcrum product …`.

## Operator modes

Two engines, one driver contract (`ProductDb` in `src/product-kernel/db/types.ts`):

- **Local default — PGlite.** Embedded Postgres, no separate process. DB files at `~/.fulcrum/state/product/db/main`. Ships w/ Fulcrum binary; no install beyond `bun add @electric-sql/pglite`.
- **Team / SaaS — PostgreSQL.** Set `DATABASE_URL` to server conn string, use `openPostgres(url)`. Same SQL both engines; only behavior split in `claimJob` (Postgres uses `FOR UPDATE SKIP LOCKED`; PGlite uses single-process txns, documented in code).

State paths (override root w/ `FULCRUM_HOME`):

| Path                                       | Contents                                |
| ------------------------------------------ | --------------------------------------- |
| `~/.fulcrum/state/product/db/main`         | PGlite data directory                   |
| `~/.fulcrum/state/product/artifacts`       | Artifact bodies (per-file storage)      |

`fulcrum product init` creates PGlite dir, runs migrations, ensures `default` local org. `fulcrum doctor` reports engine + schema + row counts. `fulcrum uninstall --purge` removes `~/.fulcrum/state/product/`.

## Schema

Migrations under `src/product-kernel/db/migrations/`:

- `0001_product_kernel.sql` — `orgs`, `projects`, `repos`, `documents`, `tasks`, `memories`, `agent_runs`, `artifacts`, `edges`, `events`. ULID text PKs, `timestamptz` everywhere.
- `0002_search.sql` — `search_documents` read model w/ generated `tsvector search_vector` column + GIN index.
- `0003_jobs.sql` — local queue w/ status CHECK constraint + claim index.

Runner idempotent: re-run applies only new migrations, tracks in `schema_migrations`.

## Deterministic retrieval

Kernel intentionally does **not** use embeddings, RAG pipelines, semantic search, or any local/remote model dep. Retrieval structural:

- **Full-text search** — `searchProductDocuments(db, query, filters)` runs Postgres FTS (`plainto_tsquery('english', $1)`) over `search_documents.search_vector`. Title weight A, body weight B. Order by `score DESC, updated_at DESC, id ASC` for stability.
- **Filters** — `orgId` + optional `projectId` + optional `sourceKinds[]`. No fuzzy match; no synonym expansion.
- **Edges + backlinks** — `edges(from_kind, from_id, to_kind, to_id, rel)` records typed relationships used by `assembleContext`.
- **Stable context assembly** — `assembleContext(db, { orgId, taskId, searchQuery? })` renders ordered Markdown sections: task → linked documents → linked memory → optional search hits → recent decision documents → artifacts. Same inputs ⇒ byte-identical output.

LLM-side reasoning over kernel data → do at agent layer; kernel no call models.

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
bun test apps/cli/src/product.test.ts apps/cli/src/doctor.test.ts apps/cli/src/uninstall.test.ts
bun run --bun tsc --noEmit
bun run ci
```

Gate policy:

- **pass** — continue w/ default tool.
- **warn** — keep default only if limitation documented in relevant task.
- **fail** — stop dependent tasks, switch to next tool in fallback table.

## CLI surface

```bash
fulcrum product init [--json]
fulcrum product projects list [--json]
fulcrum product search "<query>" [--org-slug <slug>] [--limit <N>] [--json]
fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
```

`--json` parseable every verb. `--org-slug` defaults `default` (local org `fulcrum product init` creates).

## Web shell

SvelteKit 2 + shadcn-svelte web shell at `apps/web/`, same PGlite product DB CLI uses (`${FULCRUM_HOME}/state/product/db/main`). Surfaces all CLI domains as interactive views: `/` dashboard, `/projects`, `/docs` (Markdown editor), `/boards` (drag/drop kanban), `/runs` (filterable run list + detail w/ cancel/retry), `/search` (full-text), global cmd+K palette. Form actions return uniform `ActionResult` shape; layout `Toaster` bridge surfaces success/error toasts. Heavy queries stream via SvelteKit `streamed` loader so route headers paint while data resolves; `RouteSkeleton` placeholders fill pending branch.