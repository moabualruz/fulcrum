# Product Store

Local-first product-store infrastructure for Fulcrum. Powers supervisor, task system, agent runs, memory, artifacts, and context engine per `HANDOVER.md` §6. Implementation lives under `services/platform-core/src/infrastructure/product-store/`, exposed via `fulcrum product …`.

## Database Selection

Fulcrum uses one Postgres-compatible database selection path (`resolveDatabaseConfig` in `services/platform-core/src/application/db/database-config.ts`):

- **Local default — PGlite.** No separate database service. When no URL is configured, runtime uses `${FULCRUM_HOME:-~/.fulcrum}/pglite.data`.
- **PostgreSQL server — local power, self-hosted, or SaaS.** Set `FULCRUM_DATABASE_URL` or `DATABASE_URL` to a `postgres://` or `postgresql://` connection string. CLI status, doctor, Nest/TypeORM startup, and application DB helpers select PostgreSQL without code changes.
- **Explicit PGlite socket — tests/specialized runtime only.** `FULCRUM_TYPEORM_PGLITE_SOCKET_URL` may point Nest TypeORM at a prestarted PGlite socket. Normal local startup manages that socket automatically.

Invalid non-PostgreSQL URLs fail early instead of silently falling back to PGlite.

State paths (override root w/ `FULCRUM_HOME`):

| Path                                       | Contents                                |
| ------------------------------------------ | --------------------------------------- |
| `~/.fulcrum/pglite.data`                   | Default PGlite data directory           |
| `~/.fulcrum/state/product/artifacts`       | Artifact bodies (per-file storage)      |

`fulcrum product init` creates the selected local database when needed, runs migrations, and ensures the `default` local org. `fulcrum doctor` reports selected engine, schema count, row counts, and redacts PostgreSQL credentials. `fulcrum uninstall --purge` removes local Fulcrum state.

## Schema

Migration modules under `services/platform-core/src/infrastructure/product-store/db/migrations/`:

- `0001_product_kernel.ts` — `orgs`, `projects`, `repos`, `documents`, `tasks`, `memories`, `agent_runs`, `artifacts`, `edges`, `events`. ULID text PKs, `timestamptz` everywhere.
- `0002_search.ts` — `search_documents` read model w/ generated `tsvector search_vector` column + GIN index.
- `0003_jobs.ts` — local queue w/ status CHECK constraint + claim index.

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
bun test services/platform-core/src/infrastructure/product-store/compat.test.ts
bun test services/platform-core/src/infrastructure/product-store/markdown.test.ts
bun test services/platform-core/src/infrastructure/product-store/state.test.ts
bun test services/platform-core/src/infrastructure/product-store/db/migrate.test.ts
bun test services/platform-core/src/infrastructure/product-store/events.test.ts
bun test services/platform-core/src/infrastructure/product-store/search.test.ts
bun test services/platform-core/src/infrastructure/product-store/context.test.ts
bun test services/platform-core/src/infrastructure/product-store/jobs.test.ts
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

SvelteKit 2 + shadcn-svelte web shell at `apps/web/`, backed by the same selected database path as CLI and server runtime. Surfaces all CLI domains as interactive views: `/` dashboard, `/projects`, `/docs` (Markdown editor), `/boards` (drag/drop kanban), `/runs` (filterable run list + detail w/ cancel/retry), `/search` (full-text), global cmd+K palette. Form actions return uniform `ActionResult` shape; layout `Toaster` bridge surfaces success/error toasts. Heavy queries stream via SvelteKit `streamed` loader so route headers paint while data resolves; `RouteSkeleton` placeholders fill pending branch.
