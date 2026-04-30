# 12 — Documentation and handover

Status: ready-for-agent
Risk tier: low
Dependencies: product-kernel/05..10
File ownership:
- `docs/product-kernel.md` (new)
- `README.md`
- `HANDOVER.md`

Acceptance criteria:
- `docs/product-kernel.md` documents local PGlite mode, PostgreSQL mode, `DATABASE_URL`, and state paths.
- Deterministic retrieval section: explicit no-embeddings/no-RAG/no-model rule, FTS filters, backlinks, edges, stable context assembly order.
- Failure-gate table from `.scratch/product-kernel/PRD.md` copied in once implementation confirms it.
- README.md and HANDOVER.md reference `docs/product-kernel.md`.
- `bun run ci` is green.
- `git status --short` shows only intended changes.
