# 09 — Early CLI surface (`fulcrum product …`)

Status: done
Risk tier: medium
Dependencies: product-kernel/05, product-kernel/06, product-kernel/07
File ownership:
- `src/cli/product.ts`
- `src/cli/product.test.ts`
- `src/index.ts`

Acceptance criteria:
- `fulcrum product init [--json]` initialises the local product DB, runs migrations, creates a default local org, returns parseable JSON.
- `fulcrum product projects list [--json]` returns the project list in deterministic order.
- `fulcrum product search "term" [--json]` returns FTS hits.
- `fulcrum product context assemble --task <id>` prints the assembled Markdown.
- RED CLI tests fail before dispatch wiring exists; GREEN: `bun test src/cli/product.test.ts` and `bun run src/index.ts product init --json | jq .` succeed.
- No full task/docs CRUD beyond what listed acceptance criteria require.

## Comments
- Shipped in `dc211f3 feat(product-kernel): add fulcrum product CLI surface`.
