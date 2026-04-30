# 07 — Search and context assembly

Status: done
Risk tier: medium
Dependencies: product-kernel/05, product-kernel/06
File ownership:
- `src/product-kernel/search.ts`
- `src/product-kernel/context.ts`
- `src/product-kernel/search.test.ts`
- `src/product-kernel/context.test.ts`

Acceptance criteria:
- `search(db, query, filters)` uses Postgres FTS over `search_documents.search_vector`. No embeddings, semantic expansion, or model calls.
- Results expose `kind`, `source_id`, `title`, deterministic score field, in stable order (score desc, then `updated_at desc`, then `id asc`).
- `assembleContext(db, taskId)` orders sections: task → explicit docs → explicit memory → search hits → recent decisions → artifacts.
- Two assemblies with identical inputs produce byte-identical Markdown.
- RED tests fail before implementation; GREEN: `bun test src/product-kernel/search.test.ts src/product-kernel/context.test.ts` passes.

## Comments
- Shipped in `f8bb801 feat(product-kernel): add deterministic search and context assembly`.
